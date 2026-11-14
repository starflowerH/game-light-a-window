# 优化清单 · 今晚，亮一盏灯 (v2)

> 目标奖项优先级：**最佳工程奖(完成度奖) > 视觉 > 交互 > AI 技术应用**
> 现状基线：线上 `https://game.xiaoxin.email` = `index-CUlYXb2i.js` (2026-11-14 15:02)
> 源码位置：**服务器 `/home/xiaoyuyu/work/light`**（本地已同步一份到 `v2/`，但服务器才是准）
> 勘察日期：2026-11-14 15:25 · 所有条目标注了实测证据

---

## 0. 先说结论：现在的完成度配不上"最佳工程奖"

评审看工程奖，看的不是画面多精致，而是**这套东西能不能被交付、被验证、被维护**。当前 v2 有三个硬伤：

| 硬伤 | 现状 | 影响 |
|---|---|---|
| **没有版本控制** | 服务器 `~/work/light` 不是 git repo；本地也不是 | 改崩了无法回滚，评审看不到演进过程 → **工程奖直接扣分** |
| **零测试** | v2 没有 tests 目录，`package.json` 无 test 脚本 | v1 原本有 10 个 vitest 用例，v2 重写时**全丢了** → "完成度"无从谈起 |
| **无 CI / 无 lint / 无类型检查** | `tsconfig.json` 是摆设（`strict:false`、`checkJs:false`），无 eslint，无 GitHub Actions | 评委无从判断工程规范 |

**同时 v2 引入了 v1 没有的真 bug**（见 P0-1），说明**重写换来的不是质量，是失控**。

---

## P0 — 必须修的真 Bug（都已实测复现）

### P0-1 【严重】`start()` 里 `_beginNights()` 被调用两次 → 开场动画渲染出**两层叠加**
- **位置**：`v2/src/game.js:125` 与 `v2/src/game.js:129`
- **成因**：`if (first.nights) { ...; this._beginNights() }` 之后又无条件执行 `if (this.nights) this._beginNights()`。AI 在 4.5s 内返回时两条路径都命中。
- **实测**：Playwright 插桩 `_beginNights` 调用次数 = **2**；`#intro` DOM 元素数量 = **2**；两次 `_launchNight(0)` → `launch: [0,0]`
- **症状**：截图里开场文字**重影**（"熄灯铃响过很久了。"叠两层），且第一晚被**启动了两次**（`night` 状态被重置，计时/温度归零重来）
- **修法**：删掉 `game.js:129` 那行多余的 `if (this.nights) this._beginNights()`，只保留 `if` 分支内的调用；并给 `_beginNights` 加幂等守卫 `if (this._began) return; this._began = true`
- **验收**：`#intro` 数量恒为 1；`_launchNight` 只被调用一次

### P0-2 【中】后端 `server/index.js` 有 **3 组重复路由**，其中 3 条是死代码
- **位置**：`v2/server-index.js:37,39,45` 定义了 `/health` `/leaderboard` `/score`（**无 `/api` 前缀**），而 `170,171,176` 又定义了 `/api/health` `/api/leaderboard` `/api/score`
- **实测**：nginx 只 `proxy_pass .../api/`，所以无前缀那 3 条**永远打不到**；但 `GET /leaderboard` 返回 200 —— 那是 nginx `try_files` 把前端 `index.html` 兜回来了，**不是 API 响应**（返回的是 HTML 不是 JSON）
- **风险**：评审/第三方若直接打后端 3101 端口，无前缀的 `POST /score` 会绕过 nginx 直写数据库；且排行榜 URL 语义混乱
- **修法**：删掉无前缀的 3 条，只保留 `/api/*`；或统一加前缀并在 nginx 加对应 location

### P0-3 【中】`rateLimit` 的 `hits` Map **只增不删** → 内存泄漏 + 限流不准
- **位置**：`v2/server-index.js:23-30`，`hits.set(ip, arr)` 后**从不删除**过期 IP
- **风险**：长期运行后 Map 无限增长（每个独立 IP 一个 key）；单个 IP 只请求一次也会永久驻留
- **修法**：定时清扫（`setInterval` 清理 60s 前的空数组）或改用 `lru-cache`/有界 Map

### P0-4 【低】`game.js:243` 有残留无意义语句 `this.run.items.length`
- 空语句，无副作用，但评审翻代码会扣"完成度"分 → 直接删

---

## P1 — 工程奖基建（**这才是拿"最佳工程奖"的关键**）

