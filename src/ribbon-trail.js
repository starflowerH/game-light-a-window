// Fluid Catmull-Rom light ribbon that follows the pointer: a warm gold swipe
// tail that dissolves into rose stardust. Everything it draws is preallocated --
// ring buffer, subdivided spine, spark sprites and the paint gradient -- so
// push() and tick() never allocate.

const MAX_POINTS = 48
const MAX_AGE = 0.9
const SUBDIV = 4
const MIN_STEP = 4
const MIN_STEP2 = MIN_STEP * MIN_STEP
const SNAP_RADIUS2 = 64 * 64
const SNAP_BLEND = 0.25
const WIDTH_DRAG = 22
const WIDTH_HOVER = 7
const SPARK_COUNT = 8
const SPARK_LIFE = 0.32
const IMPULSE_TIME = 0.12
const SPRITE_SIZE = 64
const PI = Math.PI

// Soft shells painted under the body so the ribbon has a feathered glow edge
// instead of a hard polygon cut. Values are width multipliers.
const AURA_SCALE = [2.7, 2.05, 1.62, 1.32, 1.1]
const AURA_ALPHA = [0.022, 0.03, 0.042, 0.055, 0.07]

// Room for the whole ring buffer plus the closing sample.
const CAP = MAX_POINTS * SUBDIV + 1

function makeSprite() {
  const c = document.createElement('canvas')
  c.width = SPRITE_SIZE
  c.height = SPRITE_SIZE
  const g = c.getContext('2d')
  const r = SPRITE_SIZE / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,248,1)')
  grad.addColorStop(0.26, 'rgba(255,226,166,0.92)')
  grad.addColorStop(0.6, 'rgba(255,158,181,0.34)')
  grad.addColorStop(1, 'rgba(255,120,150,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return c
}

// Unit-length ramp from the head (stop 0) to the tail (stop 1). It is created
// once and remapped onto the live trail with the transform matrix at paint
// time, which is how the colour follows the trail index without rebuilding a
// gradient every frame.
function makeRamp(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 1)
  g.addColorStop(0, 'rgba(255,252,238,0.96)')
  g.addColorStop(0.06, 'rgba(255,238,186,0.94)')
  g.addColorStop(0.18, 'rgba(255,214,140,0.9)')
  g.addColorStop(0.34, 'rgba(255,192,120,0.8)')
  g.addColorStop(0.52, 'rgba(255,168,140,0.62)')
  g.addColorStop(0.7, 'rgba(255,150,168,0.36)')
  g.addColorStop(0.86, 'rgba(255,140,176,0.12)')
  g.addColorStop(1, 'rgba(255,134,172,0)')
  return g
}

export class RibbonTrail {
  /**
   * @param {HTMLElement} host layer that owns the effect canvas
   * @param {{ zIndex?: string|number, maxWidth?: number, hoverWidth?: number, trailLife?: number }} [opts]
   */
  constructor(host, opts) {
    const options = opts || {}
    this._host = host
    this._disposed = false
    this._live = false
    this._tickSeen = false
    this._raf = 0
    this._last = 0
    this._w = 1
    this._h = 1
    this._dpr = 1

    this._dragging = false
    this._magnets = null
    this._impulse = 0

    this._head = -1
    this._count = 0
    this._points = new Array(MAX_POINTS)
    for (let i = 0; i < MAX_POINTS; i++) {
      this._points[i] = { x: 0, y: 0, vx: 0, vy: 0, age: 0, pressure: 1, active: false }
    }

    // Flat scratch space for the subdivided spine: position, age, pressure,
    // normal and half width per sample.
    this._sx = new Float32Array(CAP)
    this._sy = new Float32Array(CAP)
    this._sa = new Float32Array(CAP)
    this._sp = new Float32Array(CAP)
    this._nvx = new Float32Array(CAP)
    this._nvy = new Float32Array(CAP)
    this._hw = new Float32Array(CAP)

    this._sparks = new Array(SPARK_COUNT)
    for (let i = 0; i < SPARK_COUNT; i++) {
      this._sparks[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: SPARK_LIFE, size: 10, active: false }
    }

    this._sprite = makeSprite()
    this._onFrame = () => this._frame()

    const canvas = document.createElement('canvas')
    const style = canvas.style
    style.position = 'fixed'
    style.inset = '0'
    style.left = '0'
    style.top = '0'
    style.width = '100%'
    style.height = '100%'
    style.pointerEvents = 'none'
    style.zIndex = String(options.zIndex === undefined ? 4 : options.zIndex)
    this._canvas = canvas
    this._ctx = canvas.getContext('2d')
    this._ramp = makeRamp(this._ctx)
    host.appendChild(canvas)
    this.resize()
  }

