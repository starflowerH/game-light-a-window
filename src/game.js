// Master game controller for《今晚，亮一盏灯 · 3D校园夜巡物语》v4.0.
//
// Coordinates:
//   - Title Screen (living 3D flyover + nickname + Enter Campus CTA)
//   - Opening Camera Cutscene & Weather-Outfit RPG Dialogue
//   - Campus 3D Hub (4 Dormitories × 4 Seasons × 5 Weathers × 4 Camera Views)
//   - 5 Minigame Engines (memory_sequence, memory_snapshot, patrol_reflex, lights_out_puzzle, star_sweep)
//   - Random Events, Visible AI Agents & Rank-Aware Settlement + Postcard

import { PALETTES } from './scene.js'
import { TutorialStateMachine, TUTORIAL_STATES } from './tutorial.js'
import { DifficultyDirector } from './difficulty.js'
import { CrisisManager } from './crisis.js'
import { ReplayRecorder, REPLAY_EVENT_TYPES } from './replay.js'
import { AIClient, FALLBACK_NIGHTS, getUserApiKeyStatus, verifyUserApiKey } from './ai.js'
import {
  ensureNickname, loadRecords, saveRecords, saveNickname,
  bootstrapProfile, syncRun, sealWhisper, likeWhisper, fetchWhispers,
  fetchLeaderboardWithRank, reportClientError
} from './records.js'
import { drawPostcard } from './postcard.js'
import {
  gainForCombo, gainForDragChain, isChainCallout, shouldEncore,
  pickSurprise, canSurprise, comboMilestone, pickNextGlimmerWindow,
  evaluateCommissions, resolveEnding, bumpBond, actionableCount,
  floorCleared
} from './game-logic.js'
import {
  NIGHT_COUNT, NIGHT_SECONDS, WINDOW_STATES,
  TEMPO_CONFIG, tempoConfig, MIN_ACTIONABLE_GLIMMER,
  ALL_LIT_BONUS, ENCORE_RESET_COUNT, ENCORE_DELAY_MS,
  COMMISSION_BONUS, COMBO_FREEZE_MS,
  STORY_BEACON_GAIN, RESONANCE_GAIN, RESONANCE_COMBO_BONUS,
  LIT_RETAP_GAIN, DARK_TAP_GAIN, DARK_TAP_WAKE_CHANCE,
  STORY_BEACON_SCHEDULE, RESONANCE_SCHEDULE,
  EVOLVE_AT_S, CORE_RESIDENT_ROOMS, CAMERA_VIEW_IDS,
  BGM_TRACKS, adaptCommissionsForDorm, adaptResonancePairForDorm,
  dormDef, gameModeDef, endingMeta
} from '../shared/constants.js'
import { RESIDENT_BY_ROOM, chapterMeta } from './narrative-graph.js'
import { pickRandomEvent } from './random-events.js'
import {
  computeMemoryDifficulty,
  generateMemoryRound,
  createMemoryState,
  stepMemoryTap,
  summarizeMemoryStage
} from './minigames/memory-patrol.js'
import {
  PATROL_DURATION_SEC,
  patrolWaveConfig,
  pickPatrolSpawn,
  resolvePatrolTap
} from './minigames/dorm-reflex.js'
import {
  crossIndices,
  toggleCross,
  generateSolvableBoard,
  solveLightsOutGF2,
  isAllLightsOut
} from './minigames/lights-out.js'

const uniq = list => Array.from(new Set(list))

