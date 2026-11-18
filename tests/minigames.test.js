import { describe, expect, it } from 'vitest'
import {
  computeMemoryDifficulty,
  generateMemoryRound,
  createMemoryState,
  stepMemoryTap,
  summarizeMemoryStage
} from '../src/minigames/memory-patrol.js'
import {
  PATROL_DURATION_SEC,
  patrolWaveConfig,
  pickPatrolSpawn,
  resolvePatrolTap
} from '../src/minigames/dorm-reflex.js'
import {
  crossIndices,
  toggleCross,
  generateSolvableBoard,
  solveLightsOutGF2,
  isAllLightsOut
} from '../src/minigames/lights-out.js'
import {
  DORM_TYPES,
  WINDOW_STATES,
  dormDef,
  generateCampusNickname,
  outfitForEnv
} from '../shared/constants.js'
import { RANDOM_EVENTS, pickRandomEvent } from '../src/random-events.js'
import { buildOfflineDialogue, renderNpcPortraitSvg } from '../src/npc-portraits.js'

describe('memory-patrol minigame (sequence & snapshot)', () => {
  it('scales targetCount upward and timing tighter with stage level', () => {
    const s1 = computeMemoryDifficulty(1, 24)
    const s6 = computeMemoryDifficulty(6, 24)
    expect(s6.targetCount).toBeGreaterThan(s1.targetCount)
    expect(s6.stepShowMs).toBeLessThan(s1.stepShowMs)
    expect(s6.snapshotShowMs).toBeLessThan(s1.snapshotShowMs)
    expect(s6.decoyCount).toBeGreaterThan(0)
  })

  it('caps targetCount sensibly for 12-window staff dorm', () => {
    const staffHigh = computeMemoryDifficulty(15, 12)
    expect(staffHigh.targetCount).toBeLessThan(12)
    expect(staffHigh.targetCount).toBeGreaterThanOrEqual(4)
  })

  it('enforces exact sequential order in memory_sequence mode', () => {
    const round = generateMemoryRound(1, 18, [2, 5, 8], '楼梯顺序测试')
    const state = createMemoryState('memory_sequence', round)
    expect(round.targets.slice(0, 3)).toEqual([2, 5, 8])

    // Tapping out-of-order target counts as wrong
    const bad = stepMemoryTap(state, 5)
    expect(bad.outcome).toBe('wrong')
    expect(state.cursor).toBe(0)

    // Tapping strictly in order clears stage
    const r1 = stepMemoryTap(state, 2)
    const r2 = stepMemoryTap(state, 5)
    const r3 = stepMemoryTap(state, 8)
    expect(r1.outcome).toBe('correct')
    expect(r2.outcome).toBe('correct')
    expect(r3.outcome).toBe('correct')
    expect(state.finished).toBe(true)

    const sum = summarizeMemoryStage(state, 8)
    expect(sum.passed).toBe(true)
    expect(sum.correctCount).toBe(3)
    expect(sum.orderPerfect).toBe(false)
    expect(sum.accuracyPct).toBe(75)
  })

  it('allows any spatial order in memory_snapshot mode', () => {
    const round = generateMemoryRound(1, 24, [10, 4, 15], '夜景拼图')
    const state = createMemoryState('memory_snapshot', round)

    const a = stepMemoryTap(state, 15)
    const dup = stepMemoryTap(state, 15)
    const b = stepMemoryTap(state, 4)
    const c = stepMemoryTap(state, 10)
    expect(a.outcome).toBe('correct')
    expect(dup.outcome).toBe('duplicate')
    expect(b.outcome).toBe('correct')
    expect(c.outcome).toBe('correct')
    expect(c.finished).toBe(true)
    expect(c.summary?.accuracyPct).toBe(100)
  })
})

