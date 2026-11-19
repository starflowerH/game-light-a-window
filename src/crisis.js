// Campus Night Patrol Random Crisis Manager (C2)
// Schedules 2 campus emergency crises per 75s night ([18, 26]s and [44, 56]s).
// Mutually exclusive with story beacons and resonance pairs.
// Success awards warmth bonus; timeout expires peacefully without penalty.

export const CRISIS_TYPES = {
  HOTPOT: 'hotpot',
  CAT_CHASE: 'cat_chase',
  BLUETOOTH_MIC: 'bluetooth_mic'
}

export const CRISIS_DEFINITIONS = {
  [CRISIS_TYPES.HOTPOT]: {
    type: CRISIS_TYPES.HOTPOT,
    title: '302 宿舍螺蛳粉火锅将跳闸',
    prompt: '热气腾腾！8秒内连续轻点 3 次排障冷却',
    requiredTaps: 3,
    durationSec: 8,
    bonusWarmth: 22,
    sfx: 'correct',
    defaultRoom: 302,
    tag: '⚡ 排障'
  },
  [CRISIS_TYPES.CAT_CHASE]: {
    type: CRISIS_TYPES.CAT_CHASE,
    title: '招财猫窜窗',
    prompt: '调皮橘猫正在窗间跳跃！看准它落脚的窗户轻点抓住',
    requiredTaps: 1,
    durationSec: 9,
    hopIntervalSec: 1.5,
    bonusWarmth: 25,
    sfx: 'correct',
    defaultCandidates: [203, 304, 204],
    tag: '📱 抓猫'
  },
  [CRISIS_TYPES.BLUETOOTH_MIC]: {
    type: CRISIS_TYPES.BLUETOOTH_MIC,
    title: '205 蓝牙麦没关',
    prompt: '走调高歌回荡！6秒内轻点拔掉麦克风蓝牙',
    requiredTaps: 1,
    durationSec: 6,
    bonusWarmth: 20,
    sfx: 'correct',
    defaultRoom: 205,
    tag: '🎤 拔麦'
  }
}

export class CrisisManager {
  /**
   * @param {object} [options]
   * @param {number[]} [options.window1Range=[18, 26]]
   * @param {number[]} [options.window2Range=[44, 56]]
   * @param {number} [options.postponeSec=4]
   */
  constructor(options = {}) {
    this.window1Range = options.window1Range || [18, 26]
    this.window2Range = options.window2Range || [44, 56]
    this.postponeSec = options.postponeSec ?? 4

    /** @type {Array<{ time: number, type: string, triggered: boolean }>} */
    this.schedule = []
    /** @type {any|null} */
    this.activeCrisis = null
    this.lastResolution = null
    this.availableRooms = []

    this.reset()
  }

  /**
   * Reset crisis scheduler for a fresh night.
   * @param {object} [opts]
   * @param {number[]} [opts.availableRooms]
   * @param {number} [opts.w1Time] override for deterministic tests
   * @param {number} [opts.w2Time] override for deterministic tests
   * @param {string[]} [opts.crisisTypes] override for deterministic tests
   */
  reset(opts = {}) {
    this.availableRooms = Array.isArray(opts.availableRooms) && opts.availableRooms.length
      ? opts.availableRooms.slice()
      : [101, 102, 103, 104, 201, 202, 203, 204, 205, 301, 302, 303, 304, 401, 402, 403, 406]

    const w1 = opts.w1Time ?? (this.window1Range[0] + Math.random() * (this.window1Range[1] - this.window1Range[0]))
    const w2 = opts.w2Time ?? (this.window2Range[0] + Math.random() * (this.window2Range[1] - this.window2Range[0]))

    const typesPool = [CRISIS_TYPES.HOTPOT, CRISIS_TYPES.CAT_CHASE, CRISIS_TYPES.BLUETOOTH_MIC]
    // Randomize or pick 2 distinct
    const shuffled = opts.crisisTypes || typesPool.slice().sort(() => Math.random() - 0.5)
    const type1 = shuffled[0] || CRISIS_TYPES.HOTPOT
    const type2 = shuffled[1] || CRISIS_TYPES.CAT_CHASE

    this.schedule = [
      { time: Number(w1), type: type1, triggered: false },
      { time: Number(w2), type: type2, triggered: false }
    ]
    this.activeCrisis = null
    this.lastResolution = null
  }

