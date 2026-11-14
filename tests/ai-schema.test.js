import { describe, expect, it } from 'vitest'
import { normalizePayload } from '../shared/ai-schema.js'

const goodNight = (over = {}) => ({
  weather: 'clear',
  tempo: 'normal',
  palette: 'warm_blue',
  stories: [
    { text: '图书馆闭馆铃响了两遍', item: '闭馆铃', icon: '🔔' },
    { text: '三楼窗台的绿萝又冒新叶', item: '绿萝', icon: '🌿' }
  ],
  postcard: '今晚亮了十六扇窗，雨很小。',
  ...over
})

const payloadOf = (nights = [goodNight(), goodNight(), goodNight()]) => ({ nights })

describe('normalizePayload', () => {
  it('accepts a well-formed three-night payload', () => {
    const out = normalizePayload(payloadOf())
    expect(out).not.toBeNull()
    expect(out.nights).toHaveLength(3)
    expect(out.nights[0].night).toBe(1)
    expect(out.nights[2].night).toBe(3)
  })

  it('rejects a payload that is not exactly three nights', () => {
    expect(normalizePayload(payloadOf([goodNight(), goodNight()]))).toBeNull()
    expect(normalizePayload(payloadOf([goodNight(), goodNight(), goodNight(), goodNight()]))).toBeNull()
    expect(normalizePayload({ nights: [] })).toBeNull()
    expect(normalizePayload(null)).toBeNull()
    expect(normalizePayload({})).toBeNull()
  })

  it('rejects a night that is null', () => {
    expect(normalizePayload(payloadOf([goodNight(), null, goodNight()]))).toBeNull()
  })

  it('rejects the whole payload when it contains a banned word', () => {
    const out = normalizePayload(payloadOf([
      goodNight({ postcard: '今晚你应该早点休息。' }),
      goodNight(),
      goodNight()
    ]))
    expect(out).toBeNull()
  })

  it('rejects a postcard that is too short to be usable', () => {
    expect(normalizePayload(payloadOf([goodNight({ postcard: '太短' }), goodNight(), goodNight()]))).toBeNull()
  })

  it('always keeps at least two stories even when the model returns none', () => {
    const out = normalizePayload(payloadOf([goodNight({ stories: [] }), goodNight(), goodNight()]))
    expect(out).not.toBeNull()
    expect(out.nights[0].stories).toHaveLength(2)
    expect(out.nights[0].stories.every(s => s.text.length >= 6)).toBe(true)
  })

  it('drops stories that are shorter than six characters', () => {
    const out = normalizePayload(payloadOf([
      goodNight({ stories: [{ text: '短', item: 'x', icon: '✦' }] }),
      goodNight(),
      goodNight()
    ]))
    expect(out.nights[0].stories).toHaveLength(2)
    expect(out.nights[0].stories.every(s => s.text !== '短')).toBe(true)
  })

  it('caps the number of stories at three', () => {
    const many = [1, 2, 3, 4].map(i => ({ text: `第${i}条很长的校园小故事记录`, item: 'x', icon: '✦' }))
    const out = normalizePayload(payloadOf([goodNight({ stories: many }), goodNight(), goodNight()]))
    expect(out.nights[0].stories).toHaveLength(3)
  })

  it('truncates over-long story text and postcards', () => {
    const out = normalizePayload(payloadOf([
      goodNight({ postcard: '很长的明信片文案'.repeat(10) }),
      goodNight(),
      goodNight()
    ]))
    expect(out.nights[0].postcard.length).toBeLessThanOrEqual(40)
  })
})
