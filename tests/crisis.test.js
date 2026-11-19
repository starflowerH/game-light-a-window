import { describe, it, expect, beforeEach } from 'vitest'
import { CrisisManager, CRISIS_TYPES, CRISIS_DEFINITIONS } from '../src/crisis.js'

describe('CrisisManager (C2 Campus Night Patrol Crises)', () => {
  let manager

  beforeEach(() => {
    manager = new CrisisManager()
  })

  it('schedules two emergencies within [18, 26]s and [44, 56]s windows', () => {
    manager.reset()
    expect(manager.schedule).toHaveLength(2)

    const [event1, event2] = manager.schedule
    expect(event1.time).toBeGreaterThanOrEqual(18)
    expect(event1.time).toBeLessThanOrEqual(26)
    expect(event1.triggered).toBe(false)

    expect(event2.time).toBeGreaterThanOrEqual(44)
    expect(event2.time).toBeLessThanOrEqual(56)
    expect(event2.triggered).toBe(false)
  })

  it('respects mutual exclusion when special beacon or resonance is active by postponing', () => {
    manager.reset({ w1Time: 20, w2Time: 48, crisisTypes: [CRISIS_TYPES.HOTPOT, CRISIS_TYPES.BLUETOOTH_MIC] })

    // When at 20s with isSpecialActive = true
    const active = manager.tick(20, 20000, true)
    expect(active).toBeNull()
    expect(manager.getActiveCrisis()).toBeNull()

    // Crisis 1 should have been postponed by 4 seconds (from 20s to 24s)
    expect(manager.schedule[0].time).toBe(24)
    expect(manager.schedule[0].triggered).toBe(false)

    // At 24s with isSpecialActive = false, crisis triggers cleanly
    const triggered = manager.tick(24, 24000, false)
    expect(triggered).not.toBeNull()
    expect(triggered.type).toBe(CRISIS_TYPES.HOTPOT)
    expect(manager.getActiveCrisis()).toBe(triggered)
  })

  it('resolves HOTPOT crisis with 3 required taps and awards +22 warmth', () => {
    manager.reset({ w1Time: 20, w2Time: 50, crisisTypes: [CRISIS_TYPES.HOTPOT, CRISIS_TYPES.CAT_CHASE] })
    manager.tick(20, 20000, false)

    const crisis = manager.getActiveCrisis()
    expect(crisis.type).toBe(CRISIS_TYPES.HOTPOT)
    expect(crisis.bonusWarmth).toBe(22)
    expect(crisis.requiredTaps).toBe(3)

    // Tapping incorrect room does nothing
    expect(manager.onTap(999)).toBeNull()

    // Tap 1
    const tap1 = manager.onTap(crisis.roomId)
    expect(tap1.resolved).toBe(false)
    expect(tap1.currentTaps).toBe(1)
    expect(manager.getActiveCrisis()).not.toBeNull()

    // Tap 2
    const tap2 = manager.onTap(crisis.roomId)
    expect(tap2.resolved).toBe(false)
    expect(tap2.currentTaps).toBe(2)

    // Tap 3: Resolved!
    const tap3 = manager.onTap(crisis.roomId)
    expect(tap3.resolved).toBe(true)
    expect(tap3.bonusWarmth).toBe(22)
    expect(tap3.sfx).toBe('correct')
    expect(manager.getActiveCrisis()).toBeNull()
    expect(manager.lastResolution.success).toBe(true)
  })

  it('resolves CAT_CHASE crisis with hopping cat across windows and +25 warmth', () => {
    manager.reset({
      w1Time: 20,
      w2Time: 50,
      crisisTypes: [CRISIS_TYPES.CAT_CHASE, CRISIS_TYPES.BLUETOOTH_MIC],
      availableRooms: [203, 304, 204]
    })
    manager.tick(20, 10000, false)

    const crisis = manager.getActiveCrisis()
    expect(crisis.type).toBe(CRISIS_TYPES.CAT_CHASE)
    expect(crisis.bonusWarmth).toBe(25)
    expect(crisis.candidateRooms).toEqual([203, 304, 204])

    // At t = 10000ms: cat is at candidateRooms[0] = 203
    expect(crisis.currentRoomId).toBe(203)

    // Tapping wrong candidate window (e.g. 204) fails
    expect(manager.onTap(204)).toBeNull()

    // Fast-forward 1.6s -> cat hops to candidateRooms[1] = 304
    manager.tick(21.6, 11600, false)
    expect(manager.getActiveCrisis().currentRoomId).toBe(304)

    // Tapping 304 catches the cat!
    const res = manager.onTap(304)
    expect(res.resolved).toBe(true)
    expect(res.bonusWarmth).toBe(25)
    expect(manager.getActiveCrisis()).toBeNull()
  })

  it('resolves BLUETOOTH_MIC crisis with 1 tap and awards +20 warmth', () => {
    manager.reset({
      w1Time: 20,
      w2Time: 50,
      crisisTypes: [CRISIS_TYPES.BLUETOOTH_MIC, CRISIS_TYPES.HOTPOT],
      availableRooms: [205, 301]
    })
    manager.tick(20, 20000, false)

    const crisis = manager.getActiveCrisis()
    expect(crisis.type).toBe(CRISIS_TYPES.BLUETOOTH_MIC)
    expect(crisis.bonusWarmth).toBe(20)

    const res = manager.onTap(crisis.roomId)
    expect(res.resolved).toBe(true)
    expect(res.bonusWarmth).toBe(20)
    expect(manager.getActiveCrisis()).toBeNull()
  })

  it('handles timeout expiration peacefully with zero warmth deduction', () => {
    manager.reset({
      w1Time: 20,
      w2Time: 50,
      crisisTypes: [CRISIS_TYPES.BLUETOOTH_MIC, CRISIS_TYPES.HOTPOT]
    })
    manager.tick(20, 10000, false)
    expect(manager.getActiveCrisis()).not.toBeNull()

    // Duration of BLUETOOTH_MIC is 6 seconds. Fast forward 7 seconds.
    const expiredResult = manager.tick(27, 17000, false)
    expect(expiredResult).not.toBeNull()
    expect(expiredResult.expired).toBe(true)
    expect(manager.getActiveCrisis()).toBeNull()
    expect(manager.lastResolution).toEqual({
      success: false,
      type: CRISIS_TYPES.BLUETOOTH_MIC,
      bonusWarmth: 0
    })
  })

  it('provides complete crisis definitions with valid properties', () => {
    for (const [key, def] of Object.entries(CRISIS_DEFINITIONS)) {
      expect(def.type).toBe(key)
      expect(typeof def.title).toBe('string')
      expect(typeof def.prompt).toBe('string')
      expect(def.bonusWarmth).toBeGreaterThanOrEqual(20)
      expect(def.durationSec).toBeGreaterThan(0)
    }
  })
})
