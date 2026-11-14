import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../server/index.js'
import { buildOfflinePlan } from '../src/narrative-graph.js'
import { INDEX_TO_ROOM } from '../shared/constants.js'

/** @type {string[]} */
const dirs = []
/** @type {any[]} */
const apps = []

function makeApp(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'law-v3-'))
  dirs.push(dir)
  const app = buildApp({ dataDir: dir, aiKey: '', logger: false, ...opts })
  apps.push(app)
  return { app, dir }
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    try { await app.close() } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
  }
})

describe('health', () => {
  it('reports the service, db and ai status', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.service).toBe('light-a-window')
    expect(body.version).toBe('3.0.0')
    expect(body.dbOk).toBe(true)
    expect(body.aiConfigured).toBe(false)
    expect(typeof body.globalLitWindows).toBe('number')
  })

  it('serves the bare /health path the nginx health check uses', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('reports the ai upstream configuration without leaking the key', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/ai-health' })
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body).not.toHaveProperty('key')
    expect(body.model).toBeTruthy()
  })
})

describe('bootstrap', () => {
  it('mints a passport on the first request', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/bootstrap' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.player.uid).toBeTruthy()
    expect(body.player.passCode).toMatch(/^[0-9A-Z]{6}$/)
    expect(body.player.plays).toBe(0)
    expect(Array.isArray(body.player.unlockedEndings)).toBe(true)
    expect(body.player.titles.length).toBeGreaterThan(0)
  })

  it('seeds the heatmap with all 24 rooms', async () => {
    const { app } = makeApp()
    const body = (await app.inject({ method: 'GET', url: '/api/bootstrap' })).json()
    expect(body.windowHeat).toHaveLength(24)
    expect(body.windowHeat.map(w => w.roomId).sort((a, b) => a - b)).toEqual([...INDEX_TO_ROOM].sort((a, b) => a - b))
    expect(body.windowHeat.every(w => w.litTotal >= 0)).toBe(true)
  })

  it('seeds six opening whispers so the first player sees the wall', async () => {
    const { app } = makeApp()
    const body = (await app.inject({ method: 'GET', url: '/api/bootstrap' })).json()
    expect(body.whispers.length).toBeGreaterThanOrEqual(6)
    expect(body.whispers[0].content.length).toBeGreaterThan(4)
  })

  it('returns the same profile for the same uid', async () => {
    const { app } = makeApp()
    const first = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=abc-123' })).json()
    const second = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=abc-123' })).json()
    expect(second.player.uid).toBe('abc-123')
    expect(second.player.passCode).toBe(first.player.passCode)
  })

  it('restores a profile from the six-character recovery code', async () => {
    const { app } = makeApp()
    const first = (await app.inject({ method: 'GET', url: '/api/bootstrap' })).json()
    const restored = (await app.inject({ method: 'GET', url: `/api/bootstrap?passCode=${first.player.passCode}` })).json()
    expect(restored.player.uid).toBe(first.player.uid)
  })

  it('rejects a recovery code that matches nothing', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/bootstrap?passCode=ZZZZZZ' })
    expect(res.statusCode).toBe(404)
    expect(res.json().ok).toBe(false)
  })
})

describe('agent routes without an upstream key', () => {
  it('still returns a complete three-night plan from the offline graph', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/agent/plan',
      payload: { moodToken: 'umbrella', unlockedEndings: ['ENDING_A_WARMTH'], playCount: 2 }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.source).toBe('offline')
    expect(body.payload.nights).toHaveLength(3)
    expect(body.payload.nights[0].stories).toHaveLength(3)
    expect(body.payload.nights[0].stories[0].choices).toHaveLength(2)
  })

  it('accepts every mood token', async () => {
    const { app } = makeApp()
    for (const moodToken of ['umbrella', 'earphones', 'quilt', 'lamp']) {
      const res = await app.inject({ method: 'POST', url: '/api/agent/plan', payload: { moodToken } })
      expect(res.statusCode).toBe(200)
      expect(res.json().payload.nights).toHaveLength(3)
    }
  })

  it('returns two evolved nights', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/agent/evolve',
      payload: {
        moodToken: 'lamp',
        night1Telemetry: { litCount: 18, maxCombo: 11, dragChains: 4, choicesMade: [{ roomId: 304, choiceId: 'A' }] }
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.payload.nights.map(n => n.night)).toEqual([2, 3])
    expect(body.payload.nights[0].stories[0].roomId).toBe(304)
  })

  it('returns a handwritten epilogue', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/agent/epilogue',
      payload: { endingId: 'ENDING_C_STARGAZER', bondRoomId: 406, totalWarmth: 500 }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.payload.letter.fromRoom).toContain('406')
    expect(body.payload.whisperSuggestion.length).toBeGreaterThan(6)
  })

  it('keeps the v2 /api/generate contract alive', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/generate', payload: { seed: 'x' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().payload.nights).toHaveLength(3)
  })
})

