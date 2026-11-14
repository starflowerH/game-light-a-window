# 03 · 惊艳级卡通油画美术管线：多 Pass Shader、Blender 3D 与 AI 批量生图手册

> **关联模块**：`src/painterly.js`、`src/scene.js`、`src/postcard.js`、`tools/blender/build_campus_v3.py`  
> **视觉总目标**：彻底摆脱「塑料感基础几何体 3D」，打造**如《双城之战》背景画卷 / 绘本厚涂水粉（Gouache & Impasto Oil Painting）般一眼惊艳的动态立体画卷**。任何一帧截图都可直接当壁纸或明信片。

---

## 一、 为什么 v2 的画面不够惊艳？（视觉诊断）

1. **后期 Shader 太弱且算法单一**：现有 `src/painterly.js` 只是在全屏做了一个 `0.4` 权重的普通亮度 Sobel 加轻微噪声，既没有**油画笔触的色块凝聚感（Brushwork Clustering）**，也没有**画布纹路的受光凹凸感（Canvas Impasto Relief）**，暗部还偏冷偏黑。
2. **窗户是死板的二维平面**：现有 24 扇窗只是贴在 Box 表面的 `PlaneGeometry`，转动视角时毫无室内空间纵深，剪影也是静态死图。
3. **建筑缺乏微缩景观（Diorama）的生活细节与层次**：生成的 `art/dorm_facade.glb` 根本没有加载进 `src/scene.js`；场景缺少前景路灯体积光锥、近景随风摇曳的树枝框景（Framing）、窗台花盆与藤蔓、屋顶发光星轨与地面水洼反射。

---

## 二、 次世代 WebGL2 卡通油画后期管线（`src/painterly.js` 全面重写规格）

在 v3.0 中，`src/painterly.js` 升级为 **「Anisotropic Kuwahara（各向异性桑原滤波）+ 双通道手绘墨线 + Impasto 画布法线高光 + 水彩纸暖调晕染」四合一复合 ShaderPass**。

### 2.1 核心算法一：4-Sector Kuwahara 油画笔触滤波（消除数码感，凝聚厚涂色块）
- **原理**：桑原滤波（Kuwahara Filter）是实时非真实感渲染（NPR）中生成「手绘水粉/油画笔触色块」的黄金标准算法。它考察像素周围 4 个象限窗口（半径 `R = 2.5px`）的均值与方差，**取方差最小（颜色最均匀）的那个象限的均值作为输出颜色**。
- **效果**：能在抹平表面数码渐变噪点的同时，**把所有明暗交界线和物体边缘自动转译为干脆利落的厚涂刮刀笔触边缘**，且天然不会产生摩尔纹（Moiré）！
- **高光保护**：对亮度 `lum > 0.72` 的发光窗户核心区域降低滤波半径，保留窗内剪影的精细度。

### 2.2 核心算法二：法线/亮度多尺度手绘抖动墨线（Hand-Wobbled Ink Contours）
- 使用双频 FBM 噪声对采样 UV 进行手绘感微扰动：`vec2 brushUv = vUv + (fbm2(vUv * 18.0) - 0.5) * px * 1.6;`
- 在粗细两个尺度（`1.0 * px` 与 `2.2 * px`）计算梯度，阈值设定为 `smoothstep(0.16, 0.45, grad)`。
- **动态墨线着色（Colored Ink）**：绝不使用死黑墨线！墨线颜色根据局部色温动态混合**深群青（`#14182e`）**与**暖焦茶色（`#382214`）**，并在受月光/路灯照射的边缘泛出微妙的**暖金勾边（Rim Gold Ink）**。

