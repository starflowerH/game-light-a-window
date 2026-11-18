# 05 · v4.0 分阶段施工手册（Execution Playbook）与 Blender MCP 协同指南

> **执行说明**：本计划基于仓库当前 `v3.0.0`（`69dd50d`）进行增量重制升级。建议优先完成 **Phase 1（Blender 建模与 3D 场景加载修复）**，再按 Phase 2 → Phase 6 顺序推进。

---

## Phase 1：Blender MCP 实景建模 4 栋宿舍楼 & 打通 GLB 真加载

- **目标**：彻底替换 `src/scene.js` 中硬编码的 `BoxGeometry` 方盒，让游戏真正跑起 Blender 制作的高品质微缩建筑。
- **施工内容**：
  1. 在 `tools/blender/build_campus_v4.py`（并可通过 Blender MCP 实时调优与截图检查）构建 4 栋独立建筑并导出至 `public/models/`：
     - `dorm_highschool.glb`（3×6 = 18 窗，红砖坡屋顶 + 黑板报 + 单车棚）
     - `dorm_university.glb`（4×6 = 24 窗，外廊立柱 + 晾衣架 + 空调 + 猫窝）
     - `dorm_grad.glb`（5×6 = 30 窗，现代石材 + 玻璃阳台 + 顶楼温室花房 + 银杏树）
     - `dorm_staff.glb`（3×4 = 12 宽窗，木梁斜瓦顶 + 爬山虎 + 烟囱 + 庭院石桌）
     - 外加校园共用地块 `campus_grounds.glb`（林荫石板大道、草坪、围墙、远景邻楼占位轮廓、路灯底座）。
  2. 使用 `gltf-transform optimize` 优化压缩每份 GLB（总模型体积控制在 `3MB` 以内）。
  3. 改造 `src/scene.js` 引入 `GLTFLoader`（`three/examples/jsm/loaders/GLTFLoader.js`），按 `Window_Glass_<r>_<c>` 动态绑定每扇窗的 3 层视差内景盒与发光材质。
- **验收标准**：浏览器打开可直观看到立体砖瓦、屋檐倒角、走廊柱子与真实地面阴影，24/18/30/12 扇窗点击射线检测 100% 精准。

---

## Phase 2：星露谷 3D 材质调优、四季系统、真体积雾与 4 视角切楼动效

- **目标**：实现用户强调的「偏 3D 星露谷像素油画风」「真实的雾天/雨天/雪天/风天」「切换宿舍楼动效」「4 机位视角切换」。
- **施工内容**：
  1. 重写/微调 `src/painterly.js` 与 `src/textures-procedural.js`：
     - 新增程序化 **像素油画风砖墙/瓦片/木头/石板漫反射 + 法线贴图生成器**；
     - 降低 Kuwahara 涂抹模糊半径至 `0.95`，保留像素纹理锐利度与立体光照层次。
  2. **彻底重建天气与四季渲染器**：
     - **真雾夜**：删除旧版 `this.snow.visible = true` 的假雾逻辑！构建 8 层流动 FBM 体积雾带平面 + 路灯/亮窗 Mie 大散射光晕。
     - **真雨夜**：在地面材质中加入同心圆水洼涟漪 Shader（`uRainRipples`）并降低湿润粗糙度。
     - **四季系统**：`applySeason('spring' | 'summer' | 'autumn' | 'winter')` 动态切换树冠着色、落樱/萤火虫/落枫/雪花粒子，以及冬季屋檐窗台积雪 Mesh 的显示。
  3. **切楼航拍动效 & 多视角系统**：
     - `switchDorm(dormType)` 触发 1.4s 跨林荫道平滑贝塞尔飞掠动画；
     - 引入 `OrbitControls`（限制俯仰角与缩放范围防止穿帮）并内置 4 个一键视角预设按钮（正面 / 星露谷 45° 俯瞰 / 街景仰视 / 天台航拍）。

---

## Phase 3：开场启动动画、具名角色立绘系统与天气动态换装

- **目标**：补全有血有肉的角色群像、启动舞台与天气换装视觉反馈。
- **施工内容**：
  1. 新建 `src/npc-portraits.js`：为 `林阿姨`、`周副校长`、`王师傅` 及 5 位住户构建**分层矢量像素油画立绘生成器**，支持传入 `(roleId, weather, season)` 实时渲染晴天短袖、雨天雨衣打伞、雾天风衣手电、秋日围巾毛衣、冬日羽绒服棉帽哈气 5 套差分装扮！
  2. 同步在 3D 宿舍楼门口放置 1~2 个随天气换装的 Q 版 3D 巡逻 NPC 小人偶（如雨天撑黄伞、冬天戴红围巾）。
  3. 新建 `src/dialogue.js` 与启动舞台流程：打开页面先播放 3D 活校园环绕巡航 +「进入校园夜巡」大按钮 → 点击后播放 2.8s 林荫道推镜动画 → 触发宿管阿姨与校领导双人立绘开场对话 → 平滑进入校园值班台。

