// Dynamic Difficulty Adjustment (DDA) Flow Director
// Evaluates rolling tap/drag telemetry and smoothly steers pacing into the [0.70, 0.85] Flow State.
// Enabled across all game modes including leaderboards.

export const FLOW_STATES = {
  FLOW: 'flow',
  BREEZE: 'breeze',
  RUSH: 'rush'
}

/**
 * Evaluates hitRate and returns pacing multipliers.
 *
 * @param {Array<{ hit: boolean, reactionTimeMs?: number, isChain?: boolean }>} history
 * @param {{ targetFlowMin?: number, targetFlowMax?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {{ spawnIntervalScale: number, glimmerDurationScale: number, decoyRate: number, flowState: string, hitRate: number }}
 */
export function computeDDA(history = [], options = {}) {
  const targetMin = options.targetFlowMin ?? 0.70
  const targetMax = options.targetFlowMax ?? 0.85
  const minScale = options.minScale ?? 0.80
  const maxScale = options.maxScale ?? 1.25

  if (!Array.isArray(history) || history.length === 0) {
    return {
      spawnIntervalScale: 1.0,
      glimmerDurationScale: 1.0,
      decoyRate: 0.05,
      flowState: FLOW_STATES.FLOW,
      hitRate: 0.80
    }
  }

  const hits = history.filter(t => Boolean(t && t.hit)).length
  const hitRate = hits / history.length

  let targetSpawn = 1.0
  let targetGlimmer = 1.0
  let targetDecoy = 0.05
  let flowState = FLOW_STATES.FLOW

  if (hitRate > targetMax) {
    // Player finding it too easy -> speed up spawns & faster expiration
    flowState = FLOW_STATES.BREEZE
    const delta = (hitRate - targetMax) / Math.max(0.01, 1.0 - targetMax)
    targetSpawn = 1.0 - 0.20 * delta
    targetGlimmer = 1.0 - 0.20 * delta
    targetDecoy = 0.05 + 0.15 * delta
  } else if (hitRate < targetMin) {
    // Player struggling -> slow down spawns & give more window glimmer time
    flowState = FLOW_STATES.RUSH
    const delta = (targetMin - hitRate) / Math.max(0.01, targetMin)
    targetSpawn = 1.0 + 0.25 * delta
    targetGlimmer = 1.0 + 0.25 * delta
    targetDecoy = Math.max(0.0, 0.05 - 0.05 * delta)
  } else {
    // Optimal Flow state
    flowState = FLOW_STATES.FLOW
    targetSpawn = 1.0
    targetGlimmer = 1.0
    targetDecoy = 0.05
  }

  return {
    spawnIntervalScale: Math.max(minScale, Math.min(maxScale, targetSpawn)),
    glimmerDurationScale: Math.max(minScale, Math.min(maxScale, targetGlimmer)),
    decoyRate: Math.max(0.0, Math.min(0.30, targetDecoy)),
    flowState,
    hitRate
  }
}

export class DifficultyDirector {
  /**
   * @param {object} [options]
   * @param {number} [options.windowSize=12]
   * @param {number} [options.targetFlowMin=0.70]
   * @param {number} [options.targetFlowMax=0.85]
   * @param {number} [options.minScale=0.80]
   * @param {number} [options.maxScale=1.25]
   * @param {number} [options.smoothingAlpha=0.3]
   * @param {number} [options.evalIntervalMs=10000]
   */
  constructor(options = {}) {
    this.windowSize = options.windowSize ?? 12
    this.targetFlowMin = options.targetFlowMin ?? 0.70
    this.targetFlowMax = options.targetFlowMax ?? 0.85
    this.minScale = options.minScale ?? 0.80
    this.maxScale = options.maxScale ?? 1.25
    this.smoothingAlpha = options.smoothingAlpha ?? 0.3
    this.evalIntervalMs = options.evalIntervalMs ?? 10000

    this.spawnIntervalScale = 1.0
    this.glimmerDurationScale = 1.0
    this.decoyRate = 0.05
    this.flowState = FLOW_STATES.FLOW
    this.hitRate = 0.80

    /** @type {Array<{ hit: boolean, reactionTimeMs: number, isChain: boolean, t: number }>} */
    this.history = []
    this.lastEvalTime = 0
  }

