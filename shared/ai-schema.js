// Shared AI payload validation.
//
// This module is imported by BOTH the backend (server/) and the browser
// (src/ai.js). The reason: when a player supplies their own DeepSeek key the
// request goes browser -> DeepSeek directly, bypassing the backend. Without a
// shared validator that path would skip enum normalisation, length checks and
// the banned-word filter, and a malformed model reply could break the scene.
//
// Keep this file dependency-free and side-effect-free so it can run in Node
// and in the browser without a build step.

import {
  CORE_RESIDENT_ROOMS,
  COMMISSION_TYPES,
  DEFAULT_COMMISSIONS,
  ENDING_BY_ID,
  INDEX_TO_ROOM
} from './constants.js'

// Words that must never appear. The product is a healing/stress-relief game,
// not a mental-health tool, so clinical and preachy language is rejected.
export const BANNED_WORDS = [
  '抑郁', '焦虑症', '心理疾病', '自杀', '自残', '诊断', '治疗', '治愈你',
  '你应该', '想开点', '正能量', '加油'
]

// The model often returns near-misses ("moonlit_blue", "breezy", "warm_orange").
// Map them onto the small set of values the scene actually implements.
export const WEATHER_MAP = {
  clear: 'clear', sunny: 'clear', moonlit: 'clear', starry: 'clear', bright: 'clear',
  light_rain: 'light_rain', rainy: 'light_rain', drizzle: 'light_rain', rain: 'light_rain',
  fog: 'fog', misty: 'fog', cloudy: 'fog', hazy: 'fog', overcast: 'fog',
  wind: 'wind', windy: 'wind', breezy: 'wind', breezy_clear: 'wind'
}

export const TEMPO_MAP = {
  slow: 'slow', calm: 'slow', gentle: 'slow', relaxed: 'slow',
  normal: 'normal', medium: 'normal', steady: 'normal',
  brisk: 'brisk', fast: 'brisk', lively: 'brisk', quick: 'brisk', warm: 'brisk', energetic: 'brisk'
}

export const PALETTE_MAP = {
  warm_blue: 'warm_blue', blue: 'warm_blue', night_blue: 'warm_blue', moonlit_blue: 'warm_blue',
  rainy_amber: 'rainy_amber', amber: 'rainy_amber', warm_amber: 'rainy_amber', rainy: 'rainy_amber',
  foggy_lilac: 'foggy_lilac', lilac: 'foggy_lilac', purple: 'foggy_lilac', misty: 'foggy_lilac',
  clear_peach: 'clear_peach', peach: 'clear_peach', warm_peach: 'clear_peach',
  warm: 'clear_peach', orange: 'clear_peach', warm_orange: 'clear_peach',
  gray_blue: 'warm_blue', grey_blue: 'warm_blue', gray: 'foggy_lilac', grey: 'foggy_lilac'
}

// Icons are rendered as text, and a font may not carry the emoji the model
// picked. Only allow a known-safe set, otherwise fall back to a neutral mark.
// Note '🍢' and '🛏' were missing from the v2 list, which made the string
// "🍢" render as a tofu block in the HUD.
export const ALLOWED_ICONS = new Set([
  '✦', '✧', '🌿', '💡', '🔔', '🌙', '⭐', '☕', '📖', '🎧', '🌧', '☂',
  '🪴', '🛏', '🧣', '🍜', '🥣', '🏃', '🐈', '🎵', '🕯', '🔑', '✏', '📚',
  '🍢', '🍵', '🎐', '🔭', '🧸', '🌾', '🪟', '🚲', '🧋', '🎹',
  '👟', '🍊', '🥛', '🪑', '🧦'
])

/** Variation selectors break Set lookups, so strip them before matching. */
const VARIATION_SELECTORS = /[\uFE0E\uFE0F\u200D]/g

export function sanitizeText(value, max) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function normalizeKey(value, map, fallback) {
  const key = String(value || '').toLowerCase().replace(/[\s-]+/g, '_')
  if (map[key]) return map[key]
  for (const [needle, target] of Object.entries(map)) {
    if (key.includes(needle)) return target
  }
  return fallback
}

export function sanitizeIcon(value) {
  const raw = String(value || '').trim().replace(VARIATION_SELECTORS, '')
  if (!raw) return '✦'
  if (ALLOWED_ICONS.has(raw)) return raw
  const first = Array.from(raw)[0]
  return ALLOWED_ICONS.has(first) ? first : '✦'
}

