import Fastify from 'fastify'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
// Validation is shared with the browser: see shared/ai-schema.js
import { normalizePayload } from '../shared/ai-schema.js'

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'scores.sqlite'))
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    lit_windows INTEGER NOT NULL,
    max_combo INTEGER NOT NULL,
    total_warmth INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`)

const app = Fastify({ logger: false })
const hits = new Map()
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20

function rateLimit(ip) {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr)
    return false
  }
  arr.push(now)
  hits.set(ip, arr)
  return true
}

// Drop IPs that have gone quiet. Without this the Map kept one entry per IP
// forever, which is an unbounded leak on a publicly reachable endpoint.
const rateLimitSweeper = setInterval(() => {
  const now = Date.now()
  for (const [ip, arr] of hits) {
    if (!arr.length || now - arr[arr.length - 1] > RATE_WINDOW_MS) hits.delete(ip)
  }
}, RATE_WINDOW_MS)
rateLimitSweeper.unref()

function cleanNickname(value) {
  const s = String(value || '今晚的某某').replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 8)
  return s || '今晚的某某'
}

const AI_BASE = process.env.AI_BASE || 'https://t.xiaoxin.email/v1'
const AI_KEY = process.env.AI_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'deepseek-v4.1-flash'

const SYSTEM_PROMPT = `你是一个校园夜景生成器，不是心理医生。
只输出 JSON，不要解释。
不诊断、不治疗、不说教，不出现临床词或危机词。
不出现“你应该、想开点、加油、正能量”。
故事只描述具体校园生活小景，不解释情绪。
每晚 2-3 条故事，每条 6-24 个汉字；明信片 10-40 个汉字。
允许安静、疲惫、阴天，不强迫积极。
JSON 结构：{"nights":[{"night":1,"weather":"light_rain","tempo":"normal","palette":"rainy_amber","stories":[{"text":"三楼的绿萝，今天又冒了一片新叶。","item":"绿萝","icon":"🌿"}],"postcard":"今晚亮了 18 扇窗。雨很小，刚好够听见。"}]}
三个夜晚天气不同，节奏从慢到快再到暖。`

// Validation lives in shared/ai-schema.js so the browser can reuse it when a
// player supplies their own DeepSeek key (that path bypasses this server).
const validatePayload = (raw) => normalizePayload(raw)

app.post('/api/generate', async (req, reply) => {
  if (!AI_KEY) return reply.code(503).send({ ok: false, msg: 'AI 未配置' })
  const ip = req.ip || 'unknown'
  if (!rateLimit(ip)) return reply.code(429).send({ ok: false, msg: '请求太频繁' })
  try {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: '生成三个连续的校园夜晚，只输出 JSON。' }],
        temperature: 0.9,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return reply.code(502).send({ ok: false, msg: 'AI 上游失败' })
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    let parsed
    try { parsed = JSON.parse(content) } catch { return reply.code(502).send({ ok: false, msg: 'AI 返回格式错误' }) }
    const payload = validatePayload(parsed)
    if (!payload) {
      console.error('[ai-validate-failed]', JSON.stringify(parsed).slice(0, 1200))
      return reply.code(502).send({ ok: false, msg: 'AI 内容校验失败' })
    }
    return { ok: true, payload }
  } catch {
    return reply.code(504).send({ ok: false, msg: 'AI 超时' })
  }
})

app.get('/api/ai-health', async () => ({ ok: Boolean(AI_KEY), model: AI_MODEL, base: AI_BASE }))

app.get('/api/health', async () => ({ ok: true, service: 'light-a-window', time: new Date().toISOString() }))
app.get('/api/leaderboard', async (req) => {
  const limit = Math.min(20, Math.max(1, Number(req.query?.limit) || 20))
  const rows = db.prepare('SELECT nickname, lit_windows, max_combo, total_warmth, created_at FROM scores ORDER BY total_warmth DESC, max_combo DESC LIMIT ?').all(limit)
  return { ok: true, items: rows }
})
app.post('/api/score', async (req, reply) => {
  const ip = req.ip || 'unknown'
  if (!rateLimit(ip)) return reply.code(429).send({ ok: false, msg: '请求太频繁' })
  const body = req.body || {}
  const nickname = cleanNickname(body.nickname)
  const litWindows = Math.max(0, Math.min(72, Number(body.litWindows) || 0))
  const maxCombo = Math.max(0, Math.min(999, Number(body.maxCombo) || 0))
  const totalWarmth = Math.max(0, Math.min(9999, Number(body.totalWarmth) || 0))
  db.prepare('INSERT INTO scores (nickname, lit_windows, max_combo, total_warmth, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(nickname, litWindows, maxCombo, totalWarmth, new Date().toISOString())
  return { ok: true }
})

const port = Number(process.env.PORT) || 3101
app.listen({ port, host: '127.0.0.1' }).then(() => {
  console.log(`light-a-window server listening on ${port}`)
}).catch(err => {
  console.error(err)
  process.exit(1)
})
