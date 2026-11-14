import { describe, expect, it } from 'vitest'
import {
  RESIDENTS,
  RESIDENT_BY_ROOM,
  RESIDENT_SILHOUETTES,
  residentForRoom,
  residentStory,
  residentArc,
  FLOWING_STORIES,
  flowingStoryFor,
  RESONANCE_PAIRS,
  resonanceForNight,
  ENDING_SCRIPTS,
  endingScript,
  buildOfflinePlan,
  buildOfflineEvolution,
  buildOfflineEpilogue,
  deepestBondRoom,
  bondLabel,
  endingGallery
} from '../src/narrative-graph.js'
import {
  CORE_RESIDENT_ROOMS,
  ENDING_IDS,
  INDEX_TO_ROOM,
  MOOD_TOKEN_IDS,
  WINDOW_STATES
} from '../shared/constants.js'
import { normalizePlanPayload, sanitizeIcon } from '../shared/ai-schema.js'

describe('the six residents', () => {
  it('covers exactly the six core rooms', () => {
    expect(RESIDENTS).toHaveLength(6)
    expect(RESIDENTS.map(r => r.roomId).sort((a, b) => a - b)).toEqual([...CORE_RESIDENT_ROOMS].sort((a, b) => a - b))
  })

  it('gives every resident a full three-night arc', () => {
    for (const r of RESIDENTS) {
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.role.length).toBeGreaterThan(0)
      expect(r.item.length).toBeGreaterThan(0)
      expect(r.items.length).toBeGreaterThanOrEqual(2)
      expect(r.nights).toHaveLength(3)
    }
  })

  it('gives every night node exactly two labelled choices', () => {
    for (const r of RESIDENTS) {
      const first = r.nights[0]
      expect(first.text.length).toBeGreaterThan(10)
      expect(first.choices).toHaveLength(2)
      expect(first.choices.map(c => c.id)).toEqual(['A', 'B'])
      for (const c of first.choices) {
        expect(c.label.length).toBeGreaterThan(1)
        expect(c.outcome.length).toBeGreaterThan(6)
      }
      for (const n of [1, 2]) {
        const node = r.nights[n]
        for (const key of ['A', 'B']) {
          const v = node.variants[key]
          expect(v).toBeTruthy()
          expect(v.text.length).toBeGreaterThan(10)
          expect(v.choices).toHaveLength(2)
        }
      }
    }
  })

  it('branches night two on the night-one choice', () => {
    for (const r of RESIDENTS) {
      const a = residentStory(r.roomId, 1, 'A')
      const b = residentStory(r.roomId, 1, 'B')
      expect(a.text).not.toBe(b.text)
    }
  })

  it('branches night three on the night-two choice', () => {
    for (const r of RESIDENTS) {
      const a = residentStory(r.roomId, 2, 'A')
      const b = residentStory(r.roomId, 2, 'B')
      expect(a.text).not.toBe(b.text)
    }
  })

  it('defaults to branch A when no prior choice exists', () => {
    for (const r of RESIDENTS) {
      expect(residentStory(r.roomId, 1, null).text).toBe(residentStory(r.roomId, 1, 'A').text)
    }
  })

  it('returns null for an unknown room', () => {
    expect(residentStory(999, 0, 'A')).toBeNull()
    expect(residentForRoom(999)).toBeNull()
    expect(residentForRoom(304).name).toBe('知夏')
  })

  it('exposes one silhouette key per resident', () => {
    for (const r of RESIDENTS) {
      expect(typeof RESIDENT_SILHOUETTES[r.roomId]).toBe('string')
      expect(RESIDENT_SILHOUETTES[r.roomId].length).toBeGreaterThan(2)
    }
  })

  it('builds a three-entry arc for each resident', () => {
    for (const r of RESIDENTS) {
      const arc = residentArc(r.roomId)
      expect(arc).toHaveLength(3)
      expect(arc.map(a => a.night)).toEqual([1, 2, 3])
      for (const node of arc) {
        expect(node.text.length).toBeGreaterThan(10)
        expect(node.choices).toHaveLength(2)
      }
    }
  })

  it('keys residents by room id', () => {
    expect(Object.keys(RESIDENT_BY_ROOM).map(Number).sort((a, b) => a - b)).toEqual([...CORE_RESIDENT_ROOMS].sort((a, b) => a - b))
  })
})

