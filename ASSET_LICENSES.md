# 素材与许可清单

## 当前状态

本版本中，全部 3D 模型、表面纹理、角色立绘、图标、实时音效与 3 套程序化合成总谱**均为 100% 原创/程序化生成**；另内嵌一首懒加载默认背景音乐（仅于玩家首次交互后播放），并支持随时切换回全原创合成音景或本地音频：

| 类别 | 产出路径 / 模块 | 生成方式 / 来源 | 版权归属与合规性 |
|---|---|---|---|
| **3D 宿舍楼群与校园底盘** | `public/models/*.glb`（`campus_grounds`、`dorm_staff`、`dorm_highschool`、`dorm_university`、`dorm_grad`） | 项目原创 `tools/blender/build_campus_v4.py` 无头 Blender 脚本建模导出 | 100% 原创自制，无外部模型 |
| **建筑与地面 PBR 纹理** | `src/textures-procedural.js`、`src/scene.js` | Canvas 2D 确定性像素哈希 + 高度场微法线与 512×512 室内视差图集运行时生成 | 100% 程序化原创 |
| **8 位 NPC 5 套换装立绘** | `src/npc-portraits.js` | 内联矢量 SVG 分层程序化渲染 | 100% 原创自制，无真实人物肖像 |
| **UI 玻璃图标与纪念明信片** | `src/icons.js`、`src/postcard.js` | 内联 SVG 矢量路径 + Canvas 2D 动态绘制 | 100% 原创自制 |
| **默认主题背景音乐（懒加载）** | `public/audio/bgm-default.mp3` | *Kataware Doki（黄昏之时）* — RADWIMPS（电影《你的名字。》OST），转码为 96 kbps 1.92 MB 循环版本 | 仅限非商业性比赛展示与个人学习演示使用；界面配乐条可一键切回全原创 WebAudio 合成曲目 |
| **交互音效、天气底噪与备选合成 BGM** | `src/audio-engine.js` | Web Audio API 实时波形合成（5 种可选纯合成音景模式、雨风噪声与住户拟音）；另支持玩家本地选取个人音频文件（不上传服务器） | 100% 原创自制 |

> 注：未采用真实校名与真实个人身份信息，校园地名（「17 号楼」「桂花院」「晨光楼」「研思楼」）与人物均为虚构创作。

## 计划使用

| 来源 | 许可 | 用途 | 核验 |
|---|---|---|---|
| Kenney UI Pack | CC0 | UI 边框/按钮 | 已核验页面标注 |
| Poly Haven | CC0 | 纹理/环境贴图 | 已核验 license 页面 |
| AI 生图 | 项目内生成 | 概念图/明信片/故事窗 | 生成后需人工审核 |

## 规则

- 优先 CC0
- 非 CC0 必须记录作者、许可、链接
- 不使用来源不明素材
- 不生成真实人物肖像
- 不生成真实校名、真实地址
- AI 生成内容须人工审核

## 记录模板

```yaml
file:
source:
url:
license:
downloaded:
modified:
reviewed_by:
notes:
```
