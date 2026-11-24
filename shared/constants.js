// Shared constants for《今晚，亮一盏灯 · Light A Window》v4.0
// (Stardew 3D Campus Night Patrol Edition).
//
// Imported by BOTH Node (server/) and browser (src/). Keep zero dependencies.

// ---------------------------------------------------------------- geometry (default 4x6 university)

export const ROWS = 4
export const COLS = 6
export const WINDOW_COUNT = ROWS * COLS
export const NIGHT_COUNT = 3
export const NIGHT_SECONDS = 75

/**
 * Build window metadata for any rows x cols grid.
 * @param {number} rows
 * @param {number} cols
 * @returns {Array<{ idx: number, roomId: number, row: number, col: number, floor: number }>}
 */
export function buildWindowIds(rows = ROWS, cols = COLS) {
  const total = rows * cols
  return Array.from({ length: total }, (_, idx) => {
    const row = Math.floor(idx / cols)
    const col = idx % cols
    return { idx, roomId: (row + 1) * 100 + (col + 1), row, col, floor: row + 1 }
  })
}

/**
 * The 24 windows of dormitory #17 (default university grid, kept for compatibility).
 * @typedef {{ idx: number, roomId: number, row: number, col: number, floor: number }} WindowId
 * @type {WindowId[]}
 */
export const WINDOW_IDS = buildWindowIds(ROWS, COLS)

/** @type {Record<number, number>} roomId -> idx */
export const ROOM_TO_INDEX = Object.fromEntries(WINDOW_IDS.map(w => [w.roomId, w.idx]))

/** @type {number[]} idx -> roomId */
export const INDEX_TO_ROOM = WINDOW_IDS.map(w => w.roomId)

/**
 * @param {number} idx
 * @returns {number}
 */
export function roomIdForIndex(idx) {
  const w = WINDOW_IDS[idx]
  return w ? w.roomId : 0
}

/**
 * @param {number} roomId
 * @returns {number}
 */
export function indexForRoomId(roomId) {
  const idx = ROOM_TO_INDEX[Number(roomId)]
  return idx === undefined ? -1 : idx
}

/**
 * @param {number} floor
 * @param {number} [cols]
 * @returns {number[]}
 */
export function roomsOnFloor(floor, cols = COLS) {
  return Array.from({ length: cols }, (_, c) => floor * 100 + c + 1)
}

// ---------------------------------------------------------------- v4.0 Dormitories

/**
 * @typedef {{
 *   id: 'highschool'|'university'|'grad'|'staff',
 *   name: string,
 *   shortName: string,
 *   subtitle: string,
 *   rows: number,
 *   cols: number,
 *   windowCount: number,
 *   modelUrl: string,
 *   difficultyLabel: string,
 *   coreRooms: number[],
 *   flyOffset: [number, number, number],
 *   badgeColor: string
 * }} DormDef
 *
 * @type {DormDef[]}
 */
export const DORM_TYPES = [
  {
    id: 'staff',
    name: '教职工宿舍 · 桂花院',
    shortName: '员工宿舍',
    subtitle: '3层12宽窗 · 木梁爬山虎 · 烟火庭院',
    rows: 3,
    cols: 4,
    windowCount: 12,
    modelUrl: './models/dorm_staff.glb',
    difficultyLabel: '轻松入门',
    coreRooms: [102, 202, 203, 301, 303, 304],
    flyOffset: [-340, 20, -40],
    badgeColor: '#7ec88b'
  },
  {
    id: 'highschool',
    name: '高中宿舍 · 晨光楼',
    shortName: '高中宿舍',
    subtitle: '3层18窗 · 红砖瓦顶 · 黑板报单车棚',
    rows: 3,
    cols: 6,
    windowCount: 18,
    modelUrl: './models/dorm_highschool.glb',
    difficultyLabel: '标准节奏',
    coreRooms: [102, 105, 203, 205, 301, 306],
    flyOffset: [-180, 10, 20],
    badgeColor: '#e88b72'
  },
  {
    id: 'university',
    name: '大学宿舍 · 17号楼',
    shortName: '大学宿舍',
    subtitle: '4层24窗 · 开放外廊 · 阳台猫窝水塔',
    rows: 4,
    cols: 6,
    windowCount: 24,
    modelUrl: './models/dorm_university.glb',
    difficultyLabel: '经典均衡',
    coreRooms: [102, 203, 205, 301, 304, 406],
    flyOffset: [0, 0, 0],
    badgeColor: '#ffd27a'
  },
  {
    id: 'grad',
    name: '研究生宿舍 · 研思楼',
    shortName: '研究生宿舍',
    subtitle: '5层30窗 · 玻璃阳台 · 楼顶温室花房',
    rows: 5,
    cols: 6,
    windowCount: 30,
    modelUrl: './models/dorm_grad.glb',
    difficultyLabel: '高阶挑战',
    coreRooms: [102, 204, 304, 402, 503, 506],
    flyOffset: [210, 25, -30],
    badgeColor: '#98c4ff'
  }
]