### 2.3 核心算法三：Impasto 画布纹理法线高光与暖纸叠底（Canvas Relief & Warm Gouache Paper）
- **程序化交织亚麻画布纹理（Procedural Woven Linen & Watercolor Paper）**：
  - 在 Shader 内合成经纬交织的画布纤维高度场 $H(u,v) = \sin(u \cdot \omega_x)\cos(v \cdot \omega_y) \cdot 0.4 + \text{fbm}(uv \cdot 160.0) \cdot 0.6$。
  - 通过有限差分计算画布表面微法线 $\vec{N}_{\text{canvas}} = \text{normalize}(\vec{3}(\partial_x H, \partial_y H, 1.0))$，与虚拟斜射画室光源 $\vec{L} = \text{normalize}(vec3(-0.5, 0.7, 0.5))$ 点乘，在厚涂亮部产生**真实的油画颜料凸起高光（Impasto Specular Grazing）**！
- **水粉暖纸暗部托底（Warm Paper Undertone）**：
  - 将暗部托底色从原有的冷黑改为**温润复古羊皮暖灰蓝**与**米黄画纸底色**混合，配合水彩边缘沉淀（Edge Darkening / Pigment Pooling），让夜空像涂在纹理纸上的普鲁士蓝水粉。

### 2.4 `src/painterly.js` 完整 GLSL 核心片段参考（执行模型需完整实现）
```glsl
// 4-Sector Kuwahara Painterly Filter + Impasto Canvas Relief + Colored Ink
vec3 kuwahara(sampler2D tex, vec2 uv, vec2 px, float radius) {
  vec3 mean[4];
  vec3 sq[4];
  for (int k = 0; k < 4; k++) { mean[k] = vec3(0.0); sq[k] = vec3(0.0); }
  
  vec2 offsets[4];
  offsets[0] = vec2(-1.0, -1.0);
  offsets[1] = vec2( 0.0, -1.0);
  offsets[2] = vec2(-1.0,  0.0);
  offsets[3] = vec2( 0.0,  0.0);

  for (int k = 0; k < 4; k++) {
    for (int j = 0; j <= 1; j++) {
      for (int i = 0; i <= 1; i++) {
        vec2 sampleOffset = (offsets[k] + vec2(float(i), float(j))) * px * radius;
        vec3 c = texture2D(tex, uv + sampleOffset).rgb;
        mean[k] += c;
        sq[k] += c * c;
      }
    }
    mean[k] /= 4.0;
    sq[k] = abs(sq[k] / 4.0 - mean[k] * mean[k]);
  }

  float minVar = 1e6;
  vec3 best = mean[0];
  for (int k = 0; k < 4; k++) {
    float v = sq[k].r + sq[k].g + sq[k].b;
    if (v < minVar) { minVar = v; best = mean[k]; }
  }
  return best;
}
```

---

## 三、 3D 视差室内景深盒（Parallax Interior Window Box）与微缩场景升级

### 3.1 告别扁平贴图：每扇窗都是一个微缩 3D 剧场
在 `src/scene.js` 中，将每扇窗重构为**三层空间视差结构（3-Layer Parallax Window）**：
1. **外层：手绘木质窗框与反光玻璃层（`z = BD/2 + 4.5`）**
   - 渲染十字窗棂、半透窗帘褶皱、以及雨夜模式下的动态滑落雨滴高光。
2. **中层：动态角色/生活剪影层（`z = BD/2 + 1.5`）**
   - 独立平面或 Shader 深度偏移（Interior Mapping UV Offset），距离外层玻璃有真实的 `3.0` 单位深度差！當镜头随鼠标/陀螺仪轻微摆动时，**窗框与室内的考研学姐、橘猫、天文望远镜产生立体的前後视差位移**！
   - **剪影微动画（Living Silhouettes）**：`windowTexture` 支持按角色与抉择状态动态重绘，且通过材质 UV 微扰动让窗内台灯光圈呼吸、热茶冒出袅袅蒸汽、猫咪尾巴轻轻摆动。
3. **底层：暖色油画房间背板层（`z = BD/2 - 1.5`）**
   - 呈现书架、挂画、暖黄墙壁的厚涂背景渐变。

