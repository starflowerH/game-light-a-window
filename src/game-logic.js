// Pure gameplay logic, kept free of DOM and Three.js so it can be unit tested.
//
// v3 rule changes, all from docs/v3_plan/01:
//   - five-state window grid (see shared/constants.js)
//   - one-stroke drag chain scoring
//   - nightly notebook commissions with wax-seal stamps
//   - a six-way ending router evaluated in priority order

import {
  CORE_RESIDENT_ROOMS,
  INDEX_TO_ROOM,
  NIGHT_COUNT,
  NIGHT_SECONDS,
  ROOM_TO_INDEX,
  STORY_BEACON_SCHEDULE,
  WINDOW_COUNT,
  isActionable,
  roomsOnFloor
} from '../shared/constants.js'

export { NIGHT_COUNT, NIGHT_SECONDS, WINDOW_COUNT }

/**
 * Warmth gained by a tap, driven by the current combo length.
 *
 * v3 ladder (spec 01 §2.1): 1-2 -> +3, 3-5 -> +4, 6-9 -> +6, 10+ -> +8.
 * The curve is deliberately steeper than v2 so a long chain feels materially
 * better than a slow tap-by-tap run.
 *
 * @param {number} combo
 * @returns {number}
 */
export function gainForCombo(combo) {
  const c = Math.max(0, Math.floor(Number(combo) || 0))
  if (c >= 10) return 8
  if (c >= 6) return 6
  if (c >= 3) return 4
  return 3
}

/**
 * One-stroke chain scoring (spec 01 §2.2):
 *   Bonus(k) = gainForCombo(combo) + 2 * min(k, 5)
 *
 * @param {number} combo the combo value *before* this window is added
 * @param {number} chainLength how many windows this stroke has lit so far
 * @returns {number}
 */
export function gainForDragChain(combo, chainLength) {
  const k = Math.max(1, Math.floor(Number(chainLength) || 1))
  return gainForCombo(combo) + 2 * Math.min(k, 5)
}

/**
 * A stroke that lights three or more windows triggers the golden 一笔连光
 * callout, the harp glissando and one free neighbouring window.
 * @param {number} chainLength
 * @returns {boolean}
 */
export function isChainCallout(chainLength) {
  return Number(chainLength) >= 3
}

/**
 * Checks whether all windows on a specified floor are currently lit (C3 Floor Clear).
 *
 * @param {any} windows
 *   Array of window objects (with roomId/state/lit) or array of lit room IDs.
 * @param {number} floor
 *   Floor number (e.g. 1, 2, 3, 4, 5).
 * @param {number} [cols=6]
 *   Number of columns / rooms per floor.
 * @returns {boolean}
 */
export function floorCleared(windows, floor, cols = 6) {
  if (!Array.isArray(windows)) return false
  const targetRooms = roomsOnFloor(floor, cols)
  if (!targetRooms || targetRooms.length === 0) return false

  const litSet = new Set()
  for (const item of windows) {
    if (typeof item === 'number') {
      litSet.add(item)
    } else if (item && typeof item === 'object') {
      const roomId = Number(item.roomId ?? item.id)
      const isLit = item.state === 'lit' || item.lit === true
      if (roomId && isLit) {
        litSet.add(roomId)
      }
    }
  }

  return targetRooms.every(r => litSet.has(r))
}

/**
 * When a night ends with this much time left, the encore round starts.
 * @param {number} secondsLeft
 * @returns {boolean}
 */
export function shouldEncore(secondsLeft) {
  return Number(secondsLeft) > 8
}

// ---------------------------------------------------------------------------
// Surprises
// ---------------------------------------------------------------------------

/**
 * @typedef {{ text: string, gain: number, rarity: 'common'|'rare'|'legendary' }} SurpriseDef
 */

/** @type {Record<string, SurpriseDef>} */
export const SURPRISES = {
  golden:   { text: '金窗 · 一间屋子忽然全亮了', gain: 12, rarity: 'legendary' },
  star:     { text: '流星划过 · 许个愿吧',       gain: 9,  rarity: 'rare' },
  lanterns: { text: '有人放了灯 · 一整排飘起来', gain: 10, rarity: 'rare' },
  cat:      { text: '屋顶上蹲着一只猫 · 它看着你', gain: 8,  rarity: 'common' },
  chain:    { text: '连光 · 隔壁的窗也亮了',     gain: 8,  rarity: 'common' }
}

