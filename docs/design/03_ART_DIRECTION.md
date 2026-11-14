# 美术方向：卡通油画校园夜景

> 风格关键词：厚涂、暖光、安静、校园、手绘感、非写实、非科幻  
> 目标：一眼温暖，适合截图和明信片，适合 2.5D 分层实现

---

## 1. 视觉目标

### 1.1 一句话

> 像一幅会亮起来的校园夜景油画。  
> 不是赛博霓虹，不是写实渲染，不是低多边形游戏。

### 1.2 参考方向（描述，不复制具体作品）

- 厚涂油画笔触
- 边缘略柔，不锐利
- 暖黄窗光 + 深蓝夜空
- 树影、雨痕、雾气
- 手写体短句
- 纸张/画布纹理
- 明信片质感

### 1.3 明确避免

- 写实 3D 渲染
- 赛博朋克/霓虹
- 高饱和渐变
- 通用圆角白卡 UI
- 恐怖、压抑、阴森
- 过度粒子特效
- 通用 AI 插画塑料感

---

## 2. 色彩系统

### 2.1 主色板

| 名称 | HEX | 用途 |
|---|---|---|
| 夜蓝 | `#1B2A4A` | 天空、阴影 |
| 深蓝 | `#243B63` | 建筑暗部 |
| 暖黄 | `#F2C46D` | 窗光、重点 |
| 琥珀 | `#E89B4C` | 光圈、按钮 |
| 雾紫 | `#8E86A8` | 雾天、远山 |
| 奶油 | `#F7EBD2` | 文字、明信片底 |
| 苔绿 | `#6E8B74` | 树影、植物 |
| 砖红 | `#A65C4E` | 屋顶、砖墙 |

### 2.2 夜晚配色

| 夜晚 | 主色 | 辅色 | 情绪 |
|---|---|---|---|
| 1 小雨 | 夜蓝 + 琥珀 | 雨痕冷光 | 安静、慢 |
| 2 有风 | 深蓝 + 苔绿 | 树影摇动 | 清爽、轻快 |
| 3 晴天 | 深蓝 + 暖黄 | 星星、窗光 | 温暖、收束 |

### 2.3 对比规则

- 窗户亮起必须明显
- 暗窗与亮窗亮度差 ≥ 3:1
- 文字与背景对比 ≥ 4.5:1
- 不使用纯黑 `#000`
- 不使用纯白大面积

---

## 3. 画面构成

### 3.1 场景层

```text
Layer 7  明信片文字 / UI
Layer 6  前景树影 / 雨丝 / 雾
Layer 5  窗户光晕 / 粒子 / 光链
Layer 4  宿舍楼（24 扇窗）
Layer 3  中景树 / 路灯 / 操场
Layer 2  远景楼 / 山 / 天空
Layer 1  画布底纹 / 纸张颗粒
```

### 3.2 宿舍楼

- 4 层 × 6 列
- 屋顶略歪，手绘感
- 墙面有笔触
- 窗框深色
- 每扇窗有独立小细节：
  - 绿萝
  - 白球鞋
  - 台灯
  - 泡面
  - 吉他
  - 猫
  - 书堆
  - 晾衣架
- 细节只在点亮时出现，不增加首页负担

### 3.3 窗户状态视觉

| 状态 | 视觉 |
|---|---|
| dark | 深蓝，微反光 |
| glow | 暖黄呼吸光，边缘柔 |
| lit | 明亮暖光 + 小物件剪影 |
| story | 金色边框 + 小图标 + 轻微光晕 |

### 3.4 天气视觉

| 天气 | 表现 |
|---|---|
| clear | 星星、月亮、清晰树影 |
| light_rain | 细线雨、窗面水痕、地面积水反光 |
| fog | 半透明雾层、远处变淡 |
| wind | 树影摆动、云移动、粒子斜飞 |

---

## 4. UI 风格

### 4.1 原则

- 像画布上的标签，不像科技 HUD
- 圆角但不过度
- 奶油纸色底
- 手写体标题
- 细线边框
- 柔和阴影

### 4.2 字体

- 标题：手写感中文字体（需授权）
- 正文：思源黑体 / Noto Sans SC
- 数字：圆润无衬线
- 备选：站酷快乐体（需确认授权）

### 4.3 UI 元素

- 温暖值：一条手绘光带
- 连击：手写数字 + 小光点
- 天气：小图标 + 两个字
- 声音：小喇叭
- 暂停：两条短线

---

## 5. 动效

### 5.1 必须

