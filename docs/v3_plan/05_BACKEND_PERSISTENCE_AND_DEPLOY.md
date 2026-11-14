# 05 · 4核4G 服务端全量持久化架构（SQLite WAL）、跨玩家异步共鸣与 `hynu.site` 部署方案

> **关联模块**：`server/db.js`、`server/index.js`、`src/records.js`、`deploy/deploy.sh`、`deploy/nginx-hynu.conf`  
> **设计目标**：充分利用 **4核4G 服务器（`hynu.site`）** 的算力与磁盘能力，将原本只存 5 个字段的简陋排行榜升级为**「全量玩家档案云同步 + 跨玩家窗户记忆留声机（Async Window Whispers）+ 全服 17 号楼实时微光热力图 + AI 语义缓存」**的高可靠后端系统。

---

## 一、 为什么要用好 4核4G 服务器的持久化能力？

用户明确指出：*「记录内容是可以做持久化的不一定要销毁，我们有4核4g的服务器作为支撑」*。
在 v2 中，玩家的结局、收集品只存在浏览器 `localStorage`，换个设备或清理缓存就全丢了；而且玩家之间除了冷冰冰的分数排名，没有任何温暖的情感连接。

在 v3.0 中，我们基于 Node 22 原生 `node:sqlite`（开启 **WAL 高并发读写模式**），构建 **6 张核心持久化表**，实现：
1. **守夜人云端档案（Cloud Pass）**：自动签发匿名 `player_uid` 并生成 6 位易记「守夜人找回码（如 `LAW-7F3A`）」，跨设备永久保存解锁的 6 大结局树、6 位住户好感羁绊、收集的全套信物徽章与历史明信片。
2. **跨玩家异步共鸣 ——「流光留声机（Window Whispers）」**：
   - 每位玩家在三晚结束时，可以把一句经过安全清洗的温暖短句（可从 AI 为你提炼的 3 句今夜感悟中选一，或微调）**「封存进 17 号楼的某一扇窗（如 304 室）」**，永久存入服务端 `window_memories` 表。
   - 当后续其他玩家在夜晚点亮 304 室时，除了触发住户故事，还会在窗角收到一枚**「来自远方守夜人的留声微光」**（显示：*「3小时前 · 守夜人[今晚的橘猫] 留在 304 窗台：今晚的雨很轻，祝你也做个好梦。」*），玩家可为其点亮一颗「共鸣星（`likes += 1`）」！
3. **全服实时「17号楼共亮热力图（Global Dorm Heatmap）」**：
   - 服务端实时汇总全服所有玩家累计点亮的窗户总数（如：`全服守夜人已累计点亮 12,480 扇窗`），并统计 24 扇窗各自被点亮与留声的热度。
   - 玩家打开标题页时，背景 3D 宿舍楼里闪烁的微光直接反映全服真实热度最高的窗户！

---

## 二、 SQLite 数据库 Schema 设计（`server/db.js`）

### 2.1 数据库连接与 4核4G 性能调优参数
初始化 `DatabaseSync(join(dataDir, 'light_v3.sqlite'))` 时，必须立即执行以下 PRAGMA 调优，充分发挥 4核4G 内存优势：
```sql
PRAGMA journal_mode = WAL;          -- 开启预写日志，读写并发不互锁
PRAGMA synchronous = NORMAL;        -- 兼顾安全性与高吞吐写入
PRAGMA cache_size = -64000;         -- 分配 64MB 页缓存（4G 内存绰绰有余）
PRAGMA temp_store = MEMORY;         -- 临时表与索引走内存
PRAGMA foreign_keys = ON;
```

### 2.2 六张核心表 DDL（自动建表与平滑迁移）

