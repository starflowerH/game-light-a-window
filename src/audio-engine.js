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

const MASTER_LEVEL = 0.62
const MAX_VOICES = 64
const LOOKAHEAD = 0.20
const CHORD_BEATS = 16

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12)

// C5 D5 E5 G5 A5 C6 D6 E6, one octave of the C major pentatonic scale.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

// Fmaj7, G6, Em7, Am9 as open four-note voicings.
const CHORDS = [
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [220.0, 261.63, 392.0, 493.88]
]

// Beats per minute for each tempo label.
const TEMPO = { slow: 66, normal: 80, brisk: 102 }

// L1 presets tuned softly so rain & wind support rather than bury the piano/strings.
const WEATHER = {
  light_rain: { pinkFreq: 850, pinkQ: 0.9, pinkGain: 0.085, brownFreq: 220, brownQ: 0.7, brownGain: 0.055, windDepth: 0, gust: 0.008 },
  wind: { pinkFreq: 450, pinkQ: 1.5, pinkGain: 0.08, brownFreq: 170, brownQ: 0.8, brownGain: 0.06, windDepth: 200, gust: 0.022 },
  fog: { pinkFreq: 620, pinkQ: 2.6, pinkGain: 0.018, brownFreq: 88, brownQ: 1.0, brownGain: 0.036, windDepth: 35, gust: 0.008 },
  snow: { pinkFreq: 960, pinkQ: 3.2, pinkGain: 0.012, brownFreq: 95, brownQ: 1.2, brownGain: 0.016, windDepth: 55, gust: 0.006 },
  clear: { pinkFreq: 5200, pinkQ: 0.7, pinkGain: 0.008, brownFreq: 120, brownQ: 0.8, brownGain: 0.002, windDepth: 0, gust: 0.003 }
}

const SCENE_AUTO_TRACK = {
  title: 'kataware',
  hub: 'kataware',
  story1: 'kataware',
  story2: 'bluedragon',
  story3: 'bluedragon',
  patrol_reflex: 'bluedragon',
  memory_sequence: 'mysoul',
  memory_snapshot: 'mysoul',
  lights_out_puzzle: 'mysoul'
}

// ---------------------------------------------------------------- Musical Scores (16-step bars, 8 bars = 128 steps)

// ① 黄昏之时风格 (Kataware-doki inspired): A major / F# minor lyrical twilight piano + strings, 78 BPM
const SCORE_KATAWARE = {
  bpm: 78,
  bars: [
    // Bar 1: F#m7 | Bar 2: Dmaj7 | Bar 3: Aadd9 | Bar 4: E
    { bass: 42, arp: [54, 61, 64, 66, 69, 66, 64, 61], pad: [54, 61, 64, 69], mel: { 0: 73, 4: 76, 6: 78, 10: 76, 14: 73 }, cel: { 0: 85, 6: 90 } },
    { bass: 38, arp: [50, 57, 61, 62, 66, 62, 61, 57], pad: [50, 57, 61, 66], mel: { 0: 71, 4: 73, 6: 76, 12: 71 }, cel: { 6: 88 } },
    { bass: 45, arp: [45, 52, 57, 59, 61, 59, 57, 52], pad: [57, 61, 64, 71], mel: { 0: 69, 4: 71, 6: 73, 10: 76, 14: 74 }, cel: { 0: 81 } },
    { bass: 40, arp: [40, 47, 52, 56, 59, 64, 59, 56], pad: [52, 56, 59, 64], mel: { 0: 71, 6: 73, 10: 71, 12: 68 }, cel: { 12: 80 } },
    // Bar 5: F#m7 | Bar 6: Dmaj7 | Bar 7: Bm7 -> E7sus4 | Bar 8: Aadd9 resolve
    { bass: 42, arp: [54, 61, 64, 69, 73, 69, 64, 61], pad: [54, 61, 64, 69], mel: { 0: 81, 4: 80, 6: 78, 10: 76, 14: 78 }, cel: { 0: 93, 6: 90 } },
    { bass: 38, arp: [50, 57, 61, 66, 69, 66, 62, 57], pad: [50, 57, 61, 66], mel: { 0: 76, 4: 78, 6: 81, 10: 80, 14: 76 }, cel: { 6: 93 } },
    { bass: 47, arp: [47, 54, 57, 62, 52, 59, 64, 68], pad: [59, 62, 66, 68], mel: { 0: 74, 4: 73, 8: 71, 12: 76 }, cel: { 8: 83 } },
    { bass: 45, arp: [45, 52, 57, 59, 61, 64, 69, 64], pad: [57, 61, 64, 73], mel: { 0: 73, 8: 69 }, cel: { 0: 85, 8: 93 } }
  ]
}

