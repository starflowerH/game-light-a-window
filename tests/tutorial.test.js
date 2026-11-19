import { describe, it, expect, vi } from 'vitest'
import { TutorialStateMachine, TUTORIAL_STORAGE_KEY, TUTORIAL_STATES } from '../src/tutorial.js'

/**
 * Mock localStorage factory for testing storage interactions and error conditions.
 * @param {Record<string, string>} [seed]
 * @param {Object} [faults]
 */
function createMockStorage(seed = {}, faults = {}) {
  const store = new Map(Object.entries(seed))
  return {
    get length() {
      return store.size
    },
    key: vi.fn(i => Array.from(store.keys())[i] || null),
    getItem: vi.fn(key => {
      if (faults.throwOnGet) {
        throw new Error('SecurityError: The operation is insecure.')
      }
      return store.has(key) ? store.get(key) : null
    }),
    setItem: vi.fn((key, value) => {
      if (faults.throwOnSet) {
        throw new Error('QuotaExceededError: Storage quota exceeded.')
      }
      store.set(key, String(value))
    }),
    removeItem: vi.fn(key => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
    _store: store
  }
}

describe('TutorialStateMachine', () => {
  describe('Initial State and Storage Discovery', () => {
    it('initializes to idle when storage is empty', () => {
      const storage = createMockStorage()
      const sm = new TutorialStateMachine({ storage })
      expect(sm.getState()).toBe(TUTORIAL_STATES.IDLE)
      expect(sm.isCompleted()).toBe(false)
      expect(sm.isActive()).toBe(false)
    })

    it('detects existing completion from storage', () => {
      const storage = createMockStorage({ [TUTORIAL_STORAGE_KEY]: '1' })
      const sm = new TutorialStateMachine({ storage })
      expect(sm.isCompleted()).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.IDLE)
    })

    it('operates in-memory when storage is null', () => {
      const sm = new TutorialStateMachine({ storage: null })
      expect(sm.isCompleted()).toBe(false)
      sm.skip()
      expect(sm.isCompleted()).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.DONE)
    })

    it('falls back safely to memory when storage throws SecurityError on read', () => {
      const storage = createMockStorage({}, { throwOnGet: true })
      const sm = new TutorialStateMachine({ storage })
      expect(sm.isCompleted()).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.IDLE)
    })

    it('falls back safely to memory when storage throws on write', () => {
      const storage = createMockStorage({}, { throwOnSet: true })
      const sm = new TutorialStateMachine({ storage })
      sm.start()
      sm.skip()
      expect(sm.getState()).toBe(TUTORIAL_STATES.DONE)
      expect(sm.isCompleted()).toBe(true)
    })
  })

  describe('Step Transitions & Core Loop', () => {
    it('transitions idle -> step1_tap upon start()', () => {
      const stateChanges = []
      const sm = new TutorialStateMachine({
        storage: createMockStorage(),
        onStateChange: (next, prev) => stateChanges.push({ prev, next })
      })

      const started = sm.start()
      expect(started).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)
      expect(sm.isActive()).toBe(true)
      expect(stateChanges).toEqual([
        { prev: TUTORIAL_STATES.IDLE, next: TUTORIAL_STATES.STEP1_TAP }
      ])
    })

    it('refuses start() and sets done if already completed unless forced', () => {
      const storage = createMockStorage({ [TUTORIAL_STORAGE_KEY]: '1' })
      const sm = new TutorialStateMachine({ storage })

      const started = sm.start()
      expect(started).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.DONE)

      // Forced start restarts from step1_tap
      const forced = sm.start(true)
      expect(forced).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)
    })

    it('advances step1_tap -> step2_drag on onTap', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)

      const result = sm.onTap({ roomId: 101 })
      expect(result).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)
    })

    it('ignores onTap when in step2_drag or step3_bridge without advancing step', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()
      sm.onTap() // into step2
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)

      const result = sm.onTap()
      expect(result).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)
    })

    it('advances step2_drag -> step3_bridge only when drag chain length >= 3', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()
      sm.onTap() // into step2

      // Chain length 1 or 2 is insufficient
      expect(sm.onDrag(1)).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)
      expect(sm.onDrag(2)).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)

      // Chain length 3 advances
      expect(sm.onDrag(3)).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP3_BRIDGE)
    })

    it('accepts chain length > 3 in step2_drag', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()
      sm.onTap()
      expect(sm.onDrag(4)).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP3_BRIDGE)
    })

    it('advances step3_bridge -> done on onResonance', () => {
      const storage = createMockStorage()
      const sm = new TutorialStateMachine({ storage })
      sm.start()
      sm.onTap()
      sm.onDrag(3)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP3_BRIDGE)

      const result = sm.onResonance()
      expect(result).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.DONE)
      expect(sm.isCompleted()).toBe(true)
      expect(storage.setItem).toHaveBeenCalledWith(TUTORIAL_STORAGE_KEY, '1')
    })

    it('ignores onResonance when not in step3_bridge', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()
      expect(sm.onResonance()).toBe(false)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)
    })
  })

  describe('Skip and Replay', () => {
    it('skip() transitions immediately to done and writes storage', () => {
      const storage = createMockStorage()
      const sm = new TutorialStateMachine({ storage })
      sm.start()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)

      sm.skip()
      expect(sm.getState()).toBe(TUTORIAL_STATES.DONE)
      expect(sm.isCompleted()).toBe(true)
      expect(storage.setItem).toHaveBeenCalledWith(TUTORIAL_STORAGE_KEY, '1')
    })

    it('replay() transitions back to step1_tap even after done', () => {
      const storage = createMockStorage({ [TUTORIAL_STORAGE_KEY]: '1' })
      const sm = new TutorialStateMachine({ storage })
      sm.replay()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)
      expect(sm.isActive()).toBe(true)
    })

    it('reset() resets completion in storage and sets state to idle', () => {
      const storage = createMockStorage({ [TUTORIAL_STORAGE_KEY]: '1' })
      const sm = new TutorialStateMachine({ storage })
      sm.reset()
      expect(sm.getState()).toBe(TUTORIAL_STATES.IDLE)
      expect(sm.isCompleted()).toBe(false)
      expect(storage.removeItem).toHaveBeenCalledWith(TUTORIAL_STORAGE_KEY)
    })
  })

  describe('Inactivity Hint & Inactivity Reset', () => {
    it('triggers timeoutHint after inactivity limit (12s) in active steps', () => {
      const sm = new TutorialStateMachine({
        storage: createMockStorage(),
        inactivityLimitMs: 12000
      })
      sm.start()

      // Ticking 5s -> no hint
      const tick1 = sm.tick(5000)
      expect(tick1.timeoutHint).toBe(false)

      // Ticking another 7s -> hits 12000ms threshold -> hint
      const tick2 = sm.tick(7000)
      expect(tick2.timeoutHint).toBe(true)
      expect(tick2.state).toBe(TUTORIAL_STATES.STEP1_TAP)

      // Subsequent tick without interaction does NOT repeat hint
      const tick3 = sm.tick(2000)
      expect(tick3.timeoutHint).toBe(false)
    })

    it('resets inactivity timer upon user interaction so hint can re-trigger', () => {
      const sm = new TutorialStateMachine({
        storage: createMockStorage(),
        inactivityLimitMs: 12000
      })
      sm.start()
      sm.tick(12000) // triggers first hint

      // User interacts in step 1 -> advances to step 2
      sm.onTap()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)

      // Next tick right after interaction should not hint
      expect(sm.tick(1000).timeoutHint).toBe(false)

      // After another 12s in step 2, hint triggers again
      expect(sm.tick(11000).timeoutHint).toBe(true)
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)
    })

    it('resets inactivity timer on partial drag attempt', () => {
      const sm = new TutorialStateMachine({
        storage: createMockStorage(),
        inactivityLimitMs: 12000
      })
      sm.start()
      sm.onTap() // into step2

      sm.tick(10000)
      // Player drags 1 window (insufficient to advance, but is active user input)
      sm.onDrag(1)

      // Ticking 4000ms should NOT trigger timeout yet because onDrag reset the timer
      expect(sm.tick(4000).timeoutHint).toBe(false)
      // Ticking another 8000ms (total 12000 since drag) triggers hint
      expect(sm.tick(8000).timeoutHint).toBe(true)
    })

    it('does not emit inactivity hints when idle or done', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      expect(sm.tick(15000).timeoutHint).toBe(false)

      sm.start()
      sm.skip() // now done
      expect(sm.tick(15000).timeoutHint).toBe(false)
    })
  })

  describe('Robustness and Fault Tolerance', () => {
    it('survives throwing onStateChange callbacks gracefully', () => {
      const sm = new TutorialStateMachine({
        storage: createMockStorage(),
        onStateChange: () => {
          throw new Error('Callback boom!')
        }
      })
      expect(() => sm.start()).not.toThrow()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP1_TAP)
      expect(() => sm.onTap()).not.toThrow()
      expect(sm.getState()).toBe(TUTORIAL_STATES.STEP2_DRAG)
    })

    it('handles unexpected argument types without crashing', () => {
      const sm = new TutorialStateMachine({ storage: createMockStorage() })
      sm.start()

      // @ts-ignore - intentional bad arguments
      expect(() => sm.onTap(undefined)).not.toThrow()
      // @ts-ignore
      expect(() => sm.onDrag(null)).not.toThrow()
      // @ts-ignore
      expect(() => sm.tick(-500)).not.toThrow()
      // @ts-ignore
      expect(() => sm.tick('invalid')).not.toThrow()
    })
  })
})