```sql
-- 1. 守夜人玩家主档案表（持久化结局树、收集物、住户羁绊）
CREATE TABLE IF NOT EXISTS players (
  uid TEXT PRIMARY KEY,                       -- 客户端生成的 UUIDv4 或服务端签发 ID
  pass_code TEXT UNIQUE NOT NULL,             -- 6位找回码，如 "7F3A9C"，支持跨设备恢复
  nickname TEXT NOT NULL DEFAULT '今晚的某某',
  plays INTEGER NOT NULL DEFAULT 0,
  best_warmth INTEGER NOT NULL DEFAULT 0,
  best_combo INTEGER NOT NULL DEFAULT 0,
  total_windows INTEGER NOT NULL DEFAULT 0,
  total_resonances INTEGER NOT NULL DEFAULT 0,
  unlocked_endings_json TEXT NOT NULL DEFAULT '[]', -- 已解锁结局 ID 数组
  unlocked_items_json TEXT NOT NULL DEFAULT '[]',   -- 已收集信物数组
  resident_bonds_json TEXT NOT NULL DEFAULT '{}',   -- 6大住户解锁状态 {"102":2,"304":3}
  titles_json TEXT NOT NULL DEFAULT '["夜巡新人"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. 对局历史与排行榜表（兼容旧 scores 表并扩展多结局与徽章字段）
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uid TEXT NOT NULL,
  nickname TEXT NOT NULL,
  ending_id TEXT NOT NULL DEFAULT 'ENDING_A_WARMTH',
  archetype TEXT NOT NULL DEFAULT '温暖点灯人',
  lit_windows INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  total_warmth INTEGER NOT NULL,
  resonances INTEGER NOT NULL DEFAULT 0,
  stamps INTEGER NOT NULL DEFAULT 0,
  nights_summary_json TEXT NOT NULL DEFAULT '[]',   -- 三晚天气、抉择与故事快照
  letter_json TEXT NOT NULL DEFAULT '{}',           -- 当局收到的住户回信快照
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_leaderboard ON runs(total_warmth DESC, max_combo DESC);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

-- 3. 跨玩家「流光留声机」窗户记忆表
CREATE TABLE IF NOT EXISTS window_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,                   -- 房号：101..106, 201..206, 301..306, 401..406
  player_uid TEXT NOT NULL,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,                      -- 经安全护栏清洗后的微光寄语 (8~40字)
  mood_token TEXT NOT NULL DEFAULT 'lamp',
  resonances INTEGER NOT NULL DEFAULT 1,      -- 被其他玩家点亮共鸣的次数
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_room ON window_memories(room_id, created_at DESC);

-- 4. 全服 17 号楼每扇窗实时热度统计表
CREATE TABLE IF NOT EXISTS window_heat (
  room_id INTEGER PRIMARY KEY,                -- 24 扇窗的 room_id
  lit_total INTEGER NOT NULL DEFAULT 0,       -- 全服累计点亮次数
  whisper_count INTEGER NOT NULL DEFAULT 0,   -- 封存留声数量
  updated_at TEXT NOT NULL
);

-- 5. AI 智能体响应缓存表（防刷防抖、节省 Token 额度、加速响应）
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,                 -- hash(agent_type + mood_token + telemetry_bucket)
  agent_type TEXT NOT NULL,                   -- 'plan' | 'evolve' | 'epilogue'
  payload_json TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL                 -- Unix 毫秒时间戳，支持 TTL 淘汰与随机池复用
);
CREATE INDEX IF NOT EXISTS idx_ai_cache_type ON ai_cache(agent_type, created_at DESC);

-- 6. 遥测与前端异常日志表（工程可观测性加分项）
CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,                   -- 'run_start' | 'ending_unlock' | 'client_error'
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

> **向后兼容迁移**：启动时自动检查旧版 `scores` 表是否存在；若存在且 `runs` 表为空，自动执行 `INSERT INTO runs (...) SELECT ... FROM scores` 将历史排行榜数据无损迁移至 `runs` 表！

---

## 三、 后端 API 路由契约与安全限流重构（`server/index.js`）

### 3.1 修复 P0-3：开启 `trustProxy: true` 与分级令牌桶限流
1. **初始化 Fastify**：
   ```js
   const app = Fastify({
     logger: process.env.NODE_ENV !== 'test',
     trustProxy: true, // 关键修复：识别 Nginx 传来的 X-Forwarded-For / X-Real-IP
     bodyLimit: 65536
   })
   ```
2. **分级限流器（Separate Rate Limit Buckets）**：
   - 将 AI 接口与普通数据读写接口的限流桶彻底分离：
     - **AI 生成桶（`aiLimiter`）**：每个真实 IP 每分钟最多 `12` 次请求；且当上游触发限流或耗时过长时，自动从 `ai_cache` 表中随机抽取同 `mood_token` 的高分缓存响应返回，确保前端拿到 100% 真实 AI 生成内容且零报错！
     - **档案与榜单读写桶（`apiLimiter`）**：每个真实 IP 每分钟最多 `60` 次请求。

### 3.2 完整 API 端点清单

| 方法与路径 | 功能说明 | 请求参数 / Body | 响应结构 |
|---|---|---|---|
| `GET /api/health` | 深度健康检查（验证 SQLite 读写、全服统计与 AI 配置状态） | 无 | `{ ok: true, service: 'light-a-window', version: '3.0.0', dbOk: true, aiConfigured: true, globalLitWindows: 12480 }` |
| `GET /api/ai-health` | AI 上游状态检查（兼容旧巡检脚本） | 无 | `{ ok: Boolean(AI_KEY), model: AI_MODEL, base: AI_BASE, cachedPlans: 24 }` |
| `GET /api/bootstrap` | 首屏初始化：获取或恢复玩家云端档案 + 全服 24 窗热力图 + 最新 12 条窗户留声 | Query: `?uid=xxx&passCode=xxx` | `{ ok: true, player: {...}, globalStats: { totalRuns, totalLit, windowHeat: [...] }, whispers: [...] }` |
| `POST /api/agent/plan` | **Agent 1 & 2**：生成三晚导演参数、微委托与初见故事 | `{ uid, moodToken, unlockedEndings }` | `{ ok: true, source: 'ai' \| 'cache', payload: { directorNote, nights: [...] } }` |
| `POST /api/agent/evolve` | **Agent 3**：第 1 晚第 45s 动态演进第 2、3 晚住户剧情 | `{ uid, moodToken, night1Telemetry }` | `{ ok: true, payload: { nights: [night2, night3] } }` |
| `POST /api/agent/epilogue` | **Agent 4**：终局生成住户手写回信与留声寄语 | `{ uid, endingId, bondRoomId, ... }` | `{ ok: true, payload: { archetype, letter, whisperSuggestion } }` |
| `POST /api/generate` | **向后兼容接口**：内部直接转发至 `Agent 1 & 2` 逻辑 | `{ seed, moodToken }` | `{ ok: true, payload: { nights: [...] } }` |
| `POST /api/score` | **结算与云端档案同步**（兼容旧版字段，同时写入 `runs`、`players` 与 `window_heat`） | `{ uid, nickname, endingId, archetype, litWindows, maxCombo, totalWarmth, resonances, stamps, items, unlockedEndings, residentBonds, litRoomIds }` | `{ ok: true, rank: 4, player: {...} }` |
| `GET /api/leaderboard` | 排行榜查询（支持 `scope=tonight` 今日榜 与 `scope=all` 殿堂总榜） | `?limit=20&scope=all` | `{ ok: true, items: [...], totalPlayers: 128 }` |
| `POST /api/whispers` | 将一句微光寄语封存进指定房号窗户 | `{ uid, nickname, roomId, content, moodToken }` | `{ ok: true, whisper: {...} }` |
| `POST /api/whispers/:id/like` | 为偶遇的他人的窗户留声点亮一颗共鸣星 | `{ uid }` | `{ ok: true, resonances: 15 }` |

---

## 四、 远端服务器 `hynu.site` 生产部署规范

### 4.1 统一服务器目录规范（消除旧日志中双目录混乱）
- **域名**：`https://hynu.site`
- **前端静态产物目录**：`/var/www/light-a-window/dist`
- **后端服务运行目录**：`/opt/light-a-window`（包含 `server/`、`shared/`、`package.json`、`node_modules/`）
- **持久化数据库目录**：`/opt/light-a-window/data/light_v3.sqlite`（**部署脚本严禁删除或覆盖 `data/` 目录！**）
- **环境变量配置文件**：`/etc/default/light-a-window`（权限 `600`，含 `AI_BASE`、`AI_MODEL`、`AI_KEY`、`PORT=3101`、`DATA_DIR=/opt/light-a-window/data`）

