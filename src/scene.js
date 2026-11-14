import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createPainterlyPass } from './painterly.js'

const COLS = 6, ROWS = 4

export const PALETTES = {
  warm_blue:    { sky: [0x0b1533, 0x233f74, 0x6a86c4], moon: 0xfff3d0, warm: 0xffc06a, rim: 0x9fc2ff, fog: 0x1b2b4d, particle: 0xffe6b0 },
  rainy_amber:  { sky: [0x120f1f, 0x3a2a3f, 0x8a5a4a], moon: 0xffd9a0, warm: 0xffab5a, rim: 0xd8a8ff, fog: 0x241b2c, particle: 0xffcf8a },
  foggy_lilac:  { sky: [0x171630, 0x363258, 0x8a86ad], moon: 0xe9e3ff, warm: 0xffc48a, rim: 0xb9a8ff, fog: 0x2a2747, particle: 0xd8ccff },
  clear_peach:  { sky: [0x1a1430, 0x5a3a54, 0xd08a72], moon: 0xfff0c8, warm: 0xffb85e, rim: 0xffc2a0, fog: 0x35284a, particle: 0xffd9a8 }
}

const hex = n => '#' + n.toString(16).padStart(6, '0')

function roundedRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

function softDot(color, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d'); const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, color); grad.addColorStop(0.4, color.replace('1)', '0.7)')); grad.addColorStop(1, color.replace('1)', '0)'))
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

function windowTexture(lit, warm, variant = 0) {
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)
  if (lit) {
    const grad = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.72)
    grad.addColorStop(0, '#fffdf2'); grad.addColorStop(0.35, hex(warm)); grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad; g.fillRect(0, 0, S, S)
    g.globalCompositeOperation = 'source-atop'
    // warm curtains silhouette
    g.fillStyle = 'rgba(120,50,10,0.35)'; g.fillRect(0, 0, S * 0.16, S); g.fillRect(S * 0.84, 0, S * 0.16, S)
    drawInterior(g, S, variant)
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, S * 0.72, S, S * 0.28)
  } else {
    g.fillStyle = 'rgba(12,20,40,0.95)'; roundedRect(g, 2, 2, S - 4, S - 4, 10); g.fill()
    g.fillStyle = 'rgba(70,105,170,0.20)'; roundedRect(g, 10, 8, S - 20, S * 0.42, 8); g.fill()
  }
  // mullions
  g.strokeStyle = lit ? 'rgba(90,50,15,0.6)' : 'rgba(120,150,200,0.35)'
  g.lineWidth = 3.5; g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S * 0.55); g.lineTo(S, S * 0.55); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