### 3.2 5 态窗户在 3D 场景中的高辨识度视觉特效
- **`GLIMMER`（微光待点亮）**：窗户周围增加一个**手绘油画笔触旋转光环（Rotating Brush Halo Sprite）**，配合呼吸缩放，让玩家在 0.1 秒内一眼锁定可点窗户。
- **`STORY_BEACON`（叙事信标窗）**：窗户上方浮现一枚**金色悬浮信封/星芒徽章**，窗框散发温暖的琥珀色脉冲波。
- **`RESONANCE_PAIR`（跨窗共鸣对）**：两扇共鸣窗之间自动架起一条由粒子组成的**动态呼吸虚线弧桥（Arcing Star-Thread）**，直观引导玩家用手指沿着弧桥一笔划过！

### 3.3 校园微缩立体画卷（Diorama）构图升级
在 `src/scene.js` 中补齐以下极具氛围感的 3D 框景元素：
1. **前景左下方：复古暖黄校园路灯 + 体积光锥（Volumetric Light Cone）**
   - 使用自定义半透明渐变 `ConeGeometry`（AdditiveBlending + Fresnel 边缘衰减），路灯光束在雨雾中清晰可见，飞蛾与萤火虫在光锥内盘旋。
2. **一楼宿管门厅与温馨黑板报**：
   - 102 室旁边的一楼门厅新增暖光小黑板（写着「天冷加衣 · 晚归留灯」手绘纹理）、停靠的复古二八单车与几盆错落的盆栽。
3. **天台星空剧场（供结局 C 镜头拉升专用）**：
   - 在屋顶栏杆内构建水塔、晾衣绳（随风轻轻起伏的床单）、天文望远镜小台与蹲坐的黑猫。当触发 `ENDING_C_STARGAZER` 时，相机沿平滑三次贝塞尔曲线推上天台，仰望满天星河。

---

## 四、 Blender 自动化建模升级脚本（`tools/blender/build_campus_v3.py`）

保留并升级 Blender Python 无头管线，让 `tools/blender/build_campus_v3.py` 生成包含以下规范命名节点的 GLB 模型（`public/models/dorm_v3.glb`），并在 `src/scene.js` 中支持通过 `GLTFLoader` 加载（同时保留高精程序化几何体作为无缝同步兜底）：
- 严格命名 24 扇独立窗户玻璃网格：`Window_Glass_0_0` 至 `Window_Glass_3_5`，确保 `Raycaster` 点击检测与程序化窗户 100% 兼容。
- 增加倒角修饰器（Bevel Modifier）与顶点色烘焙（Vertex Color AO），赋予建筑边缘柔和的手绘圆润感，消除生硬的 90 度数码直角。

---

## 五、 AI 批量生图资产清单与完整提示词手册（Batch ImageGen Prompts）

> **给开发者的协同说明**：  
> 代码层面，我们将内置一套**超高精度的 Canvas 2D 厚涂笔触程序化纹理生成器（Procedural Impasto Texture Generator）**，确保**不依赖任何外部图片也能直接跑出惊艳的油画质感**！  
> 同时，如果你希望画面细节达到商业插画级巅峰，可以使用 Midjourney v6 / Flux.1 / 即梦 / Nano Banana 按以下 **36 张标准化批量提示词**生成 WebP 贴图放入 `public/textures/`，引擎会自动检测并优先加载这些高清手绘贴图！

### 5.1 全局风格前缀与负面词（所有生图统一附带）
- **Style Prefix (正向风格锁)**：
  `thick gouache and impasto oil painting illustration, visible palette knife and bristle brush strokes, warm cream watercolor paper texture bleed through, cozy Chinese university campus night atmosphere, Studio Ghibli and Arcane inspired stylized painterly background art, rich Prussian blue and warm amber gold contrast, soft hand-drawn ink outlines --no text, watermark, signature, photorealistic, 3d render, sci-fi, cyberpunk, neon, sharp digital vector edges`
- **Negative Prompt (负面约束)**：
  `photorealistic, 3D CGI, Unreal Engine, glossy plastic, neon cyberpunk, horror, gloomy, messy clutter, text, letters, watermark, blurry, deformed`

### 5.2 批量生图清单（共 36 张，按目录分类）