// ② 医龙 Blue Dragon 风格 (Sawano epic drama): D minor driving strings, timpani/kick & soaring theme, 114 BPM
const SCORE_BLUEDRAGON = {
  bpm: 114,
  ostinato: true,
  bars: [
    // Dm | Bb | C | Am | Gm | Dm/F | Bbmaj7 | A7
    { bass: 38, arp: [50, 50, 57, 50, 53, 50, 57, 50], pad: [50, 57, 62, 65], mel: { 0: 69, 3: 74, 6: 76, 8: 77, 12: 76, 14: 74 }, kick: [0, 6, 8], snare: [4, 12], timp: [0] },
    { bass: 34, arp: [46, 46, 53, 46, 50, 46, 53, 46], pad: [46, 53, 58, 62], mel: { 0: 74, 4: 72, 6: 70, 8: 69, 12: 72 }, kick: [0, 6, 8], snare: [4, 12], timp: [] },
    { bass: 36, arp: [48, 48, 55, 48, 52, 48, 55, 48], pad: [48, 55, 60, 64], mel: { 0: 72, 3: 76, 6: 79, 8: 77, 12: 76, 14: 72 }, kick: [0, 6, 8, 10], snare: [4, 12], timp: [0] },
    { bass: 45, arp: [45, 45, 52, 45, 48, 45, 52, 45], pad: [45, 52, 57, 64], mel: { 0: 76, 6: 74, 8: 72, 12: 69 }, kick: [0, 6, 8], snare: [4, 12, 14, 15], timp: [12] },
    { bass: 43, arp: [43, 50, 55, 58, 55, 50, 43, 50], pad: [55, 58, 62, 65], mel: { 0: 79, 4: 77, 6: 79, 8: 81, 12: 82, 14: 81 }, kick: [0, 6, 8], snare: [4, 12], timp: [0] },
    { bass: 41, arp: [41, 50, 53, 57, 53, 50, 41, 50], pad: [53, 57, 62, 69], mel: { 0: 81, 4: 77, 6: 74, 8: 76, 12: 77 }, kick: [0, 6, 8], snare: [4, 12], timp: [] },
    { bass: 34, arp: [46, 53, 58, 62, 58, 53, 46, 53], pad: [46, 53, 58, 69], mel: { 0: 77, 3: 79, 6: 81, 8: 84, 12: 81, 14: 79 }, kick: [0, 6, 8, 10], snare: [4, 12], timp: [0, 8] },
    { bass: 45, arp: [45, 52, 57, 61, 64, 61, 57, 52], pad: [45, 52, 57, 61], mel: { 0: 76, 4: 74, 8: 73, 12: 76 }, kick: [0, 6, 8], snare: [4, 12, 14, 15], timp: [0, 12] }
  ]
}