### P1-1 建 git 仓库 + 有意义的提交历史 ⭐⭐⭐
- **现状**：本地和服务器**都不是** git repo
- **要做**：
  - 服务器 `~/work/light` `git init`，先提交当前线上版本作为基线（tag `v2.0.0-baseline`）
  - 加 `.gitignore`（`node_modules` `dist` `.env`）
  - **把这次优化拆成 8-15 个语义化提交**，每个提交对应清单里的一项 → 评委 `git log` 一看就知道工程量
  - 同步一份到 GitHub 公开仓库（**加分项**：评委能直接看源码和提交历史）
- **价值**：这是工程奖**最直接的证据**，成本极低

### P1-2 补回单元测试（v1 有 10 个，v2 全丢）⭐⭐⭐
- **现状**：`v2/` 无 tests 目录，`package.json` 无 `"test"` 脚本
- **要做**：加 vitest，优先覆盖**纯逻辑**（不依赖 DOM/Three.js，便于 CI）：
  - `_gainForCombo()` 连击收益曲线（2/3/4/5）
  - `normalizePayload()` 枚举归一化 + 禁用词拒绝 + 夜数不为 3 时拒绝（后端逻辑，直接从 `server/index.js` 抽成可测模块）
  - `mergeRun()` 记录合并、`items` 去重、`history` 截断到 20 条
  - 每扇窗每晚只计一次 lit
  - 整栋楼亮起只触发一次
  - 三晚流程推进
- **目标**：**≥ 20 个用例全绿**，`npm test` 一条命令跑完
- **价值**：`git log` + `npm test` 绿灯 = 工程奖标准答案

### P1-3 加 lint + 类型检查 + CI ⭐⭐
- **lint**：ESLint flat config（`eslint.config.js`），规则 `recommended` + `no-unused-vars`（v1 遗留的 `fast`/`raf`/`activeStoryIndex`/`lastCombo` 未使用变量就是这类）
- **类型**：`tsconfig.json` 当前 `strict:false`+`checkJs:false` = 完全没生效。两条路选一：
  - 路线 A（推荐，**工作量小**）：给 v2 加 `// @ts-check` + `checkJs:true` + `strict:true`，逐个补类型
  - 路线 B（**工作量大，慎选**）：把 v2 迁回 TypeScript（v1 本来就是 TS，等于再重写一次）
  - **我的建议：走 A**。B 会把"工程奖"变成"重写奖"，风险太高
- **CI**：GitHub Actions `.github/workflows/ci.yml` → `npm ci && npm run lint && npm run build && npm test`；加 `wget https://game.xiaoxin.email/api/health` 做线上冒烟检查

### P1-4 部署可重复 + 一键回滚 ⭐⭐
- **现状**：部署步骤散落在 codex 会话记录里（`cp dist → /var/www` + `sudo nginx -s reload`），**没有任何脚本**
- **要做**：写 `deploy/deploy.sh`（构建 → 备份 → 发布 → 健康检查 → 失败自动回滚），配 systemd timer 或 GitHub Actions deploy job
- **额外**：服务器已有 `dist.bak-*` 备份（最近 7 个），但**没人知道怎么回滚** → 脚本里内置 `--rollback` 参数

### P1-5 错误可观测 ⭐⭐
- **现状**：后端 `logger: false`（静默），AI 校验失败只 `console.error`，前端 0 错误上报
- **要做**：
  - Fastify 开启结构化 logger（JSON 行），日志落 `/var/log/light-a-window/` + journald
  - 加 `/api/health` 深度检查：AI 上游可达性、DB 可写性、磁盘余量
  - 前端 `window.onerror` + `unhandledrejection` → `/api/client-error`（可选，但"有错误上报"是工程成熟度信号）

### P1-6 补 `.env.example` + `README` + `CHANGELOG` ⭐⭐
- `.env.example`：列出 `AI_BASE` `AI_MODEL` `AI_KEY` `PORT` `DATA_DIR`（**只写变量名，绝不写真值**）
- `README`：架构图、目录说明、本地开发、部署步骤、玩法说明、隐私说明
- `CHANGELOG.md`：每个版本改了什么 → 评审直接看

---

## P2 — 视觉（冲"最佳视觉设计奖"）