/** @type {Record<string, DormDef>} */
export const DORM_BY_ID = Object.fromEntries(DORM_TYPES.map(d => [d.id, d]))

/** @type {string[]} */
export const DORM_IDS = DORM_TYPES.map(d => d.id)

/**
 * @param {string} id
 * @returns {DormDef}
 */
export function dormDef(id) {
  return DORM_BY_ID[id] || DORM_BY_ID.university
}

// ---------------------------------------------------------------- v4.0 Seasons & Weathers

export const SEASONS = [
  { id: 'spring', name: '春 · 樱吹雪', leafMain: 0xf4a8c4, leafAccent: 0x76b87c, skyTint: 0x1b2348, particle: 'petal' },
  { id: 'summer', name: '夏 · 萤火夜', leafMain: 0x2d6d43, leafAccent: 0x4b9358, skyTint: 0x0b1533, particle: 'firefly' },
  { id: 'autumn', name: '秋 · 银杏季', leafMain: 0xd99038, leafAccent: 0xc85838, skyTint: 0x1c1732, particle: 'leaf' },
  { id: 'winter', name: '冬 · 瑞雪夜', leafMain: 0x45586d, leafAccent: 0x788da4, skyTint: 0x0d1936, particle: 'frost' }
]

/** @type {string[]} */
export const SEASON_IDS = SEASONS.map(s => s.id)

/** @param {string} id */
export function seasonDef(id) {
  return SEASONS.find(s => s.id === id) || SEASONS[2]
}

export const WEATHER_CATALOG = [
  { id: 'clear', name: '晴夜星月', hint: '树影清晰，适合远眺星空' },
  { id: 'light_rain', name: '细雨石阶', hint: '地面水洼泛起微光涟漪' },
  { id: 'fog', name: '浓雾缭绕', hint: '流动夜雾漫过草坪与路灯' },
  { id: 'wind', name: '晚风吹拂', hint: '树梢晾衣绳随风大幅摇曳' },
  { id: 'snow', name: '落雪纷纷', hint: '屋檐窗台覆雪，温暖灯火更亮' }
]

/** @type {string[]} */
export const WEATHERS = ['clear', 'light_rain', 'fog', 'wind', 'snow']
/** @type {string[]} */
export const PALETTES = ['rainy_amber', 'warm_blue', 'foggy_lilac', 'clear_peach']
/** @type {string[]} */
export const TEMPOS = ['slow', 'normal', 'brisk']

// ---------------------------------------------------------------- v4.0 Camera Views

export const CAMERA_VIEWS = [
  { id: 'front', name: '正面全景' },
  { id: 'stardew', name: '星露谷45°' },
  { id: 'street', name: '林荫仰望' },
  { id: 'rooftop', name: '天台巡礼' }
]

export const CAMERA_VIEW_IDS = CAMERA_VIEWS.map(v => v.id)

// ---------------------------------------------------------------- v4.0 Minigames

