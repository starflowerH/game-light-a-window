# 今晚，亮一盏灯 · Light A Window v4.0

> 星露谷 3D 写意校园物语 · 四栋真实 Blender 建模宿舍楼 · 四季晴雨雾雪 · 五大并列小游戏。
> 记忆顺序点灯、全景快照回忆、查寝夜猫子、GF(2) 熄灯解谜、以及经典三晚六结局连光物语。

**架构契约**：`docs/v4_plan/`（v4.0 全套策划与渲染方案） & `docs/v3_plan/`

---

## v4.0 做了什么（Stardew 3D 校园夜巡升级）

在 v3.0 治愈系连光内核之上，v4.0 全面引入 Blender 3D 建筑群、星露谷像素-油画混成材质与多玩法闯关体系：

- **4 栋真实 Blender GLB 宿舍楼 + 公共校园底盘**：员工宿舍桂花院（3×4=12窗）、高中晨光楼（3×6=18窗）、大学 17 号楼（4×6=24窗）、研究生研思楼（5×6=30窗）与 `campus_grounds.glb`，支持 3D 航拍切楼漫游与 4 档视角（`正面全景` / `星露谷45°` / `林荫仰望` / `天台巡礼`）+ 有界 `OrbitControls` 拖拽旋转。
- **像素-油画混成 PBR 与真天气系统**：Procedural 128×128 像素法线砖瓦/屋瓦/石板路贴图、Kuwahara 半径微调（`0.95`）保留清晰细节；移除旧版用雪粒冒充雾天的逻辑，重做 **8 层 Perlin FBM 体积飘雾 + 路灯散射光晕**、细雨路面涟漪波纹与落雪屋檐窗台覆雪。
- **5 大并列宿舍玩法矩阵 + 8 项随机事件**：
  1. `memory_sequence`：窗户依次亮起并熄灭，考验顺序与准确率；
  2. `memory_snapshot`：多窗同时闪亮后全灭，考验瞬时空间记忆；
  3. `patrol_reflex`：限时查寝，熄灭熬夜蓝屏、守护暖台灯、点亮晚归门灯；
  4. `lights_out_puzzle`：跨邻熄灯棋盘，附带基于 GF(2) 高斯消元的「林阿姨提示」求解器；
  5. `star_sweep`：保留完整 v3 三晚六住户一笔画治愈物语与六大结局。
- **开场航拍与天气换装 NPC**：宿管林阿姨、夜巡周副校长等 8 位人物随实时天气/季节动态换装（雨衣撑伞、羽绒毛帽、防风衣手电、毛衣围巾、常服），值班室门口实时 3D 立牌互动。
- **增强型 AI 导演与个人排名榜**：开场/切楼对话导演（`DialogueDirector`）、AI 几何关卡构图（`PuzzleArchitect`）、巡查点评官（`InspectorCommentator`）；空白自动赋予校园趣味随机昵称，排行榜支持按玩法 × 宿舍楼筛选并置顶展示「我的当前排名 · 百分比 · 与前一名分差」。

---

## v3.0 做了什么

v2.1 能跑通点击，但玩法是空心的：后台定时器会把整栋楼自动点亮（挂机即通关），
玩家点亮的窗也不会触发任何故事；AI 只在开局请求一次，局内行为对后续毫无影响；
渲染只有一层很弱的 Sobel 描边。

v3.0 是一次结构性重制：

