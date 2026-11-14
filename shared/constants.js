// Shared constants for《今晚，亮一盏灯 · Light A Window》v3.0.
//
// This module is imported by BOTH the backend and the browser, exactly like
// shared/ai-schema.js. Keep it dependency-free and side-effect-free: it must
// run in Node and in a bundler without a build step.

// ---------------------------------------------------------------- geometry

export const ROWS = 4
export const COLS = 6
export const WINDOW_COUNT = ROWS * COLS
export const NIGHT_COUNT = 3
export const NIGHT_SECONDS = 75

/**
 * The 24 windows of dormitory #17.
 *
 * Layout is 4 floors x 6 rooms, row 0 is the ground floor. The room number is
 * the floor times one hundred plus the column plus one, so index 0 -> 101,
 * index 23 -> 406. Everything else (art, narrative, commissions, heatmap)
 * keys off this one table.
 *
 * @typedef {{ idx: number, roomId: number, row: number, col: number, floor: number }} WindowId
 * @type {WindowId[]}
 */
export const WINDOW_IDS = Array.from({ length: WINDOW_COUNT }, (_, idx) => {
  const row = Math.floor(idx / COLS)
  const col = idx % COLS
  return { idx, roomId: (row + 1) * 100 + (col + 1), row, col, floor: row + 1 }
})

/** @type {Record<number, number>} roomId -> idx */
export const ROOM_TO_INDEX = Object.fromEntries(WINDOW_IDS.map(w => [w.roomId, w.idx]))

/** @type {number[]} idx -> roomId */
export const INDEX_TO_ROOM = WINDOW_IDS.map(w => w.roomId)

/**
 * @param {number} idx
 * @returns {number} room number such as 304
 */
export function roomIdForIndex(idx) {
  const w = WINDOW_IDS[idx]
  return w ? w.roomId : 0
}

/**
 * @param {number} roomId
 * @returns {number} window index, or -1 when the room does not exist
 */
export function indexForRoomId(roomId) {
  const idx = ROOM_TO_INDEX[Number(roomId)]
  return idx === undefined ? -1 : idx
}

/**
 * Every room on one floor, in left-to-right order.
 * @param {number} floor 1..4
 * @returns {number[]}
 */
export function roomsOnFloor(floor) {
  return WINDOW_IDS.filter(w => w.floor === floor).map(w => w.roomId)
}

// ---------------------------------------------------------------- residents

/**
 * The six residents with a continuous three-night arc. These rooms are also
 * the only ones allowed to host a STORY_BEACON.
 * @type {number[]}
 */
export const CORE_RESIDENT_ROOMS = [102, 203, 205, 301, 304, 406]

/** @type {number[]} */
export const CORE_RESIDENT_INDEXES = CORE_RESIDENT_ROOMS.map(indexForRoomId)

// ------------------------------------------------------------ window states

export const WINDOW_STATES = {
  DARK: 'dark',
  GLIMMER: 'glimmer',
  LIT: 'lit',
  STORY_BEACON: 'story_beacon',
  RESONANCE_PAIR: 'resonance_pair'
}

/** States the player can act on with a tap or a swipe. */
export const ACTIONABLE_STATES = [
  WINDOW_STATES.GLIMMER,
  WINDOW_STATES.STORY_BEACON,
  WINDOW_STATES.RESONANCE_PAIR
]

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isActionable(state) {
  return ACTIONABLE_STATES.includes(state)
}

// ------------------------------------------------------------------- tempo

/**
 * Rhythm parameters that drive the glimmer scheduler. The AI only ever picks
 * one of three names; these numbers are what the player actually feels.
 *
 * @typedef {{
 *   initialGlimmer: number,
 *   maxGlimmer: number,
 *   spawnIntervalMs: number,
 *   glimmerDurationMs: number,
 *   comboWindowMs: number
 * }} TempoConfig
 *
 * @type {Record<'slow'|'normal'|'brisk', TempoConfig>}
 */
export const TEMPO_CONFIG = {
  slow: { initialGlimmer: 3, maxGlimmer: 5, spawnIntervalMs: 1100, glimmerDurationMs: 3800, comboWindowMs: 2400 },
  normal: { initialGlimmer: 4, maxGlimmer: 6, spawnIntervalMs: 850, glimmerDurationMs: 3200, comboWindowMs: 2100 },
  brisk: { initialGlimmer: 5, maxGlimmer: 8, spawnIntervalMs: 650, glimmerDurationMs: 2700, comboWindowMs: 1900 }
}