  /**
   * Record a tap or drag action.
   * @param {boolean} hit
   * @param {number} [reactionTimeMs=0]
   * @param {boolean} [isChain=false]
   */
  recordTap(hit, reactionTimeMs = 0, isChain = false) {
    this.history.push({
      hit: Boolean(hit),
      reactionTimeMs: Math.max(0, Number(reactionTimeMs) || 0),
      isChain: Boolean(isChain),
      t: typeof performance !== 'undefined' ? performance.now() : Date.now()
    })
    if (this.history.length > this.windowSize) {
      this.history.shift()
    }
  }

  /**
   * Periodic tick to evaluate history and update smoothed scales.
   * @param {number} [now]
   * @param {boolean} [force=false]
   * @returns {{ spawnIntervalScale: number, glimmerDurationScale: number, decoyRate: number, flowState: string, hitRate: number }}
   */
  tick(now = 0, force = false) {
    const t = now || (typeof performance !== 'undefined' ? performance.now() : Date.now())
    if (!force && this.lastEvalTime > 0 && t - this.lastEvalTime < this.evalIntervalMs) {
      return this.getState()
    }
    this.lastEvalTime = t

    const computed = computeDDA(this.history, {
      targetFlowMin: this.targetFlowMin,
      targetFlowMax: this.targetFlowMax,
      minScale: this.minScale,
      maxScale: this.maxScale
    })

    // Exponential Moving Average (EMA) smoothing
    const alpha = this.smoothingAlpha
    this.spawnIntervalScale = this.spawnIntervalScale * (1 - alpha) + computed.spawnIntervalScale * alpha
    this.glimmerDurationScale = this.glimmerDurationScale * (1 - alpha) + computed.glimmerDurationScale * alpha
    this.decoyRate = this.decoyRate * (1 - alpha) + computed.decoyRate * alpha

    // Strict boundary clamping
    this.spawnIntervalScale = Math.max(this.minScale, Math.min(this.maxScale, this.spawnIntervalScale))
    this.glimmerDurationScale = Math.max(this.minScale, Math.min(this.maxScale, this.glimmerDurationScale))
    this.decoyRate = Math.max(0.0, Math.min(0.30, this.decoyRate))

    this.flowState = computed.flowState
    this.hitRate = computed.hitRate

    return this.getState()
  }

  /**
   * Return current clamped scales.
   * @returns {{ spawnIntervalScale: number, glimmerDurationScale: number, decoyRate: number }}
   */
  getScales() {
    return {
      spawnIntervalScale: this.spawnIntervalScale,
      glimmerDurationScale: this.glimmerDurationScale,
      decoyRate: this.decoyRate
    }
  }

  /**
   * Return current flow state enum ('flow' | 'breeze' | 'rush').
   * @returns {string}
   */
  getFlowState() {
    return this.flowState
  }

  /**
   * Full state snapshot.
   */
  getState() {
    return {
      spawnIntervalScale: this.spawnIntervalScale,
      glimmerDurationScale: this.glimmerDurationScale,
      decoyRate: this.decoyRate,
      flowState: this.flowState,
      hitRate: this.hitRate
    }
  }

  /**
   * Reset director state for a new night.
   */
  reset() {
    this.history = []
    this.spawnIntervalScale = 1.0
    this.glimmerDurationScale = 1.0
    this.decoyRate = 0.05
    this.flowState = FLOW_STATES.FLOW
    this.hitRate = 0.80
    this.lastEvalTime = 0
  }
}

/**
 * Factory helper.
 * @param {object} [options]
 * @returns {DifficultyDirector}
 */
export function createDDADirector(options) {
  return new DifficultyDirector(options)
}
