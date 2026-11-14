# 种子证据与设计假设（待核验）

> 说明：以下内容是“待其他 Agent 核验的研究线索”，不是已核验结论。  
> 不得直接引用本文件作为论文依据。必须回到原始论文/官方报告核验。

## 1. 高优先级理论线索

### 1.1 压力与应对

- Lazarus & Folkman (1984). *Stress, Appraisal, and Coping*.
- 核心：压力不是事件本身，而是个体对事件“威胁/挑战”的评估与可用应对资源。
- 游戏转译：不要设计“事件好坏”，而设计“玩家如何评估与调度资源”。
- 风险：容易变成“只要换个想法就好了”，忽略真实环境限制。

### 1.2 情绪调节过程模型

- Gross (1998). The emerging field of emotion regulation: An integrative review.
- 核心：情境选择、情境修改、注意部署、认知改变、反应调节。
- 游戏转译：玩家可以改变环境（情境修改）、引导注意（注意部署）、重评（认知改变），但不应只奖励“压抑情绪”。
- 风险：不要把“忍住”当情绪调节成功。

### 1.3 自我决定理论

- Ryan & Deci (2000). Self-determination theory and the facilitation of intrinsic motivation.
- 核心：自主、胜任、关系。
- 游戏转译：玩家有选择权；难度逐步提升；有陪伴关系；不强迫积极。
- 风险：排行榜若制造外部压力，会破坏自主感。

### 1.4 拓展-建构理论

- Fredrickson (2001). The role of positive emotions in positive psychology.
- 核心：积极情绪拓展注意与行为资源，建构长期资源。
- 游戏转译：不是“开心值越高越好”，而是“体验更多可能性”。
- 风险：强迫积极、正能量绑架。

### 1.5 自我关怀

- Neff (2003). Self-compassion: An alternative conceptualization of a healthy attitude toward oneself.
- 核心：自我友善、共同人性、正念。
- 游戏转译：失败时不羞辱玩家；允许“今天就这样”；给出温和反馈。
- 风险：把自我关怀做成“鸡汤”。

### 1.6 心流

- Csikszentmihalyi (1990). *Flow*.
- 核心：挑战与技能平衡、清晰目标、即时反馈、专注。
- 游戏转译：短循环、明确反馈、难度渐进。
- 风险：心理主题不适合高压力竞速。

### 1.7 注意力恢复理论

- Kaplan (1995). The restorative benefits of nature: Toward an integrative framework.
- 核心：自然环境的“柔软魅力”、远离感、连贯性、兼容性。
- 游戏转译：校园自然角落、缓慢探索、低认知负荷。
- 风险：不能宣称“自然一定治愈”。

### 1.8 归属需要

- Baumeister & Leary (1995). The need to belong.
- 核心：稳定、积极的人际关系是基本需要。
- 游戏转译：陪伴角色、校园连接、互助网络。
- 风险：不要让玩家替他人做决定。

### 1.9 反刍思维

- Nolen-Hoeksema (2000). The role of rumination in depressive disorders and mixed anxiety/depressive symptoms.
- 核心：反复思考负面内容可能加重情绪困扰。
- 游戏转译：不要把“反复点击同一个烦恼”设计成奖励；应引导切换视角或行动。
- 风险：把反刍当“深度思考”来奖励。

### 1.10 表达性写作

- Pennebaker & Beall (1986). Confronting a traumatic event: Toward an understanding of inhibition and disease.
- 核心：连续数天书写创伤经历可能改善身心健康。
- 游戏转译：一次短写作可以，但不能宣称疗效；不要强制披露创伤。
- 风险：一次游戏内写作≠完整表达性写作疗程。

## 2. 待核验的机制—玩法映射

