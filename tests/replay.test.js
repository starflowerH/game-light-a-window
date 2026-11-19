import { describe, it, expect, beforeEach } from 'vitest'
import { ReplayRecorder, ReplayPlayer, REPLAY_EVENT_TYPES } from '../src/replay.js'

describe('ReplayRecorder (C5 Night Patrol Replay)', () => {
  let recorder

  beforeEach(() => {
    recorder = new ReplayRecorder(400)
  })

  it('records events with proper structure and properties', () => {
    recorder.record(1200, REPLAY_EVENT_TYPES.LIT, 3, 100, 200, 104)
    recorder.record(2500, REPLAY_EVENT_TYPES.CHAIN, 7, 150, 220)

    const events = recorder.getEvents()
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      t: 1200,
      type: 'lit',
      idx: 3,
      x: 100,
      y: 200,
      roomId: 104
    })
    expect(events[1]).toEqual({
      t: 2500,
      type: 'chain',
      idx: 7,
      x: 150,
      y: 220
    })
  })

  it('enforces ring buffer capacity cap and drops oldest beyond maxEvents', () => {
    const smallRecorder = new ReplayRecorder(5)
    for (let i = 0; i < 8; i++) {
      smallRecorder.record(i * 1000, REPLAY_EVENT_TYPES.LIT, i)
    }

    expect(smallRecorder.count()).toBe(5)
    const events = smallRecorder.getEvents()
    expect(events).toHaveLength(5)
    // Oldest 3 (i=0, 1, 2) were dropped; remaining are i=3..7
    expect(events[0].idx).toBe(3)
    expect(events[4].idx).toBe(7)
  })

  it('resets events cleanly on reset()', () => {
    recorder.record(100, 'lit', 1)
    recorder.record(200, 'lit', 2)
    expect(recorder.count()).toBe(2)

    recorder.reset()
    expect(recorder.count()).toBe(0)
    expect(recorder.getEvents()).toHaveLength(0)
  })

  it('verifies memory bound for 400 events is well under 20KB', () => {
    for (let i = 0; i < 400; i++) {
      recorder.record(i * 150, REPLAY_EVENT_TYPES.LIT, i % 24, 200, 300)
    }
    const events = recorder.getEvents()
    expect(events).toHaveLength(400)

    const jsonSize = JSON.stringify(events).length
    expect(jsonSize).toBeLessThan(20 * 1024) // < 20KB
  })
})

describe('ReplayPlayer (C5 Night Patrol Replay)', () => {
  it('initializes with calculated speedFactor ~12.5x (75s -> 6s)', () => {
    const player = new ReplayPlayer([], 75000, 6000)
    expect(player.speedFactor).toBeCloseTo(12.5, 2)
    expect(player.isPlaying()).toBe(false)
  })

  it('handles empty event list by calling onComplete immediately without playing', () => {
    let completed = false
    const player = new ReplayPlayer([], 75000, 6000)
    player.start(
      () => {},
      () => { completed = true }
    )
    expect(player.isPlaying()).toBe(false)
    expect(completed).toBe(true)
  })

  it('plays back events chronologically and calls onStep and onComplete', async () => {
    const events = [
      { t: 0, type: 'lit', idx: 0, x: 10, y: 10 },
      { t: 100, type: 'lit', idx: 1, x: 20, y: 20 },
      { t: 200, type: 'chain', idx: 2, x: 30, y: 30 }
    ]

    // Use a fast target duration of 50ms for tests
    const player = new ReplayPlayer(events, 200, 50)
    const stepped = []

    await new Promise(resolve => {
      player.start(
        evt => stepped.push(evt.idx),
        () => resolve(true)
      )
    })

    expect(stepped).toEqual([0, 1, 2])
    expect(player.isPlaying()).toBe(false)
  })

  it('stops playback immediately on stop()', async () => {
    const events = [
      { t: 0, type: 'lit', idx: 0, x: 0, y: 0 },
      { t: 1000, type: 'lit', idx: 1, x: 0, y: 0 },
      { t: 2000, type: 'lit', idx: 2, x: 0, y: 0 }
    ]
    const player = new ReplayPlayer(events, 2000, 1000)
    let completed = false

    player.start(
      () => {},
      () => { completed = true }
    )
    expect(player.isPlaying()).toBe(true)

    player.stop()
    expect(player.isPlaying()).toBe(false)

    // Wait a brief tick to verify onComplete was not fired after stop
    await new Promise(r => setTimeout(r, 60))
    expect(completed).toBe(false)
  })

  it('survives throwing listener in onStep without crashing playback loop', async () => {
    const events = [
      { t: 0, type: 'lit', idx: 0, x: 0, y: 0 },
      { t: 10, type: 'lit', idx: 1, x: 0, y: 0 }
    ]
    const player = new ReplayPlayer(events, 20, 20)
    let finished = false

    await new Promise(resolve => {
      player.start(
        () => {
          throw new Error('Listener failed')
        },
        () => {
          finished = true
          resolve(true)
        }
      )
    })

    expect(finished).toBe(true)
  })
})
