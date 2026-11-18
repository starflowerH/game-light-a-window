// Dual-mode AI client.
//
//   direct  — a judge pastes their own DeepSeek key; the browser talks to
//             api.deepseek.com itself and the key never reaches our server.
//   proxy   — the default: same-origin /api/agent/* routes, which run the four
//             agents behind SQLite caching and rate limiting.
//   offline — src/narrative-graph.js, the hand-written graph. Always available.
//
// The key lives only in a module-private closure. It is never written to
// localStorage, sessionStorage, a cookie, or window.

import {
  normalizePlanPayload,
  normalizeEvolvePayload,
  normalizeEpiloguePayload,
  normalizeDialoguePayload,
  normalizePuzzlePayload,
  normalizeDebriefPayload
} from '../shared/ai-schema.js'
import {
  PLAN_SYSTEM_PROMPT,
  EVOLVE_SYSTEM_PROMPT,
  EPILOGUE_SYSTEM_PROMPT,
  DIALOGUE_SYSTEM_PROMPT,
  PUZZLE_SYSTEM_PROMPT,
  DEBRIEF_SYSTEM_PROMPT
} from '../shared/ai-prompts.js'
import { buildOfflinePlan, buildOfflineEvolution, buildOfflineEpilogue } from './narrative-graph.js'
import { buildOfflineDialogue } from './npc-portraits.js'
import { ENDING_IDS, MOOD_TOKEN_IDS, dormDef, gameModeDef } from '../shared/constants.js'

export const DIRECT_BASE = 'https://api.deepseek.com/v1'

/** @type {string} */
let _memoryApiKey = ''
/** @type {string} */
let _memoryApiBase = DIRECT_BASE

/**
 * Store the user's key in memory for this page lifetime only.
 * @param {string} key
 * @param {string} [base]
 * @returns {boolean} true when the key looks structurally valid
 */
export function setUserApiKey(key, base = DIRECT_BASE) {
  const trimmed = String(key || '').trim()
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(trimmed)) return false
  _memoryApiKey = trimmed
  _memoryApiBase = String(base || DIRECT_BASE).replace(/\/+$/, '')
  return true
}

export function clearUserApiKey() {
  _memoryApiKey = ''
  _memoryApiBase = DIRECT_BASE
}

/**
 * @returns {{ enabled: boolean, masked: string, base: string }}
 */
export function getUserApiKeyStatus() {
  if (!_memoryApiKey) return { enabled: false, masked: '', base: _memoryApiBase }
  const tail = _memoryApiKey.slice(-4)
  return { enabled: true, masked: 'sk-****' + tail, base: _memoryApiBase }
}

/**
 * Probe a key with the smallest possible completion.
 * The request goes straight from the browser to DeepSeek; nothing is proxied.
 *
 * @param {string} key
 * @param {string} [base]
 * @returns {Promise<{ ok: boolean, status: number, message: string }>}
 */
export async function verifyUserApiKey(key, base = DIRECT_BASE) {
  const candidate = String(key || '').trim()
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(candidate)) {
    return { ok: false, status: 0, message: 'Key 格式看起来不对，通常以 sk- 开头' }
  }
  try {
    const res = await fetch(String(base || DIRECT_BASE).replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + candidate },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      }),
      signal: AbortSignal.timeout(10000)
    })
    if (res.ok) {
      setUserApiKey(candidate, base)
      return { ok: true, status: res.status, message: '已启用浏览器直连模式（Key 仅驻留内存）' }
    }
    if (res.status === 401) return { ok: false, status: 401, message: 'Key 无效或已过期（401）' }
    if (res.status === 402) return { ok: false, status: 402, message: '账户余额不足（402）' }
    if (res.status === 429) return { ok: false, status: 429, message: '请求太频繁（429），稍后再试' }
    return { ok: false, status: res.status, message: '上游返回 ' + res.status }
  } catch {
    return { ok: false, status: 0, message: '连不上 api.deepseek.com，请检查网络或代理' }
  }
}

/**
 * @param {string} content
 * @returns {string}
 */
