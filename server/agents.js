// The four-agent hub.
//
// Agent 1 NightDirector + Agent 2 ResidentPersona are merged into one structured
// call at boot ("plan"), Agent 3 ResonanceWeaver runs mid-game at t=45s
// ("evolve"), and Agent 4 ChronicleCurator writes the closing letter
// ("epilogue"). Every path is wrapped so a failure never reaches the player:
// SQLite cache first, then the upstream model, then the hand-written graph in
// src/narrative-graph.js.

import {
  normalizeEpiloguePayload,
  normalizeEvolvePayload,
  normalizePlanPayload,
  sanitizeText,
  telemetryBucket
} from '../shared/ai-schema.js'
import { MOOD_TOKEN_IDS, ENDING_IDS } from '../shared/constants.js'
import { buildOfflineEpilogue, buildOfflineEvolution, buildOfflinePlan } from '../src/narrative-graph.js'

export const PLAN_SYSTEM_PROMPT = `你是《今晚，亮一盏灯》的「夜巡总导演 (NightDirector)」兼「17号宿舍楼群像编剧 (ResidentPersona)」。
你负责根据玩家选择的今夜心境信物与历史档案，编排三个连续校园夜晚的视听参数、手账微委托，以及具有微光抉择分支的窗后故事。

【铁律与边界】
1. 只输出严格合法的 JSON，不输出任何 Markdown 代码块标记或多余解释。
2. 本作是治愈系解压游戏，绝不是心理医疗工具：严禁出现"抑郁、焦虑症、心理疾病、自杀、自残、诊断、治疗、治愈你"等临床或危机词；严禁出现"你应该、想开点、加油、正能量"等居高临下的说教词。
3. 故事只白描具体、细腻的中国大学宿舍生活切片（声音、光线、小动作、日常器物），允许疲惫、发呆、阴天，不强迫积极。
4. 固定核心住户设定：
   - 102室(林阿姨·宿管值班室，热茶与钥匙)
   - 203室(小禾·插画系学生，画板与绿萝)
   - 205室(阿澈·广播站主播，麦克风与夜话)
   - 301室(阿满与室友·深夜小电锅关东煮)
   - 304室(知夏·考研学姐与窗外流浪橘猫)
   - 406室(星野·顶楼天文望远镜等流星的少年)
5. 每晚必须包含：
   - weather: "light_rain" | "fog" | "wind" | "clear"
   - tempo: "slow" | "normal" | "brisk"
   - palette: "rainy_amber" | "warm_blue" | "foggy_lilac" | "clear_peach"
   - commissions: 2~3 项当晚微委托，每项含 id、type("lit_count"|"max_combo"|"drag_chain"|"resonance"|"story_choice"|"row_lit"|"all_lit"|"bond_rooms")、target、label(8~18字)
   - resonancePair: { "rooms": [roomA, roomB], "line": "..." } 跨窗共鸣房号对（如 [205, 406] 或 [203, 304]）与一句共鸣描写 resonanceLine(10~26字)
   - stories: 3 条窗后故事，每条绑定 roomId(102/203/205/301/304/406 之一)，含 resident、text(8~26字)、item(2~6字)、icon(单个Emoji)、以及 2 个微光抉择 choices: [{ "id": "A", "label": "4~9字", "outcome": "8~22字" }, { "id": "B", ... }]
   - postcard: 当晚夜色短句(12~36字，不要写死具体点亮了几扇窗的数字，以免与玩家实际点亮数冲突)
6. 三晚的 story roomId 不要在两晚之间完全重复，让玩家能遇到不同的住户。

输出 JSON 结构：{"directorNote":"...","nights":[{"night":1,"weather":"...","tempo":"...","palette":"...","commissions":[...],"resonancePair":{"rooms":[102,304],"line":"..."},"stories":[...],"postcard":"..."}]}`
export const EVOLVE_SYSTEM_PROMPT = `你是《今晚，亮一盏灯》的「跨窗共鸣编织智能体 (ResonanceWeaver)」。
玩家刚刚完成了第 1 晚的守夜。请根据玩家在第 1 晚的真实操作风格（连击高低、是否喜好一笔画拖拽）以及对住户做出的「微光抉择」，动态演进第 2 晚与第 3 晚的住户后续故事与跨窗共鸣！
要求：
1. 玩家在第 1 晚帮助/回应过的房号（choicesMade），必须在第 2 或第 3 晚出现温暖的后续因果呼应（蝴蝶效应）。
2. 若玩家第 1 晚连击很高（maxCombo >= 10），第 2 晚 tempo 设为 "brisk"；若玩家节奏舒缓，则设为 "normal" 或 "slow"。
3. 严禁出现心理诊断词或说教词，只输出严格 JSON（包含更新后的 night 2 与 night 3 对象）。
4. 每晚仍必须包含 weather、tempo、palette、commissions、resonancePair、stories(3 条，含 2 个 choices)、postcard。

输出 JSON 结构：{"nights":[{"night":2,...},{"night":3,...}]}`
export const EPILOGUE_SYSTEM_PROMPT = `你是《今晚，亮一盏灯》的「守夜编年史与回信官 (ChronicleCurator)」。
玩家刚刚走完三个夜晚。请根据达成的结局线、最深的羁绊住户与最终数据，写一封住户手写回信。

要求：
1. 只输出严格 JSON，不要 Markdown 标记。
2. 严禁临床词与说教词（不出现"抑郁、焦虑、治疗、你应该、想开点、加油、正能量"）。
3. 回信要从那位住户的第一人称视角写，落到一个具体的器物或光线细节上，长度 40~110 个汉字，不要说教、不要总结人生道理。
4. archetype 是玩家称号（4~10 字），whisperSuggestion 是一句可以封存进窗户的微光寄语（10~32 字）。

输出 JSON 结构：{"archetype":"...","letter":{"fromRoom":"406室 · 星野","salutation":"致...：","body":"...","sign":"..."},"whisperSuggestion":"..."}`