describe('agent routes with a fake upstream', () => {
  const fakeFetch = (content) => async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] })
  })

  it('accepts a model reply wrapped in markdown fences', async () => {
    const plan = buildOfflinePlan('quilt', {})
    const { app } = makeApp({
      aiKey: 'sk-test',
      fetchImpl: fakeFetch('\u0060\u0060\u0060json\n' + JSON.stringify(plan) + '\n\u0060\u0060\u0060')
    })
    const res = await app.inject({ method: 'POST', url: '/api/agent/plan', payload: { moodToken: 'quilt' } })
    const body = res.json()
    expect(body.source).toBe('ai')
    expect(body.payload.nights).toHaveLength(3)
  })

  it('serves the cached plan on a second identical request', async () => {
    const plan = buildOfflinePlan('quilt', {})
    const { app } = makeApp({ aiKey: 'sk-test', fetchImpl: fakeFetch(JSON.stringify(plan)) })
    const first = (await app.inject({ method: 'POST', url: '/api/agent/plan', payload: { moodToken: 'quilt', playCount: 0 } })).json()
    const second = (await app.inject({ method: 'POST', url: '/api/agent/plan', payload: { moodToken: 'quilt', playCount: 0 } })).json()
    expect(first.source).toBe('ai')
    expect(second.source).toBe('cache')
  })

  it('falls back to the offline graph when the upstream explodes', async () => {
    const { app } = makeApp({ aiKey: 'sk-test', fetchImpl: async () => { throw new Error('boom') } })
    const res = await app.inject({ method: 'POST', url: '/api/agent/plan', payload: { moodToken: 'lamp' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().source).toBe('offline')
  })

  it('rejects a model reply that fails the shared schema', async () => {
    const { app } = makeApp({ aiKey: 'sk-test', fetchImpl: fakeFetch(JSON.stringify({ nights: [] })) })
    const res = await app.inject({ method: 'POST', url: '/api/agent/plan', payload: {} })
    expect(res.statusCode).toBe(200)
    expect(res.json().source).toBe('offline')
  })
})

describe('score and leaderboard', () => {
  it('records a run, ranks it and syncs the profile', async () => {
    const { app } = makeApp()
    const boot = (await app.inject({ method: 'GET', url: '/api/bootstrap' })).json()
    const res = await app.inject({
      method: 'POST', url: '/api/score',
      payload: {
        uid: boot.player.uid,
        nickname: '守夜人',
        endingId: 'ENDING_E_DAWN',
        archetype: '破晓守夜人',
        litWindows: 68,
        maxCombo: 21,
        totalWarmth: 512,
        resonances: 4,
        stamps: 8,
        items: ['黄铜钥匙', '橘猫胡须'],
        unlockedEndings: ['ENDING_E_DAWN'],
        residentBonds: { 304: 3, 406: 2 },
        litRoomIds: [101, 304, 406]
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.rank).toBe(1)
    expect(body.player.plays).toBe(1)
    expect(body.player.bestWarmth).toBe(512)
    expect(body.player.unlockedEndings).toContain('ENDING_E_DAWN')
    expect(body.player.residentBonds['304']).toBe(3)
  })

  it('ranks a weaker run below a stronger one', async () => {
    const { app } = makeApp()
    const a = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=a' })).json()
    const b = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=b' })).json()
    await app.inject({ method: 'POST', url: '/api/score', payload: { uid: a.player.uid, totalWarmth: 500, litWindows: 60, maxCombo: 10 } })
    const second = (await app.inject({ method: 'POST', url: '/api/score', payload: { uid: b.player.uid, totalWarmth: 120, litWindows: 20, maxCombo: 4 } })).json()
    expect(second.rank).toBe(2)
  })

  it('lists the leaderboard and counts players', async () => {
    const { app } = makeApp()
    const a = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=a' })).json()
    await app.inject({ method: 'POST', url: '/api/score', payload: { uid: a.player.uid, nickname: '甲', totalWarmth: 300 } })
    const res = await app.inject({ method: 'GET', url: '/api/leaderboard?limit=10' })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].nickname).toBe('甲')
    expect(body.totalPlayers).toBe(1)
  })

  it('supports the tonight scope', async () => {
    const { app } = makeApp()
    const a = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=a' })).json()
    await app.inject({ method: 'POST', url: '/api/score', payload: { uid: a.player.uid, totalWarmth: 300 } })
    const res = await app.inject({ method: 'GET', url: '/api/leaderboard?scope=tonight' })
    expect(res.json().items).toHaveLength(1)
  })

  it('clamps absurd numbers instead of storing them', async () => {
    const { app } = makeApp()
    const a = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=a' })).json()
    const body = (await app.inject({
      method: 'POST', url: '/api/score',
      payload: { uid: a.player.uid, litWindows: 99999, maxCombo: -5, totalWarmth: 10 ** 12 }
    })).json()
    expect(body.player.bestCombo).toBe(0)
    expect(body.player.bestWarmth).toBeLessThanOrEqual(99999)
  })
})