export const SURPRISE_COOLDOWN_MS = 6500
export const COMBO_SURPRISE_INTERVAL = 10

/**
 * @param {number} roll random value in [0, 1)
 * @param {number} sinceRare commons since the last rare
 * @returns {string}
 */
export function pickSurprise(roll, sinceRare = 0) {
  if (sinceRare >= 12) return 'golden'
  if (sinceRare >= 6) return 'star'
  if (roll < 0.22) return 'golden'
  if (roll < 0.40) return 'star'
  if (roll < 0.56) return 'lanterns'
  if (roll < 0.68) return 'cat'
  return 'chain'
}

/**
 * @param {number} now
 * @param {number} lastSurprise
 * @returns {boolean}
 */
export function canSurprise(now, lastSurprise) {
  return now - lastSurprise >= SURPRISE_COOLDOWN_MS
}

/**
 * @param {number} combo
 * @returns {{ sound: string|null, chain: boolean }}
 */
export function comboMilestone(combo) {
  if (combo <= 0) return { sound: null, chain: false }
  const sound = combo % COMBO_SURPRISE_INTERVAL === 0 ? 'comboUp' : (combo % 5 === 0 ? 'comboUp' : null)
  return { sound, chain: combo % COMBO_SURPRISE_INTERVAL === 0 }
}

// ---------------------------------------------------------------------------
// Window selection
// ---------------------------------------------------------------------------

/**
 * Read the state of a window object that may use either the v2 boolean flag or
 * the v3 state string.
 * @param {{ state?: string, lit?: boolean }} w
 * @returns {string}
 */
export function windowStateOf(w) {
  if (!w) return 'dark'
  if (typeof w.state === 'string') return w.state
  return w.lit ? 'lit' : 'dark'
}

/**
 * Legacy helper kept for the v2 tests: pick any window that is not lit yet.
 * @template {{ lit: boolean }} T
 * @param {T[]} windows
 * @param {() => number} rng
 * @returns {T | null}
 */
export function pickUnlitWindow(windows, rng = Math.random) {
  const pending = windows.filter(w => !w.lit)
  if (!pending.length) return null
  return pending[Math.floor(rng() * pending.length)]
}

/**
 * Choose the next window to wake into GLIMMER.
 *
 * Picks only DARK windows, never one that is already actionable, and gently
 * favours the six resident rooms so a beacon always feels reachable. Returns
 * null when every window is awake, which the scheduler treats as "the field is
 * full".
 *
 * @template {{ idx: number, state?: string, lit?: boolean, roomId?: number }} T
 * @param {T[]} windows
 * @param {number[]} [coreRoomsPriority] room ids to favour, default the six residents
 * @param {() => number} [rng]
 * @returns {T | null}
 */
export function pickNextGlimmerWindow(windows, coreRoomsPriority = CORE_RESIDENT_ROOMS, rng = Math.random) {
  const dark = windows.filter(w => {
    const s = windowStateOf(w)
    return s === 'dark' && !w.lit
  })
  if (!dark.length) return null

  const roomOf = w => (typeof w.roomId === 'number' ? w.roomId : INDEX_TO_ROOM[w.idx])
  const core = dark.filter(w => coreRoomsPriority.includes(roomOf(w)))

  // 34% of the time prefer a resident room, so story beacons stay in reach
  // without the whole building feeling scripted.
  if (core.length && rng() < 0.34) {
    return core[Math.floor(rng() * core.length)]
  }
  return dark[Math.floor(rng() * dark.length)]
}

/**
 * How many windows are currently actionable (glimmer / beacon / resonance).
 * @param {Array<{ state?: string, lit?: boolean }>} windows
 * @returns {number}
 */
export function actionableCount(windows) {
  return windows.filter(w => isActionable(windowStateOf(w))).length
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string, type: string, target: number, label: string, floor?: number
 * }} Commission
 *
 * @typedef {{
 *   litCount?: number,
 *   maxCombo?: number,
 *   bestChain?: number,
 *   resonanceCount?: number,
 *   storyChoices?: number,
 *   bondRooms?: number,
 *   litRooms?: number[],
 *   dormCols?: number,
 *   stamped?: string[]
 * }} NightState
 */

/**
 * @param {Commission} c
 * @param {NightState} s
 * @returns {number}
 */
