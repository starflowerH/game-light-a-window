// All DOM overlays for《今晚，亮一盏灯 · 3D校园夜巡物语》v4.0.
//
// Two rules keep the frame rate honest:
//   1. tick() compares against the last written value before touching the DOM.
//   2. progress bars animate cleanly via transform: scaleX().

import { paintIcons } from './icons.js'
import { fetchLeaderboardWithRank } from './records.js'
import {
  BGM_TRACKS,
  CAMERA_VIEWS,
  DORM_TYPES,
  ENDINGS,
  GAME_MODES,
  MOOD_TOKENS,
  QUALITY_MODES,
  SEASONS,
  WEATHER_CATALOG,
  WINDOW_STATES,
  bgmTrackDef,
  buildWindowIds,
  dormDef,
  gameModeDef,
  generateCampusNickname,
  outfitForEnv,
  qualityModeDef,
  seasonDef
} from '../shared/constants.js'
import { NPC_CATALOG, OUTFIT_LABELS, renderNpcPortraitSvg } from './npc-portraits.js'
import { bondLabel, endingGallery, endingScript } from './narrative-graph.js'
import { ReplayPlayer } from './replay.js'
import { MODE_MAX_STAGE, evaluateRunTier, formatStageMilestone } from '../shared/ranks.js'

const qs = (root, sel) => root.querySelector(sel)
const qsa = (root, sel) => root.querySelectorAll(sel)

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]))

const MOOD_ICONS = ['umbrella', 'headphones', 'quilt', 'bulb']

export class UI {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root
    this.el = document.createElement('div')
    this.el.id = 'ui'
    root.appendChild(this.el)
    this.fx = document.getElementById('fx')
    this._cur = null
    this._coachEl = null
    this._dirty = { sec: -1, warmth: -1, combo: -1, lit: -1 }
    this._onStart = null
    /** @type {any} */ this._choiceTimer = 0
    /** @type {any} */ this._toastTimer = 0
    /** @type {any} */ this._dlgTimer = 0

