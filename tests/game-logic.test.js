import { describe, expect, it } from 'vitest'
import {
  gainForCombo,
  gainForDragChain,
  isChainCallout,
  shouldEncore,
  pickSurprise,
  canSurprise,
  comboMilestone,
  pickUnlitWindow,
  pickNextGlimmerWindow,
  actionableCount,
  windowStateOf,
  evaluateCommissions,
  resolveEnding,
  bumpBond,
  roomForIndex,
  indexForRoom,
  SURPRISES,
  STORY_SCHEDULE,
  NIGHT_COUNT,
  NIGHT_SECONDS,
  WINDOW_COUNT
} from '../src/game-logic.js'
import { DEFAULT_COMMISSIONS, WINDOW_STATES, WINDOW_IDS } from '../shared/constants.js'

describe('gainForCombo (v3 ladder)', () => {
  it('gives +3 for the first two taps', () => {
    expect(gainForCombo(0)).toBe(3)
    expect(gainForCombo(1)).toBe(3)
    expect(gainForCombo(2)).toBe(3)
  })

  it('gives +4 at combo 3-5', () => {
    expect(gainForCombo(3)).toBe(4)
    expect(gainForCombo(5)).toBe(4)
  })

  it('gives +6 at combo 6-9', () => {
    expect(gainForCombo(6)).toBe(6)
    expect(gainForCombo(9)).toBe(6)
  })

  it('gives +8 at combo 10 and above', () => {
    expect(gainForCombo(10)).toBe(8)
    expect(gainForCombo(40)).toBe(8)
  })

  it('is monotonically non-decreasing as the combo grows', () => {
    let prev = 0
    for (let c = 0; c <= 40; c++) {
      const g = gainForCombo(c)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
  })

  it('clamps nonsense input instead of returning NaN', () => {
    expect(gainForCombo(-5)).toBe(3)
    expect(gainForCombo(undefined)).toBe(3)
    expect(gainForCombo(2.9)).toBe(3)
  })
})

describe('gainForDragChain', () => {
  it('adds two warmth per window in the stroke, capped at five', () => {
    expect(gainForDragChain(4, 1)).toBe(gainForCombo(4) + 2)
    expect(gainForDragChain(4, 2)).toBe(gainForCombo(4) + 4)
    expect(gainForDragChain(4, 5)).toBe(gainForCombo(4) + 10)
    expect(gainForDragChain(4, 9)).toBe(gainForCombo(4) + 10)
  })

  it('always beats a plain tap', () => {
    for (let k = 1; k <= 8; k++) {
      expect(gainForDragChain(5, k)).toBeGreaterThan(gainForCombo(5))
    }
  })

  it('treats a zero-length stroke as one window', () => {
    expect(gainForDragChain(3, 0)).toBe(gainForCombo(3) + 2)
  })
})

describe('isChainCallout', () => {
  it('fires at three or more windows in one stroke', () => {
    expect(isChainCallout(2)).toBe(false)
    expect(isChainCallout(3)).toBe(true)
    expect(isChainCallout(6)).toBe(true)
  })
})

describe('shouldEncore', () => {
  it('only encores with more than eight seconds left', () => {
    expect(shouldEncore(8)).toBe(false)
    expect(shouldEncore(8.1)).toBe(true)
    expect(shouldEncore(0)).toBe(false)
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

describe('windowStateOf', () => {
  it('prefers the v3 state string', () => {
    expect(windowStateOf({ state: WINDOW_STATES.GLIMMER, lit: false })).toBe('glimmer')
    expect(windowStateOf({ state: WINDOW_STATES.LIT, lit: true })).toBe('lit')
  })

  it('falls back to the v2 boolean', () => {
    expect(windowStateOf({ lit: true })).toBe('lit')
    expect(windowStateOf({ lit: false })).toBe('dark')
    expect(windowStateOf(null)).toBe('dark')
  })
})

describe('pickNextGlimmerWindow', () => {
  const grid = WINDOW_IDS.map(w => ({ idx: w.idx, roomId: w.roomId, state: 'dark', lit: false }))

  it('never picks a window that is already awake or lit', () => {
    const mixed = grid.map((w, i) => ({ ...w, state: i % 2 ? WINDOW_STATES.GLIMMER : WINDOW_STATES.LIT }))
    expect(pickNextGlimmerWindow(mixed, [], () => 0.5)).toBeNull()
  })

  it('only returns dark windows', () => {
    const mixed = grid.map((w, i) => ({ ...w, state: i % 3 === 0 ? WINDOW_STATES.DARK : WINDOW_STATES.LIT }))
    for (let i = 0; i < 60; i++) {
      const picked = pickNextGlimmerWindow(mixed, [], Math.random)
      expect(picked).not.toBeNull()
      expect(picked.state).toBe(WINDOW_STATES.DARK)
    }
  })

  it('can favour the resident rooms', () => {
    // rng below 0.34 takes the resident branch, so the result must be a core room.
    const picked = pickNextGlimmerWindow(grid, [304], () => 0.1)
    expect(picked.roomId).toBe(304)
  })

  it('spreads across the grid when the resident branch is not taken', () => {
    const seen = new Set()
    let seed = 7
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return 0.5 + (seed / 2147483648) * 0.5
    }
    for (let i = 0; i < 200; i++) {
      const picked = pickNextGlimmerWindow(grid, [304], rng)
      seen.add(picked.idx)
    }
    expect(seen.size).toBeGreaterThan(10)
  })

  it('returns null for an empty grid', () => {
    expect(pickNextGlimmerWindow([], [], () => 0)).toBeNull()
  })
})

describe('actionableCount', () => {
  it('counts glimmer, beacon and resonance windows', () => {
    const windows = [
      { state: WINDOW_STATES.DARK },
      { state: WINDOW_STATES.GLIMMER },
      { state: WINDOW_STATES.STORY_BEACON },
      { state: WINDOW_STATES.RESONANCE_PAIR },
      { state: WINDOW_STATES.LIT }
    ]
    expect(actionableCount(windows)).toBe(3)
  })
})

describe('evaluateCommissions', () => {
  it('reports progress and completion for the night-one set', () => {
    const out = evaluateCommissions(DEFAULT_COMMISSIONS[0], { litCount: 14, maxCombo: 5, storyChoices: 0 })
    expect(out.items).toHaveLength(3)
    expect(out.items[0]).toMatchObject({ id: 'lit_14', progress: 14, done: true })
    expect(out.items[1]).toMatchObject({ id: 'combo_6', progress: 5, done: false })
    expect(out.newlyStamped).toEqual(['lit_14'])
    expect(out.allDone).toBe(false)
  })

  it('does not re-stamp a commission already stamped tonight', () => {
    const out = evaluateCommissions(DEFAULT_COMMISSIONS[0], {
      litCount: 20, maxCombo: 9, storyChoices: 2, stamped: ['lit_14', 'combo_6', 'story_1']
    })
    expect(out.newlyStamped).toHaveLength(0)
    expect(out.allDone).toBe(true)
  })

  it('counts the third floor for the row_lit commission', () => {
    const c = DEFAULT_COMMISSIONS[1][0]
    expect(c.type).toBe('row_lit')
    const partial = evaluateCommissions([c], { litRooms: [301, 302, 305] })
    expect(partial.items[0].progress).toBe(3)
    const full = evaluateCommissions([c], { litRooms: [301, 302, 303, 304, 305, 306] })
    expect(full.items[0].done).toBe(true)
  })

  it('counts the whole building for all_lit', () => {
    const c = { id: 'all', type: 'all_lit', target: 24, label: '全楼' }
    const rooms = WINDOW_IDS.map(w => w.roomId).slice(0, 24)
    expect(evaluateCommissions([c], { litRooms: rooms }).items[0].done).toBe(true)
    expect(evaluateCommissions([c], { litRooms: rooms.slice(0, 23) }).items[0].done).toBe(false)
  })

  it('never reports progress above the target', () => {
    const out = evaluateCommissions(DEFAULT_COMMISSIONS[0], { litCount: 999 })
    expect(out.items[0].progress).toBe(out.items[0].target)
  })

  it('tolerates an empty commission list', () => {
    const out = evaluateCommissions([], {})
    expect(out.items).toEqual([])
    expect(out.allDone).toBe(false)
    expect(out.newlyStamped).toEqual([])
  })
})

describe('resolveEnding', () => {
  const allRooms = WINDOW_IDS.map(w => w.roomId)

  it('returns the stargazer IF line when all three conditions hold', () => {
    const run = {
      nights: [
        { litRooms: [406, 304] }, { litRooms: [406] }, { litRooms: [406, 102] }
      ],
      choices: [{ roomId: 406, choiceId: 'A', label: '吹散头顶薄云' }],
      events: { star: 1 }
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_C_STARGAZER')
    expect(resolveEnding(run).bondRoomId).toBe(406)
  })

  it('does not take the stargazer line without a sky event', () => {
    const run = {
      nights: [
        { litRooms: [406] }, { litRooms: [406] }, { litRooms: [406] }
      ],
      choices: [{ roomId: 406, choiceId: 'A' }],
      events: {}
    }
    expect(resolveEnding(run).endingId).not.toBe('ENDING_C_STARGAZER')
  })

  it('does not take the stargazer line if one night missed 406', () => {
    const run = {
      nights: [{ litRooms: [406] }, { litRooms: [304] }, { litRooms: [406] }],
      choices: [{ roomId: 406, choiceId: 'B' }],
      events: { cat: 2 }
    }
    expect(resolveEnding(run).endingId).not.toBe('ENDING_C_STARGAZER')
  })

  it('returns the harmony IF line on three resonances plus 205', () => {
    const run = {
      resonanceCount: 3,
      choices: [{ roomId: 205, choiceId: 'A' }],
      nights: [{ litRooms: [205] }, { litRooms: [205] }, { litRooms: [205] }]
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_D_HARMONY')
  })

  it('does not take the harmony line with only two resonances', () => {
    const run = {
      resonanceCount: 2,
      choices: [{ roomId: 205, choiceId: 'A' }],
      nights: [{ litRooms: [205] }, { litRooms: [205] }, { litRooms: [205] }]
    }
    expect(resolveEnding(run).endingId).not.toBe('ENDING_D_HARMONY')
  })

  it('returns the dawn master line on the full triple', () => {
    const run = {
      totalWarmth: 500,
      stampsEarned: 8,
      nights: [
        { litRooms: allRooms }, { litRooms: allRooms }, { litRooms: allRooms.slice(0, 5) }
      ]
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_E_DAWN')
    expect(resolveEnding(run).bondRoomId).toBe(102)
  })

  it('does not take the dawn line with only one full night', () => {
    const run = {
      totalWarmth: 600,
      stampsEarned: 9,
      nights: [{ litRooms: allRooms }, { litRooms: [304] }, { litRooms: [301] }]
    }
    expect(resolveEnding(run).endingId).not.toBe('ENDING_E_DAWN')
  })

  it('returns the warmth main line at 54 windows and four residents', () => {
    const run = {
      litTotal: 54,
      residentsAwoken: [102, 203, 205, 304],
      nights: [{ litRooms: [102, 203] }, { litRooms: [205] }, { litRooms: [304] }],
      choices: []
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_A_WARMTH')
  })

  it('returns the companion line on three choices and a quiet room', () => {
    const run = {
      litTotal: 20,
      residentsAwoken: [304],
      nights: [{ litRooms: [304] }, { litRooms: [101] }, { litRooms: [102] }],
      choices: [
        { roomId: 304, choiceId: 'A' },
        { roomId: 304, choiceId: 'B' },
        { roomId: 102, choiceId: 'A' }
      ]
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_B_COMPANION')
    expect(resolveEnding(run).bondRoomId).toBe(304)
  })

  it('falls back to the drift line for an empty run', () => {
    expect(resolveEnding({}).endingId).toBe('ENDING_F_DRIFT')
    expect(resolveEnding().endingId).toBe('ENDING_F_DRIFT')
  })

  it('returns a well-formed id for every shape of run', () => {
    for (let i = 0; i < 200; i++) {
      const run = {
        totalWarmth: i * 3,
        stampsEarned: i % 9,
        litTotal: i,
        resonanceCount: i % 5,
        residentsAwoken: [102, 203].slice(0, i % 3),
        nights: [{ litRooms: allRooms.slice(0, i % 25) }, { litRooms: [] }, { litRooms: [] }],
        choices: i % 2 ? [{ roomId: 406, choiceId: 'A' }] : []
      }
      expect(resolveEnding(run).endingId).toMatch(/^ENDING_[A-F]_/)
    }
  })

  it('walks the priority order from the most specific ending down', () => {
    const full = { litRooms: allRooms }
    // A run that satisfies C, D and E at once must resolve to C.
    const run = {
      totalWarmth: 999,
      stampsEarned: 9,
      litTotal: 72,
      resonanceCount: 9,
      residentsAwoken: [102, 203, 205, 301, 304, 406],
      nights: [full, full, { litRooms: [406] }],
      choices: [{ roomId: 406, choiceId: 'A' }, { roomId: 205, choiceId: 'A' }],
      events: { star: 3 }
    }
    expect(resolveEnding(run).endingId).toBe('ENDING_C_STARGAZER')
    // Drop the sky event: the harmony line now wins over the dawn line.
    expect(resolveEnding({ ...run, events: {} }).endingId).toBe('ENDING_D_HARMONY')
    // Drop the 205 branch: dawn wins.
    expect(resolveEnding({ ...run, events: {}, choices: [] }).endingId).toBe('ENDING_E_DAWN')
  })
})

describe('bumpBond', () => {
  it('rises by one and stops at three', () => {
    expect(bumpBond(0)).toBe(1)
    expect(bumpBond(2)).toBe(3)
    expect(bumpBond(3)).toBe(3)
  })
})

describe('room/index mapping', () => {
  it('maps index 0 to 101 and index 23 to 406', () => {
    expect(roomForIndex(0)).toBe(101)
    expect(roomForIndex(23)).toBe(406)
    expect(indexForRoom(102)).toBe(1)
    expect(indexForRoom(304)).toBe(15)
    expect(indexForRoom(999)).toBe(-1)
  })
})

describe('game constants', () => {
  it('runs three nights of 75 seconds with 24 windows', () => {
    expect(NIGHT_COUNT).toBe(3)
    expect(NIGHT_SECONDS).toBe(75)
    expect(WINDOW_COUNT).toBe(24)
  })

  it('guarantees 2-3 story beacons per night', () => {
    expect(STORY_SCHEDULE[0]).toHaveLength(2)
    expect(STORY_SCHEDULE[1]).toHaveLength(3)
    expect(STORY_SCHEDULE[2]).toHaveLength(3)
  })
})