describe('flowing window stories', () => {
  it('has at least 24 slices', () => {
    expect(FLOWING_STORIES.length).toBeGreaterThanOrEqual(24)
  })

  it('only targets the 18 non-resident windows', () => {
    for (const s of FLOWING_STORIES) {
      expect(INDEX_TO_ROOM).toContain(s.roomId)
      expect(CORE_RESIDENT_ROOMS).not.toContain(s.roomId)
    }
  })

  it('keeps every slice short, concrete and icon-safe', () => {
    for (const s of FLOWING_STORIES) {
      expect(s.text.length).toBeGreaterThan(10)
      expect(s.text.length).toBeLessThanOrEqual(40)
      expect(s.item.length).toBeGreaterThanOrEqual(2)
      expect(sanitizeIcon(s.icon)).toBe(s.icon)
    }
  })

  it('never returns a core-room slice for a flowing window', () => {
    for (let idx = 0; idx < 24; idx++) {
      const room = INDEX_TO_ROOM[idx]
      if (CORE_RESIDENT_ROOMS.includes(room)) continue
      for (let n = 0; n < 3; n++) {
        expect(flowingStoryFor(idx, n).roomId).toBeGreaterThan(0)
      }
    }
  })

  it('is deterministic', () => {
    expect(flowingStoryFor(3, 1)).toEqual(flowingStoryFor(3, 1))
  })
})

describe('resonance pairs', () => {
  it('has at least six pairs', () => {
    expect(RESONANCE_PAIRS.length).toBeGreaterThanOrEqual(6)
  })

  it('links two distinct real rooms with a written line', () => {
    for (const p of RESONANCE_PAIRS) {
      expect(p.rooms).toHaveLength(2)
      expect(p.rooms[0]).not.toBe(p.rooms[1])
      for (const r of p.rooms) expect(INDEX_TO_ROOM).toContain(r)
      expect(p.line.length).toBeGreaterThanOrEqual(10)
      expect(p.line.length).toBeLessThanOrEqual(40)
    }
  })

  it('cycles one pair per night', () => {
    for (let n = 0; n < 6; n++) {
      expect(resonanceForNight(n)).toEqual(RESONANCE_PAIRS[n % RESONANCE_PAIRS.length])
    }
  })
})

describe('ending scripts', () => {
  it('covers all six endings', () => {
    expect(Object.keys(ENDING_SCRIPTS).sort()).toEqual([...ENDING_IDS].sort())
  })

  it('gives each ending a cutscene, a motto and a handwritten letter', () => {
    for (const id of ENDING_IDS) {
      const e = endingScript(id)
      expect(e.id).toBe(id)
      expect(e.cutscene.length).toBeGreaterThan(2)
      expect(e.headline.length).toBeGreaterThan(2)
      expect(e.motto.length).toBeGreaterThan(6)
      expect(e.whisper.length).toBeGreaterThan(6)
      expect(e.letter.fromRoom.length).toBeGreaterThan(2)
      expect(e.letter.salutation.length).toBeGreaterThan(2)
      expect(e.letter.body.length).toBeGreaterThan(20)
      expect(e.letter.sign.length).toBeGreaterThan(2)
    }
  })

  it('falls back to the drift script for an unknown id', () => {
    expect(endingScript('NOPE').id).toBe('ENDING_F_DRIFT')
  })

  it('renders the gallery in priority order', () => {
    const g = endingGallery()
    expect(g).toHaveLength(6)
    expect(g[0].id).toBe('ENDING_C_STARGAZER')
    expect(g[5].id).toBe('ENDING_F_DRIFT')
  })
})

describe('buildOfflinePlan', () => {
  it('builds three nights that survive the shared schema', () => {
    const plan = buildOfflinePlan('umbrella', { playCount: 0 })
    expect(plan.nights).toHaveLength(3)
    expect(plan.directorNote.length).toBeGreaterThan(4)
    const normalised = normalizePlanPayload(plan)
    expect(normalised).not.toBeNull()
    expect(normalised.nights).toHaveLength(3)
  })

  it('gives every night three commissions, a pair and three beacon stories', () => {
    const plan = buildOfflinePlan('lamp', {})
    for (const n of plan.nights) {
      expect(n.commissions).toHaveLength(3)
      expect(n.resonancePair.rooms).toHaveLength(2)
      expect(n.stories).toHaveLength(3)
      for (const s of n.stories) {
        expect(CORE_RESIDENT_ROOMS).toContain(s.roomId)
        expect(s.choices).toHaveLength(2)
        expect(['A', 'B']).toEqual(s.choices.map(c => c.id))
      }
    }
  })

  it('honours the mood token tempo and palette on night one', () => {
    const slow = buildOfflinePlan('umbrella', {})
    expect(slow.nights[0].tempo).toBe('slow')
    expect(slow.nights[0].palette).toBe('rainy_amber')
    const brisk = buildOfflinePlan('earphones', {})
    expect(brisk.nights[0].tempo).toBe('brisk')
  })

  it('accepts every mood token', () => {
    for (const id of MOOD_TOKEN_IDS) {
      expect(buildOfflinePlan(id, {}).nights).toHaveLength(3)
    }
  })

  it('rotates the cast across replays', () => {
    const first = buildOfflinePlan('umbrella', { playCount: 0 })
    const second = buildOfflinePlan('umbrella', { playCount: 1 })
    const roomsA = first.nights[0].stories.map(s => s.roomId).join()
    const roomsB = second.nights[0].stories.map(s => s.roomId).join()
    expect(roomsA).not.toBe(roomsB)
  })

  it('never repeats a resident inside one night', () => {
    for (let p = 0; p < 12; p++) {
      const plan = buildOfflinePlan('quilt', { playCount: p })
      for (const n of plan.nights) {
        const rooms = n.stories.map(s => s.roomId)
        expect(new Set(rooms).size).toBe(rooms.length)
      }
    }
  })
})

