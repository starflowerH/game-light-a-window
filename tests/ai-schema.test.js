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


// ---------------------------------------------------------------------------
// v3 multi-agent payloads
// ---------------------------------------------------------------------------

import {
  normalizePlanPayload,
  normalizeEvolvePayload,
  normalizeEpiloguePayload,
  sanitizeWhisper,
  telemetryBucket,
  isEndingId
} from '../shared/ai-schema.js'
import { CORE_RESIDENT_ROOMS, ENDING_IDS, WINDOW_IDS } from '../shared/constants.js'

const samplePlan = () => /** @type {any} */ ({
  directorNote: '今夜从微雨开始，慢一点也没关系。',
  nights: [1, 2, 3].map(n => ({
    night: n,
    weather: 'light_rain',
    tempo: 'slow',
    palette: 'rainy_amber',
    commissions: [
      { id: 'lit_14', type: 'lit_count', target: 14, label: '点亮至少 14 扇窗' },
      { id: 'combo_6', type: 'max_combo', target: 6, label: '连成 6 次不断的光链' },
      { id: 'story_1', type: 'story_choice', target: 1, label: '回应一扇窗后的小事' }
    ],
    resonancePair: { rooms: [102, 304], line: '一楼保温桶的热气，顺着雨声飘到了三楼的书桌前。' },
    stories: [
      {
        roomId: 304,
        resident: '知夏 · 304室',
        text: '考研笔记翻到折角那页，窗外空调机上蹲着避雨的橘猫。',
        item: '橘猫胡须',
        icon: '🐈',
        choices: [
          { id: 'A', label: '推开半扇窗', outcome: '橘猫抖了抖毛跳进屋，趴在她的错题本边打呼噜。' },
          { id: 'B', label: '调暖台灯光', outcome: '暖黄的光晕漫过窗台，替猫咪烘干了淋湿的耳朵。' }
        ]
      }
    ],
    postcard: '雨丝很细，刚好盖过走廊尽头的脚步声。'
  }))
})

describe('normalizePlanPayload', () => {
  it('accepts the reference payload from the spec', () => {
    const out = normalizePlanPayload(samplePlan())
    expect(out).not.toBeNull()
    expect(out.directorNote).toContain('微雨')
    expect(out.nights).toHaveLength(3)
    expect(out.nights[0].commissions).toHaveLength(3)
    expect(out.nights[0].resonancePair.rooms).toEqual([102, 304])
    expect(out.nights[0].stories[0].roomId).toBe(304)
    expect(out.nights[0].stories[0].choices).toHaveLength(2)
  })

  it('rejects anything that is not exactly three nights', () => {
    expect(normalizePlanPayload(null)).toBeNull()
    expect(normalizePlanPayload({})).toBeNull()
    expect(normalizePlanPayload({ nights: [] })).toBeNull()
    const two = samplePlan(); two.nights.pop()
    expect(normalizePlanPayload(two)).toBeNull()
    const four = samplePlan(); four.nights.push(four.nights[0])
    expect(normalizePlanPayload(four)).toBeNull()
  })

  it('rejects a night that is null or not an object', () => {
    const bad = samplePlan(); bad.nights[1] = null
    expect(normalizePlanPayload(bad)).toBeNull()
    const bad2 = samplePlan(); bad2.nights[2] = 'nope'
    expect(normalizePlanPayload(bad2)).toBeNull()
  })

  it('rejects the whole payload on banned language', () => {
    const bad = samplePlan()
    bad.nights[1].postcard = '今晚你应该早点睡，想开点。'
    expect(normalizePlanPayload(bad)).toBeNull()
  })

  it('normalises near-miss enums', () => {
    const p = samplePlan()
    p.nights[0].weather = 'drizzle'
    p.nights[1].tempo = 'fast'
    p.nights[2].palette = 'warm orange'
    const out = normalizePlanPayload(p)
    expect(out.nights[0].weather).toBe('light_rain')
    expect(out.nights[1].tempo).toBe('brisk')
    expect(out.nights[2].palette).toBe('clear_peach')
  })

  it('repairs a missing commission list with the night defaults', () => {
    const p = samplePlan()
    delete p.nights[0].commissions
    const out = normalizePlanPayload(p)
    expect(out.nights[0].commissions).toHaveLength(3)
  })

  it('drops commissions with an unknown type or a too-short label', () => {
    const p = samplePlan()
    p.nights[0].commissions = [
      { id: 'x', type: 'become_rich', target: 3, label: '赚很多很多钱' },
      { id: 'y', type: 'lit_count', target: 5, label: '亮' }
    ]
    const out = normalizePlanPayload(p)
    expect(out.nights[0].commissions).toHaveLength(3)
    expect(out.nights[0].commissions.every(c => c.type !== 'become_rich')).toBe(true)
  })

  it('clamps commission targets into a sane range', () => {
    const p = samplePlan()
    p.nights[0].commissions = [
      { id: 'a', type: 'lit_count', target: 9999, label: '点亮很多窗户' },
      { id: 'b', type: 'max_combo', target: -3, label: '连成一条光链' }
    ]
    const out = normalizePlanPayload(p)
    expect(out.nights[0].commissions[0].target).toBe(24)
    expect(out.nights[0].commissions[1].target).toBe(1)
  })

  it('repairs an unusable resonance pair', () => {
    const p = samplePlan()
    p.nights[1].resonancePair = { rooms: [999, 999], line: 'x' }
    const out = normalizePlanPayload(p)
    expect(out.nights[1].resonancePair.rooms).toHaveLength(2)
    expect(out.nights[1].resonancePair.rooms[0]).not.toBe(out.nights[1].resonancePair.rooms[1])
    expect(out.nights[1].resonancePair.line.length).toBeGreaterThanOrEqual(8)
  })

  it('binds an unknown story room onto a core resident room', () => {
    const p = samplePlan()
    p.nights[0].stories[0].roomId = 12345
    const out = normalizePlanPayload(p)
    for (const s of out.nights[0].stories) {
      expect(CORE_RESIDENT_ROOMS).toContain(s.roomId)
    }
  })

  it('always yields exactly two choices per story', () => {
    const p = samplePlan()
    p.nights[0].stories[0].choices = []
    const out = normalizePlanPayload(p)
    for (const s of out.nights[0].stories) {
      expect(s.choices).toHaveLength(2)
      expect(s.choices.map(c => c.id)).toEqual(['A', 'B'])
    }
  })

  it('tops every night up to three stories', () => {
    const p = samplePlan()
    p.nights[0].stories = []
    p.nights[1].stories = []
    p.nights[2].stories = []
    const out = normalizePlanPayload(p)
    for (const n of out.nights) {
      expect(n.stories).toHaveLength(3)
      expect(new Set(n.stories.map(s => s.roomId)).size).toBe(3)
    }
  })

  it('never lets one night repeat a resident room', () => {
    const p = samplePlan()
    p.nights[0].stories = [304, 304, 304].map(roomId => ({
      roomId, text: '窗台上的一只猫看了你很久很久。', item: '猫', icon: '🐈'
    }))
    const out = normalizePlanPayload(p)
    const rooms = out.nights[0].stories.map(s => s.roomId)
    expect(new Set(rooms).size).toBe(rooms.length)
  })

  it('caps the story count at three', () => {
    const p = samplePlan()
    p.nights[0].stories = [1, 2, 3, 4, 5].map(() => ({
      roomId: 304, text: '窗台上的一只猫看了你很久很久。', item: '猫', icon: '🐈'
    }))
    expect(normalizePlanPayload(p).nights[0].stories).toHaveLength(3)
  })

  it('repairs a missing or too-short postcard', () => {
    const p = samplePlan()
    p.nights[2].postcard = '短'
    const out = normalizePlanPayload(p)
    expect(out.nights[2].postcard.length).toBeGreaterThanOrEqual(10)
  })

  it('repairs a missing director note', () => {
    const p = samplePlan()
    p.directorNote = ''
    expect(normalizePlanPayload(p).directorNote.length).toBeGreaterThan(4)
  })
})

