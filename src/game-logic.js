// Pure gameplay logic, kept free of DOM and Three.js so it can be unit tested.

export const NIGHT_COUNT = 3
export const NIGHT_SECONDS = 75
export const WINDOW_COUNT = 24

/**
 * Warmth gained by a tap, driven by the current combo length.
 * 1-2 combo: +2, 3-4: +3, 5-7: +4, 8+: +5
 */
export function gainForCombo(combo) {
  return combo >= 8 ? 5 : combo >= 5 ? 4 : combo >= 3 ? 3 : 2
}

/**
 * Surprise events. `common` fires often, `rare` and `legendary` are rarer.
 * Pity rule: the longer the player goes without a rare drop, the more likely
 * it becomes, so a run never feels dry.
 */
/** @typedef {{text: string, gain: number, rarity: 'common'|'rare'|'legendary'}} SurpriseDef */

/** @type {Record<string, SurpriseDef>} */
export const SURPRISES = {
  golden:   { text: '金窗 · 一间屋子忽然全亮了', gain: 12, rarity: 'legendary' },
  star:     { text: '流星划过 · 许个愿吧',       gain: 9,  rarity: 'rare' },
  lanterns: { text: '有人放了灯 · 一整排飘起来', gain: 10, rarity: 'rare' },
  cat:      { text: '屋顶上蹲着一只猫 · 它看着你', gain: 8, rarity: 'common' },
  chain:    { text: '连光 · 隔壁的窗也亮了',     gain: 8,  rarity: 'common' }
}

export const SURPRISE_COOLDOWN_MS = 6500
export const COMBO_SURPRISE_INTERVAL = 10

/**
 * Pick a surprise kind.
 * @param {number} roll random value in [0, 1)
 * @param {number} sinceRare number of common surprises since the last rare one
 * @returns {string}
 */
export function pickSurprise(roll, sinceRare = 0) {
  // Pity rules, checked from the strictest threshold down.
  // After 12 commons without a rare, guarantee a legendary.
  if (sinceRare >= 12) return 'golden'
  // After 6 commons without a rare, guarantee at least a rare.
  if (sinceRare >= 6) return 'star'

  if (roll < 0.22) return 'golden'
  if (roll < 0.40) return 'star'
  if (roll < 0.56) return 'lanterns'
  if (roll < 0.68) return 'cat'
  return 'chain'
}

/**
 * Whether a surprise may fire right now.
 * @param {number} now current timestamp
 * @param {number} lastSurprise timestamp of the previous surprise
 */
export function canSurprise(now, lastSurprise) {
  return now - lastSurprise >= SURPRISE_COOLDOWN_MS
}

/**
 * Combo milestone effects: comboUp sound every 5, light-chain every 10.
 * @returns {{sound: string|null, chain: boolean}}
 */
export function comboMilestone(combo) {
  if (combo <= 0) return { sound: null, chain: false }
  const sound = combo % COMBO_SURPRISE_INTERVAL === 0 ? 'comboUp' : (combo % 5 === 0 ? 'comboUp' : null)
  return { sound, chain: combo % COMBO_SURPRISE_INTERVAL === 0 }
}

/**
 * Pick the next window to light automatically: prefer unlit windows.
 * @template {{lit: boolean}} T
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
 * Story scheduling per night, in seconds from the night start.
 */
export const STORY_SCHEDULE = {
  0: [30],
  1: [28, 55],
  2: [25, 50]
}
