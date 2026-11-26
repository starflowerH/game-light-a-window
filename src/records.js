// Local records plus the cloud passport.
//
// localStorage is the always-available copy (it survives a flaky server). The
// server copy is the one that follows the player between devices, keyed by an
// anonymous uid plus a six-character recovery code.

import { generateCampusNickname } from '../shared/constants.js'

const KEY = 'law.records.v3'
const NICK_KEY = 'law.nick'

/** @returns {any} */
function emptyRecords() {
  return {
    bestWarmth: 0,
    bestCombo: 0,
    plays: 0,
    totalWindows: 0,
    bestNight: 0,
    items: [],
    history: [],
    uid: '',
    passCode: '',
    nickname: '',
    unlockedEndings: [],
    residentBonds: {},
    titles: ['夜巡新人'],
    lastEnding: '',
    preferredDorm: 'university',
    preferredSeason: 'autumn',
    preferredWeather: 'clear',
    preferredMode: 'memory_sequence',
    preferredQuality: 'auto'
  }
}

/**
 * Read the local record set, repairing anything a previous version left behind.
 * @returns {any}
 */
export function loadRecords() {
  const base = emptyRecords()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (!raw || typeof raw !== 'object') return base
    return {
      ...base,
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      history: Array.isArray(raw.history) ? raw.history : [],
      unlockedEndings: Array.isArray(raw.unlockedEndings) ? raw.unlockedEndings : [],
      titles: Array.isArray(raw.titles) && raw.titles.length ? raw.titles : base.titles,
      residentBonds: raw.residentBonds && typeof raw.residentBonds === 'object' ? raw.residentBonds : {}
    }
  } catch {
    return base
  }
}

/** @param {any} r */
export function saveRecords(r) {
  try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* private mode */ }
  return r
}

/** @returns {string} */
export function loadNickname() {
  try { return localStorage.getItem(NICK_KEY) || '' } catch { return '' }
}

/**
 * Return existing custom nickname, or auto-assign and persist a random campus nickname.
 * @returns {string}
 */
export function ensureNickname() {
  const existing = loadNickname()
  if (existing && existing.trim()) return existing.trim().slice(0, 8)
  const generated = generateCampusNickname()
  saveNickname(generated)
  return generated
}

/** @param {string} name */
export function saveNickname(name) {
  try { localStorage.setItem(NICK_KEY, String(name || '').slice(0, 8)) } catch { /* ignore */ }
}

/**
 * Fold one finished run into the record set. Pure: the input is not mutated.
 *
 * @param {any} records
 * @param {{
 *   totalWarmth?: number, maxCombo?: number, litTotal?: number, bestNightWarmth?: number,
 *   items?: string[], nights?: number, endingId?: string, unlockedEndings?: string[],
 *   residentBonds?: Record<string, number>, titles?: string[]
 * }} run
 * @returns {any}
 */
export function mergeRun(records, run) {
  const base = { ...emptyRecords(), ...(records || {}) }
  const r = {
    ...base,
    items: [...(base.items || [])],
    history: [...(base.history || [])],
    unlockedEndings: [...(base.unlockedEndings || [])],
    titles: [...(base.titles || [])],
    residentBonds: { ...(base.residentBonds || {}) }
  }
  r.plays += 1
  r.bestWarmth = Math.max(r.bestWarmth, run.totalWarmth || 0)
  r.bestCombo = Math.max(r.bestCombo, run.maxCombo || 0)
  r.totalWindows += run.litTotal || 0
  r.bestNight = Math.max(r.bestNight, run.bestNightWarmth || 0)
  r.items = Array.from(new Set([...(r.items || []), ...(run.items || [])])).slice(0, 60)
  r.history = [{ t: Date.now(), warmth: run.totalWarmth || 0, combo: run.maxCombo || 0, lit: run.litTotal || 0, nights: run.nights }, ...(r.history || [])].slice(0, 20)
  r.unlockedEndings = Array.from(new Set([...r.unlockedEndings, ...(run.unlockedEndings || [])]))
  for (const [room, level] of Object.entries(run.residentBonds || {})) {
    r.residentBonds[room] = Math.max(Number(r.residentBonds[room]) || 0, Number(level) || 0)
  }
  r.titles = Array.from(new Set([...r.titles, ...(run.titles || [])])).slice(0, 20)
  if (run.endingId) r.lastEnding = run.endingId
  return r
}

