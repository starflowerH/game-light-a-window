# 技术架构设计

> 目标：轻量、稳定、好看、可部署到 4 核 4G 服务器  
> 前端：Vite + TypeScript + Three.js（2.5D）+ CSS  
> 后端：Node.js + Fastify + SQLite  
> AI：DeepSeek 浏览器直连，用户自带 Key  
> 部署：Nginx + systemd + HTTPS

---

## 1. 架构总览

```text
浏览器
├── Vite 静态前端
│   ├── Three.js 2.5D 场景
│   ├── DOM/CSS UI
│   ├── WebAudio
│   └── DeepSeek 直连
└── 轻 API
    ├── 排行榜
    ├── 匿名统计
    └── 健康检查

Nginx
├── / → 静态文件
└── /api/ → Node.js

SQLite
└── scores.sqlite
```

---

## 2. 前端结构

```text
src/
  main.ts
  app/
    App.ts
    routes.ts
  game/
    GameState.ts
    NightLoop.ts
    WindowGrid.ts
    ComboSystem.ts
    WarmthSystem.ts
    StorySystem.ts
    WeatherSystem.ts
  scene/
    CampusScene.ts
    WindowMesh.ts
    ParticleLayer.ts
    RainLayer.ts
    FogLayer.ts
    LightChain.ts
  ui/
    Hud.ts
    KeyGate.ts
    StoryModal.ts
    Postcard.ts
    Leaderboard.ts
    Settings.ts
  audio/
    AudioEngine.ts
    Sfx.ts
    Ambience.ts
  ai/
    deepseek.ts
    schema.ts
    prompt.ts
    fallback.ts
    validate.ts
  content/
    fallbackNights.ts
    storyLibrary.ts
    postcardLines.ts
  styles/
    tokens.css
    main.css
  utils/
    random.ts
    storage.ts
    time.ts
```

---

## 3. 渲染方案

### 3.1 为什么用 Three.js 而不是纯 Canvas

- 需要层次感、光晕、雨雾、透视
- Three.js 可以低成本做 2.5D
- 支持后处理（泛光、雾）
- 后续可替换为 GLB 资产
- 比全 3D 建模轻

### 3.2 2.5D 实现

- 宿舍楼：分层平面 + 少量几何体
- 窗户：独立平面 mesh
- 光晕：Sprite / Shader
- 雨：InstancedMesh 线条
- 雾：半透明平面 + 距离雾
- 树：手绘 PNG 分层
- 相机：固定视角，轻微视差

### 3.3 性能预算

| 项目 | 预算 |
|---|---|
| 首屏 JS | < 800KB gzip |
| 3D 资源 | < 6MB |
| 音频 | < 4MB |
| 总包 | < 12MB |
| 首屏时间 | < 3s（校园网） |
| 帧率 | 60fps 桌面 / 30fps 移动 |
| draw calls | < 80 |

---

## 4. 状态管理

### 4.1 全局状态

```ts
type GameState = {
  phase: 'key' | 'loading' | 'playing' | 'story' | 'result' | 'error'
  nightIndex: 0 | 1 | 2
  warmth: number
  combo: number
  maxCombo: number
  litWindows: Set<string>
  storyWindows: Set<string>
  collectedItems: string[]
  nights: NightConfig[]
  weather: Weather
  audioEnabled: boolean
  reducedMotion: boolean
}
```

### 4.2 状态机

```text
key → loading → playing ⇄ story → result → playing
                                  ↓
                                error
```

### 4.3 持久化

- 只保存非敏感进度：
  - 最佳连击
  - 最佳温暖值
  - 已解锁明信片
- 不保存：
  - DeepSeek Key
  - 用户输入
  - 任何隐私

---

## 5. AI 模块

### 5.1 请求

- 浏览器直连 DeepSeek
- `credentials: omit`
- 不经过自建后端

### 5.2 超时

- Key 校验：10s
- 内容生成：20s
- 超时后 fallback

### 5.3 重试

- 仅重试一次
- 指数退避 800ms
- 不无限重试

### 5.4 日志

- 不打印 Key
- 不打印完整请求头
- 错误只记录类型和状态码

---

## 6. 后端设计

### 6.1 技术

- Node.js 20+
- Fastify
- SQLite（better-sqlite3）
- systemd
- 端口 3101（示例）

### 6.2 API

```http
GET  /api/health
GET  /api/leaderboard?limit=20
POST /api/score
```

### 6.3 数据表

```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  lit_windows INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  total_warmth INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

### 6.4 防滥用

- 每 IP 每分钟 20 次
- 昵称长度 1–8
- 敏感词过滤
- 不存 IP 明文
- 不存 User-Agent

### 6.5 不做什么

- 不做账号系统
- 不做 Key 代理
- 不做用户画像
- 不做心理数据

---

## 7. 部署

### 7.1 Nginx

```nginx
server {
  listen 80;
  server_name game.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name game.example.com;

  root /var/www/light-a-window/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3101/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 7.2 systemd

```ini
[Unit]
Description=Light A Window API
After=network.target

[Service]
WorkingDirectory=/opt/light-a-window/server
ExecStart=/usr/bin/node dist/server.js
Restart=always
Environment=PORT=3101
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 7.3 资源

- 前端静态：很少内存
- Node：约 50–100MB
- SQLite：极小
- 适合 4 核 4G 服务器

---

## 8. 测试

### 8.1 单元测试

- 连击逻辑
- 温暖值计算
- 窗户状态机
- AI JSON 校验
- fallback

### 8.2 E2E

- 打开页面
- 输入 Key（mock）
- 开始游戏
- 点亮 10 扇窗
- 触发故事窗
- 完成三晚
- 生成明信片
- 排行榜提交（mock）

### 8.3 性能

- Lighthouse
- 首屏 < 3s
- 内存 < 200MB
- 无控制台错误
- 移动端不崩

---

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| WebGL 不可用 | 显示 2D 降级版 |
| 音频被阻止 | 首次点击后恢复 |
| AI 失败 | fallback |
| 后端不可用 | 游戏可玩，排行榜隐藏 |
| 资源加载失败 | 占位图 + 重试 |
| 网络断开 | 本地继续 |
| 刷新 | 恢复本地进度（不含 Key） |

---

## 10. 工程加分项

- README
- 项目说明
- 隐私说明
- 素材清单
- 演示视频
- 1 页评审速览
- 自动化测试
- 健康检查
- 错误边界
- 移动端适配
- 无控制台错误
