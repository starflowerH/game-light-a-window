# 今晚，亮一盏灯 · Light A Window v5.1

> 星露谷 3D 写意校园物语 · 四栋真实 Blender 建模宿舍楼 · 四季晴雨雾雪 · 五大并列小游戏。
> 记忆顺序点灯、全景快照回忆、查寝夜猫子、GF(2) 熄灯解谜、以及经典三晚六结局连光物语。

**完整文档与赛用资料**：
- 📖 **玩家完整说明书**：[docs/GAME_MANUAL.md](docs/GAME_MANUAL.md)（五大玩法规则、全部参数数值、结局攻略、段位表）
- 🏆 **比赛项目说明书**：[docs/COMPETITION_PROJECT_SPEC.md](docs/COMPETITION_PROJECT_SPEC.md)（F1–F12 全功能设计白皮书、AI 管线与奖项举证）
- 🧱 **架构策划档案**：`docs/v4_plan/` & `docs/v3_plan/`

---

## v5.1 & v5.0 做了什么（教学零残余 · 60+ FPS 优化 · 多维高难 · 直观段位）

在 v4.0 多玩法与 Blender 校园基础上，v5.0–v5.1 全面完善了新手体验、渲染性能、关卡策略深度与竞技辨识度：

- **三步互动微教程 & 零残余状态机**：新增确定性 `TutorialStateMachine`（单点微光 → 一笔拖连 3 窗 → 青色星桥），配备 SVG 轨迹与动态手势指示、12s 脉冲提示、第 2 步断划自动重武装防卡死，以及切换/跳过/退出的全链路 DOM 零残余清理；新增 3D 悬浮楼层标牌、智能胶囊标签（上限 4 枚）与点击任务发射 2 秒 3D 定位雷达圈。
- **60+ FPS 无损渲染与视差画质飞跃**：新增 **Interior Mapping 3D 室内视差着色器**（`512×512` 8 房型图集 + 隐藏多余背板/剪影）、**InstancedMesh 墙面溢光贴花**、**Tilt-Shift 移轴微缩景深**与 4 层动态四季生态；引入静态阴影烘焙（`shadowMap.autoUpdate = false`）、半分辨率 Bloom、智能 DPR 封顶、暗窗精灵剔除与 9 采样合并 **Kuwahara + Sobel**（`uFastMode` 降至 5 采样 + 解析亚麻法线），本地/线上实测满画质 **`85–89.5 FPS`**。
- **多维递进高难关卡**：依次/快照记忆扩至 **10 关**，包含 `740ms→210ms` / `2400ms→650ms` 时长压缩、第 4 关交错插播蓝紫干扰窗、第 6 关记忆留白黑屏停顿（`350ms→900ms`）与限时/容错收紧；查寝夜猫子升级为 60s **5 大急促波次**（第 4–5 波 35% 双窗并发 + 漏夜猫子断连）；熄灯棋盘扩至 **8 关限时** 并新增 Par 最优解 `+120` 加成。
- **直观 7 级夜巡段位与闯关里程碑**：统一实现 [shared/ranks.js](shared/ranks.js) 的 `D`（见习点灯生）到 `SSS`（全校熄灯传说）段位评估与关卡里程碑文案（如「闯到 第 7/10 关」「守到 第 4/5 波」「解开 第 6/8 关」），打通 HUD 徽章、晋升提示、结算勋章卡及排行榜。
- **心流 DDA 导演、突发危机与 6 秒回放**：新增 12 操作滑窗 EMA 心流调节器、`3` 种校园突发危机（螺蛳粉火锅/窜窗橘猫/蓝牙麦）、整层制霸黄金扫光演出与 12.5× 6 秒今夜回放剧场。

---

## v4.0 做了什么（Stardew 3D 校园夜巡升级）

在 v3.0 治愈系连光内核之上，v4.0 全面引入 Blender 3D 建筑群、星露谷像素-油画混成材质与多玩法闯关体系：