export class Game {
  /** @param {{ scene: any, ui: any, audio: any, ribbon?: any }} deps */
  constructor({ scene, ui, audio, ribbon }) {
    this.scene = scene
    this.ui = ui
    this.audio = audio
    this.ribbon = ribbon

    this.state = 'title'
    this.records = loadRecords()
    this.nickname = ensureNickname()
    this.ai = new AIClient({ onSource: s => { this.aiSource = s } })
    this.aiSource = 'offline'
    this.community = { whispers: [], stats: null, heat: [] }

    // v4 campus preferences
    this.dormId = this.records.preferredDorm || 'university'
    this.season = this.records.preferredSeason || 'autumn'
    this.weather = this.records.preferredWeather || 'clear'
    this.viewId = 'stardew'
    this.gameMode = this.records.preferredMode || 'memory_sequence'

    // v3 story run state
    this.moodToken = 'lamp'
    this.nights = FALLBACK_NIGHTS
    this.nightIndex = 0
    this.night = null
    this.run = this._emptyRun()

    // v4 active minigame runtime state
    this.mg = null
    this._mgTimers = new Set()

    this._raf = 0
    this._coachRaf = 0
    this._pausedAt = 0
    this.orbitLocked = false
    this._choiceOpen = false
    this._choicePausedAt = 0
    this._choiceTimer = 0
    this._comboFreezeUntil = 0
    this._lastTap = 0
    this._chain = { active: false, count: 0, ids: new Set(), startRoom: 0 }
    this._surprise = { lastAt: -9000, sinceRare: 0 }
    this._events = { star: 0, cat: 0, lanterns: 0, golden: 0, chain: 0 }

    this.tutorial = new TutorialStateMachine({
      onStateChange: (next, prev) => this._onTutorialStateChange(next, prev)
    })
    this._tutorialActive = false
    /** @type {number[]} */
    this._tutorialTargetRooms = []
    /** @type {string|null} */
    this._pendingModeLaunch = null

    // P2: Difficulty Director, Random Crisis Manager, Replay Recorder
    this.difficulty = new DifficultyDirector()
    this.crisis = new CrisisManager()
    this.replay = new ReplayRecorder(400)

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
      unlockedEndings: [], residentBonds: { ...(this.records && this.records.residentBonds) }, titles: [], path: 'A',
      dormType: this.dormId, season: this.season, weather: this.weather, gameMode: 'star_sweep'
    }
  }

  _mgTimeout(fn, ms) {
    const id = setTimeout(() => {
      this._mgTimers.delete(id)
      fn()
    }, ms)
    this._mgTimers.add(id)
    return id
  }

  _clearMinigame() {
    for (const id of this._mgTimers) clearTimeout(id)
    this._mgTimers.clear()
    cancelAnimationFrame(this._raf)
    cancelAnimationFrame(this._coachRaf)
    this.mg = null
    if (this.ui && this.ui.hideTutorialOverlay) this.ui.hideTutorialOverlay()
  }

  toggleOrbitLock() {
    this.orbitLocked = !this.orbitLocked
    this.scene.setOrbitLocked(this.orbitLocked)
    if (this.ui && this.ui.updateOrbitBadge) this.ui.updateOrbitBadge(this.orbitLocked)
    if (this.ui && this.ui.showHintBubble) {
      if (this.orbitLocked) {
        this.ui.showHintBubble('[data-orbitbadge]', '🔒 固定连窗已开启', '专注连窗不误转，右键/双指可微调视角', 3200)
      } else {
        this.ui.showHintBubble('[data-orbitbadge]', '🔄 自由转看已开启', '拖拽可旋转楼体，随时点击重新固定', 3200)
      }
    } else {
      this.ui.toast(
        this.orbitLocked ? '🔒 视角已固定（专注点/划连窗）' : '🔄 自由转看模式（可拖拽旋转楼体）',
        this.orbitLocked ? '右键拖拽或双指仍可微调视角' : '点击顶部按钮可随时重新固定'
      )
    }
    return this.orbitLocked
  }

  resetFrontView() {
    this.viewId = 'front'
    this.scene.setCameraView('front', false)
    if (this.ui && this.ui.showHintBubble) {
      this.ui.showHintBubble('[data-act="reset-view"]', '↺ 视角已回正', '已切回正面最佳视角', 2600)
    } else {
      this.ui.toast('↺ 已回正正面最佳连窗视角', '')
    }
  }

  _setNickname(raw) {
    const cleaned = String(raw || '').trim().slice(0, 8) || ensureNickname()
    this.nickname = cleaned
    this.records.nickname = cleaned
    saveNickname(cleaned)
    saveRecords(this.records)
  }

  // ------------------------------------------------------------------- boot & title

  async boot() {
    this.ui.showLoading('正在载入 3D 校园星夜与宿舍楼群')
    await Promise.race([
      this.scene.ready,
      new Promise(r => setTimeout(r, 2200))
    ])
    this.scene.setSeason(this.season)
    this.scene.setWeatherFx(this.weather)
    if (this.dormId !== 'university') await this.scene.switchDorm(this.dormId, true)

    const cloud = await Promise.race([
      bootstrapProfile({ uid: this.records.uid, passCode: this.records.passCode }),
      new Promise(r => setTimeout(() => r(null), 1600))
    ])
    if (cloud) {
      this.records = mergeRunAdopted(this.records, cloud.player)
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
    if (this.audio) {
      this.audio.setWeather(this.weather)
      const savedBgm = this.records.preferredBgm || 'auto'
      this.audio.setBgmTrack(savedBgm)
    }
  }

  getBgmState() {
    if (!this.audio) return { mode: 'auto', activeTrack: 'kataware', customTitle: '', muted: false }
    return this.audio.getBgmState()
  }

  setBgmTrack(trackId) {
    if (!this.audio) return
    this.audio.unlock()
    if (trackId !== 'custom') {
      this.audio.setBgmTrack(trackId)
      this.records.preferredBgm = trackId
      saveRecords(this.records)
    }
    const meta = BGM_TRACKS.find(t => t.id === trackId)
    if (meta) this.ui.toast(`配乐已切为：${meta.name}`, meta.desc)
    this._refreshBgmHud()
  }

  cycleBgmTrack() {
    const order = ['auto', 'kataware', 'bluedragon', 'mysoul', 'ambient']
    const cur = this.getBgmState().mode
    const next = order[(order.indexOf(cur) + 1) % order.length]
    this.setBgmTrack(next)
    return this.getBgmState()
  }

  loadCustomBgm(file) {
    if (!this.audio || !file) return false
    this.audio.unlock()
    const ok = this.audio.loadCustomAudioFile(file)
    if (ok) {
      this.ui.toast(`正在播放本地音乐：${this.audio.getBgmState().customTitle}`, '已保留游戏音效')
      this._refreshBgmHud()
    }
    return ok
  }

  _refreshBgmHud() {
    if (this.ui && this.ui.updateBgmBadge) this.ui.updateBgmBadge(this.getBgmState())
    if (this.state === 'hub') this.showHub()
  }

  showTitle() {
    this._clearMinigame()
    this.state = 'title'
    if (this.audio) this.audio.setSceneContext('title')
    this.scene.setOrbitLocked(false)
    this.scene.setFlyover(true)
    this.scene.setPaused(false)
    this.ui.showTitle({
      records: this.records,
      whispers: this.community.whispers,
      stats: this.community.stats,
      keyStatus: getUserApiKeyStatus(),
      nickname: this.nickname,
      bgmState: this.getBgmState(),
      onBgmSelect: id => this.setBgmTrack(id),
      onBgmUpload: f => this.loadCustomBgm(f),
      onMute: () => this.toggleMute(),
      onNicknameChange: name => this._setNickname(name),
      onEnterCampus: () => this.enterCampus(),
      onStart: () => this.start(),
      onCollection: () => this.ui.showCollection({ records: this.records, onClose: () => this.showTitle() }),
      onLeaderboard: () => this.openLeaderboard(() => this.showTitle()),
      onNpcGallery: () => this.openNpcGallery(() => this.showTitle()),
      onWhisperWall: () => this.ui.showWhisperWall({ whispers: this.community.whispers, onLike: id => this.likeWhisper(id), onClose: () => this.showTitle() }),
      onKeyConfig: () => this.ui.showKeyDialog({
        status: getUserApiKeyStatus(),
        onVerify: (key, base) => this.verifyKey(key, base),
        onClose: () => this.showTitle()
      })
    })
  }

  async enterCampus() {
    if (this.audio) this.audio.unlock()
    this.state = 'cutscene'
    this.scene.setFlyover(false)
    this.scene.playOpeningCutscene()
    this.ui.showLoading('林阿姨和周副校长正在值班室门口等你')

    const res = await Promise.race([
      this.ai.requestOpeningDialogue({
        dormType: this.dormId,
        season: this.season,
        weather: this.weather,
        gameMode: this.gameMode,
        playerNick: this.nickname
      }),
      new Promise(r => setTimeout(() => r(null), 1500))
    ])
    const lines = res && res.payload ? res.payload.lines : null
    if (res && res.source) this.aiSource = res.source

    this.state = 'dialogue'
    this.ui.showDialogue({
      lines,
      dormType: this.dormId,
      season: this.season,
      weather: this.weather,
      aiSource: this.aiSource,
      onSpeakerChange: npcId => this.scene.setNpcActor(npcId),
      onStepSound: i => { if (this.audio) this.audio.npcChat(i) },
      onDone: () => this.showHub()
    })
  }

  async replayDialogue() {
    const res = await this.ai.requestOpeningDialogue({
      dormType: this.dormId,
      season: this.season,
      weather: this.weather,
      gameMode: this.gameMode,
      playerNick: this.nickname
    })
    this.aiSource = res.source
    this.ui.showDialogue({
      lines: res.payload.lines,
      dormType: this.dormId,
      season: this.season,
      weather: this.weather,
      aiSource: this.aiSource,
      onSpeakerChange: npcId => this.scene.setNpcActor(npcId),
      onStepSound: i => { if (this.audio) this.audio.npcChat(i) },
      onDone: () => this.showHub()
    })
  }

  showHub() {
    this._clearMinigame()
    this.state = 'hub'
    if (this.audio) this.audio.setSceneContext('hub')
    this.scene.setFlyover(false)
    this.orbitLocked = false
    this.scene.setOrbitLocked(false)
    this.scene.setPaused(false)
    this.scene.resetWindows()
    this.scene.applyHeatmap(this.community.heat || [])

    this.ui.showCampusHub({
      nickname: this.nickname,
      dormId: this.dormId,
      season: this.season,
      weather: this.weather,
      viewId: this.viewId,
      gameMode: this.gameMode,
      aiSource: this.aiSource,
      keyEnabled: getUserApiKeyStatus().enabled,
      bgmState: this.getBgmState(),
      onBgmSelect: id => this.setBgmTrack(id),
      onBgmUpload: f => this.loadCustomBgm(f),
      onMute: () => this.toggleMute(),
      onNicknameChange: name => this._setNickname(name),
      onDorm: id => this.changeDorm(id),
      onSeason: id => this.changeSeason(id),
      onWeather: id => this.changeWeather(id),
      onView: id => this.changeView(id),
      onSelectMode: id => { this.gameMode = id; this.records.preferredMode = id; saveRecords(this.records); this.showHub() },
      onLaunchMode: id => this.launchGame(id),
      onReplayDialogue: () => this.replayDialogue(),
      onNpcGallery: () => this.openNpcGallery(() => this.showHub()),
      onLeaderboard: () => this.openLeaderboard(() => this.showHub()),
      onCollection: () => this.ui.showCollection({ records: this.records, onClose: () => this.showHub() }),
      onKeyConfig: () => this.ui.showKeyDialog({
        status: getUserApiKeyStatus(),
        onVerify: (key, base) => this.verifyKey(key, base),
        onClose: () => this.showHub()
      }),
      onTitle: () => this.showTitle()
    })
  }

  async changeDorm(dormId) {
    if (this.audio) this.audio.unlock()
    this.dormId = dormDef(dormId).id
    this.records.preferredDorm = this.dormId
    saveRecords(this.records)
    this.ui.toast(`正在前往 ${dormDef(this.dormId).shortName}…`, '')
    await this.scene.switchDorm(this.dormId, false)
    if (this.state === 'hub') this.showHub()
  }

  changeSeason(seasonId) {
    if (this.audio) this.audio.unlock()
    this.season = seasonId
    this.records.preferredSeason = seasonId
    saveRecords(this.records)
    this.scene.setSeason(seasonId)
    if (this.state === 'hub') this.showHub()
  }

  changeWeather(weatherId) {
    if (this.audio) this.audio.unlock()
    this.weather = weatherId
    this.records.preferredWeather = weatherId
    saveRecords(this.records)
    this.scene.setWeatherFx(weatherId)
    if (this.audio) this.audio.setWeather(weatherId)
    if (this.state === 'hub') this.showHub()
  }

  changeView(viewId) {
    this.viewId = CAMERA_VIEW_IDS.includes(viewId) ? viewId : 'stardew'
    this.scene.setCameraView(this.viewId, false)
    if (this.state === 'hub') this.showHub()
  }

  openNpcGallery(onClose) {
    this.ui.showNpcGallery({
      season: this.season,
      weather: this.weather,
      onSeason: s => this.changeSeason(s),
      onWeather: w => this.changeWeather(w),
      onClose
    })
  }

  openLeaderboard(onClose, filterMode = '') {
    this.ui.showLeaderboard({
      uid: this.records.uid,
      nickname: this.nickname,
      defaultMode: filterMode,
      defaultDorm: '',
      onNicknameChange: name => this._setNickname(name),
      onClose
    })
  }

  async verifyKey(key, base) { return verifyUserApiKey(key, base) }
  async likeWhisper(id) { return likeWhisper(id, this.records.uid) }

  // ------------------------------------------------------------------- v4 Minigame Matrix

  launchGame(modeId) {
    if (this.audio) this.audio.unlock()
    this.gameMode = modeId || this.gameMode
    this.records.preferredMode = this.gameMode
    saveRecords(this.records)

    if (this.tutorial && !this.tutorial.isCompleted()) {
      this._pendingModeLaunch = this.gameMode
      this.start()
      return
    }

    if (this.gameMode === 'star_sweep') {
      this.start()
      return
    }
    if (this.gameMode === 'memory_sequence' || this.gameMode === 'memory_snapshot') {
      this._startMemoryGame(this.gameMode)
      return
    }
    if (this.gameMode === 'patrol_reflex') {
      this._startPatrolReflex()
      return
    }
    if (this.gameMode === 'lights_out_puzzle') {
      this._startLightsOutPuzzle()
      return
    }
  }

  // ---- ① Memory Sequence & ② Memory Snapshot ----

  _startMemoryGame(mode) {
    this._clearMinigame()
    this.state = 'minigame'
    this.scene.setFlyover(false)
    this.scene.setCameraView('front', false)
    this.orbitLocked = true
    this.scene.setOrbitLocked(true)
    this.scene.resetWindows()

    const dorm = dormDef(this.dormId)
    const modeMeta = gameModeDef(mode)

    this.mg = {
      kind: mode,
      stage: 1,
      maxStage: 6,
      phase: 'observe', // 'observe' | 'recall' | 'settled'
      score: 0,
      correctCount: 0,
      totalExpected: 0,
      totalMistakes: 0,
      shield: 1,
      scoreMult: 1,
      extraObserveMs: 0,
      litHistory: new Set(),
      memState: null,
      aiPattern: '星灯序列',
      combo: 0
    }

    if (this.audio) this.audio.setSceneContext(mode)
    this.ui.startMinigameHud({
      modeMeta,
      dormMeta: dorm,
      aiPattern: 'AI 构图中…',
      bgmState: this.getBgmState(),
      onCycleBgm: () => this.cycleBgmTrack(),
      orbitLocked: this.orbitLocked,
      onToggleOrbit: () => this.toggleOrbitLock(),
      onResetView: () => this.resetFrontView(),
      muted: this.audio ? this.audio.muted : false,
      onMute: () => this.toggleMute(),
      onViewCycle: () => this._cycleCameraView(),
      onExit: () => this.showHub()
    })

    this._runMemoryStage(1)
  }

  async _runMemoryStage(stage) {
    const mg = this.mg
    if (!mg || this.state !== 'minigame') return
    mg.stage = stage
    mg.phase = 'observe'
    this.scene.resetWindows()

    const dorm = dormDef(this.dormId)
    const diff = computeMemoryDifficulty(stage, dorm.windowCount)

    this.ui.updateMinigameHud({
      stage,
      phaseText: '👀 第 ' + stage + ' 关 · 记住亮灯',
      score: mg.score,
      correctCount: mg.correctCount,
      accuracyPct: this._calcAcc(mg.correctCount, mg.totalExpected + mg.totalMistakes),
      shield: mg.shield,
      timeLeftSec: null,
      bottomText: mg.kind === 'memory_sequence'
        ? '窗户会按顺序一扇扇亮起然后熄灭，请记住顺序！'
        : '一批窗户将同时闪亮，请记住它们各自的位置！'
    })

    // Fetch optional AI geometric motif within 1.1s
    const aiRes = await Promise.race([
      this.ai.requestAiPuzzle({
        dormType: dorm.id,
        rows: dorm.rows,
        cols: dorm.cols,
        count: diff.targetCount,
        level: stage,
        mode: mg.kind
      }),
      new Promise(r => setTimeout(() => r(null), 1100))
    ])
    if (!this.mg || this.state !== 'minigame') return
    if (aiRes && aiRes.source) this.aiSource = aiRes.source

    const aiTargets = aiRes?.payload?.targets
    const aiName = aiRes?.payload?.patternName || `第${stage}关巡灯阵`
    const round = generateMemoryRound(stage, dorm.windowCount, aiTargets, aiName)
    mg.aiPattern = round.patternName
    mg.round = round
    mg.memState = createMemoryState(mg.kind, round)
    mg.totalExpected += round.targets.length

    this.ui.updateMinigameHud({
      aiPattern: round.patternName,
      bottomText: (aiRes?.payload?.flavorHint) || `本关需记住 ${round.targets.length} 扇窗${round.decoys.length ? '（注意避开蓝色干扰灯）' : ''}`
    })

    const obsBoost = mg.extraObserveMs || 0
    mg.extraObserveMs = 0

    // Play observe choreography
    if (mg.kind === 'memory_sequence') {
      const eachMs = diff.stepShowMs + Math.round(obsBoost * 0.4)
      let delay = 550
      round.targets.forEach((winIdx, step) => {
        this._mgTimeout(() => {
          if (this.state !== 'minigame') return
          this.scene.setWindowState(winIdx, WINDOW_STATES.TARGET_HINT)
          if (this.audio) this.audio.cue(step)
        }, delay)
        this._mgTimeout(() => {
          if (this.state !== 'minigame') return
          this.scene.setWindowState(winIdx, WINDOW_STATES.DARK)
        }, delay + eachMs)
        delay += eachMs + diff.stepGapMs
      })

      if (round.decoys.length) {
        this._mgTimeout(() => {
          if (this.state !== 'minigame') return
          for (const d of round.decoys) this.scene.setWindowState(d, WINDOW_STATES.DECOY_BLUE)
          this.ui.toast('小心蓝色熬夜干扰灯，不需要记住它！', '')
        }, delay)
        this._mgTimeout(() => {
          if (this.state !== 'minigame') return
          for (const d of round.decoys) this.scene.setWindowState(d, WINDOW_STATES.DARK)
        }, delay + 650)
        delay += 750
      }

      this._mgTimeout(() => {
        if (this.state !== 'minigame' || !this.mg) return
        this.mg.phase = 'recall'
        this.ui.updateMinigameHud({
          phaseText: '✨ 按顺序依次点亮！',
          bottomText: `第 ${stage} 关：请按刚才亮起的先后顺序点出这 ${round.targets.length} 扇窗`
        })
      }, delay + 120)
    } else {
      // memory_snapshot: all flash together
      this._mgTimeout(() => {
        if (this.state !== 'minigame') return
        for (const t of round.targets) this.scene.setWindowState(t, WINDOW_STATES.TARGET_HINT)
        for (const d of round.decoys) this.scene.setWindowState(d, WINDOW_STATES.DECOY_BLUE)
        if (this.audio) this.audio.cue(2)
      }, 450)

      const holdMs = diff.snapshotShowMs + obsBoost
      this._mgTimeout(() => {
        if (this.state !== 'minigame' || !this.mg) return
        this.scene.resetWindows()
        this.mg.phase = 'recall'
        this.ui.updateMinigameHud({
          phaseText: `✨ 找出 ${round.targets.length} 扇窗！`,
          bottomText: `第 ${stage} 关：位置不分先后，把刚才暖金亮过的 ${round.targets.length} 扇窗点亮！`
        })
      }, 450 + holdMs)
    }
  }

  _handleMemoryTap(w, x, y) {
    const mg = this.mg
    if (!mg) return
    if (mg.phase === 'observe') {
      this.ui.toast('别急，先看完灯光演示再动手～', '')
      return
    }
    if (mg.phase !== 'recall' || !mg.memState) return

    const res = stepMemoryTap(mg.memState, w.idx)
    if (res.outcome === 'ignored' || res.outcome === 'duplicate') return
    if (this.difficulty) this.difficulty.recordTap(res.outcome === 'correct', 0, false)

    let shieldSaved = false
    if (res.outcome === 'correct') {
      mg.correctCount += 1
      mg.combo += 1
      mg.litHistory.add(w.roomId)
      const mult = mg.scoreMult || 1
      const stepGain = Math.round((20 + mg.stage * 6 + Math.min(24, mg.combo * 3)) * mult)
      mg.score += stepGain
      this.scene.setWindowState(w, WINDOW_STATES.CORRECT_GREEN)
      this.scene.burstAt(w, 0x76e8a6)
      if (this.audio) this.audio.correct(res.progress)
      this.ui.floatText('+' + stepGain, x, y, '#92f4bc', 'big')
      this.ui.shockwave(x, y)
    } else {
      mg.combo = 0
      if (mg.shield > 0) {
        shieldSaved = true
        mg.shield -= 1
        mg.memState.wrongClicks = Math.max(0, mg.memState.wrongClicks - 1)
        mg.memState.finished = false
      } else {
        mg.totalMistakes += 1
      }
      this.scene.setWindowState(w, WINDOW_STATES.WRONG_AMBER)
      if (this.audio) this.audio.wrong()
      this.ui.floatText(shieldSaved ? '护盾免错!' : '点错啦', x, y, '#ff9d7a')
      this._mgTimeout(() => {
        if (this.state === 'minigame' && w.state === WINDOW_STATES.WRONG_AMBER) {
          this.scene.setWindowState(w, WINDOW_STATES.DARK)
        }
      }, 460)
    }

    const acc = this._calcAcc(mg.correctCount, mg.correctCount + mg.totalMistakes)
    const stageTarget = mg.round ? mg.round.targets.length : 1
    const stageDone = res.progress || 0
    this.ui.updateMinigameHud({
      phaseText: `✨ 复现进度 ${stageDone} / ${stageTarget} 窗`,
      score: mg.score,
      correctCount: mg.correctCount,
      accuracyPct: acc,
      shield: mg.shield
    })

    if (mg.memState.finished) {
      mg.phase = 'settled'
      const stageSum = summarizeMemoryStage(mg.memState)
      const bonus = Math.round(stageSum.scoreGained * (mg.scoreMult || 1))
      mg.score += bonus
      mg.scoreMult = 1

      if (stageSum.passed) {
        if (this.audio) this.audio.victory()
        this.ui.banner(`第 ${mg.stage} 关通过！`, `本关准确率 ${stageSum.accuracyPct}% · +${bonus} 分`)
        if (mg.stage < mg.maxStage) {
          this._maybeRandomEvent()
          this._mgTimeout(() => this._runMemoryStage(mg.stage + 1), 1350)
        } else {
          this._mgTimeout(() => this._finishMinigame(), 1200)
        }
      } else {
        this.ui.banner('巡楼暂停记分', '错步较多，先来结算成绩吧！')
        this._mgTimeout(() => this._finishMinigame(), 1200)
      }
    }
  }

  // ---- ③ Patrol Reflex (查寝夜猫子) ----

  _startPatrolReflex() {
    this._clearMinigame()
    this.state = 'minigame'
    this.scene.setFlyover(false)
    this.scene.setCameraView('front', false)
    this.orbitLocked = true
    this.scene.setOrbitLocked(true)
    this.scene.resetWindows()

    const dorm = dormDef(this.dormId)
    this.mg = {
      kind: 'patrol_reflex',
      stage: 1,
      score: 0,
      correctCount: 0,
      mistakes: 0,
      combo: 0,
      shield: 1,
      litHistory: new Set(),
      startedAt: performance.now(),
      endsAt: performance.now() + PATROL_DURATION_SEC * 1000,
      nextWaveAt: performance.now() + 300,
      lastEventAt: performance.now()
    }

    if (this.audio) this.audio.setSceneContext('patrol_reflex')
    this.ui.startMinigameHud({
      modeMeta: gameModeDef('patrol_reflex'),
      dormMeta: dorm,
      aiPattern: '夜猫子查寝中',
      bgmState: this.getBgmState(),
      onCycleBgm: () => this.cycleBgmTrack(),
      orbitLocked: this.orbitLocked,
      onToggleOrbit: () => this.toggleOrbitLock(),
      onResetView: () => this.resetFrontView(),
      muted: this.audio ? this.audio.muted : false,
      onMute: () => this.toggleMute(),
      onViewCycle: () => this._cycleCameraView(),
      onExit: () => this.showHub()
    })
    this.ui.updateMinigameHud({
      phaseText: '🔦 灭蓝灯 · 留暖灯 · 助晚归',
      timeLeftSec: PATROL_DURATION_SEC,
      bottomText: '过关目标：守住 45s！点灭【蓝紫熬夜窗】、点亮【淡金晚归门灯】，别误点【浅绿学习灯】'
    })

    const loop = () => {
      if (this.state !== 'minigame' || !this.mg || this.mg.kind !== 'patrol_reflex') return
      const now = performance.now()
      const left = Math.max(0, (this.mg.endsAt - now) / 1000)
      const elapsed = PATROL_DURATION_SEC - left
      const waveCfg = patrolWaveConfig(elapsed)

      // Expire old targets
      for (const w of this.scene.windows) {
        if (w.state !== WINDOW_STATES.DARK && w.expiresAt && now > w.expiresAt) {
          this.scene.setWindowState(w, WINDOW_STATES.DARK)
          w.expiresAt = 0
        }
      }

      if (now >= this.mg.nextWaveAt) {
        const picked = pickPatrolSpawn(this.scene.windows)
        if (picked) {
          const targetWin = this.scene.windows[picked.idx]
          if (targetWin) {
            this.scene.setWindowState(targetWin, picked.state)
            targetWin.expiresAt = now + waveCfg.ttlMs
          }
        }
        this.mg.nextWaveAt = now + waveCfg.spawnIntervalMs
      }

      if (now - this.mg.lastEventAt > 12500) {
        this.mg.lastEventAt = now
        this._maybeRandomEvent()
      }

      this.mg.stage = elapsed > 30 ? 3 : elapsed > 15 ? 2 : 1
      this.ui.updateMinigameHud({
        stage: this.mg.stage,
        timeLeftSec: left,
        score: this.mg.score,
        correctCount: this.mg.correctCount,
        accuracyPct: this._calcAcc(this.mg.correctCount, this.mg.correctCount + this.mg.mistakes),
        shield: this.mg.shield
      })

      if (left <= 0) {
        this._finishMinigame()
        return
      }
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  _handlePatrolTap(w, x, y) {
    const mg = this.mg
    if (!mg) return
    const res = resolvePatrolTap(w.state, mg.combo)
    if (res.result === 'empty') return
    if (this.difficulty) this.difficulty.recordTap(res.correctDelta > 0, 0, false)

    if (res.correctDelta > 0) {
      mg.combo = res.combo
      mg.score += Math.round(res.scoreDelta * (mg.scoreMult || 1))
      mg.correctCount += res.correctDelta
      mg.litHistory.add(w.roomId)
      this.scene.setWindowState(w, res.nextState)
      w.expiresAt = 0
      this.scene.burstAt(w, 0xffe49a)
      if (this.audio) this.audio.correct(mg.combo)
      this.ui.floatText(res.callout + ' +' + res.scoreDelta, x, y, '#92f4bc', 'big')
    } else {
      if (mg.shield > 0) {
        mg.shield -= 1
        this.ui.floatText('护盾抵消误触!', x, y, '#ffd08a')
      } else {
        mg.mistakes += res.mistakeDelta
        mg.combo = 0
        this.ui.floatText(res.callout, x, y, '#ff9878')
      }
      if (this.audio) this.audio.wrong()
      w.expiresAt = 0
    }
  }

  // ---- ④ Lights-Out Puzzle (全楼归眠) ----

  _startLightsOutPuzzle() {
    this._clearMinigame()
    this.state = 'minigame'
    this.scene.setFlyover(false)
    this.scene.setCameraView('front', false)
    this.orbitLocked = true
    this.scene.setOrbitLocked(true)
    this.scene.resetWindows()

    const dorm = dormDef(this.dormId)
    const board = generateSolvableBoard(dorm.rows, dorm.cols, 1)
    this.mg = {
      kind: 'lights_out_puzzle',
      stage: 1,
      maxStage: 5,
      score: 0,
      correctCount: 0,
      moves: 0,
      shield: 2,
      litHistory: new Set(),
      grid: board.grid,
      parMoves: board.parMoves,
      rows: dorm.rows,
      cols: dorm.cols
    }

    if (this.audio) this.audio.setSceneContext('lights_out_puzzle')
    this.ui.startMinigameHud({
      modeMeta: gameModeDef('lights_out_puzzle'),
      dormMeta: dorm,
      aiPattern: 'GF(2) 熄灯棋盘',
      bgmState: this.getBgmState(),
      onCycleBgm: () => this.cycleBgmTrack(),
      orbitLocked: this.orbitLocked,
      onToggleOrbit: () => this.toggleOrbitLock(),
      onResetView: () => this.resetFrontView(),
      showHintBtn: true,
      onHint: () => this._hintLightsOut(),
      muted: this.audio ? this.audio.muted : false,
      onMute: () => this.toggleMute(),
      onViewCycle: () => this._cycleCameraView(),
      onExit: () => this.showHub()
    })

    this._paintLightsOutBoard()
  }

  _paintLightsOutBoard() {
    const mg = this.mg
    if (!mg) return
    let litTotal = 0
    for (let i = 0; i < mg.grid.length; i++) {
      if (mg.grid[i]) litTotal += 1
      this.scene.setWindowState(i, mg.grid[i] ? WINDOW_STATES.LIT : WINDOW_STATES.DARK)
    }
    this.scene.setLitCount(litTotal)
    this.ui.updateMinigameHud({
      stage: mg.stage,
      phaseText: `剩余 ${litTotal} 盏灯待熄灭`,
      score: mg.score,
      correctCount: mg.correctCount,
      accuracyPct: 100,
      shield: mg.shield,
      bottomText: `第 ${mg.stage} 关（已走 ${mg.moves} 步 · 标准 ${mg.parMoves || 3} 步）：点一扇窗翻转十字四邻，让全楼熄灭入睡！`
    })
  }

  _hintLightsOut() {
    const mg = this.mg
    if (!mg || mg.kind !== 'lights_out_puzzle') return
    const sol = solveLightsOutGF2(mg.grid, mg.rows, mg.cols)
    if (!sol || !sol.length) {
      this.ui.toast('当前棋盘已接近终点或正在结算', '')
      return
    }
    const idx = sol[0]
    const w = this.scene.windows[idx]
    if (w) {
      this.scene.setWindowState(w, WINDOW_STATES.TARGET_HINT)
      const pos = this.scene.windowScreenPos(w)
      if (pos) {
        this.ui.coach('林阿姨提示：点这扇窗！', pos.x, pos.y - 46)
        this._mgTimeout(() => this.ui.hideCoach(), 2400)
      }
      if (this.audio) this.audio.cue(0)
    }
  }

  _handleLightsOutTap(w, x, y) {
    const mg = this.mg
    if (!mg || mg.kind !== 'lights_out_puzzle') return
    this.ui.hideCoach()
    mg.moves += 1
    if (this.difficulty) this.difficulty.recordTap(true, 0, false)
    mg.litHistory.add(w.roomId)
    mg.grid = toggleCross(mg.grid, w.idx, mg.rows, mg.cols)
    const flipped = crossIndices(w.idx, mg.rows, mg.cols).length
    if (this.audio) this.audio.tap(mg.moves % 8)
    this.ui.shockwave(x, y)
    this.scene.burstAt(w, 0xffe09c)
    this._paintLightsOutBoard()

    if (isAllLightsOut(mg.grid)) {
      mg.correctCount += mg.rows * mg.cols
      const clearScore = Math.max(80, 260 + mg.stage * 80 - mg.moves * 6)
      mg.score += clearScore
      if (this.audio) this.audio.victory()
      this.ui.banner(`第 ${mg.stage} 关全楼安睡！`, `用时 ${mg.moves} 步 (+${clearScore} 分 · +${flipped} 联动)`)
      if (mg.stage < mg.maxStage) {
        this._maybeRandomEvent()
        mg.stage += 1
        this._mgTimeout(() => {
          if (!this.mg || this.state !== 'minigame') return
          const nextBoard = generateSolvableBoard(mg.rows, mg.cols, mg.stage)
          mg.moves = 0
          mg.grid = nextBoard.grid
          mg.parMoves = nextBoard.parMoves
          this._paintLightsOutBoard()
        }, 1250)
      } else {
        this._mgTimeout(() => this._finishMinigame(), 1200)
      }
    }
  }

  // ---- Random Events & Shared Minigame Settlement ----

  _maybeRandomEvent() {
    const mg = this.mg
    if (!mg) return
    const ev = pickRandomEvent(mg.shield)
    if (!ev) return
    this.scene.setNpcActor(ev.speakerId)
    if (ev.effect === 'heal_shield') mg.shield += 1
    else if (ev.effect === 'score_mult_1_5') mg.scoreMult = 1.5
    else if (ev.effect === 'bonus_120') mg.score += 120
    else if (ev.effect === 'bonus_80') mg.score += 80
    else if (ev.effect === 'combo_plus_2') mg.combo += 2
    else if (ev.effect === 'extra_observe_ms') mg.extraObserveMs = (mg.extraObserveMs || 0) + 700
    else if (ev.effect === 'extra_recall_sec' && mg.endsAt) mg.endsAt += 5000
    else if (ev.effect === 'auto_reveal_one') mg.shield += 1
    this.ui.toast(`随机事件 · ${ev.title} (${ev.badge})`, ev.line)
    if (this.audio) this.audio.resonance()
  }

  _calcAcc(good, total) {
    if (!total) return 100
    return Math.max(0, Math.min(100, Math.round((good / total) * 100)))
  }

  _cycleCameraView() {
    const idx = CAMERA_VIEW_IDS.indexOf(this.viewId)
    const next = CAMERA_VIEW_IDS[(idx + 1) % CAMERA_VIEW_IDS.length]
    this.changeView(next)
  }

  async _finishMinigame() {
    const mg = this.mg
    if (!mg || mg.settled) return
    mg.settled = true
    this.state = 'done'
    this._clearMinigame()

    const denom = (mg.totalExpected || mg.correctCount) + (mg.totalMistakes || mg.mistakes || 0)
    const accuracyPct = mg.kind === 'lights_out_puzzle' ? 100 : this._calcAcc(mg.correctCount, denom)
    const summary = {
      gameMode: mg.kind,
      dormType: this.dormId,
      season: this.season,
      weather: this.weather,
      stageReached: mg.stage || 1,
      correctCount: mg.correctCount || 0,
      accuracyPct,
      score: Math.max(10, Math.round(mg.score || 0)),
      litTotal: mg.litHistory ? mg.litHistory.size : 0,
      litRoomIds: mg.litHistory ? Array.from(mg.litHistory) : []
    }

    this.ui.showLoading('校领导与 AI 巡查员正在填写夜巡报告')
    const [debriefRes, synced, postcard] = await Promise.all([
      this.ai.requestInspectorDebrief({ ...summary, playerNick: this.nickname }).catch(() => null),
      syncRun(summary, { uid: this.records.uid, nickname: this.nickname }).catch(() => null),
      drawPostcard({ run: summary, nights: [], records: this.records, ending: endingMeta('ENDING_A_WARMTH') }).catch(() => '')
    ])

    if (debriefRes && debriefRes.source) this.aiSource = debriefRes.source
    const debrief = debriefRes?.payload || {
      rankTitle: '细心夜巡员',
      auntComment: `${dormDef(this.dormId).shortName}巡查完成，准确率 ${accuracyPct}%。`,
      deanComment: '周副校长在登记本上点了个赞。',
      sleepTip: '桌边暖灯只留一盏，今晚早些安眠。'
    }

    let boardData = null
    if (synced && synced.player) {
      this.records = mergeRunAdopted(this.records, synced.player)
      saveRecords(this.records)
      boardData = await fetchLeaderboardWithRank({
        scope: 'all', limit: 10, mode: summary.gameMode, dormType: summary.dormType, uid: this.records.uid
      }).catch(() => null)
    }

    this.ui.showMinigameResult({
      modeMeta: gameModeDef(summary.gameMode),
      dormMeta: dormDef(summary.dormType),
      summary,
      debrief,
      aiSource: this.aiSource,
      postcard,
      rank: synced ? synced.rank : 0,
      myRank: boardData ? boardData.myRank : null,
      nickname: this.nickname,
      onNicknameChange: name => this._setNickname(name),
      onReplay: () => this.launchGame(summary.gameMode),
      onLeaderboard: () => this.openLeaderboard(() => this.showHub(), summary.gameMode),
      onHub: () => this.showHub()
    })
  }

  // ---------------------------------------------------------------- v3 Star-Sweep Campaign (preserved)

  async start() {
    if (this.audio) this.audio.unlock()
    this._clearMinigame()
    this.state = 'prologue'
    this.scene.setFlyover(false)
    this.scene.setOrbitLocked(false)
    this.run = this._emptyRun()
    this.ui.showPrologue({
      records: this.records,
      onChoose: mood => this._beginWithMood(mood)
    })
  }

  async _beginWithMood(mood) {
    this.moodToken = mood
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
      this.directorNote = '23:17，封存十一年前的零号副线自己通电了。在总闸落锁之前，沿着亮起的窗找到答案。'
      planPromise.then(res => {
        if (!res || !res.payload) return
        if (this.state !== 'night' && this.state !== 'paused' && this.state !== 'chapter') return
        for (let i = this.nightIndex + 1; i < NIGHT_COUNT; i++) {
          if (res.payload.nights[i]) this.nights[i] = res.payload.nights[i]
        }
        this.aiSource = res.source
      }).catch(() => {})
    }

    this._showChapterAndLaunch(0)
  }

  _showChapterAndLaunch(index) {
    const rawNight = this.nights[index] || this.nights[NIGHT_COUNT - 1]
    const dorm = dormDef(this.dormId)
    const commissions = adaptCommissionsForDorm(rawNight.commissions, this.dormId)
    const chapter = chapterMeta(index)
    this.state = 'chapter'
    if (this.audio) this.audio.setSceneContext('story' + (index + 1))
    this.ui.showChapterOpener({
      chapter,
      dormMeta: dorm,
      commissions,
      bgmState: this.getBgmState(),
      onCycleBgm: () => this.cycleBgmTrack(),
      onStart: () => this._launchNight(index),
      onBack: () => this.showHub()
    })
  }

  _launchNight(index) {
    const raw = this.nights[index] || this.nights[NIGHT_COUNT - 1]
    const data = {
      ...JSON.parse(JSON.stringify(raw)),
      commissions: adaptCommissionsForDorm(raw.commissions, this.dormId),
      resonancePair: adaptResonancePairForDorm(raw.resonancePair, this.dormId)
    }
    this.nightIndex = index
    this.state = 'night'
    this._choiceOpen = false
    this._choicePausedAt = 0
    this.ui.hideAll()

    this.scene.resetWindows()
    this.scene.setCameraView('front', false)
    this.orbitLocked = true
    this.scene.setOrbitLocked(true)
    this.scene.setPaused(false)
    const palette = PALETTES[data.palette] ? data.palette : 'warm_blue'
    this.scene.applyTheme(palette)
    this.scene.setWeatherFx(data.weather)
    if (this.audio) {
      this.audio.setSceneContext('story' + (index + 1))
      this.audio.setWeather(data.weather)
      this.audio.setTempo(data.tempo)
      this.audio.setLitCount(0)
      this.audio.nightStart(index)
    }

    const now = performance.now()
    const cfg = tempoConfig(data.tempo)
    this.night = {
      index, data, cfg, startedAt: now, endsAt: now + NIGHT_SECONDS * 1000, timeLeft: NIGHT_SECONDS,
      warmth: 0, combo: 0, maxCombo: 0, litCount: 0, litRooms: [], resonanceCount: 0,
      storyChoices: 0, bestChain: 0, bondRooms: [], stamped: [], minPassed: false, allDone: false,
      chain: { active: false, count: 0, ids: new Set(), startRoom: 0 },
      nextSpawnAt: now + 400,
      beaconAt: (STORY_BEACON_SCHEDULE[index] || []).slice(),
      resonanceAt: (RESONANCE_SCHEDULE[index] || []).slice(),
      evolveFired: false, allLit: false, encore: false, ended: false, choices: [],
      clearedFloors: new Set()
    }
    this._surprise = { lastAt: -9000, sinceRare: 0 }
    this._chain = this.night.chain
    this._comboFreezeUntil = 0
    this._pendingRes = null

    this.difficulty.reset()
    this.crisis.reset({ availableRooms: this.scene.windows.map(w => w.roomId) })
    this.replay.reset()

    for (let i = 0; i < cfg.initialGlimmer; i++) this._wakeRandom(false)

    this.ui.startNight({
      night: data, index, count: NIGHT_COUNT, commissions: data.commissions,
      directorNote: this.directorNote, totalWindows: this.scene.windows.length || dormDef(this.dormId).windowCount,
      dormMeta: dormDef(this.dormId),
      bgmState: this.getBgmState(),
      onCycleBgm: () => this.cycleBgmTrack(),
      orbitLocked: this.orbitLocked,
      onToggleOrbit: () => this.toggleOrbitLock(),
      onResetView: () => this.resetFrontView(),
      onAdvanceNight: () => this.advanceNightEarly(),
      onPause: () => this.togglePause(), onMute: () => this.toggleMute(),
      muted: this.audio ? this.audio.muted : false,
      onPingCommission: c => this.pingCommission(c),
      onReplayTutorial: () => this.replayTutorial()
    })
    this._checkCommissions()
    if (!this.tutorial.isCompleted()) {
      this._startTutorial()
    } else {
      this._showCoachIfNeeded()
    }
    this._startTicker()
  }

  _showCoachIfNeeded() {
    cancelAnimationFrame(this._coachRaf)
    if (this.nightIndex !== 0) return
    const startedAt = performance.now()
    const track = () => {
      if (this.state !== 'night' || this.nightIndex !== 0 || !this.night) {
        this.ui.hideCoach()
        return
      }
      if (this.night.litCount > 0 || performance.now() - startedAt > 9000) {
        this.ui.hideCoach()
        return
      }
      const w = this.scene.actionableWindows()[0]
      if (w) {
        const rect = this.scene.windowScreenRect(w)
        if (rect) {
          const diam = Math.round(Math.max(54, Math.max(rect.w, rect.h) + 18))
          this.ui.coach('点亮或按住拖过发光窗', rect.x, rect.y, diam)
        }
      }
      this._coachRaf = requestAnimationFrame(track)
    }
    this._coachRaf = requestAnimationFrame(track)
  }

  _startTutorial() {
    this._tutorialActive = true
    this.tutorial.start(true)
    this._setupTutorialStep(this.tutorial.getState())
  }

  _onTutorialStateChange(nextState, prevState) {
    if (nextState === TUTORIAL_STATES.DONE) {
      this._tutorialActive = false
      this.ui.hideTutorialOverlay()
      this.ui.toast('太棒了！已掌握夜巡基本功', '现在开始自由点亮夜晚')
      if (this.night) {
        const now = performance.now()
        this.night.startedAt = now
        this.night.endsAt = now + NIGHT_SECONDS * 1000
        this.night.timeLeft = NIGHT_SECONDS
      }
      if (this._pendingModeLaunch) {
        const mode = this._pendingModeLaunch
        this._pendingModeLaunch = null
        this.launchGame(mode)
      }
    } else {
      this._setupTutorialStep(nextState)
    }
  }

  _setupTutorialStep(step) {
    if (!this.night) return
    this.scene.resetWindows()
    this.scene.clearResonancePair()

    if (step === TUTORIAL_STATES.STEP1_TAP) {
      const w = this.scene.windows[0] || this.scene.windows.find(x => CORE_RESIDENT_ROOMS.includes(x.roomId))
      if (w) {
        this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
        w.expiresAt = Infinity
        this._tutorialTargetRooms = [w.roomId]
      }
      this.ui.showTutorialOverlay({
        step,
        title: '点一下点亮微光窗',
        desc: '轻触发光的窗户，让暖意充满房间',
        onSkip: () => this.skipTutorial()
      })
    } else if (step === TUTORIAL_STATES.STEP2_DRAG) {
      const def = dormDef(this.dormId)
      const targetRow = Math.min(1, def.rows - 1)
      const rowWins = this.scene.windows.filter(w => w.r === targetRow).sort((a, b) => a.c - b.c)
      const wins3 = rowWins.slice(0, 3)
      for (const w of wins3) {
        this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
        w.expiresAt = Infinity
      }
      this._tutorialTargetRooms = wins3.map(w => w.roomId)
      this.ui.showTutorialOverlay({
        step,
        title: '按住顺滑拖连 3 窗',
        desc: '按住鼠标左键或手指，从 ① 连续滑过 ② 到 ③',
        onSkip: () => this.skipTutorial()
      })
      this.ui.showHintBubble('[data-orbitbadge]', '🔒 固定连窗', '当前为固定连窗，右键/双指可微调视角', 3800)
    } else if (step === TUTORIAL_STATES.STEP3_BRIDGE) {
      const wA = this.scene.windows[0]
      const wB = this.scene.windows[this.scene.windows.length - 1]
      if (wA && wB) {
        this.scene.setResonancePair(wA.roomId, wB.roomId)
        this._tutorialTargetRooms = [wA.roomId, wB.roomId]
      }
      this.ui.showTutorialOverlay({
        step,
        title: '连接青色星桥',
        desc: '星轨连窗！拖连或依次点按两扇带有星桥标记的窗户',
        onSkip: () => this.skipTutorial()
      })
    }
  }

  skipTutorial() {
    this.tutorial.skip()
  }

  replayTutorial() {
    this._tutorialActive = true
    this.tutorial.replay()
    this._setupTutorialStep(this.tutorial.getState())
  }

  pingCommission(c) {
    if (!c || !this.scene) return
    if (c.type === 'row_lit' || c.floor) {
      const f = Number(c.floor) || 3
      this.scene.pingFloor(f)
      this.ui.toast(`正在定位 ${f}F 整层窗户`, '完成整层点亮即可盖章')
    } else if (c.roomId || c.room) {
      const r = Number(c.roomId || c.room)
      this.scene.pingRoom(r)
      this.ui.toast(`正在定位 ${r} 室`, '按手账指引点亮目标')
    } else if (c.type === 'resonance') {
      const pair = this.scene.resonancePair
      if (pair) {
        this.scene.pingRoom(pair.a)
        this.scene.pingRoom(pair.b)
        this.ui.toast(`正在定位星桥 ${pair.a} 与 ${pair.b} 室`, '拖划或点按两扇青色星桥窗')
      } else {
        const act = this.scene.actionableWindows()
        if (act.length > 0) this.scene.pingRoom(act[0].roomId)
        this.ui.toast('等待星轨出现', '出现时将在楼面连起青色虚线')
      }
    } else if (c.type === 'story_choice') {
      const beacon = this.scene.windows.find(w => w.state === WINDOW_STATES.STORY_BEACON)
      if (beacon) {
        this.scene.pingRoom(beacon.roomId)
        this.ui.toast(`正在定位剧情信标 ${beacon.roomId} 室`, '点亮即可聆听今夜故事')
      } else {
        const act = this.scene.actionableWindows()
        if (act.length > 0) this.scene.pingRoom(act[0].roomId)
        this.ui.toast('剧情信标稍后点亮', '留意楼面上的橙红信标')
      }
    } else {
      const act = this.scene.actionableWindows()
      if (act.length > 0) {
        this.scene.pingRoom(act[0].roomId)
        this.ui.toast('已为您高亮目标窗', '快速点亮或连划')
      }
    }
  }

  _wakeRandom(respectCap = true) {
    const n = this.night
    if (!n) return null
    if (respectCap && actionableCount(this.scene.windows) >= n.cfg.maxGlimmer) return null
    const w = /** @type {any} */ (pickNextGlimmerWindow(this.scene.windows, CORE_RESIDENT_ROOMS))
    if (!w) return null
    this.scene.setWindowState(w, WINDOW_STATES.GLIMMER)
    const ddaScales = this.difficulty ? this.difficulty.getScales() : { glimmerDurationScale: 1.0 }
    w.expiresAt = performance.now() + (n.cfg.glimmerDurationMs * (ddaScales.glimmerDurationScale || 1.0))
    return w
  }

  _scheduleSpawns(now) {
    const n = this.night
    const total = this.scene.windows.length || 24
    if (!n || n.ended) return
    if (actionableCount(this.scene.windows) < MIN_ACTIONABLE_GLIMMER && n.litCount < total) {
      this._wakeRandom(false)
      n.nextSpawnAt = now + 200
      return
    }
    if (now >= n.nextSpawnAt) {
      this._wakeRandom(true)
      const ddaScales = this.difficulty ? this.difficulty.getScales() : { spawnIntervalScale: 1.0 }
      n.nextSpawnAt = now + (n.cfg.spawnIntervalMs * (ddaScales.spawnIntervalScale || 1.0)) * (0.85 + Math.random() * 0.3)
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
    const dormCore = dormDef(this.dormId).coreRooms || CORE_RESIDENT_ROOMS
    const pool = this.scene.windows.filter(w => (dormCore.includes(w.roomId) || CORE_RESIDENT_ROOMS.includes(w.roomId)) && w.state === WINDOW_STATES.DARK)
    const target = pool[0] || this.scene.windows.find(w => w.state === WINDOW_STATES.DARK)
    if (!target) return
    this.scene.setWindowState(target, WINDOW_STATES.STORY_BEACON)
    target.expiresAt = performance.now() + 14000
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
    if (!wa || !wb || wa.state === WINDOW_STATES.LIT || wb.state === WINDOW_STATES.LIT) return
    this.scene.setResonancePair(a, b)
    this.night.resonanceLine = pair.line
    this.ui.toast('星轨出现了 · 从一个窗划向另一个', '')
  }

  // ------------------------------------------------------------------- unified pointer & tap

  tap(w, x, y) {
    if (this.state === 'minigame' && this.mg) {
      if (this.mg.kind === 'memory_sequence' || this.mg.kind === 'memory_snapshot') {
        this._handleMemoryTap(w, x, y)
      } else if (this.mg.kind === 'patrol_reflex') {
        this._handlePatrolTap(w, x, y)
      } else if (this.mg.kind === 'lights_out_puzzle') {
        this._handleLightsOutTap(w, x, y)
      }
      return
    }

    if (this.state !== 'night' || !this.night || this._choiceOpen) return
    const n = this.night
    const now = performance.now()
    const comboAlive = now - this._lastTap < n.cfg.comboWindowMs && now > this._comboFreezeUntil
    if (!comboAlive && n.combo > 0) { n.combo = 0; this.ui.combo(0) }
    this._lastTap = now

    // P2: C2 Night Patrol Crisis resolution check
    if (this.crisis && this.crisis.getActiveCrisis()) {
      const crisisRes = this.crisis.onTap(w.roomId)
      if (crisisRes) {
        if (crisisRes.resolved) {
          n.warmth += crisisRes.bonusWarmth
          this.run.totalWarmth += crisisRes.bonusWarmth
          this.ui.hideCrisisPrompt()
          this.ui.banner('🎉 ' + crisisRes.title + ' 顺利解决！', '夜巡排障 · 温暖 +' + crisisRes.bonusWarmth)
          this.ui.floatText('+' + crisisRes.bonusWarmth + ' 🌟', x, y, '#ffd700', 'big')
          if (this.audio) (typeof this.audio.correct === 'function' ? this.audio.correct() : this.audio.tap(5))
          this.scene.burstAt(w, 0xffd700)
          if (this.replay) this.replay.record(now - n.startedAt, REPLAY_EVENT_TYPES.CRISIS, w.idx, x, y, w.roomId)
          this._afterScore()
          return
        } else {
          this.ui.updateCrisisPrompt(this.crisis.getActiveCrisis())
          this.scene.burstAt(w, 0xffa050)
          if (this.audio) this.audio.tap(crisisRes.currentTaps || 1)
          return
        }
      }
    }

    if (w.state === WINDOW_STATES.LIT) {
      if (this.difficulty) this.difficulty.recordTap(true, 0, false)
      n.combo += 1; n.maxCombo = Math.max(n.maxCombo, n.combo); this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
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
      if (this.difficulty) this.difficulty.recordTap(false, 0, false)
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

    if (w.state === WINDOW_STATES.RESONANCE_PAIR) {
      const pair = this.scene.resonancePair
      if (this._pendingRes && pair) {
        const partner = pair.a === this._pendingRes.room ? pair.b : pair.a
        if (w.roomId === partner) {
          this._pendingRes = null
          this._completeResonance(pair, x, y)
          return
        }
      }
      const otherRoom = pair ? (pair.a === w.roomId ? pair.b : pair.a) : 0
      this._pendingRes = { room: w.roomId, idx: w.idx, x, y, armedAt: now }
      n.chain.active = true; n.chain.ids = new Set([w.idx]); n.chain.count = 1; n.chain.startRoom = w.roomId
      this.scene.burstAt(w, 0x8ef2ff)
      this.ui.shockwave(x, y)
      this.ui.toast(`已锁定 ${w.roomId} 室星轨！拖到或直接点击 ${otherRoom || '另一扇'} 室连桥`, '')
      return
    }

    const wasBeacon = w.state === WINDOW_STATES.STORY_BEACON
    if (this.difficulty) this.difficulty.recordTap(true, 0, false)
    n.combo += 1; n.maxCombo = Math.max(n.maxCombo, n.combo); this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
    const gain = wasBeacon ? STORY_BEACON_GAIN : gainForCombo(n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, x, y)
    if (this.tutorial && this.tutorial.isActive()) {
      this.tutorial.onTap(w)
    }
    if (this.audio) this.audio.tap(n.combo)
    this.ui.combo(n.combo)
    this.scene.pulseCameraFov(n.combo >= 8 ? 0.8 : 0.35)
    this.ui.shockwave(x, y)
    if (wasBeacon) this._openChoice(w.roomId)
    this._maybeSurprise(w, now)
    this._afterScore()
  }

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

      // C3 Floor Clear check
      const floor = Math.floor(w.roomId / 100)
      if (floor >= 1 && (!n.clearedFloors || !n.clearedFloors.has(floor))) {
        if (!n.clearedFloors) n.clearedFloors = new Set()
        const dormDefObj = dormDef(this.dormId)
        const cols = dormDefObj ? dormDefObj.cols : 6
        if (floorCleared(this.scene.windows, floor, cols)) {
          n.clearedFloors.add(floor)
          n.warmth += 18
          this.run.totalWarmth += 18
          if (this.scene && typeof this.scene.sweepFloor === 'function') {
            this.scene.sweepFloor(w.r ?? (floor - 1))
          }
          if (this.audio && typeof this.audio.floorClear === 'function') {
            this.audio.floorClear()
          }
          this.ui.banner('🌟 ' + floor + 'F 整层制霸！', '整层宿舍彻夜明亮 · 温暖 +18')
          this.ui.floatText('+18 👑', x, y - 28, '#ffd700', 'big')
          if (this.replay) {
            this.replay.record(performance.now() - n.startedAt, 'floor_clear', w.idx, x, y, w.roomId)
          }
        }
      }

      // C5 Replay recording
      if (this.replay) {
        this.replay.record(performance.now() - n.startedAt, REPLAY_EVENT_TYPES.LIT, w.idx, x, y, w.roomId)
      }
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
    const total = this.scene.windows.length || 24
    if (!n) return
    this._checkCommissions()
    this.ui.setStats(this)
    if (n.litCount >= total && !n.allLit) this._allLit()
  }

  onPointerDown(x, y) {
    if (this.state !== 'night' || !this.night || this._choiceOpen) return
    const n = this.night
    n.chain.active = true
    if (!n.chain.ids.size) {
      const w = this.scene.windowAt(x, y, 28)
      if (w) { n.chain.ids = new Set([w.idx]); n.chain.count = 1; n.chain.startRoom = w.roomId }
    }
    if (this.ribbon) { this.ribbon.start(x, y); this.ribbon.setMagnets(this.scene.magnetPoints()) }
  }

  onPointerMove(x, y, dragging) {
    if (this.ribbon) this.ribbon.push(x, y, dragging && this.state === 'night')
    if (!dragging || this.state !== 'night' || !this.night || this._choiceOpen) return
    this._dragPass(x, y)
  }

  onPointerUp(x, y) {
    if (this.ribbon) { this.ribbon.end(); this.ribbon.setMagnets(null) }
    const n = this.night
    const total = this.scene.windows.length || 24
    if (!n) return
    // Keep _pendingRes armed for 6s so players can EITHER hold-drag OR tap window A then tap window B!
    if (this._pendingRes && performance.now() - (this._pendingRes.armedAt || 0) > 6000) {
      this._resolvePendingResonanceTap()
    }
    if (n.chain.count >= 3 && this.state === 'night') {
      this.ui.banner('一笔连光 ×' + n.chain.count, '整面墙都在回应你')
      if (this.audio) this.audio.chain(n.chain.count)
      n.warmth += 6
      const free = this._neighbourOf(n.chain.ids)
      if (free) { this.scene.setWindowState(free, WINDOW_STATES.LIT); this.scene.burstAt(free); free.expiresAt = 0 }
      n.litCount = this.scene.windows.filter(w => w.state === WINDOW_STATES.LIT).length
      this.scene.setLitCount(n.litCount)
      if (this.audio) this.audio.setLitCount(n.litCount)
      this.ui.setStats(this)
      this._checkCommissions()
      if (n.litCount >= total && !n.allLit) this._allLit()
    }
    n.chain.active = false; n.chain.ids = new Set(); n.chain.count = 0
  }

  _resolvePendingResonanceTap() {
    const pending = this._pendingRes
    this._pendingRes = null
    if (!pending) return
    const w = this.scene.windows.find(x => x.roomId === pending.room)
    if (!w || w.state !== WINDOW_STATES.RESONANCE_PAIR) return
    const n = this.night
    n.combo += 1; n.maxCombo = Math.max(n.maxCombo, n.combo)
    const gain = gainForCombo(n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, pending.x, pending.y)
    this._breakResonance(w.roomId)
    if (this.audio) this.audio.tap(n.combo)
    this.ui.combo(n.combo)
    this.ui.shockwave(pending.x, pending.y)
    n.chain.count = 1; n.chain.ids = new Set([w.idx]); n.chain.startRoom = w.roomId
    this._afterScore()
  }

  _dragPass(x, y) {
    const n = this.night
    const w = this.scene.windowAt(x, y, 28)
    if (!w || n.chain.ids.has(w.idx)) return
    const pair = this.scene.resonancePair
    if (pair && w.state === WINDOW_STATES.RESONANCE_PAIR) {
      if (this._pendingRes) {
        const partner = pair.a === this._pendingRes.room ? pair.b : pair.a
        if (w.roomId === partner) {
          this._pendingRes = null; n.chain.ids.add(w.idx); this._completeResonance(pair, x, y); return
        }
      }
      // Arm mid-chain so sweeping across pair.a -> pair.b ALWAYS completes resonance
      this._pendingRes = { room: w.roomId, idx: w.idx, x, y, armedAt: performance.now() }
      n.chain.ids.add(w.idx)
      this.scene.burstAt(w, 0x8ef2ff)
      this.ui.shockwave(x, y)
      return
    }
    if (w.state !== WINDOW_STATES.GLIMMER && w.state !== WINDOW_STATES.STORY_BEACON) return

    n.chain.count += 1; n.chain.ids.add(w.idx); n.bestChain = Math.max(n.bestChain, n.chain.count)
    if (this.difficulty) this.difficulty.recordTap(true, 0, true)
    if (this.replay) this.replay.record(performance.now() - n.startedAt, REPLAY_EVENT_TYPES.CHAIN, w.idx, x, y, w.roomId)
    const wasBeacon = w.state === WINDOW_STATES.STORY_BEACON
    const gain = gainForDragChain(n.combo, n.chain.count)
    n.combo += 1; n.maxCombo = Math.max(n.maxCombo, n.combo); this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
    n.warmth += gain
    this._lightWindow(w, gain, x, y)
    if (this.tutorial && this.tutorial.isActive()) {
      this.tutorial.onTap(w)
    }
    this.ui.combo(n.combo); this.ui.shockwave(x, y)
    if (n.chain.count === 2) this.ui.floatText('连光 2/3 · 再划 1 扇!', x, y - 24, '#ffd48a')
    if (this.ribbon) this.ribbon.pulse(x, y)
    if (this.audio) {
      this.audio.tap(n.combo)
      if (this.audio.chainNote) this.audio.chainNote(n.chain.count)
    }
    if (this.ui && this.ui.showSequenceBadge) {
      this.ui.showSequenceBadge(x, y, n.chain.count)
    }
    if (this.tutorial && this.tutorial.isActive()) {
      this.tutorial.onDrag(n.chain.count)
    }
    if (wasBeacon) this._openChoice(w.roomId)
    if (isChainCallout(n.chain.count)) this.ui.flash('combo')
    this._maybeSurprise(w, performance.now())
    this._afterScore()
  }

  _completeResonance(pair, x, y) {
    const n = this.night
    const wa = this.scene.windows.find(w => w.roomId === pair.a)
    const wb = this.scene.windows.find(w => w.roomId === pair.b)
    if (!wa || !wb) return
    this.scene.clearResonancePair()
    if (this.tutorial && this.tutorial.isActive()) {
      this.tutorial.onResonance()
    }
    this._lightWindow(wa, RESONANCE_GAIN, x, y); this._lightWindow(wb, RESONANCE_GAIN, x, y)
    n.warmth += RESONANCE_GAIN; n.combo += RESONANCE_COMBO_BONUS; n.maxCombo = Math.max(n.maxCombo, n.combo)
    n.resonanceCount += 1; this.run.resonanceCount += 1
    n.bondRooms = uniq([...n.bondRooms, pair.a, pair.b])
    this.ui.banner('跨窗共鸣', n.resonanceLine || pair.a + ' 与 ' + pair.b + ' 的灯接上了')
    if (this.audio) this.audio.resonance()
    this.ui.flash('golden'); this.scene.pulseCameraFov(1.1)
    this._events.resonance = (this._events.resonance || 0) + 1
    if (this.replay) this.replay.record(performance.now() - n.startedAt, REPLAY_EVENT_TYPES.RESONANCE, wa.idx, x, y, wa.roomId)
    const free = this._neighbourOf(new Set([wa.idx, wb.idx]))
    if (free) this.scene.setWindowState(free, WINDOW_STATES.GLIMMER)
    this._afterScore()
  }

  _neighbourOf(used) {
    const candidates = this.scene.windows.filter(w => w.state === WINDOW_STATES.DARK && !used.has(w.idx))
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null
  }

  _openChoice(roomId) {
    const n = this.night
    if (!n || this._choiceOpen) return
    const list = n.data.stories || []
    const story = list.find(s => s.roomId === roomId) || list[(n.storyChoices || 0) % Math.max(1, list.length)]
    if (!story) return
    const resident = RESIDENT_BY_ROOM[story.roomId] || RESIDENT_BY_ROOM[roomId]
    this._choiceOpen = true
    this._choicePausedAt = performance.now()
    this._comboFreezeUntil = this._choicePausedAt + COMBO_FREEZE_MS
    this.ui.combo(n.combo)
    this.ui.showChoice({
      story, resident,
      whisper: this.community.whispers.find(w => w.roomId === story.roomId || w.roomId === roomId) || null,
      onLike: id => this.likeWhisper(id),
      onChoose: choice => this._resolveChoice(story.roomId || roomId, story, choice),
      onTimeout: () => this._resolveChoice(story.roomId || roomId, story, story.choices[0], true)
    })
  }

  _resolveChoice(roomId, story, choice, auto = false) {
    if (!this._choiceOpen) return
    const n = this.night
    this._choiceOpen = false
    if (this._choicePausedAt) {
      const pauseDelta = Math.max(0, performance.now() - this._choicePausedAt)
      this._choicePausedAt = 0
      n.endsAt += pauseDelta
      n.startedAt += pauseDelta
      for (const w of this.scene.windows) if (w.expiresAt) w.expiresAt += pauseDelta
    }
    this.ui.hideChoice()
    const resident = RESIDENT_BY_ROOM[roomId]
    n.storyChoices += 1; n.warmth += 6; n.bondRooms = uniq([...n.bondRooms, roomId])
    this.run.choices.push({ roomId, choiceId: choice.id, label: choice.label, outcome: choice.outcome, night: n.index + 1 })
    this.run.path = choice.id
    if (!this.run.residentsAwoken.includes(roomId)) this.run.residentsAwoken.push(roomId)
    if (resident) {
      this.run.items.push(resident.item)
      const key = String(roomId)
      this.run.residentBonds[key] = bumpBond(this.run.residentBonds[key] || 0)
    }
    this.ui.storyResult({ text: story.text, choiceLabel: choice.label, outcome: choice.outcome, auto: Boolean(auto), icon: story.icon, item: story.item })
    if (this.audio) this.audio.stamp()
    this._checkCommissions()
    this.ui.setStats(this)
  }

  _checkCommissions() {
    const n = this.night
    if (!n) return
    const wasPassed = n.minPassed
    const out = evaluateCommissions(n.data.commissions || [], {
      litCount: n.litCount, maxCombo: n.maxCombo, bestChain: n.bestChain,
      resonanceCount: n.resonanceCount, storyChoices: n.storyChoices,
      bondRooms: n.bondRooms.length, litRooms: n.litRooms, stamped: n.stamped,
      dormCols: dormDef(this.dormId).cols
    })
    for (const id of out.newlyStamped) {
      n.stamped.push(id); n.warmth += COMMISSION_BONUS; this.run.stampsEarned += 1
      const item = out.items.find(i => i.id === id)
      this.ui.stampCommission(id, item ? item.label : '')
      if (this.audio) this.audio.stamp()
    }
    const doneCount = out.items.filter(i => i.done).length
    n.minPassed = doneCount >= 1
    n.allDone = out.allDone
    if (!wasPassed && n.minPassed) {
      this.ui.toast('🎉 本夜过关标准已达成！', '可继续冲满章或随时点左下角进下一夜')
    }
    const rowLit = (n.data.commissions || []).find(c => c.type === 'row_lit')
    if (rowLit && this.scene && this.scene.highlightFloorSign) {
      const f = Number(rowLit.floor) || 3
      this.scene.highlightFloorSign(f, true)
    }
    this.ui.updateCommissions(out.items, { minPassed: n.minPassed, allDone: n.allDone, isLastNight: n.index + 1 >= NIGHT_COUNT })
  }

  advanceNightEarly() {
    const n = this.night
    if (!n || n.ended || !n.minPassed) {
      this.ui.toast('还差一点！至少完成手账任意 1 项即可过关', '')
      return
    }
    n.warmth += n.allDone ? 18 : 6
    this._endNight()
  }

  _maybeSurprise(w, now) {
    const n = this.night
    if (!n) return
    const ms = comboMilestone(n.combo)
    if (ms.sound && this.audio) this.audio.tap(n.combo)
    if (ms.chain) { n.warmth += 8; this.ui.flash('combo'); this.ui.toast('光链 ×' + n.combo + ' · 整面墙在回应你', '+8') }
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
    else if (kind === 'golden' || kind === 'chain') this._lightNeighbourRandom(w)
    const text = { golden: '金窗 · 一间屋子忽然全亮了', star: '流星划过 · 许个愿吧', lanterns: '有人放了灯 · 一整排飘起来', cat: '屋顶上蹲着一只猫 · 它看着你', chain: '连光 · 隔壁的窗也亮了' }[kind]
    this.ui.toast(text, '+' + gain)
    this.ui.flash(kind === 'golden' ? 'golden' : 'combo')
    this._afterScore()
  }

  _lightNeighbourRandom(w) {
    const neighbours = this.scene.windows.filter(x => x.state === WINDOW_STATES.DARK && Math.abs(x.idx - w.idx) <= 6)
    if (!neighbours.length) return
    const pick = neighbours[Math.floor(Math.random() * neighbours.length)]
    this.scene.setWindowState(pick, WINDOW_STATES.LIT); this.scene.burstAt(pick)
    this.night.litCount = this.scene.windows.filter(x => x.state === WINDOW_STATES.LIT).length
    if (!this.night.litRooms.includes(pick.roomId)) this.night.litRooms.push(pick.roomId)
    this.scene.setLitCount(this.night.litCount)
    if (this.audio) this.audio.setLitCount(this.night.litCount)
  }

  _allLit() {
    const n = this.night
    if (!n || n.allLit) return
    n.allLit = true; n.warmth += ALL_LIT_BONUS
    this.ui.banner('整栋楼，都亮了', '全楼窗户一起亮着')
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

  _startTicker() {
    cancelAnimationFrame(this._raf)
    const loop = () => {
      if (this.state !== 'night' || !this.night) return
      const now = performance.now()
      const n = this.night
      if (this._choiceOpen) {
        this._raf = requestAnimationFrame(loop)
        return
      }
      const left = Math.max(0, n.endsAt - now)
      n.timeLeft = left / 1000
      this.ui.tick(this)

      if (this.tutorial && this.tutorial.isActive()) {
        n.endsAt = now + (n.timeLeft || NIGHT_SECONDS) * 1000
        const tickRes = this.tutorial.tick(16.7)
        if (tickRes.timeoutHint) {
          this.ui.pulseTutorialInactivity('林阿姨提示：试着轻触或滑动发光窗户！')
        }
        if (this.tutorial.getState() === TUTORIAL_STATES.STEP2_DRAG) {
          const wins = this._tutorialTargetRooms.map(r => this.scene.windows.find(w => w.roomId === r)).filter(Boolean)
          const pts = wins.map(w => this.scene.windowScreenRect(w)).filter(Boolean)
          this.ui.updateTutorialGesture(pts, now / 1000)
        }
      } else {
        const dda = this.difficulty.tick(now)
        if (this.ui && typeof this.ui.setFlowState === 'function') {
          this.ui.setFlowState(dda.flowState)
        }

        if (this.crisis) {
          const elapsedSec = (now - n.startedAt) / 1000
          const isSpecialActive = this._choiceOpen || Boolean(this.scene && this.scene.resonancePair)
          const crisis = this.crisis.tick(elapsedSec, now, isSpecialActive)
          if (crisis) {
            if (crisis.expired) {
              if (this.ui.hideCrisisPrompt) this.ui.hideCrisisPrompt()
              this.ui.toast('⏰ 突发危机已平息，错过了奖励')
              if (this.replay) this.replay.record(now - n.startedAt, 'crisis_expire', 0)
            } else if (crisis.remainingSec >= crisis.durationSec - 0.05 && crisis.currentTaps === 0) {
              if (this.ui.showCrisisPrompt) this.ui.showCrisisPrompt(crisis)
            } else {
              if (this.ui.updateCrisisPrompt) this.ui.updateCrisisPrompt(crisis)
            }
          }
        }

        this._expireGlimmers(now)
        this._scheduleSpawns(now)
        this._maybeBeacon(now)
        this._maybeResonance(now)
      }
      if (n.combo > 0 && now > this._comboFreezeUntil && now - this._lastTap > n.cfg.comboWindowMs) {
        n.combo = 0; this.ui.combo(0); this.ui.setStats(this)
      }
      if (n.index === 0 && !n.evolveFired && (now - n.startedAt) / 1000 >= EVOLVE_AT_S) {
        n.evolveFired = true; this._evolve()
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
          litCount: n.litCount, maxCombo: n.maxCombo, dragChains: n.bestChain,
          resonancesCompleted: n.resonanceCount,
          choicesMade: this.run.choices.map(c => ({ roomId: c.roomId, choiceId: c.choiceId, label: c.label }))
        },
        firstNight: this.nightIndex + 2, uid: this.records.uid
      })
      if (!res || !res.payload || !Array.isArray(res.payload.nights)) return
      const evolved = cloneNights(res.payload.nights)
      for (let i = 0; i < evolved.length; i++) {
        const targetIdx = this.nightIndex + 1 + i
        if (targetIdx >= NIGHT_COUNT) break
        if (evolved[i]) this.nights[targetIdx] = evolved[i]
      }
      if (res.source !== 'offline') this.ui.toast('后两晚的窗，已经按你今晚的样子改写', '')
    } catch {}
  }

  _endNight() {
    const n = this.night
    if (!n || n.ended) return
    n.ended = true; this.state = 'settle'; cancelAnimationFrame(this._raf)
    if (this.ui && this.ui.hideTutorialOverlay) this.ui.hideTutorialOverlay()
    this.scene.setPaused(true)
    if (this.audio) this.audio.setLitCount(0)

    this.run.totalWarmth += n.warmth; this.run.litTotal += n.litCount
    this.run.bestNightWarmth = Math.max(this.run.bestNightWarmth, n.warmth)
    this.run.items = uniq(this.run.items); this.run.residentsAwoken = uniq(this.run.residentsAwoken)
    this.run.nights.push({ litCount: n.litCount, litRooms: n.litRooms.slice(), allLit: n.allLit, resonanceCount: n.resonanceCount, star: this._events.star || 0, cat: this._events.cat || 0 })
    this.run.nightsSummary.push({
      night: n.index + 1, weather: n.data.weather, tempo: n.data.tempo, warmth: n.warmth,
      lit: n.litCount, maxCombo: n.maxCombo, stamps: n.stamped.length,
      choices: this.run.choices.filter(c => c.night === n.index + 1).map(c => ({ roomId: c.roomId, label: c.label }))
    })

    const ch = chapterMeta(n.index)
    const summary = {
      night: n.index + 1, count: NIGHT_COUNT, warmth: n.warmth, lit: n.litCount,
      maxCombo: n.maxCombo, stamps: n.stamped.length, commissions: n.data.commissions,
      resonanceCount: n.resonanceCount, allLit: n.allLit, minPassed: n.minPassed,
      cliffhanger: ch.cliffhanger
    }
    setTimeout(() => {
      if (n.index + 1 < NIGHT_COUNT) this.ui.nightSummary(summary, () => this._showChapterAndLaunch(n.index + 1))
      else this._finish()
    }, 700)
  }

  async _finish() {
    this.state = 'ending'
    const resolved = resolveEnding({
      totalWarmth: this.run.totalWarmth, litTotal: this.run.litTotal, maxCombo: this.run.maxCombo,
      resonanceCount: this.run.resonanceCount, stampsEarned: this.run.stampsEarned,
      nights: this.run.nights, choices: this.run.choices, residentsAwoken: this.run.residentsAwoken,
      events: this._events, bonds: this.run.residentBonds
    })
    const meta = endingMeta(resolved.endingId)
    this.run.endingId = resolved.endingId; this.run.archetype = meta.title; this.run.bondRoomId = resolved.bondRoomId
    this.run.dormType = this.dormId; this.run.season = this.season; this.run.weather = this.weather; this.run.gameMode = 'star_sweep'
    this.run.unlockedEndings = uniq([...this.records.unlockedEndings, resolved.endingId])
    this.run.titles = uniq([...(this.records.titles || []), meta.title]).slice(0, 12)

    this.ui.showEnding({ ending: meta, run: this.run })
    const cutsceneMs = this.scene.playEndingCutscene(resolved.endingId)
    if (this.audio) this.audio.finale(resolved.endingId)

    const epilogue = await Promise.race([
      this.ai.requestEndingEpilogue({
        endingId: resolved.endingId, bondRoomId: resolved.bondRoomId, totalWarmth: this.run.totalWarmth,
        litTotal: this.run.litTotal, maxCombo: this.run.maxCombo, resonanceCount: this.run.resonanceCount,
        stampsEarned: this.run.stampsEarned, choicesHistory: this.run.choices.map(c => ({ roomId: c.roomId, label: c.label })),
        path: this.run.path, uid: this.records.uid
      }).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), Math.max(3500, cutsceneMs)))
    ])

    const fallbackLetter = epilogue && epilogue.payload ? epilogue.payload : null
    if (fallbackLetter) {
      this.run.letter = fallbackLetter.letter; this.run.whisperSuggestion = fallbackLetter.whisperSuggestion
      if (fallbackLetter.archetype) this.run.titles = uniq([...this.run.titles, fallbackLetter.archetype]).slice(0, 12)
    } else {
      this.run.letter = meta ? { fromRoom: meta.name, salutation: '致今晚亮灯的人：', body: '今晚的灯亮到这里。', sign: dormDef(this.dormId).shortName } : null
      this.run.whisperSuggestion = '今晚的雨很轻，祝你也做个好梦。'
    }
    this.run.letterSource = epilogue ? epilogue.source : 'offline'

    this.records = mergeRunAdopted(this.records, {
      bestWarmth: Math.max(this.records.bestWarmth || 0, this.run.totalWarmth),
      bestCombo: Math.max(this.records.bestCombo || 0, this.run.maxCombo),
      totalWindows: (this.records.totalWindows || 0) + this.run.litTotal,
      plays: (this.records.plays || 0) + 1,
      unlockedEndings: this.run.unlockedEndings,
      unlockedItems: this.run.items,
      residentBonds: this.run.residentBonds,
      titles: this.run.titles
    })
    saveRecords(this.records)

    const postcard = await drawPostcard({ run: this.run, nights: this.nights, records: this.records, ending: meta })
    const synced = await syncRun({ ...this.run, litTotal: this.run.litTotal, score: this.run.totalWarmth }, { uid: this.records.uid, nickname: this.nickname })
    if (synced && synced.player) {
      this.records = mergeRunAdopted(this.records, synced.player)
      saveRecords(this.records)
    }

    this.state = 'done'
    this.ui.showResult({
      run: this.run, records: this.records, postcard, ending: meta, letter: this.run.letter,
      rank: synced ? synced.rank : 0, aiSource: this.aiSource, suggestedWhisper: this.run.whisperSuggestion,
      replayEvents: this.replay ? this.replay.getEvents() : [],
      scene: this.scene,
      audio: this.audio,
      onSealWhisper: payload => this.sealWhisper(payload),
      onLikeWhisper: id => this.likeWhisper(id),
      onLeaderboard: () => this.openLeaderboard(() => this.showHub(), 'star_sweep'),
      onReplay: () => this.start(),
      onHome: () => { this.scene.resetCamera(); this.showHub() }
    })
  }

  async sealWhisper(payload) {
    const name = this.nickname || this.records.nickname || ensureNickname()
    const whisper = await sealWhisper({ uid: this.records.uid, nickname: name, roomId: payload.roomId, content: payload.content, moodToken: this.moodToken })
    if (whisper) this.community.whispers = [whisper, ...this.community.whispers].slice(0, 12)
    return whisper
  }

  toggleMute() {
    if (!this.audio) return false
    const muted = this.audio.setMuted(!this.audio.muted)
    this.ui.setMuted(muted)
    return muted
  }

  togglePause() {
    if (!this.night) return
    if (this.state === 'night') {
      this._pausedAt = performance.now(); this.state = 'paused'; cancelAnimationFrame(this._raf); this.scene.setPaused(true)
      this.ui.pause({ onResume: () => this._resume(), onHome: () => this._abandon() })
    } else if (this.state === 'paused') {
      this._resume()
    }
  }

  _resume() {
    if (!this.night) return
    const delta = performance.now() - this._pausedAt
    this.night.endsAt += delta; this.night.startedAt += delta
    for (const w of this.scene.windows) if (w.expiresAt) w.expiresAt += delta
    this.state = 'night'; this.scene.setPaused(false); this.ui.hidePause(); this._startTicker()
  }

  _abandon() {
    this._clearMinigame()
    this.night = null
    this.scene.setPaused(false)
    this.scene.resetCamera()
    this.ui.hideAll()
    this.showHub()
  }

  submitScore(nickname) {
    this._setNickname(nickname)
    return syncRun({ ...this.run }, { uid: this.records.uid, nickname: this.nickname }).then(r => (r ? { ok: true, rank: r.rank } : { ok: false }))
  }

  leaderboard(scope) { return fetchLeaderboardWithRank({ scope, limit: 20, uid: this.records.uid }).then(d => d.items) }
  whispers() { return fetchWhispers({ limit: 12 }) }

  async refreshCommunity() {
    const cloud = await bootstrapProfile({ uid: this.records.uid, passCode: this.records.passCode })
    if (!cloud) return
    this.records = mergeRunAdopted(this.records, cloud.player)
    this.community = { whispers: cloud.whispers || [], stats: cloud.globalStats || null, heat: cloud.windowHeat || [] }
    saveRecords(this.records)
  }
}

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

function cloneNights(nights) { return nights.map(n => JSON.parse(JSON.stringify(n))) }

export { TEMPO_CONFIG, COMBO_FREEZE_MS, cloneNights }
