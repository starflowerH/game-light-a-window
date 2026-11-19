// End-Screen 6-Second Accelerated Night Patrol Replay (C5)
// Records discrete night gameplay events and plays them back at ~12.5x speed.
// Isolated visual state that does not mutate game scoring or night records.

export const REPLAY_EVENT_TYPES = {
  LIT: 'lit',
  CHAIN: 'chain',
  RESONANCE: 'resonance',
  CRISIS: 'crisis'
}

/**
 * Ring buffer recorder capped at maxEvents (default 400 entries, < 20KB memory).
 */
export class ReplayRecorder {
  /**
   * @param {number} [maxEvents=400]
   */
  constructor(maxEvents = 400) {
    this.maxEvents = Math.max(1, Number(maxEvents) || 400)
    /** @type {Array<{ t: number, type: string, idx: number, x?: number, y?: number, roomId?: number }>} */
    this.events = []
  }

  /**
   * Reset recorder for a new night.
   */
  reset() {
    this.events = []
  }

  /**
   * Record a gameplay event with relative night timestamp.
   * @param {number} t relative milliseconds from night start
   * @param {string} type event type ('lit'|'chain'|'resonance'|'crisis')
   * @param {number} idx window index or primary target
   * @param {number} [x=0] screen x coordinate
   * @param {number} [y=0] screen y coordinate
   * @param {number} [roomId] optional room identifier
   */
  record(t, type, idx, x = 0, y = 0, roomId = 0) {
    /** @type {{ t: number, type: string, idx: number, x?: number, y?: number, roomId?: number }} */
    const entry = {
      t: Math.max(0, Math.round(Number(t) || 0)),
      type: String(type || REPLAY_EVENT_TYPES.LIT),
      idx: Math.max(0, Math.floor(Number(idx) || 0))
    }
    if (x) entry.x = Math.round(Number(x))
    if (y) entry.y = Math.round(Number(y))
    if (roomId) entry.roomId = Number(roomId)

    this.events.push(entry)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }

  /**
   * Return copy of recorded events.
   * @returns {Array<{ t: number, type: string, idx: number, x?: number, y?: number, roomId?: number }>}
   */
  getEvents() {
    return this.events.slice()
  }

  /**
   * Number of recorded events.
   * @returns {number}
   */
  count() {
    return this.events.length
  }
}

/**
 * 6-second accelerated replay player (~12.5x speed).
 */
export class ReplayPlayer {
  /**
   * @param {Array<{ t: number, type: string, idx: number, x?: number, y?: number, roomId?: number }>} [events]
   * @param {number} [originalDurationMs=75000]
   * @param {number} [targetDurationMs=6000]
   */
  constructor(events = [], originalDurationMs = 75000, targetDurationMs = 6000) {
    this.events = Array.isArray(events)
      ? events.slice().sort((a, b) => a.t - b.t)
      : []
    this.originalDurationMs = Math.max(1000, Number(originalDurationMs) || 75000)
    this.targetDurationMs = Math.max(500, Number(targetDurationMs) || 6000)
    this.speedFactor = this.originalDurationMs / this.targetDurationMs

    this._playing = false
    this._cursor = 0
    this._startTime = 0
    this._rafId = null
    this._timerId = null
    this._onStep = null
    this._onComplete = null
  }

  /**
   * Start accelerated playback.
   * @param {(event: { t: number, type: string, idx: number, x?: number, y?: number }, progress: number) => void} [onStep]
   * @param {() => void} [onComplete]
   */
  start(onStep, onComplete) {
    this.stop()
    this._onStep = onStep || null
    this._onComplete = onComplete || null
    this._playing = true
    this._cursor = 0
    this._startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (this.events.length === 0) {
      this._playing = false
      if (this._onComplete) this._onComplete()
      return
    }

    const step = () => {
      if (!this._playing) return

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsedMs = Math.max(0, now - this._startTime)
      const virtualTimeMs = elapsedMs * this.speedFactor
      const progress = Math.min(1.0, elapsedMs / this.targetDurationMs)

      // Emit all events whose timestamp has arrived
      while (this._cursor < this.events.length && this.events[this._cursor].t <= virtualTimeMs) {
        const evt = this.events[this._cursor]
        this._cursor++
        if (typeof this._onStep === 'function') {
          try {
            this._onStep(evt, progress)
          } catch {
            // Protect playback loop against throwing listener
          }
        }
      }

      // Check completion
      if (elapsedMs >= this.targetDurationMs || this._cursor >= this.events.length) {
        // Dispatch any trailing events
        while (this._cursor < this.events.length) {
          const evt = this.events[this._cursor]
          this._cursor++
          if (typeof this._onStep === 'function') {
            try {
              this._onStep(evt, 1.0)
            } catch {
              // Ignore
            }
          }
        }
        this._playing = false
        const done = this._onComplete
        this._onComplete = null
        if (typeof done === 'function') {
          done()
        }
        return
      }

      // Schedule next frame
      if (typeof requestAnimationFrame === 'function') {
        this._rafId = requestAnimationFrame(step)
      } else {
        this._timerId = setTimeout(step, 16)
      }
    }

    // Launch first tick
    if (typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(step)
    } else {
      this._timerId = setTimeout(step, 0)
    }
  }

  /**
   * Stop active playback and cancel timers.
   */
  stop() {
    this._playing = false
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    if (this._timerId !== null) {
      clearTimeout(this._timerId)
      this._timerId = null
    }
  }

  /**
   * Check whether replay is currently running.
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing
  }

  /**
   * Return playback progress in [0, 1].
   * @returns {number}
   */
  getProgress() {
    if (!this._playing) return this._cursor >= this.events.length ? 1.0 : 0.0
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - this._startTime
    return Math.min(1.0, Math.max(0, elapsed / this.targetDurationMs))
  }
}
