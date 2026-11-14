# 04 · 极致交互、流体尾翼特效、动态音效与 120FPS 零 GC 性能架构

> **关联模块**：`src/ribbon-trail.js`、`src/vfx-pool.js`、`src/audio-engine.js`、`src/scene.js`、`src/ui.js`、`src/style.css`  
> **设计目标**：打造**「即使静止挂机也像一幅会呼吸的活油画，一旦按下滑动便如丝绸般顺滑跟手」**的 60/120FPS 顶级交互体验。彻底根除 v2 中因频繁 DOM 重建、粒子 Geometry 动态分配与 Emoji 字体缺失导致的掉帧与粗糙感。

---

## 一、 静止画面的「活油画（Living Painting）」微动态系统

真正的顶级美术表现不仅在于点击瞬间，更在于**玩家不操作、静静看着屏幕时的生命力（Idle Micro-Dynamics）**。在 `src/scene.js` 中必须实现以下 5 层常驻微动态：

### 1.1 二阶弹簧阻尼 3D 镜头视差（Second-Order Spring Parallax）
- **交互源**：桌面端监听全局 `pointermove`（归一化坐标 $p_x, p_y \in [-1, 1]$）；移动端监听 `deviceorientation`（陀螺仪倾角限幅）或触摸拖拽偏移。
- **物理公式（Critically Damped Spring，帧率无关）**：
  设目标视差偏移为 $\vec{T} = (p_x \cdot 28.0, \, p_y \cdot 16.0)$，当前镜头附加位移为 $\vec{X}$，速度为 $\vec{V}$，刚度 $k = 18.0$，阻尼 $d = 8.5$：
  $$\vec{A} = k \cdot (\vec{T} - \vec{X}) - d \cdot \vec{V}$$
  $$\vec{V}_{t+\Delta t} = \vec{V}_t + \vec{A} \cdot \Delta t, \quad \vec{X}_{t+\Delta t} = \vec{X}_t + \vec{V}_{t+\Delta t} \cdot \Delta t$$
- **多层景深联动**：
  - 前景路灯与树枝（`z = +180`）移动系数 `+1.35`；
  - 宿舍楼主体（`z = 0`）作为视觉锚点；
  - 窗户内层 3D 视差人物剪影（`z = BD/2 + 1.5`）相对于外层窗框产生反向视差位移，让玩家轻轻晃动鼠标就能偷看到窗户深处的房间角落！

### 1.2 顶点着色器风场与摇曳树冠（Vertex Wind Sway）
- 改造 `_buildTrees()` 的材质（使用 `onBeforeCompile` 注入自定义顶点着色器或 `ShaderMaterial`）：
  $$\Delta x = \sin(\text{time} \cdot \omega_{\text{wind}} + \text{worldPos.x} \cdot 0.04 + \text{worldPos.y} \cdot 0.08) \cdot \text{windStrength} \cdot \max(0.0, \text{uv.y})$$
- 当天气为 `wind` 或 `tempo === 'brisk'` 时，$\text{windStrength}$ 平滑过渡至 `2.4`，树冠与屋顶晾衣绳上的床单随之产生温柔的波浪起伏。

### 1.3 路灯丁达尔体积光锥与盘旋飞蛾（Volumetric Light Cone & Moths）
- 在宿舍楼左前方（`x = -230, y = -140, z = 110`）立一盏复古暖铁艺校园路灯。
- 灯头下方挂载圆锥形体积光网格（`ConeGeometry(65, 160, 24, 1, true)`），使用自定义 Fresnel + 高度指数衰减 Shader，在雨夜和雾夜呈现迷人的暖琥珀丁达尔光束，光束内有 8 颗金色微粒做螺旋上升运动。

### 1.4 镜头玻璃动态雨滴折射（Screen-Space Raindrop Overlay）
- 当天气为 `light_rain` 时，`src/painterly.js` 后期 Shader 开启屏幕空间水滴通道：
  - 使用双层 Voronoi 网格计算屏幕玻璃上缓慢滑落的 12~18 颗水珠法线 $\vec{N}_{\text{drop}}$。
  - 水珠内部对背景画面做 `uv + N_drop.xy * 0.018` 的微折射采样，并叠加暖黄色窗户高光倒影，瞬间拉满雨夜隔窗看楼的沉浸感。

---

## 二、 动态拖动与「油画星尘流体尾翼」（`src/ribbon-trail.js`）

### 2.1 交互设计：丝滑一笔画光链（Fluid Ribbon Swipe）
玩家在屏幕上滑动（无论是桌面端鼠标按住拖动、甚至未按下时的轻柔星尘游标，还是移动端手指划过）时，绝不能只有干瘪的浏览器默认箭头，而是拖出一条**具有笔锋粗细变化、头部暖金发光、尾部化作油画星尘消散的动态流体尾翼**！