export function containsBannedWord(text) {
  return BANNED_WORDS.some(w => String(text || '').includes(w))
}

/**
 * Clamp a number into a range, falling back when it is not finite.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Validate and normalise a raw model payload.
 * Returns null when the payload cannot be salvaged.
 */
export function normalizePayload(raw) {
  if (!raw || !Array.isArray(raw.nights) || raw.nights.length !== 3) return null

  const nights = []
  for (const n of raw.nights) {
    if (!n) return null

    const weather = normalizeKey(n.weather, WEATHER_MAP, 'clear')
    const tempo = normalizeKey(n.tempo, TEMPO_MAP, 'normal')
    const palette = normalizeKey(n.palette, PALETTE_MAP, 'warm_blue')

    let stories = Array.isArray(n.stories)
      ? n.stories.slice(0, 3).map(s => ({
          text: sanitizeText(s?.text, 24),
          item: sanitizeText(s?.item, 8),
          icon: sanitizeIcon(s?.icon)
        })).filter(s => s.text.length >= 6)
      : []

    // Always keep at least two stories so a night is never empty.
    if (stories.length < 2) {
      stories = [
        ...stories,
        { text: '窗台上有一只洗干净的玻璃杯。', item: '玻璃杯', icon: '✦' },
        { text: '楼道里还有一盏灯亮着。', item: '楼道灯', icon: '✦' }
      ].slice(0, 2)
    }

    const postcard = sanitizeText(n.postcard, 40)
    if (postcard.length < 10) return null

    nights.push({ night: nights.length + 1, weather, tempo, palette, stories, postcard })
  }

  if (containsBannedWord(JSON.stringify(nights))) return null
  return { nights }
}

// ---------------------------------------------------------------------------
// v3 · multi-agent payloads
// ---------------------------------------------------------------------------

/** Fallback window stories used when the model sends nothing usable. */
const FALLBACK_STORIES = [
  { roomId: 304, resident: '知夏 · 304室', text: '考研笔记翻到折角那页，窗台上放着一杯凉掉的茶。', item: '荧光笔', icon: '📚' },
  { roomId: 102, resident: '林阿姨 · 102室', text: '值班室的保温桶还温着，名单上用铅笔圈了一个名字。', item: '保温茶缸', icon: '☕' },
  { roomId: 203, resident: '小禾 · 203室', text: '画架上的速写只起了个头，绿萝的影子落在纸上。', item: '手绘速写本', icon: '🪴' },
  { roomId: 406, resident: '星野 · 406室', text: '望远镜对准云层缝，窗把手上挂着一支手电。', item: '黄铜星图', icon: '🔭' },
  { roomId: 301, resident: '阿满 · 301室', text: '小电锅咕嘟咕嘟，热气在玻璃上糊出一层白。', item: '关东煮', icon: '🍢' },
  { roomId: 205, resident: '阿澈 · 205室', text: '耳机搁在桌角，麦克风的红灯还亮着一小点。', item: '旧耳麦', icon: '🎧' }
]

/** Fallback choice pairs, one per resident room. */
const FALLBACK_CHOICES = {
  102: [
    { id: 'A', label: '添一分暖光', outcome: '门口的路灯亮了一格，晚归的人远远就看见了。' },
    { id: 'B', label: '留一份安静', outcome: '值班室的台灯暗下去一点，她终于靠回了椅背。' }
  ],
  203: [
    { id: 'A', label: '照亮窗台绿萝', outcome: '光落在新叶上，她把揉皱的纸团又摊平了。' },
    { id: 'B', label: '连向三楼窗光', outcome: '楼上的暖光斜下来，在纸上铺了一小块金色。' }
  ],
  205: [
    { id: 'A', label: '调高晚风共鸣', outcome: '声音顺着窗缝飘上去，四楼有人跟着哼了一句。' },
    { id: 'B', label: '点亮桌上台灯', outcome: '他把最后一封来信读完，折好，压在杯子下面。' }
  ],
  301: [
    { id: 'A', label: '分一串萝卜', outcome: '玻璃上哈出一朵笑脸，隔壁的人端着碗过来了。' },
    { id: 'B', label: '帮他们遮掩', outcome: '窗帘合拢，只漏出一条暖暖的橘色。' }
  ],
  304: [
    { id: 'A', label: '推开半扇窗', outcome: '橘猫抖了抖毛跳进来，趴在她的错题本边上。' },
    { id: 'B', label: '温一杯热牛奶', outcome: '台灯的光圈刚好罩住翻开的那一页。' }
  ],
  406: [
    { id: 'A', label: '吹散头顶薄云', outcome: '云缝裂开一条，望远镜里的星星忽然清晰了。' },
    { id: 'B', label: '呼唤屋顶的猫', outcome: '水塔边探出一个黑脑袋，尾巴慢慢地摆。' }
  ]
}