function drawInterior(g, S, variant) {
  const ink = 'rgba(78,38,12,0.62)'
  g.save()
  g.fillStyle = ink
  const v = variant % 7
  if (v === 0) {
    // person at a desk
    g.beginPath(); g.arc(S * 0.6, S * 0.42, S * 0.07, 0, 7); g.fill()      // head
    g.beginPath(); g.moveTo(S * 0.5, S * 0.6); g.quadraticCurveTo(S * 0.6, S * 0.46, S * 0.7, S * 0.6); g.lineTo(S * 0.68, S * 0.72); g.lineTo(S * 0.52, S * 0.72); g.fill()  // body
    g.fillRect(S * 0.36, S * 0.64, S * 0.34, S * 0.05)                       // desk
    g.fillRect(S * 0.36, S * 0.69, S * 0.04, S * 0.1); g.fillRect(S * 0.66, S * 0.69, S * 0.04, S * 0.1) // legs
    g.fillRect(S * 0.42, S * 0.58, S * 0.1, S * 0.06)                        // lamp glow block
  } else if (v === 1) {
    // plant on sill
    g.beginPath(); g.moveTo(S * 0.5, S * 0.72); g.lineTo(S * 0.5, S * 0.54); g.lineWidth = S * 0.02; g.strokeStyle = ink; g.stroke()
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.5; g.beginPath(); g.ellipse(S * 0.5 + Math.cos(a) * S * 0.11, S * 0.54 + Math.sin(a) * S * 0.11, S * 0.08, S * 0.035, a, 0, 7); g.fill() }
    g.fillRect(S * 0.42, S * 0.7, S * 0.16, S * 0.08)
  } else if (v === 2) {
    // cat on windowsill
    g.beginPath(); g.ellipse(S * 0.55, S * 0.66, S * 0.13, S * 0.07, 0, 0, 7); g.fill()
    g.beginPath(); g.arc(S * 0.66, S * 0.6, S * 0.06, 0, 7); g.fill()
    g.beginPath(); g.moveTo(S * 0.62, S * 0.56); g.lineTo(S * 0.63, S * 0.5); g.lineTo(S * 0.65, S * 0.55); g.fill()
    g.beginPath(); g.moveTo(S * 0.68, S * 0.56); g.lineTo(S * 0.7, S * 0.5); g.lineTo(S * 0.71, S * 0.55); g.fill()
    g.beginPath(); g.moveTo(S * 0.44, S * 0.66); g.quadraticCurveTo(S * 0.34, S * 0.6, S * 0.38, S * 0.5); g.lineWidth = S * 0.025; g.strokeStyle = ink; g.stroke()
  } else if (v === 3) {
    // laundry / clothes on a line
    g.strokeStyle = ink; g.lineWidth = S * 0.012; g.beginPath(); g.moveTo(0, S * 0.34); g.lineTo(S, S * 0.36); g.stroke()
    for (let i = 0; i < 3; i++) { const x = S * (0.22 + i * 0.26); g.beginPath(); g.moveTo(x - S * 0.07, S * 0.35); g.lineTo(x + S * 0.07, S * 0.35); g.lineTo(x + S * 0.05, S * 0.5); g.lineTo(x - S * 0.05, S * 0.5); g.fill() }
    g.fillRect(S * 0.4, S * 0.7, S * 0.2, S * 0.08)
  } else if (v === 4) {
    // floor lamp + armchair
    g.fillRect(S * 0.28, S * 0.36, S * 0.03, S * 0.3)
    g.beginPath(); g.moveTo(S * 0.2, S * 0.36); g.lineTo(S * 0.4, S * 0.36); g.lineTo(S * 0.34, S * 0.26); g.lineTo(S * 0.26, S * 0.26); g.fill()
    g.fillRect(S * 0.56, S * 0.56, S * 0.24, S * 0.16); g.fillRect(S * 0.54, S * 0.48, S * 0.06, S * 0.22); g.fillRect(S * 0.76, S * 0.48, S * 0.06, S * 0.22)
  } else if (v === 5) {
    // bookshelf against wall
    for (let r = 0; r < 3; r++) { g.fillRect(S * 0.24, S * (0.34 + r * 0.13), S * 0.52, S * 0.03); for (let b = 0; b < 6; b++) if (Math.random() > 0.3) g.fillRect(S * (0.26 + b * 0.08), S * (0.28 + r * 0.13), S * 0.05, S * 0.075) }
  } else {
    // two people chatting by window
    g.beginPath(); g.arc(S * 0.38, S * 0.44, S * 0.06, 0, 7); g.fill(); g.fillRect(S * 0.31, S * 0.52, S * 0.14, S * 0.16)
    g.beginPath(); g.arc(S * 0.64, S * 0.44, S * 0.06, 0, 7); g.fill(); g.fillRect(S * 0.57, S * 0.52, S * 0.14, S * 0.16)
  }
  g.restore()
}

function rooftopSvg() {
  // dense ink-wash skyline: rooftops + silhouetted trees for far layer
  const W = 2048, H = 300; const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.clearRect(0, 0, W, H)
  let x = 0
  while (x < W) {
    const w = 90 + Math.random() * 190, h = 70 + Math.random() * 140, base = H - 30
    g.fillStyle = 'rgba(11,17,38,0.9)'; g.fillRect(x, base - h, w, h)
    // roof shapes: flat / pitched / stepped
    const kind = Math.random()
    g.beginPath()
    if (kind < 0.4) { g.moveTo(x - 5, base - h); g.lineTo(x + w * 0.5, base - h - 26 - Math.random() * 18); g.lineTo(x + w + 5, base - h) }
    else if (kind < 0.7) { g.rect(x - 5, base - h - 14, w + 10, 14) }
    else { g.rect(x + w * 0.2, base - h - 20, w * 0.6, 20) }
    g.fill()
    // faint windows grid
    for (let ry = 0; ry < h - 20; ry += 16) for (let rx = 8; rx < w - 8; rx += 14) {
      if (Math.random() > 0.62) { g.fillStyle = 'rgba(255,205,130,' + (0.25 + Math.random() * 0.4) + ')'; g.fillRect(x + rx, base - h + 10 + ry, 5, 7) }
    }
    // silhouette tree between buildings
    if (Math.random() > 0.5) { const tx = x + w + 8 + Math.random() * 30, th = 40 + Math.random() * 70; drawTreeSil(g, tx, base, th) }
    x += w + 14 + Math.random() * 46
  }
  // ground haze band
  const gg = g.createLinearGradient(0, H - 70, 0, H); gg.addColorStop(0, 'rgba(11,17,38,0)'); gg.addColorStop(1, 'rgba(11,17,38,0.95)')
  g.fillStyle = gg; g.fillRect(0, H - 70, W, 70)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function drawTreeSil(g, x, base, h) {
  g.fillStyle = 'rgba(12,19,40,0.9)'
  g.fillRect(x - 2, base - h * 0.5, 4, h * 0.5)
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + (Math.random() - 0.5) * h * 0.5, base - h * (0.55 + Math.random() * 0.35), h * (0.16 + Math.random() * 0.12), 0, 7); g.fill() }
}