### P2-1 🔥 水墨油画后期**几乎看不见**（当前最大视觉短板）⭐⭐⭐
- **实测**：截图确认 —— 画面是**干净的 3D 渲染**，描边、纸纹、晕染**肉眼不可辨**。`painterly.js` 里 Sobel 边缘 `edge*0.4` 混合、纸纹 `±0.025` 幅度，**都太弱**
- **根因**：`painterly.js` 的 `edge` 用 `smoothstep(0.12, 0.42, ...)` 阈值太松 + 混合系数只有 0.4；纸纹 `grain*0.05` 幅度在 8bit 量化后基本被抹平
- **要做**：
  1. **描边加重**：`edge` 混合系数 0.4 → 0.75+，并把阈值收紧到 `smoothstep(0.20, 0.55, ...)` 让边缘更"抓"
  2. **纸底改暖**：`paperBase` 现在是 `vec3(0.09,0.075,0.11)`（**偏冷偏黑**）→ 改成**米黄纸色** `vec3(0.93,0.89,0.80)` 叠加，让暗部读起来像水彩纸而不是黑洞
  3. **色阶断层**：加 2-3 档**柔和色阶量化**（保留中间调），这是"油画/水粉"感的关键，目前代码注释说"太subtle避免moiré"就放弃了
  4. **纸纹加强 + 加纤维噪声**（不是纯 fbm，加一点方向性）
- **验收**：截图对比必须"一眼看出是插画不是 3D 渲染"
- **注意**：之前 agent 因为摩尔纹（moiré）退回弱化版本 → **这次要换思路**：用**低分辨率上采样**或**法线/深度边缘**替代亮度 Sobel，能拿描边又不产生摩尔纹

### P2-2 真实美术资产（Blender GLB / 手绘笔触贴图）⭐⭐
- **现状**：`V2_README.md` 自己写了"未使用 Blender GLB / 手绘笔触贴图 / 烘焙光照；当前为程序化生成"
- **难度**：你没有 Blender 基础，但**可以**：
  - 用 AI 生成（ImageGen）画**窗内剪影贴图**、**墙面笔触贴图**、**云/夜空渐变**
  - 建筑本体保持程序化，但**材质换成手绘贴图** → 立刻脱离"3D 基础几何体"观感
- **建议优先级**：P2-1（调后期）→ P2-2（加贴图）→ 才考虑真建模。**贴图的性价比远高于建模**

### P2-3 HUD 图标变豆腐块 ⭐⭐
- **实测**：右上角 🔊 / ⏸ 在部分字体环境渲染成**空心方块**（截图可见）
- **修法**：换成**内联 SVG** 或纯 CSS 绘制（不依赖 emoji 字体）。顺带 `postcard.js` 里的 `🌿🥛💡` 等 AI 图标也要有兜底（AI 可能返回任意 emoji，字体缺失就豆腐块）→ 服务端改成**图标白名单 + 兜底 '✦'**

### P2-4 明信片与游戏画面**风格不统一** ⭐
- `postcard.js` 是纯 Canvas 2D 绘制的水彩纸风格（好看），但和 3D 场景是两个完全不同的美术语言
- **修法**：明信片复用同一套 palette + 笔触质感；或把真实游戏截图绘制进明信片（**用 `renderer.domElement.toDataURL()`**）→ 一致性最强，也最有"这是我的游戏"的感觉

### P2-5 favicon + 分享卡片
- `index.html` **无 favicon**（浏览器标签是默认图标）
- 加 SVG favicon + og:image（微信/QQ 分享会显示）

---

## P3 — 交互 & 好玩（冲"最佳交互体验奖" + "好玩解压"）

### P3-1 修完 P0-1 的双层开场（**交互第一优先**）⭐⭐⭐
- 见 P0-1。现在开场是"两层文字重影"，第一印象直接崩

### P3-2 "刷视频式爽感"仍不够 ⭐⭐
- 现状：连击有五声音阶 + 浮字 + 光链 + 惊喜 toast，**基础有了**
- **还缺**（按性价比排序）：
  1. **镜头反馈**：连击 ≥8 时镜头轻微推近 + 呼吸感 FOV 脉动（**成本极低，爽感提升极大**）
  2. **屏幕震动**：金窗/连光触发时 2-4px 震动
  3. **进度可视化**：加一条**整栋楼点亮进度条**，让"还差几扇"可见（现在只有温暖值条）
  4. **连击保留**：连击断掉时给"接住"提示，而不是直接归零
  5. **夜间节奏**：现在 75 秒固定 → 建议第 2/3 晚**窗口更少、节奏更快**（`nightSummary` 文案已经这么说了，但**机制没实现** ← 文案与玩法不一致，评审会看出来）

