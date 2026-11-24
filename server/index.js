// Fastify 5 application for《今晚，亮一盏灯》v3.0.
//
// buildApp() is a factory so the integration tests can drive the whole API
// through app.inject() without binding a port.

import Fastify from 'fastify'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './db.js'
import { createAgentHub } from './agents.js'
import { sanitizeWhisper, sanitizeText } from '../shared/ai-schema.js'
import {
  DORM_IDS,
  ENDING_IDS,
  GAME_MODE_IDS,
  INDEX_TO_ROOM,
  MOOD_TOKEN_IDS,
  SEASON_IDS,
  WEATHERS
} from '../shared/constants.js'

const VERSION = '5.1.0'

/**
 * Sliding-window limiter with a sweeper so the map cannot grow without bound.
 *
 * @param {number} max requests allowed per window
 * @param {number} windowMs
 */
function createLimiter(max, windowMs) {
  /** @type {Map<string, number[]>} */
  const hits = new Map()
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [ip, arr] of hits) {
      const alive = arr.filter(t => now - t < windowMs)
      if (!alive.length) hits.delete(ip)
      else hits.set(ip, alive)
    }
  }, windowMs)
  if (typeof sweeper.unref === 'function') sweeper.unref()

  return {
    /**
     * @param {string} ip
     * @returns {boolean}
     */
    allow(ip) {
      const now = Date.now()
      const key = String(ip || 'unknown')
      const arr = (hits.get(key) || []).filter(t => now - t < windowMs)
      if (arr.length >= max) {
        hits.set(key, arr)
        return false
      }
      arr.push(now)
      hits.set(key, arr)
      return true
    },
    stop() {
      clearInterval(sweeper)
    }
  }
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function cleanNickname(value, max = 8) {
  const s = sanitizeText(value, max).replace(/[<>"'&]/g, '')
  return s || '今晚的某某'
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {number}
 */
function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Build the Fastify app.
 *
 * @param {{
 *   dataDir?: string,
 *   aiKey?: string,
 *   aiBase?: string,
 *   aiModel?: string,
 *   logger?: boolean,
 *   fetchImpl?: typeof fetch,
 *   aiTimeoutMs?: number,
 *   rateLimits?: { ai?: number, api?: number }
 * }} [opts]
 */
export function buildApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || join(process.cwd(), 'data')
  const aiKey = opts.aiKey ?? process.env.AI_KEY ?? ''
  const aiBase = opts.aiBase || process.env.AI_BASE || 'https://t.xiaoxin.email/v1'
  const aiModel = opts.aiModel || process.env.AI_MODEL || 'deepseek-v4.1-flash'

  const app = Fastify({
    logger: opts.logger === undefined ? process.env.NODE_ENV !== 'test' : opts.logger,
    trustProxy: true,
    bodyLimit: 65536
  })

  const db = openDatabase(dataDir)
  const hub = createAgentHub({
    db,
    aiKey,
    aiBase,
    aiModel,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.aiTimeoutMs || Number(process.env.AI_TIMEOUT_MS) || 26000
  })

  const aiLimiter = createLimiter(opts.rateLimits?.ai ?? 12, 60_000)
  const apiLimiter = createLimiter(opts.rateLimits?.api ?? 60, 60_000)

  app.addHook('onClose', async () => {
    aiLimiter.stop()
    apiLimiter.stop()
    db.close()
  })

  /** @param {any} req */
  const ipOf = req => String((req && req.ip) || 'unknown')

  /**
   * @param {any} req
   * @param {any} reply
   * @param {ReturnType<typeof createLimiter>} limiter
   * @returns {boolean} true when the request may proceed
   */
  function guard(req, reply, limiter) {
    if (limiter.allow(ipOf(req))) return true
    reply.code(429).send({ ok: false, msg: '请求太频繁，稍等一下' })
    return false
  }

  // ------------------------------------------------------------------ health
  const healthBody = () => {
    const stats = db.getGlobalStats()
    return {
      ok: true,
      service: 'light-a-window',
      version: VERSION,
      dbOk: db.ping(),
      aiConfigured: hub.configured,
      globalLitWindows: stats.totalLit,
      time: new Date().toISOString()
    }
  }

  app.get('/api/health', async () => healthBody())
  app.get('/health', async () => healthBody())

  app.get('/api/ai-health', async () => ({
    ok: hub.configured,
    model: aiModel,
    base: aiBase,
    cachedPlans: db.countCached('plan')
  }))

  // --------------------------------------------------------------- bootstrap
  app.get('/api/bootstrap', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const query = /** @type {any} */ (req.query || {})
    const uid = query.uid ? String(query.uid).slice(0, 64) : ''
    const passCode = query.passCode ? String(query.passCode).trim().toUpperCase().slice(0, 12) : ''

    // A recovery code that matches nothing is a real error: silently minting a
    // fresh profile would look like the player lost everything.
    if (passCode && !db.getPlayerByPassCode(passCode) && !uid) {
      return reply.code(404).send({ ok: false, msg: '这个找回码没有对应的档案' })
    }

    const player = db.getOrCreatePlayer({ uid, passCode })
    if (!player) return reply.code(500).send({ ok: false, msg: '档案创建失败' })

    return {
      ok: true,
      player,
      globalStats: db.getGlobalStats(),
      windowHeat: db.getGlobalHeatmap(),
      whispers: db.listWindowMemories({ limit: 12 })
    }
  })

  // ------------------------------------------------------------------ agents
  app.post('/api/agent/plan', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runPlanAgent({
      uid: String(body.uid || ''),
      moodToken: String(body.moodToken || 'lamp'),
      unlockedEndings: Array.isArray(body.unlockedEndings) ? body.unlockedEndings : [],
      playCount: clampNumber(body.playCount, 0, 9999),
      communityMemory: body.communityMemory
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  app.post('/api/agent/evolve', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runEvolveAgent({
      uid: String(body.uid || ''),
      moodToken: String(body.moodToken || 'lamp'),
      night1Telemetry: body.night1Telemetry,
      firstNight: clampNumber(body.firstNight, 2, 3, 2)
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  app.post('/api/agent/epilogue', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runEpilogueAgent({
      endingId: String(body.endingId || ''),
      bondRoomId: clampNumber(body.bondRoomId, 101, 406, 0),
      totalWarmth: clampNumber(body.totalWarmth, 0, 99999),
      litTotal: clampNumber(body.litTotal, 0, 999),
      maxCombo: clampNumber(body.maxCombo, 0, 999),
      resonanceCount: clampNumber(body.resonanceCount, 0, 999),
      stampsEarned: clampNumber(body.stampsEarned, 0, 9),
      choicesHistory: Array.isArray(body.choicesHistory) ? body.choicesHistory : []
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  app.post('/api/agent/dialogue', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runDialogueAgent({
      dormType: String(body.dormType || 'university'),
      season: String(body.season || 'autumn'),
      weather: String(body.weather || 'clear'),
      playerNick: String(body.playerNick || '')
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  app.post('/api/agent/puzzle', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runPuzzleAgent({
      dormType: String(body.dormType || 'university'),
      count: clampNumber(body.count, 2, 24, 4),
      level: clampNumber(body.level, 1, 20, 1),
      mode: String(body.mode || 'memory_sequence')
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  app.post('/api/agent/debrief', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runDebriefAgent({
      gameMode: String(body.gameMode || 'memory_sequence'),
      dormType: String(body.dormType || 'university'),
      stageReached: clampNumber(body.stageReached, 1, 99, 1),
      accuracyPct: clampNumber(body.accuracyPct, 0, 100, 0),
      score: clampNumber(body.score, 0, 999999, 0),
      playerNick: String(body.playerNick || '')
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  // v2 compatibility: /api/generate used to return { nights }.
  app.post('/api/generate', async (req, reply) => {
    if (!guard(req, reply, aiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const result = await hub.runPlanAgent({
      uid: String(body.uid || ''),
      moodToken: String(body.moodToken || 'lamp'),
      playCount: 0
    })
    return { ok: true, source: result.source, payload: result.payload }
  })

  // ------------------------------------------------------------------- score
  app.post('/api/score', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const endingId = ENDING_IDS.includes(String(body.endingId)) ? String(body.endingId) : 'ENDING_F_DRIFT'
    const litRoomIds = Array.isArray(body.litRoomIds)
      ? body.litRoomIds.map(Number).filter(r => INDEX_TO_ROOM.includes(r))
      : []

    const result = db.recordRunAndSyncPlayer({
      uid: String(body.uid || ''),
      nickname: cleanNickname(body.nickname),
      endingId,
      archetype: sanitizeText(body.archetype, 10) || '夜色漫步者',
      litWindows: clampNumber(body.litWindows, 0, 72),
      maxCombo: clampNumber(body.maxCombo, 0, 999),
      totalWarmth: clampNumber(body.totalWarmth, 0, 99999),
      resonances: clampNumber(body.resonances, 0, 999),
      stamps: clampNumber(body.stamps, 0, 9),
      items: Array.isArray(body.items) ? body.items.map(i => sanitizeText(i, 8)).filter(Boolean) : [],
      unlockedEndings: Array.isArray(body.unlockedEndings) ? body.unlockedEndings : [endingId],
      residentBonds: body.residentBonds,
      titles: Array.isArray(body.titles) ? body.titles : [],
      litRoomIds,
      nightsSummary: body.nightsSummary,
      letter: body.letter,
      gameMode: GAME_MODE_IDS.includes(String(body.gameMode)) ? String(body.gameMode) : 'star_sweep',
      dormType: DORM_IDS.includes(String(body.dormType)) ? String(body.dormType) : 'university',
      season: SEASON_IDS.includes(String(body.season)) ? String(body.season) : 'autumn',
      weather: WEATHERS.includes(String(body.weather)) ? String(body.weather) : 'clear',
      stageReached: clampNumber(body.stageReached, 1, 99, 1),
      correctCount: clampNumber(body.correctCount, 0, 9999, 0),
      accuracyPct: clampNumber(body.accuracyPct, 0, 100, 0),
      score: clampNumber(body.score, 0, 999999, 0)
    })

    if (!result.ok) return reply.code(500).send({ ok: false, msg: '保存失败' })
    db.recordTelemetry('run_end', {
      endingId,
      totalWarmth: clampNumber(body.totalWarmth, 0, 99999),
      litWindows: clampNumber(body.litWindows, 0, 72),
      gameMode: String(body.gameMode || 'star_sweep'),
      dormType: String(body.dormType || 'university')
    })
    return { ok: true, rank: result.rank, player: result.player }
  })

  app.get('/api/leaderboard', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const query = /** @type {any} */ (req.query || {})
    const limit = clampNumber(query.limit, 1, 50, 20)
    const scope = query.scope === 'tonight' ? 'tonight' : 'all'
    const mode = GAME_MODE_IDS.includes(String(query.mode)) ? String(query.mode) : ''
    const dormType = DORM_IDS.includes(String(query.dormType)) ? String(query.dormType) : ''
    const uid = query.uid ? String(query.uid).slice(0, 64) : ''
    const stats = db.getGlobalStats()
    const page = db.getLeaderboardPage({ scope, limit, mode, dormType, uid })
    return {
      ok: true,
      items: page.items,
      myRank: page.myRank,
      totalEntries: page.totalEntries,
      totalPlayers: stats.totalPlayers,
      scope,
      mode,
      dormType
    }
  })

  // ---------------------------------------------------------------- whispers
  app.post('/api/whispers', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const content = sanitizeWhisper(body.content)
    if (!content) return reply.code(400).send({ ok: false, msg: '这句话不太合适，换一句试试' })

    const roomId = Number(body.roomId)
    if (!INDEX_TO_ROOM.includes(roomId)) return reply.code(400).send({ ok: false, msg: '房号不存在' })

    const moodToken = MOOD_TOKEN_IDS.includes(String(body.moodToken)) ? String(body.moodToken) : 'lamp'
    const player = db.getOrCreatePlayer({ uid: String(body.uid || '') })
    const nickname = cleanNickname(body.nickname || player?.nickname)

    const whisper = db.addWindowMemory({
      roomId,
      playerUid: player ? player.uid : 'anon',
      nickname,
      content,
      moodToken
    })
    if (!whisper) return reply.code(500).send({ ok: false, msg: '封存失败' })

    db.recordTelemetry('whisper_sealed', { roomId, length: content.length })
    return { ok: true, whisper }
  })

  app.post('/api/whispers/:id/like', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const id = clampNumber(/** @type {any} */ (req.params || {}).id, 1, 2 ** 31, 0)
    const out = db.likeWindowMemory(id)
    if (!out) return reply.code(404).send({ ok: false, msg: '这条留声不在了' })
    return { ok: true, resonances: out.resonances }
  })

  app.get('/api/whispers', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const query = /** @type {any} */ (req.query || {})
    const roomId = query.roomId === undefined ? undefined : clampNumber(query.roomId, 101, 406, 0)
    return { ok: true, items: db.listWindowMemories({ roomId, limit: clampNumber(query.limit, 1, 50, 12) }) }
  })

  // --------------------------------------------------------------- telemetry
  app.post('/api/telemetry', async (req, reply) => {
    if (!guard(req, reply, apiLimiter)) return
    const body = /** @type {any} */ (req.body || {})
    const type = sanitizeText(body.eventType, 32) || 'client_event'
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
    db.recordTelemetry(type, payload)
    return { ok: true }
  })

  app.setErrorHandler((err, req, reply) => {
    req.log?.error?.(err)
    if (reply.raw.headersSent) return
    reply.code(500).send({ ok: false, msg: '服务开了个小差' })
  })

  // @ts-expect-error decorate the instance so integration tests can reach the db
  app.lightWindow = { db, hub }
  return app
}

/**
 * Start listening when this file is the process entry point.
 */
async function main() {
  const app = buildApp()
  const port = Number(process.env.PORT) || 3101
  const host = process.env.HOST || '127.0.0.1'
  try {
    await app.listen({ port, host })
    console.log(`light-a-window v${VERSION} listening on ${host}:${port}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) {
  main()
}

export default buildApp