/** Fallback resonance pairs, one per night. */
const FALLBACK_RESONANCE = [
  { rooms: [102, 304], line: '一楼保温桶的热气，顺着雨声飘到了三楼的书桌前。' },
  { rooms: [205, 402], line: '四楼的吉他声顺着风飘进二楼，广播里的尾音刚好接上。' },
  { rooms: [203, 406], line: '画纸上的星空和望远镜里的星空，在同一个夜里对上了。' }
]

/** Fallback postcards, one per night. */
const FALLBACK_POSTCARDS = [
  '雨丝很细，刚好盖过走廊尽头的脚步声。',
  '天是灰的，风有点闷，自习室的灯一直亮到很晚。',
  '云散了，月亮挂在树梢，有人在小声聊天。'
]

/**
 * Normalise one story entry into the shape the game renders.
 * @param {any} raw
 * @param {number} pass
 * @returns {{ roomId: number, resident: string, text: string, item: string, icon: string, choices: Array<{ id: string, label: string, outcome: string }> } | null}
 */
function normalizeStory(raw, pass) {
  if (!raw || typeof raw !== 'object') return null

  const direct = Number(raw.roomId)
  const roomId = CORE_RESIDENT_ROOMS.includes(direct)
    ? direct
    : CORE_RESIDENT_ROOMS[pass % CORE_RESIDENT_ROOMS.length]

  const text = sanitizeText(raw.text, 26)
  const picked = text.length >= 8 ? raw : { ...raw, text: FALLBACK_STORIES.find(s => s.roomId === roomId)?.text || '' }
  const finalText = sanitizeText(picked.text, 26)
  if (finalText.length < 8) return null

  const base = FALLBACK_STORIES.find(s => s.roomId === roomId)
  const item = sanitizeText(raw.item, 6) || base?.item || '小物件'
  const icon = sanitizeIcon(raw.icon || base?.icon)
  const resident = sanitizeText(raw.resident, 14) || base?.resident || ''

  const fallbackChoices = FALLBACK_CHOICES[roomId] || FALLBACK_CHOICES[304]
  const given = Array.isArray(raw.choices) ? raw.choices : []
  const choices = []
  for (let i = 0; i < 2; i++) {
    const c = given[i]
    const label = sanitizeText(c?.label, 9)
    const outcome = sanitizeText(c?.outcome, 22)
    const fb = fallbackChoices[i]
    choices.push({
      id: i === 0 ? 'A' : 'B',
      label: label.length >= 2 ? label : fb.label,
      outcome: outcome.length >= 6 ? outcome : fb.outcome
    })
  }

  return { roomId, resident, text: finalText, item, icon, choices }
}

/**
 * Normalise one night object (shared by plan and evolve).
 * @param {any} raw
 * @param {number} nightNumber 1-based
 * @param {number} index 0-based night index
 * @returns {{
 *   night: number, weather: string, tempo: string, palette: string,
 *   commissions: Array<{ id: string, type: string, target: number, label: string, floor?: number }>,
 *   resonancePair: { rooms: number[], line: string },
 *   stories: Array<any>, postcard: string
 * }}
 */
