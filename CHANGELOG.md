# 更新日志

本文件记录本项目的显著变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased] — 工程化与视觉攻坚中

> 2026-11-14 已部署至线上 https://game.xiaoxin.email
> 前端 index-D-g93_gX.js，后端与 shared/ai-schema.js 同步更新。
> 线上验证：iPhone 13 / 桌面双端，#intro 数量为 1、AI 实时生成生效、触摸与点击正常、0 报错。

### 修复

- **开场动画叠了两层，且第一晚被启动两次**
  - `src/game.js` 的 `start()` 里 `_beginNights()` 被调用两次（快速 AI 路径与兜底路径都命中），
    导致 `#intro` 覆盖层渲染出两个、标题文字重影，且 `_launchNight(0)` 执行两次把计时和温度清零重来。
  - 修法：删除重复调用，并给 `_beginNights()` 加幂等守卫。
  - 复现方式：Playwright 插桩统计 `_beginNights` / `_launchNight` 调用次数。
- **AI 响应超过 4.5 秒时游戏完全无法开始**
  - 原逻辑在竞速超时后把 `this.nights` 置为 `null`，而后续 `.then()` 回调只在
    `this.nights` 为真时才赋值，于是内容永远不会到达。
  - 修法：超时后先用本地内容开局，AI 到达后再替换**尚未开玩**的那一晚。
- **后端存在 2 条打不到的重复路由**（复核后修正：/health 不是死代码）
  - `/leaderboard`、`/score`（无 `/api` 前缀）经 Nginx 走静态兜底，永远打不到后端：
    前者返回静态 HTML，后者返回 405。已删除。
  - **`/health` 保留**：Nginx 有 `location = /health` 专门转发它，是线上健康检查端点。
    初版误判为死代码并删除，部署前复核发现并恢复。
- **限流表内存泄漏**
  - `rateLimit()` 的 IP 记录只增不删，长期运行后 Map 无限增长。
  - 修法：增加定时清扫，移除 60 秒无活动的 IP。

- **主入口存在 ASI 隐患**
  - `src/main.js` 中 `gameInstance` 之后紧跟 `/** @type {any} */ (window).__game = ...`，由于缺少分号，JavaScript 会把下一行解析成对上一行的**函数调用**。
  - 改为通过 `src/vite-env.d.ts` 声明 `window.__game` 的全局类型，去掉行内类型断言。
  - 同样的隐患也出现在 `src/game.js` 的 `refreshBoard?.()` 调用处，已改为在类上声明该字段。

### 变更

- **抽出前后端共用的 AI 校验模块** `shared/ai-schema.js`
  - 玩家自带 DeepSeek Key 时请求由浏览器直连，不经过本服务器。
    原先校验逻辑只存在于后端，这条路径会绕过枚举归一化、长度检查与禁用词过滤，
    模型返回非法枚举即可破坏场景。现在前后端 import 同一份校验。
  - 同时新增图标白名单：模型返回的 emoji 若不在白名单内则回退到中性符号，
    避免字体缺失时渲染成豆腐块。
- **后端日志与可观测性**：移除静默失败路径中的静默返回。
- **工程基建**：补齐 `package.json` 脚本（`test` / `lint` / `typecheck` / `verify`）、
  `.gitignore`、`.env.example`、`LICENSE`、`eslint.config.js`、`vitest.config.js`。
- **抽出纯逻辑模块** `src/game-logic.js`：连击收益、惊喜事件抽取与保底、连击里程碑、故事时间表等与 DOM / Three.js 无关的逻辑集中于此，便于单测。
- **清理 v2 重写遗留的死代码**：`src/scene.js` 中未使用的 `lerp` / `makeGradient` / `facadeTexture`，`src/game.js` 中未使用的 `COLORS`，以及 `src/main.js` 中未使用的 `PALETTES` 导入。
- **类型检查**：`tsconfig.json` 开启 `checkJs`，为所有模块补上 JSDoc 类型标注；`npm run typecheck` 现为 0 错误。

### 新增

- **绘图计划** `docs/ART_PLAN.md`
  - 明确视觉分三层（后期质感 / 几何细节 / 光照），并给出优先级判断：
    决定性的是表面质感，不是建模。
  - 列出 AI 生成笔触贴图清单（8–10 张）与提示词模板。
  - 记录 Blender headless 管线（`bpy` 4.2.17 LTS + Blender 4.5.12 LTS）及集成铁律。
- **Blender 建模管线** `tools/blender/proof_of_concept.py`
  - 端到端验证：建模 → 材质 → 导出 GLB → 离线渲染预览。
- **优化清单** `docs/OPTIMIZATION_CHECKLIST.md`
  - 按 P0–P5 优先级列出全部待办，附实测证据。
- **单元测试 54 例**（`tests/`）：覆盖 AI payload 校验与枚举归一化、禁用词过滤、图标白名单、连击收益曲线、惊喜事件抽取与保底机制、记录合并与去重。全部通过。
- **CI** `.github/workflows/ci.yml`：lint → typecheck → test → build 全套。

---

## [2.0.0] — v2 重制

### 新增

- **自研 painterly 后期**：Sobel 描边 + 暖纸底 + 水彩晕染，画面从"干净 3D 渲染"往插画靠。
- **每扇亮窗有独立室内剪影**：书桌前的人、窗台绿萝、趴着的猫、晾着的衣服、
  落地灯、书架、两个聊天的人 —— 整栋楼"住进了人"。
- **惊喜事件**：金窗 / 流星划过 / 有人放了灯 / 屋顶的猫 / 连光，附带顶部提示条。
- **真实排行榜**：昵称上榜 + 我的记录（最佳温暖 / 最高连击 / 累计点亮 / 玩过几晚）。
- **明信片导出**：Canvas 2D 绘制，PNG 下载。
- **连击音阶**：五声音阶随连击升高，连击 ≥ 8 时叠加低音反馈。
- **开场引导剧情**：打字机旁白 + 指向第一扇窗的教学教练标记。
- **「窗后的小事」**：点亮窗户时直接弹出该窗后的小事（带物品图标），不打断连击节奏。

### 修复

- **点完不显示下一关**：每晚必结算进下一晚，三晚出明信片。
- **明信片一键保存**：新增保存按钮（手机仍可长按）。
- **暂停恢复**：`Esc`（或手机返回键）可暂停并恢复，暂停文案与实际行为一致。
- **排行榜返回**：干净地回到标题页，不再重复叠层。
- **移动端性能**：像素比上限降到 1.5；页面切后台即停渲染。

---

## [1.0.0] — v1

首个可运行版本：Vite + TypeScript + Three.js，24 扇独立窗户、连击、温暖值、
故事窗、三晚流程、明信片、Fastify + SQLite 匿名排行榜。
7 项 Vitest 单元测试。

详见 [`docs/history/PROJECT_LOG.md`](docs/history/PROJECT_LOG.md)。
