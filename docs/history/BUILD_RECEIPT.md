# 构建回执

> 日期：2026-11-08  
> 项目：今晚，亮一盏灯  
> 状态：可运行 MVP 已完成，已通过构建、单元测试、桌面三晚流程、移动端触摸、Key 错误路径、明信片导出、排行榜 API 验证。

---

## 1. 已交付

### 前端

- Vite + TypeScript 工程
- Three.js 实时 3D 校园夜景
- 24 扇独立窗户
- 点击发光窗
- 连击、光链
- 温暖值、全楼亮起
- 故事窗
- 夜间突变
- 窗后剪影彩蛋
- 特别窗
- 三晚流程
- 明信片结算
- 明信片 PNG 导出
- 桌面/移动端适配
- 声音开关、暂停、退出
- 键盘可操作
- 减少动画适配

### AI

- DeepSeek Key 输入
- Key 校验
- 三晚内容生成
- JSON Schema 校验
- 禁用词过滤
- 本地 fallback
- Key 只存内存
- 不走自建服务器

### 后端

- Fastify API
- SQLite 排行榜
- 健康检查
- 昵称过滤
- 数值范围校验
- 简单限流

### 工程

- Vitest 单元测试 7 项
- 构建产物
- Vite dev/preview 代理
- Nginx 示例
- systemd 示例
- 部署文档
- 隐私说明
- 素材许可清单
- README

---

## 2. 验证证据

### 构建

```text
npm run build
✓ 21 modules transformed
dist/assets/index-*.css  ~10KB
dist/assets/index-*.js   ~591KB (gzip ~151KB)
✓ built
```

### 单元测试

```text
npm test
Test Files  1 passed
Tests       7 passed
```

覆盖：

- 每窗每晚只计一次
- 重复点击可继续得分
- 全楼亮起只触发一次
- 故事窗记录物件
- 三晚结算
- fallback schema 通过
- 禁用词拒绝
- 非法夜数拒绝

### 桌面三晚流程

```text
clicks 32
stories_opened 1
result_visible true
三晚点亮 41 扇窗
最长连击 7
收集物件：绿萝
page errors: none
failed requests: none
```

### 移动端触摸

```text
taps 16
warmth 32
page errors: none
```

### Key 错误路径

```text
invalid key -> "Key 无效，请检查后重试"
仍可切换离线模式
```

### 明信片导出

```text
postcard.png 约 425KB
1080×1440 PNG
```

### 排行榜 API

```text
GET  /api/health      200 ok
POST /api/score       200 ok
GET  /api/leaderboard 200 ok
昵称过滤与数值范围校验生效
```

---

## 3. 已知限制

1. 当前 3D 场景为程序化基础几何体，尚未接入 Blender GLB 与 CA 贴图。
2. 当前音频为 WebAudio 合成，尚未接入 CC0 环境音素材。
3. 排行榜前端只做了轻量展示，正式部署可补完整排行榜面板。
4. 明信片使用 Canvas 程序化绘制，不是 CA 原画。
5. 尚未执行真实用户可用性测试，仅有自动化与触摸验证。
6. 尚未部署到 `xiaoxin.email`。
7. 尚未接入真实 DeepSeek Key 做端到端生成验证（错误路径已验证）。

---

## 4. 下一步（按优先级）

1. CA 概念美术定调：3 张主视觉 + 宿舍楼正视图
2. Blender 低模：24 窗、楼体、树、路灯、烘焙
3. Three.js 替换 GLB + 贴图
4. CC0 环境音：雨、风、虫鸣
5. 真实用户 5 人可用性测试
6. 部署到 `xiaoxin.email`
7. 演示视频与评审速览

---

## 5. 关键文件

```text
src/app/App.ts                 页面流程、输入、状态
src/game/GameCore.ts           核心玩法与数值
src/scene/CampusScene.ts       Three.js 场景
src/ui/screens.ts              UI
src/ui/postcard.ts             明信片导出
src/ai/deepseek.ts             DeepSeek 接入
src/ai/schema.ts               JSON 校验
src/content/stories.ts         故事与文案
server/index.js                排行榜 API
tests/game.test.ts             单元测试
deploy/                        部署配置
design/                        设计与验证文档
```