| 维度 | v2.1 | v3.0 |
|---|---|---|
| 窗户状态 | 亮 / 不亮 | **5 态**：沉睡 / 微光 / 常亮 / 叙事信标 / 跨窗共鸣 |
| 操作 | 单击 | 单击 + **一笔画光链** + **跨窗星轨共鸣** |
| 目标 | 无 | 每晚 **3 项火漆手账委托** |
| 叙事 | 无主线、单结局 | **6 位住户 × 3 晚分支**，**6 大结局**（含 2 条隐藏 IF 线） |
| AI | 1 次静态请求 | **4-Agent 管线**：导演 / 群像 / 局中共鸣编织 / 终局回信 |
| 持久化 | 一张分数表 | **SQLite WAL 六表**：通行证、对局、窗户留声、全服热力图、AI 缓存、遥测 |
| 渲染 | 亮度 Sobel | **4-Sector Kuwahara** 油画滤波 + 彩色墨线 + Impasto 画布受光 + 雨滴折射 |
| 交互 | 每次点击新建 Geometry | **1024 容量零 GC 环形粒子池** + Catmull-Rom 拖拽尾翼 + 二阶弹簧视差 |
| 部署 | 单域名硬编码脚本 | `hynu.site` 一键部署 + 自动备份 + 健康检查 + 一键回滚 |

---

## 快速开始

```bash
npm ci
npm run dev        # 前端 http://localhost:5173（已代理 /api 到 3101）
npm run server     # 另开一个终端跑 Fastify
npm run verify     # lint + typecheck + test + build 全套门禁
```

Node 22+ 必需（使用内置 `node:sqlite`）。

没有 AI Key 也能完整玩：四个智能体全部有 `src/narrative-graph.js` 的手写剧本兜底。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 3D / 后期 | three.js r187（EffectComposer + 自定义 ShaderPass，无第三方后期库） |
| 构建 | Vite 8 |
| 测试 | Vitest 5（234 个用例，含五玩法引擎、GF(2) 求解器与 Fastify 全链路 API 集成测试） |
| 类型 | TypeScript 7，`checkJs: true`，全部 `.js` 源码零错误 |
| 后端 | Fastify 5 + Node 22 `node:sqlite`（WAL） |
| 部署 | Nginx + systemd + rsync |

---

## 项目结构

```text
shared/
  constants.js        24 扇窗 / 6 位住户 / 6 结局 / tempo 参数 / 委托类型
  ai-schema.js        三智能体 payload 归一化与安全护栏（前后端同构）
  ai-prompts.js       三个 System Prompt（服务端代理与浏览器直连共用同一份）
src/
  main.js             组装 Scene / Game / UI / Audio / RibbonTrail
  game.js             主状态机：三晚循环、拖拽光链、委托、局中演进、结局路由
  game-logic.js       纯函数：连击计分、委托判定、6 结局路由（可单测）
  narrative-graph.js  6 位住户 × 3 晚剧本树 + 6 结局脚本 + 离线兜底生成器
  scene.js            3D 微缩校园、3 层视差窗盒、5 态视觉、结局镜头演出
  painterly.js        4-Sector Kuwahara + 彩色墨线 + Impasto + 雨滴折射
  vfx-pool.js         1024 容量单 Points 环形粒子池（零 GC）
  ribbon-trail.js     Catmull-Rom 一笔画流体尾翼
  audio-engine.js     四层自适应 WebAudio 合成器
  ai.js               双模 AI 调度（服务端代理 / 浏览器内存 Key 直连）
  records.js          本地档案 + 云端通行证双向同步
  ui.js / icons.js    毛玻璃 UI + 内联 SVG 图标（无 emoji 豆腐块）
  postcard.js         1080×1440 明信片合成（真实映射玩家点亮的窗）
server/
  index.js            buildApp() 工厂 + 全部 API + 分级限流
  db.js               SQLite WAL 六表 + 旧 scores 表迁移 + 种子数据
  agents.js           四智能体编排 + 缓存 + 离线回退
tools/blender/
  build_campus_v3.py  无头 Blender 生成 24 扇独立命名窗户的校园 GLB
deploy/
  deploy.sh           hynu.site 一键发布 / 备份 / 健康检查 / 回滚
  nginx-hynu.conf     TLS + gzip + /api 反代 + SPA 回退
  light-a-window.service
tests/                204 个用例
```

---

## 玩法系统

### 5 态窗格