function normalizeNight(raw, nightNumber, index) {
  const n = raw && typeof raw === 'object' ? raw : {}
  const weather = normalizeKey(n.weather, WEATHER_MAP, index === 0 ? 'light_rain' : index === 1 ? 'fog' : 'clear')
  const tempo = normalizeKey(n.tempo, TEMPO_MAP, index === 0 ? 'slow' : index === 1 ? 'normal' : 'brisk')
  const palette = normalizeKey(n.palette, PALETTE_MAP, index === 0 ? 'rainy_amber' : index === 1 ? 'warm_blue' : 'clear_peach')

  // --- commissions: 2~3 items, unknown types rejected -------------------
  const rawCommissions = Array.isArray(n.commissions) ? n.commissions : []
  const defaults = DEFAULT_COMMISSIONS[index] || DEFAULT_COMMISSIONS[0]
  let commissions = []
  for (const c of rawCommissions.slice(0, 3)) {
    if (!c || typeof c !== 'object') continue
    const type = String(c.type || '').toLowerCase()
    if (!COMMISSION_TYPES.includes(type)) continue
    const label = sanitizeText(c.label, 18)
    if (label.length < 4) continue
    const target = clampInt(c.target, 1, 24, 1)
    /** @type {{ id: string, type: string, target: number, label: string, floor?: number }} */
    const item = { id: sanitizeText(c.id, 16) || type + '_' + target, type, target, label }
    if (type === 'row_lit') item.floor = clampInt(c.floor, 1, 4, 3)
    commissions.push(item)
  }
  if (commissions.length < 2) commissions = defaults.map(d => ({ ...d }))
  commissions = commissions.slice(0, 3)

  // --- resonance pair ---------------------------------------------------
  let pair = FALLBACK_RESONANCE[index] || FALLBACK_RESONANCE[0]
  const rawPair = n.resonancePair
  const rawRooms = Array.isArray(rawPair?.rooms) ? rawPair.rooms : []
  if (rawRooms.length === 2) {
    const a = Number(rawRooms[0])
    const b = Number(rawRooms[1])
    const valid = INDEX_TO_ROOM.includes(a) && INDEX_TO_ROOM.includes(b) && a !== b
    if (valid) {
      const line = sanitizeText(rawPair?.line, 26)
      pair = { rooms: [a, b], line: line.length >= 8 ? line : (FALLBACK_RESONANCE[index] || FALLBACK_RESONANCE[0]).line }
    }
  }
  const resonancePair = { rooms: [pair.rooms[0], pair.rooms[1]], line: pair.line }

  // --- stories ----------------------------------------------------------
  const rawStories = Array.isArray(n.stories) ? n.stories.slice(0, 3) : []
  const stories = []
  for (let i = 0; i < rawStories.length; i++) {
    const s = normalizeStory(rawStories[i], index + i)
    if (!s) continue
    // One night must never stage the same resident twice.
    if (stories.some(other => other.roomId === s.roomId)) continue
    stories.push(s)
  }
  const want = 3
  for (let i = 0; stories.length < want && i < FALLBACK_STORIES.length; i++) {
    const base = FALLBACK_STORIES[(index * 2 + i) % FALLBACK_STORIES.length]
    if (stories.some(s => s.roomId === base.roomId)) continue
    stories.push({
      roomId: base.roomId,
      resident: base.resident,
      text: base.text,
      item: base.item,
      icon: sanitizeIcon(base.icon),
      choices: FALLBACK_CHOICES[base.roomId].map(c => ({ ...c }))
    })
  }

  // --- postcard ---------------------------------------------------------
  let postcard = sanitizeText(n.postcard, 36)
  if (postcard.length < 10) postcard = FALLBACK_POSTCARDS[index] || FALLBACK_POSTCARDS[0]

  return {
    night: nightNumber,
    weather,
    tempo,
    palette,
    commissions,
    resonancePair,
    stories: stories.slice(0, want),
    postcard
  }
}

/**
 * Agent 1 + 2 payload: three nights of director parameters, commissions and
 * beacon stories with micro-choices.
 *
 * Returns null only when the payload cannot be salvaged at all (not an object,
 * not exactly three nights, a null night, or banned language). Everything else
 * is repaired with deterministic fallbacks so the scene never breaks.
 *
 * @param {any} raw
 * @returns {{ directorNote: string, nights: any[] } | null}
 */
export function normalizePlanPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.nights) || raw.nights.length !== 3) return null
  for (const n of raw.nights) if (!n || typeof n !== 'object') return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  let directorNote = sanitizeText(raw.directorNote, 40)
  if (directorNote.length < 6) directorNote = '今夜从微雨开始，慢一点也没关系。'

  const nights = raw.nights.map((n, i) => normalizeNight(n, i + 1, i))
  return { directorNote, nights }
}

