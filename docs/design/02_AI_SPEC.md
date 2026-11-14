# DeepSeek AI 接入规范

> 目标：AI 生成“每一晚的校园夜景”，驱动视觉、声音、故事窗与明信片文案。  
> 原则：AI 在开场一次性生成，游戏过程中不等待 AI。  
> 隐私：API Key 只存在浏览器内存，不发送到自建后端，不写入 localStorage。

---

## 1. 为什么这样设计

### 1.1 比赛要求

- 作品启动时要求用户输入有效 DeepSeek API Key
- 验证通过后才能进入核心互动流程
- Key 不得收集、上传、存储或他用
- 项目说明中写明使用方式、验证方式、隐私处理

### 1.2 玩法要求

- 快节奏：不能在点击过程中等待 AI
- 稳定：AI 失败不能影响游戏
- 可控：AI 只输出结构化参数，不直接控制任意逻辑

### 1.3 设计结论

```text
Key 输入 → 一次最小验证 → 一次生成三晚内容 → 本地缓存（仅内存） → 开始游戏
```

游戏过程中：

- 不调用 AI
- 不等待网络
- 所有交互本地即时完成

---

## 2. Key 校验流程

### 2.1 UI

```text
┌──────────────────────────────────┐
│  今晚，亮一盏灯                   │
│                                  │
│  请输入你的 DeepSeek API Key      │
│  [ sk-........................ ] │
│                                  │
│  [ 验证并开始 ]                  │
│                                  │
│  Key 只用于本次游戏，不会上传或保存│
│  没有 Key？先看看离线版 →         │
└──────────────────────────────────┘
```

### 2.2 校验请求

```http
POST https://api.deepseek.com/chat/completions
Authorization: Bearer <user-key>
Content-Type: application/json

{
  "model": "deepseek-chat",
  "messages": [
    { "role": "user", "content": "ping" }
  ],
  "max_tokens": 1,
  "temperature": 0
}
```

### 2.3 校验结果

| 结果 | 处理 |
|---|---|
| HTTP 200 | 进入生成阶段 |
| 401 | 提示 Key 无效 |
| 402 | 提示余额不足 |
| 429 | 提示请求过多，稍后再试 |
| 网络失败 | 提供离线模式 |
| 超时 10s | 提供重试或离线模式 |

### 2.4 隐私

- Key 只保存在 `sessionStorage`？不。只保存在 JS 变量。
- 刷新页面即丢失。
- 不写 `localStorage`。
- 不写 `sessionStorage`。
- 不发送到自己的服务器。
- 不打印到控制台。
- 不在错误信息里回显完整 Key。

---

## 3. 内容生成流程

### 3.1 输入

用户选择“今晚的心情”（不写隐私）：

- 想安静一点
- 想有点声音
- 想看点亮的
- 随便

这只是玩法偏好，不是心理测评。

### 3.2 一次生成三晚

```json
{
  "nights": [
    {
      "night": 1,
      "weather": "light_rain",
      "tempo": "normal",
      "palette": "warm_blue",
      "stories": [
        { "text": "三楼的绿萝，今天又冒了一片新叶。", "item": "绿萝" },
        { "text": "有人在窗台晾了一双白球鞋。", "item": "白球鞋" }
      ],
      "postcard": "今晚亮了 18 扇窗。雨很小，刚好够听见。"
    }
  ]
}
```

### 3.3 校验

- 必须是合法 JSON
- `nights` 必须是 3 个
- `weather` 必须在枚举内
- `tempo` 必须在枚举内
- `palette` 必须在枚举内
- 每条 `stories.text` 长度 6–24 个汉字
- `postcard` 长度 10–40 个汉字
- 不允许出现禁用词
- 不允许出现 HTML
- 不允许出现 URL

### 3.4 非法输出处理

1. 重试一次
2. 仍失败 → 使用本地 fallback
3. UI 不显示错误堆栈，只提示“今晚用了备用夜景”

---

## 4. Prompt

### 4.1 System Prompt