| 状态 | 玩家看到 | 点一下会发生 |
|---|---|---|
| `dark` | 深普鲁士蓝玻璃 + 月光反光 | **零挫败保底**：+1 温暖、涟漪、35% 概率唤醒成微光 |
| `glimmer` | 暖光呼吸 + 手绘旋转光环 | 点亮，+3~+8 按连击阶梯 |
| `story_beacon` | 窗上浮着金色信封徽章 | 点亮 +8，并弹出**微光抉择卡**（连击冻结 5s，6s 未选自动按 A 分支） |
| `resonance_pair` | 两窗之间悬着星轨虚线 | 单击 = 普通点亮；**拖到另一扇 = 跨窗共鸣**（双窗同亮 + 额外唤醒一扇 +15 温暖 +3 连击） |
| `lit` | 暖黄内光 + 室内剪影 | 保活连击，+2 |

保底规则：场上可点窗少于 2 扇时，调度器 200ms 内补足，永远不会出现「看着黑楼没窗可点」。

### 一笔画光链

按住不放划过就是一条 Catmull-Rom 样条光带。第 k 扇的收益是
`gainForCombo(combo) + 2 × min(k, 5)`；一划三扇以上触发「一笔连光 ×k」、
竖琴刮奏与一扇免费邻居窗。

### 每晚 3 项火漆委托

点亮目标 / 技巧目标 / 叙事目标各一条。完成即刻盖朱砂火漆章 +12 温暖，
三项集齐再得金叶章（计入结局 E 判定）。

### 6 大结局（按优先级路由）

| ID | 名称 | 条件 |
|---|---|---|
| `ENDING_C_STARGAZER` | 屋顶的银河（隐藏 IF） | 三晚都亮 406 + 406 抉择 + 局内出现过流星或屋顶猫 |
| `ENDING_D_HARMONY` | 晚风大合唱（隐藏 IF） | ≥3 次跨窗共鸣 + 走过 205 广播线 |
| `ENDING_E_DAWN` | 破晓第一缕光（大师） | 温暖 ≥480 + 火漆章 ≥7 + 两晚 24 窗全亮 |
| `ENDING_A_WARMTH` | 万家灯火（主线真结局） | 累计点亮 ≥54 + 唤醒 ≥4 位住户 |
| `ENDING_B_COMPANION` | 留一盏夜灯（主线温情） | ≥3 次微光抉择 + 点亮过 304 或 301 |
| `ENDING_F_DRIFT` | 未完的草稿（留白） | 以上都不满足 |

---

## 四智能体 AI 管线

```text
开局  POST /api/agent/plan      NightDirector + ResidentPersona → 三晚基线剧本（3.8s 竞速）
45s   POST /api/agent/evolve    ResonanceWeaver → 按第 1 晚真实行为重写第 2、3 晚
终局  POST /api/agent/epilogue  ChronicleCurator → 住户手写回信 + 留声寄语
```

关键工程点：

- **演进只写未来**：结果深拷贝后只替换 `index > nightIndex` 的夜晚，绝不篡改正在玩的那一晚。
- **三级降级**：SQLite 语义缓存 → 上游模型 → 手写剧本图谱。任何一步失败都不影响结算。
- **共享校验**：`shared/ai-schema.js` 同时被服务和浏览器引用，直连模式也要过同一套护栏
  （禁用词、长度、房号绑定、枚举归一化）。
- **双模**：评委在标题页填入自己的 DeepSeek Key，浏览器直连 `api.deepseek.com`，
  Key 只活在模块闭包变量里，不落盘、不进 Cookie、不发本服。

---

## 美术与渲染管线

1. **4-Sector Kuwahara**（16 次采样）把数码渐变抹成厚涂色块，发光窗核心自动降低半径保住剪影。
2. **双尺度手绘墨线**：UV 用双八度噪声抖动 1.6px，颜色在深群青与暖焦茶之间按局部色温混合，
   亮侧叠暖金勾边，发光窗内部不上墨。
