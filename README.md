# 今晚，亮一盏灯 · Light A Window

> 一栋宿舍，二十四扇窗。  
> 点击正在发光的窗户，让整栋楼慢慢亮起来。

治愈系快节奏解压小游戏。**5 分钟三晚，无失败、无扣分、无强迫积极**。

**线上**：https://game.xiaoxin.email

---

## 目录

- [这是什么](#这是什么)
- [快速开始](#快速开始)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [玩法与系统](#玩法与系统)
- [AI 管线](#ai-管线)
- [隐私与 API Key](#隐私与-api-key)
- [文档索引](#文档索引)
- [路线图](#路线图)

---

## 这是什么

玩家点击一栋宿舍楼里正在发光的窗户，每点一扇就点亮一扇。
连击会形成「光链」，偶尔触发惊喜事件（金窗 / 流星 / 河灯 / 屋顶的猫）。
三晚结束后生成一张明信片，成绩进入匿名排行榜。

**定位是治愈系解压小游戏，不是心理治疗、心理干预或心理测评工具。**
AI 只负责生成天气、配色、小故事和明信片文案，**不诊断、不治疗、不说教**。
允许安静、疲惫、阴天，不强迫积极。

---

## 快速开始

```bash
npm install

# API 服务（需要 Node 22+，用到 node:sqlite）
npm run server     # http://127.0.0.1:3101

# 前端开发服务器（/api 代理到 3101）
npm run dev        # http://127.0.0.1:5173
```

构建与校验：

```bash
npm run build      # 产出 dist/
npm test           # 单元测试
npm run lint       # ESLint
npm run typecheck  # TypeScript 检查（@ts-check）
npm run verify     # lint + typecheck + test + build 全套
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 构建 | Vite 8 |
| 语言 | JavaScript（ESM）+ JSDoc 类型标注，`@ts-check` 严格检查 |
| 3D | Three.js 0.187（WebGL2，自定义后期 shader） |
| 后期 | 自研 painterly pass（Sobel 描边 + 暖纸底 + 水彩晕染） |
| 明信片 | Canvas 2D 导出 PNG |
| 音效 | WebAudio 实时合成（五声音阶连击） |
| 后端 | Fastify 5 + Node 22 `node:sqlite` |
| AI | DeepSeek（服务端代理，浏览器直连可选） |
| 部署 | Nginx + systemd + Let's Encrypt |

---

## 项目结构

```text
src/
  main.js       入口：组装 scene + game + ui
  scene.js      Three.js 场景（宿舍楼/24 扇窗/远山/月亮/萤火虫/水塔/惊喜特效）
  painterly.js  自定义后期 shader
  game.js       玩法：点击/连击/惊喜/三晚流程/结算/上榜
  ui.js         所有 DOM 覆盖层（标题/HUD/故事卡/结算/明信片/排行榜/开场引导）
  ai.js         AI 调用 + 本地兜底内容
  postcard.js   Canvas 明信片导出
  records.js    localStorage 个人记录
  style.css     全部样式（含移动端与 reduced-motion）
shared/
  ai-schema.js  AI payload 校验（前后端共用，见下）
server/
  index.js      Fastify + SQLite + AI 代理 + 排行榜
tools/
  blender/      Blender headless 建模脚本
art/            Blender 导出的模型与预览
tests/          Vitest 单元测试
docs/           设计、研究、计划、历史
```

### 为什么有 `shared/`

当玩家**自带 DeepSeek Key** 时，请求是浏览器直连 DeepSeek，**不经过本服务器**。
如果校验逻辑只写在后端，这条路径就会绕过枚举归一化、长度检查和禁用词过滤 ——
模型返回个非法 `palette` 就能让场景崩掉。

所以校验逻辑抽到 `shared/ai-schema.js`，**前后端 import 同一份**。
这是"双模式"能安全存在的前提。

---

## 玩法与系统

| 项 | 数值 |
|---|---|
| 单晚时长 | 75 秒 |
| 夜晚数量 | 3 晚 |
| 窗户数量 | 24 扇 |
| 点击基础温暖 | +2 |
| 连击 3–4 / 5–7 / 8+ | +3 / +4 / +5 |
| 故事窗 | +3 ~ +6 |
| 全楼亮起 | 24 扇全亮触发一次 |

**惊喜事件**（低概率 + 保底）：金窗 / 流星划过 / 有人放了灯 / 屋顶的猫 / 连光。

**引导**：首次进入有一段打字机开场旁白 + 指向第一扇窗的教学提示（教练标记）。
可在 localStorage 记住已看过。

**成就记录**：最佳温暖、最高连击、累计点亮窗户、玩过几晚、收集到的小物件 —— 存 localStorage。

---

## AI 管线

```text
浏览器
  └── POST /api/generate
        └── Fastify 3101
              └── https://t.xiaoxin.email/v1/chat/completions
                    └── deepseek-v4.1-flash
```

后端对模型输出做四层处理：

1. **禁用词过滤** —— 临床词、说教词一律拒绝整组 payload
2. **枚举归一化** —— 模型会自由返回 `moonlit_blue` / `breezy` / `warm_orange` 等近义值，映射到场景真正实现的 4 套配色 / 4 种天气 / 3 种节奏；未知值用安全默认（**不**整组 fallback，否则会频繁 502）
3. **长度校验** —— 故事 6–24 字，明信片 10–40 字
4. **兜底填充** —— 故事不足两条时补齐，保证夜晚不空

**降级链路**：AI 超时 12 秒 → 本地内容；启动时 4.5 秒竞速 → 先用本地内容开局，
AI 到达后替换尚未开玩的那一晚。**游戏永远不会因为 AI 慢而卡住。**

详见 [`docs/ART_PLAN.md`](docs/ART_PLAN.md) 与 `shared/ai-schema.js`。

---

## 隐私与 API Key

见 [`PRIVACY.md`](PRIVACY.md)。要点：

- **不收集**真实姓名、联系方式、位置或任何隐私心事
- 排行榜**默认匿名**（"今晚的某某"），只存昵称 + 分数 + 时间
- 用户自带 Key 时，Key **只存在浏览器内存变量**，不写 localStorage / Cookie / 日志，
  **不发送到本作品服务器**，刷新即清除
- 服务端 Key 只从环境变量读取，不写进前端、日志或仓库

排行榜只保存：昵称、点亮窗数、最长连击、温暖值、创建时间。

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/OPTIMIZATION_CHECKLIST.md`](docs/OPTIMIZATION_CHECKLIST.md) | **优化清单**（含已复现 bug 与工程基建计划） |
| [`docs/ART_PLAN.md`](docs/ART_PLAN.md) | **绘图计划**（卡通油画路线 + 生图清单 + Blender 管线） |
| [`docs/design/`](docs/design/) | 产品设计、玩法系统、AI 规范、美术方向、技术架构、验收清单 |
| [`docs/research/`](docs/research/) | 心理学与内容研究、调研提纲、证据模板 |
| [`docs/COMPETITION_RESEARCH.md`](docs/COMPETITION_RESEARCH.md) | 比赛信息与要求 |
| [`docs/history/PROJECT_LOG.md`](docs/history/PROJECT_LOG.md) | **历史工作日志**（部署细节、技术债、踩坑记录） |
| [`docs/history/BUILD_RECEIPT.md`](docs/history/BUILD_RECEIPT.md) | 构建回执与验证证据 |

---

## 路线图

当前处于 v2 重制后的工程化阶段。优先级：**最佳工程奖 > 视觉 > 交互 > AI 技术应用**。

- [x] v2 重写：程序化 painterly 后期、室内剪影、惊喜事件、排行榜、个人记录
- [x] 开场引导剧情 + 教学教练标记
- [x] 抽出前后端共用的 AI 校验模块
- [x] 修复双层开场 / 慢 AI 卡死 / 后端死路由 / 限流内存泄漏
- [ ] 单元测试覆盖（目标 ≥ 20 例）
- [ ] ESLint + `@ts-check` 严格模式 + CI
- [ ] 部署脚本（含自动回滚）
- [ ] painterly 强化 + AI 生成笔触贴图
- [ ] 补充架构 / AI 管线 / 测试 / 部署文档

完整清单见 [`docs/OPTIMIZATION_CHECKLIST.md`](docs/OPTIMIZATION_CHECKLIST.md)。

---

## 免责声明

本作品是**治愈系解压小游戏**，不是心理治疗、心理干预或心理测评工具，
不构成医疗建议，也不能替代专业心理咨询或治疗。

---

## 许可

代码与本仓库内文档见 [`LICENSE`](LICENSE)。
素材来源与许可见 [`ASSET_LICENSES.md`](ASSET_LICENSES.md)。