/**
 * Agent 3 payload: the rewritten future nights.
 *
 * Accepts 1-2 night objects. Night numbers are not trusted; they are assigned
 * sequentially starting from `firstNight` so a confused model cannot overwrite
 * a night the player has already lived through.
 *
 * @param {any} raw
 * @param {number} [firstNight] default 2
 * @returns {{ nights: any[] } | null}
 */
export function normalizeEvolvePayload(raw, firstNight = 2) {
  if (!raw || typeof raw !== 'object') return null
  const list = Array.isArray(raw.nights) ? raw.nights : Array.isArray(raw.evolvedNights) ? raw.evolvedNights : null
  if (!list || !list.length) return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  const nights = []
  const take = list.slice(0, 3 - (firstNight - 1))
  for (let i = 0; i < take.length; i++) {
    if (!take[i] || typeof take[i] !== 'object') continue
    const nightNumber = firstNight + i
    nights.push(normalizeNight(take[i], nightNumber, nightNumber - 1))
  }
  if (!nights.length) return null
  return { nights }
}

/**
 * Agent 4 payload: the resident's handwritten reply and the whisper prompt.
 * @param {any} raw
 * @returns {{ archetype: string, letter: { fromRoom: string, salutation: string, body: string, sign: string }, whisperSuggestion: string } | null}
 */
export function normalizeEpiloguePayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  let archetype = sanitizeText(raw.archetype, 10)
  if (archetype.length < 2) archetype = '夜巡守灯人'

  const rawLetter = raw.letter && typeof raw.letter === 'object' ? raw.letter : {}
  const fromRoom = sanitizeText(rawLetter.fromRoom, 20) || '17号楼 · 某一扇窗'
  const salutation = sanitizeText(rawLetter.salutation, 24) || '致今晚亮灯的人：'
  let body = sanitizeText(rawLetter.body, 140)
  if (body.length < 20) body = '今晚的灯亮到这里，窗台上还留着一点温度。谢谢你在楼下走过的那一圈。'
  const sign = sanitizeText(rawLetter.sign, 20) || '17号楼'

  let whisperSuggestion = sanitizeText(raw.whisperSuggestion, 40)
  if (whisperSuggestion.length < 8) whisperSuggestion = '今晚的雨很轻，祝你也做个好梦。'

  return { archetype, letter: { fromRoom, salutation, body, sign }, whisperSuggestion }
}

/**
 * Strict filter for the cross-player "window whisper" wall.
 * Returns '' when the text is unusable, so the server can reject with 400.
 *
 * @param {any} text
 * @returns {string}
 */
export function sanitizeWhisper(text) {
  const clean = sanitizeText(text, 40)
  if (clean.length < 6) return ''
  if (/[<>]/.test(clean)) return ''
  if (containsBannedWord(clean)) return ''
  return clean
}

/**
 * True when the payload names a real ending id.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isEndingId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ENDING_BY_ID, id)
}

/**
 * Small helper used by the server to bucket telemetry for cache keys.
 * @param {any} telemetry
 * @returns {string}
 */
export function telemetryBucket(telemetry = {}) {
  const t = telemetry && typeof telemetry === 'object' ? telemetry : {}
  const combo = Number(t.maxCombo) || 0
  const tier = combo >= 14 ? 'high' : combo >= 8 ? 'mid' : 'low'
  const drag = Number(t.dragChains) || 0
  const flow = drag >= 3 ? 'flow' : drag >= 1 ? 'some' : 'tap'
  const rooms = Array.isArray(t.choicesMade)
    ? t.choicesMade.map(c => Number(c && c.roomId)).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    : []
  return [tier, flow, rooms.join('.')].join('|')
}

// ---------------------------------------------------------------------------
// v4 · DialogueDirector, PuzzleArchitect, InspectorCommentator schemas
// ---------------------------------------------------------------------------

const VALID_SPEAKERS = new Set(['aunt_lin', 'dean_zhou', 'uncle_wang', 'xiaohe', 'ache', 'aman', 'zhixia', 'xingye'])
const VALID_BUFFS = new Set(['extra_shield', 'score_boost', 'extra_time', 'sequence_mode'])

