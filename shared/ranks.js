// Intuitive Patrol Mastery Tiers & Stage Milestone formatting shared across
// client HUD, settlement cards, and server leaderboard UI.

export const MODE_MAX_STAGE = /** @type {const} */ ({
  memory_sequence: 10,
  memory_snapshot: 10,
  patrol_reflex: 5,
  lights_out_puzzle: 8,
  star_sweep: 3
})

/**
 * 7-tier patrol rank ladder from D (novice) to SSS (legend).
 * Each tier stores per-mode score thresholds calibrated to real mode pacing.
 */
export const PATROL_TIERS = [
  {
    code: 'D',
    title: '见习点灯生',
    icon: '🕯️',
    cssClass: 'tier-d',
    thresholds: {
      star_sweep: 0,
      memory_sequence: 0,
      memory_snapshot: 0,
      patrol_reflex: 0,
      lights_out_puzzle: 0
    }
  },
  {
    code: 'C',
    title: '值班巡楼员',
    icon: '🔦',
    cssClass: 'tier-c',
    thresholds: {
      star_sweep: 80,
      memory_sequence: 350,
      memory_snapshot: 350,
      patrol_reflex: 200,
      lights_out_puzzle: 260
    }
  },
  {
    code: 'B',
    title: '宿管得力干将',
    icon: '🔑',
    cssClass: 'tier-b',
    thresholds: {
      star_sweep: 180,
      memory_sequence: 850,
      memory_snapshot: 850,
      patrol_reflex: 500,
      lights_out_puzzle: 600
    }
  },
  {
    code: 'A',
    title: '17号楼神眼巡长',
    icon: '🌟',
    cssClass: 'tier-a',
    thresholds: {
      star_sweep: 320,
      memory_sequence: 1700,
      memory_snapshot: 1700,
      patrol_reflex: 900,
      lights_out_puzzle: 1050
    }
  },
  {
    code: 'S',
    title: '零点控场王',
    icon: '⚡',
    cssClass: 'tier-s',
    thresholds: {
      star_sweep: 480,
      memory_sequence: 3000,
      memory_snapshot: 3000,
      patrol_reflex: 1450,
      lights_out_puzzle: 1650
    }
  },
  {
    code: 'SS',
    title: '传奇守灯大师',
    icon: '🏅',
    cssClass: 'tier-ss',
    thresholds: {
      star_sweep: 680,
      memory_sequence: 5000,
      memory_snapshot: 5000,
      patrol_reflex: 2100,
      lights_out_puzzle: 2350
    }
  },
  {
    code: 'SSS',
    title: '全校熄灯传说',
    icon: '👑',
    cssClass: 'tier-sss',
    thresholds: {
      star_sweep: 900,
      memory_sequence: 7800,
      memory_snapshot: 7800,
      patrol_reflex: 2900,
      lights_out_puzzle: 3200
    }
  }
]

/**
 * Resolve mode key safely into one of the 5 supported modes.
 * @param {string} [gameMode]
 * @returns {'star_sweep'|'memory_sequence'|'memory_snapshot'|'patrol_reflex'|'lights_out_puzzle'}
 */
function normalizeMode(gameMode) {
  if (
    gameMode === 'star_sweep' ||
    gameMode === 'memory_sequence' ||
    gameMode === 'memory_snapshot' ||
    gameMode === 'patrol_reflex' ||
    gameMode === 'lights_out_puzzle'
  ) {
    return gameMode
  }
  return 'memory_sequence'
}

/**
 * Format an intuitive human-readable stage/wave milestone string for any game mode.
 * @param {string} gameMode
 * @param {number} [stageReached=1]
 * @param {number} [accuracyPct=0]
 * @returns {string}
 */
export function formatStageMilestone(gameMode, stageReached = 1, accuracyPct = 0) {
  const mode = normalizeMode(gameMode)
  const maxStage = MODE_MAX_STAGE[mode] || 10
  const st = Math.max(1, Math.min(maxStage, Math.floor(Number(stageReached) || 1)))

  if (mode === 'patrol_reflex') {
    return st >= maxStage ? `🏆 ${maxStage}波全守` : `守到 第 ${st}/${maxStage} 波`
  }
  if (mode === 'lights_out_puzzle') {
    return st >= maxStage ? `🏆 ${maxStage}关全通` : `解开 第 ${st}/${maxStage} 关`
  }
  if (mode === 'star_sweep') {
    return st >= maxStage ? `🏆 ${maxStage}夜全通` : `第 ${st}/${maxStage} 夜`
  }
  return st >= maxStage ? `🏆 ${maxStage}关全通` : `闯到 第 ${st}/${maxStage} 关`
}

/**
 * Evaluate a player's current or final run into an intuitive Tier Badge + Next-Tier gap.
 * @param {{
 *   gameMode?: string,
 *   score?: number,
 *   stageReached?: number,
 *   accuracyPct?: number,
 *   stampsEarned?: number
 * }} [input]
 */
export function evaluateRunTier(input = {}) {
  const mode = normalizeMode(input.gameMode)
  const score = Math.max(0, Math.round(Number(input.score) || 0))
  const maxStage = MODE_MAX_STAGE[mode] || 10
  const stage = Math.max(1, Math.min(maxStage, Math.floor(Number(input.stageReached) || 1)))
  const accuracyPct = Math.max(0, Math.min(100, Math.round(Number(input.accuracyPct) || 0)))
  const stageRatio = Number(Math.max(0, Math.min(1, stage / maxStage)).toFixed(3))

  let tierIdx = 0
  for (let i = 0; i < PATROL_TIERS.length; i++) {
    const req = PATROL_TIERS[i].thresholds[mode] || 0
    if (score >= req) tierIdx = i
  }

  const cur = PATROL_TIERS[tierIdx]
  const nextRaw = tierIdx + 1 < PATROL_TIERS.length ? PATROL_TIERS[tierIdx + 1] : null
  const nextReq = nextRaw ? (nextRaw.thresholds[mode] || 0) : 0
  const pointsToNext = nextRaw ? Math.max(0, nextReq - score) : 0
  const curReq = cur.thresholds[mode] || 0
  const tierProgress = nextRaw && nextReq > curReq
    ? Math.max(0, Math.min(1, (score - curReq) / (nextReq - curReq)))
    : 1

  return {
    code: cur.code,
    title: cur.title,
    icon: cur.icon,
    cssClass: cur.cssClass,
    tierIndex: tierIdx,
    score,
    stageReached: stage,
    maxStage,
    accuracyPct,
    stageRatio,
    tierProgress: Number(tierProgress.toFixed(3)),
    milestoneText: formatStageMilestone(mode, stage, accuracyPct),
    nextTier: nextRaw
      ? { code: nextRaw.code, title: nextRaw.title, icon: nextRaw.icon, cssClass: nextRaw.cssClass, minScore: nextReq }
      : null,
    pointsToNext
  }
}
