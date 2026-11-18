// All DOM overlays for《今晚，亮一盏灯 · 3D校园夜巡物语》v4.0.
//
// Two rules keep the frame rate honest:
//   1. tick() compares against the last written value before touching the DOM.
//   2. progress bars animate cleanly via transform: scaleX().

import { paintIcons } from './icons.js'
import { fetchLeaderboardWithRank } from './records.js'
import {
  CAMERA_VIEWS,
  DORM_TYPES,
  ENDINGS,
  GAME_MODES,
  MOOD_TOKENS,
  SEASONS,
  WEATHER_CATALOG,
  WINDOW_STATES,
  buildWindowIds,
  dormDef,
  gameModeDef,
  generateCampusNickname,
  outfitForEnv,
  seasonDef
} from '../shared/constants.js'
import { NPC_CATALOG, OUTFIT_LABELS, renderNpcPortraitSvg } from './npc-portraits.js'
import { bondLabel, endingGallery, endingScript } from './narrative-graph.js'

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
  }

  _layer() {
    const d = document.createElement('div')
    d.className = 'screen'
    this.el.appendChild(d)
    this._cur = d
    return d
  }

  hideAll() {
    clearTimeout(this._dlgTimer)
    for (const n of qsa(this.el, '.screen')) n.remove()
    this.hideChoice()
    this.hidePause()
    this.hideCoach()
    this._cur = null
    this.el.innerHTML = ''
    for (const id of ['hud', 'hud-v4', 'hub', 'dialogue-box', 'hv4-bottom']) {
      const node = document.getElementById(id)
      if (node) node.remove()
    }
    this.hudEl = null
    this._hv4 = null
    this._dirty = { sec: -1, warmth: -1, combo: -1, lit: -1 }
  }

  // -------------------------------------------------------------- loading

  showLoading(text) {
    this.hideAll()
    const s = this._layer()
    s.innerHTML = '<div class="panel glass small"><div class="spin"></div><h2 class="h2">' + esc(text || '校园灯影正在接电') + '</h2><p class="lede center">正在载入 3D 宿舍楼、四季天气与 AI 导演管线</p></div>'
    paintIcons(s)
  }

  // ---------------------------------------------------------------- title

  /**
   * @param {{ records: any, whispers: any[], stats: any, keyStatus: any, nickname: string,
   *   onEnterCampus?: Function, onStart: Function, onCollection: Function, onLeaderboard: Function,
   *   onWhisperWall: Function, onKeyConfig: Function, onNpcGallery?: Function, onNicknameChange?: (name: string) => void }} opts
   */
  showTitle({ records, whispers, stats, keyStatus, nickname, onEnterCampus, onStart, onCollection, onLeaderboard, onWhisperWall, onKeyConfig, onNpcGallery, onNicknameChange }) {
    this.hideAll()
    this._onStart = onStart
    const unlocked = (records && records.unlockedEndings) ? records.unlockedEndings.length : 0
    const total = stats && stats.totalLit ? stats.totalLit.toLocaleString('zh-CN') : '0'
    const firstWhisper = whispers && whispers.length ? whispers[0] : null
    const aiDirect = Boolean(keyStatus && keyStatus.enabled)

    const s = this._layer()
    s.classList.add('title-screen')
    s.innerHTML = '<div class="title-veil"></div>' +
      '<div class="title-wrap">' +
        '<div class="kicker">STARDEW 3D CAMPUS NIGHT PATROL · V4.0</div>' +
        '<h1 class="title-h1">今晚，<span class="accent">亮一盏灯</span></h1>' +
        '<p class="lede">星露谷写意 3D 校园物语：四栋实时建模宿舍楼、四季晴雨雾雪、<br/>记忆熄灯闯关、查寝夜猫子、宿管故事与全校排行榜。</p>' +
        '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
          '<div class="nick-inline">' +
            '<span>夜巡代号</span>' +
            '<input data-nick maxlength="8" value="' + esc(nickname || '三楼夜猫') + '" aria-label="玩家昵称" />' +
            '<button class="nick-dice" type="button" data-act="randnick" title="随机起一个有趣的校园昵称">🎲 随机</button>' +
          '</div>' +
          '<span class="ai-radio-pill ' + (aiDirect ? '' : 'offline') + '">' +
            '<i class="ai-radio-dot"></i>' +
            (aiDirect ? 'DeepSeek AI 直连 · ' + esc(keyStatus.masked) : 'AI 导演电台就绪（云端/离线自适应）') +
          '</span>' +
        '</div>' +
        '<div class="pills">' +
          '<span class="pill">记忆顺序 · 快照亮灯</span>' +
          '<span class="pill">查寝反应 · 熄灯解谜</span>' +
          '<span class="pill">4栋宿舍 × 四季五天气</span>' +
        '</div>' +
        '<div class="title-actions">' +
          '<button class="btn primary" data-act="enter">进入校园夜巡 ▸</button>' +
          '<button class="btn ghost" data-act="start">快速直进三晚故事</button>' +
          '<button class="btn ghost" data-act="board">全校排行榜</button>' +
          '<button class="btn ghost" data-act="npcs">NPC 换装图鉴</button>' +
          '<button class="btn ghost" data-act="collection">结局星图 <b>' + unlocked + '/6</b></button>' +
          '<button class="btn ghost icon" data-act="key" data-icon="key" title="DeepSeek AI 直连 Key"></button>' +
        '</div>' +
        '<div class="title-foot">' +
          '<span class="global">全校守夜人已点亮 <b>' + esc(total) + '</b> 扇窗</span>' +
          '<button class="linkish" data-act="whispers">' + (firstWhisper ? '流光留声机 · 「' + esc(firstWhisper.content) + '」' : '流光留声机') + '</button>' +
        '</div>' +
      '</div>'
    paintIcons(s)

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
  showDialogue({ lines, dormType, season, weather, aiSource, onSpeakerChange, onStepSound, onDone }) {
    this.hideAll()
    const list = Array.isArray(lines) && lines.length ? lines : [
      { npcId: 'aunt_lin', speaker: '林阿姨', line: '熄灯铃响过喽，今晚的宿舍巡查就拜托你啦。' }
    ]
    const outfitKey = outfitForEnv(weather, season)
    const outfitLabel = OUTFIT_LABELS[outfitKey] || '值班常服'
    const dorm = dormDef(dormType)
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
          '<span class="ai-radio-pill ' + (isAi ? '' : 'offline') + '"><i class="ai-radio-dot"></i>' + esc(dorm.shortName + ' · ' + (isAi ? 'AI 剧本导演' : '校园手写剧本')) + '</span>' +
        '</div>' +
        '<p class="dlg-text" data-text></p>' +
        '<div class="dlg-actions">' +
          '<span class="dlg-step" data-step></span>' +
          '<button class="chip-sm" type="button" data-act="skip">跳过开场</button>' +
          '<button class="btn primary" type="button" data-act="next" style="padding:8px 16px;font-size:12.5px;">下一句 ▸</button>' +
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
      nextBtn.textContent = idx === list.length - 1 ? '开始选关巡楼 ▸' : '下一句 ▸'
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
   *   gameMode: string, aiSource: string, keyEnabled: boolean,
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
   *   onTitle: Function
   * }} opts
   */
  showCampusHub(opts) {
    this.hideAll()
    const dorm = dormDef(opts.dormId)
    const season = seasonDef(opts.season)
    const weatherMeta = WEATHER_CATALOG.find(w => w.id === opts.weather) || WEATHER_CATALOG[0]
    const aiActive = opts.keyEnabled || opts.aiSource === 'ai' || opts.aiSource === 'direct' || opts.aiSource === 'cache'

    const hub = document.createElement('div')
    hub.id = 'hub'
    hub.innerHTML =
      '<div class="hub-topbar">' +
        '<div class="hub-brand">' +
          '<b>' + esc(dorm.name) + '</b>' +
          '<span>' + esc(dorm.subtitle) + ' · ' + esc(season.name) + ' · ' + esc(weatherMeta.name) + '</span>' +
        '</div>' +
        '<div class="hub-top-actions">' +
          '<div class="nick-inline">' +
            '<span>代号</span>' +
            '<input data-nick maxlength="8" value="' + esc(opts.nickname) + '" />' +
            '<button class="nick-dice" type="button" data-act="randnick">🎲</button>' +
          '</div>' +
          '<span class="ai-radio-pill ' + (aiActive ? '' : 'offline') + '"><i class="ai-radio-dot"></i>' + (opts.keyEnabled ? 'DeepSeek 直连' : (aiActive ? '云端 AI' : '本地剧本')) + '</span>' +
          '<button class="chip-btn" data-act="board">🏆 排行榜</button>' +
          '<button class="chip-btn" data-act="npcs">👘 NPC换装</button>' +
          '<button class="chip-btn" data-act="dialogue">💬 宿管对话</button>' +
          '<button class="chip-btn" data-act="collection">⭐ 结局图鉴</button>' +
          '<button class="chip-btn" data-act="key">🔑 AI</button>' +
          '<button class="chip-btn" data-act="title">标题</button>' +
        '</div>' +
      '</div>' +

      '<div class="hub-mid">' +
        '<div class="hub-panel">' +
          '<div>' +
            '<div class="hub-group-label">切换附近宿舍楼（3D 航拍漫游）</div>' +
            '<div class="chip-row">' +
              DORM_TYPES.map(d => '<button class="chip-sm ' + (d.id === opts.dormId ? 'on' : '') + '" data-dorm="' + esc(d.id) + '">' + esc(d.shortName) + '·' + d.windowCount + '窗</button>').join('') +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="hub-group-label">校园季节 · 植被覆雪联动</div>' +
            '<div class="chip-row">' +
              SEASONS.map(s => '<button class="chip-sm ' + (s.id === opts.season ? 'on' : '') + '" data-season="' + esc(s.id) + '">' + esc(s.name) + '</button>').join('') +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="hub-group-label">夜间天气 · NPC 实时换装</div>' +
            '<div class="chip-row">' +
              WEATHER_CATALOG.map(w => '<button class="chip-sm ' + (w.id === opts.weather ? 'on' : '') + '" data-weather="' + esc(w.id) + '">' + esc(w.name) + '</button>').join('') +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="hub-group-label">看楼视角（支持拖拽缩放）</div>' +
            '<div class="chip-row">' +
              CAMERA_VIEWS.map(v => '<button class="chip-sm ' + (v.id === opts.viewId ? 'on' : '') + '" data-view="' + esc(v.id) + '">' + esc(v.name) + '</button>').join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="hub-bottom">' +
        '<div class="hub-orbit-hint">拖动画布可 3D 环绕查看宿舍楼 · 当前：' + esc(weatherMeta.hint) + '</div>' +
        '<div class="hub-modes">' +
          GAME_MODES.map(m =>
            '<div class="mode-card ' + (m.id === opts.gameMode ? 'on' : '') + '" data-mode="' + esc(m.id) + '">' +
              '<div class="mode-card-head"><b>' + esc(m.shortName) + '</b><span class="mode-tag">' + esc(m.tag) + '</span></div>' +
              '<span class="mc-desc">' + esc(m.desc) + '</span>' +
              '<button class="mode-play-btn" type="button" data-launch="' + esc(m.id) + '">开始巡查 ▸</button>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>'

    this.el.appendChild(hub)

    const nickInput = /** @type {HTMLInputElement} */ (qs(hub, 'input[data-nick]'))
    nickInput.onchange = () => opts.onNicknameChange(nickInput.value)
    qs(hub, '[data-act="randnick"]').onclick = () => {
      const next = generateCampusNickname()
      nickInput.value = next
      opts.onNicknameChange(next)
    }

    qs(hub, '[data-act="board"]').onclick = () => opts.onLeaderboard()
    qs(hub, '[data-act="npcs"]').onclick = () => opts.onNpcGallery()
    qs(hub, '[data-act="dialogue"]').onclick = () => opts.onReplayDialogue()
    qs(hub, '[data-act="collection"]').onclick = () => opts.onCollection()
    qs(hub, '[data-act="key"]').onclick = () => opts.onKeyConfig()
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
   *   showHintBtn?: boolean, onHint?: Function, onMute: Function, onExit: Function, muted: boolean,
   *   onViewCycle?: Function
   * }} opts
   */
  startMinigameHud(opts) {
    this.hideAll()
    const bar = document.createElement('div')
    bar.id = 'hud-v4'
    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span class="hv4-phase" data-phase>准备中…</span>' +
        '<span style="font-size:12px;color:#dbe4f8;">' + esc(opts.dormMeta.shortName) + ' · <b>' + esc(opts.modeMeta.shortName) + '</b></span>' +
        '<span class="mode-tag" data-pattern>' + esc(opts.aiPattern || '夜巡模式') + '</span>' +
      '</div>' +
      '<div class="hv4-stats">' +
        '<span>关卡<b data-stage>1</b></span>' +
        '<span>正确数<b data-correct>0</b></span>' +
        '<span>准确率<b data-acc>100%</b></span>' +
        '<span>积分<b data-score>0</b></span>' +
        '<span data-timewrap style="display:none;">倒计时<b data-time>45</b>s</span>' +
        '<span>护盾<b data-shield>1</b></span>' +
      '</div>' +
      '<div class="hv4-actions">' +
        (opts.showHintBtn ? '<button class="chip-sm on" data-act="hint">💡 林阿姨提示</button>' : '') +
        (opts.onViewCycle ? '<button class="chip-sm" data-act="view">🎥 切换视角</button>' : '') +
        '<button class="chip-sm" data-act="mute">' + (opts.muted ? '🔇' : '🔊') + '</button>' +
        '<button class="chip-sm" data-act="exit">返回选楼</button>' +
      '</div>'
    this.el.appendChild(bar)

    const bot = document.createElement('div')
    bot.id = 'hv4-bottom'
    bot.className = 'hv4-bottom-banner'
    bot.textContent = opts.modeMeta.desc
    this.el.appendChild(bot)

    this._hv4 = {
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
    if (opts.onViewCycle) qs(bar, '[data-act="view"]').onclick = () => opts.onViewCycle()
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
    if (p.stage !== undefined) h.stage.textContent = String(p.stage)
    if (p.correctCount !== undefined) h.correct.textContent = String(p.correctCount)
    if (p.accuracyPct !== undefined) h.acc.textContent = String(Math.round(p.accuracyPct)) + '%'
    if (p.score !== undefined) h.score.textContent = String(p.score)
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
    const s = this._layer()
    s.classList.add('result-screen')
    s.innerHTML = '<div class="result-scroll">' +
      '<div class="panel glass result-panel">' +
        '<div class="kicker">' + esc(dormMeta.name + ' · ' + modeMeta.name) + '</div>' +
        '<h2 class="h2">' + esc(debrief?.rankTitle || debrief?.verdictTitle || '夜间巡查完成') + '</h2>' +
        '<div class="statgrid">' +
          '<div class="cell"><b>' + (summary.score || 0) + '</b><span>夜巡积分</span></div>' +
          '<div class="cell"><b>' + (summary.accuracyPct ?? 100) + '%</b><span>准确率</span></div>' +
          '<div class="cell"><b>第 ' + (summary.stageReached || 1) + ' 关</b><span>通关进度</span></div>' +
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
      '<div class="kicker">序章 · 今夜的心境</div>' +
      '<h2 class="h2">先挑一件东西，带你走进今晚</h2>' +
      '<p class="lede">它只决定今晚的节奏和天色，不会锁住任何结局。</p>' +
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

  // ------------------------------------------------------------------ v3 Story HUD

  startNight({ night, index, count, commissions, directorNote, muted, totalWindows = 24, onPause, onMute }) {
    this.hideAll()
    const hud = document.createElement('div')
    hud.id = 'hud'
    const ledger = (commissions || []).map(c => '<div class="ledger-item" data-cid="' + esc(c.id || c.type) + '">' +
      '<span class="ledger-dot"></span>' +
      '<span class="ledger-label">' + esc(c.label) + '</span>' +
      '<span class="ledger-prog"><i></i></span>' +
    '</div>').join('')

    hud.innerHTML = '<div class="hud-top">' +
        '<div class="brand"><b>今晚，亮一盏灯</b><span>第 ' + (index + 1) + ' 晚 / ' + count + '</span></div>' +
        '<div class="stats">' +
          '<div class="stat"><span class="lab">温暖</span><b data-warm>0</b></div>' +
          '<div class="warmbar"><i data-warmbar></i></div>' +
          '<div class="stat"><span class="lab">连击</span><b data-combo>0</b></div>' +
          '<div class="stat"><span class="lab">窗</span><b data-lit>0</b><span class="lab">/' + totalWindows + '</span></div>' +
          '<div class="stat time"><span class="lab">剩余</span><b data-time>' + Math.ceil(75) + '</b><span class="lab">s</span></div>' +
        '</div>' +
        '<div class="hud-actions">' +
          '<button class="iconbtn" data-act="mute" data-icon="' + (muted ? 'mute' : 'sound') + '" title="声音"></button>' +
          '<button class="iconbtn" data-act="pause" data-icon="pause" title="暂停"></button>' +
        '</div>' +
      '</div>' +
      '<div class="ledger glass" id="ledger">' +
        '<div class="ledger-head"><span class="kicker">今夜手账</span><span class="weather">' + esc(weatherLabel(night && night.weather)) + ' · ' + esc(tempoLabel(night && night.tempo)) + '</span></div>' +
        ledger +
        (directorNote ? '<div class="ledger-note">' + esc(directorNote) + '</div>' : '') +
      '</div>' +
      '<div class="hint">点一下发光的窗 · 按住划过去可以一笔连亮</div>'

    this.el.appendChild(hud)
    paintIcons(hud)
    requestAnimationFrame(() => hud.classList.add('on'))
    qs(hud, '[data-act="pause"]').onclick = onPause
    qs(hud, '[data-act="mute"]').onclick = () => {
      const m = onMute()
      const btn = qs(hud, '[data-act="mute"]')
      btn.setAttribute('data-icon', m ? 'mute' : 'sound')
      paintIcons(btn.parentNode || hud)
    }
    this.hudEl = hud
    this._warmEl = qs(hud, 'b[data-warm]')
    this._barEl = qs(hud, 'i[data-warmbar]')
    this._comboEl = qs(hud, 'b[data-combo]')
    this._timeEl = qs(hud, 'b[data-time]')
    this._litEl = qs(hud, 'b[data-lit]')
    this._ledger = qs(hud, '#ledger')
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
  }

  setStats(game) {
    if (!game.night) return
    const n = game.night
    if (this._warmEl && n.warmth !== this._dirty.warmth) {
      this._dirty.warmth = n.warmth
      this._warmEl.textContent = String(n.warmth)
      if (this._barEl) this._barEl.style.setProperty('--p', String(Math.min(1, n.warmth / 460)))
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

  updateCommissions(items) {
    if (!this._ledger) return
    for (const item of items || []) {
      const row = this._ledger.querySelector('[data-cid="' + String(item.id).replace(/"/g, '') + '"]')
      if (!row) continue
      const bar = row.querySelector('.ledger-prog i')
      if (bar) bar.style.setProperty('--p', String(Math.min(1, item.progress / item.target)))
      row.classList.toggle('done', item.done)
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
        '<span class="freeze">连击已冻结 5s</span></div>' +
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
    this._choiceTimer = setTimeout(() => { this.hideChoice(); onTimeout() }, 6000)
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
    const titles = ['灯，安静地亮着', '风把灯吹得更暖了', '整栋楼都有了回声']
    const s = this._layer()
    s.innerHTML = '<div class="panel glass center">' +
      '<div class="kicker">第 ' + sum.night + ' 晚 · 结束</div>' +
      '<h2 class="h2">' + esc(titles[sum.night - 1] || '灯，亮了') + '</h2>' +
      '<div class="statgrid">' +
        '<div class="cell"><b>' + sum.warmth + '</b><span>温暖</span></div>' +
        '<div class="cell"><b>' + sum.lit + '</b><span>点亮窗</span></div>' +
        '<div class="cell"><b>' + sum.maxCombo + '</b><span>最高连击</span></div>' +
        '<div class="cell"><b>' + sum.stamps + '</b><span>火漆章</span></div>' +
      '</div>' +
      '<p class="lede center">' + (sum.allLit ? '整栋楼都亮过了。' : '今晚亮到这里也很好。') + (sum.resonanceCount ? ' 你连起了 ' + sum.resonanceCount + ' 次星轨。' : '') + '</p>' +
      '<div class="commission-recap">' + (sum.commissions || []).map(c => '<span class="recap ' + (c.done ? 'on' : '') + '">' + esc(c.label) + '</span>').join('') + '</div>' +
      '<button class="btn primary" data-act="next">' + (sum.night === sum.count ? '看看今晚的明信片' : '继续第 ' + (sum.night + 1) + ' 晚') + '</button>' +
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

    const s = this._layer()
    s.classList.add('result-screen')
    s.innerHTML = '<div class="result-scroll">' +
      '<div class="panel glass result-panel">' +
        '<div class="kicker">今晚的明信片 · ' + esc(dorm.shortName) + '</div>' +
        '<h2 class="h2">你点亮了 <span class="accent">' + run.litTotal + '</span> 扇窗</h2>' +
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
        myRankEl.innerHTML = '<div class="my-rank-card">' +
          '<div class="mrc-num">#' + mr.rank + '</div>' +
          '<div class="mrc-meta">' +
            '<b>📌 我的当前排名 · ' + esc(mr.nickname || curNick) + '（第 ' + mr.rank + ' / ' + mr.total + ' 名）</b>' +
            '<span>最高分 ' + mr.bestScore + ' · 准确率 ' + mr.bestAccuracy + '% · 最高第 ' + mr.bestStage + ' 关 · 领先 ' + mr.percentile + '% 同学</span>' +
          '</div>' +
          '<div class="mrc-gap">' + (mr.rank === 1 ? '👑 当前榜首' : ('距 #' + (mr.rank - 1) + ' 差 ' + mr.nextGap + ' 分')) + '</div>' +
        '</div>'
      } else {
        myRankEl.innerHTML = '<div class="my-rank-card">' +
          '<div class="mrc-num">—</div>' +
          '<div class="mrc-meta">' +
            '<b>📌 我的当前排名 · ' + esc(curNick) + '（暂无此筛选成绩）</b>' +
            '<span>完成一局当前玩法或切换筛选条件后，这里会立刻显示你的准确排名</span>' +
          '</div>' +
          '<div class="mrc-gap">共 ' + data.totalEntries + ' 条成绩</div>' +
        '</div>'
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
        return '<div class="row ' + (rk <= 3 ? 'top' : '') + (isMe ? ' me' : '') + '">' +
          '<span class="rk">#' + rk + '</span>' +
          '<span class="nm">' + esc(it.nickname) + ' <em style="color:#8f9ebe;font-style:normal;font-size:11px;">[' + esc(mName) + ' · ' + esc(dName) + ']</em></span>' +
          '<span class="sc"><b>' + Number(it.score || it.total_warmth) + '</b> 分<em>' + (it.accuracyPct ? (it.accuracyPct + '% · 第' + it.stageReached + '关') : esc(it.archetype || '')) + '</em></span>' +
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

  // ---------------------------------------------------------------- chrome

  coach(text, x, y) {
    if (!this._coachEl) {
      this._coachEl = document.createElement('div')
      this._coachEl.id = 'coach'
      this._coachEl.innerHTML = '<div class="ct"></div><div class="ring"></div>'
      document.body.appendChild(this._coachEl)
    }
    qs(this._coachEl, '.ct').textContent = text
    this._coachEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)'
    this._coachEl.classList.add('on')
  }

  hideCoach() {
    if (this._coachEl) { this._coachEl.remove(); this._coachEl = null }
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
const TEMPO_LABEL = { slow: '慢一点', normal: '刚刚好', brisk: '快一些' }

function weatherLabel(weather) { return WEATHER_LABEL[weather] || '晴夜' }
function tempoLabel(tempo) { return TEMPO_LABEL[tempo] || '刚刚好' }

function sourceLabel(source) {
  if (source === 'ai') return 'DeepSeek AI 云端智能体'
  if (source === 'direct') return '你的 Key 直连 DeepSeek'
  if (source === 'cache') return 'AI 缓存复用'
  return '本地校园剧本（离线可用）'
}

export { ENDINGS, WINDOW_STATES, esc }