### P3-3 惊喜事件的**未知性**与**稀有度**设计 ⭐⭐
- 现状：5 种惊喜（golden/star/lanterns/cat/chain），概率写死在 `_checkSurprise()`，冷却 6.5s
- **问题**：固定概率 = 玩家玩 3 遍就知道每局会遇到什么 → **丧失"刷视频"的期待感**
- **要做**：
  - **加权随机 + 保底机制**（N 抽必出）
  - **稀有度分级**（common/rare/legendary）+ 不同视觉表现强度
  - **连续触发递进**（连续 3 次未出大奖 → 下次必出）

### P3-4 排行榜与成就感 ⭐⭐
- 现状：真实榜单 + 昵称上榜 + 我的记录，**已实现**
- **还缺**：
  - 榜单只在结算页出现，**游戏过程中看不到实时排名** → 加"你现在排第 X"的轻提示（制造"我差一点上榜"的钩子）
  - 榜单**按天重置**（"今晚的灯" vs 历史总榜）→ 现在是全站累计，和"今晚"文案不符
  - 名次变化/上榜动画

### P3-5 引导剧情"可跳过"与"回看" ⭐
- 开场动画 4 行打字机，**首次强制播放**，之后靠 `localStorage` 跳过
- **要做**：标题页加"重看开场"入口；剧情可点击跳过（现在要逐字点完 4 行）

### P3-6 无障碍与移动端细节 ⭐⭐
- **a11y**：`ui.js` **全文无 `aria-`、无 `role`、无 `tabindex`** → 加 `aria-label`/`role="dialog"`/焦点管理；`style.css` 有 `prefers-reduced-motion`（这个有，保留）
- **键盘**：`game.js` 只处理 `Escape`；应支持**键盘选中窗户**（Tab/方向键 + Enter）
- **emoji 字体**：见 P2-3
- **移动端**：HUD 在 390px 已压缩，但**暂停/静音按钮 34px 偏小**（苹果建议 ≥44px）

---

## P4 — AI 技术应用（冲"最佳 AI 技术应用奖"）

### P4-1 AI 生成内容**对玩法影响太浅** ⭐⭐⭐
- **现状**：AI 只生成 **weather / tempo / palette / stories / postcard**。其中：
  - `weather` → 只切了雨/雪粒子（`setWeatherFx`）
  - `palette` → 换 4 套配色（这个做得不错）
  - `tempo` → **完全没用**！后端归一化了，前端从没读
  - `stories` → 弹卡片
- **要做**：让 AI 真正**驱动玩法**：
  - `tempo` → 控制**窗户发光节奏**（slow=慢，brisk=快）
  - AI 生成**每一晚的"小目标"**（如"今晚让三楼全亮"）
  - AI 生成**结局分支**（依据玩家连击/温暖值走向不同结语）→ 强化"AI 参与感"

### P4-2 提示词工程可展示 ⭐⭐
- 系统提示词写得不错（明确"不是心理医生"、禁词、JSON 结构）
- **要做**：把**提示词迭代过程**写进文档（`docs/AI_PROMPT.md`）—— 展示"禁用词过滤 → 枚举归一化 → 长度校验 → 兜底填充"这条链。这本身就是 AI 工程能力的证明

### P4-3 AI 兜底链路要说清楚 ⭐
- 已有：`ai.js` 12s 超时 → 本地 FALLBACK；`game.js` 4.5s 竞速 → 先开玩
- **要做**：UI 上明确区分"AI 生成 / 本地兜底"（已有 `aiSource` 标签，**做得好，保留**），并在文档里画流程图 → 评委认可"降级设计"

### P4-4 缓存 + 成本控制 ⭐⭐
- **现状**：`/api/generate` **每次调用都打上游**，无缓存。玩家反复重玩 = 反复烧额度
- **要做**：
  - **结果缓存**（key = 场景 seed + 夜晚序号），SQLite 存，TTL 若干小时 → 大幅降成本 + 降低上游抖动
  - **每日调用配额**（防滥用，这是公开 Key 的现实风险）
  - **AI 超时降级**已经做了 ✅，保留

