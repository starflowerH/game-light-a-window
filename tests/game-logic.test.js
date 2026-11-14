import { describe, expect, it } from 'vitest'
import {
  gainForCombo,
  pickSurprise,
  canSurprise,
  comboMilestone,
  pickUnlitWindow,
  SURPRISES,
  STORY_SCHEDULE,
  NIGHT_COUNT,
  NIGHT_SECONDS,
  WINDOW_COUNT
} from '../src/game-logic.js'

describe('gainForCombo', () => {
  it('gives +2 for a tap with no combo', () => {
    expect(gainForCombo(0)).toBe(2)
    expect(gainForCombo(1)).toBe(2)
    expect(gainForCombo(2)).toBe(2)
  })

  it('gives +3 at combo 3-4', () => {
    expect(gainForCombo(3)).toBe(3)
    expect(gainForCombo(4)).toBe(3)
  })

  it('gives +4 at combo 5-7', () => {
    expect(gainForCombo(5)).toBe(4)
    expect(gainForCombo(7)).toBe(4)
  })

  it('gives +5 at combo 8 and above', () => {
    expect(gainForCombo(8)).toBe(5)
    expect(gainForCombo(20)).toBe(5)
  })

  it('is monotonically non-decreasing as the combo grows', () => {
    let prev = 0
    for (let c = 0; c <= 30; c++) {
      const g = gainForCombo(c)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
  })
})

describe('pickSurprise', () => {
  it('always returns a known surprise kind', () => {
    for (let i = 0; i < 200; i++) {
      const kind = pickSurprise(Math.random())
      expect(Object.keys(SURPRISES)).toContain(kind)
    }
  })

  it('maps the roll ranges onto the expected kinds', () => {
    expect(pickSurprise(0.0)).toBe('golden')
    expect(pickSurprise(0.21)).toBe('golden')
    expect(pickSurprise(0.30)).toBe('star')
    expect(pickSurprise(0.50)).toBe('lanterns')
    expect(pickSurprise(0.60)).toBe('cat')
    expect(pickSurprise(0.90)).toBe('chain')
  })

  it('guarantees a rare drop after six commons in a row', () => {
    for (let i = 0; i < 50; i++) {
      const kind = pickSurprise(Math.random(), 6)
      expect(SURPRISES[kind].rarity).not.toBe('common')
    }
  })

  it('guarantees a legendary drop after twelve commons in a row', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickSurprise(Math.random(), 12)).toBe('golden')
    }
  })

  it('gives every surprise a positive warmth gain and a label', () => {
    for (const [kind, def] of Object.entries(SURPRISES)) {
      expect(def.gain).toBeGreaterThan(0)
      expect(def.text.length).toBeGreaterThan(0)
      expect(['common', 'rare', 'legendary']).toContain(def.rarity)
      expect(kind.length).toBeGreaterThan(0)
    }
  })
})

describe('canSurprise', () => {
  it('blocks surprises during the cooldown window', () => {
    expect(canSurprise(10000, 10000)).toBe(false)
    expect(canSurprise(10000 + 6000, 10000)).toBe(false)
  })

  it('allows surprises once the cooldown has passed', () => {
    expect(canSurprise(10000 + 6500, 10000)).toBe(true)
    expect(canSurprise(99999, 10000)).toBe(true)
  })
})

describe('comboMilestone', () => {
  it('does nothing below combo 5', () => {
    expect(comboMilestone(0).sound).toBeNull()
    expect(comboMilestone(4).sound).toBeNull()
    expect(comboMilestone(4).chain).toBe(false)
  })

  it('plays the milestone sound every 5 combos', () => {
    expect(comboMilestone(5).sound).toBe('comboUp')
    expect(comboMilestone(10).sound).toBe('comboUp')
    expect(comboMilestone(15).sound).toBe('comboUp')
  })

  it('triggers the light chain every 10 combos', () => {
    expect(comboMilestone(10).chain).toBe(true)
    expect(comboMilestone(20).chain).toBe(true)
    expect(comboMilestone(30).chain).toBe(true)
    expect(comboMilestone(11).chain).toBe(false)
  })
})

describe('pickUnlitWindow', () => {
  it('only ever picks a window that is not lit yet', () => {
    /** @type {{id: number, lit: boolean}[]} */
    const windows = [
      { id: 0, lit: true }, { id: 1, lit: false }, { id: 2, lit: true }, { id: 3, lit: false }
    ]
    for (let i = 0; i < 50; i++) {
      const picked = pickUnlitWindow(windows, () => Math.random())
      expect(picked.lit).toBe(false)
      expect([1, 3]).toContain(picked.id)
    }
  })

  it('returns null when every window is already lit', () => {
    const windows = Array.from({ length: 4 }, (_, i) => ({ id: i, lit: true }))
    expect(pickUnlitWindow(windows, () => 0)).toBeNull()
  })

  it('returns null for an empty window list', () => {
    expect(pickUnlitWindow([], () => 0)).toBeNull()
  })
})

describe('game constants', () => {
  it('runs three nights of 75 seconds with 24 windows', () => {
    expect(NIGHT_COUNT).toBe(3)
    expect(NIGHT_SECONDS).toBe(75)
    expect(WINDOW_COUNT).toBe(24)
  })

  it('schedules stories for every night', () => {
    expect(STORY_SCHEDULE[0]).toHaveLength(1)
    expect(STORY_SCHEDULE[1]).toHaveLength(2)
    expect(STORY_SCHEDULE[2]).toHaveLength(2)
  })
})
