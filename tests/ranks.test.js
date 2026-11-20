import { describe, expect, it } from 'vitest'
import {
  MODE_MAX_STAGE,
  PATROL_TIERS,
  evaluateRunTier,
  formatStageMilestone
} from '../shared/ranks.js'

describe('Patrol Mastery Tiers & Stage Milestones (shared/ranks.js)', () => {
  it('defines 7 ordered tiers D..SSS and expected max stage per mode', () => {
    expect(PATROL_TIERS.map(t => t.code)).toEqual(['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'])
    expect(MODE_MAX_STAGE).toEqual({
      memory_sequence: 10,
      memory_snapshot: 10,
      patrol_reflex: 5,
      lights_out_puzzle: 8,
      star_sweep: 3
    })
  })

  it('evaluates tier boundaries monotonically from D to SSS across all 5 modes', () => {
    const modes = Object.keys(MODE_MAX_STAGE)
    for (const mode of modes) {
      let prevIdx = -1
      for (let i = 0; i < PATROL_TIERS.length; i++) {
        const tier = PATROL_TIERS[i]
        const threshold = tier.thresholds[mode]
        const res = evaluateRunTier({ gameMode: mode, score: threshold, stageReached: 1, accuracyPct: 90 })
        expect(res.code).toBe(tier.code)
        expect(res.tierIndex).toBe(i)
        expect(res.tierIndex).toBeGreaterThan(prevIdx)
        prevIdx = res.tierIndex

        if (i > 0) {
          const below = evaluateRunTier({ gameMode: mode, score: threshold - 1, stageReached: 1 })
          expect(below.tierIndex).toBe(i - 1)
        }
      }
    }
  })

  it('computes pointsToNext, tierProgress, and handles SSS ceiling accurately', () => {
    const mid = evaluateRunTier({ gameMode: 'memory_sequence', score: 1700, stageReached: 5, accuracyPct: 88 })
    expect(mid.code).toBe('A')
    expect(mid.nextTier?.code).toBe('S')
    expect(mid.pointsToNext).toBe(3000 - 1700)
    expect(mid.tierProgress).toBe(0)
    expect(mid.milestoneText).toBe('闯到 第 5/10 关')

    const halfway = evaluateRunTier({ gameMode: 'star_sweep', score: 330, stageReached: 2, accuracyPct: 100 })
    expect(halfway.code).toBe('A')
    expect(halfway.nextTier?.code).toBe('S')
    expect(halfway.pointsToNext).toBe(150)
    expect(halfway.tierProgress).toBeGreaterThan(0)
    expect(halfway.tierProgress).toBeLessThan(1)

    const legend = evaluateRunTier({ gameMode: 'memory_sequence', score: 99999, stageReached: 10, accuracyPct: 100 })
    expect(legend.code).toBe('SSS')
    expect(legend.nextTier).toBeNull()
    expect(legend.pointsToNext).toBe(0)
    expect(legend.tierProgress).toBe(1)
    expect(legend.stageRatio).toBe(1)
  })

  it('formats intuitive stage & wave milestone strings per mode and clamps bounds', () => {
    expect(formatStageMilestone('memory_sequence', 7)).toBe('闯到 第 7/10 关')
    expect(formatStageMilestone('memory_sequence', 10)).toBe('🏆 10关全通')
    expect(formatStageMilestone('memory_snapshot', 3)).toBe('闯到 第 3/10 关')
    expect(formatStageMilestone('patrol_reflex', 4)).toBe('守到 第 4/5 波')
    expect(formatStageMilestone('patrol_reflex', 99)).toBe('🏆 5波全守')
    expect(formatStageMilestone('lights_out_puzzle', 6)).toBe('解开 第 6/8 关')
    expect(formatStageMilestone('lights_out_puzzle', 8)).toBe('🏆 8关全通')
    expect(formatStageMilestone('star_sweep', 2)).toBe('第 2/3 夜')
    expect(formatStageMilestone('star_sweep', 3)).toBe('🏆 3夜全通')
    expect(formatStageMilestone('unknown_mode', -2)).toBe('闯到 第 1/10 关')
  })
})