/**
 * @param {string} tempo
 * @returns {TempoConfig}
 */
export function tempoConfig(tempo) {
  return TEMPO_CONFIG[/** @type {'slow'|'normal'|'brisk'} */ (tempo)] || TEMPO_CONFIG.normal
}

/** When fewer than this many windows are actionable, top the field up. */
export const MIN_ACTIONABLE_GLIMMER = 2
/** …and do it within this budget. */
export const GLIMMER_REFILL_MS = 200

// ------------------------------------------------------------- mood tokens

/**
 * @typedef {{ id: string, name: string, hint: string, icon: string, tempo: string, palette: string }} MoodToken
 * @type {MoodToken[]}
 */
export const MOOD_TOKENS = [
  { id: 'umbrella', name: '听雨的伞', hint: '偏安静，慢一点也没关系', icon: '☂', tempo: 'slow', palette: 'rainy_amber' },
  { id: 'earphones', name: '吹风的耳机', hint: '偏律动，喜欢连成一片', icon: '🎧', tempo: 'brisk', palette: 'warm_blue' },
  { id: 'quilt', name: '晒月亮的被子', hint: '偏温暖，晴夜的月光', icon: '🛏', tempo: 'normal', palette: 'clear_peach' },
  { id: 'lamp', name: '亮着的台灯', hint: '偏故事，想多看看窗后', icon: '💡', tempo: 'normal', palette: 'foggy_lilac' }
]

/** @type {string[]} */
export const MOOD_TOKEN_IDS = MOOD_TOKENS.map(m => m.id)

/**
 * @param {string} id
 * @returns {MoodToken}
 */
export function moodToken(id) {
  return MOOD_TOKENS.find(m => m.id === id) || MOOD_TOKENS[3]
}

// ---------------------------------------------------------------- endings

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   type: string,
 *   badge: string,
 *   title: string,
 *   palette: string,
 *   letterFromRoom: number,
 *   clue: string
 * }} EndingMeta
 *
 * Order matters: resolveEnding() walks this list top to bottom, so the most
 * specific IF lines must come before the general ones.
 *
 * @type {EndingMeta[]}
 */
export const ENDINGS = [
  {
    id: 'ENDING_C_STARGAZER',
    name: '屋顶的银河 · 天台特别篇',
    type: 'hidden',
    badge: '🌟',
    title: '天台追星人',
    palette: 'starry_gold',
    letterFromRoom: 406,
    clue: '三晚都点亮 406，并且陪那个等流星的少年等到过云开。'
  },
  {
    id: 'ENDING_D_HARMONY',
    name: '晚风大合唱 · 跨窗交响',
    type: 'hidden',
    badge: '🎵',
    title: '连光指挥家',
    palette: 'amber_score',
    letterFromRoom: 205,
    clue: '累计三次跨窗共鸣，并且把 205 的广播接进过别人的灯里。'
  },
  {
    id: 'ENDING_E_DAWN',
    name: '破晓第一缕光 · 晨曦全满',
    type: 'master',
    badge: '🌅',
    title: '破晓守夜人',
    palette: 'dawn_rose',
    letterFromRoom: 102,
    clue: '温暖值、火漆章、整栋全亮，三样都做到极致。'
  },
  {
    id: 'ENDING_A_WARMTH',
    name: '万家灯火 · 17号楼的春天',
    type: 'main',
    badge: '🏮',
    title: '温暖点灯人',
    palette: 'warm_amber',
    letterFromRoom: 203,
    clue: '三晚点亮超过五十四扇窗，并唤醒至少四位住户。'
  },
  {
    id: 'ENDING_B_COMPANION',
    name: '留一盏夜灯 · 温柔陪伴',
    type: 'main',
    badge: '🍵',
    title: '静夜倾听者',
    palette: 'lilac_mist',
    letterFromRoom: 304,
    clue: '做过三次微光抉择，并留在 304 或 301 的窗边。'
  },
  {
    id: 'ENDING_F_DRIFT',
    name: '未完的草稿 · 今晚好梦',
    type: 'default',
    badge: '🌙',
    title: '夜色漫步者',
    palette: 'moon_blue',
    letterFromRoom: 301,
    clue: '其余所有夜晚的保底收束，没有失败，也不需要赶。'
  }
]

/** @type {Record<string, EndingMeta>} */
export const ENDING_BY_ID = Object.fromEntries(ENDINGS.map(e => [e.id, e]))

