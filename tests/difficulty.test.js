import { describe, it, expect, beforeEach } from 'vitest'
import { DifficultyDirector, computeDDA, createDDADirector, FLOW_STATES } from '../src/difficulty.js'

describe('DifficultyDirector & computeDDA (C1 DDA)', () => {
  let director

  beforeEach(() => {
    director = new DifficultyDirector()
  })

  it('initializes with default neutral 1.0 scales and flow state on zero taps', () => {
    expect(director.getScales()).toEqual({
      spawnIntervalScale: 1.0,
      glimmerDurationScale: 1.0,
      decoyRate: 0.05
    })
    expect(director.getFlowState()).toBe(FLOW_STATES.FLOW)
    expect(director.history).toHaveLength(0)

    const tickResult = director.tick(1000)
    expect(tickResult.spawnIntervalScale).toBeCloseTo(1.0, 2)
    expect(tickResult.glimmerDurationScale).toBeCloseTo(1.0, 2)
    expect(tickResult.flowState).toBe(FLOW_STATES.FLOW)
  })

  it('detects beginner struggling (<70% hit rate) and increases scales up to 1.25', () => {
    // 12 taps with only 2 hits (~16.7% hit rate, struggling)
    for (let i = 0; i < 12; i++) {
      director.recordTap(i < 2, 800)
    }
    expect(director.history).toHaveLength(12)

    // With alpha = 1.0 in computeDDA or repeated ticks
    const computed = computeDDA(director.history)
    expect(computed.hitRate).toBeCloseTo(2 / 12, 2)
    expect(computed.flowState).toBe(FLOW_STATES.RUSH)
    expect(computed.spawnIntervalScale).toBeGreaterThan(1.0)
    expect(computed.glimmerDurationScale).toBeGreaterThan(1.0)
    expect(computed.spawnIntervalScale).toBeLessThanOrEqual(1.25)
    expect(computed.glimmerDurationScale).toBeLessThanOrEqual(1.25)

    // Run multiple director ticks to let EMA converge
    for (let step = 0; step < 20; step++) {
      director.tick(step * 15000, true)
    }
    const scales = director.getScales()
    expect(scales.spawnIntervalScale).toBeGreaterThan(1.15)
    expect(scales.glimmerDurationScale).toBeGreaterThan(1.15)
    expect(director.getFlowState()).toBe(FLOW_STATES.RUSH)
  })

  it('detects expert excelling (>85% hit rate) and decreases scales down to 0.80', () => {
    // 12 taps with 12 hits (100% hit rate)
    for (let i = 0; i < 12; i++) {
      director.recordTap(true, 300)
    }

    const computed = computeDDA(director.history)
    expect(computed.hitRate).toBe(1.0)
    expect(computed.flowState).toBe(FLOW_STATES.BREEZE)
    expect(computed.spawnIntervalScale).toBe(0.80)
    expect(computed.glimmerDurationScale).toBe(0.80)
    expect(computed.decoyRate).toBeCloseTo(0.20, 2)

    // EMA convergence
    for (let step = 0; step < 25; step++) {
      director.tick(step * 15000, true)
    }
    const scales = director.getScales()
    expect(scales.spawnIntervalScale).toBeCloseTo(0.80, 2)
    expect(scales.glimmerDurationScale).toBeCloseTo(0.80, 2)
    expect(director.getFlowState()).toBe(FLOW_STATES.BREEZE)
  })

  it('strictly clamps scales within [0.80, 1.25] boundaries under extreme inputs', () => {
    // Extreme 0% hit rate
    const zeroHistory = Array.from({ length: 12 }, () => ({ hit: false }))
    const zeroComputed = computeDDA(zeroHistory, { minScale: 0.80, maxScale: 1.25 })
    expect(zeroComputed.spawnIntervalScale).toBeLessThanOrEqual(1.25)
    expect(zeroComputed.glimmerDurationScale).toBeLessThanOrEqual(1.25)
    expect(zeroComputed.spawnIntervalScale).toBeGreaterThanOrEqual(0.80)

    // Extreme 100% hit rate
    const perfectHistory = Array.from({ length: 12 }, () => ({ hit: true }))
    const perfectComputed = computeDDA(perfectHistory, { minScale: 0.80, maxScale: 1.25 })
    expect(perfectComputed.spawnIntervalScale).toBeGreaterThanOrEqual(0.80)
    expect(perfectComputed.glimmerDurationScale).toBeGreaterThanOrEqual(0.80)
    expect(perfectComputed.spawnIntervalScale).toBeLessThanOrEqual(1.25)
  })

  it('smoothly updates scales via Exponential Moving Average (EMA)', () => {
    const smoothDirector = new DifficultyDirector({ smoothingAlpha: 0.3 })
    // All 12 taps hit
    for (let i = 0; i < 12; i++) {
      smoothDirector.recordTap(true)
    }

    // Step 1: should move towards 0.80 from 1.0, but not jump immediately to 0.80
    const state1 = smoothDirector.tick(1000, true)
    // 1.0 * 0.7 + 0.8 * 0.3 = 0.94
    expect(state1.spawnIntervalScale).toBeCloseTo(0.94, 2)

    // Step 2: 0.94 * 0.7 + 0.8 * 0.3 = 0.898
    const state2 = smoothDirector.tick(15000, true)
    expect(state2.spawnIntervalScale).toBeCloseTo(0.898, 2)
  })

  it('maintains rolling window of exactly 12 items, discarding oldest', () => {
    for (let i = 0; i < 20; i++) {
      director.recordTap(i >= 8, 400 + i)
    }
    expect(director.history).toHaveLength(12)
    // Oldest 8 were discarded; the remaining 12 all had i >= 8 so all hits
    expect(director.history.every(item => item.hit)).toBe(true)
  })

  it('resets state cleanly to default neutral values', () => {
    for (let i = 0; i < 12; i++) {
      director.recordTap(true)
    }
    director.tick(1000, true)
    expect(director.history.length).toBeGreaterThan(0)

    director.reset()
    expect(director.history).toHaveLength(0)
    expect(director.getScales()).toEqual({
      spawnIntervalScale: 1.0,
      glimmerDurationScale: 1.0,
      decoyRate: 0.05
    })
    expect(director.getFlowState()).toBe(FLOW_STATES.FLOW)
  })

  it('supports createDDADirector factory and custom thresholds', () => {
    const custom = createDDADirector({
      windowSize: 6,
      targetFlowMin: 0.60,
      targetFlowMax: 0.90,
      minScale: 0.75,
      maxScale: 1.30
    })
    expect(custom.windowSize).toBe(6)
    expect(custom.targetFlowMin).toBe(0.60)
    expect(custom.minScale).toBe(0.75)
    expect(custom.maxScale).toBe(1.30)
  })
})
