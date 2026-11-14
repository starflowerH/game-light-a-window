# 项目工作日志 / AI 交接文档

> 项目：今晚，亮一盏灯（Light A Window）  
> 本地目录：`/home/xiaoyu/bu-game-psy`  
> 线上地址：https://game.xiaoxin.email  
> 最后更新：2026-11-09 00:36 CST  
> 用途：给下一个接手 AI / 开发者快速恢复上下文，避免重复踩坑。  
> 安全：本文不包含任何 API Key 明文。

---

## 1. 项目一句话

一栋有 24 扇窗的宿舍楼，玩家点击正在发光的窗户，把整栋楼一盏盏点亮；三晚约 5 分钟，有故事窗、天气变化、明信片与匿名排行榜。

定位：**治愈系、快节奏、易上手、解压小游戏**。  
不是：心理治疗、心理干预、心理测评、心理科普平台、AI 聊天树洞。

---

## 2. 当前线上状态（已实测）

| 项目 | 状态 |
|---|---|
| 线上地址 | https://game.xiaoxin.email |
| HTTPS | 正常，Let's Encrypt，证书到 2027-02-06 |
| 首页 | HTTP 200 |
| API 健康 | `/api/health` 200 |
| AI 健康 | `/api/ai-health` 200 |
| AI 生成 | `POST /api/generate` 200，返回 3 晚 |
| 前端 Key 输入 | 已移除，页面无 `data-key-input` |
| 手机端 | 390×844 触摸实测通过 |
| 桌面端 | 1440×900 实测通过 |
| 页面 JS 报错 | 0 |
| 失败请求 | 0 |
| 控制台 error | 0 |

最近一次线上实测：

```text
desktop: ai_ok=true, ai_seconds=3.94, clicks=13, warmth=44, errors=0
mobile:  ai_ok=true, ai_seconds=3.55, clicks=20, warmth=78, errors=0
```

---

## 3. 本地工程

### 3.1 目录

```text
/home/xiaoyu/bu-game-psy
├── src/                       前端源码
│   ├── app/App.ts             页面流程、输入、状态、AI 启动
│   ├── game/                  核心玩法、数值、窗户状态
│   ├── scene/CampusScene.ts   Three.js 3D 场景与窗户投影热区
│   ├── ui/screens.ts          各页面 HTML
│   ├── ui/postcard.ts         Canvas 明信片导出
│   ├── ai/deepseek.ts         前端只调用 /api/generate
│   ├── ai/schema.ts           前端 AI payload 校验
│   ├── ai/fallback.ts         本地备用夜景
│   ├── content/stories.ts     24 条故事、明信片文案、fallback
│   ├── audio/AudioEngine.ts   WebAudio 合成音效
│   └── styles/main.css        UI 与响应式样式
├── server/index.js            Fastify + SQLite + AI 代理 + 排行榜
├── tests/game.test.ts         Vitest 7 项
├── dist/                      当前构建产物
├── deploy/                    Nginx / systemd / 部署文档
├── design/                    GDD、玩法、AI、美术、验证、资产文档
├── research/                  比赛信息、心理学与竞品研究
├── README.md
├── PRIVACY.md
├── ASSET_LICENSES.md
├── BUILD_RECEIPT.md
└── PROJECT_LOG.md             本文
```

### 3.2 技术栈

- Vite 8 + TypeScript 7
- Three.js 0.187
- Fastify 5
- Node 22 的 `node:sqlite`（服务器必须用 Node 22）
- Vitest 5
- Canvas 2D 明信片导出
- WebAudio 合成音效
- Nginx + systemd + Let's Encrypt

### 3.3 本地命令

```bash
cd /home/xiaoyu/bu-game-psy
npm run server     # API: http://127.0.0.1:3101
npm run dev        # 前端: http://127.0.0.1:5173（代理 /api 到 3101）
npm run build      # 产出 dist/
npm test           # 7 项单元测试
npm run preview    # 预览: http://127.0.0.1:4173（代理 /api 到 3101）
```

### 3.4 当前构建产物

```text
dist/index.html
dist/assets/index-_gxi74WS.css
dist/assets/index-CiET6QSg.js
```