// ③ My Soul 风格 (July New-Age Piano Hip-Hop): F# minor flowing broken piano + lo-fi rimshot groove, 88 BPM
const SCORE_MYSOUL = {
  bpm: 88,
  bars: [
    // F#m -> D -> A -> E (phrase 1)
    { bass: 42, arp: [54, 61, 66, 69, 66, 61, 54, 61], pad: [54, 61, 64, 69], mel: { 0: 73, 2: 74, 4: 76, 6: 73, 8: 71, 10: 69, 12: 71 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 38, arp: [50, 57, 62, 66, 62, 57, 50, 57], pad: [50, 57, 62, 66], mel: { 0: 69, 2: 71, 4: 73, 6: 78, 8: 76, 10: 73, 12: 71 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 45, arp: [45, 52, 57, 61, 64, 61, 57, 52], pad: [57, 61, 64, 69], mel: { 0: 73, 2: 76, 4: 81, 6: 80, 8: 78, 10: 76, 12: 73 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 40, arp: [52, 59, 64, 68, 64, 59, 52, 59], pad: [52, 56, 59, 64], mel: { 0: 71, 4: 73, 6: 71, 8: 68, 12: 64 }, kick: [0, 6, 8], snare: [4, 12, 15] },
    // F#m -> D -> A -> E (high expressive cascade phrase 2)
    { bass: 42, arp: [54, 61, 66, 69, 73, 69, 66, 61], pad: [54, 61, 64, 69], mel: { 0: 78, 2: 80, 4: 81, 6: 80, 8: 78, 10: 76, 12: 73 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 38, arp: [50, 57, 62, 66, 69, 66, 62, 57], pad: [50, 57, 62, 66], mel: { 0: 74, 2: 73, 4: 71, 6: 69, 8: 71, 10: 73, 12: 74 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 45, arp: [45, 52, 57, 61, 64, 61, 57, 52], pad: [57, 61, 64, 73], mel: { 0: 76, 2: 78, 4: 81, 8: 80, 10: 76, 12: 73 }, kick: [0, 6, 8], snare: [4, 12] },
    { bass: 40, arp: [52, 59, 64, 68, 64, 59, 52, 47], pad: [52, 56, 59, 64], mel: { 0: 71, 4: 76, 8: 74, 10: 73, 12: 71 }, kick: [0, 6, 8], snare: [4, 12, 14] }
  ]
}

const SCORES = {
  kataware: SCORE_KATAWARE,
  bluedragon: SCORE_BLUEDRAGON,
  mysoul: SCORE_MYSOUL
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
    this._bgmMode = 'auto'
    this._sceneContext = 'title'
    this._activeTrack = 'kataware'
    this._stepIndex = 0
    this._nextStepTime = 0
    this._customAudioEl = null
    this._customUrl = ''
    this._customTitle = ''
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
    if (this._customAudioEl) {
      this._customAudioEl.muted = this._muted
      if (!this._muted && this._customAudioEl.paused) {
        this._customAudioEl.play().catch(() => {})
      }
    }
    return this._muted
  }

  /** @param {'auto'|'kataware'|'bluedragon'|'mysoul'|'ambient'} trackId */
  setBgmTrack(trackId) {
    const id = ['auto', 'kataware', 'bluedragon', 'mysoul', 'ambient'].includes(trackId) ? trackId : 'auto'
    this._bgmMode = id
    this.clearCustomAudio()
    this._syncActiveTrack(true)
  }

  /** @param {string} sceneKey */
  setSceneContext(sceneKey) {
    this._sceneContext = String(sceneKey || 'hub')
    if (this._bgmMode === 'auto') this._syncActiveTrack(false)
  }

  getBgmState() {
    return {
      mode: this._bgmMode,
      activeTrack: this._customUrl ? 'custom' : this._activeTrack,
      customTitle: this._customTitle,
      muted: this._muted
    }
  }

  /** Allow player to load a local .mp3/.wav/.ogg file on top of WebAudio SFX. */
  loadCustomAudioFile(file) {
    if (!file || typeof URL === 'undefined' || typeof window === 'undefined' || !window.Audio) return false
    this.clearCustomAudio()
    try {
      const url = URL.createObjectURL(file)
      const audio = new window.Audio(url)
      audio.loop = true
      audio.volume = 0.55
      audio.muted = this._muted
      this._customUrl = url
      this._customTitle = String(file.name || '本地音乐').replace(/\.[^.]+$/, '').slice(0, 24)
      this._customAudioEl = audio
      audio.play().catch(() => {})
      return true
    } catch {
      return false
    }
  }

  clearCustomAudio() {
    if (this._customAudioEl) {
      try { this._customAudioEl.pause() } catch {}
      this._customAudioEl = null
    }
    if (this._customUrl && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(this._customUrl) } catch {}
    }
    this._customUrl = ''
    this._customTitle = ''
  }

  _syncActiveTrack(resetPhrase = false) {
    const next = this._bgmMode === 'auto'
      ? (SCENE_AUTO_TRACK[this._sceneContext] || 'kataware')
      : this._bgmMode
    if (next === this._activeTrack && !resetPhrase) return
    this._activeTrack = next
    this._stepIndex = 0
    if (this.ready) {
      this._nextStepTime = this.ctx.currentTime + 0.08
      this._applyLit()
    }
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

  /**
   * Multi-select scale pitch ascent on chain drag (plays note for k-th window in chain).
   * @param {number} [k=1] - 1-based index of the window in the current drag chain.
   */
  chainNote(k = 1) {
    if (!this.ready || this._muted) return
    const idx = Math.max(1, Math.floor(finite(k, 1)))
    const step = (idx - 1) % SCALE.length
    const octave = Math.min(2, Math.floor((idx - 1) / SCALE.length))
    const freq = SCALE[step] * Math.pow(2, octave)
    const t = this.ctx.currentTime + 0.012
    const pan = clamp(((step % 5) - 2) * 0.16, -0.6, 0.6)
    this._marimba(freq, t, 0.16 + Math.min(0.06, idx * 0.006), pan)
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

  /**
   * C3 Floor Clear ascending major 7th / arpeggio chord:
   * (C4, E4, G4, B4, C5, E5) with marimba, celesta shimmer, and piano bass.
   */
  floorClear() {
    if (!this.ready || this._muted) return
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.02

    // Piano bass root (C3: 130.81 Hz)
    const bass = ctx.createOscillator()
    bass.type = 'triangle'
    bass.frequency.setValueAtTime(130.81, t)
    bass.frequency.exponentialRampToValueAtTime(65.41, t + 1.2)
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(0.0001, t)
    bg.gain.linearRampToValueAtTime(0.24, t + 0.02)
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    bass.connect(bg)
    bg.connect(this.sfx)
    bass.start(t)
    bass.stop(t + 1.9)

    // Arpeggio notes: C4 (261.63), E4 (329.63), G4 (392.00), B4 (493.88), C5 (523.25), E5 (659.25)
    const notes = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25]
    for (let i = 0; i < notes.length; i++) {
      const noteTime = t + i * 0.075
      const pan = -0.3 + (i / (notes.length - 1)) * 0.6
      this._marimba(notes[i], noteTime, 0.18, pan)

      const cel = ctx.createOscillator()
      cel.type = 'sine'
      cel.frequency.setValueAtTime(notes[i] * 2, noteTime)
      const cg = ctx.createGain()
      cg.gain.setValueAtTime(0.0001, noteTime)
      cg.gain.linearRampToValueAtTime(0.06, noteTime + 0.015)
      cg.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.9)
      cel.connect(cg)
      cg.connect(this.sfx)
      cel.start(noteTime)
      cel.stop(noteTime + 1.0)
    }

    this._hold(1800)
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
    this.clearCustomAudio()
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
    this._nextStepTime = now + 0.08
    this._stepIndex = 0
    this._dropletNext = 0
    this._applyWeather()
    this._applyLit()
    this._schedule()
    // @ts-expect-error Node types say setTimeout returns a Timeout, the field is a number
    this._timer = setInterval(() => this._schedule(), 48)
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
    const isAmbient = this._activeTrack === 'ambient' && !this._customUrl
    let pad = 0
    if (isAmbient) {
      if (n > 2) pad = Math.sqrt(Math.min(1, n / 12)) * 0.55
      if (n > 15) pad = 0.55 + Math.sqrt(Math.min(1, (n - 15) / 8)) * 0.3
    }
    const shim = isAmbient && n >= 20 ? 0.1 + Math.sqrt(Math.min(1, (n - 20) / 4)) * 0.2 : 0
    this._padGain.gain.setTargetAtTime(pad, t, 0.9)
    this._shimmerGain.gain.setTargetAtTime(shim, t, 1.2)
  }

  // Step-sequenced BGM + ambient pad + droplet clock.
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

    const score = (!this._customUrl && this._activeTrack !== 'ambient') ? SCORES[this._activeTrack] : null
    if (score && !this._muted) {
      const stepDur = 60 / score.bpm / 4
      if (this._nextStepTime < now - 0.25) this._nextStepTime = now + 0.04
      let stepGuard = 0
      while (this._nextStepTime < now + LOOKAHEAD && stepGuard++ < 12) {
        this._playScoreStep(score, this._stepIndex, this._nextStepTime, stepDur)
        this._nextStepTime += stepDur
        this._stepIndex = (this._stepIndex + 1) % (score.bars.length * 16)
      }
    }

    if (this._weather === 'light_rain' && !this._muted) this._scheduleDroplets(now + 0.7)
  }

  _playScoreStep(score, globalStep, t, stepDur) {
    const barIdx = Math.floor(globalStep / 16) % score.bars.length
    const step = globalStep % 16
    const bar = score.bars[barIdx]
    const intense = this._activeTrack === 'bluedragon'

    // Downbeat warm orchestral string pad & deep bass anchor
    if (step === 0) {
      this._piano(midiHz(bar.bass), t, intense ? 0.16 : 0.13, stepDur * 14, -0.15, true)
      if (bar.pad) {
        for (let i = 0; i < bar.pad.length; i++) {
          this._strings(midiHz(bar.pad[i]), t, intense ? 0.042 : 0.032, stepDur * 16, (i - 1.5) * 0.22)
        }
      }
    }

    // Left-hand flowing piano / driving Sawano string ostinato every 8th note (or 16th ostinato pulse)
    if (bar.arp) {
      if (step % 2 === 0) {
        const note = bar.arp[(step / 2) % bar.arp.length]
        if (score.ostinato) {
          this._strings(midiHz(note), t, 0.048, stepDur * 1.9, (step % 4 === 0 ? -0.25 : 0.25))
          this._piano(midiHz(note), t, 0.072, stepDur * 2.4, -0.18)
        } else {
          this._piano(midiHz(note), t, 0.085, stepDur * 3.8, -0.22)
        }
      } else if (score.ostinato && step % 2 === 1) {
        const note = bar.arp[Math.floor(step / 2) % bar.arp.length]
        this._strings(midiHz(note), t, 0.026, stepDur * 1.1, 0.2)
      }
    }

    // Right-hand expressive singing lead melody
    if (bar.mel && bar.mel[step] !== undefined) {
      const m = bar.mel[step]
      const vel = intense ? 0.145 : 0.135
      this._piano(midiHz(m), t, vel, stepDur * 5.2, 0.12)
      if (intense) this._piano(midiHz(m + 12), t, vel * 0.42, stepDur * 4.0, -0.1)
    }

    // Twilight celesta chime sparkle (Kataware)
    if (bar.cel && bar.cel[step] !== undefined) {
      this._celesta(midiHz(bar.cel[step]), t, 0.055, stepDur * 6.0, 0.28)
    }

    // Rhythmic percussion (My Soul boom-bap / Blue Dragon dramatic pulse)
    if (bar.kick && bar.kick.includes(step)) this._kick(t, intense ? 0.16 : 0.11)
    if (bar.snare && bar.snare.includes(step)) this._snare(t, intense ? 0.095 : 0.055, !intense)
    if (bar.timp && bar.timp.includes(step)) this._timpani(midiHz(bar.bass), t, 0.15)
    if ((bar.kick || bar.snare) && step % 2 === 0) this._hat(t, step % 4 === 2 ? 0.026 : 0.014)
  }

  _piano(freq, t, vel, dur, pan = 0, warmBass = false) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(warmBass ? 1100 : 3800, t)
    filter.frequency.exponentialRampToValueAtTime(warmBass ? 240 : 620, t + Math.min(0.6, dur * 0.7))
    filter.Q.value = 0.8

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(clamp(vel, 0.01, 0.35), t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.18, dur))

    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -0.8, 0.8)

    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.setValueAtTime(freq, t)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.setValueAtTime(freq * 2, t)
    const g2 = ctx.createGain()
    g2.gain.value = warmBass ? 0.25 : 0.34

    o1.connect(filter)
    o2.connect(g2)
    g2.connect(filter)
    filter.connect(env)
    env.connect(p)
    p.connect(this.music)
    o1.start(t)
    o2.start(t)
    const endT = t + Math.max(0.2, dur) + 0.05
    o1.stop(endT)
    o2.stop(endT)
    o1.onended = () => this._releaseVoice()
  }

  _strings(freq, t, vel, dur, pan = 0) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(700, t)
    lp.frequency.linearRampToValueAtTime(1950, t + Math.min(0.6, dur * 0.45))
    lp.frequency.linearRampToValueAtTime(820, t + dur)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(clamp(vel, 0.005, 0.14), t + Math.min(0.35, dur * 0.35))
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.25, dur))

    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -0.8, 0.8)

    const o1 = ctx.createOscillator()
    o1.type = 'sawtooth'
    o1.frequency.setValueAtTime(freq, t)
    o1.detune.value = -7
    const o2 = ctx.createOscillator()
    o2.type = 'sawtooth'
    o2.frequency.setValueAtTime(freq, t)
    o2.detune.value = 7

    o1.connect(lp)
    o2.connect(lp)
    lp.connect(env)
    env.connect(p)
    p.connect(this.music)
    o1.start(t)
    o2.start(t)
    const endT = t + Math.max(0.26, dur) + 0.06
    o1.stop(endT)
    o2.stop(endT)
    o1.onended = () => this._releaseVoice()
  }

  _celesta(freq, t, vel, dur, pan = 0) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq, t)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(clamp(vel, 0.01, 0.15), t + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -0.8, 0.8)
    o.connect(env)
    env.connect(p)
    p.connect(this.music)
    o.start(t)
    o.stop(t + dur + 0.04)
    o.onended = () => this._releaseVoice()
  }

  _kick(t, peak = 0.12) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(125, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    o.connect(g)
    g.connect(this.music)
    o.start(t)
    o.stop(t + 0.26)
    o.onended = () => this._releaseVoice()
  }

  _snare(t, peak = 0.06, rimOnly = false) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('pink', t, 0.16)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = rimOnly ? 1650 : 2200
    bp.Q.value = rimOnly ? 3.2 : 1.1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rimOnly ? 0.07 : 0.14))
    src.connect(bp)
    bp.connect(g)
    g.connect(this.music)
    this._hold(180)
  }

  _hat(t, peak = 0.02) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const src = this._noiseSource('pink', t, 0.05)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6800
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.music)
    this._hold(70)
  }

  _timpani(freq, t, peak = 0.16) {
    if (!this._takeVoice()) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(freq * 1.15, t)
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 340
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.music)
    o.start(t)
    o.stop(t + 0.58)
    o.onended = () => this._releaseVoice()
  }

  _playChord(t, index) {
    const chord = CHORDS[index % CHORDS.length]
    for (let tone = 0; tone < 4; tone++) {
      for (let d = 0; d < 3; d++) {
        this._padOscs[tone * 3 + d].frequency.setTargetAtTime(chord[tone], t, 0.4)
      }
    }
    const base = 520 + this._litCount * 12
    this._padFilter.frequency.setTargetAtTime(base * 1.1, t, 0.2)
    this._padFilter.frequency.setTargetAtTime(base * 0.65, t + 0.9, 0.9)
    this._shimmerOscs[0].frequency.setTargetAtTime(chord[2] * 4, t, 0.5)
    this._shimmerOscs[1].frequency.setTargetAtTime(chord[3] * 4, t, 0.5)
    if (this._muted || (this._activeTrack !== 'ambient' && !this._customUrl)) return
    for (let i = 0; i < 3; i++) {
      this._softTone(chord[(i + 1) % 4] * 2, t + i * 0.9, 0.024, 1.8, 'sine', 0.05)
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