- **4 栋真实 Blender GLB 宿舍楼 + 公共校园底盘**：员工宿舍桂花院（3×4=12窗）、高中晨光楼（3×6=18窗）、大学 17 号楼（4×6=24窗）、研究生研思楼（5×6=30窗）与 `campus_grounds.glb`，支持 3D 航拍切楼漫游与 4 档视角（`正面全景` / `星露谷45°` / `林荫仰望` / `天台巡礼`）+ 有界 `OrbitControls` 拖拽旋转。
- **像素-油画混成 PBR 与真天气系统**：Procedural 128×128 像素法线砖瓦/屋瓦/石板路贴图、Kuwahara 半径微调（`0.95`）保留清晰细节；移除旧版用雪粒冒充雾天的逻辑，重做 **4 层 Perlin FBM 体积飘雾 + 路灯散射光晕**、细雨路面涟漪波纹与落雪屋檐窗台覆雪。
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
| 测试 | Vitest 5 + Playwright 1.65（295 条单元/API 用例 + 217 条 4 层端到端 E2E = 512 条门禁） |
| 类型 | TypeScript 7，`checkJs: true`，全部 `.js` 源码零错误 |
| 后端 | Fastify 5 + Node 22 `node:sqlite`（WAL） |
| 部署 | Nginx + systemd + rsync |

---

## 项目结构

```text
shared/
  constants.js        4 栋宿舍 / 4 季 5 天气 / 6 结局 / tempo / 委托适配器
  ranks.js            D..SSS 七级段位体系与各模式关数里程碑计算
  ai-schema.js        六路由多智能体 payload 归一化与 12 词安全护栏
  ai-prompts.js       多智能体 System Prompt（代理与直连共用）
src/
  main.js             组装 Scene / Game / UI / Audio / RibbonTrail
  game.js             主状态机：五玩法引擎、三步微教程、危机/DDA/回放、结局路由
  game-logic.js       纯函数：连击计分、整层制霸、委托判定、6 结局路由
  tutorial.js         3 步互动微教程确定性状态机
  difficulty.js       EMA 动态心流调节导演（DDA）
  crisis.js           校园突发危机调度器（螺蛳粉/抓猫/拔麦）
  replay.js           400 事件环形录屏器与 12.5x 6 秒回放播放器
  narrative-graph.js  6 位住户 × 3 晚分支剧本 + 6 结局脚本 + 离线兜底
  npc-portraits.js    8 位校园 NPC × 5 套天气动态换装 SVG 生成器
  random-events.js    8 项校园随机事件引擎
  minigames/          memory-patrol.js / dorm-reflex.js / lights-out.js (含 GF(2) 求解器)
  scene.js            3D 校园与宿舍 GLB、Interior Mapping、溢光贴花、四季气象与 60fps 自适应
  textures-procedural.js 128×128 高度场法线与像素-油画 PBR 材质合成
  painterly.js        9 采样合并 Kuwahara+Sobel / 墨线 / 解析亚麻 / Tilt-Shift / 雨滴后期
  vfx-pool.js         1024 容量单 Points 环形粒子池与星桥弧线（零 GC）
  ribbon-trail.js     Catmull-Rom 磁吸流体尾翼
  audio-engine.js     四层自适应 WebAudio 合成器 + 3 套 8 小节总谱 + 本地音频支持
  ai.js               双模 AI 调度（服务端代理 / 浏览器内存 Key 直连 DeepSeek）
  records.js          本地档案 + 云端通行证双向同步
  ui.js / icons.js    毛玻璃 UI、DOM 池化标签、段位徽章与 SVG 图标
  postcard.js         1080×1440 明信片合成（真实映射本局点亮窗格）
server/
  index.js            buildApp() 工厂 + 全部 REST/AI API + 分级限流
  db.js               SQLite WAL 六表 + v4/v5 幂等迁移 + 榜单排名差值计算
  agents.js           7-Agent 编排 + SQLite 缓存 + 离线图谱回退
tools/blender/
  build_campus_v4.py  无头 Blender 生成公共校园与 4 栋差异化宿舍 GLB
deploy/
  deploy.sh           hynu.site 一键发布 / 备份 / 健康检查 / 回滚
  nginx-hynu.conf     TLS + gzip + /api 反代 + SPA 回退
  light-a-window.service
tests/                295 条 Vitest 单测与 API 集成 + 217 条 Playwright E2E
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

## 七智能体 AI 管线

```text
开局  POST /api/agent/plan      NightDirector + ResidentPersona → 三晚基线剧本（3.8s 竞速）
45s   POST /api/agent/evolve    ResonanceWeaver → 按第 1 晚真实行为重写第 2、3 晚
终局  POST /api/agent/epilogue  ChronicleCurator → 住户手写回信 + 留声寄语
进校  POST /api/agent/dialogue  DialogueDirector → 天气/季节/宿舍专属值班室对话
构图  POST /api/agent/puzzle    PuzzleArchitect → 记忆关卡对称/几何亮灯坐标阵
结算  POST /api/agent/debrief   InspectorCommentator → 林阿姨与周副校长双视角夜巡评语
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

