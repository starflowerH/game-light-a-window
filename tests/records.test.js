import { describe, expect, it } from 'vitest'
import { loadRecords, mergeRun } from '../src/records.js'

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