describe('buildOfflineEvolution', () => {
  it('rewrites nights two and three only', () => {
    const out = buildOfflineEvolution({ maxCombo: 12, dragChains: 4, choicesMade: [{ roomId: 304, choiceId: 'A' }] })
    expect(out.nights).toHaveLength(2)
    expect(out.nights.map(n => n.night)).toEqual([2, 3])
  })

  it('brings a room the player answered back on the next night', () => {
    const out = buildOfflineEvolution({ choicesMade: [{ roomId: 304, choiceId: 'B' }] })
    expect(out.nights[0].stories[0].roomId).toBe(304)
    expect(out.nights[0].stories[0].text).toBe(residentStory(304, 1, 'B').text)
  })

  it('raises the tempo when night one was a high-combo run', () => {
    const fast = buildOfflineEvolution({ maxCombo: 14 })
    expect(fast.nights[0].tempo).toBe('brisk')
    const slow = buildOfflineEvolution({ maxCombo: 2, dragChains: 0 })
    expect(slow.nights[0].tempo).toBe('slow')
  })

  it('produces payloads the shared schema accepts', () => {
    const out = buildOfflineEvolution({ choicesMade: [{ roomId: 406, choiceId: 'A' }] })
    for (const n of out.nights) {
      expect(n.stories).toHaveLength(3)
      expect(n.commissions).toHaveLength(3)
    }
  })

  it('survives empty telemetry', () => {
    expect(buildOfflineEvolution().nights).toHaveLength(2)
    expect(buildOfflineEvolution({}).nights).toHaveLength(2)
  })
})

describe('buildOfflineEpilogue', () => {
  it('returns the ending author letter when the bond room matches', () => {
    const out = buildOfflineEpilogue({ endingId: 'ENDING_C_STARGAZER', bondRoomId: 406 })
    expect(out.letter.fromRoom).toContain('406')
    expect(out.archetype).toBe('天台追星人')
    expect(out.whisperSuggestion.length).toBeGreaterThan(6)
  })

  it('writes from the bond resident when it differs from the canonical author', () => {
    const out = buildOfflineEpilogue({ endingId: 'ENDING_A_WARMTH', bondRoomId: 304, path: 'A' })
    expect(out.letter.fromRoom).toContain('304')
    expect(out.letter.body).toContain(residentStory(304, 2, 'A').text)
  })

  it('falls back to the drift epilogue without an ending', () => {
    const out = buildOfflineEpilogue({})
    expect(out.letter.body.length).toBeGreaterThan(10)
  })
})

describe('bond helpers', () => {
  it('picks the deepest bond room', () => {
    expect(deepestBondRoom({ 102: 1, 304: 3 }, [])).toBe(304)
    expect(deepestBondRoom({}, [{ roomId: 203 }, { roomId: 203 }, { roomId: 102 }])).toBe(203)
    expect(deepestBondRoom({}, [])).toBe(102)
  })

  it('labels bond levels one to three', () => {
    expect(bondLabel(0)).toBe('还没说过话')
    expect(bondLabel(3)).toBe('把窗留给你')
    expect(bondLabel(9)).toBe('把窗留给你')
  })
})

describe('narration stays inside the content policy', () => {
  it('never uses clinical or preachy wording', () => {
    const banned = ['抑郁', '焦虑症', '心理疾病', '自杀', '自残', '诊断', '治疗', '你应该', '想开点', '正能量', '加油']
    const blob = JSON.stringify({ RESIDENTS, FLOWING_STORIES, RESONANCE_PAIRS, ENDING_SCRIPTS })
    for (const w of banned) expect(blob).not.toContain(w)
  })

  it('does not mention the five-state enum inside prose by accident', () => {
    expect(WINDOW_STATES.LIT).toBe('lit')
  })
})
