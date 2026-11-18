// Four-layer adaptive WebAudio synth. Everything is generated at runtime from
// oscillators and noise buffers, so the game ships with no audio files.
//
//   L1  weather bed  pink + brown noise through bandpass filters, wind LFO
//   L2  warm pad     detuned triangle/sine stack, Fmaj7 -> G6 -> Em7 -> Am9,
//                    faded in by the number of lit windows
//   L3  lead         pentatonic marimba / harp glissando
//   L4  foley        per-resident easter eggs, resonance, stamp and endings
//
// The context is created lazily on the first unlock() (which must run inside a
// user gesture). Every public method is a safe no-op before that point.

const MASTER_LEVEL = 0.55
const MAX_VOICES = 48
const LOOKAHEAD = 0.18
const CHORD_BEATS = 16

// C5 D5 E5 G5 A5 C6 D6 E6, one octave of the C major pentatonic scale.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

// Fmaj7, G6, Em7, Am9 as open four-note voicings.
const CHORDS = [
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [220.0, 261.63, 392.0, 493.88]
]

// Beats per minute for each tempo label. A chord lasts CHORD_BEATS beats.
const TEMPO = { slow: 62, normal: 76, brisk: 96 }

// L1 presets. pink/brown are the bandpass centres of the two noise beds.
const WEATHER = {
  light_rain: { pinkFreq: 850, pinkQ: 0.8, pinkGain: 0.24, brownFreq: 240, brownQ: 0.7, brownGain: 0.12, windDepth: 0, gust: 0.018 },
  wind: { pinkFreq: 450, pinkQ: 1.5, pinkGain: 0.2, brownFreq: 170, brownQ: 0.8, brownGain: 0.13, windDepth: 230, gust: 0.05 },
  fog: { pinkFreq: 620, pinkQ: 2.6, pinkGain: 0.03, brownFreq: 88, brownQ: 1.0, brownGain: 0.08, windDepth: 40, gust: 0.02 },
  snow: { pinkFreq: 960, pinkQ: 3.2, pinkGain: 0.018, brownFreq: 95, brownQ: 1.2, brownGain: 0.028, windDepth: 65, gust: 0.012 },
  clear: { pinkFreq: 5200, pinkQ: 0.7, pinkGain: 0.014, brownFreq: 120, brownQ: 0.8, brownGain: 0.003, windDepth: 0, gust: 0.006 }
}

