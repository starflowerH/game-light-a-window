// The core controller: the master state machine from docs/v3_plan/00 §5.
//
//   title -> prologue -> night(1..3) -> settle -> ending -> done
//
// Everything the player can do funnels through tap() and the drag chain. The
// window grid itself lives in Scene; this file owns the rules.

import { PALETTES } from './scene.js'
import { AIClient, FALLBACK_NIGHTS, getUserApiKeyStatus, verifyUserApiKey } from './ai.js'
import {
  loadRecords, saveRecords, mergeRun, loadNickname, saveNickname,
  bootstrapProfile, syncRun, sealWhisper, likeWhisper, fetchWhispers,
  fetchLeaderboard, reportClientError
} from './records.js'
import { drawPostcard } from './postcard.js'
import {
  gainForCombo, gainForDragChain, isChainCallout, shouldEncore,
  pickSurprise, canSurprise, comboMilestone, pickNextGlimmerWindow,
  evaluateCommissions, resolveEnding, bumpBond, actionableCount
} from './game-logic.js'
import {
  NIGHT_COUNT, NIGHT_SECONDS, WINDOW_COUNT, WINDOW_STATES,
  TEMPO_CONFIG, tempoConfig, MIN_ACTIONABLE_GLIMMER,
  ALL_LIT_BONUS, ENCORE_RESET_COUNT, ENCORE_DELAY_MS,
  COMMISSION_BONUS, COMBO_FREEZE_MS, CHOICE_AUTO_RESOLVE_MS,
  STORY_BEACON_GAIN, RESONANCE_GAIN, RESONANCE_COMBO_BONUS,
  LIT_RETAP_GAIN, DARK_TAP_GAIN, DARK_TAP_WAKE_CHANCE,
  STORY_BEACON_SCHEDULE, RESONANCE_SCHEDULE,
  EVOLVE_AT_S, CORE_RESIDENT_ROOMS, endingMeta
} from '../shared/constants.js'
import { RESIDENT_BY_ROOM } from './narrative-graph.js'

/**
 * @param {number[]} list
 * @returns {number[]}
 */
const uniq = list => Array.from(new Set(list))

export class Game {
  /**
   * @param {{ scene: any, ui: any, audio: any, ribbon?: any }} deps
   */
  constructor({ scene, ui, audio, ribbon }) {
    this.scene = scene
    this.ui = ui
    this.audio = audio
    this.ribbon = ribbon

    this.state = 'title'
    this.records = loadRecords()
    this.nickname = loadNickname()
    this.ai = new AIClient({ onSource: s => { this.aiSource = s } })
    this.aiSource = 'offline'
    this.community = { whispers: [], stats: null, heat: [] }

    this.moodToken = 'lamp'
    this.nights = FALLBACK_NIGHTS
    this.nightIndex = 0
    this.night = null
    this.run = this._emptyRun()

    this._raf = 0
    this._pausedAt = 0
    this._choiceOpen = false
    this._choiceTimer = 0
    this._comboFreezeUntil = 0
    this._lastTap = 0
    this._chain = { active: false, count: 0, ids: new Set(), startRoom: 0 }
    this._surprise = { lastAt: -9000, sinceRare: 0 }
    this._events = { star: 0, cat: 0, lanterns: 0, golden: 0, chain: 0 }

    addEventListener('keydown', e => {
      if (e.key === 'Escape' && (this.state === 'night' || this.state === 'paused')) this.togglePause()
    })
    addEventListener('popstate', () => { if (this.state === 'night') this.togglePause() })
    addEventListener('error', e => reportClientError(e.message, { where: 'window' }))
    addEventListener('unhandledrejection', e => reportClientError('unhandled rejection', { reason: String(e.reason) }))
  }

  _emptyRun() {
    return {
      totalWarmth: 0, maxCombo: 0, litTotal: 0, resonanceCount: 0, stampsEarned: 0,
      bestNightWarmth: 0, choices: [], residentsAwoken: [], items: [],
      nights: [], litRoomIds: [], nightsSummary: [],
      endingId: '', archetype: '', letter: null,
      unlockedEndings: [], residentBonds: { ...(this.records && this.records.residentBonds) }, titles: [], path: 'A'
    }
  }

  // ------------------------------------------------------------------- boot

  async boot() {
    this.ui.showLoading('正在把楼里的灯接上电')
    const cloud = await bootstrapProfile({ uid: this.records.uid, passCode: this.records.passCode })
    if (cloud) {
      this.records = mergeRunAdopted(this.records, cloud.player)
      this.records = { ...this.records }
      saveRecords(this.records)
      this.community = {
        whispers: cloud.whispers || [],
        stats: cloud.globalStats || null,
        heat: cloud.windowHeat || []
      }
      this.scene.applyHeatmap(cloud.windowHeat || [])
    } else {
      this.aiSource = 'offline'
    }
    this.showTitle()
    if (this.audio) this.audio.setWeather('clear')
  }

  showTitle() {
    this.state = 'title'
    this.scene.resetCamera()
    this.scene.setPaused(false)
    this.ui.showTitle({
      records: this.records,
      whispers: this.community.whispers,
      stats: this.community.stats,
      keyStatus: getUserApiKeyStatus(),
      onStart: () => this.start(),
      onCollection: () => this.ui.showCollection({ records: this.records, onClose: () => this.showTitle() }),
      onLeaderboard: () => this.ui.showLeaderboard({ onClose: () => this.showTitle() }),
      onWhisperWall: () => this.ui.showWhisperWall({ whispers: this.community.whispers, onLike: id => this.likeWhisper(id), onClose: () => this.showTitle() }),
      onKeyConfig: () => this.ui.showKeyDialog({
        status: getUserApiKeyStatus(),
        onVerify: (key, base) => this.verifyKey(key, base),
        onClose: () => this.showTitle()
      })
    })
  }

