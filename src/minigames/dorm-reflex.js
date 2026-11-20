// Pure logic for《查寝夜猫子 · 火眼金睛》(Dorm Patrol Reflex).
//
// Three signal types spawn across the dorm facade over a 60-second patrol:
//   - decoy_blue : late-night gaming/RGB flicker -> tap to turn off (+20, builds combo)
//   - safe_warm  : approved study/duty lamp      -> DO NOT tap (mistap breaks combo)
//   - glimmer    : returning student porch light -> tap to guide home (+30)

import { WINDOW_STATES } from '../../shared/constants.js'

export const PATROL_DURATION_SEC = 60

export const PATROL_WAVE_NAMES = ['热身查寝', '熄灯突击', '宿舍躁动', '宿管暴走', '零点极限']

/**
 * Compute wave pacing based on elapsed seconds across 5 escalating 12s waves.
 * @param {number} elapsedSec
 */
export function patrolWaveConfig(elapsedSec) {
  const t = Math.max(0, Number(elapsedSec) || 0)
  const progress = Math.min(1, t / PATROL_DURATION_SEC)
  const wave = Math.min(5, Math.floor(t / 12) + 1)
  return {
    wave,
    waveName: PATROL_WAVE_NAMES[wave - 1] || PATROL_WAVE_NAMES[0],
    spawnIntervalMs: Math.round(960 - progress * 600),
    ttlMs: Math.round(2550 - progress * 1350),
    maxActive: Math.min(10, 3 + Math.floor(progress * 7)),
    doubleSpawnChance: wave >= 4 ? 0.35 : 0
  }
}

/**
 * Pick a dark window and signal kind to spawn.
 * @param {Array<{ idx: number, state: string }>} windows
 * @param {() => number} [rng]
 */
export function pickPatrolSpawn(windows, rng = Math.random) {
  const dark = windows.filter(w => w.state === WINDOW_STATES.DARK)
  if (!dark.length) return null
  const picked = dark[Math.floor(rng() * dark.length)]
  const roll = rng()
  const state = roll < 0.58
    ? WINDOW_STATES.DECOY_BLUE
    : roll < 0.83
      ? WINDOW_STATES.SAFE_WARM
      : WINDOW_STATES.GLIMMER
  return { idx: picked.idx, state }
}

/**
 * Evaluate player clicking a window during Dorm Patrol Reflex.
 * @param {string} state
 * @param {number} combo
 */
export function resolvePatrolTap(state, combo) {
  if (state === WINDOW_STATES.DECOY_BLUE) {
    const nextCombo = combo + 1
    return {
      result: 'caught_owl',
      nextState: WINDOW_STATES.DARK,
      combo: nextCombo,
      scoreDelta: 20 + Math.min(30, nextCombo * 2),
      correctDelta: 1,
      mistakeDelta: 0,
      callout: '早点休息！'
    }
  }
  if (state === WINDOW_STATES.GLIMMER) {
    const nextCombo = combo + 1
    return {
      result: 'helped_late',
      nextState: WINDOW_STATES.LIT,
      combo: nextCombo,
      scoreDelta: 30 + Math.min(30, nextCombo * 2),
      correctDelta: 1,
      mistakeDelta: 0,
      callout: '留好门灯 ✓'
    }
  }
  if (state === WINDOW_STATES.SAFE_WARM) {
    return {
      result: 'disturbed_study',
      nextState: WINDOW_STATES.SAFE_WARM,
      combo: 0,
      scoreDelta: 0,
      correctDelta: 0,
      mistakeDelta: 1,
      callout: '在认真学习呢！'
    }
  }
  return {
    result: 'empty',
    nextState: state,
    combo,
    scoreDelta: 0,
    correctDelta: 0,
    mistakeDelta: 0,
    callout: ''
  }
}