function stripFences(content) {
  const raw = String(content || '').trim()
  const m = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (m) return m[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1)
  return raw
}

/**
 * A complete offline plan, deep-cloned so a caller can mutate it freely.
 * Kept exported because v2 code and the spec both refer to FALLBACK_NIGHTS.
 */
export const FALLBACK_NIGHTS = buildOfflinePlan('lamp', {}).nights.map(n => ({ ...n, source: 'fallback' }))

export class AIClient {
  /**
   * @param {{ timeoutMs?: number, onSource?: (source: string) => void }} [opts]
   */
  constructor({ timeoutMs = 12000, onSource } = {}) {
    this.timeoutMs = timeoutMs
    this.onSource = onSource
    /** @type {'ai'|'cache'|'offline'|'direct'} */
    this.lastSource = 'offline'
  }

  /** @returns {'direct'|'proxy'} */
  get mode() {
    return _memoryApiKey ? 'direct' : 'proxy'
  }

  /**
   * @param {string} system
   * @param {string} user
   * @param {number} maxTokens
   * @returns {Promise<any>}
   */
  async _callDirect(system, user, maxTokens) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await fetch(_memoryApiBase + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _memoryApiKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
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
      if (!res.ok) throw new Error('direct ' + res.status)
      const data = await res.json()
      const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : ''
      if (!content) throw new Error('empty completion')
      return JSON.parse(stripFences(content))
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * @param {string} path
   * @param {any} body
   * @returns {Promise<any>}
   */
  async _postProxy(path, body) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      if (!res.ok) throw new Error('proxy ' + res.status)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * @param {'ai'|'cache'|'offline'|'direct'} source
   */
  _report(source) {
    this.lastSource = source
    if (this.onSource) this.onSource(source)
  }

  /**
   * Agent 1 + 2 — the three-night baseline.
   * @param {{ moodToken?: string, unlockedEndings?: string[], playCount?: number, communityMemory?: any, uid?: string }} input
   * @returns {Promise<{ source: string, payload: any }>}
   */
  async requestInitialPlan(input = {}) {
    const mood = MOOD_TOKEN_IDS.includes(String(input.moodToken)) ? String(input.moodToken) : 'lamp'
    const unlocked = Array.isArray(input.unlockedEndings)
      ? input.unlockedEndings.filter(id => ENDING_IDS.includes(String(id)))
      : []
    const playCount = Number(input.playCount) || 0

    const offline = () => {
      const payload = normalizePlanPayload(buildOfflinePlan(mood, { unlockedEndings: unlocked, playCount }))
        || buildOfflinePlan(mood, { playCount })
      this._report('offline')
      return { source: 'offline', payload }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          PLAN_SYSTEM_PROMPT,
          JSON.stringify({ moodToken: mood, unlockedEndings: unlocked, playCount, communityMemory: input.communityMemory || null }),
          2200
        )
        const payload = normalizePlanPayload(raw)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/plan', {
        uid: input.uid || '',
        moodToken: mood,
        unlockedEndings: unlocked,
        playCount,
        communityMemory: input.communityMemory
      })
      const payload = data && data.payload ? data.payload : null
      const normalised = payload ? normalizePlanPayload(payload) : null
      if (!normalised) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload: normalised }
    } catch {
      return offline()
    }
  }

  /**
   * Agent 3 — rewrite the nights the player has not reached yet.
   * @param {{ moodToken?: string, night1Telemetry?: any, firstNight?: number, uid?: string }} input
   * @returns {Promise<{ source: string, payload: any }>}
   */
  async requestMidGameEvolution(input = {}) {
    const mood = MOOD_TOKEN_IDS.includes(String(input.moodToken)) ? String(input.moodToken) : 'lamp'
    const telemetry = input.night1Telemetry || {}
    const firstNight = Math.max(2, Math.min(3, Number(input.firstNight) || 2))

    const offline = () => {
      const fallback = buildOfflineEvolution(telemetry)
      const nights = fallback.nights.filter(n => n.night >= firstNight)
      this._report('offline')
      return { source: 'offline', payload: normalizeEvolvePayload({ nights }, firstNight) || { nights } }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          EVOLVE_SYSTEM_PROMPT,
          JSON.stringify({ moodToken: mood, night1Telemetry: telemetry, fromNight: firstNight }),
          2200
        )
        const payload = normalizeEvolvePayload(raw, firstNight)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/evolve', {
        uid: input.uid || '',
        moodToken: mood,
        night1Telemetry: telemetry,
        firstNight
      })
      const normalised = data && data.payload ? normalizeEvolvePayload(data.payload, firstNight) : null
      if (!normalised) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload: normalised }
    } catch {
      return offline()
    }
  }

  /**
   * Agent 4 — the closing letter.
   * @param {{ endingId?: string, bondRoomId?: number, totalWarmth?: number, litTotal?: number, maxCombo?: number, resonanceCount?: number, stampsEarned?: number, choicesHistory?: any[], path?: string, uid?: string }} input
   * @returns {Promise<{ source: string, payload: any }>}
   */
  async requestEndingEpilogue(input = {}) {
    const endingId = ENDING_IDS.includes(String(input.endingId)) ? String(input.endingId) : 'ENDING_F_DRIFT'
    const bondRoomId = Number(input.bondRoomId) || 0

    const offline = () => {
      const payload = normalizeEpiloguePayload(buildOfflineEpilogue({
        endingId,
        bondRoomId,
        path: input.path === 'B' ? 'B' : 'A',
        totalWarmth: Number(input.totalWarmth) || 0
      }))
      this._report('offline')
      return { source: 'offline', payload }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          EPILOGUE_SYSTEM_PROMPT,
          JSON.stringify({
            endingId,
            totalWarmth: Number(input.totalWarmth) || 0,
            litTotal: Number(input.litTotal) || 0,
            maxCombo: Number(input.maxCombo) || 0,
            resonanceCount: Number(input.resonanceCount) || 0,
            stampsEarned: Number(input.stampsEarned) || 0,
            bondRoomId,
            choicesHistory: Array.isArray(input.choicesHistory) ? input.choicesHistory : []
          }),
          1200
        )
        const payload = normalizeEpiloguePayload(raw)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/epilogue', {
        uid: input.uid || '',
        endingId,
        bondRoomId,
        totalWarmth: Number(input.totalWarmth) || 0,
        litTotal: Number(input.litTotal) || 0,
        maxCombo: Number(input.maxCombo) || 0,
        resonanceCount: Number(input.resonanceCount) || 0,
        stampsEarned: Number(input.stampsEarned) || 0,
        choicesHistory: Array.isArray(input.choicesHistory) ? input.choicesHistory : []
      })
      const normalised = data && data.payload ? normalizeEpiloguePayload(data.payload) : null
      if (!normalised) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload: normalised }
    } catch {
      return offline()
    }
  }

  /**
   * Agent DialogueDirector: generate opening / dorm-switch NPC dialogue adapted to weather & season.
   * @param {{ dormType?: string, season?: string, weather?: string, gameMode?: string, playerNick?: string }} input
   */
  async requestOpeningDialogue(input = {}) {
    const dorm = dormDef(input.dormType || 'university')
    const season = String(input.season || 'autumn')
    const weather = String(input.weather || 'clear')
    const mode = gameModeDef(input.gameMode || 'memory_sequence')

    const offline = () => {
      const payload = buildOfflineDialogue(dorm.id, season, weather)
      this._report('offline')
      return { source: 'offline', payload }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          DIALOGUE_SYSTEM_PROMPT,
          JSON.stringify({ dormId: dorm.id, dormName: dorm.name, season, weather, gameMode: mode.name, playerNick: input.playerNick || '夜巡员' }),
          900
        )
        const payload = normalizeDialoguePayload(raw)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/dialogue', {
        dormType: dorm.id,
        season,
        weather,
        gameMode: mode.id,
        playerNick: input.playerNick || '夜巡员'
      })
      const payload = data && data.payload ? normalizeDialoguePayload(data.payload) : null
      if (!payload) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload }
    } catch {
      return offline()
    }
  }

  /**
   * Agent PuzzleArchitect: design geometric / symmetrical target window pattern for memory levels.
   * @param {{ dormType?: string, rows?: number, cols?: number, count?: number, level?: number, mode?: string }} input
   */
  async requestAiPuzzle(input = {}) {
    const dorm = dormDef(input.dormType || 'university')
    const total = dorm.windowCount
    const wanted = Math.max(2, Math.min(total - 1, Number(input.count) || 4))

    const offline = () => {
      const picks = []
      const pool = Array.from({ length: total }, (_, i) => i).sort(() => Math.random() - 0.5)
      for (const idx of pool.slice(0, wanted)) picks.push(idx)
      this._report('offline')
      return {
        source: 'offline',
        payload: { patternName: '对称楼道巡灯', flavorHint: '留意同排与楼梯间的灯影', targets: picks }
      }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          PUZZLE_SYSTEM_PROMPT,
          JSON.stringify({ dormName: dorm.name, rows: dorm.rows, cols: dorm.cols, count: wanted, level: input.level || 1, mode: input.mode || 'memory_sequence' }),
          600
        )
        const payload = normalizePuzzlePayload(raw, total, wanted)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/puzzle', {
        dormType: dorm.id,
        rows: dorm.rows,
        cols: dorm.cols,
        count: wanted,
        level: Number(input.level) || 1,
        mode: String(input.mode || 'memory_sequence')
      })
      const payload = data && data.payload ? normalizePuzzlePayload(data.payload, total, wanted) : null
      if (!payload) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload }
    } catch {
      return offline()
    }
  }

  /**
   * Agent InspectorCommentator: write personalized AI evaluation after minigame completion.
   * @param {{ gameMode?: string, dormType?: string, stageReached?: number, accuracyPct?: number, score?: number, playerNick?: string }} input
   */
  async requestInspectorDebrief(input = {}) {
    const dorm = dormDef(input.dormType || 'university')
    const mode = gameModeDef(input.gameMode || 'memory_sequence')
    const acc = Math.max(0, Math.min(100, Math.round(Number(input.accuracyPct) || 0)))
    const stage = Math.max(1, Number(input.stageReached) || 1)

    const offline = () => {
      const rankTitle = acc >= 92 ? '精准夜巡官' : acc >= 75 ? '细心守灯人' : '温柔见习生'
      const auntComment = `${dorm.shortName}今晚的第 ${stage} 关巡查记录妥当，准确率 ${acc}%，宿管室的热茶给你留着。`
      const deanComment = acc >= 85 ? '周副校长在巡查本旁记了一句“路线熟悉，值得表扬”。' : '周副校长点点头：记住先看楼层参考窗，下次会更稳。'
      this._report('offline')
      return {
        source: 'offline',
        payload: {
          rankTitle,
          auntComment,
          deanComment,
          sleepTip: '把桌边小灯关剩一盏暖光，喝半杯温水再休息。',
          whisperSuggestion: `今晚在${dorm.shortName}巡完夜灯，愿大家做个好梦。`
        }
      }
    }

    if (this.mode === 'direct') {
      try {
        const raw = await this._callDirect(
          DEBRIEF_SYSTEM_PROMPT,
          JSON.stringify({ modeName: mode.name, dormName: dorm.name, stage, accuracyPct: acc, score: Number(input.score) || 0, playerNick: input.playerNick || '夜巡员' }),
          600
        )
        const payload = normalizeDebriefPayload(raw)
        if (!payload) throw new Error('schema rejected')
        this._report('direct')
        return { source: 'direct', payload }
      } catch {
        return offline()
      }
    }

    try {
      const data = await this._postProxy('/api/agent/debrief', {
        gameMode: mode.id,
        dormType: dorm.id,
        stageReached: stage,
        accuracyPct: acc,
        score: Number(input.score) || 0,
        playerNick: input.playerNick || '夜巡员'
      })
      const payload = data && data.payload ? normalizeDebriefPayload(data.payload) : null
      if (!payload) throw new Error('bad proxy payload')
      this._report(data.source || 'ai')
      return { source: data.source || 'ai', payload }
    } catch {
      return offline()
    }
  }
}