export function commissionProgress(c, s) {
  const state = s || {}
  switch (c.type) {
    case 'lit_count':
      return Number(state.litCount) || 0
    case 'max_combo':
      return Number(state.maxCombo) || 0
    case 'drag_chain':
      return Number(state.bestChain) || 0
    case 'resonance':
      return Number(state.resonanceCount) || 0
    case 'story_choice':
      return Number(state.storyChoices) || 0
    case 'bond_rooms':
      return Number(state.bondRooms) || 0
    case 'all_lit':
      return (state.litRooms || []).length
    case 'row_lit': {
      const floor = Number(c.floor) || 3
      const want = roomsOnFloor(floor, Number(state.dormCols) || undefined)
      const lit = new Set(state.litRooms || [])
      return want.filter(r => lit.has(r)).length
    }
    default:
      return 0
  }
}

/**
 * Evaluate the three commissions for one night.
 *
 * @param {Commission[]} commissions
 * @param {NightState} nightState
 * @returns {{
 *   items: Array<{ id: string, label: string, type: string, target: number, progress: number, done: boolean }>,
 *   newlyStamped: string[],
 *   allDone: boolean
 * }}
 */
export function evaluateCommissions(commissions, nightState) {
  const list = Array.isArray(commissions) ? commissions : []
  const stamped = new Set(Array.isArray(nightState?.stamped) ? nightState.stamped : [])
  const items = []
  const newlyStamped = []

  for (const c of list) {
    if (!c || typeof c !== 'object') continue
    const target = Math.max(1, Number(c.target) || 1)
    const progress = Math.min(target, commissionProgress(c, nightState))
    const done = progress >= target
    items.push({ id: String(c.id || c.type), label: String(c.label || ''), type: String(c.type || ''), target, progress, done })
    if (done && !stamped.has(String(c.id || c.type))) newlyStamped.push(String(c.id || c.type))
  }

  return {
    items,
    newlyStamped,
    allDone: items.length > 0 && items.every(i => i.done)
  }
}

// ---------------------------------------------------------------------------
// Ending router
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   litCount?: number,
 *   litRooms?: number[],
 *   allLit?: boolean,
 *   resonanceCount?: number,
 *   star?: number,
 *   cat?: number
 * }} NightSummaryInput
 */

/**
 * @typedef {{
 *   totalWarmth?: number,
 *   litTotal?: number,
 *   maxCombo?: number,
 *   resonanceCount?: number,
 *   stampsEarned?: number,
 *   nights?: NightSummaryInput[],
 *   choices?: Array<{ roomId: number, choiceId?: string, label?: string }>,
 *   residentsAwoken?: number[],
 *   events?: Record<string, number>,
 *   bonds?: Record<string, number>
 * }} RunSummary
 */

/**
 * @param {NightSummaryInput | any} n
 * @returns {number[]}
 */
function nightRooms(n) {
  if (!n) return []
  if (Array.isArray(n.litRooms)) return n.litRooms.map(Number).filter(Number.isFinite)
  if (Array.isArray(n.rooms)) return n.rooms.map(Number).filter(Number.isFinite)
  if (n.lit && typeof n.lit === 'object' && typeof n.lit[Symbol.iterator] === 'function') {
    return Array.from(n.lit).map(Number).filter(Number.isFinite)
  }
  if (n.lit instanceof Set) return Array.from(n.lit)
  return []
}

/**
 * Resolve which of the six endings this run has earned.
 *
 * The order in ENDINGS is the priority order: the most specific IF lines win.
 *
 * @param {RunSummary} [runSummary]
 * @returns {{ endingId: string, bondRoomId: number, reason: string }}
 */
