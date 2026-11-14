// SQLite persistence layer for《今晚，亮一盏灯》v3.0.
//
// Node 22 ships node:sqlite, so there is no native build step and no extra
// dependency. WAL mode plus a 64MB page cache is what lets a 4C4G box serve
// both the leaderboard and the cross-player whisper wall comfortably.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { INDEX_TO_ROOM, WINDOW_COUNT } from '../shared/constants.js'

const PASS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/**
 * @returns {string} a six-character recovery code such as "7F3A9C"
 */
function makePassCode() {
  const bytes = randomBytes(6)
  let out = ''
  for (let i = 0; i < 6; i++) out += PASS_ALPHABET[bytes[i] % PASS_ALPHABET.length]
  return out
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {unknown} value
 * @returns {number[]}
 */
function numArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(Number).filter(n => Number.isFinite(n))
}

/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
function numRecord(value) {
  if (!value || typeof value !== 'object') return {}
  /** @type {Record<string, number>} */
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[String(k)] = n
  }
  return out
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseList(raw) {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * @param {string} raw
 * @returns {Record<string, number>}
 */
function parseRecord(raw) {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

/**
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString()
}

const SEED_WHISPERS = [
  { roomId: 102, nickname: '今晚的热茶', content: '保温桶里的红枣茶一直温着，晚回来也有得喝。', mood: 'quilt' },
  { roomId: 203, nickname: '画到一半的人', content: '画纸上的楼还没亮，先替它点一盏。', mood: 'lamp' },
  { roomId: 205, nickname: '调到 88.7', content: '这期节目没有听众，就当是说给这栋楼听的。', mood: 'earphones' },
  { roomId: 301, nickname: '夜宵担当', content: '锅里还剩两串，谁路过都可以拿。', mood: 'umbrella' },
  { roomId: 304, nickname: '今晚的橘猫', content: '窗台上的猫替你打了个哈欠，把着急的事接住了一小会儿。', mood: 'lamp' },
  { roomId: 406, nickname: '等云开的人', content: '十一点半云会散，信我一次。', mood: 'umbrella' }
]

/**
 * Open (or create) the v3 database and return the repository object.
 *
 * @param {string} dataDir directory that holds light_v3.sqlite
 * @returns {ReturnType<typeof buildRepository>}
 */
export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'light_v3.sqlite')
  const db = new DatabaseSync(file)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
    PRAGMA foreign_keys = ON;
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      uid TEXT PRIMARY KEY,
      pass_code TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL DEFAULT '今晚的某某',
      plays INTEGER NOT NULL DEFAULT 0,
      best_warmth INTEGER NOT NULL DEFAULT 0,
      best_combo INTEGER NOT NULL DEFAULT 0,
      total_windows INTEGER NOT NULL DEFAULT 0,
      total_resonances INTEGER NOT NULL DEFAULT 0,
      unlocked_endings_json TEXT NOT NULL DEFAULT '[]',
      unlocked_items_json TEXT NOT NULL DEFAULT '[]',
      resident_bonds_json TEXT NOT NULL DEFAULT '{}',
      titles_json TEXT NOT NULL DEFAULT '["夜巡新人"]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_uid TEXT NOT NULL,
      nickname TEXT NOT NULL,
      ending_id TEXT NOT NULL DEFAULT 'ENDING_A_WARMTH',
      archetype TEXT NOT NULL DEFAULT '温暖点灯人',
      lit_windows INTEGER NOT NULL,
      max_combo INTEGER NOT NULL,
      total_warmth INTEGER NOT NULL,
      resonances INTEGER NOT NULL DEFAULT 0,
      stamps INTEGER NOT NULL DEFAULT 0,
      nights_summary_json TEXT NOT NULL DEFAULT '[]',
      letter_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_leaderboard ON runs(total_warmth DESC, max_combo DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS window_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      player_uid TEXT NOT NULL,
      nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      mood_token TEXT NOT NULL DEFAULT 'lamp',
      resonances INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_room ON window_memories(room_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS window_heat (
      room_id INTEGER PRIMARY KEY,
      lit_total INTEGER NOT NULL DEFAULT 0,
      whisper_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_cache (
      cache_key TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_cache_type ON ai_cache(agent_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  return buildRepository(db)
}

/**
 * @param {DatabaseSync} db
 */
function buildRepository(db) {
  // ---------------------------------------------------------------- prepared
  const stmt = {
    playerByUid: db.prepare('SELECT * FROM players WHERE uid = ?'),
    playerByPass: db.prepare('SELECT * FROM players WHERE pass_code = ?'),
    insertPlayer: db.prepare(`
      INSERT INTO players (uid, pass_code, nickname, plays, best_warmth, best_combo, total_windows,
        total_resonances, unlocked_endings_json, unlocked_items_json, resident_bonds_json,
        titles_json, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, 0, 0, 0, '[]', '[]', '{}', '["夜巡新人"]', ?, ?)
    `),
    updatePlayer: db.prepare(`
      UPDATE players SET nickname = ?, plays = ?, best_warmth = ?, best_combo = ?,
        total_windows = ?, total_resonances = ?, unlocked_endings_json = ?, unlocked_items_json = ?,
        resident_bonds_json = ?, titles_json = ?, updated_at = ?
      WHERE uid = ?
    `),
    insertRun: db.prepare(`
      INSERT INTO runs (player_uid, nickname, ending_id, archetype, lit_windows, max_combo,
        total_warmth, resonances, stamps, nights_summary_json, letter_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    rankOf: db.prepare('SELECT COUNT(*) + 1 AS rank FROM runs WHERE total_warmth > ?'),
    leaderboardAll: db.prepare(`
      SELECT nickname, ending_id, archetype, lit_windows, max_combo, total_warmth, created_at
      FROM runs ORDER BY total_warmth DESC, max_combo DESC LIMIT ?
    `),
    leaderboardTonight: db.prepare(`
      SELECT nickname, ending_id, archetype, lit_windows, max_combo, total_warmth, created_at
      FROM runs WHERE created_at >= ? ORDER BY total_warmth DESC, max_combo DESC LIMIT ?
    `),
    countPlayers: db.prepare('SELECT COUNT(DISTINCT player_uid) AS n FROM runs'),
    totalRuns: db.prepare('SELECT COUNT(*) AS n FROM runs'),
    sumLit: db.prepare('SELECT COALESCE(SUM(lit_windows), 0) AS n FROM runs'),
    heatAll: db.prepare('SELECT room_id, lit_total, whisper_count FROM window_heat'),
    upsertHeat: db.prepare(`
      INSERT INTO window_heat (room_id, lit_total, whisper_count, updated_at) VALUES (?, ?, 0, ?)
      ON CONFLICT(room_id) DO UPDATE SET lit_total = lit_total + excluded.lit_total, updated_at = excluded.updated_at
    `),
    bumpWhisperHeat: db.prepare(`
      INSERT INTO window_heat (room_id, lit_total, whisper_count, updated_at) VALUES (?, 0, 1, ?)
      ON CONFLICT(room_id) DO UPDATE SET whisper_count = whisper_count + 1, updated_at = excluded.updated_at
    `),
    memoriesByRoom: db.prepare(`
      SELECT id, room_id, nickname, content, mood_token, resonances, created_at
      FROM window_memories WHERE room_id = ? ORDER BY created_at DESC LIMIT ?
    `),
    memoriesLatest: db.prepare(`
      SELECT id, room_id, nickname, content, mood_token, resonances, created_at
      FROM window_memories ORDER BY created_at DESC LIMIT ?
    `),
    insertMemory: db.prepare(`
      INSERT INTO window_memories (room_id, player_uid, nickname, content, mood_token, resonances, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `),
    memoryById: db.prepare('SELECT * FROM window_memories WHERE id = ?'),
    likeMemory: db.prepare('UPDATE window_memories SET resonances = resonances + 1 WHERE id = ?'),
    cacheGet: db.prepare('SELECT payload_json, hit_count FROM ai_cache WHERE cache_key = ?'),
    cacheTouch: db.prepare('UPDATE ai_cache SET hit_count = hit_count + 1 WHERE cache_key = ?'),
    cachePut: db.prepare(`
      INSERT INTO ai_cache (cache_key, agent_type, payload_json, hit_count, created_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at
    `),
    cacheRandomByType: db.prepare(`
      SELECT payload_json FROM ai_cache WHERE agent_type = ? ORDER BY RANDOM() LIMIT 1
    `),
    cacheCountByType: db.prepare('SELECT COUNT(*) AS n FROM ai_cache WHERE agent_type = ?'),
    insertTelemetry: db.prepare('INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?)'),
    hasTable: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"),
    runsEmpty: db.prepare('SELECT COUNT(*) AS n FROM runs')
  }

  // ---------------------------------------------------------------- migration
  // v2 stored a bare "scores" table. Lift it into "runs" once, without losing
  // the historical leaderboard, and only when runs is still empty.
  if (stmt.hasTable.get('scores') && num(stmt.runsEmpty.get()?.n) === 0) {
    try {
      // Prepared lazily: preparing against a missing table throws, and every
      // brand-new install has no legacy table at all.
      const legacy = db.prepare('SELECT nickname, lit_windows, max_combo, total_warmth, created_at FROM scores')
      const rows = legacy.all()
      for (const r of rows) {
        stmt.insertRun.run(
          'legacy', String(r.nickname || '今晚的某某'), 'ENDING_F_DRIFT', '夜色漫步者',
          num(r.lit_windows), num(r.max_combo), num(r.total_warmth), 0, 0, '[]', '{}',
          String(r.created_at || nowIso())
        )
      }
    } catch {
      // A malformed legacy table must never block startup.
    }
  }

  // ------------------------------------------------------------------- seeds
  const heatCount = num(db.prepare('SELECT COUNT(*) AS n FROM window_heat').get()?.n)
  if (heatCount === 0) {
    const ts = nowIso()
    for (let i = 0; i < WINDOW_COUNT; i++) {
      const roomId = INDEX_TO_ROOM[i]
      const seedLit = 6 + ((i * 7) % 19)
      db.prepare('INSERT INTO window_heat (room_id, lit_total, whisper_count, updated_at) VALUES (?, ?, 0, ?)')
        .run(roomId, seedLit, ts)
    }
  }

  const memoryCount = num(db.prepare('SELECT COUNT(*) AS n FROM window_memories').get()?.n)
  if (memoryCount === 0) {
    const ts = nowIso()
    for (const w of SEED_WHISPERS) {
      stmt.insertMemory.run(w.roomId, 'seed', w.nickname, w.content, w.mood, ts)
      stmt.bumpWhisperHeat.run(w.roomId, ts)
    }
  }

  return {
    /** @param {string} uid */
    getPlayer(uid) {
      const row = stmt.playerByUid.get(String(uid || ''))
      return row ? hydratePlayer(row) : null
    },

    /** @param {string} passCode */
    getPlayerByPassCode(passCode) {
      const row = stmt.playerByPass.get(String(passCode || '').toUpperCase())
      return row ? hydratePlayer(row) : null
    },

    /**
     * Return the existing player, or mint one.
     * @param {{ uid?: string, passCode?: string, nickname?: string }} input
     */
    getOrCreatePlayer({ uid, passCode, nickname } = {}) {
      if (passCode) {
        const found = this.getPlayerByPassCode(passCode)
        if (found) return found
      }
      if (uid) {
        const found = this.getPlayer(uid)
        if (found) return found
      }
      const newUid = uid || randomUUID()
      let code = makePassCode()
      // A collision is astronomically unlikely, but a UNIQUE constraint failure
      // would 500 the first request of a new player, so retry a few times.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ts = nowIso()
          stmt.insertPlayer.run(newUid, code, String(nickname || '今晚的某某').slice(0, 8), ts, ts)
          return this.getPlayer(newUid)
        } catch {
          code = makePassCode()
        }
      }
      return null
    },

    /**
     * Persist one finished run and fold it into the player's cloud profile.
     * @param {any} input
     */
    recordRunAndSyncPlayer(input = {}) {
      const uid = String(input.uid || '')
      const player = (uid && this.getPlayer(uid)) || this.getOrCreatePlayer({ uid, nickname: input.nickname })
      if (!player) return { ok: false, rank: 0, player: null }

      const nickname = String(input.nickname || player.nickname || '今晚的某某').slice(0, 8)
      const totalWarmth = Math.max(0, Math.min(99999, num(input.totalWarmth)))
      const maxCombo = Math.max(0, Math.min(999, num(input.maxCombo)))
      const litWindows = Math.max(0, Math.min(24 * 3 * 4, num(input.litWindows)))
      const resonances = Math.max(0, Math.min(999, num(input.resonances)))
      const stamps = Math.max(0, Math.min(9, num(input.stamps)))

      const unlockedEndings = Array.from(new Set([...player.unlockedEndings, ...(Array.isArray(input.unlockedEndings) ? input.unlockedEndings.map(String) : [])]))
      const unlockedItems = Array.from(new Set([...player.unlockedItems, ...(Array.isArray(input.items) ? input.items.map(String) : [])])).slice(0, 60)
      const bonds = { ...player.residentBonds }
      for (const [room, level] of Object.entries(numRecord(input.residentBonds))) {
        bonds[room] = Math.max(num(bonds[room]), level)
      }
      const titles = Array.from(new Set([...player.titles, ...(Array.isArray(input.titles) ? input.titles.map(String) : [])])).slice(0, 20)

      const ts = nowIso()
      stmt.updatePlayer.run(
        nickname,
        player.plays + 1,
        Math.max(player.bestWarmth, totalWarmth),
        Math.max(player.bestCombo, maxCombo),
        player.totalWindows + litWindows,
        player.totalResonances + resonances,
        JSON.stringify(unlockedEndings),
        JSON.stringify(unlockedItems),
        JSON.stringify(bonds),
        JSON.stringify(titles),
        ts,
        player.uid
      )

      stmt.insertRun.run(
        player.uid,
        nickname,
        String(input.endingId || 'ENDING_F_DRIFT'),
        String(input.archetype || '夜色漫步者'),
        litWindows,
        maxCombo,
        totalWarmth,
        resonances,
        stamps,
        JSON.stringify(Array.isArray(input.nightsSummary) ? input.nightsSummary : []),
        JSON.stringify(input.letter && typeof input.letter === 'object' ? input.letter : {}),
        ts
      )

      const litRooms = numArray(input.litRoomIds)
      for (const roomId of new Set(litRooms)) {
        if (!INDEX_TO_ROOM.includes(roomId)) continue
        stmt.upsertHeat.run(roomId, 1, ts)
      }

      const rank = num(stmt.rankOf.get(totalWarmth)?.rank) || 1
      return { ok: true, rank, player: this.getPlayer(player.uid) }
    },

    /**
     * @param {number} limit
     * @param {'all'|'tonight'} scope
     */
    getLeaderboard(limit = 20, scope = 'all') {
      const n = Math.max(1, Math.min(50, Number(limit) || 20))
      if (scope === 'tonight') {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return stmt.leaderboardTonight.all(start.toISOString(), n).map(rowToBoardEntry)
      }
      return stmt.leaderboardAll.all(n).map(rowToBoardEntry)
    },

    /** @param {{ roomId?: number, limit?: number }} [opts] */
    listWindowMemories({ roomId, limit = 12 } = {}) {
      const n = Math.max(1, Math.min(50, Number(limit) || 12))
      if (Number.isFinite(Number(roomId))) {
        return stmt.memoriesByRoom.all(Number(roomId), n).map(rowToWhisper)
      }
      return stmt.memoriesLatest.all(n).map(rowToWhisper)
    },

    /** @param {{ roomId: number, playerUid: string, nickname: string, content: string, moodToken: string }} input */
    addWindowMemory({ roomId, playerUid, nickname, content, moodToken }) {
      const ts = nowIso()
      const info = stmt.insertMemory.run(
        Number(roomId), String(playerUid || 'anon'), String(nickname || '今晚的某某').slice(0, 8),
        String(content), String(moodToken || 'lamp'), ts
      )
      stmt.bumpWhisperHeat.run(Number(roomId), ts)
      const id = Number(info.lastInsertRowid)
      const row = stmt.memoryById.get(id)
      return row ? rowToWhisper(row) : null
    },

    /** @param {number} id */
    likeWindowMemory(id) {
      const row = stmt.memoryById.get(Number(id))
      if (!row) return null
      stmt.likeMemory.run(Number(id))
      const after = stmt.memoryById.get(Number(id))
      return after ? { id: Number(after.id), resonances: num(after.resonances) } : null
    },

    /** @returns {Array<{ roomId: number, litTotal: number, whisperCount: number }>} */
    getGlobalHeatmap() {
      const rows = stmt.heatAll.all()
      /** @type {Map<number, { roomId: number, litTotal: number, whisperCount: number }>} */
      const byRoom = new Map()
      for (const roomId of INDEX_TO_ROOM) {
        byRoom.set(roomId, { roomId, litTotal: 0, whisperCount: 0 })
      }
      for (const r of rows) {
        byRoom.set(Number(r.room_id), {
          roomId: Number(r.room_id),
          litTotal: num(r.lit_total),
          whisperCount: num(r.whisper_count)
        })
      }
      return Array.from(byRoom.values())
    },

    /** @returns {{ totalRuns: number, totalPlayers: number, totalLit: number }} */
    getGlobalStats() {
      return {
        totalRuns: num(stmt.totalRuns.get()?.n),
        totalPlayers: num(stmt.countPlayers.get()?.n),
        totalLit: num(stmt.sumLit.get()?.n)
      }
    },

    /** @param {string} key */
    getCachedAiPayload(key) {
      const row = stmt.cacheGet.get(String(key || ''))
      if (!row) return null
      try {
        stmt.cacheTouch.run(String(key))
        return JSON.parse(String(row.payload_json))
      } catch {
        return null
      }
    },

    /** @param {{ key: string, agentType: string, payload: any }} input */
    setCachedAiPayload({ key, agentType, payload }) {
      stmt.cachePut.run(String(key), String(agentType), JSON.stringify(payload), Date.now())
    },

    /**
     * When the upstream is throttled, reuse any cached payload of the same kind
     * so the player still gets real generated content instead of an error.
     * @param {'plan'|'evolve'|'epilogue'} agentType
     */
    pickCachedAiPayload(agentType) {
      const row = stmt.cacheRandomByType.get(String(agentType))
      if (!row) return null
      try {
        return JSON.parse(String(row.payload_json))
      } catch {
        return null
      }
    },

    /** @param {'plan'|'evolve'|'epilogue'} agentType */
    countCached(agentType) {
      return num(stmt.cacheCountByType.get(String(agentType))?.n)
    },

    /** @param {string} eventType @param {any} payload */
    recordTelemetry(eventType, payload) {
      try {
        stmt.insertTelemetry.run(String(eventType), JSON.stringify(payload ?? null), nowIso())
      } catch {
        // Telemetry must never break a request.
      }
    },

    /** @returns {boolean} */
    ping() {
      try {
        db.prepare('SELECT 1 AS ok').get()
        return true
      } catch {
        return false
      }
    },

    close() {
      try { db.close() } catch { /* already closed */ }
    }
  }
}

/**
 * @param {any} row
 */
function hydratePlayer(row) {
  return {
    uid: String(row.uid),
    passCode: String(row.pass_code),
    nickname: String(row.nickname),
    plays: num(row.plays),
    bestWarmth: num(row.best_warmth),
    bestCombo: num(row.best_combo),
    totalWindows: num(row.total_windows),
    totalResonances: num(row.total_resonances),
    unlockedEndings: parseList(row.unlocked_endings_json),
    unlockedItems: parseList(row.unlocked_items_json),
    residentBonds: parseRecord(row.resident_bonds_json),
    titles: parseList(row.titles_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

/**
 * @param {any} row
 */
function rowToBoardEntry(row) {
  return {
    nickname: String(row.nickname),
    endingId: String(row.ending_id || ''),
    archetype: String(row.archetype || ''),
    lit_windows: num(row.lit_windows),
    max_combo: num(row.max_combo),
    total_warmth: num(row.total_warmth),
    created_at: String(row.created_at)
  }
}

/**
 * @param {any} row
 */
function rowToWhisper(row) {
  return {
    id: num(row.id),
    roomId: num(row.room_id),
    nickname: String(row.nickname),
    content: String(row.content),
    moodToken: String(row.mood_token || 'lamp'),
    resonances: num(row.resonances),
    createdAt: String(row.created_at)
  }
}