/**
 * Adopt the fields the server owns, without losing local-only counters.
 * @param {any} local
 * @param {any} player
 * @returns {any}
 */
export function adoptCloudPlayer(local, player) {
  if (!player || typeof player !== 'object') return local
  const r = { ...emptyRecords(), ...(local || {}) }
  r.uid = String(player.uid || r.uid || '')
  r.passCode = String(player.passCode || r.passCode || '')
  r.nickname = String(player.nickname || r.nickname || '')
  r.plays = Math.max(Number(r.plays) || 0, Number(player.plays) || 0)
  r.bestWarmth = Math.max(Number(r.bestWarmth) || 0, Number(player.bestWarmth) || 0)
  r.bestCombo = Math.max(Number(r.bestCombo) || 0, Number(player.bestCombo) || 0)
  r.totalWindows = Math.max(Number(r.totalWindows) || 0, Number(player.totalWindows) || 0)
  r.unlockedEndings = Array.from(new Set([...(r.unlockedEndings || []), ...(player.unlockedEndings || [])]))
  r.items = Array.from(new Set([...(r.items || []), ...(player.unlockedItems || [])])).slice(0, 60)
  r.titles = Array.from(new Set([...(r.titles || []), ...(player.titles || [])]))
  for (const [room, level] of Object.entries(player.residentBonds || {})) {
    r.residentBonds[room] = Math.max(Number(r.residentBonds[room]) || 0, Number(level) || 0)
  }
  return r
}

/**
 * @param {string} url
 * @param {number} ms
 * @returns {Promise<any|null>}
 */
async function getJson(url, ms = 8000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * @param {string} url
 * @param {any} body
 * @param {number} ms
 * @returns {Promise<any|null>}
 */
async function postJson(url, body, ms = 12000) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms)
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Fetch or create the cloud passport and the first-screen payload.
 * @param {{ uid?: string, passCode?: string }} identity
 * @returns {Promise<{ player: any, globalStats: any, windowHeat: any[], whispers: any[] } | null>}
 */
export async function bootstrapProfile(identity = {}) {
  const params = new URLSearchParams()
  if (identity.uid) params.set('uid', identity.uid)
  if (identity.passCode) params.set('passCode', identity.passCode)
  const q = params.toString()
  const data = await getJson('/api/bootstrap' + (q ? '?' + q : ''))
  if (!data || !data.ok) return null
  return {
    player: data.player,
    globalStats: data.globalStats,
    windowHeat: data.windowHeat || [],
    whispers: data.whispers || []
  }
}

/**
 * Push a finished run to the cloud profile.
 * @param {any} run
 * @param {{ uid?: string, nickname?: string }} [identity]
 * @returns {Promise<{ rank: number, player: any } | null>}
 */
export async function syncRun(run, identity = {}) {
  const data = await postJson('/api/score', {
    uid: identity.uid || '',
    nickname: identity.nickname || '',
    endingId: run.endingId || 'ENDING_F_DRIFT',
    archetype: run.archetype || '',
    litWindows: run.litTotal || 0,
    maxCombo: run.maxCombo || 0,
    totalWarmth: run.totalWarmth || run.score || 0,
    resonances: run.resonanceCount || 0,
    stamps: run.stampsEarned || 0,
    items: run.items || [],
    unlockedEndings: run.unlockedEndings || [],
    residentBonds: run.residentBonds || {},
    titles: run.titles || [],
    litRoomIds: run.litRoomIds || [],
    nightsSummary: run.nightsSummary || [],
    letter: run.letter || {},
    // v4 fields
    gameMode: run.gameMode || 'star_sweep',
    dormType: run.dormType || 'university',
    season: run.season || 'autumn',
    weather: run.weather || 'clear',
    stageReached: run.stageReached || 1,
    correctCount: run.correctCount || run.litTotal || 0,
    accuracyPct: run.accuracyPct || 0,
    score: run.score || run.totalWarmth || 0
  })
  if (!data || !data.ok) return null
  return { rank: data.rank, player: data.player }
}

