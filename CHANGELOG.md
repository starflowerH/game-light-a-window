# 更新日志

本文件记录本项目的显著变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---


## [3.0.0] — 2026-11-14 · 商业化重制

> 从「能点亮的原型」重制为「可上架的完整体验」。
> 架构契约见 `docs/v3_plan/`（七卷规格书）。

### 新增

- **5 态窗格系统**：沉睡 / 微光 / 常亮 / 叙事信标 / 跨窗共鸣。
  修复 v2「后台定时器自动点亮整栋楼」的挂机通关缺陷；玩家点亮的窗现在必定触发故事与反馈。
- **一笔画光链**：按住拖拽点亮沿途窗户，第 k 扇收益 `gainForCombo(combo) + 2×min(k,5)`，
  一划三扇触发「一笔连光」、竖琴刮奏与额外免费窗。
- **跨窗星轨共鸣**：成对出现的共鸣窗之间架起星桥，拖过去双窗同亮并额外唤醒一扇。
- **每晚 3 项火漆手账委托** + 朱砂盖章动效 + 金叶章。
- **17 号楼群像**：6 位常驻住户 × 3 晚分支剧本（每人 1 + 2×2 个决策节点）。
- **6 大结局**：万家灯火 / 留一盏夜灯 / 屋顶的银河 IF / 晚风大合唱 IF / 破晓 / 未完的草稿。
- **4-Agent AI 管线**：NightDirector、ResidentPersona、ResonanceWeaver（第 45 秒局中演进）、
  ChronicleCurator（终局手写回信）。
- **双模 AI**：服务端代理 + 浏览器内存 Key 直连 DeepSeek，两条路径共用同一份 Prompt 与校验。
- **SQLite WAL 六表持久化**：玩家通行证（含 6 位找回码）、对局历史、跨玩家窗户留声、
  全服窗户热力图、AI 语义缓存、遥测日志。旧 `scores` 表自动迁移。
- **流式留声机**：把一句话封进任意一扇窗，后续玩家点亮时可见并可点亮共鸣星。
- **油画后期管线**：4-Sector Kuwahara、双尺度手绘墨线、Impasto 画布受光、屏幕空间雨滴、破晓调色。
- **3 层视差窗盒**：玻璃 / 室内剪影 / 暖色背板三层反向位移。
- **零 GC 粒子池**：单 `Points` 1024 容量环形缓冲，替代 v2 每次点击新建 `BufferGeometry`。
- **四层自适应 WebAudio**：天气底噪、随点亮数渐入的七和弦 Pad、五声音阶连击、
  6 位住户专属拟音。
- **毛玻璃 UI**：全部图标改为内联 SVG，彻底移除 emoji 豆腐块；进度条改 `transform: scaleX()`；
  HUD 脏值比对，不再每帧写 DOM。
- **`hynu.site` 部署套件**：一键发布 / 备份 / 健康检查 / 自动回滚，永不触碰 `data/`。

### 变更

- `gainForCombo` 阶梯从 2/3/4/5 提升为 **3/4/6/8**（配合拖拽连亮）。
- `STORY_SCHEDULE` 从每晚 1~2 次调整为 **2~3 次**叙事信标。
- `tsconfig.json` 开启 `checkJs: true`，全部 `.js` 源码通过类型检查。
- `vitest.config.js` 提高单测超时，容纳 Fastify 冷启动。

### 修复

- 挂机 30 秒整栋楼自动全亮（v2 P0）。
- 点击已发光窗户提前 `return`，跳过惊喜与故事逻辑。
- 第 24 扇窗点亮时不在主路径检查全亮，导致全楼奖励丢触发。
- 后端未开 `trustProxy`，Nginx 反代后全站共用一个限流桶。
- AI 异步返回时直接改写模块常量，覆盖正在游玩的夜晚。
- 服务端限流 Map 无界增长。

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