#### A 组：基础画布与表面笔触贴图（`public/textures/surfaces/`，共 4 张，尺寸 `1024×1024` 无缝 Seamless `--tile`）

| 序号 | 文件名 | 用途 | 专属英文 Prompt（拼接在 Style Prefix 前） |
|---|---|---|---|
| 01 | `canvas_impasto_normal.webp` | 全局油画刮刀笔触与亚麻画布凹凸纹 | `seamless tileable texture of thick oil paint brush strokes on coarse linen canvas, subtle directional palette knife ridges, neutral warm beige gray surface, flat lighting --tile` |
| 02 | `wall_brick_gouache.webp` | 17号宿舍楼外墙手绘红砖与暖灰砂浆贴图 | `seamless tileable hand-painted gouache texture of weathered vintage university dormitory wall, muted terracotta brick and warm slate blue plaster with painterly brush marks --tile` |
| 03 | `roof_tiles_gouache.webp` | 屋顶瓦片与天台地面手绘纹理 | `seamless tileable hand-painted oil texture of dark indigo night roof tiles with subtle moss green and warm moonlight rim brush strokes --tile` |
| 04 | `ground_wet_stone.webp` | 雨夜宿舍楼前反光石板路与落叶纹理 | `seamless tileable hand-painted gouache texture of wet campus cobblestone path at night, subtle puddle reflections of warm yellow window light and fallen ginkgo leaves --tile` |

#### B 组：6 大常驻核心住户窗内厚涂小景（`public/textures/windows/`，共 12 张：每户初见态 + 演进态，尺寸 `512×512`）

| 序号 | 文件名 | 对应房号与状态 | 专属英文 Prompt |
|---|---|---|---|
| 05 | `win_102_a.webp` | 102 宿管室（初见：核对名单与热茶） | `close-up square view through a warm wooden dormitory window frame at night: a cozy ground-floor duty room, an enamel mug steaming with hot jujube tea, vintage reading glasses, a brass key ring hanging on hook, warm amber desk lamp glow` |
| 06 | `win_102_b.webp` | 102 宿管室（演进：门廊黄伞与收音机） | `close-up square view through a warm wooden window at night: a cozy duty room with a vintage radio playing softly, a bright yellow umbrella leaning by the warm doorway, steaming thermos pot, peaceful oil painting` |
| 07 | `win_203_a.webp` | 203 插画生（初见：画架与窗台绿萝） | `close-up square view through a dormitory window at night: a wooden easel with sketchbook, scattered colored pencils, a small green pothos plant on the windowsill with a fresh leaf, warm golden lamp light` |
| 08 | `win_203_b.webp` | 203 插画生（演进：画完的发光宿舍画作） | `close-up square view through a dormitory window at night: an easel displaying a finished glowing painting of a night dormitory, a warm glass of milk beside a lush green pothos plant on the sill` |
| 09 | `win_205_a.webp` | 205 广播站（初见：复古麦克风与耳机） | `close-up square view through a dormitory window at night: a student desk with a vintage broadcast microphone, over-ear headphones glowing softly, a stack of handwritten postcards, warm amber light against blue night` |
| 10 | `win_205_b.webp` | 205 广播站（演进：折纸船与声波星光） | `close-up square view through a dormitory window at night: vintage microphone and headphones on desk, a delicate origami paper boat resting on the windowsill, warm golden musical dust floating in the air` |
| 11 | `win_301_a.webp` | 301 夜宵室（初见：小电锅关东煮） | `close-up square view through a dormitory window at night: a small boiling mini hotpot with oden skewers on a dorm table, warm white steam rising onto the glass, white sneakers drying on the balcony rail` |
| 12 | `win_301_b.webp` | 301 夜宵室（演进：一排碰杯的马克杯） | `close-up square view through a dormitory window at night: four colorful ceramic mugs clinking together on a small dorm table surrounded by warm fairy lights and happy steam` |
| 13 | `win_304_a.webp` | 304 考研窗（初见：书堆与窗外橘猫） | `close-up square view through a dormitory window at night: stacks of study books under a warm desk lamp, a fluffy ginger tabby cat peeking in from outside the half-open windowsill in light rain` |
| 14 | `win_304_b.webp` | 304 考研窗（演进：橘猫趴在笔记上睡觉） | `close-up square view through a dormitory window at night: a fluffy ginger cat curled up asleep right next to an open notebook under a warm golden desk lamp, a cup of hot milk steaming nearby` |
| 15 | `win_406_a.webp` | 406 天文窗（初见：望远镜对准夜空） | `close-up square view through a top-floor dormitory window at night: a brass astronomical telescope pointing out toward the starry night sky, a star chart unfolded on the sill, warm flashlight glow` |
| 16 | `win_406_b.webp` | 406 天文窗（演进：流星倒影与天台猫） | `close-up square view through a top-floor dormitory window at night: a brass telescope reflecting a bright shooting star in its lens, a black cat sitting on the windowsill looking up at the cosmos` |