export function resolveEnding(runSummary = {}) {
  const s = runSummary || {}
  const nights = Array.isArray(s.nights) ? s.nights : []
  const choices = Array.isArray(s.choices) ? s.choices : []
  const events = s.events && typeof s.events === 'object' ? s.events : {}

  const totalWarmth = Number(s.totalWarmth) || 0
  const litTotal = Number(s.litTotal) || 0
  const resonanceCount = Number(s.resonanceCount) || 0
  const stampsEarned = Number(s.stampsEarned) || 0

  const lit406EveryNight = nights.length >= 3 && nights.slice(0, 3).every(n => nightRooms(n).includes(406))
  const choseCloud = choices.some(c => Number(c.roomId) === 406 && (c.choiceId === 'A' || /云/.test(String(c.label || ''))))
  const choseCat = choices.some(c => Number(c.roomId) === 406 && (c.choiceId === 'B' || /猫/.test(String(c.label || ''))))
  const skyEvent = (Number(events.star) || 0) > 0 || (Number(events.cat) || 0) > 0

  const chose205 = choices.some(c => Number(c.roomId) === 205)
  const fullLitNights = nights.filter(n => nightRooms(n).length >= WINDOW_COUNT).length
  const residentsAwoken = Array.isArray(s.residentsAwoken) ? s.residentsAwoken.length : 0
  const lit304or301 = nights.some(n => {
    const rooms = nightRooms(n)
    return rooms.includes(304) || rooms.includes(301)
  })

  const bondRoomId = deepestBond(choices, s.bonds)

  // 1) ENDING_C · 屋顶的银河 — hidden IF line
  if (lit406EveryNight && (choseCloud || choseCat) && skyEvent) {
    return { endingId: 'ENDING_C_STARGAZER', bondRoomId: 406, reason: '三晚 406 + 云/猫抉择 + 流星或屋顶猫事件' }
  }

  // 2) ENDING_D · 晚风大合唱 — hidden IF line
  if (resonanceCount >= 3 && chose205) {
    return { endingId: 'ENDING_D_HARMONY', bondRoomId: 205, reason: '三次跨窗共鸣 + 205 广播分支' }
  }

  // 3) ENDING_E · 破晓第一缕光 — master line
  if (totalWarmth >= 480 && stampsEarned >= 7 && fullLitNights >= 2) {
    return { endingId: 'ENDING_E_DAWN', bondRoomId: 102, reason: '温暖≥480 + 火漆章≥7 + 两晚全亮' }
  }

  // 4) ENDING_A · 万家灯火 — main true ending
  if (litTotal >= 54 && residentsAwoken >= 4) {
    return { endingId: 'ENDING_A_WARMTH', bondRoomId: deepestBond(choices, s.bonds) || 203, reason: '累计点亮≥54 + 唤醒≥4位住户' }
  }

  // 5) ENDING_B · 留一盏夜灯 — main gentle ending
  if (choices.length >= 3 && lit304or301) {
    return { endingId: 'ENDING_B_COMPANION', bondRoomId: deepestBond(choices, s.bonds) || 304, reason: '≥3 次微光抉择 + 点亮 304 或 301' }
  }

  // 6) ENDING_F · 未完的草稿 — zero-pressure default
  return { endingId: 'ENDING_F_DRIFT', bondRoomId: bondRoomId || 301, reason: '默认保底' }
}

/**
 * @param {Array<{ roomId: number, choiceId?: string }>} choices
 * @param {Record<string, number>} [bonds]
 * @returns {number}
 */
function deepestBond(choices, bonds) {
  const counts = new Map()
  for (const c of choices) {
    const id = Number(c && c.roomId)
    if (!CORE_RESIDENT_ROOMS.includes(id)) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  let best = 0
  let bestScore = -1
  for (const roomId of CORE_RESIDENT_ROOMS) {
    const level = Number((bonds && (bonds[roomId] ?? bonds[String(roomId)])) || 0)
    const score = level * 10 + (counts.get(roomId) || 0)
    if (score > bestScore) { bestScore = score; best = roomId }
  }
  return best
}

/**
 * Bond increment for a resident room, capped at 3 so the UI's three-pip meter
 * is meaningful.
 * @param {number} current
 * @returns {number}
 */
export function bumpBond(current) {
  return Math.min(3, Math.max(0, Math.floor(Number(current) || 0)) + 1)
}

// ---------------------------------------------------------------------------
// Schedules (kept exported for the v2 compatibility tests)
// ---------------------------------------------------------------------------

/**
 * Seconds into the night when a story beacon is guaranteed to appear.
 * v3 raises this to the 2-3 per night defined in spec 01 §6.
 */
export const STORY_SCHEDULE = STORY_BEACON_SCHEDULE

/**
 * Room id for a window index, mirrored here so callers do not need constants.js.
 * @param {number} idx
 * @returns {number}
 */
export function roomForIndex(idx) {
  return INDEX_TO_ROOM[idx] || 0
}

/**
 * Window index for a room id.
 * @param {number} roomId
 * @returns {number}
 */
export function indexForRoom(roomId) {
  const idx = ROOM_TO_INDEX[Number(roomId)]
  return idx === undefined ? -1 : idx
}
