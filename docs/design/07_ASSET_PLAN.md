# 素材计划

> 原则：优先 CC0，AI 生图只做场景和明信片背景，所有素材记录来源与许可。  
> 风格：卡通油画、厚涂、暖光、校园夜景；不写实、不科幻。

---

## 1. 素材分类

| 类别 | 来源 | 数量 | 说明 |
|---|---|---|---|
| 主场景背景 | AI 生图 | 3 | 小雨、有风、晴天 |
| 宿舍楼 | AI 生图/程序分层 | 1 | 24 扇窗独立可交互 |
| 故事窗小景 | AI 生图 | 12–24 | 方形小图 |
| 明信片背景 | AI 生图 | 3 | 竖版 3:4 |
| UI 边框/按钮 | Kenney CC0 | 1 包 | 可改色 |
| 图标 | Kenney CC0 / 自绘 | 10 | 小物件 |
| 音效 | Freesound CC0 / 自录 | 8 | 点击、连击、故事 |
| 环境音 | Freesound CC0 / WebAudio | 3 | 雨、风、虫鸣 |
| 字体 | 开源字体 | 2 | 标题 + 正文 |

---

## 2. 已核验许可

| 来源 | 许可 | 核验状态 |
|---|---|---|
| Kenney UI Pack | CC0 | 已核验页面标注 |
| Poly Haven | CC0 | 已核验 license 页面 |
| Quaternius | 需逐项核验 | 不默认使用 |
| Freesound | 需逐项核验 | 只选 CC0 |
| OpenGameArt | 需逐项核验 | 只选 CC0 |

---

## 3. AI 生图资产清单

### 3.1 主场景

| 文件名 | 内容 | 尺寸 |
|---|---|---|
| `bg-rain.webp` | 小雨夜宿舍楼 | 1920×1080 |
| `bg-wind.webp` | 有风夜宿舍楼 | 1920×1080 |
| `bg-clear.webp` | 晴天夜宿舍楼 | 1920×1080 |

### 3.2 故事窗

| 文件名 | 内容 |
|---|---|
| `story-plant.webp` | 窗台绿萝 |
| `story-shoes.webp` | 白球鞋 |
| `story-laundry.webp` | 洗衣机 |
| `story-moon.webp` | 云后月亮 |
| `story-noodles.webp` | 泡面 |
| `story-lamp.webp` | 旧台灯 |
| `story-cup.webp` | 玻璃杯 |
| `story-boat.webp` | 纸船 |
| `story-umbrella.webp` | 黄伞 |
| `story-earphones.webp` | 耳机 |

### 3.3 明信片

| 文件名 | 内容 |
|---|---|
| `postcard-rain.webp` | 雨夜 |
| `postcard-wind.webp` | 风夜 |
| `postcard-clear.webp` | 晴夜 |

---

## 4. 命名规范

```text
assets/
  images/
    bg-{weather}.webp
    story-{item}.webp
    postcard-{weather}.webp
    ui-{name}.png
  audio/
    sfx-light-{n}.ogg
    sfx-combo-{n}.ogg
    amb-{weather}.ogg
  fonts/
    title.woff2
    body.woff2
```

---

## 5. 压缩规范

- 图片：WebP，质量 80–85
- 背景：≤ 400KB
- 故事窗：≤ 120KB
- 明信片：≤ 300KB
- 音频：OGG/MP3，≤ 500KB/条
- 总包 ≤ 12MB

---

## 6. 版权记录模板

```yaml
file: assets/images/bg-rain.webp
source: AI generated
tool: image_gen
prompt_file: design/03_ART_DIRECTION.md#71
license: project-owned
reviewed_by: 
date: 
notes: 
```

```yaml
file: assets/ui/button.png
source: Kenney UI Pack
url: https://kenney.nl/assets/ui-pack
license: CC0
downloaded: 2026-11-08
modified: recolored
notes: 
```

---

## 7. 禁止

- 来源不明素材
- 未授权字体
- 真实校名/人物照片
- 写实恐怖图像
- 赛博霓虹素材
- AI 生成的真人肖像
- 带水印素材
