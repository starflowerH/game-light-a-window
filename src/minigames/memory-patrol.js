// Pure logic for《记忆熄灯 · 夜巡点亮》(Memory Night Patrol: Sequence & Snapshot).
//
// Two modes share one progressive level curve:
//   - memory_sequence: windows light up one by one; player recalls exact order
//   - memory_snapshot: windows light up together then extinguish; player recalls set

/**
 * Compute progressive difficulty parameters for a stage.
 * @param {number} level 1-based stage number
 * @param {number} totalWindows 12 | 18 | 24 | 30
 * @returns {{
 *   level: number,
 *   targetCount: number,
 *   stepShowMs: number,
 *   stepGapMs: number,
 *   snapshotShowMs: number,
 *   decoyCount: number,
 *   interleaveDecoys: boolean,
 *   blackoutMs: number,
 *   maxMistakes: number,
 *   recallSeconds: number,
 *   difficultyMult: number
 * }}
 */
export function computeMemoryDifficulty(level, totalWindows = 24) {
  const L = Math.max(1, Math.floor(Number(level) || 1))
  const W = Math.max(6, Math.floor(Number(totalWindows) || 24))
  const maxTargets = Math.min(W - 1, Math.max(4, Math.floor(W * 0.72)))
  const targetCount = Math.min(maxTargets, 3 + Math.floor((L - 1) * 0.95))
  const stepShowMs = Math.max(210, Math.round(740 - (L - 1) * 62))
  const stepGapMs = Math.max(65, Math.round(210 - (L - 1) * 18))
  const snapshotShowMs = Math.max(650, Math.round(2400 - (L - 1) * 210))
  const decoyCount = L >= 9 ? 4 : L >= 7 ? 3 : L >= 5 ? 2 : L >= 3 ? 1 : 0
  const interleaveDecoys = L >= 4
  const blackoutMs = L >= 6 ? Math.min(900, 350 + (L - 6) * 140) : 0
  const maxMistakes = L >= 7 ? 1 : L >= 4 ? 2 : 3
  const recallSeconds = Math.max(8, Math.round(12 + targetCount * 1.9 - (L - 1) * 0.45))
  const difficultyMult = Number((1 + (L - 1) * 0.22).toFixed(2))

  return {
    level: L,
    targetCount,
    stepShowMs,
    stepGapMs,
    snapshotShowMs,
    decoyCount,
    interleaveDecoys,
    blackoutMs,
    maxMistakes,
    recallSeconds,
    difficultyMult
  }
}

/**
 * Generate a memory round (targets + optional decoy flicker indices).
 * If valid AI pattern targets are provided, adopts them (padded/trimmed to targetCount).
 *
 * @param {number} level
 * @param {number} totalWindows
 * @param {number[] | null} [aiTargets]
 * @param {string} [aiPatternName]
 * @param {() => number} [rng]
 */
export function generateMemoryRound(level, totalWindows, aiTargets = null, aiPatternName = '', rng = Math.random) {
  const config = computeMemoryDifficulty(level, totalWindows)
  const W = Math.max(6, Math.floor(Number(totalWindows) || 24))
  /** @type {number[]} */
  const targets = []
  const used = new Set()

  if (Array.isArray(aiTargets) && aiTargets.length) {
    for (const raw of aiTargets) {
      const idx = Math.round(Number(raw))
      if (Number.isFinite(idx) && idx >= 0 && idx < W && !used.has(idx)) {
        used.add(idx)
        targets.push(idx)
        if (targets.length >= config.targetCount) break
      }
    }
  }

  const pool = Array.from({ length: W }, (_, i) => i).filter(i => !used.has(i))
  while (targets.length < config.targetCount && pool.length) {
    const pickPos = Math.floor(rng() * pool.length)
    const idx = pool.splice(pickPos, 1)[0]
    used.add(idx)
    targets.push(idx)
  }

  /** @type {number[]} */
  const decoys = []
  for (let i = 0; i < config.decoyCount && pool.length; i++) {
    const pickPos = Math.floor(rng() * pool.length)
    decoys.push(pool.splice(pickPos, 1)[0])
  }

  return {
    config,
    targets,
    decoys,
    patternName: aiPatternName || (targets.length >= 6 ? '星河巡灯阵' : '夜间值班线')
  }
}

/**
 * Create mutable round tracking state for recall phase.
 * @param {'memory_sequence'|'memory_snapshot'} mode
 * @param {ReturnType<typeof generateMemoryRound>} round
 */
