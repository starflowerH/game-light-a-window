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
  normalizeDialoguePayload,
  normalizePuzzlePayload,
  normalizeDebriefPayload,
  sanitizeText,
  telemetryBucket
} from '../shared/ai-schema.js'
import { MOOD_TOKEN_IDS, ENDING_IDS, DORM_IDS, GAME_MODE_IDS, dormDef, gameModeDef } from '../shared/constants.js'
import { buildOfflineEpilogue, buildOfflineEvolution, buildOfflinePlan } from '../src/narrative-graph.js'
import { buildOfflineDialogue } from '../src/npc-portraits.js'

import {
  PLAN_SYSTEM_PROMPT,
  EVOLVE_SYSTEM_PROMPT,
  EPILOGUE_SYSTEM_PROMPT,
  DIALOGUE_SYSTEM_PROMPT,
  PUZZLE_SYSTEM_PROMPT,
  DEBRIEF_SYSTEM_PROMPT
} from '../shared/ai-prompts.js'
export {
  PLAN_SYSTEM_PROMPT,
  EVOLVE_SYSTEM_PROMPT,
  EPILOGUE_SYSTEM_PROMPT,
  DIALOGUE_SYSTEM_PROMPT,
  PUZZLE_SYSTEM_PROMPT,
  DEBRIEF_SYSTEM_PROMPT
}

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
  timeoutMs = 24000
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
     * @returns {Promise<{ source: string, payload: any }>}
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

      const cacheKey = 'plan_v5|' + fnv1a([mood, playCount % 4, unlocked.join(','), memory ? memory.roomId : 0].join('|'))

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
     *     choicesMade?: Array<{ roomId: number, choiceId: string, label?: string }>
     *   },
     *   firstNight?: number,
   *   uid?: string
     * }} input
     * @returns {Promise<{ source: string, payload: any }>}
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
      const cacheKey = 'evolve_v5|' + fnv1a([mood, firstNight, telemetryBucket(telemetry)].join('|'))

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
     * @returns {Promise<{ source: string, payload: any }>}
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
    },

    /** Agent DialogueDirector: dynamic opening/dorm-switch NPC dialogue. */
    async runDialogueAgent(input = {}) {
      const dormType = DORM_IDS.includes(String(input.dormType)) ? String(input.dormType) : 'university'
      const season = sanitizeText(input.season, 16) || 'autumn'
      const weather = sanitizeText(input.weather, 16) || 'clear'
      const dorm = dormDef(dormType)
      const cacheKey = 'dialogue_v5|' + fnv1a([dormType, season, weather].join('|'))
      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizeDialoguePayload(cached)
        if (normalised) return { source: 'cache', payload: normalised }
      }
      const offline = () => ({ source: 'offline', payload: buildOfflineDialogue(dormType, season, weather) })
      if (!configured) return offline()

      try {
        const raw = await callModel(
          DIALOGUE_SYSTEM_PROMPT,
          JSON.stringify({ dormId: dorm.id, dormName: dorm.name, season, weather, playerNick: sanitizeText(input.playerNick, 8) || '夜巡员' }),
          900
        )
        const payload = normalizeDialoguePayload(raw)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'dialogue', payload })
        return { source: 'ai', payload }
      } catch {
        return offline()
      }
    },

    /** Agent PuzzleArchitect: geometric & rhythmic window puzzle target generator. */
    async runPuzzleAgent(input = {}) {
      const dormType = DORM_IDS.includes(String(input.dormType)) ? String(input.dormType) : 'university'
      const dorm = dormDef(dormType)
      const total = dorm.windowCount
      const wanted = Math.max(2, Math.min(total - 1, Number(input.count) || 4))
      const level = Math.max(1, Math.min(20, Number(input.level) || 1))
      const cacheKey = 'puzzle|' + fnv1a([dormType, level, wanted].join('|'))
      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizePuzzlePayload(cached, total, wanted)
        if (normalised) return { source: 'cache', payload: normalised }
      }
      const offline = () => {
        const picks = Array.from({ length: total }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, wanted)
        return { source: 'offline', payload: { patternName: '对称楼道巡灯', flavorHint: '留意同排与楼梯间的灯影', targets: picks } }
      }
      if (!configured) return offline()

      try {
        const raw = await callModel(
          PUZZLE_SYSTEM_PROMPT,
          JSON.stringify({ dormName: dorm.name, rows: dorm.rows, cols: dorm.cols, count: wanted, level, mode: String(input.mode || 'memory_sequence') }),
          600
        )
        const payload = normalizePuzzlePayload(raw, total, wanted)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'puzzle', payload })
        return { source: 'ai', payload }
      } catch {
        return offline()
      }
    },

    /** Agent InspectorCommentator: post-round AI inspector critique. */
    async runDebriefAgent(input = {}) {
      const modeId = GAME_MODE_IDS.includes(String(input.gameMode)) ? String(input.gameMode) : 'memory_sequence'
      const dormType = DORM_IDS.includes(String(input.dormType)) ? String(input.dormType) : 'university'
      const mode = gameModeDef(modeId)
      const dorm = dormDef(dormType)
      const stage = Math.max(1, Math.min(99, Number(input.stageReached) || 1))
      const acc = Math.max(0, Math.min(100, Math.round(Number(input.accuracyPct) || 0)))
      const score = Math.max(0, Number(input.score) || 0)

      const offline = () => ({
        source: 'offline',
        payload: {
          rankTitle: acc >= 92 ? '精准夜巡官' : acc >= 75 ? '细心守灯人' : '温柔见习生',
          auntComment: `${dorm.shortName}今晚的第 ${stage} 关巡查记录妥当，准确率 ${acc}%，宿管室的热茶给你留着。`,
          deanComment: acc >= 85 ? '周副校长在巡查本旁记了一句“路线熟悉，值得表扬”。' : '周副校长点点头：记住先看楼层参考窗，下次会更稳。',
          sleepTip: '把桌边小灯关剩一盏暖光，喝半杯温水再休息。',
          whisperSuggestion: `今晚在${dorm.shortName}巡完夜灯，愿大家做个好梦。`
        }
      })
      if (!configured) return offline()

      const cacheKey = 'debrief|' + fnv1a([modeId, dormType, stage, Math.floor(acc / 10)].join('|'))
      const cached = db.getCachedAiPayload(cacheKey)
      if (cached) {
        const normalised = normalizeDebriefPayload(cached)
        if (normalised) return { source: 'cache', payload: normalised }
      }
      try {
        const raw = await callModel(
          DEBRIEF_SYSTEM_PROMPT,
          JSON.stringify({ modeName: mode.name, dormName: dorm.name, stage, accuracyPct: acc, score, playerNick: sanitizeText(input.playerNick, 8) || '夜巡员' }),
          600
        )
        const payload = normalizeDebriefPayload(raw)
        if (!payload) throw new Error('schema rejected')
        db.setCachedAiPayload({ key: cacheKey, agentType: 'debrief', payload })
        return { source: 'ai', payload }
      } catch {
        return offline()
      }
    }
  }
}
