import * as THREE from 'three'

// v3.0 · 120FPS zero-GC GPU particle pool (docs/v3_plan/04, section 三)
//
// The whole scene shares one THREE.Points. Position, size and alpha of every
// particle are evaluated in the vertex shader from aOrigin + aVelocity + uTime,
// so the only per-frame CPU work in this file is writing uTime and the point
// size scale. emitBurst moves a ring cursor and overwrites the TypedArrays in
// place: no geometry rebuild, no material clone, no requestAnimationFrame
// closure, no garbage.
//
// A second, static THREE.Line draws the resonance bridge (a 24 segment
// quadratic arc built once at emit time); a travelling highlight is animated
// purely through a uniform, so it also costs no CPU allocations per frame.

export const MAX_PARTICLES = 1024

const ARC_SEGMENTS = 24

const TAU = Math.PI * 2

const burstVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPointScale;

  attribute vec3 aOrigin;
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute vec2 aBirthAndLife;
  attribute vec2 aKindAndSize;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;

  const float PI = 3.14159265359;

  void main() {
    float life = max(aBirthAndLife.y, 0.001);
    float age = (uTime - aBirthAndLife.x) / life;

    // dead or not born yet: park the vertex outside the clip volume
    if (age < 0.0 || age >= 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = aColor;
      vAlpha = 0.0;
      vKind = aKindAndSize.x;
      return;
    }

    float kind = aKindAndSize.x;
    float t = age * life;

    // 0 颜料星火: fast, heavy, shrinking / 1 上升光羽: buoyant, long lived
    // 2 星轨连线点: near static, tiny, twinkling
    float gravity = -150.0;
    float drag = 2.4;
    float driftAmp = 7.5;
    float driftFreq = 4.5;
    float sizeCurve = 1.0 - 0.72 * age;
    float alphaCurve = pow(1.0 - age, 1.35);

    if (kind > 0.5 && kind < 1.5) {
      gravity = 26.0;
      drag = 1.2;
      driftAmp = 12.0;
      driftFreq = 1.6;
      sizeCurve = 0.5 + 0.9 * sin(age * PI);
      float feather = sin(age * PI);
      alphaCurve = feather * feather;
    } else if (kind >= 1.5) {
      gravity = 0.0;
      drag = 7.0;
      driftAmp = 1.8;
      driftFreq = 2.3;
      sizeCurve = 0.75 + 0.25 * (1.0 - age);
      alphaCurve = 0.55 + 0.45 * sin(t * 8.0 + aOrigin.x);
    }

    // closed-form ballistics with linear air drag: v' = -k * v + g
    float k = max(drag, 0.0001);
    vec3 g = vec3(0.0, gravity, 0.0);
    float ease = (1.0 - exp(-k * t)) / k;
    vec3 pos = aOrigin + (aVelocity + g / k) * ease + (g / k) * t;

    // sinusoidal lateral drift, phase locked to the spawn slot
    float phase = aOrigin.x * 0.7 + aOrigin.y * 1.3 + aKindAndSize.y * 4.0;
    pos.x += sin(t * driftFreq + phase) * driftAmp * age;
    pos.z += cos(t * driftFreq * 0.73 + phase) * driftAmp * 0.55 * age;
    pos.y += sin(t * driftFreq * 0.9 + phase * 1.7) * driftAmp * 0.22 * age;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // world size -> device pixels; projectionMatrix[1][1] is 1 / tan(fov / 2)
    float px = aKindAndSize.y * sizeCurve * uPointScale * projectionMatrix[1][1] / max(-mv.z, 1.0);
    gl_PointSize = clamp(px, 1.5, 64.0);

    vColor = aColor;
    vAlpha = clamp(alphaCurve, 0.0, 1.0);
    vKind = kind;
  }