#### C 组：6 大结局专属明信片主视觉插画（`public/textures/postcards/`，共 6 张，尺寸 `1080×800` 横向插画区）

| 序号 | 文件名 | 对应结局 | 专属英文 Prompt |
|---|---|---|---|
| 17 | `ending_a_warmth.webp` | 结局 A · 万家灯火 | `wide gouache oil painting of a 4-story university dormitory building at night with all 24 windows glowing warm golden amber, paper lanterns floating into the starry sky, warm reflection on wet ground` |
| 18 | `ending_b_companion.webp` | 结局 B · 留一盏夜灯 | `intimate gouache oil painting of a quiet rainy dormitory window at night with a ginger cat and green plant glowing warmly while golden fireflies dance in the misty lilac rain outside` |
| 19 | `ending_c_stargazer.webp` | 结局 C · 屋顶的银河 IF | `breathtaking gouache oil painting of a university dormitory rooftop at night, a water tower, a telescope, a black cat silhouette, and a magnificent golden and indigo Milky Way with shooting stars overhead` |
| 20 | `ending_d_harmony.webp` | 结局 D · 晚风大合唱 IF | `magical gouache oil painting of a night dormitory facade where glowing golden constellation ribbons of light connect window to window like musical staves in the autumn breeze` |
| 21 | `ending_e_dawn.webp` | 结局 E · 破晓第一缕光 | `stunning gouache oil painting of a university dormitory at daybreak, the sky transitioning from deep night blue to warm peach and rose gold sunrise, morning mist over distant hills, warm porch light` |
| 22 | `ending_f_drift.webp` | 结局 F · 未完的草稿 | `serene minimalist gouache oil painting of a sleeping dormitory building under a gentle crescent moon, only three soft amber windows lit in the calm indigo night, peaceful and unhurried` |

#### D 组：14 枚收集信物手绘油画徽章（`public/textures/items/`，共 14 张，尺寸 `256×256` 奶油底圆章）
- 包含：`item_tea.webp`（搪瓷茶缸）、`item_keys.webp`（黄铜钥匙）、`item_pothos.webp`（窗台绿萝）、`item_sketchbook.webp`（手绘速写本）、`item_headphones.webp`（旧耳麦）、`item_paperboat.webp`（折纸船）、`item_oden.webp`（关东煮）、`item_sneakers.webp`（白球鞋）、`item_cat.webp`（橘猫胡须）、`item_lamp.webp`（旧台灯）、`item_telescope.webp`（黄铜星图）、`item_umbrella.webp`（楼下黄伞）、`item_bell.webp`（闭馆铃）、`item_moon.webp`（半块月亮）。
- **设计说明**：在 `src/ui.js` 与 `src/postcard.js` 中，优先尝试加载上述图片；若未放置外部图片，则调用 `drawProceduralItemBadge(canvas, itemId)` 用 Canvas 2D 厚涂笔触绘制精致的手绘矢量油画徽章，**绝不直接裸露丑陋的系统默认 Emoji 豆腐块**！