export function createMemoryState(mode, round) {
  return {
    mode,
    level: round.config.level,
    targets: round.targets.slice(),
    cursor: 0,
    matched: /** @type {number[]} */ ([]),
    wrongClicks: 0,
    maxMistakes: Number.isFinite(round.config.maxMistakes) ? round.config.maxMistakes : 3,
    attempts: 0,
    scoreMultiplier: 1,
    finished: false
  }
}

/**
 * Apply a player window tap during recall phase.
 * @param {ReturnType<typeof createMemoryState>} state
 * @param {number} idx
 * @returns {{
 *   outcome: 'correct'|'wrong'|'duplicate'|'ignored',
 *   expectedIdx: number,
 *   progress: number,
 *   total: number,
 *   finished: boolean,
 *   summary: null | {
 *     correctCount: number, totalTargets: number, wrongClicks: number,
 *     accuracyPct: number, orderPerfect: boolean, scoreGained: number, passed: boolean
 *   }
 * }}
 */
export function stepMemoryTap(state, idx) {
  if (state.finished) {
    return { outcome: 'ignored', expectedIdx: -1, progress: state.matched.length, total: state.targets.length, finished: true, summary: null }
  }

  const total = state.targets.length
  if (state.mode === 'memory_sequence') {
    const expectedIdx = state.targets[state.cursor]
    if (state.matched.includes(idx) && idx !== expectedIdx) {
      return { outcome: 'duplicate', expectedIdx, progress: state.matched.length, total, finished: false, summary: null }
    }
    state.attempts += 1
    if (idx === expectedIdx) {
      state.matched.push(idx)
      state.cursor += 1
      const finished = state.cursor >= total
      state.finished = finished
      return {
        outcome: 'correct',
        expectedIdx,
        progress: state.matched.length,
        total,
        finished,
        summary: finished ? summarizeMemoryStage(state, 10) : null
      }
    }
    state.wrongClicks += 1
    // Stage-tightened mistake allowance: 3 in early stages, 2 mid-game, 1 at stage 7+
    const mistakeLimit = Number.isFinite(state.maxMistakes) ? state.maxMistakes : Math.max(3, Math.ceil(total * 0.6))
    const finished = state.wrongClicks >= mistakeLimit
    state.finished = finished
    return {
      outcome: 'wrong',
      expectedIdx,
      progress: state.matched.length,
      total,
      finished,
      summary: finished ? summarizeMemoryStage(state, 0) : null
    }
  }

  // memory_snapshot mode
  if (state.matched.includes(idx)) {
    return { outcome: 'duplicate', expectedIdx: -1, progress: state.matched.length, total, finished: false, summary: null }
  }
  state.attempts += 1
  if (state.targets.includes(idx)) {
    state.matched.push(idx)
    const finished = state.matched.length >= total
    state.finished = finished
    return {
      outcome: 'correct',
      expectedIdx: idx,
      progress: state.matched.length,
      total,
      finished,
      summary: finished ? summarizeMemoryStage(state, 10) : null
    }
  }
  state.wrongClicks += 1
  const mistakeLimit = Number.isFinite(state.maxMistakes) ? state.maxMistakes : Math.max(3, Math.ceil(total * 0.6))
  const finished = state.wrongClicks >= mistakeLimit
  state.finished = finished
  return {
    outcome: 'wrong',
    expectedIdx: state.targets.find(t => !state.matched.includes(t)) ?? -1,
    progress: state.matched.length,
    total,
    finished,
    summary: finished ? summarizeMemoryStage(state, 0) : null
  }
}

/**
 * Summarize a completed or timed-out memory stage.
 * @param {ReturnType<typeof createMemoryState>} state
 * @param {number} [timeLeftSec]
 */
export function summarizeMemoryStage(state, timeLeftSec = 0) {
  const totalTargets = state.targets.length
  const correctCount = state.matched.length
  const attempts = Math.max(1, correctCount + state.wrongClicks)
  const accuracyPct = Number(((correctCount / Math.max(attempts, totalTargets)) * 100).toFixed(1))
  const orderPerfect = correctCount === totalTargets && state.wrongClicks === 0
  const mult = (1 + (state.level - 1) * 0.22) * (state.scoreMultiplier || 1)
  const perfectBonus = orderPerfect ? 150 : 0
  const timeBonus = correctCount === totalTargets ? Math.round(Math.max(0, timeLeftSec) * 15) : 0
  const scoreGained = Math.round((correctCount * 100 + perfectBonus + timeBonus) * mult)
  const passed = correctCount >= Math.ceil(totalTargets * 0.65)
  return {
    correctCount,
    totalTargets,
    wrongClicks: state.wrongClicks,
    accuracyPct,
    orderPerfect,
    scoreGained,
    passed
  }
}
