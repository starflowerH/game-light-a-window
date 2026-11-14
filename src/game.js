import { PALETTES } from './scene.js'
import { generateNights } from './ai.js'
import { loadRecords, saveRecords, mergeRun } from './records.js'
import { drawPostcard } from './postcard.js'

const NIGHT_COUNT = 3
const NIGHT_SECONDS = 75
const COLORS = ['#ffd27a', '#ffe7b0', '#ffb454']

export class Game {
  constructor({ scene, ui }) {
    this.scene = scene
    this.ui = ui
    this.state = 'title'
    this.records = loadRecords()
    this.audio = null
    this._initAudio()
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.state === 'paused') this.togglePause() })
    addEventListener('popstate', () => { if (this.state === 'night') this.togglePause() })
  }

  _initAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ac = new AC()
      this.master = this.ac.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ac.destination)
      this.muted = false
    } catch {}
  }

  _unlockAudio() {
    if (!this.ac) return
    if (this.ac.state === 'suspended') this.ac.resume()
    if (!this._ambient && this.ac.state !== 'closed') {
      try {
        const len = this.ac.sampleRate * 3
        const buf = this.ac.createBuffer(1, len, this.ac.sampleRate)
        const d = buf.getChannelData(0)
        let last = 0
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 2.0 }
        const src = this.ac.createBufferSource(); src.buffer = buf; src.loop = true
        const lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480
        const g = this.ac.createGain(); g.gain.value = 0.05
        src.connect(lp).connect(g).connect(this.master); src.start()
        this._ambient = { src, g }
      } catch {}
    }
  }

  sfx(type, extra = {}) {
    if (!this.ac || this.muted) return
    const t = this.ac.currentTime
    if (type === 'tap') {
      const pent = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
      const step = Math.min(extra.combo || 0, 24)
      const semi = pent[step % pent.length] + Math.floor(step / pent.length) * 12
      const base = 392 * Math.pow(2, semi / 12)
      const o = this.ac.createOscillator(); const g = this.ac.createGain()
      o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.2, t + 0.08)
      const vol = 0.16 + Math.min(0.12, step * 0.006)
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.26)
      const o2 = this.ac.createOscillator(); const g2 = this.ac.createGain()
      o2.type = 'triangle'; o2.frequency.setValueAtTime(base * 2, t); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.06, t + 0.008); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o2.connect(g2).connect(this.master); o2.start(t); o2.stop(t + 0.18)
      if (step >= 8 && step % 2 === 0) {
        const lo = this.ac.createOscillator(); const lg = this.ac.createGain()
        lo.type = 'sine'; lo.frequency.setValueAtTime(90, t); lo.frequency.exponentialRampToValueAtTime(55, t + 0.14)
        lg.gain.setValueAtTime(0.0001, t); lg.gain.exponentialRampToValueAtTime(0.18, t + 0.01); lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
        lo.connect(lg).connect(this.master); lo.start(t); lo.stop(t + 0.2)
      }
    } else if (type === 'comboUp') {
      [0, 0.06, 0.12].forEach((d, i) => {
        const o = this.ac.createOscillator(); const g = this.ac.createGain(); o.type = 'triangle'
        o.frequency.setValueAtTime([659.25, 830.61, 1046.5][i], t + d)
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22)
        o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.24)
      })
    } else if (type === 'lit') {
      [0, 0.08, 0.16, 0.26].forEach((d, i) => {
        const o = this.ac.createOscillator(); const g = this.ac.createGain()
        o.type = 'sine'; o.frequency.value = [523.25, 659.25, 783.99, 1046.5][i]
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5)
        o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.55)
      })
    } else if (type === 'story') {
      const o = this.ac.createOscillator(); const g = this.ac.createGain()
      o.type = 'sine'; o.frequency.setValueAtTime(392, t); o.frequency.exponentialRampToValueAtTime(587.33, t + 0.3)
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.75)
    } else if (type === 'surprise') {
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
        const o = this.ac.createOscillator(); const g = this.ac.createGain()
        o.type = 'triangle'; o.frequency.value = f
        const st = t + i * 0.07
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.14, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.4)
        o.connect(g).connect(this.master); o.start(st); o.stop(st + 0.45)
      })
    } else if (type === 'night') {
      [261.63, 329.63, 392].forEach((f, i) => {
        const o = this.ac.createOscillator(); const g = this.ac.createGain(); o.type = 'sine'; o.frequency.value = f
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 1.7)
      })
    }
  }

  toggleMute() {
    this.muted = !this.muted
    if (this._ambient) this._ambient.g.gain.value = this.muted ? 0 : 0.05
    return this.muted
  }

  async start() {
    this._unlockAudio()
    this.ui.showLoading()
    this.nights = null; this.nightIndex = 0
    this.run = { totalWarmth: 0, maxCombo: 0, litTotal: 0, bestNightWarmth: 0, items: [], nights: NIGHT_COUNT, stories: [] }
    const gen = generateNights()
    // let the scene breathe while AI loads
    const timeout = new Promise(r => setTimeout(() => r({ nights: null, source: 'timeout' }), 4500))
    const first = await Promise.race([gen, timeout])
    if (first.nights) { this.nights = first.nights; this.aiSource = first.source; this._beginNights() }
    else { this.nights = null }
    gen.then(r => { this.aiReady = r; if (this.nights) this.nights = r.nights; this.aiSource = r.source })
    if (this.nights) this._beginNights()
  }

  _beginNights() {
    const seen = (() => { try { return localStorage.getItem('law.intro.seen') === '1' } catch { return false } })()
    const go = () => { try { localStorage.setItem('law.intro.seen', '1') } catch {}; this.ui.hideAll(); this._launchNight(0) }
    if (seen) { go(); return }
    this.ui.intro([
      '熄灯铃响过很久了。',
      '这栋宿舍楼，还有二十四扇窗等着亮起来。',
      '点一下正在发光的窗户，把它点亮。',
      '今晚，就由你来把灯一盏盏点起来。'
    ], go)
  }

  _launchNight(i) {
    const night = this.nights[i]
    this.nightIndex = i
    this.state = 'night'
    this.scene.resetWindows()
    const palette = night.palette in PALETTES ? night.palette : 'warm_blue'
    this.scene.applyTheme(palette)
    this.scene.setWeatherFx(night.weather)
    this.night = { warmth: 0, combo: 0, maxCombo: 0, lit: new Set(), startedAt: performance.now(), endsAt: performance.now() + NIGHT_SECONDS * 1000, timeLeft: NIGHT_SECONDS, litCount: 0, litAll: false }
    this.story = { index: 0, lastAt: -7000, shown: new Set() }
    this._surprise = { coolUntil: 0, lastSurprise: -9000 }
    this._lastTap = 0
    this._nextLitSpeed = 1700 - Math.min(600, i * 180)
    this._scheduleNextLit(400)
    this._startTicker()
    this.ui.startNight({ night: night, index: i, count: NIGHT_COUNT, onPause: () => this.togglePause(), onMute: () => this.toggleMute() })
    this.sfx('night')
    if (i === 0) this._showCoach()
  }

  _showCoach() {
    const w = this.scene.windows.find(x => x.lit) || this.scene.windows[0]
    if (!w) return
    this._coachTimer = setInterval(() => {
      if (this.state !== 'night' || !this._coachPending) { this.ui.hideCoach(); clearInterval(this._coachTimer); return }
      const p = this._screenPos(w)
      if (p) this.ui.coach('点亮这扇发光的窗', p.x, p.y - 54)
    }, 200)
    this._coachPending = true
  }
  _screenPos(w) {
    const s = this.scene
    if (!s || !s.camera) return null
    const v = w.win.getWorldPosition(new w.win.position.constructor()).project(s.camera)
    if (v.z > 1) return null
    const c = s.renderer.domElement.getBoundingClientRect()
    return { x: (v.x * 0.5 + 0.5) * c.width + c.left, y: (-v.y * 0.5 + 0.5) * c.height + c.top }
  }
  _dismissCoach() { if (this._coachPending) { this._coachPending = false; clearInterval(this._coachTimer); this.ui.hideCoach() } }

  _scheduleNextLit(delay) {
    clearTimeout(this._litTimer)
    if ((this.night?.litCount || 0) < 24) this._litTimer = setTimeout(() => this._lightOne(), delay)
  }

  _lightOne() {
    if (this.state !== 'night' || !this.night) return
    const pending = this.scene.windows.filter(w => !w.lit)
    if (!pending.length) return
    const w = pending[Math.floor(Math.random() * pending.length)]
    if (this.scene.litWindow(w)) this.night.litCount = this.scene.windows.filter(x => x.lit).length
    const n = this.night
    this._scheduleNextLit(Math.max(700, this._nextLitSpeed - n.litCount * 40) + Math.random() * 500)
  }

  _startTicker() {
    cancelAnimationFrame(this._raf)
    const loop = () => {
      if (this.state !== 'night') return
      const now = performance.now(); const n = this.night
      const left = Math.max(0, n.endsAt - now)
      n.timeLeft = left / 1000
      this.ui.tick(this)
      if (left <= 0 && !this._ending) this._endNight()
      this._maybeTimeStory()
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  // ---- one-tap core ----
  tap(w, screenX, screenY) {
    if (this.state !== 'night') return
    this._dismissCoach()
    const now = performance.now()
    const n = this.night
    const comboAlive = now - this._lastTap < 1500
    if (w.lit) {
      if (!comboAlive && n.combo > 0) n.combo = 0
      n.combo += 1
      n.maxCombo = Math.max(n.maxCombo, n.combo)
      this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
      this._lastTap = now
      const gain = this._gainForCombo(n.combo)
      n.warmth += gain
      this.ui.floatText('+' + gain, screenX, screenY, n.combo >= 8 ? '#fff0a8' : '#ffd27a', n.combo >= 8 ? 'big' : '')
      this.sfx('tap', { combo: n.combo }); this.ui.pulse()
      this.ui.combo(n.combo)
      this.ui.setStats(this)
      this._comboTail(now)
      this._maybeSurprise(w, n, now)
      return
    }
    // light a dim (waiting) window
    n.combo += 1
    n.maxCombo = Math.max(n.maxCombo, n.combo)
    this.run.maxCombo = Math.max(this.run.maxCombo, n.combo)
    const lit = this.scene.litWindow(w)
    if (lit) {
      n.lit.add(w.idx); n.litCount++
      n.warmth += 2 + (n.combo >= 5 ? 1 : 0)
      this.run.items.length
      this.ui.floatText('+' + (2 + (n.combo >= 5 ? 1 : 0)), screenX, screenY, '#ffe7b0', 'big')
    } else {
      n.warmth += this._gainForCombo(n.combo)
    }
    this._lastTap = now
    this.sfx('tap', { combo: n.combo }); this.ui.pulse()
    this.ui.combo(n.combo)
    this.ui.setStats(this)
    this.ui.shockwave(screenX, screenY)
    this._comboTail(now)
    this._checkSurprise(w, n, now)
    this.scene.setLitCount(n.litCount)
    if (lit && !n.litAll) this._windowStoryFlash()
  }

  _windowStoryFlash() {
    if (!this.night) return
    const stories = this.nights?.[this.nightIndex]?.stories || []
    if (!stories.length || this.story.index >= stories.length * 2) return
    if (performance.now() - (this._lastStoryFlash || 0) < 3000) return
    this._lastStoryFlash = performance.now()
    const si = this.story.index % stories.length
    const s = stories[si]
    if (!s) return
    this.story.index += 1
    this.night.warmth += 3
    this.run.stories.push({ ...s, night: this.nightIndex + 1 })
    if (s.item) this.run.items.push(s.item)
    this.ui.story({ ...s, text: s.text }, () => this.ui.hideStory(), 3600)
    this.ui.setStats(this)
  }

  _gainForCombo(c) { return c >= 8 ? 5 : c >= 5 ? 4 : c >= 3 ? 3 : 2 }

  _comboTail(now) {
    clearTimeout(this._comboTimer)
    this._comboTimer = setTimeout(() => { this.ui.combo(0) }, 1500)
  }

  _maybeTimeStory() {
    if (!this.night || this.story.shown.size >= 2) return
    const t = (performance.now() - this.night.startedAt) / 1000
    const schedule = this.nightIndex === 0 ? [30] : this.nightIndex === 1 ? [28, 55] : [25, 50]
    const idx = schedule.findIndex((s, i) => t >= s && !this.story.shown.has(i))
    if (idx >= 0) this._storyWindow(idx)
  }

  _storyWindow(idx = null) {
    if (!this.night) return
    const stories = this.nights[this.nightIndex]?.stories || []
    let si = idx
    if (si == null) si = this.story.index % Math.max(1, stories.length)
    if (this.story.shown.has(si) && idx != null) return
    const s = stories[si % stories.length]
    if (!s) return
    this.story.shown.add(si)
    this.story.index = si + 1
    this.night.warmth += 6
    this.run.stories.push({ ...s, night: this.nightIndex + 1 })
    if (s.item) this.run.items.push(s.item)
    this.sfx('story')
    this.ui.story(s, () => this.ui.hideStory())
    this.ui.setStats(this)
  }

  _checkSurprise(w, n, now) {
    if (now - this._surprise.lastSurprise < 6500) return
    const roll = Math.random()
    if (roll < 0.22) this._surpriseEvent('golden', w, n, now)
    else if (roll < 0.40) this._surpriseEvent('star', w, n, now)
    else if (roll < 0.56) this._surpriseEvent('lanterns', w, n, now)
    else if (roll < 0.68) this._surpriseEvent('cat', w, n, now)
    else if (roll < 0.82) this._surpriseEvent('chain', w, n, now)
  }

  _surpriseEvent(kind, w, n, now) {
    this._surprise.lastSurprise = now
    const defs = {
      golden:  { text: '金窗 · 一间屋子忽然全亮了', gain: 12, fx: () => { this.scene.litWindow(w); } },
      star:    { text: '流星划过 · 许个愿吧', gain: 9, fx: () => this.scene.shootingStar() },
      lanterns: { text: '有人放了灯 · 一整排飘起来', gain: 10, fx: () => this.scene.releaseLanterns(6) },
      cat:     { text: '屋顶上蹲着一只猫 · 它看着你', gain: 8, fx: () => this.scene.rooftopCat() },
      chain:   { text: '连光 · 隔壁的窗也亮了', gain: 8, fx: () => this._lightRandom(3) }
    }
    const d = defs[kind]
    if (!d) return
    n.warmth += d.gain
    d.fx()
    if (kind !== 'chain') this._lightRandom(1)
    this.night.litCount = this.scene.windows.filter(x => x.lit).length
    this.scene.setLitCount(this.night.litCount)
    this.ui.toast(d.text, '+' + d.gain)
    this.ui.flash(kind === 'golden' ? 'golden' : 'combo')
    this.sfx('surprise')
    this.ui.setStats(this)
    if (this.night.litCount >= 24) this._allLit()
  }

  _lightRandom(k) {
    const dim = this.scene.windows.filter(x => !x.lit)
    for (const x of dim.slice(0, k)) this.scene.litWindow(x)
  }

  _maybeSurprise(w, n, now) {
    if (n.combo > 0 && n.combo % 5 === 0) this.sfx('comboUp')
    if (n.combo > 0 && n.combo % 10 === 0) {
      n.warmth += 10
      this.ui.flash('combo')
      this.ui.toast('光链 ×' + n.combo + ' · 整面墙在回应你', '+10')
      this.sfx('surprise')
      this._lightRandom(2)
      this.night.litCount = this.scene.windows.filter(x => x.lit).length
      this.scene.setLitCount(this.night.litCount)
    }
  }

  _burstWindows(k) {
    const dims = this.scene.windows.filter(x => !x.lit).slice(0, k)
    for (const w of dims) { this.scene.litWindow(w); this.night.litCount++ }
    this.scene.setLitCount(this.night.litCount)
    if (this.night.litCount >= 24) this._allLit()
  }

  _allLit() {
    if (this.night.litAll) return
    this.night.litAll = true
    this.night.warmth += 15
    this.ui.banner('整栋楼，都亮了')
    this.ui.flash('combo')
    this.sfx('surprise')
    this.ui.setStats(this)
    setTimeout(() => { if (this.state === 'night') this._endNight() }, 1400)
  }

  _endNight() {
    if (this._ending) return
    this._ending = true
    this.state = 'settle'
    clearTimeout(this._litTimer)
    cancelAnimationFrame(this._raf)
    const n = this.night
    this.run.totalWarmth += n.warmth
    this.run.litTotal += n.litCount
    this.run.bestNightWarmth = Math.max(this.run.bestNightWarmth, n.warmth)
    const summary = { warmth: n.warmth, lit: n.litCount, maxCombo: n.maxCombo, night: this.nightIndex + 1, count: NIGHT_COUNT }
    setTimeout(() => {
      this._ending = false
      if (this.nightIndex + 1 < NIGHT_COUNT) {
        n.combo = 0
        this.ui.nightSummary(summary, () => this._launchNight(this.nightIndex + 1))
      } else {
        this._finish()
      }
    }, 650)
  }

  async _finish() {
    this.state = 'done'
    this.run.items = Array.from(new Set(this.run.items))
    this.records = mergeRun(this.records, this.run)
    saveRecords(this.records)
    const postcard = await drawPostcard({ run: this.run, nights: this.nights, records: this.records })
    this.ui.result({ run: this.run, records: this.records, postcard, nights: this.nights, aiSource: this.aiSource, onReplay: () => this.start() })
    this.refreshBoard?.()
  }

  submitScore(nickname) {
    const payload = { nickname, litWindows: Math.min(72, this.run.litTotal), maxCombo: this.run.maxCombo, totalWarmth: this.run.totalWarmth }
    return fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(r => r.json()).catch(() => ({ ok: false }))
  }

  togglePause() {
    if (this.state === 'night') {
      this._pausedAt = performance.now()
      this.state = 'paused'
      clearTimeout(this._litTimer); cancelAnimationFrame(this._raf)
      this.ui.pause(() => this._resume())
    } else if (this.state === 'paused') this._resume()
  }

  _resume() {
    if (!this.night) return
    const delta = performance.now() - this._pausedAt
    this.night.endsAt += delta; this.night.startedAt += delta
    this.state = 'night'
    this.ui.hidePause()
    this._startTicker()
    this._scheduleNextLit(this._nextLitSpeed)
  }
}