  async verifyKey(key, base) {
    return verifyUserApiKey(key, base)
  }

  async likeWhisper(id) {
    const n = await likeWhisper(id, this.records.uid)
    return n
  }

  // ---------------------------------------------------------------- prologue

  async start() {
    if (this.audio) this.audio.unlock()
    this.state = 'prologue'
    this.run = this._emptyRun()
    this.ui.showPrologue({
      records: this.records,
      onChoose: mood => this._beginWithMood(mood)
    })
  }

  async _beginWithMood(mood) {
    this.moodToken = mood
    const token = mood
    this.ui.showLoading('导演正在排这三个夜晚')
    const planPromise = this.ai.requestInitialPlan({
      moodToken: mood,
      unlockedEndings: this.records.unlockedEndings,
      playCount: this.records.plays,
      communityMemory: this.community.whispers[0]
        ? { roomId: this.community.whispers[0].roomId, text: this.community.whispers[0].content }
        : null,
      uid: this.records.uid
    })

    // 3.8s race: a slow model must never hold the player at a loading screen.
    const raced = await Promise.race([
      planPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 3800))
    ])

    if (raced && raced.payload) {
      this.nights = raced.payload.nights
      this.aiSource = raced.source
      this.directorNote = raced.payload.directorNote
    } else {
      this.nights = cloneNights(FALLBACK_NIGHTS)
      this.aiSource = 'offline'
      this.directorNote = '今夜从微雨开始，慢一点也没关系。'
      planPromise.then(res => {
        if (!res || !res.payload) return
        if (this.state !== 'night' && this.state !== 'paused') return
        // Only ever replace nights the player has not started.
        for (let i = this.nightIndex + 1; i < NIGHT_COUNT; i++) {
          if (res.payload.nights[i]) this.nights[i] = res.payload.nights[i]
        }
        this.aiSource = res.source
      }).catch(() => {})
    }

    this.ui.intro([
      '熄灯铃响过很久了。',
      '这栋楼里，还有二十四扇窗等着亮起来。',
      '点一下正在发光的窗，或者按住不放，一笔把整排划亮。',
      '今晚，就由你来把灯一盏盏点起来。'
    ], () => this._launchNight(0), { token })
  }

  // ------------------------------------------------------------------ night

  _launchNight(index) {
    const data = this.nights[index] || this.nights[NIGHT_COUNT - 1]
    this.nightIndex = index
    this.state = 'night'
    this._choiceOpen = false
    this.ui.hideAll()

    this.scene.resetWindows()
    this.scene.resetCamera()
    this.scene.setPaused(false)
    const palette = PALETTES[data.palette] ? data.palette : 'warm_blue'
    this.scene.applyTheme(palette)
    this.scene.setWeatherFx(data.weather)
    if (this.audio) {
      this.audio.setWeather(data.weather)
      this.audio.setTempo(data.tempo)
      this.audio.setLitCount(0)
      this.audio.nightStart(index)
    }

    const now = performance.now()
    const cfg = tempoConfig(data.tempo)
    this.night = {
      index,
      data,
      cfg,
      startedAt: now,
      endsAt: now + NIGHT_SECONDS * 1000,
      timeLeft: NIGHT_SECONDS,
      warmth: 0,
      combo: 0,
      maxCombo: 0,
      litCount: 0,
      litRooms: [],
      resonanceCount: 0,
      storyChoices: 0,
      bestChain: 0,
      bondRooms: [],
      stamped: [],
      chain: { active: false, count: 0, ids: new Set(), startRoom: 0 },
      nextSpawnAt: now + 400,
      beaconAt: (STORY_BEACON_SCHEDULE[index] || []).slice(),
      resonanceAt: (RESONANCE_SCHEDULE[index] || []).slice(),
      evolveFired: false,
      allLit: false,
      encore: false,
      ended: false,
      choices: []
    }
    this._surprise = { lastAt: -9000, sinceRare: 0 }
    this._chain = this.night.chain
    this._comboFreezeUntil = 0
    this._pendingRes = null

    // Seed the field so there is never a cold start.
    for (let i = 0; i < cfg.initialGlimmer; i++) this._wakeRandom(false)

    this.ui.startNight({
      night: data,
      index,
      count: NIGHT_COUNT,
      commissions: data.commissions,
      directorNote: this.directorNote,
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      muted: this.audio ? this.audio.muted : false
    })
    this._showCoachIfNeeded()
    this._startTicker()
  }

  _showCoachIfNeeded() {
    if (this.nightIndex !== 0) return
    const w = this.scene.actionableWindows()[0]
    if (!w) return
    const p = this.scene.windowScreenPos(w)
    if (p) this.ui.coach('点亮这扇正在发光的窗', p.x, p.y - 58)
    setTimeout(() => this.ui.hideCoach(), 6000)
  }

  // -------------------------------------------------------------- scheduler

  /**
   * Wake a random dark window into GLIMMER.
   * @param {boolean} [respectCap]
   */
  _wakeRandom(respectCap = true) {
    const n = this.night
    if (!n) return null
    if (respectCap && actionableCount(this.scene.windows) >= n.cfg.maxGlimmer) return null
    const w = /** @type {any} */ (pickNextGlimmerWindow(this.scene.windows, CORE_RESIDENT_ROOMS))
    if (!w) return null
    this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
    w.expiresAt = performance.now() + n.cfg.glimmerDurationMs
    return w
  }

  _scheduleSpawns(now) {
    const n = this.night
    if (!n || n.ended) return
    // Never leave the player staring at a dark building.
    if (actionableCount(this.scene.windows) < MIN_ACTIONABLE_GLIMMER && n.litCount < WINDOW_COUNT) {
      this._wakeRandom(false)
      n.nextSpawnAt = now + 200
      return
    }
    if (now >= n.nextSpawnAt) {
      this._wakeRandom(true)
      n.nextSpawnAt = now + n.cfg.spawnIntervalMs * (0.85 + Math.random() * 0.3)
    }
  }

  _expireGlimmers(now) {
    for (const w of this.scene.windows) {
      if (w.state !== WINDOW_STATES.GLIMMER) continue
      if (w.expiresAt && now > w.expiresAt) {
        this.scene.setWindowState(w, WINDOW_STATES.DARK)
        w.expiresAt = 0
      }
    }
  }

  _maybeBeacon(now) {
    const n = this.night
    if (!n) return
    const t = (now - n.startedAt) / 1000
    if (n.beaconAt.length && t >= n.beaconAt[0]) {
      n.beaconAt.shift()
      this._openBeacon()
    }
  }

  _openBeacon() {
    const pool = this.scene.windows.filter(w => CORE_RESIDENT_ROOMS.includes(w.roomId) && w.state === WINDOW_STATES.DARK)
    const target = pool[0] || this.scene.windows.find(w => w.state === WINDOW_STATES.DARK)
    if (!target) return
    this.scene.setWindowState(target, WINDOW_STATES.STORY_BEACON)
    target.expiresAt = performance.now() + 12000
    this.night.beaconRoom = target.roomId
  }

  _maybeResonance(now) {
    const n = this.night
    if (!n) return
    const t = (now - n.startedAt) / 1000
    if (!n.resonanceAt.length || t < n.resonanceAt[0]) return
    n.resonanceAt.shift()
    const pair = n.data.resonancePair
    if (!pair || !Array.isArray(pair.rooms)) return
    const [a, b] = pair.rooms
    const wa = this.scene.windows.find(w => w.roomId === a)
    const wb = this.scene.windows.find(w => w.roomId === b)
    if (!wa || !wb) return
    if (wa.state === WINDOW_STATES.LIT || wb.state === WINDOW_STATES.LIT) return
    this.scene.setResonancePair(a, b)
    this.night.resonanceLine = pair.line
    this.ui.toast('星轨出现了 · 从一个窗划向另一个', '')
  }

  // ------------------------------------------------------------------- tap

  /**
   * @param {any} w window record
   * @param {number} x
   * @param {number} y
   */
  tap(w, x, y) {
    if (this.state !== 'night' || !this.night || this._choiceOpen) return
    const n = this.night
    const now = performance.now()
    const comboAlive = now - this._lastTap < n.cfg.comboWindowMs && now > this._comboFreezeUntil
    if (!comboAlive && n.combo > 0) {
      n.combo = 0
      this.ui.combo(0)
    }
    this._lastTap = now

    if (w.state === WINDOW_STATES.LIT) {
      n.combo += 1
      n.maxCombo = Math.max(n.maxCombo, n.combo)
      this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
      n.warmth += LIT_RETAP_GAIN
      this.ui.floatText('+' + LIT_RETAP_GAIN, x, y, '#ffe7b0')
      this.ui.combo(n.combo)
      if (this.audio) this.audio.tap(n.combo)
      this.scene.burstAt(w, 0xffe2b0)
      this.scene.pulseCameraFov(0.4)
      this._afterScore()
      return
    }

    if (w.state === WINDOW_STATES.DARK) {
      // Zero-frustration floor: a dark tap always gives a little warmth.
      n.warmth += DARK_TAP_GAIN
      this.ui.floatText('+' + DARK_TAP_GAIN, x, y, '#9fb4d8')
      this.ui.shockwave(x, y)
      if (Math.random() < DARK_TAP_WAKE_CHANCE) {
        this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
        w.expiresAt = now + n.cfg.glimmerDurationMs
        this.ui.toast('这扇窗醒了', '')
      }
      if (this.audio) this.audio.lit(w.roomId)
      this._afterScore()
      return
    }

    // A resonance window is ambiguous on pointerdown: a tap breaks the pair,
    // a drag completes it. Defer the decision until pointerup (or until the
    // drag reaches the partner) so both gestures work.
    if (w.state === WINDOW_STATES.RESONANCE_PAIR) {
      this._pendingRes = { room: w.roomId, x, y }
      n.chain.active = true
      n.chain.ids = new Set([w.idx])
      n.chain.count = 0
      n.chain.startRoom = w.roomId
      this.ui.toast('顺着星轨拖到另一扇窗', '')
      return
    }

    const wasBeacon = w.state === WINDOW_STATES.STORY_BEACON

    n.combo += 1
    n.maxCombo = Math.max(n.maxCombo, n.combo)
    this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
    const gain = wasBeacon ? STORY_BEACON_GAIN : gainForCombo(n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, x, y)

    if (this.audio) this.audio.tap(n.combo)
    this.ui.combo(n.combo)
    this.scene.pulseCameraFov(n.combo >= 8 ? 0.8 : 0.35)
    this.ui.shockwave(x, y)

    n.chain.count = 1
    n.chain.ids = new Set([w.idx])
    n.chain.startRoom = w.roomId
    n.chain.active = true

    if (wasBeacon) this._openChoice(w.roomId)

    this._maybeSurprise(w, now)
    this._afterScore()
  }

  /**
   * @param {any} w
   * @param {number} gain
   * @param {number} x
   * @param {number} y
   */
  _lightWindow(w, gain, x, y) {
    const n = this.night
    const first = w.state !== WINDOW_STATES.LIT
    this.scene.setWindowState(w, WINDOW_STATES.LIT)
    this.scene.burstAt(w)
    if (first) {
      n.litCount = this.scene.windows.filter(x2 => x2.state === WINDOW_STATES.LIT).length
      if (!n.litRooms.includes(w.roomId)) n.litRooms.push(w.roomId)
      if (!this.run.litRoomIds.includes(w.roomId)) this.run.litRoomIds.push(w.roomId)
      this.scene.setLitCount(n.litCount)
      if (this.audio) this.audio.setLitCount(n.litCount)
      this.ui.floatText('+' + gain, x, y, '#ffe7b0', 'big')
      if (this.audio) this.audio.lit(w.roomId)
    }
  }

  _breakResonance(fromRoom) {
    const pair = this.scene.resonancePair
    if (!pair) return
    const otherRoom = pair.a === fromRoom ? pair.b : pair.a
    const other = this.scene.windows.find(w => w.roomId === otherRoom)
    this.scene.clearResonancePair()
    if (other && other.state === WINDOW_STATES.DARK) {
      this.scene.setWindowState(other, WINDOW_STATES.GLIMMER)
      other.expiresAt = performance.now() + this.night.cfg.glimmerDurationMs
    }
  }

  _afterScore() {
    const n = this.night
    if (!n) return
    // Commissions add warmth, so evaluate them before the HUD reads the total.
    this._checkCommissions()
    this.ui.setStats(this)
    if (n.litCount >= WINDOW_COUNT && !n.allLit) this._allLit()
  }

  // ------------------------------------------------------------- drag chain

  /** @param {number} x @param {number} y */
  onPointerDown(x, y) {
    if (this.state !== 'night' || !this.night || this._choiceOpen) return
    const n = this.night
    n.chain.active = true
    if (!n.chain.ids.size) {
      const w = this.scene.windowAt(x, y, 18)
      if (w) {
        n.chain.ids = new Set([w.idx])
        n.chain.count = w.state === WINDOW_STATES.LIT ? 1 : 1
        n.chain.startRoom = w.roomId
      }
    }
    if (this.ribbon) {
      this.ribbon.start(x, y)
      this.ribbon.setMagnets(this.scene.magnetPoints())
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {boolean} dragging
   */
  onPointerMove(x, y, dragging) {
    if (this.ribbon) {
      this.ribbon.push(x, y, dragging && this.state === 'night')
    }
    if (!dragging || this.state !== 'night' || !this.night || this._choiceOpen) return
    this._dragPass(x, y)
  }

  /** @param {number} x @param {number} y */
  onPointerUp(x, y) {
    if (this.ribbon) {
      this.ribbon.end()
      this.ribbon.setMagnets(null)
    }
    const n = this.night
    if (!n) return
    if (this._pendingRes) this._resolvePendingResonanceTap()
    if (n.chain.count >= 3 && this.state === 'night') {
      this.ui.banner('一笔连光 ×' + n.chain.count, '整面墙都在回应你')
      if (this.audio) this.audio.chain(n.chain.count)
      n.warmth += 6
      const free = this._neighbourOf(n.chain.ids)
      if (free) {
        this.scene.setWindowState(free, WINDOW_STATES.LIT)
        this.scene.burstAt(free)
        free.expiresAt = 0
      }
      n.litCount = this.scene.windows.filter(w => w.state === WINDOW_STATES.LIT).length
      this.scene.setLitCount(n.litCount)
      if (this.audio) this.audio.setLitCount(n.litCount)
      this.ui.setStats(this)
      this._checkCommissions()
      if (n.litCount >= WINDOW_COUNT && !n.allLit) this._allLit()
    }
    n.chain.active = false
    n.chain.ids = new Set()
    n.chain.count = 0
    n.bestChain = Math.max(n.bestChain, 0)
  }

  /**
   * The player pressed on a resonance window and let go without dragging to
   * the partner: treat it as an ordinary single tap and break the pair.
   */
  _resolvePendingResonanceTap() {
    const pending = this._pendingRes
    this._pendingRes = null
    if (!pending) return
    const w = this.scene.windows.find(x => x.roomId === pending.room)
    if (!w || w.state !== WINDOW_STATES.RESONANCE_PAIR) return
    const n = this.night
    n.combo += 1
    n.maxCombo = Math.max(n.maxCombo, n.combo)
    const gain = gainForCombo(n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, pending.x, pending.y)
    this._breakResonance(w.roomId)
    if (this.audio) this.audio.tap(n.combo)
    this.ui.combo(n.combo)
    this.ui.shockwave(pending.x, pending.y)
    n.chain.count = 1
    n.chain.ids = new Set([w.idx])
    n.chain.startRoom = w.roomId
    this._afterScore()
  }

  /** @param {number} x @param {number} y */
  _dragPass(x, y) {
    const n = this.night
    const w = this.scene.windowAt(x, y, 18)
    if (!w) return
    if (n.chain.ids.has(w.idx)) return
    if (this._pendingRes) {
      const pair = this.scene.resonancePair
      const partner = pair ? (pair.a === this._pendingRes.room ? pair.b : pair.a) : 0
      if (partner && w.roomId === partner) {
        this._pendingRes = null
        n.chain.ids.add(w.idx)
        this._completeResonance(pair, x, y)
        return
      }
    }

    // Resonance: dragging from one half of the pair onto the other.
    const pair = this.scene.resonancePair
    if (pair && (pair.a === n.chain.startRoom || pair.b === n.chain.startRoom)) {
      const partner = pair.a === n.chain.startRoom ? pair.b : pair.a
      if (w.roomId === partner) {
        this._completeResonance(pair, x, y)
        n.chain.ids.add(w.idx)
        return
      }
    }

    if (w.state !== WINDOW_STATES.GLIMMER && w.state !== WINDOW_STATES.STORY_BEACON && w.state !== WINDOW_STATES.RESONANCE_PAIR) return

    n.chain.count += 1
    n.chain.ids.add(w.idx)
    n.bestChain = Math.max(n.bestChain, n.chain.count)
    const wasBeacon = w.state === WINDOW_STATES.STORY_BEACON
    const gain = gainForDragChain(n.combo, n.chain.count)
    n.combo += 1
    n.maxCombo = Math.max(n.maxCombo, n.combo)
    this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, x, y)
    this.ui.combo(n.combo)
    this.ui.shockwave(x, y)
    if (this.ribbon) this.ribbon.pulse(x, y)
    if (this.audio) this.audio.tap(n.combo)
    if (wasBeacon) this._openChoice(w.roomId)
    if (isChainCallout(n.chain.count)) this.ui.flash('combo')
    this._maybeSurprise(w, performance.now())
    this._afterScore()
  }

  /**
   * @param {{ a: number, b: number }} pair
   * @param {number} x
   * @param {number} y
   */
  _completeResonance(pair, x, y) {
    const n = this.night
    const wa = this.scene.windows.find(w => w.roomId === pair.a)
    const wb = this.scene.windows.find(w => w.roomId === pair.b)
    if (!wa || !wb) return
    this.scene.clearResonancePair()
    this._lightWindow(wa, RESONANCE_GAIN, x, y)
    this._lightWindow(wb, RESONANCE_GAIN, x, y)
    n.warmth += RESONANCE_GAIN
    n.combo += RESONANCE_COMBO_BONUS
    n.maxCombo = Math.max(n.maxCombo, n.combo)
    n.resonanceCount += 1
    this.run.resonanceCount += 1
    n.bondRooms = uniq([...n.bondRooms, pair.a, pair.b])
    this.ui.banner('跨窗共鸣', n.resonanceLine || pair.a + ' 与 ' + pair.b + ' 的灯接上了')
    if (this.audio) this.audio.resonance()
    this.ui.flash('golden')
    this.scene.pulseCameraFov(1.1)
    this._events.resonance = (this._events.resonance || 0) + 1

    // A resonance always wakes one more window along the way.
    const free = this._neighbourOf(new Set([wa.idx, wb.idx]))
    if (free) this.scene.setWindowState(free, WINDOW_STATES.GLIMMER)
    this._afterScore()
  }

  /**
   * @param {Set<number>} used
   * @returns {any|null}
   */
  _neighbourOf(used) {
    const candidates = this.scene.windows.filter(w => w.state === WINDOW_STATES.DARK && !used.has(w.idx))
    if (!candidates.length) return null
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  // ---------------------------------------------------------------- choices

  /** @param {number} roomId */
  _openChoice(roomId) {
    const n = this.night
    if (!n || this._choiceOpen) return
    const story = (n.data.stories || []).find(s => s.roomId === roomId) || (n.data.stories || [])[0]
    if (!story) return
    const resident = RESIDENT_BY_ROOM[roomId]
    this._choiceOpen = true
    this._comboFreezeUntil = performance.now() + COMBO_FREEZE_MS
    this.ui.combo(n.combo)
    this.ui.showChoice({
      story,
      resident,
      whisper: this.community.whispers.find(w => w.roomId === roomId) || null,
      onLike: id => this.likeWhisper(id),
      onChoose: choice => this._resolveChoice(roomId, story, choice),
      onTimeout: () => this._resolveChoice(roomId, story, story.choices[0], true)
    })
  }

  /**
   * @param {number} roomId
   * @param {any} story
   * @param {{ id: string, label: string, outcome: string }} choice
   * @param {boolean} [auto]
   */
  _resolveChoice(roomId, story, choice, auto = false) {
    if (!this._choiceOpen) return
    const n = this.night
    this._choiceOpen = false
    this.ui.hideChoice()
    const resident = RESIDENT_BY_ROOM[roomId]
    n.storyChoices += 1
    n.warmth += 6
    n.bondRooms = uniq([...n.bondRooms, roomId])
    this.run.choices.push({ roomId, choiceId: choice.id, label: choice.label, outcome: choice.outcome, night: n.index + 1 })
    this.run.path = choice.id
    if (!this.run.residentsAwoken.includes(roomId)) this.run.residentsAwoken.push(roomId)
    if (resident) {
      this.run.items.push(resident.item)
      const key = String(roomId)
      this.run.residentBonds[key] = bumpBond(this.run.residentBonds[key] || 0)
    }
    this.ui.storyResult({
      text: story.text,
      choiceLabel: choice.label,
      outcome: choice.outcome,
      auto: Boolean(auto),
      icon: story.icon,
      item: story.item
    })
    if (this.audio) this.audio.stamp()
    this._checkCommissions()
    this.ui.setStats(this)
  }

  // ------------------------------------------------------------ commissions

  _checkCommissions() {
    const n = this.night
    if (!n) return
    const out = evaluateCommissions(n.data.commissions || [], {
      litCount: n.litCount,
      maxCombo: n.maxCombo,
      bestChain: n.bestChain,
      resonanceCount: n.resonanceCount,
      storyChoices: n.storyChoices,
      bondRooms: n.bondRooms.length,
      litRooms: n.litRooms,
      stamped: n.stamped
    })
    for (const id of out.newlyStamped) {
      n.stamped.push(id)
      n.warmth += COMMISSION_BONUS
      this.run.stampsEarned += 1
      const item = out.items.find(i => i.id === id)
      this.ui.stampCommission(id, item ? item.label : '')
      if (this.audio) this.audio.stamp()
    }
    this.ui.updateCommissions(out.items)
  }

  // ---------------------------------------------------------------- surprise

  /** @param {any} w @param {number} now */
  _maybeSurprise(w, now) {
    const n = this.night
    if (!n) return
    const ms = comboMilestone(n.combo)
    if (ms.sound && this.audio) this.audio.tap(n.combo)
    if (ms.chain) {
      n.warmth += 8
      this.ui.flash('combo')
      this.ui.toast('光链 ×' + n.combo + ' · 整面墙在回应你', '+8')
    }
    if (!canSurprise(now, this._surprise.lastAt)) return
    this._surprise.lastAt = now
    const kind = pickSurprise(Math.random(), this._surprise.sinceRare)
    this._surprise.sinceRare = (kind === 'star' || kind === 'golden' || kind === 'lanterns') ? 0 : this._surprise.sinceRare + 1
    this._events[kind] = (this._events[kind] || 0) + 1
    const gain = { golden: 12, star: 9, lanterns: 10, cat: 8, chain: 8 }[kind] || 6
    n.warmth += gain
    if (kind === 'star') this.scene.shootingStar()
    else if (kind === 'lanterns') this.scene.releaseLanterns(4)
    else if (kind === 'cat') this.scene.rooftopCat()
    else if (kind === 'golden') this._lightNeighbourRandom(w)
    else if (kind === 'chain') this._lightNeighbourRandom(w)
    const text = { golden: '金窗 · 一间屋子忽然全亮了', star: '流星划过 · 许个愿吧', lanterns: '有人放了灯 · 一整排飘起来', cat: '屋顶上蹲着一只猫 · 它看着你', chain: '连光 · 隔壁的窗也亮了' }[kind]
    this.ui.toast(text, '+' + gain)
    this.ui.flash(kind === 'golden' ? 'golden' : 'combo')
    this._afterScore()
  }

  /** @param {any} w */
  _lightNeighbourRandom(w) {
    const neighbours = this.scene.windows.filter(x => x.state === WINDOW_STATES.DARK && Math.abs(x.idx - w.idx) <= 6)
    if (!neighbours.length) return
    const pick = neighbours[Math.floor(Math.random() * neighbours.length)]
    this.scene.setWindowState(pick, WINDOW_STATES.LIT)
    this.scene.burstAt(pick)
    this.night.litCount = this.scene.windows.filter(x => x.state === WINDOW_STATES.LIT).length
    if (!this.night.litRooms.includes(pick.roomId)) this.night.litRooms.push(pick.roomId)
    this.scene.setLitCount(this.night.litCount)
    if (this.audio) this.audio.setLitCount(this.night.litCount)
  }

  // ------------------------------------------------------------------ all lit

  _allLit() {
    const n = this.night
    if (!n || n.allLit) return
    n.allLit = true
    n.warmth += ALL_LIT_BONUS
    this.run.totalWarmth += 0
    this.ui.banner('整栋楼，都亮了', '二十四扇窗一起亮着')
    this.ui.flash('golden')
    if (this.audio) this.audio.resonance()
    this.ui.setStats(this)
    setTimeout(() => {
      if (this.state !== 'night' || !this.night || this.night.ended) return
      const left = (this.night.endsAt - performance.now()) / 1000
      if (!shouldEncore(left)) return
      this.night.encore = true
      const lit = this.scene.windows.filter(w => w.state === WINDOW_STATES.LIT)
      for (let i = 0; i < ENCORE_RESET_COUNT && i < lit.length; i++) {
        const w = lit[Math.floor(Math.random() * lit.length)]
        this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
        w.expiresAt = performance.now() + this.night.cfg.glimmerDurationMs
      }
      this.scene.setLitCount(this.scene.windows.filter(w => w.state === WINDOW_STATES.LIT).length)
      this.ui.toast('安可流光 · 再划一轮', '')
    }, ENCORE_DELAY_MS)
  }

  // ------------------------------------------------------------------- loop

  _startTicker() {
    cancelAnimationFrame(this._raf)
    const loop = () => {
      if (this.state !== 'night' || !this.night) return
      const now = performance.now()
      const n = this.night
      const left = Math.max(0, n.endsAt - now)
      n.timeLeft = left / 1000
      this.ui.tick(this)

      this._expireGlimmers(now)
      this._scheduleSpawns(now)
      this._maybeBeacon(now)
      this._maybeResonance(now)

      // Combo decay
      if (n.combo > 0 && now > this._comboFreezeUntil && now - this._lastTap > n.cfg.comboWindowMs) {
        n.combo = 0
        this.ui.combo(0)
        this.ui.setStats(this)
      }

      if (n.index === 0 && !n.evolveFired && (now - n.startedAt) / 1000 >= EVOLVE_AT_S) {
        n.evolveFired = true
        this._evolve()
      }

      if (left <= 0 && !n.ended) this._endNight()
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  async _evolve() {
    const n = this.night
    if (!n) return
    try {
      const res = await this.ai.requestMidGameEvolution({
        moodToken: this.moodToken,
        night1Telemetry: {
          litCount: n.litCount,
          maxCombo: n.maxCombo,
          dragChains: n.bestChain,
          resonancesCompleted: n.resonanceCount,
          choicesMade: this.run.choices.map(c => ({ roomId: c.roomId, choiceId: c.choiceId, label: c.label }))
        },
        firstNight: this.nightIndex + 2,
        uid: this.records.uid
      })
      if (!res || !res.payload || !Array.isArray(res.payload.nights)) return
      // Deep-clone first: never mutate an exported module constant.
      const evolved = cloneNights(res.payload.nights)
      for (let i = 0; i < evolved.length; i++) {
        const targetIdx = this.nightIndex + 1 + i
        if (targetIdx >= NIGHT_COUNT) break
        if (evolved[i]) this.nights[targetIdx] = evolved[i]
      }
      if (res.source !== 'offline') this.ui.toast('后两晚的窗，已经按你今晚的样子改写', '')
    } catch {
      // A failed weave simply leaves the baseline nights in place.
    }
  }

  // ------------------------------------------------------------------- end

  _endNight() {
    const n = this.night
    if (!n || n.ended) return
    n.ended = true
    this.state = 'settle'
    cancelAnimationFrame(this._raf)
    this.scene.setPaused(true)
    if (this.audio) this.audio.setLitCount(0)

    this.run.totalWarmth += n.warmth
    this.run.litTotal += n.litCount
    this.run.bestNightWarmth = Math.max(this.run.bestNightWarmth, n.warmth)
    this.run.items = uniq(this.run.items)
    this.run.residentsAwoken = uniq(this.run.residentsAwoken)
    this.run.nights.push({
      litCount: n.litCount,
      litRooms: n.litRooms.slice(),
      allLit: n.allLit,
      resonanceCount: n.resonanceCount,
      star: this._events.star || 0,
      cat: this._events.cat || 0
    })
    this.run.nightsSummary.push({
      night: n.index + 1,
      weather: n.data.weather,
      tempo: n.data.tempo,
      warmth: n.warmth,
      lit: n.litCount,
      maxCombo: n.maxCombo,
      stamps: n.stamped.length,
      choices: this.run.choices.filter(c => c.night === n.index + 1).map(c => ({ roomId: c.roomId, label: c.label }))
    })

    const summary = {
      night: n.index + 1,
      count: NIGHT_COUNT,
      warmth: n.warmth,
      lit: n.litCount,
      maxCombo: n.maxCombo,
      stamps: n.stamped.length,
      commissions: n.data.commissions,
      resonanceCount: n.resonanceCount,
      allLit: n.allLit
    }
    setTimeout(() => {
      if (n.index + 1 < NIGHT_COUNT) {
        this.ui.nightSummary(summary, () => this._launchNight(n.index + 1))
      } else {
        this._finish()
      }
    }, 700)
  }

  async _finish() {
    this.state = 'ending'
    const resolved = resolveEnding({
      totalWarmth: this.run.totalWarmth,
      litTotal: this.run.litTotal,
      maxCombo: this.run.maxCombo,
      resonanceCount: this.run.resonanceCount,
      stampsEarned: this.run.stampsEarned,
      nights: this.run.nights,
      choices: this.run.choices,
      residentsAwoken: this.run.residentsAwoken,
      events: this._events,
      bonds: this.run.residentBonds
    })
    const meta = endingMeta(resolved.endingId)
    this.run.endingId = resolved.endingId
    this.run.archetype = meta.title
    this.run.bondRoomId = resolved.bondRoomId
    this.run.unlockedEndings = uniq([...this.records.unlockedEndings, resolved.endingId])
    this.run.titles = uniq([...(this.records.titles || []), meta.title]).slice(0, 12)

    this.ui.showEnding({ ending: meta, run: this.run })
    const cutsceneMs = this.scene.playEndingCutscene(resolved.endingId)
    if (this.audio) this.audio.finale(resolved.endingId)

    // The letter is written while the camera is still moving.
    const epilogue = await Promise.race([
      this.ai.requestEndingEpilogue({
        endingId: resolved.endingId,
        bondRoomId: resolved.bondRoomId,
        totalWarmth: this.run.totalWarmth,
        litTotal: this.run.litTotal,
        maxCombo: this.run.maxCombo,
        resonanceCount: this.run.resonanceCount,
        stampsEarned: this.run.stampsEarned,
        choicesHistory: this.run.choices.map(c => ({ roomId: c.roomId, label: c.label })),
        path: this.run.path,
        uid: this.records.uid
      }).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), Math.max(3500, cutsceneMs)))
    ])

    const fallbackLetter = epilogue && epilogue.payload ? epilogue.payload : null
    if (fallbackLetter) {
      this.run.letter = fallbackLetter.letter
      this.run.whisperSuggestion = fallbackLetter.whisperSuggestion
      if (fallbackLetter.archetype) this.run.archetype = fallbackLetter.archetype
      this.run.titles = uniq([...this.run.titles, fallbackLetter.archetype]).slice(0, 12)
    } else {
      this.run.letter = meta ? { fromRoom: meta.name, salutation: '致今晚亮灯的人：', body: '今晚的灯亮到这里。', sign: '17号楼' } : null
      this.run.whisperSuggestion = '今晚的雨很轻，祝你也做个好梦。'
    }
    this.run.letterSource = epilogue ? epilogue.source : 'offline'

    this.records = mergeRun(this.records, {
      totalWarmth: this.run.totalWarmth,
      maxCombo: this.run.maxCombo,
      litTotal: this.run.litTotal,
      bestNightWarmth: this.run.bestNightWarmth,
      items: this.run.items,
      nights: NIGHT_COUNT,
      endingId: this.run.endingId,
      unlockedEndings: this.run.unlockedEndings,
      residentBonds: this.run.residentBonds,
      titles: this.run.titles
    })
    this.records.endingCounts = { ...(this.records.endingCounts || {}) }
    this.records.endingCounts[this.run.endingId] = (this.records.endingCounts[this.run.endingId] || 0) + 1
    saveRecords(this.records)

    const postcard = await drawPostcard({
      run: this.run,
      nights: this.nights,
      records: this.records,
      ending: meta
    })

    const synced = await syncRun({ ...this.run, litTotal: this.run.litTotal }, { uid: this.records.uid, nickname: this.nickname })
    if (synced && synced.player) {
      this.records = mergeRunAdopted(this.records, synced.player)
      saveRecords(this.records)
    }

    this.state = 'done'
    this.ui.showResult({
      run: this.run,
      records: this.records,
      postcard,
      ending: meta,
      letter: this.run.letter,
      rank: synced ? synced.rank : 0,
      aiSource: this.aiSource,
      suggestedWhisper: this.run.whisperSuggestion,
      onSealWhisper: payload => this.sealWhisper(payload),
      onLikeWhisper: id => this.likeWhisper(id),
      onReplay: () => this.start(),
      onHome: () => { this.scene.resetCamera(); this.showTitle() }
    })
  }

  /**
   * @param {{ roomId: number, content: string }} payload
   */
  async sealWhisper(payload) {
    const name = this.nickname || this.records.nickname || '今晚的某某'
    const whisper = await sealWhisper({
      uid: this.records.uid,
      nickname: name,
      roomId: payload.roomId,
      content: payload.content,
      moodToken: this.moodToken
    })
    if (whisper) this.community.whispers = [whisper, ...this.community.whispers].slice(0, 12)
    return whisper
  }

  // ---------------------------------------------------------------- controls

  toggleMute() {
    if (!this.audio) return false
    const muted = this.audio.setMuted(!this.audio.muted)
    this.ui.setMuted(muted)
    return muted
  }

  togglePause() {
    if (!this.night) return
    if (this.state === 'night') {
      this._pausedAt = performance.now()
      this.state = 'paused'
      cancelAnimationFrame(this._raf)
      this.scene.setPaused(true)
      this.ui.pause({ onResume: () => this._resume(), onHome: () => this._abandon() })
    } else if (this.state === 'paused') {
      this._resume()
    }
  }

  _resume() {
    if (!this.night) return
    const delta = performance.now() - this._pausedAt
    this.night.endsAt += delta
    this.night.startedAt += delta
    for (const w of this.scene.windows) if (w.expiresAt) w.expiresAt += delta
    this.state = 'night'
    this.scene.setPaused(false)
    this.ui.hidePause()
    this._startTicker()
  }

  _abandon() {
    this.state = 'title'
    this.night = null
    cancelAnimationFrame(this._raf)
    this.scene.setPaused(false)
    this.scene.resetCamera()
    this.ui.hideAll()
    this.showTitle()
  }

  // ----------------------------------------------------------------- helpers

  submitScore(nickname) {
    this.nickname = String(nickname || '').slice(0, 8)
    saveNickname(this.nickname)
    return syncRun({ ...this.run }, { uid: this.records.uid, nickname: this.nickname })
      .then(r => (r ? { ok: true, rank: r.rank } : { ok: false }))
  }

  leaderboard(scope) {
    return fetchLeaderboard({ scope, limit: 20 })
  }

  whispers() {
    return fetchWhispers({ limit: 12 })
  }

  /** Online stats for the title screen progress bar. */
  async refreshCommunity() {
    const cloud = await bootstrapProfile({ uid: this.records.uid, passCode: this.records.passCode })
    if (!cloud) return
    this.records = mergeRunAdopted(this.records, cloud.player)
    this.community = { whispers: cloud.whispers || [], stats: cloud.globalStats || null, heat: cloud.windowHeat || [] }
    saveRecords(this.records)
  }
}