JS 约 587KB，gzip 约 150KB；总 dist 约 604KB。

---

## 4. 服务器部署状态

### 4.1 基本信息

```text
服务器：159.75.94.149
系统：Ubuntu 24.04
Node 系统默认：v20.20.2（不支持 node:sqlite）
项目专用 Node：/opt/node22/bin/node（v22.23.3）
```

### 4.2 路径

```text
前端静态文件：/var/www/light-a-window/dist
后端源码：    /opt/light-a-window/server/index.js
后端依赖：    /opt/light-a-window/node_modules
SQLite 数据： /opt/light-a-window/data/scores.sqlite
systemd：     /etc/systemd/system/light-a-window.service
环境文件：    /etc/default/light-a-window（权限 600）
Nginx 配置：  /etc/nginx/sites-available/game.xiaoxin.email
Nginx 启用：  /etc/nginx/sites-enabled/game.xiaoxin.email
证书：        /etc/letsencrypt/live/game.xiaoxin.email/
```

### 4.3 systemd

```ini
[Unit]
Description=Light A Window API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/light-a-window
EnvironmentFile=/etc/default/light-a-window
ExecStart=/opt/node22/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

常用命令：

```bash
sudo systemctl status light-a-window
sudo systemctl restart light-a-window
sudo journalctl -u light-a-window -n 100 --no-pager
```

### 4.4 环境变量（名字，不含值）

`/etc/default/light-a-window` 当前包含：

```text
AI_BASE=https://t.xiaoxin.email/v1
AI_MODEL=deepseek-v4.1-flash
AI_KEY=[服务器上的 cbp_ Key，禁止外泄]
PORT=3101
DATA_DIR=/opt/light-a-window/data
```

注意：
- 不要 cat / 打印 / 提交 `AI_KEY`。
- 不要把它写进前端、日志、Git、文档。
- 当前线上演示使用服务端 Key；比赛评审若要求用户自带 Key，需要另加双模式。

### 4.5 Nginx 重要坑

服务器上的 Nginx **不是由 systemd 正常管理**，已有多个主进程在跑：

```text
nginx: master process nginx -g daemon off;
nginx: master process nginx
```

因此：

```bash
# 正确
sudo nginx -t
sudo nginx -s reload

# 不要用
sudo systemctl reload nginx   # 会报 nginx.service is not active
```

另外 `nginx -t` 必须用 `sudo`，否则读不到 `/etc/letsencrypt/live/...` 证书而报 Permission denied。

---

## 5. AI 架构

### 5.1 当前链路

```text
浏览器
  └── POST /api/generate
        └── Fastify 3101
              └── https://t.xiaoxin.email/v1/chat/completions
                    └── deepseek-v4.1-flash