```text
你是一个校园夜景生成器，不是心理医生。

你的任务：为一款治愈系解压小游戏生成三个夜晚的视觉与文案参数。

规则：
1. 只输出 JSON，不要解释。
2. 不诊断、不治疗、不说教。
3. 不出现“抑郁、焦虑症、心理疾病”等临床词。
4. 不出现“你应该、想开点、加油、正能量”等说教词。
5. 不出现自伤、自杀、暴力、恐怖内容。
6. 不出现真实姓名、联系方式、学校具体地址。
7. 故事只描述具体校园生活小景，不解释情绪。
8. 文案短、具体、留白，像朋友随手写的一句。
9. 允许安静、疲惫、阴天，不强迫积极。
10. 所有中文文案控制在规定长度内。
```

### 4.2 User Prompt 模板

```text
生成三个连续的校园夜晚。

玩家偏好：{{moodPreference}}

要求：
- 三个夜晚的天气不同
- 节奏从慢到快再到暖
- 每晚 2–3 条故事窗文案
- 每晚一句明信片文案
- 故事要具体到物品、动作、声音、光线
- 不要出现心理学术语
- 不要出现建议
- 只输出 JSON

JSON Schema：
{{schema}}
```

### 4.3 JSON Schema

```json
{
  "type": "object",
  "required": ["nights"],
  "properties": {
    "nights": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["night", "weather", "tempo", "palette", "stories", "postcard"],
        "properties": {
          "night": { "type": "integer", "minimum": 1, "maximum": 3 },
          "weather": { "enum": ["clear", "light_rain", "fog", "wind"] },
          "tempo": { "enum": ["slow", "normal", "brisk"] },
          "palette": { "enum": ["warm_blue", "rainy_amber", "foggy_lilac", "clear_peach"] },
          "stories": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": {
              "type": "object",
              "required": ["text", "item"],
              "properties": {
                "text": { "type": "string", "minLength": 6, "maxLength": 24 },
                "item": { "type": "string", "minLength": 1, "maxLength": 8 }
              }
            }
          },
          "postcard": { "type": "string", "minLength": 10, "maxLength": 40 }
        }
      }
    }
  }
}
```

---

## 5. 本地 Fallback

### 5.1 触发条件

- 用户选择离线模式
- Key 校验失败但选择继续
- 网络失败
- AI 超时
- JSON 非法
- 内容校验失败

### 5.2 Fallback 内容

本地预置 3 套完整三晚内容：

- 小雨夜
- 有风夜
- 晴天夜

每套包含：

- 3 晚天气
- 3 晚故事
- 3 晚明信片

### 5.3 Fallback 用户体验

- 不显示“AI 失败”
- 显示“今晚用了备用夜景”
- 所有玩法正常

---

## 6. 安全检查

### 6.1 前端校验

```ts
const BANNED = [
  '抑郁', '焦虑症', '心理疾病', '自杀', '自残',
  '你应该', '想开点', '正能量', '加油',
  '治疗', '治愈你', '诊断'
]
```

### 6.2 长度与格式

- 去除 HTML
- 去除 URL
- 去除换行
- 统一中文标点
- 超长截断

### 6.3 内容边界

- 不生成危机内容
- 不生成医疗建议
- 不生成诊断
- 不生成说教
- 不生成真实隐私

---

## 7. 项目说明模板

```md
## DeepSeek API 使用说明

- 模型：deepseek-chat
- 调用位置：浏览器直连 https://api.deepseek.com/chat/completions
- Key 使用：用户启动时输入，仅用于一次校验和一次内容生成
- Key 存储：仅保存在浏览器内存变量，刷新即清除
- 不上传：Key 不发送到本作品自建服务器
- 不存储：不写 localStorage、sessionStorage、Cookie
- 不记录：不打印到控制台、不写入日志
- 失败处理：AI 失败时自动使用本地夜景，不影响游戏
- 隐私说明：游戏不收集真实姓名、联系方式或私密内容
```