### 2.2 Catmull-Rom 样条几何丝带实现算法
新建 `src/ribbon-trail.js`，完全在 Canvas 2D 高刷特效层（或 WebGL 正交相机前景层）以 120FPS 零 GC 方式渲染：
1. **轨迹点环形缓冲区（Ring Buffer）**：
   - 预分配长度为 `48` 的固定结构体数组 `points[i] = { x, y, vx, vy, age, pressure, active }`，**运行期零对象分配**。
   - 每次 `pointermove` 时，若与上一点距离 `> 4px`，写入新采样点；若按下拖拽（`isDragging === true`），`pressure = 1.0`（宽金带，最大宽度 `22px`）；若仅移动鼠标（Hover），`pressure = 0.35`（细微光游丝，最大宽度 `7px`）。
2. **Catmull-Rom 平滑插值**：
   - 对相邻 4 个控制点 $P_{i-1}, P_i, P_{i+1}, P_{i+2}$ 进行张力 $\tau = 0.5$ 的 Catmull-Rom 样条细分（每段插值 4 个子点），彻底消除快速滑动时的折线棱角：
     $$C(t) = 0.5 \cdot \left[ (2P_1) + (-P_0 + P_2)t + (2P_0 - 5P_1 + 4P_2 - P_3)t^2 + (-P_0 + 3P_1 - 3P_2 + P_3)t^3 \right]$$
3. **笔锋宽度与色彩渐变**：
   - 宽度随生命周期 $u = 1 - \text{age}/\text{maxAge}$ 呈纺锤形水滴衰减：$W(u) = W_{\max} \cdot \sin(u^{\,0.6} \cdot \pi)$。
   - 拖拽经过 `GLIMMER` 窗户并成功点亮时，尾翼瞬间爆发一次**宽度 ×1.8 的金白高光脉冲**，并沿切线法向抛出 6 颗旋转的星尘微粒。

### 2.3 窗户磁吸悬停预判（Magnetic Hover & Snap）
- 当指针进入任意可交互窗户投影中心 `64px` 半径内时：
  1. 尾翼轨迹的末端控制点自动向窗户中心产生 `25%` 的柔和磁吸偏移（Magnetic Pull）；
  2. 目标窗户立即触发二阶弹簧放大（Scale 从 `1.0` 弹至 `1.10`），外框虚线环加速旋转；
  3. 桌面端游标自动变为发光的手绘星芒准星。

---

## 三、 点击特效与 120FPS 零 GC 环形粒子池（`src/vfx-pool.js`）

### 3.1 清理旧版性能毒瘤
在旧版 `src/scene.js` 的 `_burst(w)`（第 467~487 行）和 `shootingStar()` 中，每次点击窗户都会 `new THREE.BufferGeometry()`、`new THREE.PointsMaterial()` 并启动一个独立的 `requestAnimationFrame(anim)` 闭包，结束后再 `dispose()`。当玩家高速连击或一笔划过 6 扇窗时，会产生大量短命 WebGL Buffer 与 RAF 回调，导致明显的帧时间尖峰（Frame Time Spike）。

### 3.2 全局单 `InstancedBufferGeometry` 环形粒子池（Ring-Buffer GPU Particle Pool）
新建 `src/vfx-pool.js`，全场景所有爆发特效共用 **1 个 `THREE.Points`（或 `InstancedMesh`）**，最大容量 `MAX_PARTICLES = 1024`：
- **属性缓冲（TypedArrays 一次性分配）**：
  - `aOrigin` (`Float32Array(1024 * 3)`)：出生世界坐标
  - `aVelocity` (`Float32Array(1024 * 3)`)：初速度向量
  - `aColor` (`Float32Array(1024 * 3)`)：粒子 RGB 色值（支持暖金 `#ffd98a`、玫瑰粉 `#ff9eb5`、星青 `#8ae8ff`）
  - `aBirthAndLife` (`Float32Array(1024 * 2)`)：`x = birthTime`, `y = duration`
  - `aKindAndSize` (`Float32Array(1024 * 2)`)：`x = kind (0:颜料星火, 1:上升光羽, 2:星轨连线点)`, `y = baseSize`
- **O(1) 发射接口 `emitBurst(worldPos, color, count = 24, kind = 0)`**：
  - 仅移动环形游标 `this.cursor = (this.cursor + 1) % MAX_PARTICLES`，覆写对应下标的 TypedArray 数值并标记 `needsUpdate = true`。
  - **所有物理运动（重力下坠、空气阻力衰减、正弦横向飘移、尺寸与透明度曲线）100% 在 Vertex Shader 中根据 `uTime - aBirthAndLife.x` 实时计算**！CPU 每帧开销为 **0**！