  /**
   * Game loop tick.
   * @param {number} elapsedSec
   * @param {number} now
   * @param {boolean} [isSpecialActive=false] true if beacon or resonance pair is currently active
   * @returns {any|null}
   */
  tick(elapsedSec, now, isSpecialActive = false) {
    const tNow = now || (typeof performance !== 'undefined' ? performance.now() : Date.now())

    // 1. If a crisis is already active, evaluate timeout and internal states
    if (this.activeCrisis) {
      const elapsedActiveMs = tNow - this.activeCrisis.startedAt
      const maxMs = this.activeCrisis.durationSec * 1000

      if (elapsedActiveMs >= maxMs) {
        // Expired without penalty
        const expiredCrisis = { ...this.activeCrisis, expired: true }
        this.resolveCrisis(false)
        return expiredCrisis
      }

      // If Cat Chase, update current cat room based on hop interval
      if (this.activeCrisis.type === CRISIS_TYPES.CAT_CHASE) {
        const hopMs = (this.activeCrisis.hopIntervalSec || 1.5) * 1000
        const hopIndex = Math.floor(elapsedActiveMs / hopMs) % this.activeCrisis.candidateRooms.length
        this.activeCrisis.currentRoomId = this.activeCrisis.candidateRooms[hopIndex]
      }

      this.activeCrisis.remainingSec = Math.max(0, (maxMs - elapsedActiveMs) / 1000)
      this.activeCrisis.progress = Math.min(1.0, elapsedActiveMs / maxMs)
      return this.activeCrisis
    }

    // 2. Check scheduled crises
    for (const item of this.schedule) {
      if (!item.triggered && elapsedSec >= item.time) {
        // Mutual exclusion: if beacon or resonance is active, postpone crisis
        if (isSpecialActive) {
          item.time += this.postponeSec
          return null
        }

        // Trigger crisis
        item.triggered = true
        this.activeCrisis = this._createCrisis(item.type, tNow)
        return this.activeCrisis
      }
    }

    return null
  }

  /**
   * @param {string} type
   * @param {number} startedAt
   * @private
   */
  _createCrisis(type, startedAt) {
    const def = CRISIS_DEFINITIONS[type] || CRISIS_DEFINITIONS[CRISIS_TYPES.HOTPOT]

    let roomId = def.defaultRoom
    let candidateRooms = []

    if (type === CRISIS_TYPES.CAT_CHASE) {
      const candidates = (def.defaultCandidates || []).filter(r => this.availableRooms.includes(r))
      candidateRooms = candidates.length >= 2 ? candidates : this.availableRooms.slice(0, 3)
      roomId = candidateRooms[0]
    } else {
      if (!this.availableRooms.includes(roomId)) {
        roomId = this.availableRooms[0] || 205
      }
    }

    return {
      type,
      title: def.title,
      prompt: def.prompt,
      requiredTaps: def.requiredTaps,
      currentTaps: 0,
      durationSec: def.durationSec,
      bonusWarmth: def.bonusWarmth,
      sfx: def.sfx,
      tag: def.tag,
      startedAt,
      roomId,
      candidateRooms,
      currentRoomId: roomId,
      remainingSec: def.durationSec,
      progress: 0
    }
  }

  /**
   * Handle user tap on a room.
   * @param {number} roomId
   * @returns {{ resolved: boolean, bonusWarmth: number, sfx: string, type: string, title?: string, currentTaps?: number, requiredTaps?: number }|null}
   */
  onTap(roomId) {
    if (!this.activeCrisis) return null
    const targetRoom = Number(roomId)
    const crisis = this.activeCrisis

    if (crisis.type === CRISIS_TYPES.HOTPOT) {
      if (targetRoom === crisis.roomId) {
        crisis.currentTaps++
        if (crisis.currentTaps >= crisis.requiredTaps) {
          const warmth = crisis.bonusWarmth
          const result = {
            resolved: true,
            bonusWarmth: warmth,
            sfx: crisis.sfx,
            type: crisis.type,
            title: crisis.title
          }
          this.resolveCrisis(true)
          return result
        }
        return {
          resolved: false,
          bonusWarmth: 0,
          sfx: 'tap',
          type: crisis.type,
          currentTaps: crisis.currentTaps,
          requiredTaps: crisis.requiredTaps
        }
      }
    } else if (crisis.type === CRISIS_TYPES.CAT_CHASE) {
      if (targetRoom === crisis.currentRoomId) {
        const warmth = crisis.bonusWarmth
        const result = {
          resolved: true,
          bonusWarmth: warmth,
          sfx: crisis.sfx,
          type: crisis.type,
          title: crisis.title
        }
        this.resolveCrisis(true)
        return result
      }
    } else if (crisis.type === CRISIS_TYPES.BLUETOOTH_MIC) {
      if (targetRoom === crisis.roomId) {
        const warmth = crisis.bonusWarmth
        const result = {
          resolved: true,
          bonusWarmth: warmth,
          sfx: crisis.sfx,
          type: crisis.type,
          title: crisis.title
        }
        this.resolveCrisis(true)
        return result
      }
    }

    return null
  }

  /**
   * End current crisis.
   * @param {boolean} success
   */
  resolveCrisis(success) {
    if (this.activeCrisis) {
      this.lastResolution = {
        success: Boolean(success),
        type: this.activeCrisis.type,
        bonusWarmth: success ? this.activeCrisis.bonusWarmth : 0
      }
      this.activeCrisis = null
    }
  }

  /**
   * Query active crisis if any.
   * @returns {any|null}
   */
  getActiveCrisis() {
    return this.activeCrisis
  }
}
