// Pure logic deterministic state machine for the 30-second 3-step interactive micro-tutorial.
// Governs onboarding progression across Story Night, Arcade, and Minigames.
//
// States:
//   idle         - Initial state before tutorial is triggered.
//   step1_tap    - First step: tap a single glimmer window.
//   step2_drag   - Second step: drag across >= 3 adjacent glimmer windows.
//   step3_bridge - Third step: connect a star bridge resonance pair.
//   done         - Completed or skipped.

export const TUTORIAL_STORAGE_KEY = 'lal_tut_v5'

export const TUTORIAL_STATES = /** @type {const} */ ({
  IDLE: 'idle',
  STEP1_TAP: 'step1_tap',
  STEP2_DRAG: 'step2_drag',
  STEP3_BRIDGE: 'step3_bridge',
  DONE: 'done'
})

/**
 * @typedef {'idle' | 'step1_tap' | 'step2_drag' | 'step3_bridge' | 'done'} TutorialState
 */

export class TutorialStateMachine {
  /**
   * @param {Object} [options]
   * @param {{ getItem(k: string): any, setItem(k: string, v: any): void, removeItem?: (k: string) => void } | null} [options.storage] - Custom storage interface (falls back to window.localStorage if available)
   * @param {(newState: TutorialState, prevState: TutorialState) => void} [options.onStateChange]
   * @param {number} [options.inactivityLimitMs] - Duration in ms before triggering an inactivity hint (default: 12000)
   */
  constructor({ storage = null, onStateChange = null, inactivityLimitMs = 12000 } = {}) {
    this._storage = storage !== null ? storage : (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
    this._onStateChange = onStateChange
    this._inactivityLimitMs = Math.max(1000, Number(inactivityLimitMs) || 12000)

    /** @type {TutorialState} */
    this._state = TUTORIAL_STATES.IDLE
    this._memoryCompleted = false
    this._inactivityMs = 0
    this._hintEmitted = false
    this._lastTickTime = 0

    this._readStorage()
  }

  /** Safely check if storage or memory indicates completion. */
  _readStorage() {
    if (!this._storage) return
    try {
      const val = this._storage.getItem(TUTORIAL_STORAGE_KEY)
      if (val === '1' || val === 'true') {
        this._memoryCompleted = true
      }
    } catch {
      // SecurityError or QuotaExceededError in restricted iframe / private browsing
    }
  }

  /** Safely record completion in storage and memory. */
  _writeStorage(completed) {
    this._memoryCompleted = Boolean(completed)
    if (!this._storage) return
    try {
      if (completed) {
        this._storage.setItem(TUTORIAL_STORAGE_KEY, '1')
      } else {
        this._storage.removeItem(TUTORIAL_STORAGE_KEY)
      }
    } catch {
      // Graceful fallback to memory
    }
  }

  /** @returns {TutorialState} */
  getState() {
    return this._state
  }

  /** @returns {boolean} */
  isCompleted() {
    if (this._memoryCompleted) return true
    this._readStorage()
    return this._memoryCompleted
  }

  /** @returns {boolean} Whether an active step is currently underway (step1, step2, step3). */
  isActive() {
    return (
      this._state === TUTORIAL_STATES.STEP1_TAP ||
      this._state === TUTORIAL_STATES.STEP2_DRAG ||
      this._state === TUTORIAL_STATES.STEP3_BRIDGE
    )
  }

  /**
   * Internal transition handler.
   * @param {TutorialState} nextState
   */
  _transitionTo(nextState) {
    if (this._state === nextState) return
    const prev = this._state
    this._state = nextState
    this._inactivityMs = 0
    this._hintEmitted = false

    if (nextState === TUTORIAL_STATES.DONE) {
      this._writeStorage(true)
    }

    if (typeof this._onStateChange === 'function') {
      try {
        this._onStateChange(nextState, prev)
      } catch {
        // Callback errors should not crash the state machine
      }
    }
  }

  /**
   * Start tutorial if not completed yet.
   * @param {boolean} [force=false] - Force start even if marked completed
   * @returns {boolean} Whether tutorial transitioned to step1_tap
   */
  start(force = false) {
    if (!force && this.isCompleted()) {
      this._state = TUTORIAL_STATES.DONE
      return false
    }
    this._transitionTo(TUTORIAL_STATES.STEP1_TAP)
    return true
  }

  /**
   * Skip tutorial immediately, marking it complete.
   */
  skip() {
    this._transitionTo(TUTORIAL_STATES.DONE)
  }

  /**
   * Replay tutorial from step1 regardless of previous completion.
   */
  replay() {
    this._transitionTo(TUTORIAL_STATES.STEP1_TAP)
  }

  /**
   * Reset tutorial completion status and state to idle.
   */
  reset() {
    this._writeStorage(false)
    this._state = TUTORIAL_STATES.IDLE
    this._inactivityMs = 0
    this._hintEmitted = false
  }

  /** Reset inactivity timer on any user interaction. */
  resetInactivity() {
    this._inactivityMs = 0
    this._hintEmitted = false
  }

  /**
   * Called when player taps a window.
   * In step1_tap, transitions to step2_drag.
   * @param {any} [windowRecord]
   * @returns {boolean} Whether this tap satisfied the active step condition
   */
  onTap(windowRecord) {
    this.resetInactivity()
    if (this._state === TUTORIAL_STATES.STEP1_TAP) {
      this._transitionTo(TUTORIAL_STATES.STEP2_DRAG)
      return true
    }
    return false
  }

  /**
   * Called during dragging when chain length increments.
   * In step2_drag, if chainLength >= 3, transitions to step3_bridge.
   * @param {number} chainLength
   * @returns {boolean} Whether this drag satisfied the active step condition
   */
  onDrag(chainLength) {
    this.resetInactivity()
    const count = Number(chainLength) || 0
    if (this._state === TUTORIAL_STATES.STEP2_DRAG && count >= 3) {
      this._transitionTo(TUTORIAL_STATES.STEP3_BRIDGE)
      return true
    }
    return false
  }

  /**
   * Called when player completes a star bridge resonance.
   * In step3_bridge, transitions to done.
   * @returns {boolean} Whether this resonance satisfied the active step condition
   */
  onResonance() {
    this.resetInactivity()
    if (this._state === TUTORIAL_STATES.STEP3_BRIDGE) {
      this._transitionTo(TUTORIAL_STATES.DONE)
      return true
    }
    return false
  }

  /**
   * Tick update for inactivity tracking.
   * @param {number} [dtMs] - Elapsed milliseconds since last tick (or 0)
   * @returns {{ timeoutHint: boolean, state: TutorialState }}
   */
  tick(dtMs = 0) {
    let delta = Number(dtMs) || 0
    if (delta <= 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (this._lastTickTime > 0) {
        delta = Math.max(0, now - this._lastTickTime)
      }
      this._lastTickTime = now
    }

    if (!this.isActive()) {
      return { timeoutHint: false, state: this._state }
    }

    this._inactivityMs += delta
    if (this._inactivityMs >= this._inactivityLimitMs && !this._hintEmitted) {
      this._hintEmitted = true
      return { timeoutHint: true, state: this._state }
    }

    return { timeoutHint: false, state: this._state }
  }
}