/** @type {string[]} */
export const ENDING_IDS = ENDINGS.map(e => e.id)

/**
 * @param {string} id
 * @returns {EndingMeta}
 */
export function endingMeta(id) {
  return ENDING_BY_ID[id] || ENDING_BY_ID.ENDING_F_DRIFT
}

// -------------------------------------------------------------- scoring

/** Warmth added when the 24th window of a night turns lit. */
export const ALL_LIT_BONUS = 25
/** Windows flipped back to GLIMMER for the encore round. */
export const ENCORE_RESET_COUNT = 8
/** If more than this much time is left, the encore round starts. */
export const ENCORE_MIN_TIME_LEFT_S = 8
/** Delay between "the whole building is lit" and the encore round. */
export const ENCORE_DELAY_MS = 1800
/** Bonus warmth for one completed commission. */
export const COMMISSION_BONUS = 12
/** How long the combo timer is frozen while a choice card is open. */
export const COMBO_FREEZE_MS = 5000
/** Auto-resolve a choice card after this long. */
export const CHOICE_AUTO_RESOLVE_MS = 6000
/** Warmth for a story beacon tap. */
export const STORY_BEACON_GAIN = 8
/** Warmth for a successful resonance link. */
export const RESONANCE_GAIN = 15
/** Extra combo granted by a resonance link. */
export const RESONANCE_COMBO_BONUS = 3
/** Warmth for re-tapping an already lit window (keeps the combo alive). */
export const LIT_RETAP_GAIN = 2
/** Warmth for tapping a dark window (never punishing). */
export const DARK_TAP_GAIN = 1
/** Chance a dark tap wakes the window into GLIMMER. */
export const DARK_TAP_WAKE_CHANCE = 0.35

// ------------------------------------------------------------- schedules

/** Seconds into the night when a story beacon is guaranteed, per night. */
export const STORY_BEACON_SCHEDULE = {
  0: [20, 48],
  1: [18, 42, 60],
  2: [15, 38, 58]
}
/** Guarantee a beacon after this many windows lit if none has fired yet. */
export const STORY_BEACON_LIT_FALLBACK = 7
/** Seconds into the night when a resonance pair appears, per night. */
export const RESONANCE_SCHEDULE = {
  0: [35],
  1: [25, 52],
  2: [22, 48]
}
/** Seconds into night 1 when ResonanceWeaver is asked to rewrite nights 2-3. */
export const EVOLVE_AT_S = 45

// ----------------------------------------------------------- commissions

/** Commission kinds the evaluator understands. */
export const COMMISSION_TYPES = [
  'lit_count',
  'max_combo',
  'drag_chain',
  'resonance',
  'story_choice',
  'row_lit',
  'all_lit',
  'bond_rooms'
]

/**
 * The three written-by-hand commissions shown if the director does not send
 * usable ones. Kept here so both the UI and the tests share one table.
 * @type {Array<{ id: string, type: string, target: number, label: string, floor?: number }>[]}
 */
export const DEFAULT_COMMISSIONS = [
  [
    { id: 'lit_14', type: 'lit_count', target: 14, label: '点亮至少 14 扇窗' },
    { id: 'combo_6', type: 'max_combo', target: 6, label: '连成 6 次不断的光链' },
    { id: 'story_1', type: 'story_choice', target: 1, label: '回应一扇窗后的小事' }
  ],
  [
    { id: 'row_3', type: 'row_lit', floor: 3, target: 6, label: '把整排三楼都点亮' },
    { id: 'res_1', type: 'resonance', target: 1, label: '连一次跨窗星轨' },
    { id: 'combo_10', type: 'max_combo', target: 10, label: '连成 10 次光链' }
  ],
  [
    { id: 'lit_24', type: 'lit_count', target: 24, label: '让整栋 24 扇窗全亮' },
    { id: 'combo_15', type: 'max_combo', target: 15, label: '连成 15 次的灯海' },
    { id: 'bond_6', type: 'bond_rooms', target: 6, label: '见证六位住户的今晚' }
  ]
]

// --------------------------------------------------------------- weather

/** @type {string[]} */
export const WEATHERS = ['light_rain', 'fog', 'wind', 'clear']
/** @type {string[]} */
export const PALETTES = ['rainy_amber', 'warm_blue', 'foggy_lilac', 'clear_peach']
/** @type {string[]} */
export const TEMPOS = ['slow', 'normal', 'brisk']