- 窗户点亮：120ms 亮起 + 300ms 光晕
- 连击：数字轻微弹跳
- 光链：沿窗户顺序流动
- 故事窗：金色边框呼吸
- 全楼亮起：2 秒柔和波浪
- 明信片：淡入 + 纸张纹理

### 5.2 避免

- 屏幕震动
- 高频闪烁
- 红闪
- 过度粒子
- 快速缩放

### 5.3 可关闭

- 提供“减少动画”选项
- 关闭后保留状态变化，减少粒子

---

## 6. 明信片设计

### 6.1 尺寸

- 1080×1440
- 竖版
- 3:4

### 6.2 构成

```text
┌──────────────────────┐
│  卡通油画夜景          │
│  24 扇窗，亮着的几扇   │
│                      │
│  日期                 │
│  一句短句             │
│  小物件图标            │
│  角落小签名            │
└──────────────────────┘
```

### 6.3 文案位置

- 底部 1/4
- 奶油色纸面
- 手写体
- 最多 2 行

---

## 7. AI 生图提示词

### 7.1 主场景

```text
Use case: stylized-concept
Asset type: game background for a cozy campus night game
Primary request: a hand-painted oil painting style illustration of a small Chinese university dormitory building at night, 4 floors, 6 columns of windows, most windows dark, a few warm glowing windows, soft rain, trees, campus path, no people, no text
Style/medium: thick oil paint, visible brush strokes, storybook illustration, soft edges, warm and calm
Composition/framing: wide 16:9, building centered, negative space at top for UI, foreground trees framing the scene
Lighting/mood: warm amber window light against deep blue night, gentle and safe, not gloomy
Color palette: deep navy blue, warm amber, cream, moss green, muted brick red
Materials/textures: canvas texture, impasto brush strokes, soft paper grain
Constraints: no text, no logo, no watermark, no photorealism, no sci-fi, no neon, no horror
Avoid: photorealistic, 3D render, cyberpunk, neon, high saturation, creepy, empty black void
```

### 7.2 故事窗小景

```text
Use case: illustration-story
Asset type: small inset illustration for a window in a cozy game
Primary request: a tiny warm scene inside a dormitory window: a green plant on the windowsill, a desk lamp, a half-open book, soft rain outside
Style/medium: hand-painted oil painting, thick brush strokes, storybook, warm and intimate
Composition/framing: square, close-up, window frame visible
Lighting/mood: warm lamp light, calm, slightly tired but safe
Color palette: amber, cream, deep blue, moss green
Constraints: no text, no people, no logo, no watermark, no photorealism
Avoid: sci-fi, neon, horror, clutter
```

### 7.3 明信片背景

```text
Use case: illustration-story
Asset type: postcard background for a cozy game
Primary request: a hand-painted oil painting of a quiet campus at night after light rain, a dormitory building with warm windows, trees, wet path reflecting light, no people, no text
Style/medium: thick oil paint, storybook, soft brush strokes, paper texture
Composition/framing: vertical 3:4, building in middle, space at bottom for handwritten text
Lighting/mood: warm, quiet, safe, slightly nostalgic
Color palette: deep blue, amber, cream, moss green
Constraints: no text, no logo, no watermark, no photorealism, no sci-fi
Avoid: neon, cyberpunk, horror, high saturation
```

### 7.4 图标

```text
Use case: stylized-concept
Asset type: small game icon, transparent background
Primary request: a tiny hand-painted oil illustration of [object], storybook style, simple silhouette, warm light
Style/medium: thick oil paint, soft edges, small scale readable
Constraints: transparent background, no text, no watermark, no photorealism
```

---

## 8. 开源素材

### 8.1 已核验可用的 CC0 来源

| 来源 | 许可 | 用途 |
|---|---|---|
| Kenney UI Pack | CC0 | UI 边框、按钮、图标 |
| Poly Haven | CC0 | 环境贴图、HDR、纹理 |
| Quaternius | 需逐项核验 | 低模道具（如需要） |
| Freesound | 需逐项核验 | 音效 |
| OpenGameArt | 需逐项核验 | 补充素材 |

### 8.2 使用原则

- 优先 CC0
- 非 CC0 必须记录作者、许可、链接
- 不直接使用来源不明的“免费素材包”
- AI 生图需人工审核
- 不生成真实校名、真实人物、真实建筑照片

---

## 9. 美术验收标准

- 一眼看出是校园夜景
- 一眼看出哪些窗户可点
- 暖光与夜蓝对比清晰
- 画面截图可作为明信片
- 没有写实/科幻/赛博元素
- UI 不遮挡窗户
- 移动端不糊
- 颜色对色盲友好（状态不只靠颜色）
- 整体像一幅画，不像网页模板