---

## Phase 4：4 大目标性益智/解压小游戏核心引擎与随机事件系统

- **目标**：上线 4 款并列可玩的小游戏与 10 大随机事件。
- **施工内容**：
  1. 新建 `src/minigames/` 模块目录（全部保持纯逻辑与渲染解耦，便于单元测试）：
     - `memory-patrol.js`：**记忆熄灯（依次顺序 / 同时快照双模式）**、Level 1~15+ 数学递进参数、准确率/顺序完美度计算、护盾机制。
     - `dorm-reflex.js`：**查寝夜猫子**（违规蓝紫闪屏 vs 合规学习暖灯 vs 晚归门灯三态高速刷新）。
     - `lights-out.js`：**全楼归眠（十字翻转解谜）** + 内置 $GF(2)$ 线性代数求解器（保证 100% 可解并提供「宿管求助提示一步」）。
     - `star-sweep.js`：保留并兼容升级原有的 5 态一笔画光链解压模式。
  2. 新建 `src/random-events.js`：实现 10 大随机事件调度与玩法 Hook（校领导双倍分、宿管热茶回血、电工跳闸延长时间、橘猫自动点亮一扇窗等）。

---

## Phase 5：显性 AI 智能体增强与多维精确排名后端升级

- **目标**：大幅提升 AI 存在感，升级 SQLite 排行与随机昵称。
- **施工内容**：
  1. 扩展 `shared/ai-prompts.js` 与 `shared/ai-schema.js`：增加 `DIALOGUE`（开场与切楼对话）、`PUZZLE`（AI 语义灯光阵型生成，如心形/北斗七星）、`DEBRIEF`（赛后校领导/宿管针对准确率与失误点的定制化点评）。
  2. 在 `src/ui.js` 新增实时「AI 校园电台信号指示器」与赛后「AI 复盘评语信纸」。
  3. 升级 `server/db.js` 与 `server/index.js`：
     - `runs` 表平滑扩容 `game_mode`、`dorm_type`、`season`、`weather`、`stage_reached`、`correct_count`、`accuracy_pct`、`score` 字段；
     - `GET /api/leaderboard` 返回精确的 `myRank`（当前排名、总人数、百分位、距上一名分差）；
     - 前端未填昵称时自动调用 `generateCampusNickname()` 生成趣味校园昵称。

---

## Phase 6：全量测试覆盖、文档更新与 `hynu.site` 上线验收

- **施工内容**：
  1. 补充单元测试覆盖：记忆模式顺序/快照准确率计算、$GF(2)$ 熄灯解谜求解器 100% 可解性、随机昵称、排行榜 `myRank` 精准名次计算、4 栋楼房号映射。
  2. 运行 `npm run verify`（ESLint + TypeScript `checkJs` + Vitest + Vite Build）必须 0 Error 0 Warning 全绿通过。
  3. 使用 **Chrome DevTools / Playwright** 实机验证 4 栋楼切换动效、真体积雾与雨雪四季效果、4 款小游戏完整闭环、移动端适配，确认无任何 WebGL 报错与内存泄漏后部署至 `https://hynu.site`。

---

## 附：给执行模型的 v4.0 启动指令（若交由其他执行模型推进）

```text
请阅读本仓库 `docs/v4_plan/` 目录下的全部 6 份规格书（`00_V4_VISION_AND_ARCHITECTURE.md` 至 `05_EXECUTION_PLAYBOOK_V4.md`），基于当前 v3.0 代码基线执行 v4.0 全面升级。

关键铁律：
1. 必须彻底修复 `src/scene.js` 未加载 GLB 模型的问题，4 栋差异化宿舍楼必须通过 `GLTFLoader` 真实加载并支持切换运镜动效与 4 视角观察。
2. 必须彻底删除 `setWeatherFx('fog')` 借用雪花粒子的假雾代码，按 `03` 卷实现多层滚动 FBM 体积雾带 + 光源米氏散射。
3. 风格遵循「星露谷 3D 像素油画微缩写实风」：清晰砖瓦木纹法线 + 真实阴影 + 适度微笔触后期，不能糊成一团。
4. 4 款小游戏（记忆依次/同时熄灯、查寝夜猫子、全楼归眠 GF(2) 解谜、星轨一笔画）与 NPC 天气换装对话、随机昵称及精准定位排行榜必须全部完整闭环，无 stub/TODO。
5. 所有 Git 提交保持 `user.name = starflowerH`, `user.email = codel323529@163.com`，每阶段运行 `npm run verify` 全绿通过。
```