/**
 * Adopt the server profile into the local record set.
 * @param {any} local
 * @param {any} player
 */
function mergeRunAdopted(local, player) {
  if (!player) return local
  const r = { ...local }
  r.uid = player.uid || r.uid
  r.passCode = player.passCode || r.passCode
  r.nickname = player.nickname || r.nickname
  r.plays = Math.max(r.plays || 0, player.plays || 0)
  r.bestWarmth = Math.max(r.bestWarmth || 0, player.bestWarmth || 0)
  r.bestCombo = Math.max(r.bestCombo || 0, player.bestCombo || 0)
  r.totalWindows = Math.max(r.totalWindows || 0, player.totalWindows || 0)
  r.unlockedEndings = uniq([...(r.unlockedEndings || []), ...(player.unlockedEndings || [])])
  r.items = uniq([...(r.items || []), ...(player.unlockedItems || [])]).slice(0, 60)
  r.titles = uniq([...(r.titles || []), ...(player.titles || [])])
  r.residentBonds = { ...(r.residentBonds || {}) }
  for (const [room, level] of Object.entries(player.residentBonds || {})) {
    r.residentBonds[room] = Math.max(Number(r.residentBonds[room]) || 0, Number(level) || 0)
  }
  return r
}

/**
 * Deep clone the night array so a late AI reply can never mutate a shared
 * module constant (the v2 P0-2 async-overwrite bug).
 * @param {any[]} nights
 * @returns {any[]}
 */
function cloneNights(nights) {
  return nights.map(n => JSON.parse(JSON.stringify(n)))
}

export { TEMPO_CONFIG, COMBO_FREEZE_MS, CHOICE_AUTO_RESOLVE_MS, cloneNights }