### P4-5 比赛合规：用户自带 Key 模式 ⭐⭐⭐
- **现状**：比赛要求"用户输入自己的 DeepSeek Key"，当前用**服务器统一 Key**
- **要做**（`V2_README` 里 v1 已有过这模式，可参考 `v1/src/ui/screens.ts` 的 `keyScreen()`）：
  - **双模式**：线上演示用服务器 Key（任何人能玩）；**评审模式**用户输入自己的 Key
  - Key **只存内存**，不写 localStorage/日志/请求头透传
  - 前端直连 DeepSeek 需要暴露 Key → 建议**前端调自建代理 + 一次性 session token**，或接受"评审模式前端直连"但明确 Key 不落盘
- **价值**：这是**参赛资格问题**，不是优化项 —— 不处理可能被取消资格

---

## P5 — 文档与交付物（评审看的就是这些）

| 文件 | 状态 | 要做 |
|---|---|---|
| `README.md` | 有但很简 | 补架构图、玩法、部署、截图 |
| `CHANGELOG.md` | ❌ 无 | 逐版本记录 |
| `docs/ARCHITECTURE.md` | ❌ 无 | 架构 + 数据流图 |
| `docs/AI_PIPELINE.md` | ❌ 无 | AI 提示词/校验/兜底链（**P4-2**） |
| `docs/TESTING.md` | ❌ 无 | 测试矩阵 + 运行方式 |
| `docs/DEPLOY.md` | 部分在 PROJECT_LOG | 整理成正式部署手册 |
| `PRIVACY.md` | v1 有，v2 无 | 同步到 v2（评审必看） |
| `LICENSE` + `ASSET_LICENSES` | v1 有，v2 无 | 同步；确认所有 AI 生成图的商用条款 |
| `截图` | 有 artifacts/ 但旧 | 补最新 v2 桌面/手机/开场/惊喜/明信片各一张 |

---

## 执行顺序建议（按"工程奖性价比"排）

**第 1 批 · 半天，稳拿工程奖底子**
1. P0-1 修双层开场（**先修这个**，它是 bug 也是交互问题）
2. P1-1 git init + 基线提交 + .gitignore
3. P1-2 补 20 个单元测试（后端 normalizePayload 抽模块 + 前端纯函数）
4. P0-2/P0-3/P0-4 后端死代码、内存泄漏、空语句

**第 2 批 · 1 天，工程奖成型**
5. P1-3 ESLint + `@ts-check` + CI（推 GitHub）
6. P1-4 部署脚本（含回滚）
7. P1-6 README/CHANGELOG/.env.example
8. P5 文档与截图全套

**第 3 批 · 1-2 天，视觉与交互**
9. P2-1 水墨油画后期加重（**视觉奖关键**，注意绕开摩尔纹）
10. P2-3 图标 SVG 化 + 服务端 emoji 白名单
11. P3-2 镜头反馈/震动/进度条 + P3-3 惊喜稀有度
12. P3-6 无障碍 + 键盘操作

**第 4 批 · 比赛合规 + 冲 AI 奖**
13. P4-5 双模式（用户自带 Key）⚠️ **优先确认参赛要求**
14. P4-1 tempo 驱动玩法 + AI 结局分支
15. P4-4 缓存 + 配额

---

## 需要你拍板的 3 件事

1. **P4-5 用户自带 Key** —— 比赛原始要求是什么？我需要确认是"必须"还是"建议"，这决定第 4 批做不做
2. **P2-1 视觉改造幅度** —— 只调后期参数（安全，1 天）还是引入手绘贴图（更出彩，+2 天）？
3. **GitHub 公开仓库** —— 愿意公开源码吗？（工程奖加分项，但要确认服务器配置和 Key 不会泄露）

---

## 附：勘察中发现的事实备忘

- 后端 `/opt/light-a-window/server/index.js` 与本地 v1 `server/index.js` **md5 一致**（`0ac2f560e0aeb4a1755ed43c2c388a66`）→ 后端改动可本地做再 scp
- 服务器 `~/work/light` 与 `/opt/light-a-window` 是**两套独立副本**，v2 源码只在前者 → 极易改错地方，需统一
- 服务器上 `~/.hermes` 是 QQ 机器人网关，**与本项目无关**，忽略
- 服务器 codex 的旧 goal 已 `blocked`（413 上下文超限，2871 万 token），**不要再依赖那个会话**
- nginx 只 proxy `/api/` + `= /health`，reload 必须用 `sudo nginx -s reload`（非 systemd 管理）
- 服务器 Node 必须用 `/opt/node22/bin/node`（系统默认 v20 无 `node:sqlite`）