  // ---------------------------------------------------------------- input

  /**
   * Record a pointer sample. Called on every pointermove.
   * @param {number} x viewport CSS px
   * @param {number} y viewport CSS px
   * @param {boolean} [dragging]
   */
  push(x, y, dragging) {
    if (this._disposed) return
    const pts = this._points
    const held = dragging === undefined ? this._dragging : dragging
    const pressure = held ? 1 : 0.35
    if (this._count === 0) {
      this._seed(x, y, pressure)
      return
    }
    const last = pts[this._head]
    const dx = x - last.x
    const dy = y - last.y
    if (dx * dx + dy * dy < MIN_STEP2) {
      // Sub-threshold motion: let the head drift so it still tracks the cursor.
      last.x += dx * 0.35
      last.y += dy * 0.35
      return
    }
    const idx = this._head + 1 >= MAX_POINTS ? 0 : this._head + 1
    const p = pts[idx]
    p.x = x
    p.y = y
    p.vx = dx
    p.vy = dy
    p.age = 0
    p.pressure = pressure
    p.active = true
    this._head = idx
    if (this._count < MAX_POINTS) this._count++
    this._snap(p)
    this._wake()
  }

  /**
   * Begin a stroke: drops the previous tail and seeds a fresh head.
   * @param {number} x
   * @param {number} y
   */
  start(x, y) {
    if (this._disposed) return
    this._dragging = true
    this._resetRing()
    this._seed(x, y, 1)
  }

  end() {
    this._dragging = false
  }