const ENDING_A = 'ENDING_A_WARMTH'
const ENDING_B = 'ENDING_B_COMPANION'
const ENDING_C = 'ENDING_C_STARGAZER'
const ENDING_D = 'ENDING_D_HARMONY'
const ENDING_E = 'ENDING_E_DAWN'
const ENDING_F = 'ENDING_F_DRIFT'

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export class AudioEngine {
  constructor() {
    this.ctx = null
    this._failed = false
    this._muted = false
    this._weather = 'light_rain'
    this._tempo = 'normal'
    this._bpm = TEMPO.normal
    this._chordDur = (60 / this._bpm) * CHORD_BEATS
    this._litCount = 0
    this._voices = 0
    this._chainStep = 0
    this._nextChord = 0
    this._chordIndex = 0
    this._dropletNext = 0
    this._timer = 0
    this._timers = new Set()
    this._sources = []
    this._padOscs = []
    this._shimmerOscs = []
    this.master = null
    this.music = null
    this.sfx = null
    this._padGain = null
    this._padFilter = null
    this._shimmerGain = null
    this._bed = null
  }

  get ready() {
    return !!this.ctx && this.ctx.state !== 'closed'
  }

  get muted() {
    return this._muted
  }

  // Must be called from a user gesture. Creates the only AudioContext the
  // engine will ever own and resumes it if the browser suspended it again.
  unlock() {
    if (this._failed) return false
    if (!this.ctx) {
      if (typeof window === 'undefined') return false
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext
      if (!AC) {
        this._failed = true
        return false
      }
      try {
        this.ctx = new AC()
      } catch {
        this._failed = true
        return false
      }
      try {
        this._build()
      } catch {
        this._teardown()
        this._failed = true
        return false
      }
    }
    try {
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        const p = this.ctx.resume()
        if (p && p.catch) p.catch(() => {})
      }
    } catch {}
    return this.ready
  }

  setMuted(flag) {
    this._muted = !!flag
    if (this.ready) {
      this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.08)
    }
    return this._muted
  }

  setWeather(weather) {
    if (typeof weather !== 'string' || !WEATHER[weather]) return
    this._weather = weather
    this._dropletNext = 0
    if (this.ready) this._applyWeather()
  }

  setTempo(tempo) {
    if (typeof tempo !== 'string' || !TEMPO[tempo]) return
    this._tempo = tempo
    this._bpm = TEMPO[tempo]
    this._chordDur = (60 / this._bpm) * CHORD_BEATS
    if (this.ready) {
      const now = this.ctx.currentTime
      if (this._nextChord > now + this._chordDur) this._nextChord = now + this._chordDur * 0.5
    }
  }

  setLitCount(n) {
    this._litCount = clamp(Math.floor(finite(n, 0)), 0, 30)
    this._applyLit()
  }

  tap(combo) {
    if (!this.ready || this._muted) return
    const c = Math.max(0, Math.floor(finite(combo, 0)))
    const step = c % SCALE.length
    const octave = Math.min(2, Math.floor(c / SCALE.length))
    const freq = SCALE[step] * Math.pow(2, octave)
    const t = this.ctx.currentTime + 0.012
    this._marimba(freq, t, 0.19 + Math.min(0.08, c * 0.005), ((c % 5) - 2) * 0.11)
    if (c >= 6 && c % 3 === 0) this._marimba(freq * 2, t + 0.05, 0.055, 0.2)
  }

  chain(count) {
    if (!this.ready || this._muted) return
    const n = clamp(Math.floor(finite(count, 1)), 1, 16)
    const t0 = this.ctx.currentTime + 0.02
    const base = this._chainStep % SCALE.length
    for (let i = 0; i < n; i++) {
      const step = base + i
      const freq = SCALE[step % SCALE.length] * Math.pow(2, Math.min(2, Math.floor(step / SCALE.length)))
      const pan = n > 1 ? -0.35 + (0.7 * i) / (n - 1) : 0
      this._marimba(freq, t0 + i * 0.045, 0.13, pan)
    }
    this._chainStep = (this._chainStep + n + 2) % (SCALE.length * 3)
  }

  /** Play clear glass chime cue when memory sequence flashes a window. */
  cue(step = 0) {
    if (!this.ready || this._muted) return
    const i = Math.max(0, Math.floor(finite(step, 0)))
    const freq = SCALE[i % SCALE.length] * 1.5
    this._marimba(freq, this.ctx.currentTime + 0.01, 0.14, ((i % 5) - 2) * 0.14)
  }

  /** Rising chime when player nails a memory / reflex / puzzle window. */
  correct(step = 0) {
    if (!this.ready || this._muted) return
    const i = Math.max(0, Math.floor(finite(step, 0)))
    const t = this.ctx.currentTime + 0.01
    const f1 = SCALE[i % SCALE.length]
    this._marimba(f1, t, 0.16, 0)
    this._marimba(f1 * 1.25, t + 0.055, 0.11, 0.18)
  }

  /** Soft muffled wooden thud on miss / wrong tap (never harsh). */
  wrong() {
    if (!this.ready || this._muted) return
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(196, t)
    o.frequency.exponentialRampToValueAtTime(132, t + 0.16)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20)
    o.connect(g)
    g.connect(this.sfx)
    o.start(t)
    o.stop(t + 0.22)
    o.onended = () => this._releaseVoice()
  }

  /** Celebratory chord arpeggio on stage / puzzle clear. */
  victory() {
    if (!this.ready || this._muted) return
    const t = this.ctx.currentTime + 0.02
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._marimba(f, t + i * 0.075, 0.16, -0.24 + i * 0.16)
    })
  }

  /** Subtle warm wooden typewriter pip for NPC dialogue progression. */
  npcChat(pitchOffset = 0) {
    if (!this.ready || this._muted) return
    const idx = Math.max(0, Math.min(SCALE.length - 1, Math.floor(finite(pitchOffset, 0))))
    this._softTone(SCALE[idx] * 0.75, this.ctx.currentTime + 0.01, 0.04, 0.09, 'triangle', 0.01)
  }

  lit(roomId) {
    if (!this.ready || this._muted) return
    const id = Number.parseInt(String(roomId), 10)
    const t = this.ctx.currentTime + 0.02
    if (id === 304) this._purr(t)
    else if (id === 301) this._gulp(t)
    else if (id === 205) this._tune(t)
    else if (id === 406) this._chimes(t)
    else if (id === 102) this._clink(t)
    else if (id === 203) this._scratch(t)
    else this._marimba(SCALE[2] * 2, t, 0.06, 0)
  }

  resonance() {
    if (!this.ready || this._muted) return
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.02
    const notes = [880.0, 1046.5, 1318.51, 1567.98, 1760.0]
    const detunes = [-5, 5]
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * 0.055
      for (let d = 0; d < detunes.length; d++) {
        const o = ctx.createOscillator()
        o.type = d === 0 ? 'sine' : 'triangle'
        o.frequency.setValueAtTime(notes[i], tt)
        o.detune.value = detunes[d]
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, tt)
        g.gain.linearRampToValueAtTime(0.045 / (1 + i * 0.25), tt + 0.2)
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.6)
        o.connect(g)
        g.connect(this.sfx)
        o.start(tt)
        o.stop(tt + 2.7)
      }
    }
    const src = this._noiseSource('pink', t, 2.2)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.4
    bp.frequency.setValueAtTime(2400, t)
    bp.frequency.linearRampToValueAtTime(5200, t + 1.4)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.linearRampToValueAtTime(0.03, t + 0.5)
    ng.gain.linearRampToValueAtTime(0.0001, t + 2.1)
    src.connect(bp)
    bp.connect(ng)
    ng.connect(this.sfx)
    this._hold(2800)
  }

  stamp() {
    if (!this.ready || this._muted) return
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const thud = ctx.createOscillator()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(120, t)
    thud.frequency.exponentialRampToValueAtTime(46, t + 0.18)
    const tg = ctx.createGain()
    tg.gain.setValueAtTime(0.0001, t)
    tg.gain.exponentialRampToValueAtTime(0.3, t + 0.012)
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    thud.connect(tg)
    tg.connect(this.sfx)
    thud.start(t)
    thud.stop(t + 0.3)

    const src = this._noiseSource('brown', t, 0.25)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.16, t + 0.01)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    src.connect(lp)
    lp.connect(ng)
    ng.connect(this.sfx)

    const bell = ctx.createOscillator()
    bell.type = 'sine'
    bell.frequency.value = 1046.5
    const mod = ctx.createOscillator()
    mod.type = 'sine'
    mod.frequency.value = 1568
    const modGain = ctx.createGain()
    modGain.gain.setValueAtTime(220, t)
    modGain.gain.exponentialRampToValueAtTime(1, t + 0.9)
    mod.connect(modGain)
    modGain.connect(bell.frequency)
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(0.0001, t)
    bg.gain.exponentialRampToValueAtTime(0.1, t + 0.01)
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    bell.connect(bg)
    bg.connect(this.sfx)
    bell.start(t)
    bell.stop(t + 1.7)
    mod.start(t)
    mod.stop(t + 1.7)
    this._hold(1700)
  }

  nightStart(index) {
    if (!this.ready || this._muted) return
    const i = Math.floor(finite(index, 0))
    const chord = CHORDS[((i % CHORDS.length) + CHORDS.length) % CHORDS.length]
    const t = this.ctx.currentTime + 0.05
    this._softTone(chord[0] / 2, t, 0.05, 3.0, 'sine', 0.4)
    this._softTone(chord[1], t + 0.02, 0.07, 2.6, 'triangle', 0.18)
    this._softTone(chord[2], t + 0.44, 0.065, 2.4, 'triangle', 0.18)
    this._softTone(chord[3], t + 0.88, 0.06, 2.4, 'triangle', 0.2)
  }

  finale(endingId) {
    if (!this.ready || this._muted) return
    const id = String(endingId || '').toUpperCase()
    const t = this.ctx.currentTime + 0.08
    if (id === ENDING_A) {
      const notes = [349.23, 440.0, 523.25, 698.46, 880.0]
      this._phrase(notes, t, 0.22, 0.075, 2.6)
      const chord = CHORDS[0]
      for (let i = 0; i < chord.length; i++) this._softTone(chord[i], t + 1.1, 0.055, 3.4, 'triangle', 0.5)
    } else if (id === ENDING_B) {
      const notes = [440.0, 523.25, 493.88, 440.0, 392.0]
      this._phrase(notes, t, 0.46, 0.07, 3.2)
      this._softTone(110.0, t + 0.2, 0.04, 3.6, 'sine', 0.7)
    } else if (id === ENDING_C) {
      const notes = [1046.5, 1318.51, 1567.98, 2093.0, 2637.02]
      this._phrase(notes, t, 0.16, 0.045, 3.4)
      this._softTone(523.25, t + 0.9, 0.04, 3.8, 'sine', 0.8)
    } else if (id === ENDING_D) {
      this._phrase([392.0, 493.88, 587.33], t, 0.2, 0.07, 2.4)
      this._phrase([440.0, 523.25, 659.25], t + 0.9, 0.2, 0.07, 2.4)
      this._sharpShimmer(t + 1.8)
    } else if (id === ENDING_E) {
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 1046.5]
      this._phrase(notes, t, 0.26, 0.07, 3.0)
      this._softTone(1046.5, t + 1.6, 0.035, 3.6, 'sine', 0.9)
    } else if (id === ENDING_F) {
      const notes = [440.0, 392.0, 329.63, 261.63]
      this._phrase(notes, t, 0.72, 0.065, 3.6)
    } else {
      this._phrase([523.25, 659.25, 880.0, 1046.5], t, 0.3, 0.06, 2.8)
    }
  }

  dispose() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = 0
    }
    for (const id of this._timers) clearTimeout(id)
    this._timers.clear()
    this._teardown()
  }

  // ---------------------------------------------------------------- internals

  _build() {
    const ctx = this.ctx
    const now = ctx.currentTime
    this._sources = []
    this._padOscs = []
    this._shimmerOscs = []
    this._voices = 0

    // Master chain: everything flows through a gentle compressor so a long
    // glissando over a full pad cannot clip.
    const master = ctx.createGain()
    master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 20
    comp.ratio.value = 2.6
    comp.attack.value = 0.012
    comp.release.value = 0.3
    master.connect(comp)
    comp.connect(ctx.destination)
    this.master = master
    master.gain.setTargetAtTime(this._muted ? 0 : MASTER_LEVEL, now, 0.35)

    const music = ctx.createGain()
    music.gain.value = 0.9
    music.connect(master)
    const sfx = ctx.createGain()
    sfx.gain.value = 1
    sfx.connect(master)
    this.music = music
    this.sfx = sfx

    // Small algorithmic room so the mallets do not sound dry.
    const verb = ctx.createConvolver()
    verb.buffer = this._impulse(2.8)
    const wet = ctx.createGain()
    wet.gain.value = 0.5
    verb.connect(wet)
    wet.connect(master)
    const musicSend = ctx.createGain()
    musicSend.gain.value = 0.3
    music.connect(musicSend)
    musicSend.connect(verb)
    const sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.14
    sfx.connect(sfxSend)
    sfxSend.connect(verb)

    this._pinkBuf = this._noiseBuffer('pink', 4)
    this._brownBuf = this._noiseBuffer('brown', 4)
    this._buildBed(now, music)
    this._buildPad(now, music)

    this._nextChord = now + 1.2
    this._chordIndex = 0
    this._dropletNext = 0
    this._applyWeather()
    this._applyLit()
    this._schedule()
    // @ts-expect-error Node types say setTimeout returns a Timeout, the field is a number
    this._timer = setInterval(() => this._schedule(), LOOKAHEAD * 1000 + 20)
  }

  _buildBed(now, music) {
    const ctx = this.ctx
    const pinkSrc = ctx.createBufferSource()
    pinkSrc.buffer = this._pinkBuf
    pinkSrc.loop = true
    const pinkFilter = ctx.createBiquadFilter()
    pinkFilter.type = 'bandpass'
    pinkFilter.frequency.value = 850
    pinkFilter.Q.value = 0.8
    const pinkGain = ctx.createGain()
    pinkGain.gain.value = 0
    pinkSrc.connect(pinkFilter)
    pinkFilter.connect(pinkGain)
    pinkGain.connect(music)

    const brownSrc = ctx.createBufferSource()
    brownSrc.buffer = this._brownBuf
    brownSrc.loop = true
    const brownFilter = ctx.createBiquadFilter()
    brownFilter.type = 'bandpass'
    brownFilter.frequency.value = 240
    brownFilter.Q.value = 0.7
    const brownGain = ctx.createGain()
    brownGain.gain.value = 0
    brownSrc.connect(brownFilter)
    brownFilter.connect(brownGain)
    brownGain.connect(music)

    // Wind LFO swings the pink bandpass between 220Hz and 680Hz around 450Hz.
    const windLfo = ctx.createOscillator()
    windLfo.type = 'sine'
    windLfo.frequency.value = 0.07
    const windDepth = ctx.createGain()
    windDepth.gain.value = 0
    windLfo.connect(windDepth)
    windDepth.connect(pinkFilter.frequency)

    // A second, slower LFO breathes the overall level.
    const gustLfo = ctx.createOscillator()
    gustLfo.type = 'sine'
    gustLfo.frequency.value = 0.033
    const gustDepth = ctx.createGain()
    gustDepth.gain.value = 0
    gustLfo.connect(gustDepth)
    gustDepth.connect(pinkGain.gain)

    pinkSrc.start(now, Math.random() * 3)
    brownSrc.start(now, Math.random() * 3)
    windLfo.start(now)
    gustLfo.start(now)
    this._sources.push(pinkSrc, brownSrc, windLfo, gustLfo)
    this._bed = { pinkFilter, pinkGain, brownFilter, brownGain, windDepth, gustDepth }
  }

  _buildPad(now, music) {
    const ctx = this.ctx
    const padFilter = ctx.createBiquadFilter()
    padFilter.type = 'lowpass'
    padFilter.frequency.value = 760
    padFilter.Q.value = 0.6
    const padGain = ctx.createGain()
    padGain.gain.value = 0
    padFilter.connect(padGain)
    padGain.connect(music)

    const chord = CHORDS[0]
    for (let tone = 0; tone < 4; tone++) {
      const level = 0.12 / (1 + tone * 0.3)
      for (let d = 0; d < 3; d++) {
        const o = ctx.createOscillator()
        o.type = d === 1 ? 'sine' : 'triangle'
        o.frequency.value = chord[tone]
        o.detune.value = d === 0 ? -6 : d === 1 ? 0 : 6
        const g = ctx.createGain()
        g.gain.value = level
        o.connect(g)
        g.connect(padFilter)
        o.start(now)
        this._padOscs.push(o)
        this._sources.push(o)
      }
    }

    // High octave shimmer, only audible from 20 lit windows.
    const shimmerGain = ctx.createGain()
    shimmerGain.gain.value = 0
    shimmerGain.connect(music)
    const trem = ctx.createGain()
    trem.gain.value = 0.7
    const tremLfo = ctx.createOscillator()
    tremLfo.type = 'sine'
    tremLfo.frequency.value = 0.13
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.3
    tremLfo.connect(tremDepth)
    tremDepth.connect(trem.gain)
    trem.connect(shimmerGain)
    tremLfo.start(now)
    this._sources.push(tremLfo)
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = chord[2 + i] * 4
      o.detune.value = i === 0 ? -4 : 4
      const g = ctx.createGain()
      g.gain.value = 0.5
      o.connect(g)
      g.connect(trem)
      o.start(now)
      this._shimmerOscs.push(o)
      this._sources.push(o)
    }
    this._padFilter = padFilter
    this._padGain = padGain
    this._shimmerGain = shimmerGain
  }

  _applyWeather() {
    if (!this.ready || !this._bed) return
    const p = WEATHER[this._weather] || WEATHER.light_rain
    const t = this.ctx.currentTime
    const bed = this._bed
    bed.pinkFilter.frequency.setTargetAtTime(p.pinkFreq, t, 0.4)
    bed.pinkFilter.Q.setTargetAtTime(p.pinkQ, t, 0.4)
    bed.pinkGain.gain.setTargetAtTime(p.pinkGain, t, 0.5)
    bed.brownFilter.frequency.setTargetAtTime(p.brownFreq, t, 0.4)
    bed.brownFilter.Q.setTargetAtTime(p.brownQ, t, 0.4)
    bed.brownGain.gain.setTargetAtTime(p.brownGain, t, 0.5)
    bed.windDepth.gain.setTargetAtTime(p.windDepth, t, 0.7)
    bed.gustDepth.gain.setTargetAtTime(p.gust, t, 0.7)
  }

  _applyLit() {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const n = this._litCount
    // Square-root curves track perceived loudness: the first few windows
    // after 5 already lift the pad instead of staying inaudible.
    let pad = 0
    if (n > 5) pad = Math.sqrt(Math.min(1, (n - 5) / 10)) * 0.55
    if (n > 15) pad = 0.55 + Math.sqrt(Math.min(1, (n - 15) / 8)) * 0.3
    const shim = n < 20 ? 0 : 0.1 + Math.sqrt(Math.min(1, (n - 20) / 4)) * 0.2
    this._padGain.gain.setTargetAtTime(pad, t, 0.9)
    this._shimmerGain.gain.setTargetAtTime(shim, t, 1.2)
  }

  // Chord + droplet clock. Notes are always scheduled ahead on the audio
  // clock; the interval only decides when to look forward.
  _schedule() {
    if (!this.ready) return
    const now = this.ctx.currentTime
    if (this._nextChord < now - 0.5) this._nextChord = now + 0.2
    let guard = 0
    while (this._nextChord < now + LOOKAHEAD + 1.4 && guard++ < 4) {
      this._playChord(this._nextChord, this._chordIndex)
      this._nextChord += this._chordDur
      this._chordIndex = (this._chordIndex + 1) % CHORDS.length
    }
    if (this._weather === 'light_rain' && !this._muted) this._scheduleDroplets(now + 0.7)
  }

  _playChord(t, index) {
    const chord = CHORDS[index % CHORDS.length]
    for (let tone = 0; tone < 4; tone++) {
      for (let d = 0; d < 3; d++) {
        this._padOscs[tone * 3 + d].frequency.setTargetAtTime(chord[tone], t, 0.4)
      }
    }
    const base = 640 + this._litCount * 14
    this._padFilter.frequency.setTargetAtTime(base * 1.25, t, 0.18)
    this._padFilter.frequency.setTargetAtTime(base * 0.7, t + 0.9, 0.9)
    this._shimmerOscs[0].frequency.setTargetAtTime(chord[2] * 4, t, 0.5)
    this._shimmerOscs[1].frequency.setTargetAtTime(chord[3] * 4, t, 0.5)
    if (this._muted) return
    for (let i = 0; i < 3; i++) {
      this._softTone(chord[(i + 1) % 4] * 2, t + i * 0.9, 0.026, 1.8, 'sine', 0.05)
    }
  }

  _scheduleDroplets(horizon) {
    const now = this.ctx.currentTime
    if (this._dropletNext < now + 0.02) this._dropletNext = now + 0.06
    let guard = 0
    while (this._dropletNext < horizon && guard++ < 6) {
      this._droplet(this._dropletNext)
      this._dropletNext += 0.1 + Math.random() * 0.32
    }
  }

  _droplet(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const heavy = Math.random() < 0.15
    const f = heavy ? 620 + Math.random() * 300 : 1500 + Math.random() * 2100
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.72, t + 0.08)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(heavy ? 0.035 : 0.022 + Math.random() * 0.024, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.16 : 0.06 + Math.random() * 0.07))
    const p = ctx.createStereoPanner()
    p.pan.value = Math.random() * 1.6 - 0.8
    o.connect(g)
    g.connect(p)
    p.connect(this.music)
    o.start(t)
    o.stop(t + 0.25)
    o.onended = () => this._releaseVoice()
  }

  _marimba(freq, t, peak, pan) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const out = ctx.createGain()
    out.gain.value = clamp(finite(peak, 0.15), 0, 0.4)
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(finite(pan, 0), -1, 1)
    out.connect(p)
    p.connect(this.sfx)

    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.setValueAtTime(freq, t)
    const bodyGain = ctx.createGain()
    bodyGain.gain.setValueAtTime(0.0001, t)
    bodyGain.gain.exponentialRampToValueAtTime(1, t + 0.008)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    body.connect(bodyGain)
    bodyGain.connect(out)

    // A 30ms 4x partial is what makes a sine read as a struck wooden bar.
    const mallet = ctx.createOscillator()
    mallet.type = 'sine'
    mallet.frequency.setValueAtTime(freq * 4, t)
    const malletGain = ctx.createGain()
    malletGain.gain.setValueAtTime(0.0001, t)
    malletGain.gain.exponentialRampToValueAtTime(0.35, t + 0.003)
    malletGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    mallet.connect(malletGain)
    malletGain.connect(out)

    const ring = ctx.createOscillator()
    ring.type = 'triangle'
    ring.frequency.setValueAtTime(freq * 2, t)
    const ringGain = ctx.createGain()
    ringGain.gain.setValueAtTime(0.0001, t)
    ringGain.gain.exponentialRampToValueAtTime(0.22, t + 0.006)
    ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    ring.connect(ringGain)
    ringGain.connect(out)

    body.start(t)
    mallet.start(t)
    ring.start(t)
    body.stop(t + 0.52)
    mallet.stop(t + 0.05)
    ring.stop(t + 0.24)
    body.onended = () => this._releaseVoice()
  }

  _softTone(freq, t, peak, dur, type = 'sine', attack = 0.12) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(clamp(finite(peak, 0.05), 0, 0.3), t + Math.max(0.02, attack))
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.1, dur))
    o.connect(g)
    g.connect(this.music)
    o.start(t)
    o.stop(t + dur + 0.1)
  }

  _phrase(notes, t, step, peak, dur) {
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * step
      this._softTone(notes[i], tt, peak, dur, 'triangle', 0.03)
      this._softTone(notes[i] * 2, tt + 0.01, peak * 0.35, dur * 0.6, 'sine', 0.02)
    }
  }

  _sharpShimmer(t) {
    const notes = [1046.5, 1318.51, 1567.98]
    for (let i = 0; i < notes.length; i++) {
      this._softTone(notes[i], t + i * 0.09, 0.03, 2.2, 'sine', 0.06)
    }
  }

  // L4 resident foley --------------------------------------------------------

  _purr(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('brown', t, 1.9)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 460
    lp.Q.value = 6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.3)
    g.gain.linearRampToValueAtTime(0.34, t + 1.1)
    g.gain.linearRampToValueAtTime(0.0001, t + 1.8)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.sfx)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 24
    const depth = ctx.createGain()
    depth.gain.value = 0.22
    lfo.connect(depth)
    depth.connect(g.gain)
    lfo.start(t)
    lfo.stop(t + 1.9)
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(58, t)
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.0001, t)
    sg.gain.linearRampToValueAtTime(0.05, t + 0.4)
    sg.gain.linearRampToValueAtTime(0.0001, t + 1.7)
    sub.connect(sg)
    sg.connect(this.sfx)
    sub.start(t)
    sub.stop(t + 1.8)
    this._hold(1900)
  }

  _gulp(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.17 + Math.random() * 0.02
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f = 150 + Math.random() * 60 - i * 12
      o.frequency.setValueAtTime(f, tt)
      o.frequency.exponentialRampToValueAtTime(68, tt + 0.14)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, tt)
      g.gain.exponentialRampToValueAtTime(0.13 - i * 0.02, tt + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16)
      o.connect(g)
      g.connect(this.sfx)
      o.start(tt)
      o.stop(tt + 0.2)
    }
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.05, t + 0.25)
    g.gain.linearRampToValueAtTime(0.0001, t + 0.9)
    lp.connect(g)
    g.connect(this.sfx)
    this._noiseSource('pink', t, 1.0).connect(lp)
    this._hold(1000)
  }

  _tune(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('pink', t, 1.0)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 7
    bp.frequency.setValueAtTime(700, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.4)
    bp.frequency.exponentialRampToValueAtTime(1050, t + 0.75)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.09, t + 0.1)
    g.gain.setValueAtTime(0.09, t + 0.5)
    g.gain.linearRampToValueAtTime(0.0001, t + 0.95)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1500, t)
    o.frequency.linearRampToValueAtTime(760, t + 0.8)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.linearRampToValueAtTime(0.012, t + 0.2)
    og.gain.linearRampToValueAtTime(0.0001, t + 0.85)
    o.connect(og)
    og.connect(this.sfx)
    o.start(t)
    o.stop(t + 0.9)
    this._marimba(SCALE[4] * 2, t + 0.78, 0.06, 0.25)
    this._hold(1000)
  }

  _chimes(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const partials = [1567.98, 2093.0, 2637.02, 3135.96]
    for (let i = 0; i < partials.length; i++) {
      const tt = t + i * 0.085 + Math.random() * 0.03
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(partials[i], tt)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, tt)
      g.gain.exponentialRampToValueAtTime(0.045 / (1 + i * 0.3), tt + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4)
      const p = ctx.createStereoPanner()
      p.pan.value = -0.6 + i * 0.4
      o.connect(g)
      g.connect(p)
      p.connect(this.sfx)
      o.start(tt)
      o.stop(tt + 1.5)
    }
    const src = this._noiseSource('pink', t, 1.2)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 5200
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.03, t + 0.15)
    g.gain.linearRampToValueAtTime(0.0001, t + 1.1)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.sfx)
    this._hold(1500)
  }

  _clink(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('pink', t, 0.2)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2800
    bp.Q.value = 9
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.14, t + 0.004)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    src.connect(bp)
    bp.connect(ng)
    ng.connect(this.sfx)
    const ring = ctx.createOscillator()
    ring.type = 'sine'
    ring.frequency.setValueAtTime(1720, t)
    const rg = ctx.createGain()
    rg.gain.setValueAtTime(0.0001, t)
    rg.gain.exponentialRampToValueAtTime(0.06, t + 0.005)
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    ring.connect(rg)
    rg.connect(this.sfx)
    ring.start(t)
    ring.stop(t + 0.32)
    const knock = ctx.createOscillator()
    knock.type = 'sine'
    knock.frequency.setValueAtTime(620, t)
    const kg = ctx.createGain()
    kg.gain.setValueAtTime(0.0001, t)
    kg.gain.exponentialRampToValueAtTime(0.09, t + 0.006)
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
    knock.connect(kg)
    kg.connect(this.sfx)
    knock.start(t)
    knock.stop(t + 0.15)
    this._hold(400)
  }

  _scratch(t) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('pink', t, 0.75)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3000
    bp.Q.value = 1.3
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    for (let i = 0; i < 9; i++) {
      const tt = t + 0.02 + i * 0.055
      g.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.02, tt + 0.012)
      g.gain.linearRampToValueAtTime(0.004, tt + 0.05)
    }
    g.gain.linearRampToValueAtTime(0.0001, t + 0.66)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.sfx)
    this._hold(750)
  }

  // ------------------------------------------------------------- utilities

  _noiseSource(kind, t, dur) {
    const ctx = this.ctx
    const buf = kind === 'brown' ? this._brownBuf : this._pinkBuf
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start(t, Math.random() * Math.max(0.1, buf.duration - 0.2))
    src.stop(t + dur + 0.05)
    return src
  }

  _takeVoice() {
    if (this._voices >= MAX_VOICES) return false
    this._voices += 1
    return true
  }

  _releaseVoice() {
    if (this._voices > 0) this._voices -= 1
  }

  _hold(ms) {
    const id = setTimeout(() => {
      this._timers.delete(id)
      this._releaseVoice()
    }, ms)
    this._timers.add(id)
  }

  _impulse(seconds) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1
        lp = lp * 0.72 + n * 0.28
        data[i] = lp * Math.pow(1 - i / len, 2.6) * 0.6
      }
    }
    return buf
  }

  _noiseBuffer(kind, seconds) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    if (kind === 'brown') {
      // One-pole leaky integrator: the classic brown-ish rumble.
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.2
      }
    } else {
      // Paul Kellet's economy pink filter.
      let b0 = 0
      let b1 = 0
      let b2 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22
      }
    }
    // Cross-fade the tail into the head so the loop point is inaudible.
    const fade = Math.min(Math.floor(ctx.sampleRate * 0.05), Math.floor(len / 4))
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      data[len - fade + i] = data[len - fade + i] * (1 - k) + data[i] * k
    }
    return buf
  }

  _teardown() {
    for (const src of this._sources) {
      try {
        src.stop()
      } catch {}
    }
    this._sources = []
    this._padOscs = []
    this._shimmerOscs = []
    try {
      if (this.master) this.master.disconnect()
    } catch {}
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.music = null
    this.sfx = null
    this._padGain = null
    this._padFilter = null
    this._shimmerGain = null
    this._bed = null
    this._voices = 0
    if (ctx && ctx.state !== 'closed' && ctx.close) {
      try {
        const p = ctx.close()
        if (p && p.catch) p.catch(() => {})
      } catch {}
    }
  }
}

export default AudioEngine