```

### 5.2 前端

`src/ai/deepseek.ts` 只请求同源 `/api/generate`，不再直接请求 DeepSeek，也不接收用户 Key。

### 5.3 后端

`server/index.js`：

- `GET /api/ai-health`：检查 AI 是否配置
- `POST /api/generate`：调用上游，返回 3 晚 payload
- Key 只从 `process.env.AI_KEY` 读取
- 超时 30 秒
- 已做禁用词过滤、故事长度校验、枚举归一化

### 5.4 枚举归一化（重要）

DeepSeek 会自由返回：

- `cloudy`、`breezy`、`moonlit_blue`、`gray_blue`、`warm_orange`、`fast`、`warm` 等

后端现在会映射到合法值，并对未知值使用安全默认：

```text
weather 默认 clear
tempo   默认 normal
palette 默认 warm_blue
```

因此不要恢复“遇到未知枚举就整组 fallback”的旧逻辑，否则会频繁 502。

### 5.5 上游返回问题

已确认 `t.xiaoxin.email`：

- `cbp_` Key 必须走 https://t.xiaoxin.email/v1
- 不能直连 127.0.0.1:4000（LiteLLM 只接受 sk- 虚拟 Key）
- `deepseek-v4.1-flash` 可用
- `deepseek-v4-flash` 也可用

---

## 6. 核心玩法实现状态

已实现：

- 24 扇独立窗户
- 点击发光窗
- 连击 / 光链
- 温暖值与全楼亮起
- 故事窗
- 夜间天气突变
- 窗后剪影彩蛋
- 特别窗（低概率）
- 三晚流程
- 单晚结算
- 最终明信片
- 明信片 PNG 导出
- 匿名排行榜 API
- 声音开关、暂停、退出
- 移动端触摸
- 减少动画 CSS 适配
- 键盘可操作

### 6.1 关键数值

```text
单晚：75 秒
点击：+2 温暖
连击 3–4：+3
连击 5–7：+4
连击 8+：+5
故事窗：+6
全楼亮起阈值：100
每扇窗每晚只计一次 lit
```

### 6.2 故事窗

- 时间触发：第 1 晚 35s；第 2 晚 30/55s；第 3 晚 25/50s
- 另有兜底：已点亮 10 扇且连击 <5 时补触发
- 可选浮层，不暂停夜晚
- 25 秒不点击自动恢复

### 6.3 移动端

- 竖屏相机：FOV 50，相机 z=20，y=4.7
- 热区按 Three.js 窗户世界坐标投影到屏幕
- 触摸实测 20 次点击成功
- HUD 在手机端压缩，底部 footer 隐藏

---

## 7. 当前已知问题 / 技术债

按优先级：

1. **视觉仍是程序化基础几何体**
   - 没有 Blender GLB、CA 贴图、烘焙 Lightmap
   - `design/09_3D_CA_ART_PIPELINE.md` 已写好管线，尚未执行
2. **音频仍是 WebAudio 合成**
   - 未接入 CC0 雨声/风声/环境音
3. **`screens.ts` 里保留未使用的 `keyScreen()`**
   - 当前流程已不用，建议删除或保留作比赛“用户自带 Key”模式
4. **`App.ts` 里可能还有未使用的 `fast` / `raf` / `activeStoryIndex` / `lastCombo`**
   - 建议下一轮清理，不影响运行
5. **排行榜前端只是 toast 摘要**
   - 没有完整排行榜面板
6. **无真实 DeepSeek Key 端到端生成验证**
   - 当前服务端 Key 已验证可用；比赛用户 Key 模式未恢复
7. **无 Git 仓库**
   - 目录不是 git repo，改大功能前先备份
8. **AI 服务依赖服务器 Key**
   - 有额度与滥用风险，建议加上每日限额 / 简单鉴权 / 缓存

---

## 8. 比赛要求与当前实现差异

比赛要求（上一届通知）：

- 启动时要求用户输入有效 DeepSeek API Key
- Key 不得收集、上传、存储或他用
- 项目说明中写明 API 使用方式、验证方式、隐私处理

当前线上实现：

- 使用服务器统一 Key，用户无需输入
- 适合演示，但不符合“用户自带 Key”的比赛要求

建议最终提交版本保留两种模式：

1. **线上演示模式**：服务端 Key，任何人可玩
2. **比赛评审模式**：用户输入自己的 Key，Key 只存内存

---

## 9. 部署 / 更新流程

### 9.1 更新前端

```bash
cd /home/xiaoyu/bu-game-psy
npm run build
tar -czf /tmp/light-a-window-dist.tgz -C dist .
scp /tmp/light-a-window-dist.tgz xiaoyuyu@159.75.94.149:/tmp/
ssh xiaoyuyu@159.75.94.149 '
  sudo rm -rf /var/www/light-a-window/dist &&
  sudo mkdir -p /var/www/light-a-window/dist &&
  sudo tar -xzf /tmp/light-a-window-dist.tgz -C /var/www/light-a-window/dist &&
  sudo chown -R www-data:www-data /var/www/light-a-window/dist
'
```

### 9.2 更新后端

```bash
cd /home/xiaoyu/bu-game-psy
scp server/index.js xiaoyuyu@159.75.94.149:/tmp/index.js.new
ssh xiaoyuyu@159.75.94.149 '
  sudo cp /tmp/index.js.new /opt/light-a-window/server/index.js &&
  sudo chown ubuntu:netdev /opt/light-a-window/server/index.js &&
  sudo systemctl restart light-a-window