### 3.3 五层复合点击打击感（5-Layer Juicy Tap Impact）
每次点亮窗户时，在 `< 16ms` 内同步触发：
1. **3D 窗户过冲回弹（Spring Pop）**：窗户网格缩放按 $S(t) = 1.0 + 0.28 \cdot e^{-6t} \cdot \cos(18t)$ 弹性震荡。
2. **GPU 粒子迸发**：调用 `vfxPool.emitBurst` 发射 20 颗暖金颜料星火 + 6 颗缓慢上升的羽毛光斑。
3. **双层油画水波纹（Dual Shockwave）**：内圈金色实线快扩环（`320ms`）+ 外圈柔光折射慢扩环（`580ms`）。
4. **连击镜头推拉与屏幕微呼吸**：当 `combo >= 8` 时，3D 相机 `fov` 产生 `-0.8°` 的瞬态呼吸向内聚焦（`fovImpulse`），随后按弹簧曲线平滑恢复，带来极强的节奏律动感且不晕眩。
5. **丝滑飘字与手账进度飞入**：得分飘字沿贝塞尔弧线向上微飘，若触发委托进度，一道小流光直接从窗户飞向左上角手账便签！

---

## 四、 高性能毛玻璃 UI 与 DOM 合成层优化（`src/ui.js` & `src/style.css`）

### 4.1 杜绝每帧 DOM 读写引发的 Layout Thrashing
- **旧版问题**：`src/game.js` 的 `_startTicker()` 在每帧（60~120 次/秒）调用 `this.ui.tick(this)`，无条件写 `textContent` 和 `style.width`；且 `_showCoach()` 每 200ms 调用 `hideCoach()` + `document.createElement('div')` 重建 DOM。
- **v3.0 铁律**：
  1. **脏值比对缓存（Dirty-Check Cache）**：`ui.tick()` 内部缓存上一帧的 `lastSec`、`lastWarmth`、`lastCombo`。只有当数值真正变化时才更新对应 DOM 节点！
  2. **进度条改用 `transform: scaleX()`**：将 `.warmbar i` 的宽度动画从触发 Layout 的 `width: XX%` 改为纯 GPU 合成层属性 `transform-origin: left center; transform: scaleX(var(--progress)); will-change: transform;`。
  3. **教学指引（Coach Mark）单实例复用**：只创建一次 `#coach` 元素，后续仅通过 `transform: translate3d(x, y, 0)` 更新位置，严禁在定时器里删建 DOM。

### 4.2 极致油画毛玻璃（Painterly Glassmorphism）视觉设计
- 所有浮层面板（标题卡、手账委托、微光抉择卡、结算与排行榜）采用**「双层磨砂暖琉璃 + 手绘金线内边框」**质感：
  ```css
  .glass-card {
    background: linear-gradient(155deg, rgba(28, 36, 62, 0.72) 0%, rgba(18, 22, 40, 0.84) 100%);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid rgba(255, 214, 150, 0.28);
    box-shadow:
      0 24px 64px rgba(4, 7, 18, 0.65),
      inset 0 1px 0 rgba(255, 244, 214, 0.22),
      inset 0 0 24px rgba(255, 190, 100, 0.06);
    transform: translateZ(0);
    will-change: transform, opacity;
  }
  ```
- **彻底消灭 Emoji 豆腐块**：右上角声音开关、暂停、手账折叠、API Key 状态、火漆印章全部使用**内联高精度手绘风 SVG 图标**！

---

## 五、 多声部自适应 WebAudio 交响合成引擎（`src/audio-engine.js`）

将音频逻辑从 `src/game.js` 独立抽离为 `src/audio-engine.js`，在不引入任何大体积外部 MP3 的前提下，纯靠 WebAudio DSP 合成商业级治愈音景：

| 声部层级 | 合成方式 | 动态交互联动机制 |
|---|---|---|
| **L1：天气环境底噪层** | 双通道粉红/布朗噪声 + 动态调制带通滤波器（BiquadFilter） | `light_rain`：模拟细密雨滴落在雨棚的沙沙声（中心频率 `850Hz`）；`wind`：LFO 正弦调制滤波器截止频率（`220Hz ~ 680Hz`），产生真实的晚风呼啸起伏 |
| **L2：温暖和弦 Pad 层** | 3 个微失谐（Detune `±6 cents`）正弦/三角波振荡器 + 低通包络，演奏大七和弦（Fmaj7 → G6 → Em7 → Am9） | **随当晚已点亮窗户数 `litCount` 动态渐入**！0~5 扇时仅听见雨风声；6~15 扇时温暖的电钢琴底音浮现；16~24 扇时加入高八度泛音，整栋楼越亮，背景音乐越丰满温暖 |
| **L3：五声音阶连击与刮奏层** | 模拟马林巴木琴（基频正弦 + 4倍频短促泛音击槌声）与竖琴泛音 | 单击按五声音阶（C5-D5-E5-G5-A5-C6-D6-E6）攀升；一笔画拖拽连亮时触发 `45ms` 间隔的琶音刮奏（Glissando） |
| **L4：住户专属微拟音彩蛋** | 程序化包络合成 | 点亮 `304 考研猫窗` 附带轻柔的猫咪呼噜滤波颤音；点亮 `301 关东煮窗` 附带温暖气泡咕嘟声；点亮 `205 广播窗` 附带电台调频微响；点亮 `406 天文窗` 附带风铃星音 |