1. **9 采样合并 Kuwahara + Sobel**（`uFastMode` 降载为 5 采样十字滤波）配合 **Tilt-Shift 移轴景深** 与发光窗芯收缩半径，兼具油画色块与建筑锐利度。
2. **双尺度手绘墨线**：依据局部色温在深群青与暖焦茶间混色，轮廓峰值叠涂暖金勾边，单 `vnoise` 干画笔破墨。
3. **解析法 Impasto 画布**：解析导数求亚麻经纬微法线 → 与画室斜光点乘出掠射高光，替代 3 次 `fbm2` 有限差分以稳定 60+ FPS。
4. **屏幕空间雨滴**：双层 Voronoi，法线折射 + 水珠上缘暖窗倒影，`uRainAmount = 0` 时零成本。
5. **Interior Mapping 室内视差 + 墙面溢光**：`512×512` 八房型程序化室内图集光线盒求交视差，`InstancedMesh` 批处理窗下砖墙溢光。
6. **60 FPS 性能优化与结局镜头**：静态阴影烘焙（`shadowMap.autoUpdate = false`）、半分辨率 Bloom、暗窗精灵剔除；结局含天台拉升见银河、24 窗音律波浪、夜空渐变破晓、河灯升空。

所有模型、纹理与音景均为项目原创代码与 Blender 脚本生成，**不依赖任何外部图片或音频**。

---

## 持久化与部署

六张表：`players` / `runs` / `window_memories` / `window_heat` / `ai_cache` / `telemetry_events`。

- 匿名 `uid` + 6 位找回码，跨设备恢复结局树、住户羁绊、信物与称号。
- **流光留声机**：把一句话封进某一扇窗，后来的人点亮时会在窗角看到它并点亮共鸣星。
- **全服热力图**：标题页背景里最亮的窗，就是全服点亮最多的窗。
- 旧版 `scores` 表与 v3 对局字段在首次启动时自动无损迁入。

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
- `npm test` —— 12 个测试套件共 295 个单元与 API 集成用例。
- `npm run test:e2e` —— 4 层 Playwright 端到端共 217 个实机用例。
- `npm run build` —— Vite 生产分包构建（总包 ~5.63 MB）。
- `npm run verify` —— 静态检查 + 类型 + 单测 + 构建全链路门禁。

## 文档索引

- [docs/GAME_MANUAL.md](docs/GAME_MANUAL.md) **完整游戏手册与玩家讲解书**
- [docs/COMPETITION_PROJECT_SPEC.md](docs/COMPETITION_PROJECT_SPEC.md) **心晴校园 AI 创意挑战赛 · 项目说明与全功能白皮书**
- [docs/v4_plan/00_V4_VISION_AND_ARCHITECTURE.md](docs/v4_plan/00_V4_VISION_AND_ARCHITECTURE.md) v4.0 多玩法与校园 3D 架构书
- [docs/v3_plan/00_MASTER_BLUEPRINT.md](docs/v3_plan/00_MASTER_BLUEPRINT.md) 总纲与主状态机
- [docs/v3_plan/01_GAMEPLAY_AND_NARRATIVE_DESIGN.md](docs/v3_plan/01_GAMEPLAY_AND_NARRATIVE_DESIGN.md) 玩法与剧本
- [docs/v3_plan/02_MULTI_AGENT_AI_ARCHITECTURE.md](docs/v3_plan/02_MULTI_AGENT_AI_ARCHITECTURE.md) 多智能体架构
- [docs/v3_plan/03_ART_BLENDER_AND_SHADER_PIPELINE.md](docs/v3_plan/03_ART_BLENDER_AND_SHADER_PIPELINE.md) 美术管线
- [docs/v3_plan/04_INTERACTION_VFX_AND_120FPS_ENGINE.md](docs/v3_plan/04_INTERACTION_VFX_AND_120FPS_ENGINE.md) 交互与性能
- [docs/v3_plan/05_BACKEND_PERSISTENCE_AND_DEPLOY.md](docs/v3_plan/05_BACKEND_PERSISTENCE_AND_DEPLOY.md) 持久化与部署
- [docs/v3_plan/06_EXECUTION_PLAYBOOK_FOR_AGENTS.md](docs/v3_plan/06_EXECUTION_PLAYBOOK_FOR_AGENTS.md) 施工指令书