export const GAME_MODES = [
  {
    id: 'memory_sequence',
    name: '记忆熄灯 · 依次顺序',
    shortName: '依次记忆',
    tag: '益智闯关',
    desc: '窗户按顺序依次亮起并熄灭，记住顺序依次点亮，考核顺序与准确率。'
  },
  {
    id: 'memory_snapshot',
    name: '记忆熄灯 · 一起亮起',
    shortName: '全景快照',
    tag: '瞬时记忆',
    desc: '多扇窗户同时亮起数秒后全灭，找出所有亮过的房间，考核空间准确率。'
  },
  {
    id: 'patrol_reflex',
    name: '查寝夜猫子',
    shortName: '查寝反应',
    tag: '反应辨别',
    desc: '熄灭熬夜闪屏窗、守护合规暖台灯、点亮晚归门灯，协助宿管快速巡楼。'
  },
  {
    id: 'lights_out_puzzle',
    name: '全楼归眠 · 熄灯棋盘',
    shortName: '熄灯解谜',
    tag: '逻辑策略',
    desc: '点一扇窗会同步翻转上下左右四邻灯态，用最少步数让整栋楼安睡！'
  },
  {
    id: 'star_sweep',
    name: '剧情夜巡 · 17号楼的秘密回路',
    shortName: '剧情夜巡',
    tag: '悬疑物语 · 闯关',
    desc: '三夜小说式宿管剧情：点亮微光窗连光、接住信标触发线人抉择、连起跨窗星轨，完成当夜手账目标即可揭晓下一夜反转。'
  }
]

export const BGM_TRACKS = [
  { id: 'theme', name: '黄昏之时 · 默认原声', shortName: '黄昏原声', desc: '默认校园夜巡主题背景音乐（循环播放 · 保留细雨与点灯交互音效）' },
  { id: 'auto', name: '剧情智能配乐', shortName: '智能配乐', desc: '按开场/剧情/闯关自动切换三套合成配乐' },
  { id: 'kataware', name: '黄昏之时 · 暮色星辰', shortName: '黄昏之时风', desc: '日系暮色钢琴弦乐 · 温柔悬念与怀旧感' },
  { id: 'bluedragon', name: '医龙 · 苍蓝脉搏', shortName: '医龙风', desc: '燃系弦乐律动与鼓点 · 高潮对峙与查寝张力' },
  { id: 'mysoul', name: 'My Soul · 子夜琴诗', shortName: 'My Soul风', desc: '标志性循环钢琴旋律与碎拍 · 深夜独行沉浸感' },
  { id: 'ambient', name: '微雨校庭 · 助眠白噪音', shortName: '纯白噪音', desc: '仅保留细雨晚风与轻柔底噪' }
]
export const BGM_TRACK_IDS = BGM_TRACKS.map(t => t.id)

export function bgmTrackDef(id) {
  return BGM_TRACKS.find(t => t.id === id) || BGM_TRACKS[0]
}

export const GAME_MODE_IDS = GAME_MODES.map(m => m.id)

export function gameModeDef(id) {
  return GAME_MODES.find(m => m.id === id) || GAME_MODES[0]
}

// ---------------------------------------------------------------- residents & window states

export const CORE_RESIDENT_ROOMS = [102, 203, 205, 301, 304, 406]
export const CORE_RESIDENT_INDEXES = CORE_RESIDENT_ROOMS.map(indexForRoomId)

export const WINDOW_STATES = {
  DARK: 'dark',
  GLIMMER: 'glimmer',
  LIT: 'lit',
  STORY_BEACON: 'story_beacon',
  RESONANCE_PAIR: 'resonance_pair',
  // v4 minigame states
  TARGET_HINT: 'target_hint',     // bright golden cue during memory observe phase
  DECOY_BLUE: 'decoy_blue',       // blue-violet RGB gaming night-owl window or decoy flash
  SAFE_WARM: 'safe_warm',         // compliant study lamp (do not turn off in patrol_reflex)
  CORRECT_GREEN: 'correct_green', // confirmed accurate memory pick
  WRONG_AMBER: 'wrong_amber'      // gentle amber wobble when mistapped
}

export const ACTIONABLE_STATES = [
  WINDOW_STATES.GLIMMER,
  WINDOW_STATES.STORY_BEACON,
  WINDOW_STATES.RESONANCE_PAIR,
  WINDOW_STATES.DECOY_BLUE
]

/** @param {string} state */
export function isActionable(state) {
  return ACTIONABLE_STATES.includes(state)
}