/**
 * Normalise AI-generated NPC opening dialogue.
 * @param {any} raw
 * @returns {{ lines: Array<{ speakerId: string, line: string }>, choices: Array<{ label: string, buffType: string, buffLabel: string }> } | null}
 */
export function normalizeDialoguePayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  const rawLines = Array.isArray(raw.lines) ? raw.lines.slice(0, 4) : []
  const lines = []
  for (const item of rawLines) {
    if (!item || typeof item !== 'object') continue
    const speakerId = VALID_SPEAKERS.has(String(item.speakerId)) ? String(item.speakerId) : 'aunt_lin'
    const line = sanitizeText(item.line, 64)
    if (line.length >= 6) lines.push({ speakerId, line })
  }
  if (!lines.length) return null

  const rawChoices = Array.isArray(raw.choices) ? raw.choices.slice(0, 2) : []
  const choices = []
  const defaults = [
    { label: '我记性好，先查依次亮灯', buffType: 'extra_shield', buffLabel: '护盾 +1 容错' },
    { label: '直接巡楼，看看大家情况', buffType: 'score_boost', buffLabel: '首关得分 +25%' }
  ]
  for (let i = 0; i < 2; i++) {
    const c = rawChoices[i] || {}
    const fb = defaults[i]
    const label = sanitizeText(c.label, 16)
    const buffType = VALID_BUFFS.has(String(c.buffType)) ? String(c.buffType) : fb.buffType
    const buffLabel = sanitizeText(c.buffLabel, 18)
    choices.push({
      label: label.length >= 3 ? label : fb.label,
      buffType,
      buffLabel: buffLabel.length >= 3 ? buffLabel : fb.buffLabel
    })
  }
  return { lines, choices }
}

/**
 * Normalise AI puzzle pattern targets into valid grid indices.
 * @param {any} raw
 * @param {number} totalWindows
 * @param {number} wantedCount
 * @returns {{ patternName: string, flavorHint: string, targets: number[] } | null}
 */
export function normalizePuzzlePayload(raw, totalWindows = 24, wantedCount = 4) {
  if (!raw || typeof raw !== 'object') return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  const maxIdx = Math.max(1, Math.floor(Number(totalWindows) || 24)) - 1
  const want = Math.max(2, Math.min(maxIdx + 1, Math.floor(Number(wantedCount) || 4)))
  const rawTargets = Array.isArray(raw.targets) ? raw.targets : []
  /** @type {number[]} */
  const targets = []
  const seen = new Set()
  for (const t of rawTargets) {
    const idx = Math.round(Number(t))
    if (!Number.isFinite(idx) || idx < 0 || idx > maxIdx || seen.has(idx)) continue
    seen.add(idx)
    targets.push(idx)
    if (targets.length >= want) break
  }
  if (targets.length < 2) return null

  const patternName = sanitizeText(raw.patternName, 12) || '校园夜巡阵型'
  const flavorHint = sanitizeText(raw.flavorHint, 42) || '顺着窗户亮起的光路，把没关灯的屋子记下来。'
  return { patternName, flavorHint, targets }
}

/**
 * Normalise AI inspector debrief commentary.
 * @param {any} raw
 * @returns {{ rankTitle: string, auntComment: string, deanComment: string, sleepTip: string, whisperSuggestion: string } | null}
 */
export function normalizeDebriefPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (containsBannedWord(JSON.stringify(raw))) return null

  const rankTitle = sanitizeText(raw.rankTitle, 12) || '靠谱夜巡员'
  const auntComment = sanitizeText(raw.auntComment, 72)
  const deanComment = sanitizeText(raw.deanComment, 72)
  if (auntComment.length < 8 && deanComment.length < 8) return null
  const sleepTip = sanitizeText(raw.sleepTip, 44) || '把桌边小灯关剩一盏暖光，喝半杯温水再休息。'
  const whisperSuggestion = sanitizeText(raw.whisperSuggestion, 40) || '今晚这栋楼的灯都温柔地暗下来了，好梦。'

  return {
    rankTitle,
    auntComment: auntComment.length >= 8 ? auntComment : '辛苦跑这一趟啦，值班室的姜茶随时给你温着呢。',
    deanComment: deanComment.length >= 8 ? deanComment : '巡楼记性相当稳，同学们今晚能少熬一会夜了。',
    sleepTip,
    whisperSuggestion
  }
}

export { asString }
