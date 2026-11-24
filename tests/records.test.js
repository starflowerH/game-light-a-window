import { describe, expect, it } from 'vitest'
import { fetchLeaderboardWithRank, loadRecords, mergeRun } from '../src/records.js'

const empty = () => ({ bestWarmth: 0, bestCombo: 0, plays: 0, totalWindows: 0, bestNight: 0, items: [], history: [] })

const run = (over = {}) => ({
  totalWarmth: 100,
  maxCombo: 12,
  litTotal: 20,
  bestNightWarmth: 60,
  items: ['绿萝', '闭馆铃'],
  nights: 3,
  ...over
})

describe('mergeRun', () => {
  it('counts a play', () => {
    expect(mergeRun(empty(), run()).plays).toBe(1)
    expect(mergeRun(mergeRun(empty(), run()), run()).plays).toBe(2)
  })

  it('keeps the best warmth and best combo rather than the latest', () => {
    let r = mergeRun(empty(), run({ totalWarmth: 100, maxCombo: 12 }))
    r = mergeRun(r, run({ totalWarmth: 40, maxCombo: 5 }))
    expect(r.bestWarmth).toBe(100)
    expect(r.bestCombo).toBe(12)
  })

  it('accumulates the total number of windows lit', () => {
    let r = mergeRun(empty(), run({ litTotal: 20 }))
    r = mergeRun(r, run({ litTotal: 5 }))
    expect(r.totalWindows).toBe(25)
  })

  it('remembers the best single night', () => {
    let r = mergeRun(empty(), run({ bestNightWarmth: 60 }))
    r = mergeRun(r, run({ bestNightWarmth: 20 }))
    expect(r.bestNight).toBe(60)
  })

  it('deduplicates collected items', () => {
    let r = mergeRun(empty(), run({ items: ['绿萝', '闭馆铃'] }))
    r = mergeRun(r, run({ items: ['闭馆铃', '汤勺'] }))
    expect(r.items).toEqual(['绿萝', '闭馆铃', '汤勺'])
    expect(new Set(r.items).size).toBe(r.items.length)
  })

  it('caps the item collection at 60 entries', () => {
    const many = Array.from({ length: 100 }, (_, i) => 'item' + i)
    const r = mergeRun(empty(), run({ items: many }))
    expect(r.items).toHaveLength(60)
  })

  it('caps the history at 20 runs, newest first', () => {
    let r = empty()
    for (let i = 0; i < 25; i++) r = mergeRun(r, run({ totalWarmth: i }))
    expect(r.history).toHaveLength(20)
    expect(r.history[0].warmth).toBe(24)
    expect(r.history[19].warmth).toBe(5)
  })

  it('records the run summary in the history entry', () => {
    const r = mergeRun(empty(), run())
    expect(r.history[0]).toMatchObject({ warmth: 100, combo: 12, lit: 20, nights: 3 })
    expect(typeof r.history[0].t).toBe('number')
  })

  it('does not mutate the records it was given', () => {
    const before = empty()
    mergeRun(before, run())
    expect(before.plays).toBe(0)
    expect(before.items).toEqual([])
  })
})

describe('loadRecords', () => {
  it('returns a usable empty record set when nothing is stored', () => {
    const r = loadRecords()
    expect(r).toBeTruthy()
    expect(typeof r.plays).toBe('number')
    expect(Array.isArray(r.items)).toBe(true)
    expect(Array.isArray(r.history)).toBe(true)
  })
})


// ---------------------------------------------------------------------------
// v3 · cloud passport fields
// ---------------------------------------------------------------------------

import { adoptCloudPlayer, saveRecords, loadNickname, saveNickname } from '../src/records.js'

