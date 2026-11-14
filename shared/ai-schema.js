// Shared AI payload validation.
//
// This module is imported by BOTH the backend (server/index.js) and the
// browser (src/ai/schema.js). The reason: when a player supplies their own
// DeepSeek key the request goes browser -> DeepSeek directly, bypassing the
// backend. Without a shared validator that path would skip enum
// normalisation, length checks and the banned-word filter, and a malformed
// model reply could break the scene.
//
// Keep this file dependency-free and side-effect-free so it can run in Node
// and in the browser without a build step.

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
export const ALLOWED_ICONS = new Set([
  '✦', '✧', '🌿', '💡', '🔔', '🌙', '⭐', '☕', '📖', '🎧', '🌧', '☂',
  '🪴', '🛏', '🧣', '🍜', '🥣', '🏃', '🐈', '🎵', '🕯', '🔑', '✏', '📚'
])

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
  const raw = String(value || '').trim()
  if (!raw) return '✦'
  if (ALLOWED_ICONS.has(raw)) return raw
  const first = Array.from(raw)[0]
  return ALLOWED_ICONS.has(first) ? first : '✦'
}

export function containsBannedWord(text) {
  return BANNED_WORDS.some(w => String(text || '').includes(w))
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