// ---------------------------------------------------------------- tempo

/** @typedef {{ initialGlimmer: number, maxGlimmer: number, spawnIntervalMs: number, glimmerDurationMs: number, comboWindowMs: number }} TempoConfig */
/** @type {Record<'slow'|'normal'|'brisk', TempoConfig>} */
export const TEMPO_CONFIG = {
  slow: { initialGlimmer: 3, maxGlimmer: 5, spawnIntervalMs: 1100, glimmerDurationMs: 3800, comboWindowMs: 2400 },
  normal: { initialGlimmer: 4, maxGlimmer: 6, spawnIntervalMs: 850, glimmerDurationMs: 3200, comboWindowMs: 2100 },
  brisk: { initialGlimmer: 5, maxGlimmer: 8, spawnIntervalMs: 650, glimmerDurationMs: 2700, comboWindowMs: 1900 }
}

/** @param {string} tempo */
export function tempoConfig(tempo) {
  return TEMPO_CONFIG[/** @type {'slow'|'normal'|'brisk'} */ (tempo)] || TEMPO_CONFIG.normal
}

export const MIN_ACTIONABLE_GLIMMER = 2
export const GLIMMER_REFILL_MS = 200

// ---------------------------------------------------------------- mood tokens

export const MOOD_TOKENS = [
  { id: 'umbrella', name: '听雨的伞', hint: '偏安静，慢一点也没关系', icon: '☂', tempo: 'slow', palette: 'rainy_amber' },
  { id: 'earphones', name: '吹风的耳机', hint: '偏律动，喜欢连成一片', icon: '🎧', tempo: 'brisk', palette: 'warm_blue' },
  { id: 'quilt', name: '晒月亮的被子', hint: '偏温暖，晴夜的月光', icon: '🛏', tempo: 'normal', palette: 'clear_peach' },
  { id: 'lamp', name: '亮着的台灯', hint: '偏故事，想多看看窗后', icon: '💡', tempo: 'normal', palette: 'foggy_lilac' }
]
export const MOOD_TOKEN_IDS = MOOD_TOKENS.map(m => m.id)
export function moodToken(id) {
  return MOOD_TOKENS.find(m => m.id === id) || MOOD_TOKENS[3]
}

// ---------------------------------------------------------------- endings

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
export const ENDING_BY_ID = Object.fromEntries(ENDINGS.map(e => [e.id, e]))
export const ENDING_IDS = ENDINGS.map(e => e.id)
export function endingMeta(id) {
  return ENDING_BY_ID[id] || ENDING_BY_ID.ENDING_F_DRIFT
}

// ---------------------------------------------------------------- scoring & schedules

export const ALL_LIT_BONUS = 25
export const ENCORE_RESET_COUNT = 8
export const ENCORE_MIN_TIME_LEFT_S = 8
export const ENCORE_DELAY_MS = 1800
export const COMMISSION_BONUS = 12
export const COMBO_FREEZE_MS = 5000
export const CHOICE_AUTO_RESOLVE_MS = 20000
export const STORY_BEACON_GAIN = 8
export const RESONANCE_GAIN = 15
export const RESONANCE_COMBO_BONUS = 3
export const LIT_RETAP_GAIN = 2
export const DARK_TAP_GAIN = 1
export const DARK_TAP_WAKE_CHANCE = 0.35

export const STORY_BEACON_SCHEDULE = {
  0: [5, 34],
  1: [4, 24, 46],
  2: [4, 22, 44]
}
export const STORY_BEACON_LIT_FALLBACK = 7
export const RESONANCE_SCHEDULE = {
  0: [14, 38],
  1: [12, 34],
  2: [10, 32]
}
export const EVOLVE_AT_S = 45

export const COMMISSION_TYPES = [
  'lit_count', 'max_combo', 'drag_chain', 'resonance', 'story_choice', 'row_lit', 'all_lit', 'bond_rooms'
]

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

// ---------------------------------------------------------------- v4.0 Random Campus Nicknames