| 机制 | 可能玩法 | 证据强度待核验 | 好玩度 | 风险 |
|---|---|---|---|---|
| 情境修改 | 布置环境、调光、开窗、换空间 | B/C | 高 | 低 |
| 注意部署 | 引导玩家观察细节、寻找安全角落 | B/C | 中高 | 低 |
| 认知重评 | 让玩家从不同角色视角看同一事件 | B | 中 | 中，易说教 |
| 自我关怀 | 失败后选择对自己说的话 | B | 中 | 高，易鸡汤 |
| 行为激活 | 完成一个微小行动，推动天气变化 | B | 高 | 低 |
| 呼吸/正念 | 节奏交互、呼吸同步 | B | 中 | 中，易无聊 |
| 社会支持 | 布置陪伴角色、连接资源 | B | 高 | 中，易控制 |
| 自然接触 | 校园自然场景、慢探索 | C | 高 | 低 |
| 品味 | 放大一个微小好瞬间 | C | 中高 | 低 |
| 感恩 | 记录/分享一件小事 | C | 中 | 高，易道德绑架 |
| 求助意愿 | 找到并连接校园支持资源 | B/C | 中高 | 低，但需安全设计 |

## 3. 游戏机制候选

### 候选 A：天气调度（推荐）

玩家根据匿名心事，选择：
- 光照颜色与强度
- 雨棚位置
- 安静区/社交区
- 陪伴角色
- 声音环境
- 求助信息牌

AI 输出：
```json
{
  "weather": "light_rain",
  "intensity": 0.62,
  "needs": ["quiet", "light", "companionship"],
  "avoid": ["advice", "crowd"],
  "sceneActions": []
}
```

反馈：
- 天气变化
- NPC 姿态/距离变化
- 环境音变化
- 结算解释“哪个支持匹配了哪个需要”

### 候选 B：一句话长出房间

玩家写一句话，AI 生成房间参数，玩家布置房间。
风险：AI 生成内容不可控，视觉工作量大。

### 候选 C：回声对话

玩家选择回应方式，AI 生成“潜台词回声”，但不直接替 NPC 回答。
风险：容易变成聊天框。

## 4. 必须核验的问题

1. 表达性写作的证据是否足以支持一次 3 分钟写作？效果量多大？长期效果如何？
2. 认知重评在一次性短游戏里是否可能有效？还是需要多次练习？
3. 自我关怀干预的短期效果和风险是什么？
4. 正念/呼吸在单次体验中的效果是否被夸大？
5. 游戏化心理干预的脱落率、依从性、负面效应如何？
6. 排行榜对心理主题游戏是否弊大于利？
7. “自然接触”在虚拟场景中是否成立？证据强度如何？
8. 大学生最普遍的压力源是否有可靠的中国样本数据？
9. 中国高校心理求助资源和危机干预流程是什么？
10. 哪些内容会触发审核或伦理风险？

## 5. 推荐给接手 Agent 的检索词

### 英文

- expressive writing randomized controlled trial college students meta-analysis
- cognitive reappraisal brief intervention randomized trial
- self-compassion intervention randomized controlled trial meta-analysis
- mindfulness brief intervention university students meta-analysis
- behavioral activation depression meta-analysis
- social support belonging intervention college students
- rumination intervention systematic review
- serious games mental health meta-analysis
- gamified mental health intervention systematic review
- digital mental health engagement dropout
- virtual nature restorative effect meta-analysis
- help-seeking stigma college students intervention

### 中文

- 大学生心理健康 元分析
- 表达性写作 大学生 随机对照
- 认知重评 干预 大学生
- 自我关怀 干预 大学生
- 正念 大学生 元分析
- 行为激活 抑郁 元分析
- 反刍思维 干预
- 严肃游戏 心理健康
- 游戏化 心理健康 干预
- 中国国民心理健康发展报告
- 大学生心理健康蓝皮书
- 高校心理危机干预 政策
- 心理求助污名 大学生

## 6. 安全与伦理提醒

- 不收集真实用户心事。
- 不保存用户输入内容。
- 不把自伤/自杀文本做成普通游戏内容。
- 不宣称诊断或疗效。
- 不把“求助”设计成失败。
- 不把“积极”设计成唯一正确结局。
- 不把复杂社会问题归因于个人。