  /**
   * Gold-white burst when a window lights up under the swipe. The width swells
   * to 1.8x for 120ms and eight stardust sprites peel off the tangent normal.
   * @param {number} x
   * @param {number} y
   */
  pulse(x, y) {
    if (this._disposed) return
    this._impulse = 1
    let tx = 1
    let ty = 0
    if (this._count >= 2) {
      const a = this._points[this._head]
      const b = this._points[this._idx(1)]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0.0001) {
        tx = dx / len
        ty = dy / len
      }
    }
    const nx = -ty
    const ny = tx
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = this._sparks[i]
      // Fan the sprites along the normal: -1..1 across the eight slots.
      const spread = (i / (SPARK_COUNT - 1)) * 2 - 1
      const dx = nx * spread + tx * 0.35
      const dy = ny * spread + ty * 0.35
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const speed = 150 + (i % 4) * 46
      s.x = x + nx * spread * 14
      s.y = y + ny * spread * 14
      s.vx = (dx / len) * speed
      s.vy = (dy / len) * speed - 26
      s.life = SPARK_LIFE
      s.max = SPARK_LIFE
      s.size = 7 + (i % 3) * 3.5
      s.active = true
    }
    this._live = true
    this._ensureFrame()
  }

  /**
   * Magnet targets in viewport CSS px, or null to disable snapping. The array
   * is used by reference; it is never copied or mutated here.
   * @param {Array<{x: number, y: number}> | null} points
   */
  setMagnets(points) {
    this._magnets = points && points.length ? points : null
  }

  // -------------------------------------------------------------- lifecycle

  resize() {
    if (this._disposed) return
    const rect = this._host ? this._host.getBoundingClientRect() : null
    const w = Math.max(1, Math.round((rect && rect.width) || innerWidth || 1))
    const h = Math.max(1, Math.round((rect && rect.height) || innerHeight || 1))
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const c = this._canvas
    c.style.width = w + 'px'
    c.style.height = h + 'px'
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (c.width !== bw || c.height !== bh) {
      c.width = bw
      c.height = bh
    }
    this._w = w
    this._h = h
    this._dpr = dpr
    const ctx = this._ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, w, h)
  }

  /** Advance the simulation one frame. Called by the scene render loop. */
  tick() {
    this._tickSeen = true
    this._step()
  }

  clear() {
    this._resetRing()
    for (let i = 0; i < SPARK_COUNT; i++) this._sparks[i].active = false
    this._impulse = 0
    this._live = false
    if (this._ctx) this._ctx.clearRect(0, 0, this._w, this._h)
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    if (this._raf) {
      cancelAnimationFrame(this._raf)
      this._raf = 0
    }
    this._resetRing()
    this._live = false
    const c = this._canvas
    if (c && c.parentNode) c.parentNode.removeChild(c)
    this._ctx = null
    this._canvas = null
    this._host = null
  }

  // ---------------------------------------------------------------- private

  _idx(k) {
    const i = this._head - k
    return i < 0 ? i + MAX_POINTS : i
  }

  _resetRing() {
    for (let i = 0; i < MAX_POINTS; i++) this._points[i].active = false
    this._head = -1
    this._count = 0
  }

  _seed(x, y, pressure) {
    this._head = 0
    this._count = 1
    const p = this._points[0]
    p.x = x
    p.y = y
    p.vx = 0
    p.vy = 0
    p.age = 0
    p.pressure = pressure
    p.active = true
    this._snap(p)
    this._wake()
  }

  _snap(p) {
    const m = this._magnets
    if (!m) return
    let best = null
    let bestD = SNAP_RADIUS2
    for (let i = 0; i < m.length; i++) {
      const dx = m[i].x - p.x
      const dy = m[i].y - p.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = m[i]
      }
    }
    if (!best) return
    p.x += (best.x - p.x) * SNAP_BLEND
    p.y += (best.y - p.y) * SNAP_BLEND
  }

  _wake() {
    if (!this._live) {
      this._live = true
      this._last = performance.now()
    }
    this._ensureFrame()
  }

  // Fallback driver: only used until an external tick() is observed, so the
  // trail still animates if the host render loop is not wired up yet.
  _ensureFrame() {
    if (this._raf !== 0 || this._tickSeen || this._disposed) return
    this._raf = requestAnimationFrame(this._onFrame)
  }

  _frame() {
    this._raf = 0
    if (this._disposed) return
    this._step()
    if (this._live) this._ensureFrame()
  }

  _step() {
    if (this._disposed || !this._live) return
    const now = performance.now()
    let dt = (now - this._last) / 1000
    this._last = now
    if (!(dt > 0)) dt = 1 / 120
    else if (dt > 0.05) dt = 0.05

    const pts = this._points
    const total = this._count
    let count = 0
    for (let i = 0; i < total; i++) {
      const p = pts[this._idx(i)]
      if (!p.active) break
      p.age += dt
      if (p.age >= MAX_AGE) {
        p.active = false
        break
      }
      count++
    }
    this._count = count

    let sparks = 0
    const damp = 1 - (dt * 3.6 > 1 ? 1 : dt * 3.6)
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = this._sparks[i]
      if (!s.active) continue
      s.life -= dt
      if (s.life <= 0) {
        s.active = false
        s.life = 0
        continue
      }
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vx *= damp
      s.vy *= damp
      sparks++
    }

    if (this._impulse > 0) {
      this._impulse -= dt / IMPULSE_TIME
      if (this._impulse < 0) this._impulse = 0
    }

    if (count === 0 && sparks === 0 && this._impulse === 0) {
      this._ctx.clearRect(0, 0, this._w, this._h)
      this._live = false
      return
    }
    this._render(count)
  }

  // --------------------------------------------------------------- render

  _render(count) {
    const ctx = this._ctx
    ctx.clearRect(0, 0, this._w, this._h)
    const m = count >= 2 ? this._buildSpine(count) : 0
    if (m >= 2) {
      this._shape(m)
      this._fillRibbon(m)
      this._strokeCore(m)
    }
    if (count >= 1) this._drawHead()
    this._drawSparks()
  }

  // Uniform Catmull-Rom with tension 0.5:
  // C(t) = 0.5 * (2P1 + (-P0+P2)t + (2P0-5P1+4P2-P3)t^2 + (-P0+3P1-3P2+P3)t^3)
  _buildSpine(count) {
    const pts = this._points
    const sx = this._sx
    const sy = this._sy
    const sa = this._sa
    const sp = this._sp
    let m = 0
    for (let j = count - 1; j >= 1; j--) {
      const p0 = pts[this._idx(j + 1 >= count ? count - 1 : j + 1)]
      const p1 = pts[this._idx(j)]
      const p2 = pts[this._idx(j - 1)]
      const p3 = pts[this._idx(j - 2 < 0 ? 0 : j - 2)]
      const ax = 2 * p1.x
      const bx = -p0.x + p2.x
      const cx = 2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x
      const dx = -p0.x + 3 * p1.x - 3 * p2.x + p3.x
      const ay = 2 * p1.y
      const by = -p0.y + p2.y
      const cy = 2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y
      const dy = -p0.y + 3 * p1.y - 3 * p2.y + p3.y
      const ga = p2.age - p1.age
      const gp = p2.pressure - p1.pressure
      for (let s = 0; s < SUBDIV; s++) {
        const t = s / SUBDIV
        const t2 = t * t
        const t3 = t2 * t
        sx[m] = 0.5 * (ax + bx * t + cx * t2 + dx * t3)
        sy[m] = 0.5 * (ay + by * t + cy * t2 + dy * t3)
        sa[m] = p1.age + ga * t
        sp[m] = p1.pressure + gp * t
        m++
      }
      if (j === 1) {
        sx[m] = p2.x
        sy[m] = p2.y
        sa[m] = p2.age
        sp[m] = p2.pressure
        m++
      }
    }
    return m
  }

  // Width tapers as a spindle: W(u) = Wmax * sin(pow(u, 0.6) * PI) with
  // u = 1 - age / maxAge, plus per-sample normals for the ribbon offsets.
  _shape(m) {
    const sx = this._sx
    const sy = this._sy
    const sa = this._sa
    const sp = this._sp
    const nvx = this._nvx
    const nvy = this._nvy
    const hw = this._hw
    const swell = 1 + 0.8 * this._impulse
    let nx = 0
    let ny = 1
    for (let i = 0; i < m; i++) {
      const a = i > 0 ? i - 1 : i
      const b = i < m - 1 ? i + 1 : i
      const dx = sx[b] - sx[a]
      const dy = sy[b] - sy[a]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0.0001) {
        nx = -dy / len
        ny = dx / len
      }
      nvx[i] = nx
      nvy[i] = ny
      let u = 1 - sa[i] / MAX_AGE
      if (u < 0) u = 0
      else if (u > 1) u = 1
      let load = (sp[i] - 0.35) / 0.65
      if (load < 0) load = 0
      else if (load > 1) load = 1
      const wmax = WIDTH_HOVER + (WIDTH_DRAG - WIDTH_HOVER) * load
      let w = wmax * Math.sin(Math.pow(u, 0.6) * PI) * swell
      if (w < 0.9) w = 0.9
      hw[i] = w * 0.5
    }
  }

  // One closed polygon between the left and right offset curves. The path is
  // baked in screen space; the ramp is remapped onto the trail by the current
  // transform at paint time, so stop 0 lands on the head and stop 1 on the
  // tail without building a new gradient.
  _buildPolygon(m, scale) {
    const ctx = this._ctx
    const sx = this._sx
    const sy = this._sy
    const nvx = this._nvx
    const nvy = this._nvy
    const hw = this._hw
    ctx.beginPath()
    ctx.moveTo(sx[0] + nvx[0] * hw[0] * scale, sy[0] + nvy[0] * hw[0] * scale)
    for (let i = 1; i < m; i++) {
      ctx.lineTo(sx[i] + nvx[i] * hw[i] * scale, sy[i] + nvy[i] * hw[i] * scale)
    }
    for (let i = m - 1; i >= 0; i--) {
      ctx.lineTo(sx[i] - nvx[i] * hw[i] * scale, sy[i] - nvy[i] * hw[i] * scale)
    }
    ctx.closePath()
  }

  _fillRibbon(m) {
    const ctx = this._ctx
    const d = this._dpr
    const hx = this._sx[m - 1]
    const hy = this._sy[m - 1]
    let gx = this._sx[0] - hx
    let gy = this._sy[0] - hy
    let len = Math.sqrt(gx * gx + gy * gy)
    if (len < 2) {
      gx = 0
      gy = 240
      len = 240
    }
    // Basis for the ramp: y runs head -> tail over one unit, x is the unit
    // normal. The matrix has to stay invertible or the shader cannot map a
    // pixel back into gradient space.
    const ux = (-gy / len) * d
    const uy = (gx / len) * d
    const vy = gy * d
    const vx = gx * d
    const ox = hx * d
    const oy = hy * d
    for (let layer = 0; layer < AURA_SCALE.length; layer++) {
      ctx.globalAlpha = AURA_ALPHA[layer]
      this._buildPolygon(m, AURA_SCALE[layer])
      ctx.save()
      ctx.setTransform(ux, uy, vx, vy, ox, oy)
      ctx.fillStyle = this._ramp
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
    this._buildPolygon(m, 1)
    ctx.save()
    ctx.setTransform(ux, uy, vx, vy, ox, oy)
    ctx.fillStyle = this._ramp
    ctx.fill()
    ctx.restore()
  }

  // Hot filament over the newest ~30% of the tail so the head reads sharp.
  _strokeCore(m) {
    const ctx = this._ctx
    const sx = this._sx
    const sy = this._sy
    const hw = this._hw
    const from = Math.floor((m - 1) * 0.7)
    if (from >= m - 1) return
    let peak = 0
    for (let i = from; i < m; i++) if (hw[i] > peak) peak = hw[i]
    if (peak <= 0) return
    ctx.beginPath()
    ctx.moveTo(sx[from], sy[from])
    for (let i = from + 1; i < m; i++) ctx.lineTo(sx[i], sy[i])
    ctx.strokeStyle = 'rgba(255,214,150,0.20)'
    ctx.lineWidth = peak * 1.6
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,252,240,0.75)'
    ctx.lineWidth = peak * 0.5 < 1 ? 1 : peak * 0.5
    ctx.stroke()
  }

  _drawHead() {
    const p = this._points[this._head]
    if (!p) return
    const k = 1 - p.age / MAX_AGE
    if (k <= 0) return
    const ctx = this._ctx
    const size = p.pressure > 0.5 ? 34 : 18
    ctx.globalAlpha = 0.42 * k * k
    ctx.drawImage(this._sprite, p.x - size * 0.5, p.y - size * 0.5, size, size)
    ctx.globalAlpha = 1
  }

  _drawSparks() {
    const ctx = this._ctx
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = this._sparks[i]
      if (!s.active) continue
      const k = s.life / s.max
      const size = s.size * (0.35 + k * 0.9)
      ctx.globalAlpha = k * 0.85
      ctx.drawImage(this._sprite, s.x - size * 0.5, s.y - size * 0.5, size, size)
    }
    ctx.globalAlpha = 1
  }
}