const NICK_PREFIX = [
  '三楼熬夜的', '天台数星的', '值班室喝茶', '路灯下走过', '走廊留灯的',
  '抱橘猫看云', '雨夜借伞的', '凌晨写代码', '窗台养绿萝', '刚抢到泡面',
  '听老电台的', '图书馆闭馆'
]
const NICK_SUFFIX = [
  '猫', '学弟', '学姐', '小星', '夜巡员', '橘橘', '旅人', '守灯人', '同学', '影子', '书虫', '风铃'
]

/**
 * Generate a fun campus nickname (<= 8 chars) when the player skips naming.
 * @param {() => number} [rng]
 * @returns {string}
 */
export function generateCampusNickname(rng = Math.random) {
  const p = NICK_PREFIX[Math.floor(rng() * NICK_PREFIX.length)]
  const s = NICK_SUFFIX[Math.floor(rng() * NICK_SUFFIX.length)]
  const combined = p + s
  return combined.slice(0, 8)
}

/**
 * Adapt nightly commissions so every dorm (12 / 18 / 24 / 30 windows, 3-5 floors, 4-6 cols)
 * has 100% reachable win targets.
 * @param {Array<{ id: string, type: string, target: number, label: string, floor?: number }>} commissions
 * @param {string} dormId
 */
export function adaptCommissionsForDorm(commissions, dormId = 'university') {
  const dorm = dormDef(dormId)
  return (commissions || []).map(c => {
    const item = { ...c }
    if (item.type === 'lit_count' || item.type === 'all_lit') {
      const cap = Math.min(Math.max(1, Number(item.target) || 10), dorm.windowCount)
      if (item.target >= 20 || item.type === 'all_lit') {
        item.target = dorm.windowCount
        item.label = `让整栋 ${dorm.windowCount} 扇窗全亮`
      } else {
        item.target = Math.max(4, Math.min(cap, Math.round((item.target / 24) * dorm.windowCount)))
        item.label = `点亮至少 ${item.target} 扇窗`
      }
    } else if (item.type === 'row_lit') {
      const fl = Math.min(dorm.rows, Math.max(1, Number(item.floor) || 3))
      item.floor = fl
      item.target = dorm.cols
      item.label = `把整排${fl}楼(${dorm.cols}扇窗)都点亮`
    } else if (item.type === 'bond_rooms') {
      item.target = Math.min(3, Math.max(1, Number(item.target) || 3), dorm.coreRooms.length)
      item.label = `倾听并回应 ${item.target} 位住户`
    }
    return item
  })
}

/**
 * Guarantee both ends of a cross-window star resonance pair exist in the active dorm grid.
 * @param {{ rooms: number[], line: string }} pair
 * @param {string} dormId
 * @returns {{ rooms: [number, number], line: string }}
 */
export function adaptResonancePairForDorm(pair, dormId = 'university') {
  const dorm = dormDef(dormId)
  const validRooms = new Set(buildWindowIds(dorm.rows, dorm.cols).map(w => w.roomId))
  const rooms = Array.isArray(pair?.rooms) ? pair.rooms.map(Number) : []
  if (rooms.length === 2 && rooms[0] !== rooms[1] && validRooms.has(rooms[0]) && validRooms.has(rooms[1])) {
    return { rooms: [rooms[0], rooms[1]], line: String(pair.line || '') }
  }
  const core = dorm.coreRooms.filter(r => validRooms.has(r))
  const a = core[0] || 102
  const b = core[core.length - 1] || (dorm.rows * 100 + dorm.cols)
  return {
    rooms: [a, b === a ? 101 : b],
    line: String(pair?.line || `${a}室的微光顺着晚风接进了${b}室的窗台。`)
  }
}

/**
 * Determine NPC outfit key from current weather & season.
 * @param {string} weather
 * @param {string} season
 * @returns {'rain_gear'|'winter_puffer'|'fog_coat'|'autumn_knit'|'sunny_light'}
 */
export function outfitForEnv(weather, season) {
  if (weather === 'light_rain' || weather === 'rain') return 'rain_gear'
  if (weather === 'snow' || season === 'winter') return 'winter_puffer'
  if (weather === 'fog') return 'fog_coat'
  if (weather === 'wind' || season === 'autumn') return 'autumn_knit'
  return 'sunny_light'
}