describe('dorm-reflex minigame', () => {
  it('speeds up wave pacing toward the end of the 60s patrol', () => {
    const start = patrolWaveConfig(0)
    const end = patrolWaveConfig(PATROL_DURATION_SEC)
    expect(end.spawnIntervalMs).toBeLessThan(start.spawnIntervalMs)
    expect(end.ttlMs).toBeLessThan(start.ttlMs)
    expect(end.maxActive).toBeGreaterThanOrEqual(start.maxActive)
  })

  it('picks a dark window and scores DECOY_BLUE, GLIMMER, and SAFE_WARM properly', () => {
    const windows = Array.from({ length: 12 }, (_, idx) => ({ idx, state: WINDOW_STATES.DARK }))
    const spawned = pickPatrolSpawn(windows, () => 0.1)
    expect(spawned).not.toBeNull()
    expect(spawned?.state).toBe(WINDOW_STATES.DECOY_BLUE)

    const hitOwl = resolvePatrolTap(WINDOW_STATES.DECOY_BLUE, 2)
    expect(hitOwl.correctDelta).toBe(1)
    expect(hitOwl.scoreDelta).toBeGreaterThan(20)
    expect(hitOwl.nextState).toBe(WINDOW_STATES.DARK)

    const hitLate = resolvePatrolTap(WINDOW_STATES.GLIMMER, 3)
    expect(hitLate.correctDelta).toBe(1)
    expect(hitLate.nextState).toBe(WINDOW_STATES.LIT)

    const hitStudy = resolvePatrolTap(WINDOW_STATES.SAFE_WARM, 5)
    expect(hitStudy.mistakeDelta).toBe(1)
    expect(hitStudy.combo).toBe(0)
  })
})

describe('lights-out-puzzle & GF(2) exact solver across all 4 dormitories', () => {
  it('computes orthogonal cross neighbors accurately on boundaries and interior', () => {
    expect(crossIndices(0, 3, 4).sort((a, b) => a - b)).toEqual([0, 1, 4])
    expect(crossIndices(5, 3, 4).sort((a, b) => a - b)).toEqual([1, 4, 5, 6, 9])
  })

  it('generates 100% GF(2) solvable boards for staff(12), highschool(18), university(24), grad(30)', () => {
    for (const d of DORM_TYPES) {
      const board = generateSolvableBoard(d.rows, d.cols, 3)
      expect(board.grid).toHaveLength(d.windowCount)
      expect(isAllLightsOut(board.grid)).toBe(false)

      const solution = solveLightsOutGF2(board.grid, d.rows, d.cols)
      expect(solution).not.toBeNull()
      expect((solution || []).length).toBeGreaterThan(0)

      let cur = board.grid.slice()
      for (const clickIdx of solution || []) {
        cur = toggleCross(cur, clickIdx, d.rows, d.cols)
      }
      expect(isAllLightsOut(cur)).toBe(true)
    }
  })

  it('provides valid dorm metadata via dormDef helper', () => {
    expect(dormDef('staff').windowCount).toBe(12)
    expect(dormDef('highschool').windowCount).toBe(18)
    expect(dormDef('university').windowCount).toBe(24)
    expect(dormDef('grad').windowCount).toBe(30)
  })
})

describe('v4 nicknames, weather outfits, NPC SVG & random events', () => {
  it('generates varied short campus nicknames <= 8 chars', () => {
    for (let i = 0; i < 15; i++) {
      const nick = generateCampusNickname()
      expect(nick.length).toBeGreaterThanOrEqual(2)
      expect(nick.length).toBeLessThanOrEqual(8)
    }
  })

  it('maps weather and season deterministically to distinct NPC outfits & SVG layers', () => {
    expect(outfitForEnv('light_rain', 'summer')).toBe('rain_gear')
    expect(outfitForEnv('snow', 'winter')).toBe('winter_puffer')
    expect(outfitForEnv('fog', 'autumn')).toBe('fog_coat')
    expect(outfitForEnv('wind', 'autumn')).toBe('autumn_knit')
    expect(outfitForEnv('clear', 'summer')).toBe('sunny_light')

    const rainSvg = renderNpcPortraitSvg('aunt_lin', 'light_rain', 'summer')
    const winterSvg = renderNpcPortraitSvg('aunt_lin', 'snow', 'winter')
    expect(rainSvg).toContain('<svg')
    expect(winterSvg).toContain('<svg')
    expect(rainSvg).not.toBe(winterSvg)
  })

  it('builds localized offline dialogue and picks valid random events', () => {
    const dlg = buildOfflineDialogue('grad', 'winter', 'snow')
    expect(dlg.lines.length).toBeGreaterThanOrEqual(2)
    expect(dlg.choices.length).toBe(2)
    const ev = pickRandomEvent(0, () => 0.1)
    expect(RANDOM_EVENTS.map(e => e.id)).toContain(ev.id)
  })
})
