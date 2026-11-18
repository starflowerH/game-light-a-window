// Pure logic & exact GF(2) solver for《全楼归眠 · 熄灯棋盘》(Lights-Out Puzzle).
//
// Tapping (r, c) toggles (r, c) and its up to 4 orthogonal neighbors.
// Every generated puzzle starts from the solved state (all lights off) and
// applies K distinct random clicks, guaranteeing 100% solvability.
// solveLightsOutGF2() performs Gaussian elimination over GF(2) so the
// "向宿管阿姨求助" hint button always yields a valid minimal-move solution.

/**
 * Return indices of (r, c) and its orthogonal neighbors on a rows x cols grid.
 * @param {number} idx
 * @param {number} rows
 * @param {number} cols
 * @returns {number[]}
 */
export function crossIndices(idx, rows, cols) {
  const r = Math.floor(idx / cols)
  const c = idx % cols
  const out = [idx]
  if (r > 0) out.push((r - 1) * cols + c)
  if (r < rows - 1) out.push((r + 1) * cols + c)
  if (c > 0) out.push(r * cols + (c - 1))
  if (c < cols - 1) out.push(r * cols + (c + 1))
  return out
}

/**
 * Return a new boolean grid after toggling idx and its orthogonal neighbors.
 * @param {boolean[]} grid
 * @param {number} idx
 * @param {number} rows
 * @param {number} cols
 * @returns {boolean[]}
 */
export function toggleCross(grid, idx, rows, cols) {
  const next = grid.slice()
  for (const n of crossIndices(idx, rows, cols)) {
    next[n] = !next[n]
  }
  return next
}

/**
 * Generate a 100% solvable Lights-Out board for any rows x cols dormitory.
 * @param {number} rows
 * @param {number} cols
 * @param {number} level 1-based stage
 * @param {() => number} [rng]
 * @returns {{ grid: boolean[], parMoves: number, solutionMoves: number[] }}
 */
export function generateSolvableBoard(rows, cols, level = 1, rng = Math.random) {
  const n = rows * cols
  const movesCount = Math.min(Math.floor(n * 0.65), 2 + Math.floor(level * 1.1))
  let grid = Array(n).fill(false)
  const chosen = []
  const pool = Array.from({ length: n }, (_, i) => i)

  for (let i = 0; i < movesCount && pool.length; i++) {
    const pick = Math.floor(rng() * pool.length)
    const idx = pool.splice(pick, 1)[0]
    chosen.push(idx)
    grid = toggleCross(grid, idx, rows, cols)
  }

  // Ensure the board is never accidentally already solved
  if (grid.every(v => !v)) {
    const idx = Math.floor(rng() * n)
    chosen.push(idx)
    grid = toggleCross(grid, idx, rows, cols)
  }

  const optimal = solveLightsOutGF2(grid, rows, cols)
  return {
    grid,
    parMoves: optimal ? optimal.length : chosen.length,
    solutionMoves: optimal || chosen
  }
}

/**
 * Solve any Lights-Out configuration over GF(2) using Gaussian elimination.
 * Returns the list of window indices to click to turn all lights off, or null
 * if unsolvable.
 *
 * @param {boolean[]} grid
 * @param {number} rows
 * @param {number} cols
 * @returns {number[] | null}
 */
export function solveLightsOutGF2(grid, rows, cols) {
  const n = rows * cols
  if (grid.length !== n) return null
  if (grid.every(v => !v)) return []

  // Build augmented matrix A|b where each row has n + 1 bits (Uint8Array per row)
  const mat = Array.from({ length: n }, () => new Uint8Array(n + 1))
  for (let i = 0; i < n; i++) {
    for (const j of crossIndices(i, rows, cols)) {
      mat[i][j] = 1
    }
    mat[i][n] = grid[i] ? 1 : 0
  }

  const pivotCol = new Int32Array(n).fill(-1)
  let row = 0
  for (let col = 0; col < n && row < n; col++) {
    let sel = -1
    for (let r = row; r < n; r++) {
      if (mat[r][col] === 1) { sel = r; break }
    }
    if (sel === -1) continue
    if (sel !== row) {
      const tmp = mat[row]
      mat[row] = mat[sel]
      mat[sel] = tmp
    }
    pivotCol[row] = col
    for (let r = 0; r < n; r++) {
      if (r !== row && mat[r][col] === 1) {
        for (let c = col; c <= n; c++) mat[r][c] ^= mat[row][c]
      }
    }
    row += 1
  }

  // Check inconsistency (0 = 1)
  for (let r = row; r < n; r++) {
    if (mat[r][n] === 1) return null
  }

  const sol = new Uint8Array(n)
  for (let r = 0; r < row; r++) {
    const c = pivotCol[r]
    if (c >= 0) sol[c] = mat[r][n]
  }

  /** @type {number[]} */
  const moves = []
  for (let i = 0; i < n; i++) {
    if (sol[i] === 1) moves.push(i)
  }
  return moves
}

/**
 * Check whether every window is turned off (all sleeping!).
 * @param {boolean[]} grid
 */
export function isAllLightsOut(grid) {
  return grid.length > 0 && grid.every(v => !v)
}