`

const burstFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;

  void main() {
    if (vAlpha <= 0.002) discard;

    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;

    float r = sqrt(r2) * 2.0;
    float halo = 1.0 - r;
    float body = halo * halo * (3.0 - 2.0 * halo);
    float core = pow(halo, 6.0);

    // feathers stay soft, sparks keep a warm white-hot core
    float coreAmt = 0.55;
    coreAmt = mix(coreAmt, 0.16, step(0.5, vKind) * step(vKind, 1.5));
    coreAmt = mix(coreAmt, 0.85, step(1.5, vKind));

    vec3 col = mix(vColor, vec3(1.0, 0.95, 0.86), core * coreAmt);
    float a = min((body * 0.6 + core * 0.7) * vAlpha, 1.0);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

const threadVertexShader = /* glsl */ `
  uniform float uTime;

  attribute float aT;

  varying float vPulse;

  void main() {
    // one highlight sweeps a -> b every ~2.8s, the thread itself breathes
    float head = fract(uTime * 0.36 - aT);
    float spark = pow(1.0 - head, 12.0);
    float breathe = 0.5 + 0.5 * sin(uTime * 1.7 - aT * 9.0);
    float bead = smoothstep(0.15, 0.85, fract(aT * 18.0 - uTime * 0.5));

    vPulse = (0.22 + 0.30 * breathe) * (0.55 + 0.45 * bead) + 1.05 * spark;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const threadFragmentShader = /* glsl */ `
  uniform vec3 uColor;

  varying float vPulse;

  void main() {
    gl_FragColor = vec4(uColor * vPulse, vPulse);
    #include <colorspace_fragment>
  }
`

/**
 * One draw call for every burst in the game, plus one line for the bridge.
 * @param {import('three').Scene} scene
 * @param {{ max?: number, pointScale?: number }} [opts]
 */
export class VfxPool {
  constructor(scene, opts = {}) {
    this.scene = scene

    const requested = Number.isFinite(opts.max) ? Math.floor(opts.max) : MAX_PARTICLES
    const capacity = Math.max(64, Math.min(4096, requested))
    this.capacity = capacity
    this._pointScale = Number.isFinite(opts.pointScale) ? opts.pointScale : 1
    this._time = 0
    this._cursor = 0
    this._visible = true
    this._hasBridge = false
    this._color = new THREE.Color()

    // --- burst pool: every TypedArray is allocated exactly once, right here ---
    const aOrigin = new Float32Array(capacity * 3)
    const aVelocity = new Float32Array(capacity * 3)
    const aColor = new Float32Array(capacity * 3)
    const aBirthAndLife = new Float32Array(capacity * 2)
    const aKindAndSize = new Float32Array(capacity * 2)

    this._aOrigin = aOrigin
    this._aVelocity = aVelocity
    this._aColor = aColor
    this._aBirthAndLife = aBirthAndLife
    this._aKindAndSize = aKindAndSize

    // park every slot far in the past so nothing renders before the first emit
    for (let i = 0; i < capacity; i++) {
      aBirthAndLife[i * 2] = -1e6
      aBirthAndLife[i * 2 + 1] = 0.001
    }

    const geometry = new THREE.BufferGeometry()
    // The origin buffer doubles as the standard position attribute so three
    // knows the draw count; sharing one BufferAttribute means one GPU buffer.
    this._originAttr = new THREE.BufferAttribute(aOrigin, 3)
    this._velocityAttr = new THREE.BufferAttribute(aVelocity, 3)
    this._colorAttr = new THREE.BufferAttribute(aColor, 3)
    this._birthAttr = new THREE.BufferAttribute(aBirthAndLife, 2)
    this._kindAttr = new THREE.BufferAttribute(aKindAndSize, 2)

    geometry.setAttribute('position', this._originAttr)
    geometry.setAttribute('aOrigin', this._originAttr)
    geometry.setAttribute('aVelocity', this._velocityAttr)
    geometry.setAttribute('aColor', this._colorAttr)
    geometry.setAttribute('aBirthAndLife', this._birthAttr)
    geometry.setAttribute('aKindAndSize', this._kindAttr)

    this._burstMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPointScale: { value: 900 }
      },
      vertexShader: burstVertexShader,
      fragmentShader: burstFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })

    this._points = new THREE.Points(geometry, this._burstMat)
    this._points.frustumCulled = false
    this._points.renderOrder = 6
    scene.add(this._points)

    // --- resonance bridge: one preallocated polyline, rewritten on demand ---
    this._arcPositions = new Float32Array((ARC_SEGMENTS + 1) * 3)
    const arcT = new Float32Array(ARC_SEGMENTS + 1)
    for (let i = 0; i <= ARC_SEGMENTS; i++) arcT[i] = i / ARC_SEGMENTS

    const arcGeometry = new THREE.BufferGeometry()
    this._arcAttr = new THREE.BufferAttribute(this._arcPositions, 3)
    arcGeometry.setAttribute('position', this._arcAttr)
    arcGeometry.setAttribute('aT', new THREE.BufferAttribute(arcT, 1))

    this._threadMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffd98a) }
      },
      vertexShader: threadVertexShader,
      fragmentShader: threadFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })

    this._thread = new THREE.Line(arcGeometry, this._threadMat)
    this._thread.frustumCulled = false
    this._thread.renderOrder = 7
    this._thread.visible = false
    scene.add(this._thread)
  }

  /**
   * Spawn count particles at a world position. Overwrites ring-buffer slots in
   * place; nothing is allocated and no object literal is created.
   * @param {THREE.Vector3} worldPos
   * @param {THREE.ColorRepresentation} color
   * @param {number} [count]
   * @param {number} [kind] 0 颜料星火 / 1 上升光羽 / 2 星轨连线点
   */
  emitBurst(worldPos, color, count = 24, kind = 0) {
    const n = Math.max(0, Math.min(Math.floor(count), this.capacity))
    if (n === 0) return

    // one scratch Color for the whole pool: hex strings are parsed once per
    // call, never per particle
    this._color.set(color)
    const cr = this._color.r
    const cg = this._color.g
    const cb = this._color.b

    const kindId = kind >= 1.5 ? 2 : kind >= 0.5 ? 1 : 0

    const pos = this._aOrigin
    const vel = this._aVelocity
    const col = this._aColor
    const birth = this._aBirthAndLife
    const kindSize = this._aKindAndSize
    const cap = this.capacity
    const t = this._time

    let cursor = this._cursor
    for (let i = 0; i < n; i++) {
      let speed
      let life
      let size
      let lift

      if (kindId === 1) {
        // 上升光羽: slow buoyant rise, long fade
        speed = 6 + Math.random() * 16
        lift = 0.6 + Math.random() * 0.4
        life = 2.2 + Math.random() * 1.8
        size = 6 + Math.random() * 6
      } else if (kindId === 2) {
        // 星轨连线点: almost still, tiny, blinking
        speed = 3 + Math.random() * 10
        lift = 0.2 + Math.random() * 0.4
        life = 1.4 + Math.random() * 1.2
        size = 2 + Math.random() * 1.8
      } else {
        // 颜料星火: hot fast fan, gravity does the rest
        speed = 55 + Math.random() * 95
        lift = 0.35 + Math.random() * 0.85
        life = 0.85 + Math.random() * 0.6
        size = 4 + Math.random() * 5.5
      }

      const ang = Math.random() * TAU
      const i3 = cursor * 3
      const i2 = cursor * 2

      pos[i3] = worldPos.x + (Math.random() - 0.5) * 5
      pos[i3 + 1] = worldPos.y + (Math.random() - 0.5) * 5
      pos[i3 + 2] = worldPos.z + 2.5 + (Math.random() - 0.5) * 3

      vel[i3] = Math.cos(ang) * speed * 0.75
      vel[i3 + 1] = speed * lift
      vel[i3 + 2] = Math.sin(ang) * speed * 0.42

      col[i3] = cr
      col[i3 + 1] = cg
      col[i3 + 2] = cb

      birth[i2] = t
      birth[i2 + 1] = life

      kindSize[i2] = kindId
      kindSize[i2 + 1] = size

      cursor = cursor + 1 === cap ? 0 : cursor + 1
    }
    this._cursor = cursor

    this._originAttr.needsUpdate = true
    this._velocityAttr.needsUpdate = true
    this._colorAttr.needsUpdate = true
    this._birthAttr.needsUpdate = true
    this._kindAttr.needsUpdate = true
  }

  /**
   * Draw a gently arcing star-thread between two world positions. The arc is
   * sampled once here; afterwards only the uTime uniform animates it.
   * @param {THREE.Vector3} a
   * @param {THREE.Vector3} b
   * @param {THREE.ColorRepresentation} [color]
   */
  emitResonanceBridge(a, b, color = 0xffd98a) {
    const ax = a.x
    const ay = a.y
    const az = a.z
    const bx = b.x
    const by = b.y
    const bz = b.z

    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
    const bow = Math.min(dist * 0.22, 46) + 6

    // quadratic control point: midpoint lifted upward and a touch toward camera
    const cx = (ax + bx) * 0.5
    const cy = (ay + by) * 0.5 + bow
    const cz = (az + bz) * 0.5 + bow * 0.12

    const p = this._arcPositions
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const u = i / ARC_SEGMENTS
      const iu = 1 - u
      const w0 = iu * iu
      const w1 = 2 * iu * u
      const w2 = u * u
      const i3 = i * 3
      p[i3] = ax * w0 + cx * w1 + bx * w2
      p[i3 + 1] = ay * w0 + cy * w1 + by * w2
      p[i3 + 2] = az * w0 + cz * w1 + bz * w2
    }
    this._arcAttr.needsUpdate = true

    this._threadMat.uniforms.uColor.value.set(color)
    this._hasBridge = true
    this._thread.visible = this._visible
  }

  /** Called every frame with elapsed seconds. Only uniforms are touched. */
  update(time) {
    this._time = time
    this._burstMat.uniforms.uTime.value = time
    this._threadMat.uniforms.uTime.value = time
    // sprite size tracks the drawing buffer so particles keep their world scale
    // on any DPR or viewport; a few multiplies, no allocation
    const h = innerHeight || 900
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this._burstMat.uniforms.uPointScale.value = h * dpr * 0.5 * this._pointScale
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    this._visible = !!visible
    this._points.visible = this._visible
    this._thread.visible = this._visible && this._hasBridge
  }

  /** Remove the resonance thread until the next emitResonanceBridge call. */
  clearBridge() {
    this._hasBridge = false
    this._thread.visible = false
  }

  dispose() {
    this.scene.remove(this._points)
    this._points.geometry.dispose()
    this._points.material.dispose()

    this.scene.remove(this._thread)
    this._thread.geometry.dispose()
    this._thread.material.dispose()
  }
}

export default VfxPool