3. **Impasto 画布**：程序化亚麻经纬高度场 → 有限差分微法线 → 与画室斜光点乘，
   厚涂处出现掠射高光；暗部托底改成米黄画纸 + 羊皮暖灰蓝。
4. **屏幕空间雨滴**：双层 Voronoi，法线折射 + 水珠上缘暖窗倒影，`uRainAmount = 0` 时零成本。
5. **3 层视差窗盒**：外层反光玻璃 / 中层室内剪影 / 底层暖色背板，镜头晃动时三层反向位移。
6. **结局镜头**：天台拉升见银河、24 窗音律波浪、夜空渐变破晓、河灯升空。

所有纹理都是 Canvas 2D 程序化生成，**不依赖任何外部图片**也能跑出完整效果。
放图到 `public/textures/` 会被优先加载（清单见 03 号规格书第五节）。

---

## 持久化与部署

六张表：`players` / `runs` / `window_memories` / `window_heat` / `ai_cache` / `telemetry_events`。

- 匿名 `uid` + 6 位找回码，跨设备恢复结局树、住户羁绊、信物与称号。
- **流光留声机**：把一句话封进某一扇窗，后来的人点亮时会在窗角看到它并点亮共鸣星。
- **全服热力图**：标题页背景里最亮的窗，就是全服点亮最多的窗。
- 旧版 `scores` 表在首次启动时自动无损迁入 `runs`。

```bash
./deploy/deploy.sh --help
./deploy/deploy.sh                      # 本地 verify → 上传 → 重启 → 健康检查
./deploy/deploy.sh --no-build --dry-run # 只打印计划
./deploy/deploy.sh --rollback           # 恢复上一版前端 + 后端
```

目录约定：前端 `/var/www/light-a-window/dist`，后端 `/opt/light-a-window`，
数据库 `/opt/light-a-window/data`（**部署脚本永不删除或覆盖**）。

---

## 隐私与 API Key

见 [PRIVACY.md](PRIVACY.md)。要点：

- 自带 Key 只驻留页面内存，刷新即失。
- 云端档案只存匿名的游戏数据，不存 IP 明文与 User-Agent。
- 这是一个解压小游戏，不是心理治疗、干预或测评工具。

---

## 工程约束

- `npm run lint` —— ESLint 9，0 error 0 warning。
- `npm run typecheck` —— `checkJs: true`，全部 `.js` 源码 0 错误。
- `npm test` —— 204 个用例。
- `npm run build` —— 生产包。
- `npm run verify` —— 以上四步串联，CI 同款门禁。

## 文档索引

- [docs/v3_plan/00_MASTER_BLUEPRINT.md](docs/v3_plan/00_MASTER_BLUEPRINT.md) 总纲与主状态机
- [docs/v3_plan/01_GAMEPLAY_AND_NARRATIVE_DESIGN.md](docs/v3_plan/01_GAMEPLAY_AND_NARRATIVE_DESIGN.md) 玩法与剧本
- [docs/v3_plan/02_MULTI_AGENT_AI_ARCHITECTURE.md](docs/v3_plan/02_MULTI_AGENT_AI_ARCHITECTURE.md) 四智能体
- [docs/v3_plan/03_ART_BLENDER_AND_SHADER_PIPELINE.md](docs/v3_plan/03_ART_BLENDER_AND_SHADER_PIPELINE.md) 美术管线
- [docs/v3_plan/04_INTERACTION_VFX_AND_120FPS_ENGINE.md](docs/v3_plan/04_INTERACTION_VFX_AND_120FPS_ENGINE.md) 交互与性能
- [docs/v3_plan/05_BACKEND_PERSISTENCE_AND_DEPLOY.md](docs/v3_plan/05_BACKEND_PERSISTENCE_AND_DEPLOY.md) 持久化与部署
- [docs/v3_plan/06_EXECUTION_PLAYBOOK_FOR_AGENTS.md](docs/v3_plan/06_EXECUTION_PLAYBOOK_FOR_AGENTS.md) 施工指令书
