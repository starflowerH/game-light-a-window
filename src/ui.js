// All DOM overlays.
//
// Two rules keep the frame rate honest:
//   1. tick() compares against the last written value before touching the DOM.
//   2. the warmth bar animates with transform: scaleX(), never width.

import { paintIcons } from './icons.js'
import { fetchLeaderboard } from './records.js'
import { ENDINGS, MOOD_TOKENS, WINDOW_IDS, WINDOW_STATES } from '../shared/constants.js'
import { bondLabel, endingGallery, endingScript } from './narrative-graph.js'

const qs = (root, sel) => root.querySelector(sel)
const qsa = (root, sel) => root.querySelectorAll(sel)

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]))

const MOOD_ICONS = ['umbrella', 'headphones', 'quilt', 'bulb']

export class UI {
  /**
   * @param {HTMLElement} root
   */
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
  }

  _layer() {
    const d = document.createElement('div')
    d.className = 'screen'
    this.el.appendChild(d)
    this._cur = d
    return d
  }

  hideAll() {
    for (const n of qsa(this.el, '.screen')) n.remove()
    this.hideChoice()
    this.hidePause()
    this.hideCoach()
    this._cur = null
    this.el.innerHTML = ''
    const hud = document.getElementById('hud')
    if (hud) hud.remove()
    this.hudEl = null
    this._dirty = { sec: -1, warmth: -1, combo: -1, lit: -1 }
  }

  // -------------------------------------------------------------- loading

  showLoading(text) {
    this.hideAll()
    const s = this._layer()
    s.innerHTML = '<div class="panel glass small"><div class="spin"></div><h2 class="h2">' + esc(text || '灯，正在一盏盏亮起') + '</h2><p class="lede center">正在为今晚准备天气、小故事和明信片</p></div>'
    paintIcons(s)
  }

  // ---------------------------------------------------------------- title

  /**
   * @param {{ records: any, whispers: any[], stats: any, keyStatus: any,
   *   onStart: Function, onCollection: Function, onLeaderboard: Function,
   *   onWhisperWall: Function, onKeyConfig: Function }} opts
   */
  showTitle({ records, whispers, stats, keyStatus, onStart, onCollection, onLeaderboard, onWhisperWall, onKeyConfig }) {
    this.hideAll()
    this._onStart = onStart
    const unlocked = (records && records.unlockedEndings) ? records.unlockedEndings.length : 0
    const total = stats && stats.totalLit ? stats.totalLit.toLocaleString('zh-CN') : '0'
    const firstWhisper = whispers && whispers.length ? whispers[0] : null

    const s = this._layer()
    s.classList.add('title-screen')
    s.innerHTML = '<div class="title-veil"></div>' +
      '<div class="title-wrap">' +
        '<div class="kicker">A COZY CAMPUS NIGHT</div>' +
        '<h1 class="title-h1">今晚，<span class="accent">亮一盏灯</span></h1>' +
        '<p class="lede">一栋十七号宿舍楼，二十四扇窗。<br/>点亮正在发光的窗，或者按住不放，一笔把整排划亮。</p>' +
        '<div class="pills"><span class="pill">只有一个动作：点亮</span><span class="pill">没有失败，也不会扣分</span><span class="pill">三晚，六个结局</span></div>' +
        '<div class="title-actions">' +
          '<button class="btn primary" data-act="start">开始守夜</button>' +
          '<button class="btn ghost" data-act="collection">结局星图 <b>' + unlocked + '/6</b></button>' +
          '<button class="btn ghost" data-act="board">今夜榜单</button>' +
          '<button class="btn ghost icon" data-act="key" data-icon="key" title="AI 模式 / 评审 Key 设置"></button>' +
        '</div>' +
        '<div class="title-foot">' +
          '<span class="global">全服守夜人已点亮 <b>' + esc(total) + '</b> 扇窗</span>' +
          '<button class="linkish" data-act="whispers">' + (firstWhisper ? '流光留声机 · 「' + esc(firstWhisper.content) + '」' : '流光留声机') + '</button>' +
          '<span class="key-state ' + (keyStatus && keyStatus.enabled ? 'on' : '') + '">' + (keyStatus && keyStatus.enabled ? '浏览器直连已启用 · ' + esc(keyStatus.masked) : '云端智能体模式') + '</span>' +
        '</div>' +
      '</div>'
    paintIcons(s)
    qs(s, '[data-act="start"]').onclick = () => onStart()
    qs(s, '[data-act="collection"]').onclick = () => onCollection()
    qs(s, '[data-act="board"]').onclick = () => onLeaderboard()
    qs(s, '[data-act="whispers"]').onclick = () => onWhisperWall()
    qs(s, '[data-act="key"]').onclick = () => onKeyConfig()
  }

  // ------------------------------------------------------------- prologue

  /** @param {{ records: any, onChoose: (mood: string) => void }} opts */
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
    for (const b of qsa(s, '.mood-card')) {
      b.onclick = () => onChoose(b.getAttribute('data-mood'))
    }
  }

  // ------------------------------------------------------------- cinematic

  /**
   * @param {string[]} lines
   * @param {() => void} onDone
   */
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
    let idx = 0
    let typing = false
    let finished = false
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
          lineEl.textContent = text.slice(0, i)
          i += 1
          timer = setTimeout(step, 54)
        } else {
          typing = false
          idx += 1
          timer = setTimeout(typeLine, 1050)
        }
      }
      step()
    }
    wrap.addEventListener('pointerdown', e => {
      const target = e.target
      if (target instanceof HTMLElement && target.id === 'intro-skip') return
      if (typing) {
        clearTimeout(timer)
        typing = false
        lineEl.textContent = lines[idx]
        idx += 1
        timer = setTimeout(typeLine, 320)
      } else finish()
    })
    qs(wrap, '#intro-skip').onclick = e => { e.stopPropagation(); finish() }
    typeLine()
  }

  // ------------------------------------------------------------------ HUD

  /**
   * @param {{ night: any, index: number, count: number, commissions: any[],
   *   directorNote: string, muted: boolean, onPause: Function, onMute: Function }} opts
   */
  startNight({ night, index, count, commissions, directorNote, muted, onPause, onMute }) {
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
          '<div class="stat"><span class="lab">窗</span><b data-lit>0</b><span class="lab">/24</span></div>' +
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

  /** @param {any} game */
  tick(game) {
    if (!this._timeEl || !game.night) return
    const sec = Math.ceil(game.night.timeLeft)
    if (sec !== this._dirty.sec) {
      this._dirty.sec = sec
      this._timeEl.textContent = String(sec)
      this._timeEl.classList.toggle('urgent', sec <= 10)
    }
    // Re-sync the counters here too: warmth can change from a commission or a
    // surprise between taps, and the tick is the one place that always runs.
    this.setStats(game)
  }

  /** @param {any} game */
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

  /** @param {any[]} items */
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

  /** @param {string} id @param {string} label */
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

  /** @param {number} n */
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

  /** @param {string} text @param {number} x @param {number} y @param {string} color @param {string} kind */
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

  /** @param {number} x @param {number} y */
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

  /** @param {string} text @param {string} gain */
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

  /** @param {string} text @param {string} [sub] */
  banner(text, sub) {
    const d = document.createElement('div')
    d.className = 'lit-banner'
    d.innerHTML = '<b>' + esc(text) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '')
    this.el.appendChild(d)
    requestAnimationFrame(() => d.classList.add('show'))
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 520) }, 1700)
  }

  /** @param {string} kind */
  flash(kind) {
    if (!this.fx) return
    const d = document.createElement('div')
    d.className = 'screenflash ' + (kind === 'golden' ? 'golden' : 'warm')
    this.fx.appendChild(d)
    const anim = d.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 720, easing: 'ease-out' })
    anim.onfinish = () => d.remove()
  }

  // -------------------------------------------------------------- choices

  /**
   * @param {{ story: any, resident: any, whisper: any, onLike: Function,
   *   onChoose: (c: any) => void, onTimeout: () => void }} opts
   */
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
    this._choiceTimer = setTimeout(() => {
      this.hideChoice()
      onTimeout()
    }, 6000)
    this._choiceEl = card
  }

  hideChoice() {
    clearTimeout(this._choiceTimer)
    if (this._choiceEl) { this._choiceEl.remove(); this._choiceEl = null }
    const n = document.getElementById('choice')
    if (n) n.remove()
  }

  /**
   * @param {{ text: string, choiceLabel: string, outcome: string, auto: boolean, icon: string, item: string }} opts
   */
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

  // ------------------------------------------------------------- summaries

  /** @param {any} sum @param {Function} onNext */
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

  /** @param {{ ending: any, run: any }} opts */
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

  // ---------------------------------------------------------------- result

  /**
   * @param {{ run: any, records: any, postcard: string, ending: any, letter: any,
   *   rank: number, aiSource: string, suggestedWhisper: string,
   *   onSealWhisper: Function, onLikeWhisper: Function,
   *   onReplay: Function, onHome: Function }} opts
   */
  showResult(opts) {
    this.hideAll()
    const { run, records, postcard, ending, letter, rank, aiSource, suggestedWhisper } = opts
    const s = this._layer()
    s.classList.add('result-screen')
    s.innerHTML = '<div class="result-scroll">' +
      '<div class="panel glass result-panel">' +
        '<div class="kicker">今晚的明信片</div>' +
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
        (rank ? '<div class="rank-line">今晚第 <b>' + rank + '</b> 名</div>' : '') +
        '<div class="letter">' +
          '<div class="letter-from">' + esc(letter ? letter.fromRoom : '') + '</div>' +
          '<div class="letter-salutation">' + esc(letter ? letter.salutation : '') + '</div>' +
          '<p class="letter-body">' + esc(letter ? letter.body : '') + '</p>' +
          '<div class="letter-sign">' + esc(letter ? letter.sign : '') + '</div>' +
        '</div>' +
        '<div class="seal-block">' +
          '<div class="kicker">把一句微光封存进窗户</div>' +
          '<p class="lede small">它会留在服务端，被后来路过的人点亮时看见。</p>' +
          '<div class="window-picker" data-picker></div>' +
          '<div class="seal-row"><input data-whisper maxlength="40" placeholder="' + esc(suggestedWhisper || '今晚的雨很轻，祝你也做个好梦。') + '"/><button class="btn primary" data-act="seal"><span data-icon="send"></span>封存</button></div>' +
          '<div class="seal-status" data-status></div>' +
        '</div>' +
        '<div class="result-actions">' +
          '<button class="btn primary" data-act="replay"><span data-icon="replay"></span>再来三晚</button>' +
          '<button class="btn ghost" data-act="home"><span data-icon="home"></span>回到标题</button>' +
        '</div>' +
        '<div class="note">AI 来源：' + esc(sourceLabel(aiSource)) + ' · 历史最佳 ' + (records.bestWarmth || 0) + ' · 明信片可长按保存</div>' +
      '</div>' +
    '</div>'
    paintIcons(s)

    // window picker: 4 x 6 grid, matching the facade
    const picker = qs(s, '[data-picker]')
    let picked = run.bondRoomId || 304
    for (const win of WINDOW_IDS) {
      const b = document.createElement('button')
      b.className = 'wp' + (win.roomId === picked ? ' on' : '')
      b.textContent = String(win.roomId).slice(1)
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
    const input = qs(s, 'input[data-whisper]')
    const status = qs(s, '[data-status]')
    qs(s, '[data-act="seal"]').onclick = async () => {
      const content = (input.value || '').trim() || String(suggestedWhisper || '').trim()
      if (content.length < 6) {
        status.textContent = '再写长一点点吧'
        status.className = 'seal-status bad'
        return
      }
      status.textContent = '正在封存…'
      status.className = 'seal-status'
      const out = await opts.onSealWhisper({ roomId: picked, content })
      if (out) {
        status.textContent = '已封存进 ' + picked + ' 室，等下一个路过的人'
        status.className = 'seal-status good'
        input.value = ''
      } else {
        status.textContent = '暂时封存不了，稍后再试'
        status.className = 'seal-status bad'
      }
    }
  }

  // ------------------------------------------------------- collection etc.

  /** @param {{ records: any, onClose: Function }} opts */
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

  /** @param {{ onClose: Function }} opts */
  async showLeaderboard({ onClose }) {
    const s = this._layer()
    s.innerHTML = '<div class="panel glass">' +
      '<div class="kicker">TONIGHT\'S LIGHTS</div>' +
      '<h2 class="h2">今夜守夜榜</h2>' +
      '<div class="board" data-body><div class="empty">正在读取今晚的灯…</div></div>' +
      '<button class="btn ghost" data-act="back"><span data-icon="close"></span>返回</button>' +
    '</div>'
    paintIcons(s)
    qs(s, '[data-act="back"]').onclick = onClose
    const body = qs(s, '[data-body]')
    const items = await fetchLeaderboard({ scope: 'all', limit: 20 })
    if (!items.length) {
      body.innerHTML = '<div class="empty">今晚还没有人上榜</div>'
      return
    }
    body.innerHTML = items.map((it, i) => '<div class="row ' + (i < 3 ? 'top' : '') + '">' +
      '<span class="rk">' + (i + 1) + '</span>' +
      '<span class="nm">' + esc(it.nickname) + '</span>' +
      '<span class="sc"><b>' + Number(it.total_warmth) + '</b> 温暖<em>' + esc(it.archetype || '') + '</em></span>' +
    '</div>').join('')
  }

  /** @param {{ whispers: any[], onLike: Function, onClose: Function }} opts */
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

  /** @param {{ status: any, onVerify: Function, onClose: Function }} opts */
  showKeyDialog({ status, onVerify, onClose }) {
    const s = this._layer()
    s.innerHTML = '<div class="panel glass small">' +
      '<div class="kicker">AI 模式</div>' +
      '<h2 class="h2">评审 / 自带 Key</h2>' +
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
      msg.textContent = '正在用最小请求验证…'
      msg.className = 'seal-status'
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

  /** @param {string} text @param {number} x @param {number} y */
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

  /** @param {{ onResume: Function, onHome: Function }} opts */
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

  /** @param {boolean} muted */
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

const WEATHER_LABEL = { light_rain: '细雨', fog: '薄雾', wind: '晚风', clear: '晴夜' }
const TEMPO_LABEL = { slow: '慢一点', normal: '刚刚好', brisk: '快一些' }

function weatherLabel(weather) {
  return WEATHER_LABEL[weather] || '夜'
}

function tempoLabel(tempo) {
  return TEMPO_LABEL[tempo] || '刚刚好'
}

function sourceLabel(source) {
  if (source === 'ai') return '本次天气与故事由 AI 实时生成'
  if (source === 'direct') return '由你的 Key 直连 DeepSeek 生成'
  if (source === 'cache') return 'AI 缓存复用'
  return '本地手写剧本（离线可用）'
}

export { ENDINGS, WINDOW_STATES, esc }