/**
 * Seal a whispered line into one window.
 * @param {{ uid?: string, nickname?: string, roomId: number, content: string, moodToken?: string }} input
 */
export async function sealWhisper(input) {
  const data = await postJson('/api/whispers', {
    uid: input.uid || '',
    nickname: input.nickname || '',
    roomId: input.roomId,
    content: input.content,
    moodToken: input.moodToken || 'lamp'
  }, 9000)
  if (!data || !data.ok) return null
  return data.whisper
}

/**
 * @param {number} id
 * @param {string} [uid]
 */
export async function likeWhisper(id, uid = '') {
  const data = await postJson('/api/whispers/' + Number(id) + '/like', { uid }, 9000)
  if (!data || !data.ok) return null
  return data.resonances
}

/**
 * @param {{ roomId?: number, limit?: number }} [opts]
 * @returns {Promise<any[]>}
 */
export async function fetchWhispers({ roomId, limit = 12 } = {}) {
  const params = new URLSearchParams()
  if (Number.isFinite(Number(roomId))) params.set('roomId', String(roomId))
  params.set('limit', String(limit))
  const data = await getJson('/api/whispers?' + params.toString())
  return data && data.ok ? data.items : []
}

/**
 * @param {{ scope?: 'all'|'tonight', limit?: number, mode?: string, dormType?: string }} [opts]
 * @returns {Promise<any[]>}
 */
export async function fetchLeaderboard({ scope = 'all', limit = 20, mode = '', dormType = '' } = {}) {
  const q = new URLSearchParams({ scope, limit: String(limit) })
  if (mode) q.set('mode', mode)
  if (dormType) q.set('dormType', dormType)
  const data = await getJson('/api/leaderboard?' + q.toString())
  return data && data.ok ? data.items : []
}

/**
 * Fetch leaderboard items along with the player's own rank summary (`myRank`).
 * @param {{ scope?: 'all'|'tonight', limit?: number, mode?: string, dormType?: string, uid?: string }} [opts]
 * @returns {Promise<{ items: any[], myRank: any, totalEntries: number, totalPlayers: number, offline: boolean }>}
 */
export async function fetchLeaderboardWithRank({ scope = 'all', limit = 20, mode = '', dormType = '', uid = '' } = {}) {
  const q = new URLSearchParams({ scope, limit: String(limit) })
  if (mode) q.set('mode', mode)
  if (dormType) q.set('dormType', dormType)
  if (uid) q.set('uid', uid)
  const data = await getJson('/api/leaderboard?' + q.toString())
  if (!data || !data.ok) return { items: [], myRank: null, totalEntries: 0, totalPlayers: 0, offline: true }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    myRank: data.myRank || null,
    totalEntries: Number(data.totalEntries) || 0,
    totalPlayers: Number(data.totalPlayers) || 0,
    offline: false
  }
}

/** @returns {Promise<{ totalLit: number } | null>} */
export async function fetchGlobalStats() {
  const data = await getJson('/api/health', 6000)
  if (!data || !data.ok) return null
  return { totalLit: data.globalLitWindows || 0 }
}

/**
 * Report a client-side error so production breakage is visible in the DB.
 * @param {string} message
 * @param {any} [detail]
 */
export function reportClientError(message, detail) {
  postJson('/api/telemetry', {
    eventType: 'client_error',
    payload: { message: String(message).slice(0, 200), detail: detail || null }
  }, 5000)
}