describe('normalizeEvolvePayload', () => {
  it('accepts two rewritten nights and numbers them 2 and 3', () => {
    const out = normalizeEvolvePayload({ nights: [samplePlan().nights[0], samplePlan().nights[1]] })
    expect(out).not.toBeNull()
    expect(out.nights).toHaveLength(2)
    expect(out.nights.map(n => n.night)).toEqual([2, 3])
  })

  it('ignores the night numbers the model claims', () => {
    const a = samplePlan().nights[0]; a.night = 1
    const b = samplePlan().nights[0]; b.night = 1
    const out = normalizeEvolvePayload({ nights: [a, b] })
    expect(out.nights.map(n => n.night)).toEqual([2, 3])
  })

  it('accepts a single night', () => {
    const out = normalizeEvolvePayload({ nights: [samplePlan().nights[0]] })
    expect(out.nights).toHaveLength(1)
    expect(out.nights[0].night).toBe(2)
  })

  it('accepts the evolvedNights alias', () => {
    const out = normalizeEvolvePayload({ evolvedNights: [samplePlan().nights[0]] })
    expect(out.nights).toHaveLength(1)
  })

  it('returns null for an empty or malformed payload', () => {
    expect(normalizeEvolvePayload(null)).toBeNull()
    expect(normalizeEvolvePayload({})).toBeNull()
    expect(normalizeEvolvePayload({ nights: [] })).toBeNull()
  })

  it('rejects banned language', () => {
    const n = samplePlan().nights[0]
    n.postcard = '你应该早点休息，不要熬夜。'
    expect(normalizeEvolvePayload({ nights: [n] })).toBeNull()
  })

  it('honours a custom first night', () => {
    const out = normalizeEvolvePayload({ nights: [samplePlan().nights[0]] }, 3)
    expect(out.nights[0].night).toBe(3)
  })
})

