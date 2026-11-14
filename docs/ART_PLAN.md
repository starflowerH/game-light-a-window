---
name: art-plan
description: Art plan for Light A Window — how to reach the 卡通油画 (cartoon oil-paint) look with generated textures, the painterly shader, and optional Blender geometry
type: project
---

# 绘图计划 · 卡通油画视觉路线

> 目标风格：**卡通油画 / 水粉厚涂**（gouache），**明确不要**写实、**不要**科幻。
> 暖纸底色、可见墨线轮廓、柔和色彩晕染。治愈系，不是恐怖片。

---

## 一、为什么不是「先建模」

当前画面读起来像「干净的 3D 渲染」，而不是插画。原因**不是几何体太简单**，
而是**表面质感**问题。把宿舍楼建成带阳台栏杆、晾衣杆、空调外机的精细模型，
用 Blender 烘焙光照 —— 它依然是个写实 3D 渲染，离「卡通油画」很远。

因此视觉分三层，优先级由高到低：

| 层 | 手段 | 对「水墨油画」的贡献 | 成本 |
|---|---|---|---|
| L1 表面质感 | `painterly.js` 后期 + AI 生图笔触贴图 | **决定性** | 1-2 天 |
| L2 几何细节 | Blender 建模（轮廓、剪影） | 中（让画面不粗糙） | 1-2 天 |
| L3 光照 | 烘焙 lightmap / 顶点色 | 低 | 半天 |

**先做 L1。** L1 做完后再判断 L2 值不值得做。

---

## 二、L1-A：强化 painterly 后期（纯代码，0 credits）

文件：`src/painterly.js`

### 现状问题（实测截图确认）

描边、纸纹、晕染**肉眼几乎不可辨**。根因：

- `edge` 混合系数只有 `0.4`，且阈值 `smoothstep(0.12, 0.42, ...)` 太松 → 边缘不"抓"
- `paperBase = vec3(0.09, 0.075, 0.11)` → **偏冷偏黑**，暗部读起来像黑洞而不是水彩纸
- 纸纹幅度 `grain * 0.05` → 8bit 量化后基本被抹平
- **没有色阶断层**（代码注释里写了"太 subtle 避免 moiré"就放弃了）—— 而色阶断层正是水粉感的核心

### 改法

1. **描边加重**：`edge` 混合系数 `0.4 → 0.75+`，阈值收紧到 `smoothstep(0.20, 0.55, ...)`
2. **纸底改暖**：`paperBase` 改成米黄纸色 `vec3(0.93, 0.89, 0.80)`，叠加而不是压暗
3. **加柔和色阶断层**：保留中间调，2-3 档量化（**这是水粉感的命门**）
4. **纸纹加强 + 加纤维方向性噪声**（不是纯 fbm）

### 摩尔纹（moiré）怎么绕开

上一轮 agent 为了躲摩尔纹把描边调弱了 —— 方向错了。
正确做法是**换边缘检测源**：

- 用**深度/法线边缘**（需要多 pass 渲染，法线 pass + 深度 pass）
- 或者**低分辨率上采样**（把 Sobel 在 1/2 或 1/4 分辨率上算，再双线性放大）
- 再加上**时间抖动采样**（每帧偏移半个像素，噪声级消除条带）

这样能拿到清晰描边又不产生摩尔纹。

### 验收

截图对比必须"一眼看出是插画不是 3D 渲染"。

---

## 三、L1-B：AI 生图笔触贴图（8-10 张，约 50-100 credits）

### 关键原则：只生「贴图」，不生「场景图」

整场景 AI 图会和 3D 建筑**透视打架，必然穿帮**。
但**矩形贴图**贴在平面上，不参与 3D 透视 → 天然安全。

### 生图清单

| # | 内容 | 尺寸 | 用途 |
|---|---|---|---|
| 1-7 | 窗内室内剪影（书桌前的人 / 窗台绿萝 / 趴着的猫 / 晾着的衣服 / 落地灯 / 书架 / 两人聊天） | 1024x1024 | 替换 `scene.js` 里 `windowTexture()` 的程序化绘制 |
| 8 | 墙面笔触纹理（暖灰蓝，粗糙画布颗粒） | 1024x1024 | 贴到楼体表面，突破"干净 3D 感" |
| 9 | 地面/草地笔触 | 1024x1024 | 同上 |
| 10 | 夜空渐变（可选，若 4 套 palette 手绘成本太高则跳过） | 1024x1024 | 天空 |