describe('window whispers', () => {
  it('seals a message into a window', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/whispers',
      payload: { roomId: 304, content: '今晚的雨很轻，祝你也做个好梦。', nickname: '守夜人' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.whisper.roomId).toBe(304)
    expect(body.whisper.resonances).toBe(1)
  })

  it('rejects a message that is too short or clinically worded', async () => {
    const { app } = makeApp()
    const short = await app.inject({ method: 'POST', url: '/api/whispers', payload: { roomId: 304, content: '晚安' } })
    expect(short.statusCode).toBe(400)
    const preachy = await app.inject({ method: 'POST', url: '/api/whispers', payload: { roomId: 304, content: '你应该早点睡，想开点。' } })
    expect(preachy.statusCode).toBe(400)
  })

  it('rejects a room that does not exist', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/whispers', payload: { roomId: 999, content: '今晚的雨很轻，祝你也做个好梦。' } })
    expect(res.statusCode).toBe(400)
  })

  it('adds a resonance star to an existing whisper', async () => {
    const { app } = makeApp()
    const created = (await app.inject({
      method: 'POST', url: '/api/whispers',
      payload: { roomId: 102, content: '保温桶里的红枣茶一直温着。' }
    })).json()
    const res = await app.inject({ method: 'POST', url: `/api/whispers/${created.whisper.id}/like`, payload: {} })
    expect(res.statusCode).toBe(200)
    expect(res.json().resonances).toBe(2)
  })

  it('404s a like for a whisper that is gone', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/whispers/99999/like', payload: {} })
    expect(res.statusCode).toBe(404)
  })

  it('lists whispers for one room', async () => {
    const { app } = makeApp()
    await app.inject({ method: 'POST', url: '/api/whispers', payload: { roomId: 406, content: '十一点半云会散，信我一次。' } })
    const res = await app.inject({ method: 'GET', url: '/api/whispers?roomId=406' })
    const body = res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(body.items.every(w => w.roomId === 406)).toBe(true)
  })
})

describe('telemetry', () => {
  it('accepts a client error report', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/telemetry',
      payload: { eventType: 'client_error', payload: { message: 'boom', where: 'scene.js' } }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })
})

describe('rate limiting', () => {
  it('separates the ai and data buckets', async () => {
    const { app } = makeApp({ rateLimits: { ai: 2, api: 10 } })
    const ip = { 'x-forwarded-for': '203.0.113.9' }
    const plan = () => app.inject({ method: 'POST', url: '/api/agent/plan', payload: {}, headers: ip })
    expect((await plan()).statusCode).toBe(200)
    expect((await plan()).statusCode).toBe(200)
    expect((await plan()).statusCode).toBe(429)
    // The data bucket is untouched by the ai bucket.
    const health = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: ip })
    expect(health.statusCode).toBe(200)
  })

  it('treats different forwarded IPs as different clients', async () => {
    const { app } = makeApp({ rateLimits: { ai: 1, api: 50 } })
    const one = () => app.inject({ method: 'POST', url: '/api/agent/plan', payload: {}, headers: { 'x-forwarded-for': '198.51.100.1' } })
    const two = () => app.inject({ method: 'POST', url: '/api/agent/plan', payload: {}, headers: { 'x-forwarded-for': '198.51.100.2' } })
    expect((await one()).statusCode).toBe(200)
    expect((await one()).statusCode).toBe(429)
    expect((await two()).statusCode).toBe(200)
  })

  it('limits the data bucket independently', async () => {
    const { app } = makeApp({ rateLimits: { ai: 50, api: 2 } })
    const headers = { 'x-forwarded-for': '192.0.2.7' }
    expect((await app.inject({ method: 'GET', url: '/api/leaderboard', headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/leaderboard', headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/leaderboard', headers })).statusCode).toBe(429)
  })
})

describe('persistence across restarts', () => {
  it('keeps the player, the run and the whisper in the sqlite file', async () => {
    const { app, dir } = makeApp()
    const boot = (await app.inject({ method: 'GET', url: '/api/bootstrap?uid=persist-me' })).json()
    await app.inject({ method: 'POST', url: '/api/score', payload: { uid: 'persist-me', totalWarmth: 222, litWindows: 30 } })
    await app.inject({ method: 'POST', url: '/api/whispers', payload: { roomId: 205, content: '这期节目没有听众，就当说给这栋楼听。' } })
    await app.close()

    const again = buildApp({ dataDir: dir, aiKey: '', logger: false })
    apps.push(again)
    const restored = (await again.inject({ method: 'GET', url: `/api/bootstrap?passCode=${boot.player.passCode}` })).json()
    expect(restored.player.uid).toBe('persist-me')
    expect(restored.player.plays).toBe(1)
    expect(restored.player.bestWarmth).toBe(222)
    const whispers = (await again.inject({ method: 'GET', url: '/api/whispers?roomId=205' })).json()
    expect(whispers.items.some(w => w.content.includes('这期节目'))).toBe(true)
  })
})