    this.tagsEl = document.getElementById('tags')
    if (!this.tagsEl) {
      this.tagsEl = document.createElement('div')
      this.tagsEl.id = 'tags'
      root.appendChild(this.tagsEl)
    }
    this._tutOverlayEl = null
    this._tutGestureRaf = 0
    this._tutSvgKey = ''
    /** @type {Element|null} */ this._tutHandEl = null
    /** @type {Array<HTMLElement>} */ this._tagPool = []
    /** @type {any} */ this._hintBubbleTimer = 0
    /** @type {((e: Event) => void) | null} */ this._hintBubbleDismiss = null
    /** @type {ReplayPlayer|null} */ this._replayPlayer = null
    this._lastTierCode = ''
    this._hubPanelOpen = false
  }

  _layer() {
    this.hideCoach()
    this.hideHintBubble()
    const d = document.createElement('div')
    d.className = 'screen'
    this.el.appendChild(d)
    this._cur = d
    return d
  }

  hideAll() {
    clearTimeout(this._dlgTimer)
    clearTimeout(this._toastTimer)
    for (const n of qsa(this.el, '.screen')) n.remove()
    this.hideChoice()
    this.hidePause()
    this.hideCoach()
    this.hideTutorialOverlay()
    this.hideHintBubble()
    this.clearWindowTags()
    this.hideCrisisPrompt(true)
    this.stopReplay()
    this._cur = null
    this.el.innerHTML = ''
    for (const id of ['hud', 'hud-v4', 'hub', 'dialogue-box', 'hv4-bottom', 'toast', 'tut-overlay', 'hint-bubble', 'crisis-card', 'replay-dock']) {
      const node = document.getElementById(id)
      if (node) node.remove()
    }
    this.hudEl = null
    this._hv4 = null
    this._nightTierEl = null
    this._dirty = { sec: -1, warmth: -1, combo: -1, lit: -1 }
  }

  // -------------------------------------------------------------- loading

  showLoading(text) {
    this.hideAll()
    const s = this._layer()
    s.innerHTML = '<div class="panel glass small"><div class="spin"></div><h2 class="h2">' + esc(text || '正在点亮校园星夜') + '</h2><p class="lede center">载入建筑与光影…</p></div>'
    paintIcons(s)
  }

  // ---------------------------------------------------------------- title

  /**
   * @param {{ records: any, whispers: any[], stats: any, keyStatus: any, nickname: string,
   *   bgmState?: any, onBgmSelect?: Function, onBgmUpload?: Function, onMute?: Function,
   *   onEnterCampus?: Function, onStart: Function, onCollection: Function, onLeaderboard: Function,
   *   onWhisperWall: Function, onKeyConfig: Function, onNpcGallery?: Function, onDocs?: Function, onNicknameChange?: (name: string) => void }} opts
   */
  showTitle({ records, whispers, stats, keyStatus, nickname, bgmState, onBgmSelect, onBgmUpload, onMute, onEnterCampus, onStart, onCollection, onLeaderboard, onWhisperWall, onKeyConfig, onNpcGallery, onDocs, onNicknameChange }) {
    this.hideAll()
    this._onStart = onStart
    const unlocked = (records && records.unlockedEndings) ? records.unlockedEndings.length : 0
    const total = stats && stats.totalLit ? stats.totalLit.toLocaleString('zh-CN') : '0'
    const firstWhisper = whispers && whispers.length ? whispers[0] : null
    const aiDirect = Boolean(keyStatus && keyStatus.enabled)
    const curMode = bgmState ? bgmState.mode : 'theme'
    const curTrack = bgmTrackDef(curMode)

    const s = this._layer()
    s.classList.add('title-screen')
    s.innerHTML =
      '<div class="title-veil"></div>' +
      '<div class="title-topbar">' +
        '<div class="title-top-group">' +
          '<div class="nick-inline">' +
            '<input data-nick maxlength="8" value="' + esc(nickname || '三楼夜猫') + '" aria-label="玩家昵称" />' +
            '<button class="nick-dice" type="button" data-act="randnick" title="随机昵称">🎲</button>' +
          '</div>' +
          '<span class="ai-radio-pill ' + (aiDirect ? '' : 'offline') + '">' +
            '<i class="ai-radio-dot"></i>' +
            (aiDirect ? 'AI 直连 · ' + esc(keyStatus.masked) : 'AI 就绪') +
          '</span>' +
        '</div>' +
        '<div class="title-top-group">' +
          '<button type="button" class="chip-btn" data-act="bgm-toggle"><span data-bgmbadge>🎵 ' + esc(bgmState?.customTitle || curTrack.shortName) + '</span> ▾</button>' +
          '<button type="button" class="chip-btn" data-act="mute" title="静音切换">' + (bgmState && bgmState.muted ? '🔇' : '🔊') + '</button>' +
          '<div class="bgm-popover" data-bgmpop>' +
            BGM_TRACKS.map(t => '<button type="button" class="chip-sm ' + (t.id === curMode ? 'on' : '') + '" data-bgm="' + esc(t.id) + '" title="' + esc(t.desc) + '">' + esc(t.shortName) + '</button>').join('') +
            '<label class="chip-sm bgm-upload" title="导入本地 MP3">📁 本地曲目<input type="file" accept="audio/*" data-bgmfile style="display:none"/></label>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="title-hero">' +
        '<h1 class="title-h1">今晚，亮一盏灯</h1>' +
        '<p class="title-sub">点亮星夜里的每一扇晚安窗</p>' +
        '<div class="title-actions">' +
          '<button class="btn primary" data-act="enter">进入校园夜巡</button>' +
          '<button class="btn ghost" data-act="start">三夜剧情</button>' +
          '<button class="btn ghost docs-btn" data-act="docs"><span data-icon="ledger"></span>作品说明</button>' +
        '</div>' +
        '<div class="title-secondary">' +
          '<button class="linkish" data-act="board">排行榜</button>' +
          '<span class="title-sep">·</span>' +
          '<button class="linkish" data-act="npcs">NPC图鉴</button>' +
          '<span class="title-sep">·</span>' +
          '<button class="linkish" data-act="collection">结局 <b>' + unlocked + '/6</b></button>' +
          '<span class="title-sep">·</span>' +
          '<button class="linkish" data-act="whispers" title="' + esc(firstWhisper ? firstWhisper.content : '校园流光留声机') + '">留声机</button>' +
          '<span class="title-sep">·</span>' +
          '<button class="linkish" data-act="key" title="DeepSeek AI 直连 Key">🔑</button>' +
          '<span class="title-sep">·</span>' +
          '<span class="title-count">全校已亮 <b>' + esc(total) + '</b> 窗</span>' +
        '</div>' +
      '</div>'
    paintIcons(s)

    const bgmToggle = qs(s, '[data-act="bgm-toggle"]')
    const bgmPop = qs(s, '[data-bgmpop]')
    if (bgmToggle && bgmPop) {
      bgmToggle.onclick = e => {
        e.stopPropagation()
        bgmPop.classList.toggle('open')
      }
      bgmPop.addEventListener('click', e => e.stopPropagation())
      s.addEventListener('click', () => bgmPop.classList.remove('open'))
    }

    for (const b of qsa(s, '[data-bgm]')) {
      b.onclick = () => {
        const id = b.getAttribute('data-bgm') || 'auto'
        for (const x of qsa(s, '[data-bgm]')) x.classList.toggle('on', x === b)
        if (onBgmSelect) onBgmSelect(id)
        if (bgmPop) bgmPop.classList.remove('open')
      }
    }
    const fileInp = qs(s, 'input[data-bgmfile]')
    if (fileInp && onBgmUpload) {
      fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]
        if (f) onBgmUpload(f)
      }
    }
    const muteBtn = qs(s, '[data-act="mute"]')
    if (muteBtn && onMute) {
      muteBtn.onclick = () => {
        const m = onMute()
        muteBtn.textContent = m ? '🔇' : '🔊'
      }
    }

    const nickInput = /** @type {HTMLInputElement} */ (qs(s, 'input[data-nick]'))
    nickInput.onchange = () => { if (onNicknameChange) onNicknameChange(nickInput.value) }
    qs(s, '[data-act="randnick"]').onclick = () => {
      const next = generateCampusNickname()
      nickInput.value = next
      if (onNicknameChange) onNicknameChange(next)
    }

    qs(s, '[data-act="enter"]').onclick = () => (onEnterCampus ? onEnterCampus() : onStart())
    qs(s, '[data-act="start"]').onclick = () => onStart()
    qs(s, '[data-act="collection"]').onclick = () => onCollection()
    qs(s, '[data-act="board"]').onclick = () => onLeaderboard()
    qs(s, '[data-act="whispers"]').onclick = () => onWhisperWall()
    qs(s, '[data-act="key"]').onclick = () => onKeyConfig()
    if (onNpcGallery) qs(s, '[data-act="npcs"]').onclick = () => onNpcGallery()
    if (onDocs) qs(s, '[data-act="docs"]').onclick = () => onDocs('overview')
  }

  updateBgmBadge(bgmState) {
    const tMeta = bgmTrackDef(bgmState?.mode || 'theme')
    const txt = bgmState?.customTitle ? ('🎵 ' + bgmState.customTitle) : ('🎵 ' + tMeta.shortName)
    for (const el of document.querySelectorAll('[data-bgmbadge]')) {
      el.textContent = txt
    }
  }

  updateOrbitBadge(locked) {
    for (const el of document.querySelectorAll('[data-orbitbadge]')) {
      el.textContent = locked ? '🔒 固定连窗' : '🔄 自由转看'
      el.classList.toggle('on', Boolean(locked))
    }
  }

  // ------------------------------------------------------------- RPG dialogue cutscene

  /**
   * Show dual-portrait weather-outfit RPG dialogue for opening cutscene / dorm intro.
   * @param {{
   *   lines: Array<{ speakerId?: string, npcId?: string, speaker?: string, line: string, mood?: string }>,
   *   dormType: string, season: string, weather: string, aiSource: string,
   *   onSpeakerChange?: (npcId: string) => void,
   *   onStepSound?: (i: number) => void,
   *   onDone: Function
   * }} opts
   */
  showDialogue({ lines, dormType: _dormType, season, weather, aiSource, onSpeakerChange, onStepSound, onDone }) {
    this.hideAll()
    const list = Array.isArray(lines) && lines.length ? lines : [
      { npcId: 'aunt_lin', speaker: '林阿姨', line: '熄灯铃响过喽，今晚的宿舍巡查就拜托你啦。' }
    ]
    const outfitKey = outfitForEnv(weather, season)
    const outfitLabel = OUTFIT_LABELS[outfitKey] || '值班常服'
    const isAi = aiSource === 'ai' || aiSource === 'direct' || aiSource === 'cache'

    const box = document.createElement('div')
    box.id = 'dialogue-box'
    box.innerHTML =
      '<div class="npc-portrait-frame">' +
        '<div class="npc-portrait-svg" data-portrait></div>' +
        '<span class="outfit-badge" data-outfit>' + esc(outfitLabel) + '</span>' +
      '</div>' +
      '<div class="dlg-body">' +
        '<div class="dlg-head">' +
          '<div><span class="dlg-speaker" data-spk></span><span class="dlg-role" data-role></span></div>' +
          '<span class="ai-radio-pill ' + (isAi ? '' : 'offline') + '"><i class="ai-radio-dot"></i>' + esc(isAi ? 'AI 导演' : '校园剧本') + '</span>' +
        '</div>' +
        '<p class="dlg-text" data-text></p>' +
        '<div class="dlg-actions">' +
          '<span class="dlg-step" data-step></span>' +
          '<button class="chip-sm" type="button" data-act="skip">跳过</button>' +
          '<button class="btn primary" type="button" data-act="next" style="padding:7px 16px;font-size:12.5px;">继续</button>' +
        '</div>' +
      '</div>'
    this.el.appendChild(box)

    const portraitEl = qs(box, '[data-portrait]')
    const spkEl = qs(box, '[data-spk]')
    const roleEl = qs(box, '[data-role]')
    const textEl = qs(box, '[data-text]')
    const stepEl = qs(box, '[data-step]')
    const nextBtn = qs(box, '[data-act="next"]')

    let idx = 0
    let typing = false
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(this._dlgTimer)
      box.remove()
      onDone && onDone()
    }

    const renderLine = () => {
      if (finished) return
      if (idx >= list.length) { finish(); return }
      const item = list[idx]
      const spkId = item.speakerId || item.npcId || 'aunt_lin'
      const npc = NPC_CATALOG[spkId] || NPC_CATALOG.aunt_lin
      portraitEl.innerHTML = renderNpcPortraitSvg(npc.id, weather, season)
      spkEl.textContent = item.speaker || npc.name
      roleEl.textContent = npc.role
      stepEl.textContent = `${idx + 1} / ${list.length}`
      nextBtn.textContent = idx === list.length - 1 ? '进入大厅' : '继续'
      if (onSpeakerChange) onSpeakerChange(npc.id)
      if (onStepSound) onStepSound(idx)

      const full = String(item.line || '')
      let c = 0
      typing = true
      textEl.textContent = ''
      const stepChar = () => {
        if (finished) return
        if (c <= full.length) {
          textEl.textContent = full.slice(0, c)
          c += 1
          this._dlgTimer = setTimeout(stepChar, 28)
        } else {
          typing = false
        }
      }
      stepChar()
    }

    const advance = () => {
      if (finished) return
      const item = list[idx]
      if (typing && item) {
        clearTimeout(this._dlgTimer)
        typing = false
        textEl.textContent = String(item.line || '')
        return
      }
      idx += 1
      renderLine()
    }

    qs(box, '[data-act="skip"]').onclick = e => { e.stopPropagation(); finish() }
    nextBtn.onclick = e => { e.stopPropagation(); advance() }
    box.onclick = e => {
      const target = e.target
      if (target instanceof HTMLElement && target.closest('button')) return
      advance()
    }
    renderLine()
  }

  // ------------------------------------------------------------- Campus 3D Hub

  /**
   * Floating Campus Hub over live interactive 3D dormitory scene.
   * @param {{
   *   nickname: string, dormId: string, season: string, weather: string, viewId: string,
   *   qualityMode?: string, onQualityMode?: (id: string) => void,
   *   gameMode: string, aiSource: string, keyEnabled: boolean,
   *   bgmState?: any, onBgmSelect?: (id: string) => void, onBgmUpload?: (f: File) => void, onMute?: () => boolean,
   *   onDorm: (id: string) => void,
   *   onSeason: (id: string) => void,
   *   onWeather: (id: string) => void,
   *   onView: (id: string) => void,
   *   onSelectMode: (id: string) => void,
   *   onLaunchMode: (id: string) => void,
   *   onNicknameChange: (name: string) => void,
   *   onReplayDialogue: Function,
   *   onNpcGallery: Function,
   *   onLeaderboard: Function,
   *   onCollection: Function,
   *   onKeyConfig: Function,
   *   tourActive?: boolean,
   *   onToggleTour?: Function,
   *   onPostcard?: Function,
   *   onDocs?: Function,
   *   onTitle: Function
   * }} opts
   */
  showCampusHub(opts) {
    this.hideAll()
    const dorm = dormDef(opts.dormId)
    const season = seasonDef(opts.season)
    const weatherMeta = WEATHER_CATALOG.find(w => w.id === opts.weather) || WEATHER_CATALOG[0]
    const aiActive = opts.keyEnabled || opts.aiSource === 'ai' || opts.aiSource === 'direct' || opts.aiSource === 'cache'
    const bgmMode = opts.bgmState ? opts.bgmState.mode : 'theme'
    const bgmMeta = bgmTrackDef(bgmMode)
    const activeTab = this._hubTab || 'dorm'
    const panelOpen = Boolean(this._hubPanelOpen)
    const qMode = opts.qualityMode || 'auto'
    const qMeta = qualityModeDef(qMode)

    const hub = document.createElement('div')
    hub.id = 'hub'
    hub.innerHTML =
      '<div class="hub-topbar">' +
        '<div class="hub-brand">' +
          '<b>' + esc(dorm.name) + '</b>' +
          '<span>' + esc(season.name.split(' · ').pop() || season.name) + ' · ' + esc(weatherMeta.name) + '</span>' +
        '</div>' +
        '<div class="hub-top-actions">' +
          '<button class="chip-btn ' + (panelOpen ? 'on' : '') + '" data-act="panel-toggle">' + (panelOpen ? '🎛 收起' : '🎛 场景') + '</button>' +
          '<button class="chip-btn ' + (opts.tourActive ? 'on' : '') + '" data-act="scenic-tour">' + (opts.tourActive ? '⏸ 停止' : '✨ 巡礼') + '</button>' +
          '<button class="chip-btn" data-act="postcard">📸 留影</button>' +
          '<button class="chip-btn" data-act="bgm-cycle" data-bgmbadge>🎵 ' + esc(opts.bgmState?.customTitle || bgmMeta.shortName) + '</button>' +
          '<button class="chip-btn" data-act="mute">' + (opts.bgmState && opts.bgmState.muted ? '🔇' : '🔊') + '</button>' +
          '<button class="chip-btn" data-act="board">🏆 榜单</button>' +
          '<div class="hub-more-wrap">' +
            '<button class="chip-btn" data-act="more-toggle">⋯</button>' +
            '<div class="hub-more-menu" data-moremenu>' +
              '<div class="nick-inline" data-nickwrap>' +
                '<input data-nick maxlength="8" value="' + esc(opts.nickname) + '" aria-label="夜巡代号" />' +
                '<button class="nick-dice" type="button" data-act="randnick">🎲</button>' +
              '</div>' +
              '<div class="ai-radio-pill ' + (aiActive ? '' : 'offline') + '" style="margin:2px 0;"><i class="ai-radio-dot"></i>' + (opts.keyEnabled ? 'DeepSeek 直连' : (aiActive ? '云端 AI' : '校园剧本')) + '</div>' +
              '<button class="chip-sm" data-act="dialogue">💬 开场剧情</button>' +
              '<button class="chip-sm" data-act="npcs">👘 NPC 图鉴</button>' +
              '<button class="chip-sm" data-act="collection">⭐ 结局线索</button>' +
              '<button class="chip-sm" data-act="key">🔑 AI Key</button>' +
              '<button class="chip-sm" data-act="docs">📖 作品说明</button>' +
              '<button class="chip-sm" data-act="title">🏠 标题页</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="hub-mid ' + (panelOpen ? '' : 'collapsed') + '" data-hubmid>' +
        '<div class="hub-panel">' +
          '<div class="hub-tabs">' +
            '<button type="button" class="hub-tab-btn ' + (activeTab === 'dorm' ? 'on' : '') + '" data-tab="dorm">楼栋</button>' +
            '<button type="button" class="hub-tab-btn ' + (activeTab === 'env' ? 'on' : '') + '" data-tab="env">天气季节</button>' +
            '<button type="button" class="hub-tab-btn ' + (activeTab === 'av' ? 'on' : '') + '" data-tab="av">视角配乐</button>' +
          '</div>' +
          '<div class="hub-tab-pane ' + (activeTab === 'dorm' ? 'on' : '') + '" data-pane="dorm">' +
            '<div class="hub-group-label">楼栋</div>' +
            '<div class="chip-row">' +
              DORM_TYPES.map(d => '<button class="chip-sm ' + (d.id === opts.dormId ? 'on' : '') + '" data-dorm="' + esc(d.id) + '">' + esc(d.shortName) + '·' + d.windowCount + '窗</button>').join('') +
            '</div>' +
          '</div>' +
          '<div class="hub-tab-pane ' + (activeTab === 'env' ? 'on' : '') + '" data-pane="env">' +
            '<div class="hub-group-label">季节</div>' +
            '<div class="chip-row">' +
              SEASONS.map(s => '<button class="chip-sm ' + (s.id === opts.season ? 'on' : '') + '" data-season="' + esc(s.id) + '">' + esc(s.name) + '</button>').join('') +
            '</div>' +
            '<div class="hub-group-label" style="margin-top:8px;">天气</div>' +
            '<div class="chip-row">' +
              WEATHER_CATALOG.map(w => '<button class="chip-sm ' + (w.id === opts.weather ? 'on' : '') + '" data-weather="' + esc(w.id) + '">' + esc(w.name) + '</button>').join('') +
            '</div>' +
          '</div>' +
          '<div class="hub-tab-pane ' + (activeTab === 'av' ? 'on' : '') + '" data-pane="av">' +
            '<div class="hub-group-label">视角</div>' +
            '<div class="chip-row">' +
              CAMERA_VIEWS.map(v => '<button class="chip-sm ' + (v.id === opts.viewId ? 'on' : '') + '" data-view="' + esc(v.id) + '">' + esc(v.name) + '</button>').join('') +
            '</div>' +
            '<div class="hub-group-label" style="margin-top:8px;">配乐</div>' +
            '<div class="chip-row">' +
              BGM_TRACKS.map(t => '<button class="chip-sm ' + (t.id === bgmMode ? 'on' : '') + '" data-bgm="' + esc(t.id) + '">' + esc(t.shortName) + '</button>').join('') +
              '<label class="chip-sm bgm-upload">📁 本地<input type="file" accept="audio/*" data-bgmfile style="display:none"/></label>' +
            '</div>' +
            '<div class="hub-group-label" style="margin-top:8px;">画质 · ' + esc(qMeta.desc) + '</div>' +
            '<div class="chip-row">' +
              QUALITY_MODES.map(qm => '<button class="chip-sm ' + (qm.id === qMode ? 'on' : '') + '" data-quality="' + esc(qm.id) + '">' + esc(qm.name) + '</button>').join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="hub-bottom">' +
        '<div class="hub-mobile-dormbar" data-mobiledock>' +
          '<div class="mob-dorm-row">' +
            '<span class="mob-lab">🏢 楼栋</span>' +
            DORM_TYPES.map(d => '<button class="chip-sm ' + (d.id === opts.dormId ? 'on' : '') + '" data-dorm="' + esc(d.id) + '">' + esc(d.shortName) + '·' + d.windowCount + '窗</button>').join('') +
            '<button class="chip-sm on" data-act="mob-env-toggle">🌦 景音 ▾</button>' +
          '</div>' +
          '<div class="mob-env-drawer" data-mobenv>' +
            '<div class="chip-row">' + SEASONS.map(s => '<button class="chip-sm ' + (s.id === opts.season ? 'on' : '') + '" data-season="' + esc(s.id) + '">' + esc(s.name) + '</button>').join('') + '</div>' +
            '<div class="chip-row">' + WEATHER_CATALOG.map(w => '<button class="chip-sm ' + (w.id === opts.weather ? 'on' : '') + '" data-weather="' + esc(w.id) + '">' + esc(w.name) + '</button>').join('') + '</div>' +
            '<div class="chip-row">' + CAMERA_VIEWS.map(v => '<button class="chip-sm ' + (v.id === opts.viewId ? 'on' : '') + '" data-view="' + esc(v.id) + '">' + esc(v.name) + '</button>').join('') + '</div>' +
            '<div class="chip-row">' + QUALITY_MODES.map(qm => '<button class="chip-sm ' + (qm.id === qMode ? 'on' : '') + '" data-quality="' + esc(qm.id) + '">' + esc(qm.name) + '</button>').join('') + '</div>' +
            '<div class="chip-row">' + BGM_TRACKS.map(t => '<button class="chip-sm ' + (t.id === bgmMode ? 'on' : '') + '" data-bgm="' + esc(t.id) + '">' + esc(t.shortName) + '</button>').join('') + '<label class="chip-sm bgm-upload">📁 本地<input type="file" accept="audio/*" data-bgmfile style="display:none"/></label></div>' +
          '</div>' +
        '</div>' +
        '<div class="hub-modes">' +
          GAME_MODES.map(m =>
            '<div class="mode-card ' + (m.id === opts.gameMode ? 'on' : '') + (m.id === 'star_sweep' ? ' hero-mode' : '') + '" data-mode="' + esc(m.id) + '">' +
              '<div class="mode-card-head"><b>' + esc(m.shortName) + '</b><button class="mode-play-btn" type="button" data-launch="' + esc(m.id) + '">开始</button></div>' +
              '<span class="mc-desc">' + esc(m.desc) + '</span>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>'

    this.el.appendChild(hub)

    const hubMid = qs(hub, '[data-hubmid]')
    const panelBtn = qs(hub, '[data-act="panel-toggle"]')
    if (panelBtn && hubMid) {
      panelBtn.onclick = () => {
        this._hubPanelOpen = !this._hubPanelOpen
        hubMid.classList.toggle('collapsed', !this._hubPanelOpen)
        panelBtn.classList.toggle('on', this._hubPanelOpen)
        panelBtn.textContent = this._hubPanelOpen ? '🎛 收起' : '🎛 场景'
      }
    }

    const moreBtn = qs(hub, '[data-act="more-toggle"]')
    const moreMenu = qs(hub, '[data-moremenu]')
    if (moreBtn && moreMenu) {
      moreBtn.onclick = e => {
        e.stopPropagation()
        moreMenu.classList.toggle('open')
      }
      const nickWrap = qs(moreMenu, '[data-nickwrap]')
      if (nickWrap) nickWrap.addEventListener('click', e => e.stopPropagation())
      hub.addEventListener('click', () => moreMenu.classList.remove('open'))
    }

    for (const tb of qsa(hub, '[data-tab]')) {
      tb.onclick = () => {
        const t = tb.getAttribute('data-tab') || 'dorm'
        this._hubTab = t
        for (const b of qsa(hub, '[data-tab]')) b.classList.toggle('on', b.getAttribute('data-tab') === t)
        for (const p of qsa(hub, '[data-pane]')) p.classList.toggle('on', p.getAttribute('data-pane') === t)
      }
    }

    const mobEnvBtn = qs(hub, '[data-act="mob-env-toggle"]')
    const mobEnvDrawer = qs(hub, '[data-mobenv]')
    if (mobEnvBtn && mobEnvDrawer) {
      mobEnvBtn.onclick = () => {
        const open = mobEnvDrawer.classList.toggle('open')
        mobEnvBtn.textContent = open ? '🌦 收起 ▴' : '🌦 天气/视角/🎵 ▾'
      }
    }

    const nickInput = /** @type {HTMLInputElement} */ (qs(hub, 'input[data-nick]'))
    nickInput.onchange = () => opts.onNicknameChange(nickInput.value)
    qs(hub, '[data-act="randnick"]').onclick = () => {
      const next = generateCampusNickname()
      nickInput.value = next
      opts.onNicknameChange(next)
    }

    const cycleBgmBtn = qs(hub, '[data-act="bgm-cycle"]')
    if (cycleBgmBtn && opts.onBgmSelect) {
      cycleBgmBtn.onclick = () => {
        const order = BGM_TRACKS.map(t => t.id)
        const next = order[(order.indexOf(bgmMode) + 1) % order.length]
        opts.onBgmSelect(next)
      }
    }
    const muteBtn = qs(hub, '[data-act="mute"]')
    if (muteBtn && opts.onMute) {
      muteBtn.onclick = () => {
        const m = opts.onMute()
        muteBtn.textContent = m ? '🔇' : '🔊'
      }
    }
    for (const b of qsa(hub, '[data-bgm]')) {
      b.onclick = () => opts.onBgmSelect && opts.onBgmSelect(b.getAttribute('data-bgm') || 'auto')
    }
    for (const inp of qsa(hub, 'input[data-bgmfile]')) {
      inp.onchange = () => {
        const f = inp.files && inp.files[0]
        if (f && opts.onBgmUpload) opts.onBgmUpload(f)
      }
    }

    qs(hub, '[data-act="board"]').onclick = () => opts.onLeaderboard()
    qs(hub, '[data-act="npcs"]').onclick = () => opts.onNpcGallery()
    qs(hub, '[data-act="dialogue"]').onclick = () => opts.onReplayDialogue()
    qs(hub, '[data-act="collection"]').onclick = () => opts.onCollection()
    qs(hub, '[data-act="key"]').onclick = () => opts.onKeyConfig()
    if (opts.onToggleTour) qs(hub, '[data-act="scenic-tour"]').onclick = () => opts.onToggleTour()
    if (opts.onPostcard) qs(hub, '[data-act="postcard"]').onclick = () => opts.onPostcard()
    if (opts.onDocs) qs(hub, '[data-act="docs"]').onclick = () => opts.onDocs('overview')
    qs(hub, '[data-act="title"]').onclick = () => opts.onTitle()

    for (const b of qsa(hub, '[data-dorm]')) {
      b.onclick = () => opts.onDorm(b.getAttribute('data-dorm') || 'university')
    }
    for (const b of qsa(hub, '[data-season]')) {
      b.onclick = () => opts.onSeason(b.getAttribute('data-season') || 'autumn')
    }
    for (const b of qsa(hub, '[data-weather]')) {
      b.onclick = () => opts.onWeather(b.getAttribute('data-weather') || 'clear')
    }
    for (const b of qsa(hub, '[data-view]')) {
      b.onclick = () => opts.onView(b.getAttribute('data-view') || 'stardew')
    }
    for (const b of qsa(hub, '[data-quality]')) {
      b.onclick = () => opts.onQualityMode && opts.onQualityMode(b.getAttribute('data-quality') || 'auto')
    }
    for (const card of qsa(hub, '.mode-card')) {
      card.onclick = () => opts.onSelectMode(card.getAttribute('data-mode') || 'memory_sequence')
    }
    for (const btn of qsa(hub, '[data-launch]')) {
      btn.onclick = e => {
        e.stopPropagation()
        opts.onLaunchMode(btn.getAttribute('data-launch') || 'memory_sequence')
      }
    }
  }

  // ------------------------------------------------------------- Minigame HUD (v4)

  /**
   * @param {{
   *   modeMeta: any, dormMeta: any, aiPattern: string,
   *   bgmState?: any, onCycleBgm?: Function,
   *   orbitLocked?: boolean, onToggleOrbit?: Function, onResetView?: Function,
   *   showHintBtn?: boolean, onHint?: Function, onMute: Function, onExit: Function, muted: boolean,
   *   onViewCycle?: Function
   * }} opts
   */
  startMinigameHud(opts) {
    this.hideAll()
    const bgmMeta = bgmTrackDef(opts.bgmState?.mode || 'theme')
    const locked = opts.orbitLocked !== false
    const modeId = opts.modeMeta?.id || 'memory_sequence'
    const maxStage = MODE_MAX_STAGE[modeId] || 10
    const initTier = evaluateRunTier({ gameMode: modeId, score: 0, stageReached: 1, accuracyPct: 100 })
    const bar = document.createElement('div')
    bar.id = 'hud-v4'
    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span class="hv4-phase" data-phase>准备中…</span>' +
        '<span style="font-size:12px;color:#dbe4f8;">' + esc(opts.dormMeta.shortName) + ' · <b>' + esc(opts.modeMeta.shortName) + '</b></span>' +
        '<span class="mode-tag" data-pattern>' + esc(opts.aiPattern || '夜巡模式') + '</span>' +
        '<span class="tier-pill ' + initTier.cssClass + '" data-tier>' + initTier.icon + ' ' + initTier.code + ' · ' + esc(initTier.title) + '</span>' +
      '</div>' +
      '<div class="hv4-stats">' +
        '<span>关<b data-stage>1/' + maxStage + '</b></span>' +
        '<span>对<b data-correct>0</b></span>' +
        '<span>准度<b data-acc>100%</b></span>' +
        '<span>分<b data-score>0</b></span>' +
        '<span data-timewrap style="display:none;">余时<b data-time>45</b>s</span>' +
        '<span>盾<b data-shield>1</b></span>' +
      '</div>' +
      '<div class="hv4-actions">' +
        (opts.showHintBtn ? '<button class="chip-sm on" data-act="hint">💡 提示</button>' : '') +
        (opts.onToggleOrbit ? '<button class="chip-sm ' + (locked ? 'on' : '') + '" data-act="orbit" data-orbitbadge>' + (locked ? '🔒 固定连窗' : '🔄 自由转看') + '</button>' : '') +
        (opts.onResetView ? '<button class="chip-sm" data-act="reset-view" title="回正正面视角">↺ 回正</button>' : '') +
        (opts.onCycleBgm ? '<button class="chip-sm" data-act="bgm" data-bgmbadge>🎵 ' + esc(opts.bgmState?.customTitle || bgmMeta.shortName) + '</button>' : '') +
        '<button class="chip-sm" data-act="mute">' + (opts.muted ? '🔇' : '🔊') + '</button>' +
        '<button class="chip-sm" data-act="exit">返回</button>' +
      '</div>'
    this.el.appendChild(bar)

    const bot = document.createElement('div')
    bot.id = 'hv4-bottom'
    bot.className = 'hv4-bottom-banner'
    bot.textContent = opts.modeMeta.desc
    this.el.appendChild(bot)

    this._hv4 = {
      modeId,
      maxStage,
      stageNum: 1,
      scoreNum: 0,
      accNum: 100,
      tier: qs(bar, '[data-tier]'),
      phase: qs(bar, '[data-phase]'),
      pattern: qs(bar, '[data-pattern]'),
      stage: qs(bar, '[data-stage]'),
      correct: qs(bar, '[data-correct]'),
      acc: qs(bar, '[data-acc]'),
      score: qs(bar, '[data-score]'),
      timeWrap: qs(bar, '[data-timewrap]'),
      time: qs(bar, '[data-time]'),
      shield: qs(bar, '[data-shield]'),
      bot
    }

    if (opts.showHintBtn && opts.onHint) qs(bar, '[data-act="hint"]').onclick = () => opts.onHint()
    if (opts.onToggleOrbit) qs(bar, '[data-act="orbit"]').onclick = () => opts.onToggleOrbit()
    if (opts.onResetView) qs(bar, '[data-act="reset-view"]').onclick = () => opts.onResetView()
    if (opts.onCycleBgm) qs(bar, '[data-act="bgm"]').onclick = () => opts.onCycleBgm()
    const muteBtn = qs(bar, '[data-act="mute"]')
    muteBtn.onclick = () => {
      const m = opts.onMute()
      muteBtn.textContent = m ? '🔇' : '🔊'
    }
    qs(bar, '[data-act="exit"]').onclick = () => opts.onExit()
  }

  /** @param {{ stage?: number, phaseText?: string, aiPattern?: string, score?: number, accuracyPct?: number, correctCount?: number, timeLeftSec?: number|null, shield?: number, bottomText?: string }} p */
  updateMinigameHud(p) {
    if (!this._hv4) return
    const h = this._hv4
    if (p.phaseText !== undefined) h.phase.textContent = p.phaseText
    if (p.aiPattern !== undefined) h.pattern.textContent = p.aiPattern
    if (p.stage !== undefined) {
      h.stageNum = Number(p.stage) || 1
      h.stage.textContent = String(h.stageNum) + '/' + h.maxStage
    }
    if (p.correctCount !== undefined) h.correct.textContent = String(p.correctCount)
    if (p.accuracyPct !== undefined) {
      h.accNum = Math.round(p.accuracyPct)
      h.acc.textContent = String(h.accNum) + '%'
    }
    if (p.score !== undefined) {
      h.scoreNum = Math.round(p.score)
      h.score.textContent = String(h.scoreNum)
    }
    if (h.tier && (p.score !== undefined || p.stage !== undefined)) {
      const tier = evaluateRunTier({ gameMode: h.modeId, score: h.scoreNum, stageReached: h.stageNum, accuracyPct: h.accNum })
      const nextText = tier.icon + ' ' + tier.code + ' · ' + tier.title
      if (h.tier.textContent !== nextText) {
        h.tier.textContent = nextText
        h.tier.className = 'tier-pill ' + tier.cssClass
      }
    }
    if (p.shield !== undefined) h.shield.textContent = String(p.shield)
    if (p.timeLeftSec !== undefined) {
      if (p.timeLeftSec === null) h.timeWrap.style.display = 'none'
      else {
        h.timeWrap.style.display = 'inline'
        h.time.textContent = String(Math.max(0, Math.ceil(p.timeLeftSec)))
      }
    }
    if (p.bottomText !== undefined && h.bot) h.bot.textContent = p.bottomText
  }

  /**
   * Minigame completion card with AI Inspector Debrief, postcard, rank & quick replay.
   * @param {{
   *   modeMeta: any, dormMeta: any, summary: any, debrief: any, aiSource: string,
   *   postcard: string, rank: number, myRank: any, nickname: string,
   *   onReplay: Function, onLeaderboard: Function, onHub: Function, onNicknameChange: (name: string) => void
   * }} opts
   */
  showMinigameResult(opts) {
    this.hideAll()
    const { modeMeta, dormMeta, summary, debrief, aiSource, postcard, rank, myRank } = opts
    const tier = evaluateRunTier({
      gameMode: summary.gameMode || modeMeta?.id,
      score: summary.score || 0,
      stageReached: summary.stageReached || 1,
      accuracyPct: summary.accuracyPct ?? 100
    })
    const stageProgText = tier.milestoneText + ' · 准确率 ' + (summary.accuracyPct ?? 100) + '%'
    const nextHint = tier.nextTier
      ? '距 <b>' + tier.nextTier.icon + ' ' + tier.nextTier.code + ' · ' + esc(tier.nextTier.title) + '</b> 仅差 <b>' + tier.pointsToNext + '</b> 分'
      : '👑 已达最高段位「全校熄灯传说」！'

    const s = this._layer()
    s.classList.add('result-screen')
    s.innerHTML = '<div class="result-scroll">' +
      '<div class="panel glass result-panel">' +
        '<div class="kicker">' + esc(dormMeta.name + ' · ' + modeMeta.name) + '</div>' +
        '<h2 class="h2">' + esc(debrief?.rankTitle || debrief?.verdictTitle || '夜间巡查完成') + '</h2>' +
        '<div class="tier-medal-card">' +
          '<div class="tmc-top">' +
            '<div class="tmc-badge"><span class="tmc-code ' + tier.cssClass + '">' + tier.icon + ' ' + tier.code + '</span><span class="tmc-title">' + esc(tier.title) + '</span></div>' +
            '<div class="tmc-stage">' + esc(stageProgText) + '</div>' +
          '</div>' +
          '<div class="tmc-bar"><i style="width:' + Math.round(tier.stageRatio * 100) + '%"></i></div>' +
          '<div class="tmc-next">' + nextHint + '</div>' +
        '</div>' +
        '<div class="statgrid">' +
          '<div class="cell"><b>' + (summary.score || 0) + '</b><span>夜巡积分</span></div>' +
          '<div class="cell"><b>' + (summary.accuracyPct ?? 100) + '%</b><span>准确率</span></div>' +
          '<div class="cell"><b>第 ' + (summary.stageReached || 1) + '/' + tier.maxStage + ' ' + (summary.gameMode === 'patrol_reflex' ? '波' : '关') + '</b><span>挑战深度</span></div>' +
          '<div class="cell"><b>' + (summary.correctCount || 0) + '</b><span>正确点亮</span></div>' +
        '</div>' +
        (rank || (myRank && myRank.rank)
          ? '<div class="rank-line">当前榜单第 <b>#' + (myRank?.rank || rank) + '</b> 名' + (myRank ? ' · 领先 ' + myRank.percentile + '% 同学' : '') + '</div>'
          : '') +
        '<div class="letter">' +
          '<div class="letter-from">AI 夜巡评语 · ' + esc(sourceLabel(aiSource)) + '</div>' +
          '<p class="letter-body">' + esc(debrief?.auntComment || debrief?.comment || '') + '</p>' +
          '<div class="letter-sign">' + esc(debrief?.deanComment || debrief?.deanNote || '') + '</div>' +
          (debrief?.sleepTip ? '<div class="note" style="margin-top:8px;">🌙 助眠小贴士：' + esc(debrief.sleepTip) + '</div>' : '') +
        '</div>' +
        (postcard ? '<img class="postcard" alt="夜巡明信片" src="' + postcard + '"/>' : '') +
        (postcard ? '<a class="btn ghost" download="light-patrol-' + Date.now() + '.png" href="' + postcard + '"><span data-icon="download"></span>保存纪念明信片</a>' : '') +
        '<div class="result-actions">' +
          '<button class="btn primary" data-act="replay"><span data-icon="replay"></span>再玩一局</button>' +
          '<button class="btn ghost" data-act="board">🏆 查看我的排名</button>' +
          '<button class="btn ghost" data-act="hub"><span data-icon="home"></span>更换宿舍/玩法</button>' +
        '</div>' +
      '</div>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="replay"]').onclick = () => opts.onReplay()
    qs(s, '[data-act="board"]').onclick = () => opts.onLeaderboard()
    qs(s, '[data-act="hub"]').onclick = () => opts.onHub()
  }

  // ------------------------------------------------------------- NPC Weather Cast Gallery

  /**
   * Browse all 8 campus NPCs & test weather/season outfits live.
   * @param {{ season: string, weather: string, onSeason: (s: string) => void, onWeather: (w: string) => void, onClose: Function }} opts
   */
  showNpcGallery(opts) {
    let curSeason = opts.season || 'autumn'
    let curWeather = opts.weather || 'clear'
    const s = this._layer()

    const renderGrid = () => {
      const outfitKey = outfitForEnv(curWeather, curSeason)
      const label = OUTFIT_LABELS[outfitKey] || '值班常服'
      const cards = Object.values(NPC_CATALOG).map(npc =>
        '<div class="npc-card">' +
          '<div class="npc-card-art">' + renderNpcPortraitSvg(npc.id, curWeather, curSeason) + '</div>' +
          '<b>' + esc(npc.name) + '</b>' +
          '<span>' + esc(npc.role) + ' · ' + esc(npc.propHint) + '</span>' +
        '</div>'
      ).join('')

      s.innerHTML = '<div class="panel glass wide">' +
        '<div class="kicker">CAMPUS NPC WEATHER OUTFITS</div>' +
        '<h2 class="h2">全校人物换装图鉴 · ' + esc(label) + '</h2>' +
        '<div class="filter-bar">' +
          SEASONS.map(ss => '<button class="chip-sm ' + (ss.id === curSeason ? 'on' : '') + '" data-ns="' + esc(ss.id) + '">' + esc(ss.name) + '</button>').join('') +
        '</div>' +
        '<div class="filter-bar">' +
          WEATHER_CATALOG.map(ww => '<button class="chip-sm ' + (ww.id === curWeather ? 'on' : '') + '" data-nw="' + esc(ww.id) + '">' + esc(ww.name) + '</button>').join('') +
        '</div>' +
        '<div class="npc-cast-grid">' + cards + '</div>' +
        '<button class="btn ghost" data-act="back"><span data-icon="close"></span>返回校园</button>' +
      '</div>'
      paintIcons(s)
      qs(s, '[data-act="back"]').onclick = () => opts.onClose()
      for (const b of qsa(s, '[data-ns]')) {
        b.onclick = () => {
          curSeason = b.getAttribute('data-ns') || 'autumn'
          opts.onSeason(curSeason)
          renderGrid()
        }
      }
      for (const b of qsa(s, '[data-nw]')) {
        b.onclick = () => {
          curWeather = b.getAttribute('data-nw') || 'clear'
          opts.onWeather(curWeather)
          renderGrid()
        }
      }
    }
    renderGrid()
  }

  // ------------------------------------------------------------- v3 Prologue & Intro (preserved)

  showPrologue({ onChoose }) {
    this.hideAll()
    const s = this._layer()
    const cards = MOOD_TOKENS.map((m, i) => '<button class="mood-card" data-mood="' + esc(m.id) + '">' +
      '<span class="mood-icon" data-icon="' + (MOOD_ICONS[i] || 'star') + '"></span>' +
      '<b>' + esc(m.name) + '</b>' +
      '<span class="mood-hint">' + esc(m.hint) + '</span>' +
    '</button>').join('')
    s.innerHTML = '<div class="panel glass">' +
      '<div class="kicker">今夜心境</div>' +
      '<h2 class="h2">选一件夜巡小物</h2>' +
      '<p class="lede">只影响今夜的天色与节奏</p>' +
      '<div class="mood-grid">' + cards + '</div>' +
    '</div>'
    paintIcons(s)
    for (const b of qsa(s, '.mood-card')) b.onclick = () => onChoose(b.getAttribute('data-mood'))
  }

  intro(lines, onDone) {
    this.hideAll()
    const wrap = document.createElement('div')
    wrap.id = 'intro'
    wrap.innerHTML = '<div class="intro-inner">' +
      '<div id="intro-line" class="intro-line"></div>' +
      '<button id="intro-skip" class="intro-skip">跳过 ▸</button>' +
    '</div>'
    document.body.appendChild(wrap)
    requestAnimationFrame(() => wrap.classList.add('on'))
    const lineEl = qs(wrap, '#intro-line')
    let idx = 0, typing = false, finished = false
    /** @type {any} */ let timer = 0

    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      wrap.classList.remove('on')
      setTimeout(() => { wrap.remove(); onDone && onDone() }, 520)
    }
    const typeLine = () => {
      if (finished) return
      if (idx >= lines.length) { setTimeout(finish, 820); return }
      const text = lines[idx]
      lineEl.textContent = ''
      typing = true
      let i = 0
      const step = () => {
        if (finished) return
        if (i <= text.length) {
          lineEl.textContent = text.slice(0, i); i += 1; timer = setTimeout(step, 54)
        } else {
          typing = false; idx += 1; timer = setTimeout(typeLine, 1050)
        }
      }
      step()
    }
    wrap.addEventListener('pointerdown', e => {
      const target = e.target
      if (target instanceof HTMLElement && target.id === 'intro-skip') return
      if (typing) {
        clearTimeout(timer); typing = false; lineEl.textContent = lines[idx]; idx += 1; timer = setTimeout(typeLine, 320)
      } else finish()
    })
    qs(wrap, '#intro-skip').onclick = e => { e.stopPropagation(); finish() }
    typeLine()
  }

  // ------------------------------------------------------------------ v3 Story HUD + VN Chapter Opener

  showChapterOpener({ chapter, dormMeta, commissions, bgmState, onCycleBgm, onStart, onBack }) {
    this.hideAll()
    const bgmMeta = bgmTrackDef(bgmState?.mode || 'auto')
    const s = this._layer()
    const beatsHtml = (chapter.beats || []).map(b => {
      const npc = NPC_CATALOG[b.speakerId] || NPC_CATALOG.aunt_lin
      return '<div class="chap-beat">' +
        '<span class="cb-spk">' + esc(npc.name) + ' · ' + esc(npc.role) + '</span>' +
        '<p class="cb-line">' + esc(b.line) + '</p>' +
      '</div>'
    }).join('')

    const goalsHtml = (commissions || []).map(c => '<li>' + esc(c.label) + '</li>').join('')

    s.innerHTML = '<div class="panel glass chapter-panel">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<div class="kicker" style="margin-bottom:0;">' + esc(chapter.kicker + ' · ' + dormMeta.shortName) + '</div>' +
        (onCycleBgm ? '<button class="chip-sm" type="button" data-act="bgm" data-bgmbadge>🎵 ' + esc(bgmState?.customTitle || bgmMeta.shortName) + '</button>' : '') +
      '</div>' +
      '<h2 class="h2" style="margin-top:8px;">' + esc(chapter.title) + '</h2>' +
      '<p class="chap-cue">' + esc(chapter.sceneCue) + '</p>' +
      '<div class="chap-beats">' + beatsHtml + '</div>' +
      '<div class="chap-rules">' +
        '<div class="cr-head">75s 内达成任意 1 项即过关</div>' +
        '<ul class="cr-goals">' + goalsHtml + '</ul>' +
        '<div class="cr-legend">' +
          '<span>✨ <b>微光</b> · 点/划亮</span>' +
          '<span>🏮 <b>信标</b> · 抉择</span>' +
          '<span>🌟 <b>星轨</b> · 连两窗</span>' +
        '</div>' +
      '</div>' +
      '<div class="dialog-actions" style="margin-top:14px;">' +
        '<button class="btn primary" type="button" data-act="go">开始第 ' + chapter.night + ' 夜</button>' +
        (onBack ? '<button class="btn ghost" type="button" data-act="back">返回</button>' : '') +
      '</div>' +
    '</div>'
    paintIcons(s)
    if (onCycleBgm) qs(s, '[data-act="bgm"]').onclick = () => onCycleBgm()
    qs(s, '[data-act="go"]').onclick = () => onStart()
    if (onBack) qs(s, '[data-act="back"]').onclick = () => onBack()
  }

  startNight({ night, index, count, commissions, muted, totalWindows = 24, dormMeta, bgmState, onCycleBgm, orbitLocked = true, onToggleOrbit, onResetView, onAdvanceNight, onPause, onMute, onPingCommission, onReplayTutorial }) {
    this.hideAll()
    const bgmMeta = bgmTrackDef(bgmState?.mode || 'auto')
    const hud = document.createElement('div')
    hud.id = 'hud'
    const ledger = (commissions || []).map((c, i) => '<div class="ledger-item" data-cid="' + esc(c.id || c.type) + '" data-cidx="' + i + '" title="点击在楼栋定位目标">' +
      '<span class="ledger-dot"></span>' +
      '<div class="ledger-row-main">' +
        '<span class="ledger-label">' + esc(c.label) + '</span>' +
        '<span class="ledger-count" data-count>0/' + Number(c.target || 1) + '</span>' +
      '</div>' +
      '<span class="ledger-prog"><i></i></span>' +
    '</div>').join('')

    hud.innerHTML = '<div class="hud-top">' +
        '<div class="brand"><b>' + esc(dormMeta ? dormMeta.shortName : '17号楼') + '</b><span>第 ' + (index + 1) + '/' + count + ' 夜 · ' + esc(weatherLabel(night && night.weather)) + '</span></div>' +
        '<div class="stats">' +
          '<div class="stat"><span class="lab">温暖</span><b data-warm>0</b></div>' +
          '<div class="warmbar"><i data-warmbar></i></div>' +
          '<div class="stat"><span class="lab">连击</span><b data-combo>0</b></div>' +
          '<div class="stat"><span class="lab">窗</span><b data-lit>0</b><span class="lab">/' + totalWindows + '</span></div>' +
          '<div class="stat time"><span class="lab">余时</span><b data-time>' + Math.ceil(75) + '</b><span class="lab">s</span></div>' +
          '<span class="tier-pill tier-d" data-tier>🕯️ D · 见习点灯生</span>' +
          '<div class="flow-pill flow-state-flow" id="flow-pill" title="夜巡心流状态"><i class="flow-dot"></i><span data-flow-text>心流</span></div>' +
        '</div>' +
        '<div class="hud-actions">' +
          (onToggleOrbit ? '<button class="chip-sm ' + (orbitLocked ? 'on' : '') + '" type="button" data-act="orbit" data-orbitbadge title="固定连窗 / 自由转看">' + (orbitLocked ? '🔒 固定连窗' : '🔄 自由转看') + '</button>' : '') +
          (onResetView ? '<button class="chip-sm" type="button" data-act="reset-view" title="回正视角">↺</button>' : '') +
          (onCycleBgm ? '<button class="chip-sm" type="button" data-act="bgm" data-bgmbadge title="切换配乐">🎵 ' + esc(bgmState?.customTitle || bgmMeta.shortName) + '</button>' : '') +
          '<button class="chip-sm" type="button" data-act="rules" title="操作提示">?</button>' +
          '<button class="iconbtn" data-act="mute" data-icon="' + (muted ? 'mute' : 'sound') + '" title="声音"></button>' +
          '<button class="iconbtn" data-act="pause" data-icon="pause" title="暂停"></button>' +
        '</div>' +
      '</div>' +
      '<div class="ledger-dock glass" id="ledger">' +
        '<div class="ledger-head">' +
          '<span class="kicker" data-pass-status>目标 0/' + (commissions || []).length + ' · 达 1 项过关</span>' +
          '<div class="ledger-head-btns">' +
            '<button class="chip-sm" type="button" data-act="next-night" style="display:none;">进下一夜 ▸</button>' +
            '<button class="chip-sm" type="button" data-act="collapse">收起 ▾</button>' +
          '</div>' +
        '</div>' +
        '<div class="ledger-body" data-lbody>' +
          '<div class="ledger-grid">' + ledger + '</div>' +
        '</div>' +
      '</div>'

    this.el.appendChild(hud)
    paintIcons(hud)
    requestAnimationFrame(() => hud.classList.add('on'))
    qs(hud, '[data-act="pause"]').onclick = onPause
    if (onToggleOrbit) qs(hud, '[data-act="orbit"]').onclick = () => onToggleOrbit()
    if (onResetView) qs(hud, '[data-act="reset-view"]').onclick = () => onResetView()
    if (onCycleBgm) qs(hud, '[data-act="bgm"]').onclick = () => onCycleBgm()
    qs(hud, '[data-act="mute"]').onclick = () => {
      const m = onMute()
      const btn = qs(hud, '[data-act="mute"]')
      btn.setAttribute('data-icon', m ? 'mute' : 'sound')
      paintIcons(btn.parentNode || hud)
    }

    const bodyEl = qs(hud, '[data-lbody]')
    const colBtn = qs(hud, '[data-act="collapse"]')
    if (bodyEl && colBtn) {
      colBtn.onclick = () => {
        const collapsed = bodyEl.classList.toggle('collapsed')
        colBtn.textContent = collapsed ? '展开目标 ▴' : '收起 ▾'
      }
    }

    const nextNightBtn = qs(hud, '[data-act="next-night"]')
    if (nextNightBtn && onAdvanceNight) {
      nextNightBtn.onclick = () => onAdvanceNight()
    }

    const ledgerItems = qsa(hud, '.ledger-item')
    ledgerItems.forEach(item => {
      item.onclick = () => {
        const cidx = Number(item.getAttribute('data-cidx'))
        const c = commissions && commissions[cidx]
        if (c && onPingCommission) {
          onPingCommission(c)
        }
      }
    })

    const rulesBtn = qs(hud, '[data-act="rules"]')
    if (rulesBtn) {
      rulesBtn.onclick = () => {
        if (onReplayTutorial) {
          this.toast('重播新手教学', '已为您重置教学指引')
          onReplayTutorial()
        } else {
          this.toast('默认「🔒固定连窗」不误转楼！点/划亮微光窗完成底部任意 1 项即过关', '星轨支持拖连或先后点击两窗 · 点「🔄自由转看」可转楼欣赏')
        }
      }
    }

    this.hudEl = hud
    this._warmEl = qs(hud, 'b[data-warm]')
    this._barEl = qs(hud, 'i[data-warmbar]')
    this._comboEl = qs(hud, 'b[data-combo]')
    this._timeEl = qs(hud, 'b[data-time]')
    this._litEl = qs(hud, 'b[data-lit]')
    this._ledger = qs(hud, '#ledger')
    this._passStatus = qs(hud, '[data-pass-status]')
    this._nextNightBtn = nextNightBtn
    this._nightTierEl = qs(hud, '[data-tier]')
    this._dirty = { sec: -1, warmth: -1, combo: -1, lit: -1 }
  }

  tick(game) {
    if (!this._timeEl || !game.night) return
    const sec = Math.ceil(game.night.timeLeft)
    if (sec !== this._dirty.sec) {
      this._dirty.sec = sec
      this._timeEl.textContent = String(sec)
      this._timeEl.classList.toggle('urgent', sec <= 10)
    }
    this.setStats(game)
    this.updateWindowTags(game)
  }

  setStats(game) {
    if (!game.night) return
    const n = game.night
    if (this._warmEl && n.warmth !== this._dirty.warmth) {
      this._dirty.warmth = n.warmth
      this._warmEl.textContent = String(n.warmth)
      if (this._barEl) this._barEl.style.setProperty('--p', String(Math.min(1, n.warmth / 460)))
      if (this._nightTierEl) {
        const totalWarmth = (game.run?.totalWarmth || 0) + n.warmth
        const tier = evaluateRunTier({ gameMode: 'star_sweep', score: totalWarmth, stageReached: (n.index || 0) + 1 })
        const nextText = tier.icon + ' ' + tier.code + ' · ' + tier.title
        if (this._nightTierEl.textContent !== nextText) {
          this._nightTierEl.textContent = nextText
          this._nightTierEl.className = 'tier-pill ' + tier.cssClass
        }
      }
    }
    if (this._comboEl && n.combo !== this._dirty.combo) {
      this._dirty.combo = n.combo
      this._comboEl.textContent = String(n.combo)
    }
    if (this._litEl && n.litCount !== this._dirty.lit) {
      this._dirty.lit = n.litCount
      this._litEl.textContent = String(n.litCount)
    }
  }

  updateCommissions(items, status) {
    if (!this._ledger) return
    const list = items || []
    let doneCount = 0
    for (const item of list) {
      if (item.done) doneCount += 1
      const row = this._ledger.querySelector('[data-cid="' + String(item.id).replace(/"/g, '') + '"]')
      if (!row) continue
      const bar = row.querySelector('.ledger-prog i')
      if (bar) bar.style.setProperty('--p', String(Math.min(1, item.progress / item.target)))
      const countEl = row.querySelector('[data-count]')
      if (countEl) countEl.textContent = item.done ? '✓ ' + item.target + '/' + item.target : item.progress + '/' + item.target
      row.classList.toggle('done', item.done)
    }
    if (this._passStatus) {
      if (doneCount > 0) {
        this._passStatus.textContent = status?.allDone
          ? `🏆 全 3 项已满贯`
          : `✓ 已过关 (${doneCount}/${list.length})`
        this._passStatus.classList.add('passed')
      } else {
        this._passStatus.textContent = `目标 0/${list.length} · 达 1 项过关`
        this._passStatus.classList.remove('passed')
      }
    }
    if (this._nextNightBtn) {
      if (doneCount > 0) {
        this._nextNightBtn.style.display = 'inline-block'
        this._nextNightBtn.classList.add('on')
        this._nextNightBtn.textContent = status?.isLastNight ? '提前揭晓终局 ▸' : '提前进下一夜 ▸'
      } else {
        this._nextNightBtn.style.display = 'none'
      }
    }
  }

  stampCommission(id, label) {
    if (!this._ledger) return
    const row = this._ledger.querySelector('[data-cid="' + String(id).replace(/"/g, '') + '"]')
    if (row) {
      row.classList.add('done', 'stamped')
      const seal = document.createElement('span')
      seal.className = 'seal'
      seal.textContent = '印'
      row.appendChild(seal)
      setTimeout(() => seal.classList.add('settled'), 20)
    }
    this.toast('火漆盖章 · ' + (label || '委托完成'), '+12')
  }

  // ------------------------------------------------------------- feedback

  combo(n) {
    let c = document.getElementById('combo')
    if (!c) {
      c = document.createElement('div')
      c.id = 'combo'
      this.el.appendChild(c)
    }
    if (!n || n < 2) { c.classList.remove('show'); return }
    const words = n >= 15 ? '灯海' : n >= 10 ? '光链' : n >= 6 ? '连击' : '点亮'
    c.innerHTML = '<div class="n">×' + n + '</div><div class="t">' + words + '</div>'
    c.classList.add('show')
  }

  floatText(text, x, y, color, kind) {
    if (!this.fx) return
    const d = document.createElement('div')
    d.className = 'pop' + (kind === 'big' ? ' big' : '')
    d.textContent = text
    d.style.color = color || '#ffe7b0'
    d.style.left = x + 'px'
    d.style.top = y + 'px'
    this.fx.appendChild(d)
    const anim = d.animate([
      { opacity: 1, transform: 'translate(-50%,-50%) translateY(0) scale(1)' },
      { opacity: 0, transform: 'translate(-50%,-50%) translateY(-68px) scale(1.12)' }
    ], { duration: 900, easing: 'cubic-bezier(.2,.9,.25,1)' })
    anim.onfinish = () => d.remove()
  }

  shockwave(x, y) {
    if (!this.fx) return
    const d = document.createElement('div')
    d.className = 'shock'
    d.style.left = x + 'px'
    d.style.top = y + 'px'
    this.fx.appendChild(d)
    const anim = d.animate([
      { width: '12px', height: '12px', opacity: 0.9 },
      { width: '132px', height: '132px', opacity: 0 }
    ], { duration: 540, easing: 'cubic-bezier(.2,.8,.3,1)' })
    anim.onfinish = () => d.remove()
  }

  /**
   * Floating circular gold sequence badge popped during drag chains (auto-fading in 0.6s).
   * @param {number} x
   * @param {number} y
   * @param {number} count
   */
  showSequenceBadge(x, y, count) {
    if (!this.fx) return
    const BADGES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
    const idx = Math.max(1, Math.min(10, Number(count) || 1))
    const char = BADGES[idx - 1]
    const d = document.createElement('div')
    d.className = 'seq-badge'
    d.textContent = char
    d.style.left = Math.round(x) + 'px'
    d.style.top = Math.round(y) + 'px'
    this.fx.appendChild(d)
    const anim = d.animate([
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.22)', opacity: 1, offset: 0.28 },
      { transform: 'translate(-50%, calc(-50% - 18px)) scale(1.0)', opacity: 0 }
    ], { duration: 600, easing: 'cubic-bezier(.18,.85,.25,1)' })
    anim.onfinish = () => d.remove()
  }

  toast(text, gain) {
    const old = document.getElementById('toast')
    if (old) old.remove()
    const d = document.createElement('div')
    d.id = 'toast'
    d.innerHTML = '<span class="tw" data-icon="star"></span><span class="tb"><b>' + esc(text) + '</b>' + (gain ? '<em>' + esc(gain) + '</em>' : '') + '</span>'
    document.body.appendChild(d)
    paintIcons(d)
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => d.remove(), 2400)
  }

  hideHintBubble() {
    clearTimeout(this._hintBubbleTimer)
    this._hintBubbleTimer = 0
    if (this._hintBubbleDismiss) {
      window.removeEventListener('pointerdown', this._hintBubbleDismiss)
      this._hintBubbleDismiss = null
    }
    const old = document.getElementById('hint-bubble')
    if (old) old.remove()
  }

  /**
   * Show contextual tooltip speech bubble pointing at a target button/element.
   * @param {string|HTMLElement} target
   * @param {string} text
   * @param {string} [subtext]
   * @param {number} [durationMs=3200]
   */
  showHintBubble(target, text, subtext = '', durationMs = 3200) {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) return
    this.hideHintBubble()

    const r = el.getBoundingClientRect()
    const bubble = document.createElement('div')
    bubble.id = 'hint-bubble'
    bubble.className = 'hint-bubble'
    bubble.innerHTML = '<div class="hint-arrow"></div><div class="hint-title">' + esc(text) + '</div>' +
      (subtext ? '<div class="hint-sub">' + esc(subtext) + '</div>' : '')
    document.body.appendChild(bubble)

    const bubbleRect = bubble.getBoundingClientRect()
    let left = r.left + r.width / 2 - bubbleRect.width / 2
    left = Math.max(12, Math.min(window.innerWidth - bubbleRect.width - 12, left))
    let top = r.bottom + 10
    if (top + bubbleRect.height > window.innerHeight - 10) {
      top = r.top - bubbleRect.height - 10
      bubble.classList.add('arrow-bottom')
    } else {
      bubble.classList.add('arrow-top')
    }
    const arrow = bubble.querySelector('.hint-arrow')
    if (arrow instanceof HTMLElement) {
      const arrowLeft = Math.max(12, Math.min(bubbleRect.width - 16, r.left + r.width / 2 - left))
      arrow.style.left = arrowLeft + 'px'
    }
    bubble.style.left = Math.round(left) + 'px'
    bubble.style.top = Math.round(top) + 'px'
    requestAnimationFrame(() => bubble.classList.add('show'))

    const dismiss = () => {
      clearTimeout(this._hintBubbleTimer)
      this._hintBubbleTimer = 0
      if (this._hintBubbleDismiss) {
        window.removeEventListener('pointerdown', this._hintBubbleDismiss)
        this._hintBubbleDismiss = null
      }
      bubble.classList.remove('show')
      setTimeout(() => bubble.remove(), 260)
    }
    this._hintBubbleDismiss = dismiss
    window.addEventListener('pointerdown', dismiss, { once: true })
    this._hintBubbleTimer = setTimeout(dismiss, durationMs)
  }

  banner(text, sub) {
    const d = document.createElement('div')
    d.className = 'lit-banner'
    d.innerHTML = '<b>' + esc(text) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '')
    this.el.appendChild(d)
    requestAnimationFrame(() => d.classList.add('show'))
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 520) }, 1700)
  }

  flash(kind) {
    if (!this.fx) return
    const d = document.createElement('div')
    d.className = 'screenflash ' + (kind === 'golden' ? 'golden' : 'warm')
    this.fx.appendChild(d)
    const anim = d.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 720, easing: 'ease-out' })
    anim.onfinish = () => d.remove()
  }

  // -------------------------------------------------------------- choices

  showChoice({ story, resident, whisper, onLike, onChoose, onTimeout }) {
    this.hideChoice()
    const card = document.createElement('div')
    card.id = 'choice'
    const options = (story.choices || []).map(c => '<button class="choice-btn" data-choice="' + esc(c.id) + '">' +
      '<span class="choice-id">' + esc(c.id) + '</span><span class="choice-label">' + esc(c.label) + '</span>' +
    '</button>').join('')
    const whisperHtml = whisper ? '<div class="whisper-note">' +
      '<span class="whisper-text">「' + esc(whisper.content) + '」</span>' +
      '<span class="whisper-from">· ' + esc(whisper.nickname || '远方的守夜人') + '</span>' +
      '<button class="whisper-like" data-like="' + Number(whisper.id) + '"><span data-icon="heart"></span><b>' + Number(whisper.resonances || 0) + '</b></button>' +
    '</div>' : ''

    card.innerHTML = '<div class="choice-card glass">' +
      '<div class="choice-head"><span class="kicker">' + esc(resident ? resident.resident : '窗后的小事') + '</span>' +
        '<span class="freeze">⏱ 倒计时已暂停 · 安心抉择</span></div>' +
      '<p class="choice-text">' + esc(story.text) + '</p>' +
      whisperHtml +
      '<div class="choice-opts">' + options + '</div>' +
      '<div class="choice-bar"><i></i></div>' +
    '</div>'
    this.el.appendChild(card)
    paintIcons(card)
    requestAnimationFrame(() => card.classList.add('on'))

    for (const b of qsa(card, '.choice-btn')) {
      b.onclick = () => {
        const id = b.getAttribute('data-choice')
        const choice = (story.choices || []).find(c => c.id === id) || story.choices[0]
        this.hideChoice()
        onChoose(choice)
      }
    }
    const likeBtn = qs(card, '[data-like]')
    if (likeBtn) {
      likeBtn.onclick = async () => {
        const n = await onLike(Number(likeBtn.getAttribute('data-like')))
        if (typeof n === 'number') qs(likeBtn, 'b').textContent = String(n)
      }
    }
    this._choiceTimer = setTimeout(() => { this.hideChoice(); onTimeout() }, 20000)
    this._choiceEl = card
  }

  hideChoice() {
    clearTimeout(this._choiceTimer)
    if (this._choiceEl) { this._choiceEl.remove(); this._choiceEl = null }
    const n = document.getElementById('choice')
    if (n) n.remove()
  }

  storyResult({ choiceLabel, outcome, auto, item }) {
    const d = document.createElement('div')
    d.className = 'story-flash'
    d.innerHTML = '<div class="sf-head">' + esc(choiceLabel) + (auto ? ' · 默认' : '') + '</div>' +
      '<div class="sf-body">' + esc(outcome) + '</div>' +
      (item ? '<div class="sf-item">收进今晚的小物件：' + esc(item) + '</div>' : '')
    this.el.appendChild(d)
    requestAnimationFrame(() => d.classList.add('on'))
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 480) }, 4200)
  }

  // ------------------------------------------------------------- summaries & v3 result

  nightSummary(sum, onNext) {
    this.hideAll()
    const titles = ['螺蛳粉危机暂歇，更大的瓜要炸了', '广播忘关大社死！全楼吃瓜停不下来', '换电表前最后一夜，全楼笑完安稳睡']
    const s = this._layer()
    s.innerHTML = '<div class="panel glass center">' +
      '<div class="kicker">第 ' + sum.night + ' 晚 · ' + (sum.minPassed ? '✓ 过关达成' : '手记收尾') + '</div>' +
      '<h2 class="h2">' + esc(titles[sum.night - 1] || '灯，亮了') + '</h2>' +
      '<div class="statgrid">' +
        '<div class="cell"><b>' + sum.warmth + '</b><span>温暖</span></div>' +
        '<div class="cell"><b>' + sum.lit + '</b><span>点亮窗</span></div>' +
        '<div class="cell"><b>' + sum.maxCombo + '</b><span>最高连击</span></div>' +
        '<div class="cell"><b>' + sum.stamps + '</b><span>火漆章</span></div>' +
      '</div>' +
      '<p class="lede center">' + (sum.allLit ? '整栋楼都亮过了。' : '这一晚的光路已经被大楼记下。') + (sum.resonanceCount ? ' 你接通了 ' + sum.resonanceCount + ' 道跨窗星轨。' : '') + '</p>' +
      '<div class="commission-recap">' + (sum.commissions || []).map(c => '<span class="recap ' + (c.done ? 'on' : '') + '">' + esc(c.label) + '</span>').join('') + '</div>' +
      (sum.cliffhanger ? '<div class="cliffhanger-box"><div class="cf-tag">📖 下夜悬念预告</div><p>' + esc(sum.cliffhanger) + '</p></div>' : '') +
      '<button class="btn primary" data-act="next">' + (sum.night === sum.count ? '揭晓最终结局与信件 ▸' : '继续第 ' + (sum.night + 1) + ' 晚 · 追查真相 ▸') + '</button>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="next"]').onclick = onNext
  }

  showEnding({ ending }) {
    const script = endingScript(ending.id)
    const d = document.createElement('div')
    d.className = 'ending-card'
    d.innerHTML = '<div class="ending-badge" data-icon="star"></div>' +
      '<div class="kicker">ENDING · ' + esc(ending.type) + '</div>' +
      '<h2 class="ending-name">' + esc(ending.name) + '</h2>' +
      '<p class="ending-narration">' + esc(script.narration) + '</p>' +
      '<div class="ending-title">称号 · ' + esc(ending.title) + '</div>' +
      '<div class="ending-motto">' + esc(script.motto) + '</div>'
    this.el.appendChild(d)
    paintIcons(d)
    requestAnimationFrame(() => d.classList.add('on'))
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 700) }, 3600)
  }

  showResult(opts) {
    this.hideAll()
    const { run, records, postcard, ending, letter, rank, aiSource, suggestedWhisper } = opts
    const dorm = dormDef(run.dormType || 'university')
    const gridWindows = buildWindowIds(dorm.rows, dorm.cols)
    const stageReached = Math.max(1, (run.nights && run.nights.length) || 3)
    const tier = evaluateRunTier({
      gameMode: 'star_sweep',
      score: run.totalWarmth || 0,
      stageReached,
      stampsEarned: run.stampsEarned || 0
    })
    const storyNext = tier.nextTier
      ? '距 <b>' + tier.nextTier.icon + ' ' + tier.nextTier.code + ' · ' + esc(tier.nextTier.title) + '</b> 还差 <b>' + tier.pointsToNext + '</b> 温暖'
      : '👑 已达成三夜传奇守灯传说！'

    const s = this._layer()
    s.classList.add('result-screen')
    s.innerHTML = '<div class="result-scroll">' +
      '<div class="panel glass result-panel">' +
        '<div class="kicker">今晚的明信片 · ' + esc(dorm.shortName) + '</div>' +
        '<h2 class="h2">你点亮了 <span class="accent">' + run.litTotal + '</span> 扇窗</h2>' +
        '<div class="tier-medal-card">' +
          '<div class="tmc-top">' +
            '<div class="tmc-badge"><span class="tmc-code ' + tier.cssClass + '">' + tier.icon + ' ' + tier.code + '</span><span class="tmc-title">' + esc(tier.title) + '</span></div>' +
            '<div class="tmc-stage">' + esc(tier.milestoneText) + ' · ' + (run.stampsEarned || 0) + ' 枚火漆印</div>' +
          '</div>' +
          '<div class="tmc-bar"><i style="width:' + Math.round(tier.stageRatio * 100) + '%"></i></div>' +
          '<div class="tmc-next">' + storyNext + '</div>' +
        '</div>' +
        '<div class="ending-chip"><span class="badge" data-icon="star"></span><span>' + esc(ending.name) + '</span><em>' + esc(run.archetype) + '</em></div>' +
        '<img class="postcard" alt="今晚的明信片" src="' + postcard + '"/>' +
        '<a class="btn ghost" data-act="save" download="light-a-window-' + Date.now() + '.png" href="' + postcard + '"><span data-icon="download"></span>保存明信片</a>' +
        '<div class="statgrid">' +
          '<div class="cell"><b>' + run.totalWarmth + '</b><span>温暖值</span></div>' +
          '<div class="cell"><b>' + run.maxCombo + '</b><span>最高连击</span></div>' +
          '<div class="cell"><b>' + run.resonanceCount + '</b><span>星轨共鸣</span></div>' +
          '<div class="cell"><b>' + run.stampsEarned + '</b><span>火漆章</span></div>' +
        '</div>' +
        (rank ? '<div class="rank-line">全校排行榜第 <b>#' + rank + '</b> 名</div>' : '') +
        '<div class="letter">' +
          '<div class="letter-from">' + esc(letter ? letter.fromRoom : '') + '</div>' +
          '<div class="letter-salutation">' + esc(letter ? letter.salutation : '') + '</div>' +
          '<p class="letter-body">' + esc(letter ? letter.body : '') + '</p>' +
          '<div class="letter-sign">' + esc(letter ? letter.sign : '') + '</div>' +
        '</div>' +
        '<div class="seal-block">' +
          '<div class="kicker">把一句微光封存进窗户</div>' +
          '<p class="lede small">它会留在服务端，被后来路过的人点亮时看见。</p>' +
          '<div class="window-picker" data-picker style="grid-template-columns:repeat(' + dorm.cols + ',1fr)"></div>' +
          '<div class="seal-row"><input data-whisper maxlength="40" placeholder="' + esc(suggestedWhisper || '今晚的雨很轻，祝你也做个好梦。') + '"/><button class="btn primary" data-act="seal"><span data-icon="send"></span>封存</button></div>' +
          '<div class="seal-status" data-status></div>' +
        '</div>' +
        '<div class="result-actions">' +
          '<button class="btn primary" data-act="replay"><span data-icon="replay"></span>再来三晚</button>' +
          (opts.replayEvents && opts.replayEvents.length ? '<button class="btn secondary btn-replay" data-act="watch-replay">🎬 6秒夜巡延时回放</button>' : '') +
          (opts.onLeaderboard ? '<button class="btn ghost" data-act="board">🏆 查看排名</button>' : '') +
          '<button class="btn ghost" data-act="home"><span data-icon="home"></span>回到标题</button>' +
        '</div>' +
        '<div class="note">AI 来源：' + esc(sourceLabel(aiSource)) + ' · 历史最佳 ' + (records.bestWarmth || 0) + '</div>' +
      '</div>' +
    '</div>'
    paintIcons(s)

    const picker = qs(s, '[data-picker]')
    let picked = run.bondRoomId || gridWindows[0].roomId
    for (const win of gridWindows) {
      const b = document.createElement('button')
      b.className = 'wp' + (win.roomId === picked ? ' on' : '')
      b.textContent = String(win.roomId)
      b.title = String(win.roomId) + ' 室'
      b.onclick = () => {
        picked = win.roomId
        for (const other of qsa(picker, '.wp')) other.classList.remove('on')
        b.classList.add('on')
      }
      picker.appendChild(b)
    }

    qs(s, '[data-act="replay"]').onclick = () => opts.onReplay()
    qs(s, '[data-act="home"]').onclick = () => opts.onHome()
    const replayBtn = qs(s, '[data-act="watch-replay"]')
    if (replayBtn) {
      replayBtn.onclick = () => {
        this.playAcceleratedReplay(opts.replayEvents, opts.scene, opts.audio)
      }
    }
    if (opts.onLeaderboard) qs(s, '[data-act="board"]').onclick = () => opts.onLeaderboard()
    const input = qs(s, 'input[data-whisper]')
    const status = qs(s, '[data-status]')
    qs(s, '[data-act="seal"]').onclick = async () => {
      const content = (input.value || '').trim() || String(suggestedWhisper || '').trim()
      if (content.length < 6) { status.textContent = '再写长一点点吧'; status.className = 'seal-status bad'; return }
      status.textContent = '正在封存…'; status.className = 'seal-status'
      const out = await opts.onSealWhisper({ roomId: picked, content })
      if (out) { status.textContent = '已封存进 ' + picked + ' 室，等下一个路过的人'; status.className = 'seal-status good'; input.value = '' }
      else { status.textContent = '暂时封存不了，稍后再试'; status.className = 'seal-status bad' }
    }
  }

  // ------------------------------------------------------- collection & rank-aware leaderboard

  showCollection({ records, onClose }) {
    const unlocked = new Set(records.unlockedEndings || [])
    const tiles = endingGallery().map(e => '<div class="ending-tile ' + (unlocked.has(e.id) ? 'on' : 'locked') + '">' +
      '<span class="et-badge">' + esc(unlocked.has(e.id) ? e.badge : '？') + '</span>' +
      '<b>' + esc(unlocked.has(e.id) ? e.name : '未解锁的结局') + '</b>' +
      '<span class="et-clue">' + esc(unlocked.has(e.id) ? e.title : e.clue) + '</span>' +
    '</div>').join('')

    const residentRows = Object.keys(RESIDENT_ORDER).map(room => {
      const level = Number(records.residentBonds ? records.residentBonds[room] : 0) || 0
      const pips = [1, 2, 3].map(i => '<i class="' + (i <= level ? 'on' : '') + '"></i>').join('')
      return '<div class="resident-row"><span class="rr-name">' + esc(RESIDENT_ORDER[room]) + '</span><span class="pips">' + pips + '</span><span class="rr-bond">' + esc(bondLabel(level)) + '</span></div>'
    }).join('')

    const items = (records.items || []).length
      ? (records.items || []).map(i => '<span class="item-chip">' + esc(i) + '</span>').join('')
      : '<span class="empty">还没有收进任何小物件</span>'

    const s = this._layer()
    s.innerHTML = '<div class="panel glass wide">' +
      '<div class="kicker">守夜人档案 · 结局星图</div>' +
      '<h2 class="h2">已解锁 ' + unlocked.size + ' / 6 个结局</h2>' +
      '<div class="ending-grid">' + tiles + '</div>' +
      '<div class="kicker section">住户羁绊</div>' +
      '<div class="resident-list">' + residentRows + '</div>' +
      '<div class="kicker section">物件图鉴</div>' +
      '<div class="item-list">' + items + '</div>' +
      '<button class="btn ghost" data-act="back"><span data-icon="close"></span>返回</button>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="back"]').onclick = onClose
  }

  /**
   * Filterable, rank-aware leaderboard showing the player's own rank, percentile & gap.
   * @param {{ uid?: string, nickname?: string, defaultMode?: string, defaultDorm?: string, onNicknameChange?: (name: string) => void, onClose: Function }} opts
   */
  async showLeaderboard({ uid = '', nickname = '', defaultMode = '', defaultDorm = '', onNicknameChange, onClose }) {
    /** @type {'all'|'tonight'} */
    let scope = 'all'
    let mode = defaultMode
    let dormType = defaultDorm
    let curNick = nickname || generateCampusNickname()

    const s = this._layer()
    s.innerHTML = '<div class="panel glass wide">' +
      '<div class="kicker">CAMPUS NIGHT PATROL LEADERBOARD</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<h2 class="h2" style="margin:6px 0;">全校夜巡排行榜</h2>' +
        '<div class="nick-inline">' +
          '<span>我的代号</span>' +
          '<input data-nick maxlength="8" value="' + esc(curNick) + '" />' +
          '<button class="nick-dice" type="button" data-act="rand">🎲</button>' +
        '</div>' +
      '</div>' +
      '<div data-myrank></div>' +
      '<div class="filter-bar" data-scope>' +
        '<button class="chip-sm on" data-val="all">全部记录</button>' +
        '<button class="chip-sm" data-val="tonight">今晚</button>' +
      '</div>' +
      '<div class="filter-bar" data-modes>' +
        '<button class="chip-sm ' + (!mode ? 'on' : '') + '" data-val="">全部小游戏</button>' +
        GAME_MODES.map(m => '<button class="chip-sm ' + (m.id === mode ? 'on' : '') + '" data-val="' + esc(m.id) + '">' + esc(m.shortName) + '</button>').join('') +
      '</div>' +
      '<div class="filter-bar" data-dorms>' +
        '<button class="chip-sm ' + (!dormType ? 'on' : '') + '" data-val="">全部宿舍楼</button>' +
        DORM_TYPES.map(d => '<button class="chip-sm ' + (d.id === dormType ? 'on' : '') + '" data-val="' + esc(d.id) + '">' + esc(d.shortName) + '</button>').join('') +
      '</div>' +
      '<div class="board" data-body><div class="empty">正在读取排行榜…</div></div>' +
      '<button class="btn ghost" data-act="back"><span data-icon="close"></span>返回</button>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="back"]').onclick = onClose

    const nickInput = /** @type {HTMLInputElement} */ (qs(s, 'input[data-nick]'))
    nickInput.onchange = () => {
      curNick = nickInput.value.trim().slice(0, 8) || generateCampusNickname()
      nickInput.value = curNick
      if (onNicknameChange) onNicknameChange(curNick)
    }
    qs(s, '[data-act="rand"]').onclick = () => {
      curNick = generateCampusNickname()
      nickInput.value = curNick
      if (onNicknameChange) onNicknameChange(curNick)
    }

    const myRankEl = qs(s, '[data-myrank]')
    const body = qs(s, '[data-body]')

    const loadBoard = async () => {
      body.innerHTML = '<div class="empty">正在刷新排名…</div>'
      const data = await fetchLeaderboardWithRank({ scope, limit: 20, mode, dormType, uid })
      if (data.myRank) {
        const mr = data.myRank
        const myTier = evaluateRunTier({
          gameMode: mr.gameMode || mode || 'memory_sequence',
          score: mr.bestScore,
          stageReached: mr.bestStage,
          accuracyPct: mr.bestAccuracy
        })
        const myMilestone = formatStageMilestone(mr.gameMode || mode || 'memory_sequence', mr.bestStage, mr.bestAccuracy)
        const aheadTier = mr.rank > 1 ? evaluateRunTier({
          gameMode: mr.gameMode || mode || 'memory_sequence',
          score: mr.bestScore + (mr.nextGap || 0),
          stageReached: mr.nextStage || mr.bestStage
        }) : null
        const aheadMilestone = mr.rank > 1 && mr.nextStage
          ? formatStageMilestone(mr.gameMode || mode || 'memory_sequence', mr.nextStage, mr.nextAccuracy || 0)
          : ''
        const gapHtml = mr.rank === 1
          ? '👑 当前榜首'
          : ('距 #' + (mr.rank - 1) + (aheadTier ? ' [' + aheadTier.code + (aheadMilestone ? ' · ' + esc(aheadMilestone) : '') + ']' : '') + ' 差 ' + mr.nextGap + ' 分')

        myRankEl.innerHTML = '<div class="my-rank-card">' +
          '<div class="mrc-num">#' + mr.rank + '</div>' +
          '<div class="mrc-meta">' +
            '<b>📌 我的当前排名 · <span class="tier-chip ' + myTier.cssClass + '">' + myTier.icon + ' ' + myTier.code + '</span> ' + esc(mr.nickname || curNick) + '（第 ' + mr.rank + ' / ' + mr.total + ' 名）</b>' +
            '<span>' + esc(myTier.title) + ' · ' + esc(myMilestone) + ' · 最高 ' + mr.bestScore + ' 分 · 准 ' + mr.bestAccuracy + '% · 领先 ' + mr.percentile + '% 同学</span>' +
          '</div>' +
          '<div class="mrc-gap">' + gapHtml + '</div>' +
        '</div>'
      } else if (data.offline) {
        myRankEl.innerHTML = '<div class="my-rank-card">' +
          '<div class="mrc-num">☁</div>' +
          '<div class="mrc-meta">' +
            '<b>📡 当前为离线 / 纯前端体验模式 · ' + esc(curNick) + '</b>' +
            '<span>五大玩法、本地存档、手写全结局与自带 DeepSeek Key 直连 AI 均可完整使用；全服排行与流光留声机需访问在线云端版</span>' +
          '</div>' +
          '<div class="mrc-gap"><a href="https://game.xiaoxin.email/" target="_blank" rel="noopener noreferrer" style="color:#ffd88a;text-decoration:underline;">前往在线云端版 ↗</a></div>' +
        '</div>'
      } else {
        myRankEl.innerHTML = '<div class="my-rank-card">' +
          '<div class="mrc-num">—</div>' +
          '<div class="mrc-meta">' +
            '<b>📌 我的当前排名 · ' + esc(curNick) + '（暂无此筛选成绩）</b>' +
            '<span>完成一局当前玩法或切换筛选条件后，这里会立刻显示你的段位、关数与排名</span>' +
          '</div>' +
          '<div class="mrc-gap">共 ' + data.totalEntries + ' 条成绩</div>' +
        '</div>'
      }

      if (data.offline) {
        body.innerHTML = '<div class="empty">离线静态包不包含全服排行榜服务；如需查看实时排行与全校留声墙，请访问 <a href="https://game.xiaoxin.email/" target="_blank" rel="noopener noreferrer" style="color:#ffd88a;text-decoration:underline;">https://game.xiaoxin.email/</a></div>'
        return
      }
      if (!data.items.length) {
        body.innerHTML = '<div class="empty">这个分榜还没有人挑战过，快去拿下第一名吧！</div>'
        return
      }
      body.innerHTML = data.items.map((it, i) => {
        const rk = it.rank || (i + 1)
        const mName = gameModeDef(it.gameMode).shortName
        const dName = dormDef(it.dormType).shortName
        const isMe = it.rank && data.myRank && it.rank === data.myRank.rank && it.nickname === data.myRank.nickname
        const rowScore = Number(it.score || it.total_warmth || 0)
        const rowTier = evaluateRunTier({
          gameMode: it.gameMode,
          score: rowScore,
          stageReached: it.stageReached || 1,
          accuracyPct: it.accuracyPct || 0
        })
        const rowMilestone = formatStageMilestone(it.gameMode, it.stageReached || 1, it.accuracyPct || 0)
        return '<div class="row ' + (rk <= 3 ? 'top' : '') + (isMe ? ' me' : '') + '">' +
          '<span class="rk">#' + rk + '</span>' +
          '<span class="tier-chip ' + rowTier.cssClass + '" title="' + esc(rowTier.title) + '">' + rowTier.code + '</span>' +
          '<span class="nm">' + esc(it.nickname) + ' <em style="color:#8f9ebe;font-style:normal;font-size:11px;">[' + esc(mName) + ' · ' + esc(dName) + ']</em></span>' +
          '<span class="sc"><span class="board-milestone">' + esc(rowMilestone) + (it.accuracyPct ? (' · 准 ' + Math.round(it.accuracyPct) + '%') : '') + '</span><b>' + rowScore + '</b> 分</span>' +
        '</div>'
      }).join('')
    }

    const bindGroup = (sel, setter) => {
      const container = qs(s, sel)
      for (const b of qsa(container, '.chip-sm')) {
        b.onclick = () => {
          for (const o of qsa(container, '.chip-sm')) o.classList.remove('on')
          b.classList.add('on')
          setter(b.getAttribute('data-val') || '')
          loadBoard()
        }
      }
    }
    bindGroup('[data-scope]', v => { scope = v || 'all' })
    bindGroup('[data-modes]', v => { mode = v })
    bindGroup('[data-dorms]', v => { dormType = v })

    await loadBoard()
  }

  showWhisperWall({ whispers, onLike, onClose }) {
    const rows = (whispers || []).length
      ? whispers.map(w => '<div class="wall-row">' +
          '<span class="wr-room">' + Number(w.roomId) + '</span>' +
          '<div class="wr-body"><div class="wr-text">「' + esc(w.content) + '」</div><div class="wr-from">' + esc(w.nickname) + '</div></div>' +
          '<button class="whisper-like" data-like="' + Number(w.id) + '"><span data-icon="heart"></span><b>' + Number(w.resonances || 0) + '</b></button>' +
        '</div>').join('')
      : '<div class="empty">还没有人留下声音</div>'
    const s = this._layer()
    s.innerHTML = '<div class="panel glass wide">' +
      '<div class="kicker">流光留声机</div>' +
      '<h2 class="h2">别人留在窗户上的话</h2>' +
      '<div class="wall-list">' + rows + '</div>' +
      '<button class="btn ghost" data-act="back"><span data-icon="close"></span>返回</button>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="back"]').onclick = onClose
    for (const b of qsa(s, '[data-like]')) {
      b.onclick = async () => {
        const n = await onLike(Number(b.getAttribute('data-like')))
        if (typeof n === 'number') qs(b, 'b').textContent = String(n)
      }
    }
  }

  showKeyDialog({ status, onVerify, onClose }) {
    const s = this._layer()
    s.innerHTML = '<div class="panel glass small">' +
      '<div class="kicker">AI 模式</div>' +
      '<h2 class="h2">评审 / 自带 DeepSeek Key</h2>' +
      '<p class="lede small">填一个 DeepSeek Key，浏览器会直接连 api.deepseek.com。Key 只存在这一页的内存里，不写本地存储，也不发到本服。</p>' +
      '<div class="key-state ' + (status && status.enabled ? 'on' : '') + '" data-state>' + (status && status.enabled ? '✓ 已启用浏览器直连模式（Key 仅驻留内存）' : '当前为云端智能体模式') + '</div>' +
      '<input data-key type="password" spellcheck="false" placeholder="sk-..." autocomplete="off"/>' +
      '<div class="dialog-actions"><button class="btn primary" data-act="verify">验证并启用</button><button class="btn ghost" data-act="back">返回</button></div>' +
      '<div class="seal-status" data-msg></div>' +
      '<div class="note">也可以直接开始游戏：云端模式会用本服的智能体管线，离线时自动使用手写剧本。</div>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="back"]').onclick = onClose
    const input = qs(s, 'input[data-key]')
    const msg = qs(s, '[data-msg]')
    qs(s, '[data-act="verify"]').onclick = async () => {
      msg.textContent = '正在用最小请求验证…'; msg.className = 'seal-status'
      const res = await onVerify(input.value, undefined)
      msg.textContent = res.message
      msg.className = 'seal-status ' + (res.ok ? 'good' : 'bad')
      if (res.ok) {
        const state = qs(s, '[data-state]')
        state.textContent = '✓ 已启用浏览器直连模式（Key 仅驻留内存）'
        state.classList.add('on')
        input.value = ''
      }
    }
  }

  /**
   * Lazily load and present the in-app project specification & player manual modal.
   * @param {{ initialTab?: 'overview' | 'spec' | 'manual', onClose?: () => void, onEnterGame?: () => void }} [opts]
   */
  async showDocsModal({ initialTab = 'overview', onClose, onEnterGame } = {}) {
    const s = this._layer()
    s.classList.add('docs-screen')
    s.innerHTML = '<div class="panel glass small"><div class="spin"></div><h2 class="h2">正在打开作品说明</h2><p class="lede center">载入评审白皮书与玩家完整手册</p></div>'
    try {
      const { mountDocsModal } = await import('./docs-modal.js')
      if (!s.isConnected) return
      mountDocsModal({ container: s, initialTab, onClose, onEnterGame })
    } catch {
      if (!s.isConnected) return
      s.innerHTML = '<div class="panel glass small"><h2 class="h2">文档模块载入失败</h2><p class="lede small">请刷新页面后重试。</p><button class="btn ghost" data-act="back">返回</button></div>'
      qs(s, '[data-act="back"]').onclick = () => { if (onClose) onClose() }
    }
  }

  /**
   * Present a keepsake evening campus postcard rendered from the live 3D diorama snapshot.
   * @param {{
   *   imageDataUrl: string, dormName: string, seasonName: string, weatherName: string,
   *   nickname: string, litCount: number, totalWindows: number, onClose?: () => void
   * }} opts
   */
  showPostcardModal({ imageDataUrl, dormName, seasonName, weatherName, nickname, litCount, totalWindows, onClose }) {
    const s = this._layer()
    const stampDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    s.innerHTML =
      '<div class="panel glass wide">' +
        '<h2 class="h2">📸 晚安明信片</h2>' +
        '<p class="lede small">' + esc(dormName) + ' · ' + esc(seasonName) + ' · ' + esc(weatherName) + ' · ' + esc(litCount) + '/' + esc(totalWindows) + ' 窗</p>' +
        '<div class="postcard-stage">' +
          '<canvas class="postcard-canvas" width="1040" height="700"></canvas>' +
        '</div>' +
        '<div class="dialog-actions" style="justify-content:center;">' +
          '<button class="btn primary" data-act="save-postcard">💾 保存 PNG</button>' +
          '<button class="btn ghost" data-act="close-postcard">返回</button>' +
        '</div>' +
      '</div>'
    paintIcons(s)

    const canvas = /** @type {HTMLCanvasElement} */ (qs(s, '.postcard-canvas'))
    const ctx = canvas.getContext('2d')
    const renderCard = photo => {
      if (!ctx) return
      ctx.fillStyle = '#f6ebd2'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = '#b9894d'
      ctx.lineWidth = 4
      ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)

      ctx.fillStyle = '#151c36'
      ctx.fillRect(42, 42, 956, 486)
      if (photo && photo.width > 0 && photo.height > 0) {
        const scale = Math.max(956 / photo.width, 486 / photo.height)
        const dw = photo.width * scale
        const dh = photo.height * scale
        const dx = 42 + (956 - dw) * 0.5
        const dy = 42 + (486 - dh) * 0.5
        ctx.save()
        ctx.beginPath()
        ctx.rect(42, 42, 956, 486)
        ctx.clip()
        ctx.drawImage(photo, dx, dy, dw, dh)
        ctx.restore()
      }

      ctx.fillStyle = '#472a15'
      ctx.font = 'bold 28px "Songti SC", "Noto Serif SC", serif'
      ctx.fillText('今晚，亮一盏灯 · ' + dormName, 48, 578)
      ctx.fillStyle = '#6c4829'
      ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(`${seasonName} · ${weatherName} · 守夜人「${nickname}」 · 共亮 ${litCount}/${totalWindows} 扇暖窗`, 48, 616)
      ctx.fillStyle = '#8b6138'
      ctx.font = 'italic 16px "Songti SC", "Noto Serif SC", serif'
      ctx.fillText('“总有一扇为你留着的微光，陪你走过今晚的校园星夜。” — ' + stampDate, 48, 654)

      ctx.save()
      ctx.translate(930, 608)
      ctx.rotate(-0.14)
      ctx.strokeStyle = 'rgba(176, 66, 48, 0.86)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, 44, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(176, 66, 48, 0.88)'
      ctx.font = 'bold 14px "Songti SC", serif'
      ctx.textAlign = 'center'
      ctx.fillText('夜巡纪念', 0, -4)
      ctx.font = '12px sans-serif'
      ctx.fillText('LIGHT A WINDOW', 0, 16)
      ctx.restore()
    }

    if (imageDataUrl) {
      const img = new Image()
      img.onload = () => renderCard(img)
      img.onerror = () => renderCard(null)
      img.src = imageDataUrl
    } else {
      renderCard(null)
    }

    qs(s, '[data-act="save-postcard"]').onclick = () => {
      const link = document.createElement('a')
      link.download = `light-a-window-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    qs(s, '[data-act="close-postcard"]').onclick = () => {
      this.hideAll()
      if (onClose) onClose()
    }
  }

  // ---------------------------------------------------------------- chrome

  coach(text, x, y, diam = 64) {
    if (!this._coachEl) {
      this._coachEl = document.createElement('div')
      this._coachEl.id = 'coach'
      this._coachEl.innerHTML = '<div class="ring"></div><div class="ct"></div>'
      document.body.appendChild(this._coachEl)
    }
    const r = Math.max(48, Math.round(diam || 64))
    const ring = qs(this._coachEl, '.ring')
    const ct = qs(this._coachEl, '.ct')
    ring.style.width = r + 'px'
    ring.style.height = r + 'px'
    ct.textContent = text
    ct.style.top = -(Math.round(r / 2) + 12) + 'px'
    this._coachEl.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)'
    this._coachEl.classList.add('on')
  }

  hideCoach() {
    if (this._coachEl) { this._coachEl.remove(); this._coachEl = null }
  }

  /**
   * Show or update the tutorial overlay card and gesture visualization.
   * @param {Object} options
   * @param {string|number} options.step
   * @param {string} options.title
   * @param {string} [options.desc]
   * @param {string} [options.text]
   * @param {() => void} [options.onSkip]
   */
  showTutorialOverlay({ step, title, desc, text, onSkip }) {
    const existing = document.getElementById('tut-overlay')
    if (existing && existing !== this._tutOverlayEl) existing.remove()
    if (!this._tutOverlayEl || !this._tutOverlayEl.parentNode) {
      this._tutOverlayEl = document.createElement('div')
      this._tutOverlayEl.id = 'tut-overlay'
      this._tutOverlayEl.className = 'tut-overlay'
      this._tutOverlayEl.innerHTML =
        '<div class="tut-card">' +
          '<div class="tut-step-badge"></div>' +
          '<div class="tut-title"></div>' +
          '<div class="tut-desc"></div>' +
          '<button class="tut-skip-btn" type="button">跳过教程 ▸</button>' +
        '</div>' +
        '<svg class="tut-gesture-svg" id="tut-gesture-svg"></svg>'
      this.root.appendChild(this._tutOverlayEl)
      this._tutSvgKey = ''
      this._tutHandEl = null
    }

    const card = qs(this._tutOverlayEl, '.tut-card')
    if (card) card.classList.remove('tut-pulse')
    const badgeEl = qs(card, '.tut-step-badge')
    const titleEl = qs(card, '.tut-title')
    const descEl = qs(card, '.tut-desc')
    const skipBtn = qs(card, '.tut-skip-btn')
    const svg = qs(this._tutOverlayEl, '#tut-gesture-svg')

    // Never leave Step 2's SVG path/hand frozen on screen during Step 1 or Step 3
    if (svg && step !== 'step2_drag' && step !== 2) {
      svg.innerHTML = ''
      this._tutSvgKey = ''
      this._tutHandEl = null
    }

    if (badgeEl) {
      let badgeText = '新手教学'
      if (step === 'step1_tap' || step === 1) badgeText = '新手教学 1/3 · 点亮'
      else if (step === 'step2_drag' || step === 2) badgeText = '新手教学 2/3 · 拖连'
      else if (step === 'step3_bridge' || step === 3) badgeText = '新手教学 3/3 · 星桥'
      badgeEl.textContent = badgeText
    }
    if (titleEl) titleEl.textContent = title || ''
    if (descEl) descEl.textContent = desc || text || ''
    if (skipBtn && onSkip) {
      skipBtn.onclick = (e) => {
        e.stopPropagation()
        onSkip()
      }
    }
  }

  /**
   * Trigger inactivity pulse reminder on tutorial card.
   * @param {string} [text]
   */
  pulseTutorialInactivity(text) {
    if (!this._tutOverlayEl) return
    const card = qs(this._tutOverlayEl, '.tut-card')
    if (!card) return
    card.classList.add('tut-pulse')
    if (text) {
      const descEl = qs(card, '.tut-desc')
      if (descEl) descEl.textContent = text
    }
  }

  /**
   * Render or update SVG trajectory demonstration for step 2 (drag ①->②->③).
   * Reuses the static SVG path & badges across frames, updating only the hand <g> transform/opacity.
   * @param {Array<{ x: number, y: number, w?: number, h?: number }>} points
   * @param {number} [timeSec=0]
   */
  updateTutorialGesture(points, timeSec = 0) {
    if (!this._tutOverlayEl) return
    const svg = qs(this._tutOverlayEl, '#tut-gesture-svg')
    if (!svg) return

    if (!Array.isArray(points) || points.length < 2) {
      if (this._tutSvgKey) {
        svg.innerHTML = ''
        this._tutSvgKey = ''
        this._tutHandEl = null
      }
      return
    }

    const p0 = points[0]
    const p1 = points[1]
    const p2 = points[2] || points[points.length - 1]
    const key = points.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join('|')

    if (key !== this._tutSvgKey) {
      this._tutSvgKey = key
      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ')
      const badgesHtml = points.map((p, i) => {
        const num = ['①', '②', '③', '④'][i] || (i + 1)
        return `<g transform="translate(${Math.round(p.x)}, ${Math.round(p.y)})">` +
          `<circle r="18" fill="rgba(18, 14, 32, 0.82)" stroke="rgba(255, 215, 120, 0.85)" stroke-width="2"/>` +
          `<text text-anchor="middle" dominant-baseline="central" fill="#fff5d0" font-size="14" font-weight="bold">${num}</text>` +
        `</g>`
      }).join('')

      svg.innerHTML =
        `<path d="${pathD}" fill="none" stroke="rgba(255, 215, 120, 0.30)" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="${pathD}" fill="none" stroke="rgba(255, 224, 140, 0.88)" stroke-width="3" stroke-dasharray="6,4" stroke-linecap="round"/>` +
        badgesHtml +
        `<g transform="translate(${Math.round(p0.x)}, ${Math.round(p0.y)}) scale(1)" opacity="1">` +
          `<circle r="24" fill="rgba(255, 220, 130, 0.16)" stroke="rgba(255, 230, 150, 0.85)" stroke-width="2"/>` +
          `<path d="M 0 0 L 8 22 L 3 20 L 0 27 L -3 20 L -8 22 Z" fill="#fff" stroke="#ffcc66" stroke-width="1.5" transform="rotate(-25) translate(0, -6)" />` +
        `</g>`
      this._tutHandEl = svg.querySelector('g:last-child')
    }

    const period = 2.2
    const phase = (timeSec % period) / period
    let handX = p0.x
    let handY = p0.y
    let handScale = 1.0
    let handOpacity = 1.0

    if (phase < 0.2) {
      const sub = phase / 0.2
      handScale = 1.0 - 0.15 * Math.sin(sub * Math.PI)
    } else if (phase < 0.55) {
      const sub = (phase - 0.2) / 0.35
      const ease = sub * sub * (3 - 2 * sub)
      handX = p0.x + (p1.x - p0.x) * ease
      handY = p0.y + (p1.y - p0.y) * ease
    } else if (phase < 0.85) {
      const sub = (phase - 0.55) / 0.30
      const ease = sub * sub * (3 - 2 * sub)
      handX = p1.x + (p2.x - p1.x) * ease
      handY = p1.y + (p2.y - p1.y) * ease
    } else {
      const sub = (phase - 0.85) / 0.15
      handX = p2.x
      handY = p2.y
      handOpacity = Math.max(0, 1 - sub * 1.5)
    }

    if (this._tutHandEl) {
      this._tutHandEl.setAttribute('transform', `translate(${Math.round(handX)}, ${Math.round(handY)}) scale(${handScale.toFixed(3)})`)
      this._tutHandEl.setAttribute('opacity', handOpacity.toFixed(2))
    }
  }

  /**
   * Hide and remove tutorial overlay plus any orphaned DOM duplicates.
   */
  hideTutorialOverlay() {
    if (this._tutOverlayEl) {
      this._tutOverlayEl.remove()
      this._tutOverlayEl = null
    }
    const orphan = document.getElementById('tut-overlay')
    if (orphan) orphan.remove()
    this._tutSvgKey = ''
    this._tutHandEl = null
  }

  /** Immediately clear floating capsule tags & reset pool. */
  clearWindowTags() {
    if (this._tagPool && this._tagPool.length) {
      for (const el of this._tagPool) el.remove()
      this._tagPool = []
    }
    if (this.tagsEl) this.tagsEl.innerHTML = ''
  }

  /**
   * Update floating smart capsule tags above special actionable windows (max 4, DOM-pooled).
   * @param {any} game
   */
  updateWindowTags(game) {
    if (!this.tagsEl || !game || !game.scene || !Array.isArray(game.scene.windows)) {
      this.clearWindowTags()
      return
    }

    /** @type {Array<{ x: number, y: number, text: string, type: string, priority: number }>} */
    const candidates = []
    const wins = game.scene.windows
    const vw = window.innerWidth
    const vh = window.innerHeight

    for (let i = 0; i < wins.length; i++) {
      const w = wins[i]
      let text = ''
      let type = ''
      let priority = 0
      if (w.state === 'story_beacon' || w.state === 3) {
        text = '📖偷听'; type = 'beacon'; priority = 10
      } else if (w.state === 'resonance_pair' || w.state === 4) {
        const isA = game.scene.resonancePair && w.roomId === game.scene.resonancePair.a
        text = isA ? '🌉星桥①' : '🌉星桥②'; type = 'bridge'; priority = 9
      } else if (w.crisis === 'cat' || w.state === 'crisis_cat') {
        text = '📱抓猫'; type = 'crisis'; priority = 12
      } else if (w.crisis === 'sleep' || w.state === 'sleep') {
        text = '💤安睡'; type = 'sleep'; priority = 8
      } else {
        continue
      }

      const rect = game.scene.windowScreenRect(w)
      if (!rect) continue
      const x = Math.round(rect.x)
      const y = Math.round(rect.y - rect.h / 2 - 12)
      if (x < -40 || x > vw + 40 || y < -40 || y > vh + 40) continue
      candidates.push({ x, y, text, type, priority })
    }

    if (candidates.length > 1) candidates.sort((a, b) => b.priority - a.priority)
    const count = Math.min(4, candidates.length)

    // Remove stale pooled elements if external code cleared tagsEl
    if (this._tagPool.length && !this.tagsEl.contains(this._tagPool[0])) {
      this._tagPool = []
    }

    while (this._tagPool.length > count) {
      const dead = this._tagPool.pop()
      if (dead) dead.remove()
    }

    for (let i = 0; i < count; i++) {
      const item = candidates[i]
      let el = this._tagPool[i]
      if (!el) {
        el = document.createElement('div')
        this.tagsEl.appendChild(el)
        this._tagPool[i] = el
      }
      const cls = 'win-tag ' + item.type
      if (el.className !== cls) el.className = cls
      if (el.textContent !== item.text) el.textContent = item.text
      const leftStr = item.x + 'px'
      const topStr = item.y + 'px'
      if (el.style.left !== leftStr) el.style.left = leftStr
      if (el.style.top !== topStr) el.style.top = topStr
    }
  }

  pause({ onResume, onHome }) {
    this.hidePause()
    const s = this._layer()
    s.classList.add('pause-screen')
    s.innerHTML = '<div class="panel glass center small">' +
      '<div class="kicker">PAUSED</div>' +
      '<h2 class="h2">灯先替你留着</h2>' +
      '<p class="lede center">暂停时，天色和窗户都不会变化。</p>' +
      '<div class="dialog-actions"><button class="btn primary" data-act="resume"><span data-icon="play"></span>继续点亮</button>' +
      '<button class="btn ghost" data-act="home">离开这一晚</button></div>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="resume"]').onclick = onResume
    qs(s, '[data-act="home"]').onclick = onHome
    this._pauseEl = s
  }

  hidePause() {
    if (this._pauseEl) { this._pauseEl.remove(); this._pauseEl = null }
  }

  setFlowState(flowState) {
    const pill = document.getElementById('flow-pill')
    if (!pill) return
    pill.className = 'flow-pill flow-state-' + flowState
    const txt = pill.querySelector('[data-flow-text]')
    if (txt) {
      txt.textContent = flowState === 'flow' ? '心流' : (flowState === 'breeze' ? '悠闲' : '急迫')
    }
  }

  showCrisisPrompt(crisis) {
    if (!crisis) return
    let card = document.getElementById('crisis-card')
    if (!card) {
      card = document.createElement('div')
      card.id = 'crisis-card'
      card.className = 'crisis-card glass'
      this.el.appendChild(card)
    }
    const rem = Math.max(0, crisis.remainingSec || crisis.durationSec).toFixed(1)
    const prog = Math.min(1.0, (crisis.progress || 0)) * 100
    card.innerHTML =
      '<div class="crisis-badge">' + esc(crisis.tag || '⚡ 突发事件') + '</div>' +
      '<div class="crisis-content">' +
        '<div class="crisis-title">' + esc(crisis.title) + '</div>' +
        '<div class="crisis-prompt">' + esc(crisis.prompt) + '</div>' +
      '</div>' +
      '<div class="crisis-timer-block">' +
        '<div class="crisis-time">' + rem + 's</div>' +
        '<div class="crisis-bar"><i style="width:' + (100 - prog).toFixed(1) + '%"></i></div>' +
      '</div>'
    requestAnimationFrame(() => card.classList.add('on'))
  }

  updateCrisisPrompt(crisis) {
    const card = document.getElementById('crisis-card')
    if (!card || !crisis) return
    const timeEl = card.querySelector('.crisis-time')
    const barEl = /** @type {HTMLElement|null} */ (card.querySelector('.crisis-bar i'))
    if (timeEl) timeEl.textContent = Math.max(0, crisis.remainingSec || 0).toFixed(1) + 's'
    if (barEl) {
      const prog = Math.min(1.0, (crisis.progress || 0)) * 100
      barEl.style.width = Math.max(0, (100 - prog)).toFixed(1) + '%'
    }
  }

  hideCrisisPrompt(immediate = false) {
    const card = document.getElementById('crisis-card')
    if (card) {
      if (immediate) {
        card.remove()
      } else {
        card.classList.remove('on')
        setTimeout(() => card.remove(), 400)
      }
    }
  }

  stopReplay() {
    if (this._replayPlayer) {
      this._replayPlayer.stop()
      this._replayPlayer = null
    }
    const dock = document.getElementById('replay-dock')
    if (dock) dock.remove()
  }

  playAcceleratedReplay(events, scene, audio) {
    if (!Array.isArray(events) || events.length === 0) return
    this.stopReplay()

    const dock = document.createElement('div')
    dock.id = 'replay-dock'
    dock.className = 'replay-dock glass on'
    dock.innerHTML =
      '<div class="replay-status">🎬 6秒夜巡延时回放中 (<span id="replay-time">0.0</span>s / 6.0s)</div>' +
      '<div class="replay-track"><div class="replay-fill" id="replay-fill"></div></div>' +
      '<button class="chip-sm replay-skip" id="btn-replay-skip">跳过回放</button>'
    this.el.appendChild(dock)

    const player = new ReplayPlayer(events, 75000, 6000)
    this._replayPlayer = player
    const timeEl = dock.querySelector('#replay-time')
    const fillEl = /** @type {HTMLElement|null} */ (dock.querySelector('#replay-fill'))
    const skipBtn = /** @type {HTMLElement|null} */ (dock.querySelector('#btn-replay-skip'))

    if (scene && Array.isArray(scene.windows)) {
      scene.windows.forEach(w => {
        scene.setWindowState(w, WINDOW_STATES.DARK)
      })
    }

    const cleanup = () => {
      player.stop()
      if (dock) {
        dock.classList.remove('on')
        setTimeout(() => dock.remove(), 300)
      }
    }

    if (skipBtn) skipBtn.onclick = cleanup

    player.start((evt, prog) => {
      if (timeEl) timeEl.textContent = (prog * 6.0).toFixed(1)
      if (fillEl) fillEl.style.width = (prog * 100).toFixed(1) + '%'
      if (scene) {
        scene.setWindowState(evt.idx, WINDOW_STATES.LIT)
        scene.burstWindow(evt.idx, 0xffd700)
      }
      if (audio && audio.tap) {
        audio.tap(1)
      }
    }, () => {
      cleanup()
    })
  }

  setMuted(muted) {
    const btn = document.querySelector('#hud [data-act="mute"]')
    if (!btn) return
    btn.setAttribute('data-icon', muted ? 'mute' : 'sound')
    paintIcons(btn.parentNode || document.body)
  }
}

const RESIDENT_ORDER = {
  102: '102 · 林阿姨（宿管值班室）',
  203: '203 · 小禾（插画系）',
  205: '205 · 阿澈（广播站）',
  301: '301 · 阿满与室友（夜宵）',
  304: '304 · 知夏（考研）',
  406: '406 · 星野（天文社）'
}

const WEATHER_LABEL = { light_rain: '细雨', fog: '浓雾', wind: '晚风', clear: '晴夜', snow: '落雪' }

function weatherLabel(weather) { return WEATHER_LABEL[weather] || '晴夜' }

function sourceLabel(source) {
  if (source === 'ai') return 'DeepSeek AI 云端智能体'
  if (source === 'direct') return '你的 Key 直连 DeepSeek'
  if (source === 'cache') return 'AI 缓存复用'
  return '本地校园剧本（离线可用）'
}

export { ENDINGS, WINDOW_STATES, esc }