'
```

### 9.3 更新后验证

```bash
curl -sS https://game.xiaoxin.email/api/health
curl -sS https://game.xiaoxin.email/api/ai-health
curl -sS -X POST https://game.xiaoxin.email/api/generate -o /tmp/gen.json -w '%{http_code}\n'
python3 -c "import json; o=json.load(open('/tmp/gen.json')); print(o.get('ok'), len((o.get('payload') or {}).get('nights') or []))"
```

### 9.4 证书

已验证：

```text
game.xiaoxin.email
Let's Encrypt
Expiry: 2027-02-06
```

续签检查：

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 10. 验证证据

### 10.1 本地构建

```text
npm run build
✓ 21 modules transformed
dist/assets/index-*.css ~10KB
dist/assets/index-*.js ~587KB (gzip ~150KB)
✓ built
```

### 10.2 单元测试

```text
npm test
Test Files  1 passed
Tests       7 passed
```

覆盖：

- 每窗每晚只计一次
- 重复点击可持续得分
- 全楼亮起只触发一次
- 故事窗记录物件
- 三晚结算
- fallback schema 通过
- 禁用词拒绝
- 非法夜数拒绝

### 10.3 线上验证

```text
https://game.xiaoxin.email/                 200
/api/health                                 200
/api/ai-health                              200
/api/generate                               200, 3 nights
desktop AI                                  3.94s
mobile AI                                   3.55s
mobile touch clicks                         20
page errors                                 0
failed requests                             0
console errors                              0
```

截图目录：

```text
artifacts/online/
artifacts/final/
artifacts/screens/
```

---

## 11. 下一个 AI 接手时先做什么

1. 读本文 `PROJECT_LOG.md`
2. 读 `README.md`
3. 读 `design/README.md`
4. 读 `design/00_PRODUCT_DESIGN.md`
5. 读 `design/01_GAMEPLAY_SYSTEMS.md`
6. 读 `design/09_3D_CA_ART_PIPELINE.md`
7. 检查线上：
   ```bash
   curl -sS https://game.xiaoxin.email/api/health
   curl -sS https://game.xiaoxin.email/api/ai-health
   ```
8. 检查服务器：
   ```bash
   ssh xiaoyuyu@159.75.94.149
   systemctl status light-a-window
   sudo nginx -t
   ```
9. 不要直接改服务器上的文件；先改本地，再构建、测试、上传。
10. 不要打印或提交 `/etc/default/light-a-window` 里的 `AI_KEY`。

---

## 12. 推荐下一步

按收益排序：

1. **删除未使用 Key 页面代码 / 恢复双模式**
   - 线上演示：服务端 Key
   - 比赛评审：用户自带 Key
2. **补完整排行榜面板**
3. **Blender / CA 美术替换**
   - 24 窗 GLB
   - 烘焙 Lightmap
   - CA 明信片
4. **CC0 环境音**
5. **真实用户 5 人可用性测试**
6. **补项目说明、演示视频、评审速览**

---

## 13. 给用户/评审的一句话介绍

> 今晚，亮一盏灯，是一款快节奏治愈系解压小游戏。点击一栋宿舍楼里发光的窗户，把灯一盏盏点亮。没有失败，也没有扣分，三晚大约五分钟，最后会得到一张今晚的明信片。

---

## 14. 变更记录

### 2026-11-08 ~ 2026-11-09

- 完成比赛信息、竞品、心理学与内容研究
- 完成产品设计、玩法数值、AI 规范、美术规范、技术方案
- 完成 Vite + TypeScript + Three.js 工程
- 完成 24 窗点击、连击、故事窗、天气突变、三晚流程
- 完成明信片 Canvas 导出
- 完成 Fastify + SQLite 排行榜
- 完成 7 项单元测试
- 修复：移动端相机/热区、AI 枚举、外部字体、故事窗、全楼亮起、重复计数
- 上线 https://game.xiaoxin.email
- 接入服务器 Key + t.xiaoxin.email 反代
- 签发 game.xiaoxin.email HTTPS 证书
- 线上桌面/手机验证通过

---

## 15. 服务器同步位置

本文同步到：

```text
/opt/light-a-window/PROJECT_LOG.md
/opt/light-a-window/WORK_LOG.md   （同一份工作日志）
```

更新时间以本地文件为准。