export class Scene {
  /**
   * @param {HTMLElement} host
   * @param {{ onWindowTap?: (w: any, x: number, y: number) => void }} [opts]
   */
  constructor(host, { onWindowTap } = {}) {
    this.host = host
    this.onWindowTap = onWindowTap
    this.clock = new THREE.Clock()
    this.windows = []
    this.theme = 'warm_blue'
    this.lit = 0
    this.pulseId = 0

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this._pixelRatioCap = matchMedia('(pointer: coarse)').matches ? 1.5 : 2
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this._pixelRatioCap))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x1b2b4d, 0.0009)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000)

    // soft env for subtle reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.25

    this._buildSky()
    this._buildStars()
    this._buildMoon()
    this._buildMountains()
    this._buildGround()
    this._buildDorm()
    this._buildTrees()
    this._buildFireflies()
    this._buildParticles()
    this._buildLights()
    this._buildComposer()

    this.applyTheme('warm_blue', true)
    this._resize()
    addEventListener('resize', () => this._resize())
    this._onVis = () => { if (document.hidden) this.renderer.setAnimationLoop(null); else this.renderer.setAnimationLoop(this._boundTick) }
    document.addEventListener('visibilitychange', this._onVis)
    this.renderer.domElement.addEventListener('pointerdown', e => this._onPointer(e))
    this._boundTick = () => this.tick()
    this.renderer.setAnimationLoop(this._boundTick)
  }

  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      depthWrite: false, side: THREE.BackSide, uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.7)) : mix(mid, bot, clamp(-h*2.2,0.0,1.0)); gl_FragColor = vec4(c,1.0); }`
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), this.skyMat)
    this.scene.add(sky)
  }

  _buildStars() {
    const N = 900, pos = new Float32Array(N * 3), sizes = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const r = 2200, th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.75)
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.7 + 200
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r
      sizes[i] = Math.random() * 6 + 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xdfe8ff) } },
      vertexShader: `attribute float size; uniform float time; varying float a; void main(){ a = 0.5+0.5*sin(time*2.0 + position.x*0.05); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 color; varying float a; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(color, a*(1.0-d*2.0)); }`
    })
    this.stars = new THREE.Points(geo, this.starMat); this.scene.add(this.stars)
  }

  _buildMoon() {
    this.moonGroup = new THREE.Group()
    const tex = softDot('rgba(255,244,214,1)', 256)
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff3d0 }))
    this.moonSprite.scale.setScalar(150); this.moonGroup.add(this.moonSprite)
    const crisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,250,232,1)', 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    crisp.scale.setScalar(66); crisp.position.z = 2; this.moonGroup.add(crisp)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,242,210,1)', 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }))
    halo.scale.setScalar(150); this.moonGroup.add(halo)
    this.moonGroup.position.set(430, 340, -900); this.scene.add(this.moonGroup)
  }

  _buildMountains() {
    const make = (color, y, z, scale, jitter) => {
      const seg = 90, pos = [], W = 2600
      pos.push(-W, -200, 0)
      for (let i = 0; i <= seg; i++) {
        const x = -W + (i / seg) * W * 2
        const h = 40 + Math.sin(i * 0.22) * 22 + Math.sin(i * 0.08) * 40 + Math.sin(i * 0.5) * 8
        pos.push(x, h, 0)
      }
      pos.push(W, -200, 0)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false }))
      m.position.set(0, y, z); m.scale.set(scale, scale, 1); this.scene.add(m); return m
    }
    this.mtnFar = make(0x1a2547, -120, -1500, 1.4, 90)
    this.mtnMid = make(0x121a33, -130, -1100, 1.0, 60)
    // far rooftops strip
    const rt = rooftopSvg()
    const rw = 3600, rh = 300
    this.farTown = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, opacity: 0.95 }))
    this.farTown.position.set(0, -90, -760); this.scene.add(this.farTown)
  }

  _buildGround() {
    // ink-wash lawn reflection plane
    const geo = new THREE.PlaneGeometry(4000, 2400, 1, 1)
    this.groundMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { c1: { value: new THREE.Color(0x0d1630) }, c2: { value: new THREE.Color(0x2b3a5e) }, glow: { value: 0.0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 c1; uniform vec3 c2; uniform float glow;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        void main(){ vec2 uv=vUv; float d=uv.y; vec3 c=mix(c1,c2,smoothstep(0.0,0.6,uv.y));
        // mirrored glow band
        float band = smoothstep(0.02,0.0,abs(uv.y-0.12))*0.6*glow;
        c += vec3(1.0,0.78,0.45)*band;
        // subtle streaks
        c += vec3(0.05,0.08,0.14)*hash(floor(uv*vec2(300.0,120.0)))*0.2;
        gl_FragColor=vec4(c,1.0); }`
    })
    this.ground = new THREE.Mesh(geo, this.groundMat)
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.set(0, -220, -120); this.scene.add(this.ground)
  }

  _buildDorm() {
    this.dorm = new THREE.Group(); this.dorm.position.set(0, 0, 0); this.scene.add(this.dorm)
    const BW = 460, BH = 330, BD = 130
    const baseY = -210
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39466a, roughness: 0.88, metalness: 0.05 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), bodyMat)
    body.position.y = BH / 2 + baseY; this.dorm.add(body)
    // facade wash (soft warm light from below)
    const wash = new THREE.CanvasTexture((() => { const c=document.createElement('canvas'); c.width=8;c.height=256; const g=c.getContext('2d'); const gr=g.createLinearGradient(0,256,0,0); gr.addColorStop(0,'rgba(255,190,110,0.42)'); gr.addColorStop(0.55,'rgba(120,150,210,0.10)'); gr.addColorStop(1,'rgba(30,45,80,0)'); g.fillStyle=gr; g.fillRect(0,0,8,256); return c })())
    const washPlane = new THREE.Mesh(new THREE.PlaneGeometry(BW-6, BH-10), new THREE.MeshBasicMaterial({ map: wash, transparent: true, depthWrite: false }))
    washPlane.position.set(0, BH/2+baseY, BD/2+0.6); this.dorm.add(washPlane)

    // roof cap + cornice
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0c1222, roughness: 1 })
    const roof = new THREE.Mesh(new THREE.BoxGeometry(BW + 34, 20, BD + 34), capMat)
    roof.position.y = BH + baseY + 10; this.dorm.add(roof)
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(BW + 16, 8, BD + 16), new THREE.MeshStandardMaterial({ color: 0x232c44, roughness: 1 }))
    cornice.position.y = BH + baseY + 2; this.dorm.add(cornice)
    // rooftop railing
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1b2540, roughness: 1 })
    for (let i = 0; i <= 22; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 20, 1.6), railMat); b.position.set(-BW/2 + i*(BW/22), BH+baseY+30, BD/2 - 4); this.dorm.add(b) }
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(BW, 2.4, 2.4), railMat); railTop.position.set(0, BH+baseY+40, BD/2-4); this.dorm.add(railTop)

    // water tower + antenna, storybook silhouette
    const tower = new THREE.Group()
    for (const [dx,dz] of [[-14,-14],[14,-14],[-14,14],[14,14]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,42,6), railMat); l.position.set(dx,21,dz); tower.add(l) }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(19,19,26,16), new THREE.MeshStandardMaterial({ color:0x151d31, roughness:0.9 })); tank.position.y=54; tower.add(tank)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(21,15,16), railMat); cone.position.y=74; tower.add(cone)
    tower.position.set(-BW/2+66, BH+baseY, -10); this.dorm.add(tower)
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.8,60,4), railMat); ant.position.set(BW/2-50, BH+baseY+60, 0); this.dorm.add(ant)
    const antLight = new THREE.Mesh(new THREE.SphereGeometry(2.2,8,8), new THREE.MeshBasicMaterial({ color:0xff5a5a, toneMapped:false })); antLight.position.set(BW/2-50, BH+baseY+92, 0); this.dorm.add(antLight); this.antLight = antLight

    // windows grid
    const winW = 34, winH = 46
    const gapX = (BW - 50) / COLS, gapY = (BH - 80) / ROWS
    this.windowRefs = []
    const baseX = -BW/2 + gapX/2 + 25, baseY2 = baseY + 42
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0e1424, roughness: 0.8 })
    const sillMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 })
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const x = baseX + c * gapX, y = baseY2 + r * gapY
      const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 7, winH + 7, 4), frameMat)
      frame.position.set(x, y, BD/2 + 1); this.dorm.add(frame)
      // sill + hood
      const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 14, 3.5, 7), sillMat); sill.position.set(x, y - winH/2 - 3, BD/2 + 3); this.dorm.add(sill)
      const hood = new THREE.Mesh(new THREE.BoxGeometry(winW + 10, 3, 6), sillMat); hood.position.set(x, y + winH/2 + 4, BD/2 + 2.5); this.dorm.add(hood)
      const mat = new THREE.MeshBasicMaterial({ map: windowTexture(false, 0xffc06a), color: 0x3a4763, toneMapped: false })
      const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), mat)
      win.position.set(x, y, BD/2 + 4); this.dorm.add(win)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,190,110,1)', 128), color: 0xffc06a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
      glow.scale.setScalar(74); glow.position.set(x, y, BD/2 + 2); this.dorm.add(glow)
      if ((r + c) % 3 === 0 && r > 0) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(15, 9, 8), new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 }))
        ac.position.set(x + winW/2 + 9, y - winH/2 + 2, BD/2 + 3); this.dorm.add(ac)
      }
      this.windows.push({ idx, r, c, lit: false, litAt: 0, win, glow, mat, litTex: windowTexture(true, 0xffc06a, idx), unlitTex: windowTexture(false, 0xffc06a), pulse: 0, world: new THREE.Vector3() })
    }
    // ground floor: entrance, canopy, small shop sign
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x101728, roughness: 1 })
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(58, 70, 6), doorMat); entrance.position.set(-BW*0.18, baseY + 34, BD/2 + 2); this.dorm.add(entrance)
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(50, 62), new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0, toneMapped: false }))
    this.doorGlow.position.set(-BW*0.18, baseY + 34, BD/2 + 3.2); this.dorm.add(this.doorGlow)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(74, 4, 26), sillMat); canopy.position.set(-BW*0.18, baseY + 74, BD/2 + 10); this.dorm.add(canopy)
    // ground-floor shops with warm strip
    const shopMat = new THREE.MeshBasicMaterial({ color: 0xffb45e, toneMapped: false, transparent: true, opacity: 0.85 })
    for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(56, 26), shopMat); w.position.set(BW*0.14 + i*72, baseY + 26, BD/2 + 3); this.dorm.add(w) }
    this.doorLight = new THREE.PointLight(0xffc46a, 0, 240, 2); this.doorLight.position.set(0, baseY + 40, BD/2 + 34); this.dorm.add(this.doorLight)

    // steps
    for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(90 - i*6, 5, 24 - i*6), sillMat); st.position.set(-BW*0.18, baseY - 26 + i*5, BD/2 + 20 - i*8); this.dorm.add(st) }
  }

  _buildTrees() {
    this.trees = []
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x120f1a, roughness: 1 })
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x16233b, roughness: 1, flatShading: true })
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x1d3050, roughness: 1, flatShading: true })
    const spots = [[-330, -60], [340, -40], [-300, 60], [320, 80], [-430, -160], [440, -140]]
    for (const [x, z] of spots) {
      const g = new THREE.Group()
      const h = 120 + Math.random() * 90
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, h, 6), trunkMat); trunk.position.y = h / 2 - 210; g.add(trunk)
      for (let i = 0; i < 4; i++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(38 + Math.random() * 26, 1), i % 2 ? leafMat : leafMat2)
        blob.position.set((Math.random() - 0.5) * 50, h - 210 + i * 18, (Math.random() - 0.5) * 30)
        blob.scale.y = 0.8; g.add(blob)
      }
      g.position.set(x, 0, z); this.scene.add(g); this.trees.push(g)
    }
  }

  _buildFireflies() {
    const N = 40
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3), phase = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 900
      pos[i * 3 + 1] = -180 + Math.random() * 260
      pos[i * 3 + 2] = 160 + Math.random() * 260
      phase[i] = Math.random() * Math.PI * 2
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
    this.fireflyMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xffd98a) }, size: { value: 13 } },
      vertexShader: `attribute float phase; uniform float time; uniform float size; varying float a;
        void main(){ vec3 p=position; p.x+=sin(time*0.6+phase)*20.0; p.y+=cos(time*0.5+phase*1.3)*16.0; p.z+=sin(time*0.4+phase)*15.0;
        a=0.35+0.65*pow(0.5+0.5*sin(time*2.0+phase),2.0); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=size*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 color; varying float a; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(color, a*(1.0-d*2.0)); }`
    })
    this.fireflies = new THREE.Points(geo, this.fireflyMat); this.scene.add(this.fireflies)
  }

  _buildParticles() {
    this.particleGroup = new THREE.Group(); this.scene.add(this.particleGroup)
    this.dropCount = 0
    const mk = (n, size) => {
      const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 900; pos[i * 3 + 1] = Math.random() * 500 - 100; pos[i * 3 + 2] = 50 + Math.random() * 500 }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return new THREE.Points(geo, new THREE.PointsMaterial({ size, map: softDot('rgba(255,235,200,1)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0b0, opacity: 0 }))
    }
    this.snow = mk(700, 5); this.snow.visible = false; this.particleGroup.add(this.snow)
    this.rain = mk(1200, 3); this.rain.visible = false; this.particleGroup.add(this.rain)
  }

  _buildLights() {
    this.amb = new THREE.AmbientLight(0x5a6d9a, 0.85); this.scene.add(this.amb)
    this.hemi = new THREE.HemisphereLight(0x9fb8e8, 0x22304f, 1.15); this.scene.add(this.hemi)
    this.fillLight = new THREE.DirectionalLight(0xaec2ff, 0.7); this.fillLight.position.set(-200, 220, 500); this.scene.add(this.fillLight)
    this.moonLight = new THREE.DirectionalLight(0xbfd2ff, 1.1); this.moonLight.position.set(300, 400, -600); this.scene.add(this.moonLight)
    this.rimLight = new THREE.DirectionalLight(0x6a86c4, 0.5); this.rimLight.position.set(-300, 100, 300); this.scene.add(this.rimLight)
    this.warmLight = new THREE.PointLight(0xffb060, 0, 600, 2); this.warmLight.position.set(0, 60, 200); this.scene.add(this.warmLight)
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.9)
    this.composer.addPass(this.bloom)
    this.painterly = createPainterlyPass()
    this.composer.addPass(this.painterly)
    this.composer.addPass(new OutputPass())
  }

  applyTheme(name, instant = false) {
    if (!PALETTES[name]) name = 'warm_blue'
    this.theme = name
    const p = PALETTES[name]
    this._target = p
    const top = new THREE.Color(p.sky[0]), mid = new THREE.Color(p.sky[1]), bot = new THREE.Color(p.sky[2])
    if (instant) {
      this.skyMat.uniforms.top.value.copy(top); this.skyMat.uniforms.mid.value.copy(mid); this.skyMat.uniforms.bot.value.copy(bot)
      this.scene.fog.color.set(p.fog); this.moonSprite.material.color.set(p.moon)
      this.fireflyMat.uniforms.color.value.set(p.particle)
      this.groundMat.uniforms.c1.value.set(p.sky[0]).multiplyScalar(0.6)
      this.groundMat.uniforms.c2.value.set(p.fog)
      // recolor window textures
      for (const w of this.windows) { w.litTex = windowTexture(true, p.warm, w.idx); w.mat.map = w.lit ? w.litTex : w.unlitTex; w.mat.needsUpdate = true; w.glow.material.color.set(p.warm) }
      this.doorGlow.material.color.set(p.warm); this.warmLight.color.set(p.warm)
      if (this.painterly) { const tc = new THREE.Color(p.fog); tc.multiplyScalar(1.0); this.painterly.material.uniforms.tint.value.copy(tc) }
    }
    this._skyFrom = { top: this.skyMat.uniforms.top.value.clone(), mid: this.skyMat.uniforms.mid.value.clone(), bot: this.skyMat.uniforms.bot.value.clone(), fog: this.scene.fog.color.clone() }
    this._skyTo = { top, mid, bot, fog: new THREE.Color(p.fog) }
    this._skyT = 0
    // weather particle mode
    this.snow.visible = name === 'foggy_lilac'
    this.rain.visible = name === 'rainy_amber'
  }

  setWeatherFx(weather) {
    this.snow.visible = weather === 'fog' || weather === 'snow'
    this.rain.visible = weather === 'light_rain' || weather === 'rain'
  }

  litWindow(w, animate = true) {
    if (w.lit) return false
    w.lit = true; w.litAt = performance.now()
    w.mat.map = w.litTex; w.mat.needsUpdate = true; w.mat.color.set(0xffffff)
    w.glow.material.opacity = 0.9
    w.pulse = 1
    this._burst(w)
    return true
  }

  _burst(w) {
    const N = 16
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3); const vel = []
    w.win.getWorldPosition(w.world)
    for (let i = 0; i < N; i++) { pos[i * 3] = w.world.x; pos[i * 3 + 1] = w.world.y; pos[i * 3 + 2] = w.world.z + 6; const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 70; vel.push(new THREE.Vector3(Math.cos(a) * s, Math.sin(a) * s, 10 + Math.random() * 40)) }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ size: 7, map: softDot('rgba(255,220,150,1)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: this._target ? this._target.warm : 0xffc06a })
    const pts = new THREE.Points(geo, mat); this.scene.add(pts)
    const start = performance.now()
    const anim = () => {
      const t = (performance.now() - start) / 750
      if (t >= 1) { this.scene.remove(pts); geo.dispose(); mat.dispose(); return }
      const arr = geo.attributes.position.array
      for (let i = 0; i < N; i++) { arr[i * 3] += vel[i].x * 0.016; arr[i * 3 + 1] += vel[i].y * 0.016; vel[i].y -= 2.2; arr[i * 3 + 2] += vel[i].z * 0.016 }
      geo.attributes.position.needsUpdate = true
      mat.opacity = 1 - t; mat.size = 7 * (1 - t * 0.5)
      requestAnimationFrame(anim)
    }
    anim()
  }

  resetWindows() {
    for (const w of this.windows) { w.lit = false; w.mat.map = w.unlitTex; w.mat.color.set(0x4a5878); w.mat.needsUpdate = true; w.glow.material.opacity = 0; w.pulse = 0 }
    this.lit = 0
    this.groundMat.uniforms.glow.value = 0
    this.warmLight.intensity = 0
    this.doorGlow.material.opacity = 0; this.doorLight.intensity = 0
  }

  setLitCount(n) {
    this.lit = n
    const p = this.lit / 24
    this.groundMat.uniforms.glow.value = p
    this.warmLight.intensity = p * 900
    this.warmLight.color.set(this._target ? this._target.warm : 0xffb060)
    this.doorGlow.material.opacity = p * 0.9
    this.doorLight.intensity = p * 120
  }

  _onPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), this.camera)
    const hits = ray.intersectObjects(this.windows.map(w => w.win), false)
    if (hits.length) {
      const win = this.windows.find(w => w.win === hits[0].object)
      if (win && this.onWindowTap) this.onWindowTap(win, e.clientX, e.clientY)
    }
  }

  _resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight
    this.renderer.setSize(w, h); this.composer.setSize(w, h)
    if (this.painterly) { this.painterly.material.uniforms.resolution.value.set(w, h); this.painterly.material.uniforms.paperScale.value = Math.min(2, Math.max(0.7, w/1400)) }
    this.camera.aspect = w / h
    const portrait = w / h < 1
    if (portrait) { this.camera.fov = 56; this.camera.position.set(0, 60, 1080); this.moonGroup.position.set(230, 420, -900) }
    else { this.camera.fov = 38; this.camera.position.set(0, 58, 940) }
    this.camera.updateProjectionMatrix()
    this._lookBase = new THREE.Vector3(0, 12, 0)
    this._lookTarget = this._lookBase.clone()
    this.camera.lookAt(this._lookTarget)
  }

  tick() {
    const t = this.clock.elapsedTime
    const dt = Math.min(this.clock.getDelta(), 0.05)
    // smooth sky transition
    if (this._skyTo && this._skyT < 1) {
      this._skyT = Math.min(1, this._skyT + 0.02)
      const k = this._skyT * this._skyT * (3 - 2 * this._skyT)
      this.skyMat.uniforms.top.value.lerpColors(this._skyFrom.top, this._skyTo.top, k)
      this.skyMat.uniforms.mid.value.lerpColors(this._skyFrom.mid, this._skyTo.mid, k)
      this.skyMat.uniforms.bot.value.lerpColors(this._skyFrom.bot, this._skyTo.bot, k)
      this.scene.fog.color.lerpColors(this._skyFrom.fog, this._skyTo.fog, k)
    }
    this.starMat.uniforms.time.value = t
    this.fireflyMat.uniforms.time.value = t
    // gentle camera drift
    this.camera.position.x = Math.sin(t * 0.18) * 12
    this.camera.position.y = (this.camera.aspect < 1 ? 60 : 58) + Math.sin(t * 0.25) * 5
    this.camera.lookAt(this._lookTarget || this._lookBase)
    // window pulsing
    for (const w of this.windows) {
      if (w.pulse > 0) { w.pulse = Math.max(0, w.pulse - dt * 2.2); const s = 1 + w.pulse * 0.18; w.win.scale.set(s, s, 1) }
      else if (!w.lit) { w.win.scale.set(1, 1, 1) }
      if (w.lit) {
        const fl = 0.75 + Math.sin(t * 3 + w.idx) * 0.12
        w.glow.material.opacity = Math.max(fl, w.pulse * 0.9)
        w.glow.material.rotation = Math.sin(t + w.idx) * 0.1
      } else if (w.pulse > 0) w.glow.material.opacity = Math.max(w.glow.material.opacity, w.pulse * 0.9)
    }
    // moon
    this.moonSprite.material.rotation = 0
    // particles drift
    if (this.snow.visible) { const arr = this.snow.geometry.attributes.position.array; for (let i = 0; i < arr.length; i += 3) { arr[i + 1] -= 0.6 + (i % 7) * 0.05; arr[i] += Math.sin(t + i) * 0.2; if (arr[i + 1] < -180) arr[i + 1] = 420 } this.snow.geometry.attributes.position.needsUpdate = true; this.snow.material.opacity = 0.7 }
    if (this.rain.visible) { const arr = this.rain.geometry.attributes.position.array; for (let i = 0; i < arr.length; i += 3) { arr[i + 1] -= 8; if (arr[i + 1] < -180) arr[i + 1] = 420 } this.rain.geometry.attributes.position.needsUpdate = true; this.rain.material.opacity = 0.5 }
    if (this.painterly) this.painterly.material.uniforms.time.value = t
    this.composer.render()
  }

  // ---------- surprise effects ----------
  shootingStar() {
    const start = performance.now()
    const geo = new THREE.BufferGeometry()
    const pts = 24, arr = new Float32Array(pts * 3)
    const from = new THREE.Vector3(-700, 420, -500), to = new THREE.Vector3(500, 120, -600)
    for (let i = 0; i < pts; i++) { const t = i / pts; arr[i*3] = THREE.MathUtils.lerp(from.x, to.x, t); arr[i*3+1] = THREE.MathUtils.lerp(from.y, to.y, t); arr[i*3+2] = THREE.MathUtils.lerp(from.z, to.z, t) }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const mat = new THREE.PointsMaterial({ size: 10, map: softDot('rgba(255,250,225,1)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff4d0 })
    const line = new THREE.Points(geo, mat); this.scene.add(line)
    const tail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })); this.scene.add(tail)
    const anim = () => {
      const t = (performance.now() - start) / 1400
      if (t >= 1) { this.scene.remove(line); this.scene.remove(tail); geo.dispose(); mat.dispose(); return }
      const p2 = geo.attributes.position.array
      for (let i = 0; i < pts; i++) { const tt = Math.max(0, t - i * 0.012); const v = new THREE.Vector3().lerpVectors(from, to, tt); p2[i*3]=v.x; p2[i*3+1]=v.y; p2[i*3+2]=v.z }
      geo.attributes.position.needsUpdate = true
      mat.opacity = 1 - t * 0.6
      requestAnimationFrame(anim)
    }
    anim()
  }

  releaseLanterns(n = 5) {
    const lanterns = []
    for (let i = 0; i < n; i++) {
      const tex = softDot('rgba(255,170,80,1)', 128)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070 }))
      const sx = (Math.random() - 0.5) * 360, sz = -120 + Math.random() * 260
      sprite.position.set(sx, -180 + Math.random() * 60, sz); sprite.scale.setScalar(34 + Math.random() * 16)
      this.scene.add(sprite)
      lanterns.push({ sprite, speed: 30 + Math.random() * 22, sway: Math.random() * 6, phase: Math.random() * 6 })
    }
    const start = performance.now()
    const anim = () => {
      const t = (performance.now() - start) / 1000
      for (const l of lanterns) { l.sprite.position.y += l.speed * 0.016; l.sprite.position.x += Math.sin(t + l.phase) * 0.4; l.sprite.material.opacity = Math.min(1, l.sprite.position.y / 100) * (1 - Math.max(0, (l.sprite.position.y - 400) / 300)) }
      if (t < 11) requestAnimationFrame(anim); else lanterns.forEach(l => { this.scene.remove(l.sprite); l.sprite.material.dispose() })
    }
    anim()
  }

  rooftopCat() {
    if (this.cat) return
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0b0f1c, roughness: 1 }))
    body.scale.set(1.3, 0.9, 1); g.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(6.5, 12, 10), body.material); head.position.set(9, 6, 0); g.add(head)
    for (const dz of [-3.5, 3.5]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 6), body.material); ear.position.set(10, 11.5, dz); g.add(ear) }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(7, 1.4, 6, 16, Math.PI * 1.2), body.material); tail.position.set(-10, 4, 0); tail.rotation.z = 0.4; g.add(tail)
    for (const dz of [-2.6, 2.6]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe07a, toneMapped: false })); eye.position.set(13.5, 7, dz); g.add(eye) }
    const BW = 460, BH = 330, BD = 130
    g.position.set(-BW/2 + 150, BH - 210 + 44, BD/2 - 20); g.scale.setScalar(1.4)
    this.dorm.add(g); this.cat = g
    const start = performance.now()
    const anim = () => { const t = (performance.now() - start) / 1000; g.rotation.y = Math.sin(t * 0.8) * 0.5; if (t < 5) requestAnimationFrame(anim); else { this.dorm.remove(g); this.cat = null } }
    anim()
  }

  dispose() { this.renderer.setAnimationLoop(null); this.renderer.dispose(); if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement) }
}