/**
 * @param {string} content
 * @returns {string}
 */
function stripFences(content) {
  const raw = String(content || '').trim()
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenced) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1)
  return raw
}

/**
 * @param {string} str
 * @returns {string}
 */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Build the agent hub.
 *
 * @param {{
 *   db: any,
 *   aiKey?: string,
 *   aiBase?: string,
 *   aiModel?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number
 * }} opts
 */
export function createAgentHub({
  db,
  aiKey = '',
  aiBase = 'https://t.xiaoxin.email/v1',
  aiModel = 'deepseek-v4.1-flash',
  fetchImpl = fetch,
  timeoutMs = 12000
}) {
  const configured = Boolean(aiKey)

  /**
   * @param {string} system
   * @param {string} user
   * @param {number} maxTokens
   * @returns {Promise<any>} the parsed JSON object, never null
   */
  async function callModel(system, user, maxTokens) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${aiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.9,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        }),
        signal: ctrl.signal
      })
      if (!res.ok) throw new Error('upstream ' + res.status)
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (!content) throw new Error('empty completion')
      return JSON.parse(stripFences(content))
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get configured() {
      return configured
    },

    /**
     * Agent 1 + 2. Generates the three-night baseline.
     * @param {{
     *   moodToken?: string,
     *   unlockedEndings?: string[],
     *   playCount?: number,
     *   communityMemory?: { roomId?: number, text?: string },
     *   uid?: string
     * }} input
     * @returns {Promise<{ source: 'ai'|'cache'|'offline', payload: any }>}
     */
    async runPlanAgent(input = {}) {
      const mood = MOOD_TOKEN_IDS.includes(String(input.moodToken)) ? String(input.moodToken) : 'lamp'
      const unlocked = Array.isArray(input.unlockedEndings)
        ? input.unlockedEndings.filter(id => ENDING_IDS.includes(String(id))).slice(0, 6)
        : []
      const playCount = Math.max(0, Math.min(9999, Number(input.playCount) || 0))
      const memory = input.communityMemory && typeof input.communityMemory === 'object'
        ? {
            roomId: Number(input.communityMemory.roomId) || 304,
            text: sanitizeText(input.communityMemory.text, 40)
          }
        : null

      const cacheKey = 'plan|' + fnv1a([mood, playCount % 4, unlocked.join(','), memory ? memory.roomId : 0].join('|'))

      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizePlanPayload(cached)
        if (normalised) return { source: 'cache', payload: normalised }
      }

      const offline = () => ({ source: 'offline', payload: normalizePlanPayload(buildOfflinePlan(mood, { unlockedEndings: unlocked, playCount })) || buildOfflinePlan(mood, { playCount }) })

      if (!configured) return offline()

      const user = JSON.stringify({
        moodToken: mood,
        unlockedEndings: unlocked,
        playCount,
        communityMemory: memory
      })

      try {
        const raw = await callModel(PLAN_SYSTEM_PROMPT, user, 2200)
        const payload = normalizePlanPayload(raw)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'plan', payload })
        return { source: 'ai', payload }
      } catch {
        // Throttled or broken upstream: reuse any cached plan of the same kind
        // so the player still gets generated content instead of an error.
        const reused = db.pickCachedAiPayload('plan')
        if (reused) {
          const normalised = normalizePlanPayload(reused)
          if (normalised) return { source: 'cache', payload: normalised }
        }
        return offline()
      }
    },

    /**
     * Agent 3. Rewrites the nights the player has not reached yet.
     * @param {{
     *   moodToken?: string,
     *   night1Telemetry?: {
     *     litCount?: number, maxCombo?: number, dragChains?: number,
     *     resonancesCompleted?: number,
     *     choicesMade?: Array<{ roomId: number, choiceId: 'A'|'B', label?: string }>
     *   },
     *   firstNight?: number
     * }} input
     * @returns {Promise<{ source: 'ai'|'cache'|'offline', payload: any }>}
     */
    async runEvolveAgent(input = {}) {
      const mood = MOOD_TOKEN_IDS.includes(String(input.moodToken)) ? String(input.moodToken) : 'lamp'
      const t = input.night1Telemetry && typeof input.night1Telemetry === 'object' ? input.night1Telemetry : {}
      const telemetry = {
        litCount: Math.max(0, Math.min(24, Number(t.litCount) || 0)),
        maxCombo: Math.max(0, Math.min(999, Number(t.maxCombo) || 0)),
        dragChains: Math.max(0, Math.min(999, Number(t.dragChains) || 0)),
        resonancesCompleted: Math.max(0, Math.min(99, Number(t.resonancesCompleted) || 0)),
        choicesMade: Array.isArray(t.choicesMade)
          ? t.choicesMade.slice(0, 6).map(c => ({
              roomId: Number(c && c.roomId) || 0,
              choiceId: (c && c.choiceId) === 'B' ? 'B' : 'A',
              label: sanitizeText(c && c.label, 12)
            }))
          : []
      }
      const firstNight = Math.max(2, Math.min(3, Number(input.firstNight) || 2))
      const cacheKey = 'evolve|' + fnv1a([mood, firstNight, telemetryBucket(telemetry)].join('|'))

      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizeEvolvePayload(cached, firstNight)
        if (normalised) return { source: 'cache', payload: normalised }
      }

      const offline = () => {
        const fallback = buildOfflineEvolution(telemetry)
        const sliced = fallback.nights.filter(n => n.night >= firstNight)
        return { source: 'offline', payload: normalizeEvolvePayload({ nights: sliced }, firstNight) || { nights: sliced } }
      }

      if (!configured) return offline()

      try {
        const raw = await callModel(
          EVOLVE_SYSTEM_PROMPT,
          JSON.stringify({ moodToken: mood, night1Telemetry: telemetry, fromNight: firstNight }),
          2200
        )
        const payload = normalizeEvolvePayload(raw, firstNight)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'evolve', payload })
        return { source: 'ai', payload }
      } catch {
        const reused = db.pickCachedAiPayload('evolve')
        if (reused) {
          const normalised = normalizeEvolvePayload(reused, firstNight)
          if (normalised) return { source: 'cache', payload: normalised }
        }
        return offline()
      }
    },

    /**
     * Agent 4. The closing letter.
     * @param {{
     *   endingId?: string,
     *   bondRoomId?: number,
     *   totalWarmth?: number,
     *   litTotal?: number,
     *   maxCombo?: number,
     *   resonanceCount?: number,
     *   stampsEarned?: number,
     *   choicesHistory?: Array<{ roomId: number, label?: string }>,
     *   path?: 'A'|'B'
     * }} input
     * @returns {Promise<{ source: 'ai'|'cache'|'offline', payload: any }>}
     */
    async runEpilogueAgent(input = {}) {
      const endingId = ENDING_IDS.includes(String(input.endingId)) ? String(input.endingId) : 'ENDING_F_DRIFT'
      const bondRoomId = Number(input.bondRoomId) || 0
      const totalWarmth = Math.max(0, Number(input.totalWarmth) || 0)
      const path = input.path === 'B' ? 'B' : 'A'
      const cacheKey = 'epilogue|' + fnv1a([endingId, bondRoomId, Math.floor(totalWarmth / 60), path].join('|'))

      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizeEpiloguePayload(cached)
        if (normalised) return { source: 'cache', payload: normalised }
      }

      const offline = () => ({
        source: 'offline',
        payload: normalizeEpiloguePayload(buildOfflineEpilogue({ endingId, bondRoomId, path, totalWarmth })) || buildOfflineEpilogue({ endingId, bondRoomId, path })
      })

      if (!configured) return offline()

      const choicesHistory = Array.isArray(input.choicesHistory)
        ? input.choicesHistory.slice(0, 8).map(c => ({ roomId: Number(c && c.roomId) || 0, label: sanitizeText(c && c.label, 12) }))
        : []

      try {
        const raw = await callModel(
          EPILOGUE_SYSTEM_PROMPT,
          JSON.stringify({
            endingId,
            totalWarmth,
            litTotal: Math.max(0, Number(input.litTotal) || 0),
            maxCombo: Math.max(0, Number(input.maxCombo) || 0),
            resonanceCount: Math.max(0, Number(input.resonanceCount) || 0),
            stampsEarned: Math.max(0, Number(input.stampsEarned) || 0),
            bondRoomId,
            choicesHistory
          }),
          1200
        )
        const payload = normalizeEpiloguePayload(raw)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'epilogue', payload })
        return { source: 'ai', payload }
      } catch {
        const reused = db.pickCachedAiPayload('epilogue')
        if (reused) {
          const normalised = normalizeEpiloguePayload(reused)
          if (normalised) return { source: 'cache', payload: normalised }
        }
        return offline()
      }
    }
  }
}