describe('mergeRun v3 fields', () => {
  it('unions the unlocked endings and titles', () => {
    let r = mergeRun(empty(), run({ unlockedEndings: ['ENDING_A_WARMTH'], titles: ['温暖点灯人'] }))
    r = mergeRun(r, run({ unlockedEndings: ['ENDING_E_DAWN'], titles: ['破晓守夜人'] }))
    expect(r.unlockedEndings).toEqual(['ENDING_A_WARMTH', 'ENDING_E_DAWN'])
    expect(r.titles).toEqual(['夜巡新人', '温暖点灯人', '破晓守夜人'])
  })

  it('keeps the highest bond level per resident', () => {
    let r = mergeRun(empty(), run({ residentBonds: { 304: 1, 406: 2 } }))
    r = mergeRun(r, run({ residentBonds: { 304: 3 } }))
    expect(r.residentBonds['304']).toBe(3)
    expect(r.residentBonds['406']).toBe(2)
  })

  it('remembers the last ending', () => {
    const r = mergeRun(empty(), run({ endingId: 'ENDING_C_STARGAZER' }))
    expect(r.lastEnding).toBe('ENDING_C_STARGAZER')
  })

  it('starts a fresh record set with all v3 fields present', () => {
    const r = loadRecords()
    expect(r.unlockedEndings).toEqual([])
    expect(r.residentBonds).toEqual({})
    expect(Array.isArray(r.titles)).toBe(true)
    expect(r.titles.length).toBeGreaterThan(0)
  })
})

describe('adoptCloudPlayer', () => {
  const player = () => ({
    uid: 'u-1',
    passCode: '7F3A9C',
    nickname: '守夜人',
    plays: 4,
    bestWarmth: 480,
    bestCombo: 21,
    totalWindows: 130,
    unlockedEndings: ['ENDING_A_WARMTH', 'ENDING_B_COMPANION'],
    unlockedItems: ['黄铜钥匙'],
    residentBonds: { 304: 3 },
    titles: ['静夜倾听者']
  })

  it('takes the identity from the server', () => {
    const r = adoptCloudPlayer(empty(), player())
    expect(r.uid).toBe('u-1')
    expect(r.passCode).toBe('7F3A9C')
    expect(r.nickname).toBe('守夜人')
  })

  it('never lowers a local counter', () => {
    const local = { ...empty(), plays: 9, bestWarmth: 900, totalWindows: 400 }
    const r = adoptCloudPlayer(local, player())
    expect(r.plays).toBe(9)
    expect(r.bestWarmth).toBe(900)
    expect(r.totalWindows).toBe(400)
  })

  it('unions endings, items and bonds', () => {
    const local = { ...empty(), unlockedEndings: ['ENDING_F_DRIFT'], items: ['橘猫胡须'], residentBonds: { 406: 2 } }
    const r = adoptCloudPlayer(local, player())
    expect(r.unlockedEndings).toContain('ENDING_F_DRIFT')
    expect(r.unlockedEndings).toContain('ENDING_A_WARMTH')
    expect(r.items).toContain('橘猫胡须')
    expect(r.items).toContain('黄铜钥匙')
    expect(r.residentBonds['406']).toBe(2)
    expect(r.residentBonds['304']).toBe(3)
  })

  it('is a no-op for a missing profile', () => {
    const local = empty()
    expect(adoptCloudPlayer(local, null)).toBe(local)
  })
})

describe('nickname storage', () => {
  /** A tiny localStorage stand-in: the node test environment has none. */
  const installStorage = () => {
    const store = new Map()
    globalThis.localStorage = {
      get length() { return store.size },
      key: i => Array.from(store.keys())[i] ?? null,
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: k => { store.delete(k) },
      clear: () => store.clear()
    }
    return store
  }

  it('round-trips through localStorage when it exists', () => {
    installStorage()
    saveNickname('小禾')
    expect(loadNickname()).toBe('小禾')
    delete globalThis.localStorage
  })

  it('truncates to eight characters', () => {
    installStorage()
    saveNickname('一二三四五六七八九十')
    expect(loadNickname().length).toBeLessThanOrEqual(8)
    delete globalThis.localStorage
  })

  it('returns an empty string when storage is unavailable', () => {
    expect(loadNickname()).toBe('')
  })
})

describe('saveRecords', () => {
  it('accepts a record set without throwing in a headless environment', () => {
    expect(() => saveRecords(empty())).not.toThrow()
  })
})

describe('fetchLeaderboardWithRank', () => {
  it('returns offline: true safely when backend endpoint is unavailable', async () => {
    const prevFetch = globalThis.fetch
    globalThis.fetch = () => Promise.reject(new Error('network unavailable'))
    try {
      const res = await fetchLeaderboardWithRank({ mode: 'memory_sequence' })
      expect(res.offline).toBe(true)
      expect(res.items).toEqual([])
      expect(res.myRank).toBeNull()
    } finally {
      globalThis.fetch = prevFetch
    }
  })
})