describe('normalizeEpiloguePayload', () => {
  const good = () => ({
    archetype: '天台追星守夜人',
    letter: {
      fromRoom: '406室 · 星野',
      salutation: '致今晚帮我吹散云层的人：',
      body: '十一点四十二分，双子座的第一颗流星真的划过水塔顶上了。谢谢你把四楼的灯连成了一条银河。',
      sign: '406 窗边的望远镜'
    },
    whisperSuggestion: '今晚 406 的望远镜里，装下了整栋楼的星光。'
  })

  it('accepts a well-formed epilogue', () => {
    const out = normalizeEpiloguePayload(good())
    expect(out.archetype).toBe('天台追星守夜人')
    expect(out.letter.fromRoom).toContain('406')
    expect(out.letter.body.length).toBeGreaterThan(20)
  })

  it('repairs a missing body with a hand-written fallback', () => {
    const p = good(); p.letter.body = '太短'
    const out = normalizeEpiloguePayload(p)
    expect(out.letter.body.length).toBeGreaterThan(20)
  })

  it('repairs a missing letter object', () => {
    const out = normalizeEpiloguePayload({ archetype: '守夜人' })
    expect(out.letter.fromRoom.length).toBeGreaterThan(2)
    expect(out.letter.salutation.length).toBeGreaterThan(2)
    expect(out.letter.sign.length).toBeGreaterThan(2)
  })

  it('repairs a missing whisper suggestion', () => {
    const p = good(); p.whisperSuggestion = ''
    expect(normalizeEpiloguePayload(p).whisperSuggestion.length).toBeGreaterThan(6)
  })

  it('returns null for non-objects and banned language', () => {
    expect(normalizeEpiloguePayload(null)).toBeNull()
    expect(normalizeEpiloguePayload('hi')).toBeNull()
    const p = good(); p.letter.body = '这需要治疗，你应该想开点。'
    expect(normalizeEpiloguePayload(p)).toBeNull()
  })

  it('truncates an over-long letter body', () => {
    const p = good(); p.letter.body = '窗台上的月光'.repeat(60)
    expect(normalizeEpiloguePayload(p).letter.body.length).toBeLessThanOrEqual(140)
  })
})

describe('sanitizeWhisper', () => {
  it('keeps a short warm message', () => {
    expect(sanitizeWhisper('今晚的雨很轻，祝你也做个好梦。')).toBe('今晚的雨很轻，祝你也做个好梦。')
  })

  it('strips markup and urls', () => {
    expect(sanitizeWhisper('<b>今晚的雨很轻</b>，晚安。')).toBe('今晚的雨很轻，晚安。')
    expect(sanitizeWhisper('今晚的雨很轻 https://x.com 晚安')).not.toContain('http')
  })

  it('rejects messages that are too short', () => {
    expect(sanitizeWhisper('晚安')).toBe('')
    expect(sanitizeWhisper('')).toBe('')
    expect(sanitizeWhisper(null)).toBe('')
  })

  it('rejects clinical or preachy wording', () => {
    expect(sanitizeWhisper('你应该早点睡，别想太多。')).toBe('')
    expect(sanitizeWhisper('祝你早日治愈你自己的失眠')).toBe('')
  })

  it('caps the message at forty characters', () => {
    expect(sanitizeWhisper('窗'.repeat(120)).length).toBeLessThanOrEqual(40)
  })
})

describe('telemetryBucket', () => {
  it('is stable for equal telemetry', () => {
    const t = { maxCombo: 12, dragChains: 4, choicesMade: [{ roomId: 304 }, { roomId: 102 }] }
    expect(telemetryBucket(t)).toBe(telemetryBucket({ ...t }))
  })

  it('separates high and low combo runs', () => {
    expect(telemetryBucket({ maxCombo: 16 })).not.toBe(telemetryBucket({ maxCombo: 3 }))
  })

  it('ignores the order of the choices', () => {
    const a = telemetryBucket({ choicesMade: [{ roomId: 304 }, { roomId: 102 }] })
    const b = telemetryBucket({ choicesMade: [{ roomId: 102 }, { roomId: 304 }] })
    expect(a).toBe(b)
  })

  it('survives empty input', () => {
    expect(typeof telemetryBucket()).toBe('string')
    expect(telemetryBucket({}).length).toBeGreaterThan(2)
  })
})

describe('isEndingId', () => {
  it('accepts every real ending id', () => {
    for (const id of ENDING_IDS) expect(isEndingId(id)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isEndingId('ENDING_Z')).toBe(false)
    expect(isEndingId(null)).toBe(false)
    expect(isEndingId(3)).toBe(false)
  })
})

describe('shared constants', () => {
  it('maps 24 windows onto rooms 101..406', () => {
    expect(WINDOW_IDS).toHaveLength(24)
    expect(WINDOW_IDS[0].roomId).toBe(101)
    expect(WINDOW_IDS[5].roomId).toBe(106)
    expect(WINDOW_IDS[6].roomId).toBe(201)
    expect(WINDOW_IDS[23].roomId).toBe(406)
  })

  it('never repeats a room', () => {
    const rooms = WINDOW_IDS.map(w => w.roomId)
    expect(new Set(rooms).size).toBe(24)
  })
})

