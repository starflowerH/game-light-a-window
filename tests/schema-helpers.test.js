import { describe, expect, it } from 'vitest'
import {
  normalizeKey,
  sanitizeText,
  sanitizeIcon,
  containsBannedWord,
  WEATHER_MAP,
  TEMPO_MAP,
  PALETTE_MAP
} from '../shared/ai-schema.js'

describe('normalizeKey', () => {
  it('passes through values that are already canonical', () => {
    expect(normalizeKey('clear', WEATHER_MAP, 'clear')).toBe('clear')
    expect(normalizeKey('slow', TEMPO_MAP, 'normal')).toBe('slow')
    expect(normalizeKey('warm_blue', PALETTE_MAP, 'warm_blue')).toBe('warm_blue')
  })

  it('maps the near-miss values the model actually returns', () => {
    expect(normalizeKey('cloudy', WEATHER_MAP, 'clear')).toBe('fog')
    expect(normalizeKey('breezy', WEATHER_MAP, 'clear')).toBe('wind')
    expect(normalizeKey('moonlit_blue', WEATHER_MAP, 'clear')).toBe('clear')
    expect(normalizeKey('fast', TEMPO_MAP, 'normal')).toBe('brisk')
    expect(normalizeKey('warm', TEMPO_MAP, 'normal')).toBe('brisk')
    expect(normalizeKey('warm_orange', PALETTE_MAP, 'warm_blue')).toBe('clear_peach')
    expect(normalizeKey('gray_blue', PALETTE_MAP, 'warm_blue')).toBe('warm_blue')
  })

  it('normalises spacing and dashes before matching', () => {
    expect(normalizeKey('Light Rain', WEATHER_MAP, 'clear')).toBe('light_rain')
    expect(normalizeKey('light-rain', WEATHER_MAP, 'clear')).toBe('light_rain')
  })

  it('falls back for unknown values instead of failing', () => {
    expect(normalizeKey('apocalyptic', WEATHER_MAP, 'clear')).toBe('clear')
    expect(normalizeKey('', TEMPO_MAP, 'normal')).toBe('normal')
    expect(normalizeKey(undefined, PALETTE_MAP, 'warm_blue')).toBe('warm_blue')
    expect(normalizeKey(null, PALETTE_MAP, 'warm_blue')).toBe('warm_blue')
  })
})

describe('sanitizeText', () => {
  it('strips html tags', () => {
    expect(sanitizeText('<script>alert(1)</script>hello', 50)).not.toContain('<')
    expect(sanitizeText('<b>bold</b>', 50)).toBe('bold')
  })

  it('strips urls', () => {
    expect(sanitizeText('see https://example.com now', 50)).not.toContain('http')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeText('  a   b  ', 50)).toBe('a b')
  })

  it('truncates to the given maximum length', () => {
    expect(sanitizeText('abcdefghij', 4)).toHaveLength(4)
  })

  it('handles empty and nullish input', () => {
    expect(sanitizeText(undefined, 10)).toBe('')
    expect(sanitizeText(null, 10)).toBe('')
    expect(sanitizeText(0, 10)).toBe('0')
  })
})

describe('sanitizeIcon', () => {
  it('keeps icons on the allow-list', () => {
    expect(sanitizeIcon('🌿')).toBe('🌿')
    expect(sanitizeIcon('🔔')).toBe('🔔')
  })

  it('falls back to a neutral mark for unknown or missing icons', () => {
    expect(sanitizeIcon('')).toBe('✦')
    expect(sanitizeIcon(undefined)).toBe('✦')
    expect(sanitizeIcon('🦄')).toBe('✦')
  })

  it('keeps only the first character when given a multi-character string', () => {
    expect(sanitizeIcon('🌿🌿')).toBe('🌿')
  })
})

describe('containsBannedWord', () => {
  it('detects clinical language', () => {
    expect(containsBannedWord('你有点抑郁')).toBe(true)
    expect(containsBannedWord('这是焦虑症的表现')).toBe(true)
  })

  it('detects preachy language', () => {
    expect(containsBannedWord('你应该早点睡')).toBe(true)
    expect(containsBannedWord('想开点，一切都会好')).toBe(true)
    expect(containsBannedWord('加油')).toBe(true)
  })

  it('allows ordinary campus-life text', () => {
    expect(containsBannedWord('三楼窗台的绿萝又冒新叶')).toBe(false)
    expect(containsBannedWord('图书馆闭馆铃响了两遍')).toBe(false)
    expect(containsBannedWord('今晚亮了十六扇窗')).toBe(false)
  })
})