### 4.2 Nginx 配置文件（`deploy/nginx-hynu.conf`）
```nginx
server {
    listen 80;
    server_name hynu.site www.hynu.site;
    return 301 https://hynu.site$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hynu.site www.hynu.site;

    # SSL 证书路径（按服务器实际 Let's Encrypt 路径配置）
    ssl_certificate     /etc/letsencrypt/live/hynu.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hynu.site/privkey.pem;

    root /var/www/light-a-window/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3101/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 35s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 4.3 自动化部署与一键回滚脚本（`deploy/deploy.sh`）
编写完整的 `deploy/deploy.sh`，支持：
- `./deploy/deploy.sh [user@hynu.site]`：
  1. 本地执行 `npm run verify`（lint + typecheck + test + build 全套通过才允许打包）；
  2. 打包 `dist/` 与 `server/ + shared/ + package.json`；
  3. 在远端服务器自动备份当前版本至 `/var/www/light-a-window/dist.bak-$(date +%s)` 与 `/opt/light-a-window/backup/`；
  4. 原子替换前端静态文件与后端源码（保留 `/opt/light-a-window/data` 数据库不动），重启 `light-a-window.service`；
  5. 自动请求 `/api/health` 与 `/api/bootstrap` 验证 HTTP 200；若失败则自动触发回滚（`--rollback`）！