### 提示词模板（已写好，直接用）

```
cartoon oil painting gouache texture, warm cream paper base,
visible soft brush strokes, no photorealism, no sci-fi, no hard digital edges,
cozy night campus dormitory, muted warm palette, flat illustrative shading
```

负面约束（每张都加）：`photorealistic, 3d render, sci-fi, neon, cyberpunk, glossy, metallic, text, watermark, signature`

### 落地方式

1. 图存 `public/textures/`
2. `scene.js` 里用 `THREE.TextureLoader` 加载，按窗口 `idx % 7` 分配剪影
3. **保留程序化贴图作为 fallback**（图加载失败时回退，不让游戏挂掉）
4. 明暗两态各生成一张，或用一张 + `emissive` 区分

### 风险控制

- 生成后**必须人工审图**，不合风格的不用
- 贴图分辨率 1024 已足够（窗户在屏幕上很小），不要生成 2048+（白烧 credits + 拖慢加载）
- 记录到 `ASSET_LICENSES.md`（项目内生成，无需署名，但需记录生成方式）

---

## 四、L2：Blender 几何体（可选，第 3 批）

环境**已就绪**并验证：

- `bpy` 4.2.17 LTS（Python 模块）：`/tmp/bpyenv/bin/python`
- 完整 Blender 4.5.12 LTS：`/home/xiaoyu/tools/blender-4.5.12-linux-x64/blender`
- 已有 skill：`~/.codebuddy/skills/blender-art/SKILL.md`
- 管线已跑通：`tools/blender/proof_of_concept.py` → GLB + PNG 预览

### 只补程序化做不出来的部分

| 元素 | 为什么程序化做不好 |
|---|---|
| 屋顶水塔 / 天线 / 晾衣绳剪影 | 增加轮廓层次，程序化难做自然曲线 |
| 楼体转角结构 | 增加体积感，避免"一个盒子" |
| 窗框凹凸 / 窗台投影 | 增加窗户的真实感 |

### 铁律

- **窗户必须独立命名**（`Window_Glass_r_c`），游戏要逐窗点击 + 独立发光控制
- 不重写命中检测：`scene.js` 的 `_onPointer` 逻辑保持
- 三角面 **< 60k**（当前 GLB 只有 960 面，余量充足）
- 导出后**必须渲染预览图看一眼**——能加载 ≠ 好看
- **脚本和产物一起提交 git**，资产是派生物，脚本才是源

---

## 五、L3：光照

- 现状：`painterly.js` 已有 `glowMask` 保护发光窗户不被描边压暗 —— 保留
- 若上 L2，再考虑烘焙 lightmap；不上 L2 则**不需要**，程序化光照够用

---

## 六、执行顺序与验收

```
L1-A  强化 painterly          1 天   0 credits   截图对比
  ↓
L1-B  生图 8-10 张贴图         2 天   50-100 credits   审图 + 接入
  ↓
L2    Blender 细节（可选）      1-2 天  0 credits   GLB + 预览图
  ↓
L3    光照烘焙（若上 L2 才做）  半天
```

每一步都必须**渲染/截图人工确认**，不靠"代码写了=做完了"。

---

## 七、与其他奖项的关系

| 奖项 | 视觉工作帮不帮 | 说明 |
|---|---|---|
| 最佳视觉设计奖 | **直接** | 卡通油画是评委会看的第一印象 |
| 最佳交互体验奖 | 间接 | 视觉爽感直接影响"爽"的观感 |
| 最佳工程奖 | **反向风险** | 视觉改动大 → 回归风险高，必须有测试兜底 |
| 最佳 AI 技术应用奖 | 中性 | 除非 AI 生成也用于美术管线并写进文档 |

⚠️ **重要**：视觉改动前必须先有单元测试和 CI 兜底（见 `docs/OPTIMIZATION_CHECKLIST.md` P1）。
否则改崩了无法回滚，工程奖和视觉奖同时丢。
