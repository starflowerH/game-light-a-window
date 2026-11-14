import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createPainterlyPass } from './painterly.js'
import { VfxPool } from './vfx-pool.js'
import { COLS, INDEX_TO_ROOM, ROWS, WINDOW_STATES } from '../shared/constants.js'
import { RESIDENT_SILHOUETTES } from './narrative-graph.js'

export const PALETTES = {
  warm_blue:    { sky: [0x0b1533, 0x233f74, 0x6a86c4], moon: 0xfff3d0, warm: 0xffc06a, rim: 0x9fc2ff, fog: 0x1b2b4d, particle: 0xffe6b0 },
  rainy_amber:  { sky: [0x120f1f, 0x3a2a3f, 0x8a5a4a], moon: 0xffd9a0, warm: 0xffab5a, rim: 0xd8a8ff, fog: 0x241b2c, particle: 0xffcf8a },
  foggy_lilac:  { sky: [0x171630, 0x363258, 0x8a86ad], moon: 0xe9e3ff, warm: 0xffc48a, rim: 0xb9a8ff, fog: 0x2a2747, particle: 0xd8ccff },
  clear_peach:  { sky: [0x1a1430, 0x5a3a54, 0xd08a72], moon: 0xfff0c8, warm: 0xffb85e, rim: 0xffc2a0, fog: 0x35284a, particle: 0xffd9a8 },
  dawn_rose:    { sky: [0x2a2b52, 0x7a5a72, 0xf0b98a], moon: 0xfff6e0, warm: 0xffcf8a, rim: 0xffd9c0, fog: 0x6a5468, particle: 0xffe2b8 }
}

const hex = n => '#' + n.toString(16).padStart(6, '0')

// Building proportions, kept from v2 so every tuned camera value still frames.
const BW = 460
const BH = 330
const BD = 130
const BASE_Y = -210

// ---------------------------------------------------------------- textures

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

/**
 * Hand-painted rotating brush halo for the GLIMMER state. Drawn as a broken
 * ring of tapered strokes so it never reads as a UI circle.
 */
function brushHaloTexture() {
  const S = 256
  const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  g.translate(S / 2, S / 2)
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const len = 10 + (i % 5) * 5
    const width = 1.6 + (i % 3) * 1.4
    g.save()
    g.rotate(a)
    g.strokeStyle = 'rgba(255, 214, 150, ' + (0.30 + (i % 4) * 0.13) + ')'
    g.lineWidth = width
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(0, -S * 0.40)
    g.lineTo(0, -S * 0.40 - len)
    g.stroke()
    g.restore()
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A gold wax-seal style badge sprite for the STORY_BEACON state. */
function beaconTexture() {
  const S = 128
  const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,250,226,0.98)')
  grad.addColorStop(0.35, 'rgba(255,208,130,0.85)')
  grad.addColorStop(1, 'rgba(255,180,90,0)')
  g.fillStyle = grad; g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(92,52,16,0.92)'
  g.lineWidth = 4
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(S * 0.30, S * 0.40); g.lineTo(S * 0.50, S * 0.55); g.lineTo(S * 0.70, S * 0.40)
  g.stroke()
  roundedRect(g, S * 0.28, S * 0.33, S * 0.44, S * 0.32, 5)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Draw the resident's room in a small ink-and-gouache vocabulary. */
function drawSilhouette(g, S, kind, variant) {
  const ink = 'rgba(74,36,12,0.60)'
  const soft = 'rgba(96,52,20,0.34)'
  g.save()
  g.fillStyle = ink
  g.strokeStyle = ink
  g.lineCap = 'round'
  g.lineJoin = 'round'

  if (kind === 'duty') {
    g.fillRect(S * 0.24, S * 0.52, S * 0.18, S * 0.16)
    g.beginPath(); g.arc(S * 0.44, S * 0.60, S * 0.05, -Math.PI / 2, Math.PI / 2); g.lineWidth = S * 0.02; g.stroke()
    g.lineWidth = S * 0.012
    g.beginPath(); g.moveTo(S * 0.70, S * 0.30); g.lineTo(S * 0.70, S * 0.48); g.stroke()
    g.beginPath(); g.arc(S * 0.70, S * 0.54, S * 0.05, 0, 7); g.stroke()
    g.globalAlpha = 0.5
    g.beginPath(); g.arc(S * 0.56, S * 0.44, S * 0.07, 0.2, Math.PI - 0.2); g.stroke()
    g.beginPath(); g.arc(S * 0.72, S * 0.44, S * 0.07, 0.2, Math.PI - 0.2); g.stroke()
    g.globalAlpha = 0.3
    for (let i = 0; i < 3; i++) {
      g.beginPath()
      g.moveTo(S * (0.28 + i * 0.05), S * 0.50)
      g.quadraticCurveTo(S * (0.22 + i * 0.05), S * 0.42, S * (0.30 + i * 0.05), S * 0.34)
      g.lineWidth = S * 0.012; g.stroke()
    }
    g.globalAlpha = 1
  } else if (kind === 'easel') {
    g.lineWidth = S * 0.022
    g.beginPath(); g.moveTo(S * 0.38, S * 0.78); g.lineTo(S * 0.50, S * 0.40); g.lineTo(S * 0.62, S * 0.78); g.stroke()
    g.fillStyle = soft
    g.fillRect(S * 0.36, S * 0.44, S * 0.30, S * 0.22)
    g.fillStyle = ink
    g.fillRect(S * 0.36, S * 0.44, S * 0.30, S * 0.015)
    g.fillRect(S * 0.16, S * 0.72, S * 0.14, S * 0.06)
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42
      g.beginPath()
      g.ellipse(S * 0.23 + Math.cos(a) * S * 0.08, S * 0.70 + Math.sin(a) * S * 0.08, S * 0.055, S * 0.026, a, 0, 7)
      g.fill()
    }
  } else if (kind === 'mic') {
    g.fillRect(S * 0.44, S * 0.26, S * 0.10, S * 0.22)
    g.beginPath(); g.arc(S * 0.49, S * 0.26, S * 0.05, Math.PI, 0); g.fill()
    g.lineWidth = S * 0.016
    g.beginPath(); g.moveTo(S * 0.49, S * 0.48); g.lineTo(S * 0.49, S * 0.62); g.stroke()
    g.beginPath(); g.moveTo(S * 0.38, S * 0.66); g.lineTo(S * 0.60, S * 0.66); g.stroke()
    g.lineWidth = S * 0.018
    g.beginPath(); g.arc(S * 0.74, S * 0.60, S * 0.09, Math.PI * 0.85, Math.PI * 2.15); g.stroke()
    g.fillRect(S * 0.70, S * 0.60, S * 0.05, S * 0.09)
    g.fillRect(S * 0.79, S * 0.60, S * 0.05, S * 0.09)
  } else if (kind === 'hotpot') {
    g.fillRect(S * 0.30, S * 0.56, S * 0.34, S * 0.16)
    g.fillRect(S * 0.34, S * 0.72, S * 0.04, S * 0.06)
    g.fillRect(S * 0.56, S * 0.72, S * 0.04, S * 0.06)
    g.lineWidth = S * 0.012
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(S * (0.36 + i * 0.09), S * 0.52); g.lineTo(S * (0.38 + i * 0.09), S * 0.42); g.stroke()
    }
    g.globalAlpha = 0.30
    for (let i = 0; i < 4; i++) {
      g.beginPath()
      g.moveTo(S * (0.26 + i * 0.13), S * 0.50)
      g.quadraticCurveTo(S * (0.20 + i * 0.13), S * 0.38, S * (0.30 + i * 0.13), S * 0.28)
      g.lineWidth = S * 0.014; g.stroke()
    }
    g.globalAlpha = 1
  } else if (kind === 'books') {
    for (let r = 0; r < 3; r++) {
      g.fillRect(S * 0.22, S * (0.44 + r * 0.13), S * 0.40, S * 0.022)
      for (let b = 0; b < 5; b++) {
        if ((b + r) % 3 === 0) continue
        g.fillRect(S * (0.24 + b * 0.075), S * (0.38 + r * 0.13), S * 0.048, S * 0.055)
      }
    }
    g.beginPath(); g.ellipse(S * 0.76, S * 0.66, S * 0.11, S * 0.06, 0, 0, 7); g.fill()
    g.beginPath(); g.arc(S * 0.86, S * 0.60, S * 0.05, 0, 7); g.fill()
    g.beginPath(); g.moveTo(S * 0.82, S * 0.56); g.lineTo(S * 0.83, S * 0.50); g.lineTo(S * 0.85, S * 0.55); g.fill()
    g.beginPath(); g.moveTo(S * 0.88, S * 0.56); g.lineTo(S * 0.90, S * 0.50); g.lineTo(S * 0.91, S * 0.55); g.fill()
    g.lineWidth = S * 0.022
    g.beginPath(); g.moveTo(S * 0.66, S * 0.66); g.quadraticCurveTo(S * 0.58, S * 0.60, S * 0.62, S * 0.50); g.stroke()
  } else if (kind === 'telescope') {
    g.save()
    g.translate(S * 0.52, S * 0.58)
    g.rotate(-0.6)
    g.fillRect(-S * 0.20, -S * 0.045, S * 0.40, S * 0.09)
    g.fillRect(-S * 0.22, -S * 0.06, S * 0.07, S * 0.12)
    g.restore()
    g.lineWidth = S * 0.018
    g.beginPath(); g.moveTo(S * 0.44, S * 0.64); g.lineTo(S * 0.38, S * 0.84); g.stroke()
    g.beginPath(); g.moveTo(S * 0.56, S * 0.64); g.lineTo(S * 0.62, S * 0.84); g.stroke()
    g.globalAlpha = 0.55
    g.fillRect(S * 0.16, S * 0.74, S * 0.18, S * 0.12)
    g.globalAlpha = 1
  } else {
    const v = variant % 6
    if (v === 0) {
      g.beginPath(); g.arc(S * 0.58, S * 0.42, S * 0.07, 0, 7); g.fill()
      g.beginPath(); g.moveTo(S * 0.48, S * 0.62); g.quadraticCurveTo(S * 0.58, S * 0.46, S * 0.68, S * 0.62); g.lineTo(S * 0.66, S * 0.74); g.lineTo(S * 0.50, S * 0.74); g.fill()
      g.fillRect(S * 0.34, S * 0.66, S * 0.34, S * 0.045)
      g.fillRect(S * 0.34, S * 0.71, S * 0.04, S * 0.1)
      g.fillRect(S * 0.64, S * 0.71, S * 0.04, S * 0.1)
    } else if (v === 1) {
      g.beginPath(); g.moveTo(S * 0.5, S * 0.76); g.lineTo(S * 0.5, S * 0.56); g.lineWidth = S * 0.02; g.stroke()
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.5
        g.beginPath(); g.ellipse(S * 0.5 + Math.cos(a) * S * 0.11, S * 0.56 + Math.sin(a) * S * 0.11, S * 0.08, S * 0.035, a, 0, 7); g.fill()
      }
      g.fillRect(S * 0.42, S * 0.74, S * 0.16, S * 0.08)
    } else if (v === 2) {
      g.beginPath(); g.ellipse(S * 0.55, S * 0.68, S * 0.13, S * 0.07, 0, 0, 7); g.fill()
      g.beginPath(); g.arc(S * 0.66, S * 0.62, S * 0.06, 0, 7); g.fill()
      g.beginPath(); g.moveTo(S * 0.62, S * 0.58); g.lineTo(S * 0.63, S * 0.52); g.lineTo(S * 0.65, S * 0.57); g.fill()
      g.beginPath(); g.moveTo(S * 0.68, S * 0.58); g.lineTo(S * 0.70, S * 0.52); g.lineTo(S * 0.71, S * 0.57); g.fill()
    } else if (v === 3) {
      g.lineWidth = S * 0.012
      g.beginPath(); g.moveTo(0, S * 0.36); g.lineTo(S, S * 0.38); g.stroke()
      for (let i = 0; i < 3; i++) {
        const x = S * (0.22 + i * 0.26)
        g.beginPath(); g.moveTo(x - S * 0.07, S * 0.37); g.lineTo(x + S * 0.07, S * 0.37); g.lineTo(x + S * 0.05, S * 0.52); g.lineTo(x - S * 0.05, S * 0.52); g.fill()
      }
    } else if (v === 4) {
      g.fillRect(S * 0.28, S * 0.38, S * 0.03, S * 0.3)
      g.beginPath(); g.moveTo(S * 0.20, S * 0.38); g.lineTo(S * 0.40, S * 0.38); g.lineTo(S * 0.34, S * 0.28); g.lineTo(S * 0.26, S * 0.28); g.fill()
      g.fillRect(S * 0.56, S * 0.58, S * 0.24, S * 0.16)
      g.fillRect(S * 0.54, S * 0.50, S * 0.06, S * 0.22)
      g.fillRect(S * 0.76, S * 0.50, S * 0.06, S * 0.22)
    } else {
      g.beginPath(); g.arc(S * 0.38, S * 0.46, S * 0.06, 0, 7); g.fill(); g.fillRect(S * 0.31, S * 0.54, S * 0.14, S * 0.16)
      g.beginPath(); g.arc(S * 0.64, S * 0.46, S * 0.06, 0, 7); g.fill(); g.fillRect(S * 0.57, S * 0.54, S * 0.14, S * 0.16)
    }
  }
  g.restore()
}

/**
 * Build one window glass texture for a state.
 * @param {number} S
 * @param {string} state
 * @param {number} warmHex
 * @param {string} silhouette
 * @param {number} variant
 */
function windowTexture(S, state, warmHex, silhouette, variant) {
  const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)

  const isWarm = state !== WINDOW_STATES.DARK
  if (isWarm) {
    const grad = g.createRadialGradient(S * 0.5, S * 0.40, S * 0.04, S * 0.5, S * 0.52, S * 0.78)
    grad.addColorStop(0, '#fffdf2')
    grad.addColorStop(0.30, hex(warmHex))
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)

    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = 'rgba(120,50,10,0.30)'
    g.fillRect(0, 0, S * 0.14, S)
    g.fillRect(S * 0.86, 0, S * 0.14, S)
    drawSilhouette(g, S, silhouette, variant)
    g.fillStyle = 'rgba(0,0,0,0.10)'
    g.fillRect(0, S * 0.74, S, S * 0.26)
    g.globalCompositeOperation = 'source-over'

    if (state === WINDOW_STATES.STORY_BEACON) {
      g.strokeStyle = 'rgba(255,214,150,0.75)'
      g.lineWidth = S * 0.018
      roundedRect(g, S * 0.045, S * 0.045, S * 0.91, S * 0.91, S * 0.10)
      g.stroke()
    } else if (state === WINDOW_STATES.RESONANCE_PAIR) {
      g.strokeStyle = 'rgba(255,210,235,0.65)'
      g.lineWidth = S * 0.014
      g.beginPath()
      g.moveTo(S * 0.22, S * 0.30); g.lineTo(S * 0.50, S * 0.18); g.lineTo(S * 0.78, S * 0.34)
      g.stroke()
      g.beginPath()
      g.moveTo(S * 0.22, S * 0.36); g.lineTo(S * 0.50, S * 0.24); g.lineTo(S * 0.78, S * 0.40)
      g.stroke()
    }
  } else {
    g.fillStyle = 'rgba(11,18,38,0.96)'
    roundedRect(g, 2, 2, S - 4, S - 4, 10)
    g.fill()
    const sheen = g.createLinearGradient(0, 0, S, S * 0.7)
    sheen.addColorStop(0, 'rgba(110,145,205,0.22)')
    sheen.addColorStop(0.55, 'rgba(70,100,160,0.06)')
    sheen.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sheen
    roundedRect(g, 8, 6, S - 16, S * 0.5, 8)
    g.fill()
  }

  g.strokeStyle = isWarm ? 'rgba(90,50,15,0.55)' : 'rgba(120,150,200,0.30)'
  g.lineWidth = S * 0.026
  g.beginPath()
  g.moveTo(S / 2, 0); g.lineTo(S / 2, S)
  g.moveTo(0, S * 0.56); g.lineTo(S, S * 0.56)
  g.stroke()

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function rooftopSvg() {
  const W = 2048, H = 300
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.clearRect(0, 0, W, H)
  let x = 0
  while (x < W) {
    const w = 90 + Math.random() * 190
    const h = 70 + Math.random() * 140
    const base = H - 30
    g.fillStyle = 'rgba(11,17,38,0.9)'
    g.fillRect(x, base - h, w, h)
    const kind = Math.random()
    g.beginPath()
    if (kind < 0.4) { g.moveTo(x - 5, base - h); g.lineTo(x + w * 0.5, base - h - 26 - Math.random() * 18); g.lineTo(x + w + 5, base - h) }
    else if (kind < 0.7) g.rect(x - 5, base - h - 14, w + 10, 14)
    else g.rect(x + w * 0.2, base - h - 20, w * 0.6, 20)
    g.fill()
    for (let ry = 0; ry < h - 20; ry += 16) {
      for (let rx = 8; rx < w - 8; rx += 14) {
        if (Math.random() > 0.62) {
          g.fillStyle = 'rgba(255,205,130,' + (0.25 + Math.random() * 0.4) + ')'
          g.fillRect(x + rx, base - h + 10 + ry, 5, 7)
        }
      }
    }
    if (Math.random() > 0.5) {
      const tx = x + w + 8 + Math.random() * 30
      const th = 40 + Math.random() * 70
      g.fillStyle = 'rgba(12,19,40,0.9)'
      g.fillRect(tx - 2, base - th * 0.5, 4, th * 0.5)
      for (let i = 0; i < 5; i++) {
        g.beginPath()
        g.arc(tx + (Math.random() - 0.5) * th * 0.5, base - th * (0.55 + Math.random() * 0.35), th * (0.16 + Math.random() * 0.12), 0, 7)
        g.fill()
      }
    }
    x += w + 14 + Math.random() * 46
  }
  const gg = g.createLinearGradient(0, H - 70, 0, H)
  gg.addColorStop(0, 'rgba(11,17,38,0)')
  gg.addColorStop(1, 'rgba(11,17,38,0.95)')
  g.fillStyle = gg
  g.fillRect(0, H - 70, W, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// -------------------------------------------------------------------- scene

/**
 * @typedef {{
 *   idx: number, roomId: number, r: number, c: number,
 *   state: string, lit: boolean,
 *   group: THREE.Group, glass: THREE.Mesh, silhouette: THREE.Mesh, backPanel: THREE.Mesh,
 *   frame: THREE.Mesh, glow: THREE.Sprite, halo: THREE.Sprite, beacon: THREE.Sprite,
 *   pulse: number, world: THREE.Vector3, home: { x: number, y: number, z: number },
 *   target: { glow: number, halo: number, beacon: number, scale: number },
 *   cur: { glow: number, halo: number, beacon: number, scale: number },
 *   texKey: string, variant: number, expiresAt?: number
 * }} WindowRecord
 */

export class Scene {
  /**
   * @param {HTMLElement} host
   * @param {{
   *   onWindowTap?: (w: WindowRecord, x: number, y: number) => void,
   *   onPointerDown?: (x: number, y: number) => void,
   *   onPointerMove?: (x: number, y: number, dragging: boolean) => void,
   *   onPointerUp?: (x: number, y: number) => void
   * }} [opts]
   */
  constructor(host, { onWindowTap, onPointerDown, onPointerMove, onPointerUp } = {}) {
    this.host = host
    this.onWindowTap = onWindowTap
    this.onPointerDown = onPointerDown
    this.onPointerMove = onPointerMove
    this.onPointerUp = onPointerUp

    this._t0 = performance.now()
    this._lastNow = this._t0
    /** @type {WindowRecord[]} */
    this.windows = []
    this.theme = 'warm_blue'
    this.lit = 0
    this.paused = false
    this._textures = new Map()
    this._pointer = { x: 0, y: 0, dragging: false }
    this._spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
    this._fovImpulse = 0
    this._dawn = 0
    this._dawnTarget = 0
    this._rain = 0
    this._rainTarget = 0
    this._cutscene = null
    this._resonance = null
    this._harmonyUntil = 0
    this._windStrength = 0
    this._windTarget = 0
    this._windTimeUniform = { value: 0 }
    this._windStrengthUniform = { value: 0 }

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

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.25

    this._haloTex = brushHaloTexture()
    this._beaconTex = beaconTexture()

    this._buildSky()
    this._buildStars()
    this._buildMoon()
    this._buildMountains()
    this._buildGround()
    this._buildDorm()
    this._buildStreetLamp()
    this._buildRooftop()
    this._buildTrees()
    this._buildFireflies()
    this._buildWeather()
    this._buildLights()
    this._buildComposer()

    this.vfx = new VfxPool(this.scene, { max: 1024 })

    this.applyTheme('warm_blue', true)
    this._resize()
    addEventListener('resize', () => this._resize())
    this._onVis = () => {
      if (document.hidden) this.renderer.setAnimationLoop(null)
      else this.renderer.setAnimationLoop(this._boundTick)
    }
    document.addEventListener('visibilitychange', this._onVis)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', e => this._onDown(e))
    el.addEventListener('pointermove', e => this._onMove(e))
    addEventListener('pointerup', e => this._onUp(e))
    addEventListener('pointercancel', e => this._onUp(e))

    this._boundTick = () => this.tick()
    this.renderer.setAnimationLoop(this._boundTick)
  }

  // ------------------------------------------------------------------ build

  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      depthWrite: false, side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;\n' +
        'void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.7)) : mix(mid, bot, clamp(-h*2.2,0.0,1.0)); gl_FragColor = vec4(c,1.0); }'
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), this.skyMat)
    this.scene.add(this.sky)
  }

  _buildStars() {
    const N = 900
    const pos = new Float32Array(N * 3)
    const sizes = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const r = 2200
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(1 - Math.random() * 0.75)
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
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xdfe8ff) }, opacity: { value: 1 } },
      vertexShader: 'attribute float size; uniform float time; varying float a; void main(){ a = 0.5+0.5*sin(time*2.0 + position.x*0.05); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float a; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(color, a*opacity*(1.0-d*2.0)); }'
    })
    this.stars = new THREE.Points(geo, this.starMat)
    this.scene.add(this.stars)
  }

  _buildMoon() {
    this.moonGroup = new THREE.Group()
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,244,214,1)', 256), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff3d0 }))
    this.moonSprite.scale.setScalar(150)
    this.moonGroup.add(this.moonSprite)
    const crisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,250,232,1)', 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    crisp.scale.setScalar(66)
    crisp.position.z = 2
    this.moonGroup.add(crisp)
    this.moonGroup.position.set(430, 340, -900)
    this.scene.add(this.moonGroup)
  }

  _buildMountains() {
    const make = (color, y, z, scale) => {
      const seg = 90
      const W = 2600
      const pos = [-W, -200, 0]
      for (let i = 0; i <= seg; i++) {
        const x = -W + (i / seg) * W * 2
        const h = 40 + Math.sin(i * 0.22) * 22 + Math.sin(i * 0.08) * 40 + Math.sin(i * 0.5) * 8
        pos.push(x, h, 0)
      }
      pos.push(W, -200, 0)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false }))
      m.position.set(0, y, z)
      m.scale.set(scale, scale, 1)
      this.scene.add(m)
      return m
    }
    this.mtnFar = make(0x1a2547, -120, -1500, 1.4)
    this.mtnMid = make(0x121a33, -130, -1100, 1.0)
    this.farTown = new THREE.Mesh(
      new THREE.PlaneGeometry(3600, 300),
      new THREE.MeshBasicMaterial({ map: rooftopSvg(), transparent: true, depthWrite: false, opacity: 0.95 })
    )
    this.farTown.position.set(0, -90, -760)
    this.scene.add(this.farTown)
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(4000, 2400, 1, 1)
    this.groundMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { c1: { value: new THREE.Color(0x0d1630) }, c2: { value: new THREE.Color(0x2b3a5e) }, glow: { value: 0 }, wet: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform vec3 c1; uniform vec3 c2; uniform float glow; uniform float wet;\n' +
        'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }\n' +
        'void main(){\n' +
        '  vec2 uv = vUv;\n' +
        '  vec3 c = mix(c1, c2, smoothstep(0.0, 0.6, uv.y));\n' +
        '  float band = smoothstep(0.06, 0.0, abs(uv.y - 0.12)) * 0.6 * glow;\n' +
        '  c += vec3(1.0, 0.78, 0.45) * band;\n' +
        '  c += vec3(0.05, 0.08, 0.14) * hash(floor(uv * vec2(300.0, 120.0))) * 0.045;\n' +
        '  float ripple = sin(uv.y * 220.0 + uv.x * 40.0) * 0.5 + 0.5;\n' +
        '  c += vec3(0.35, 0.42, 0.55) * ripple * wet * 0.04 * glow;\n' +
        '  gl_FragColor = vec4(c, 1.0);\n' +
        '}'
    })
    this.ground = new THREE.Mesh(geo, this.groundMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.set(0, -220, -120)
    this.scene.add(this.ground)
  }

  _buildDorm() {
    this.dorm = new THREE.Group()
    this.scene.add(this.dorm)

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39466a, roughness: 0.88, metalness: 0.05 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), bodyMat)
    body.position.y = BH / 2 + BASE_Y
    this.dorm.add(body)

    const washCanvas = document.createElement('canvas')
    washCanvas.width = 8
    washCanvas.height = 256
    const wg = washCanvas.getContext('2d')
    const gr = wg.createLinearGradient(0, 256, 0, 0)
    gr.addColorStop(0, 'rgba(255,190,110,0.42)')
    gr.addColorStop(0.55, 'rgba(120,150,210,0.10)')
    gr.addColorStop(1, 'rgba(30,45,80,0)')
    wg.fillStyle = gr
    wg.fillRect(0, 0, 8, 256)
    const washTex = new THREE.CanvasTexture(washCanvas)
    washTex.colorSpace = THREE.SRGBColorSpace
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(BW - 14, BH - 14), new THREE.MeshBasicMaterial({ map: washTex, transparent: true, depthWrite: false }))
    wash.position.set(0, BH / 2 + BASE_Y, BD / 2 + 0.6)
    this.dorm.add(wash)

    const capMat = new THREE.MeshStandardMaterial({ color: 0x0c1222, roughness: 1 })
    const roof = new THREE.Mesh(new THREE.BoxGeometry(BW + 34, 20, BD + 34), capMat)
    roof.position.y = BH + BASE_Y + 10
    this.dorm.add(roof)
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(BW + 16, 8, BD + 16), new THREE.MeshStandardMaterial({ color: 0x232c44, roughness: 1 }))
    cornice.position.y = BH + BASE_Y + 2
    this.dorm.add(cornice)

    const railMat = new THREE.MeshStandardMaterial({ color: 0x1b2540, roughness: 1 })
    for (let i = 0; i <= 22; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 20, 1.6), railMat)
      b.position.set(-BW / 2 + i * (BW / 22), BH + BASE_Y + 30, BD / 2 - 4)
      this.dorm.add(b)
    }
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(BW, 2.4, 2.4), railMat)
    railTop.position.set(0, BH + BASE_Y + 40, BD / 2 - 4)
    this.dorm.add(railTop)

    this._buildWindows()

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x101728, roughness: 1 })
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(58, 70, 6), doorMat)
    entrance.position.set(-BW * 0.18, BASE_Y + 34, BD / 2 + 2)
    this.dorm.add(entrance)

    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(50, 62), new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0, toneMapped: false }))
    this.doorGlow.position.set(-BW * 0.18, BASE_Y + 34, BD / 2 + 3.2)
    this.dorm.add(this.doorGlow)

    const sillMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 })
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(74, 4, 26), sillMat)
    canopy.position.set(-BW * 0.18, BASE_Y + 74, BD / 2 + 10)
    this.dorm.add(canopy)

    const boardCanvas = document.createElement('canvas')
    boardCanvas.width = 128
    boardCanvas.height = 96
    const bg2 = boardCanvas.getContext('2d')
    bg2.fillStyle = 'rgba(22,38,32,0.95)'
    bg2.fillRect(0, 0, 128, 96)
    bg2.strokeStyle = 'rgba(255,220,160,0.75)'
    bg2.lineWidth = 3
    bg2.strokeRect(6, 6, 116, 84)
    bg2.fillStyle = 'rgba(255,238,206,0.9)'
    bg2.fillRect(22, 28, 84, 4)
    bg2.fillRect(22, 44, 60, 4)
    bg2.fillRect(22, 60, 72, 4)
    const boardTex = new THREE.CanvasTexture(boardCanvas)
    boardTex.colorSpace = THREE.SRGBColorSpace
    const board = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }))
    board.position.set(-BW * 0.18 + 50, BASE_Y + 52, BD / 2 + 3.4)
    this.dorm.add(board)

    const bikeMat = new THREE.MeshStandardMaterial({ color: 0x101a2e, roughness: 1 })
    for (const [bx, bz] of [[BW * 0.06, BD / 2 + 8], [BW * 0.12, BD / 2 + 12]]) {
      const wheelGeo = new THREE.TorusGeometry(7, 0.9, 6, 18)
      for (const dx of [-9, 9]) {
        const wheel = new THREE.Mesh(wheelGeo, bikeMat)
        wheel.position.set(bx + dx, BASE_Y + 8, bz)
        this.dorm.add(wheel)
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 1.2), bikeMat)
      bar.position.set(bx, BASE_Y + 14, bz)
      this.dorm.add(bar)
      const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 2.4), bikeMat)
      seat.position.set(bx - 6, BASE_Y + 19, bz)
      this.dorm.add(seat)
    }

    const potMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1 })
    for (const [px, pz] of [[-BW * 0.30, BD / 2 + 6], [BW * 0.26, BD / 2 + 5], [BW * 0.33, BD / 2 + 9]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(4, 3, 7, 8), potMat)
      pot.position.set(px, BASE_Y + 3, pz)
      this.dorm.add(pot)
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 0), new THREE.MeshStandardMaterial({ color: 0x1b3340, roughness: 1, flatShading: true }))
      bush.position.set(px, BASE_Y + 11, pz)
      this.dorm.add(bush)
    }

    this.doorLight = new THREE.PointLight(0xffc46a, 0, 240, 2)
    this.doorLight.position.set(0, BASE_Y + 40, BD / 2 + 34)
    this.dorm.add(this.doorLight)

    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(90 - i * 6, 5, 24 - i * 6), sillMat)
      st.position.set(-BW * 0.18, BASE_Y - 26 + i * 5, BD / 2 + 20 - i * 8)
      this.dorm.add(st)
    }
  }

  _buildWindows() {
    const winW = 34
    const winH = 46
    const gapX = (BW - 50) / COLS
    const gapY = (BH - 80) / ROWS
    const baseX = -BW / 2 + gapX / 2 + 25
    const baseY = BASE_Y + 42

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0e1424, roughness: 0.8 })
    const sillMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 })

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c
        const roomId = INDEX_TO_ROOM[idx]
        const x = baseX + c * gapX
        const y = baseY + r * gapY

        const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 7, winH + 7, 4), frameMat)
        frame.position.set(x, y, BD / 2 + 1)
        this.dorm.add(frame)

        const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 14, 3.5, 7), sillMat)
        sill.position.set(x, y - winH / 2 - 3, BD / 2 + 3)
        this.dorm.add(sill)
        const hood = new THREE.Mesh(new THREE.BoxGeometry(winW + 10, 3, 6), sillMat)
        hood.position.set(x, y + winH / 2 + 4, BD / 2 + 2.5)
        this.dorm.add(hood)

        // Three-layer parallax box: back panel, silhouette, outer glass.
        const group = new THREE.Group()
        group.position.set(x, y, BD / 2)
        this.dorm.add(group)

        const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ color: 0x1a1526, toneMapped: false }))
        backPanel.position.z = -1.5
        group.add(backPanel)

        const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(winW * 0.94, winH * 0.94), new THREE.MeshBasicMaterial({ color: 0x120e18, transparent: true, opacity: 0.92, depthWrite: false }))
        silhouette.position.z = 1.5
        group.add(silhouette)

        const glassMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true })
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat)
        glass.position.z = 4.5
        glass.userData.idx = idx
        group.add(glass)

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softDot('rgba(255,190,110,1)', 128),
          color: 0xffc06a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
        }))
        glow.scale.setScalar(54)
        glow.position.set(x, y, BD / 2 + 2)
        this.dorm.add(glow)

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._haloTex, color: 0xffd08a, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0
        }))
        halo.scale.setScalar(78)
        halo.position.set(x, y, BD / 2 + 6)
        this.dorm.add(halo)

        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._beaconTex, color: 0xffe0a0, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0
        }))
        beacon.scale.setScalar(22)
        beacon.position.set(x, y + winH / 2 + 12, BD / 2 + 8)
        this.dorm.add(beacon)

        if ((r + c) % 3 === 0 && r > 0) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(15, 9, 8), new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 }))
          ac.position.set(x + winW / 2 + 9, y - winH / 2 + 2, BD / 2 + 3)
          this.dorm.add(ac)
        }

        /** @type {WindowRecord} */
        const record = {
          idx, roomId, r, c,
          state: WINDOW_STATES.DARK,
          lit: false,
          group, glass, silhouette, backPanel, frame,
          glow, halo, beacon,
          pulse: 0,
          world: new THREE.Vector3(),
          home: { x, y, z: BD / 2 },
          target: { glow: 0, halo: 0, beacon: 0, scale: 1 },
          cur: { glow: 0, halo: 0, beacon: 0, scale: 1 },
          texKey: '',
          variant: idx % 6
        }
        this.windows.push(record)
        this._paintWindow(record)
      }
    }
  }

  _buildStreetLamp() {
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x0f1622, roughness: 0.85, metalness: 0.2 })
    const g = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 160, 8), lampMat)
    post.position.y = -60
    g.add(post)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 26, 6), lampMat)
    arm.rotation.z = Math.PI / 2
    arm.position.set(13, -60, 0)
    g.add(arm)
    const head = new THREE.Mesh(new THREE.ConeGeometry(9, 8, 10), lampMat)
    head.position.set(26, -68, 0)
    g.add(head)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0ae, toneMapped: false }))
    bulb.position.set(26, -73, 0)
    g.add(bulb)
    g.position.set(-230, 0, 110)
    this.dorm.add(g)

    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffca86) }, uIntensity: { value: 0.34 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);\n' +
        '  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);\n' +
        '  gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'uniform vec3 uColor; uniform float uIntensity; uniform float uTime;\n' +
        'void main(){\n' +
        '  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);\n' +
        '  float fall = pow(clamp(vUv.y, 0.0, 1.0), 1.5);\n' +
        '  float flick = 0.94 + 0.06 * sin(uTime * 3.1 + vUv.y * 9.0);\n' +
        '  gl_FragColor = vec4(uColor, uIntensity * fres * fall * flick);\n' +
        '}'
    })
    this.lampCone = new THREE.Mesh(new THREE.ConeGeometry(65, 160, 24, 1, true), coneMat)
    this.lampCone.position.set(-204, -153, 110)
    this.dorm.add(this.lampCone)
    this.lampConeMat = coneMat

    this.lampLight = new THREE.PointLight(0xffc27a, 120, 420, 2)
    this.lampLight.position.set(-204, -78, 128)
    this.dorm.add(this.lampLight)

    const N = 8
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    this.mothMat = new THREE.PointsMaterial({ size: 3.2, map: softDot('rgba(255,226,168,1)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0a8, opacity: 0.85 })
    this.moths = new THREE.Points(geo, this.mothMat)
    this.moths.position.set(-204, -120, 120)
    this.dorm.add(this.moths)
  }

  _buildRooftop() {
    const railMat = new THREE.MeshStandardMaterial({ color: 0x151d31, roughness: 0.9 })
    const theatre = new THREE.Group()
    theatre.position.set(0, BH + BASE_Y, 0)
    this.dorm.add(theatre)
    this.roofTheatre = theatre

    for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 42, 6), railMat)
      leg.position.set(dx - BW / 2 + 66, 21, dz - 10)
      theatre.add(leg)
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 26, 16), new THREE.MeshStandardMaterial({ color: 0x151d31, roughness: 0.9 }))
    tank.position.set(-BW / 2 + 66, 54, -10)
    theatre.add(tank)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(21, 15, 16), railMat)
    cone.position.set(-BW / 2 + 66, 74, -10)
    theatre.add(cone)

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-BW / 2 + 110, 26, -40),
      new THREE.Vector3(BW / 2 - 110, 24, -46)
    ])
    theatre.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x2a3350 })))

    this.sheetMat = new THREE.MeshStandardMaterial({ color: 0xb9c2d8, roughness: 1, side: THREE.DoubleSide })
    this.sheetMat.onBeforeCompile = shader => {
      shader.uniforms.uWindTime = this._windTimeUniform
      shader.uniforms.uWindStrength = this._windStrengthUniform
      shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'float edgeW = clamp(abs(uv.y - 0.5) * 2.0, 0.0, 1.0);\n' +
        'transformed.z += sin(uWindTime * 1.7 + uv.x * 6.0) * uWindStrength * 0.9 * edgeW;\n' +
        'transformed.y += sin(uWindTime * 1.3 + uv.x * 4.0) * uWindStrength * 0.3 * edgeW;\n')
    }
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(34, 26, 10, 6), this.sheetMat)
    sheet.position.set(-BW / 2 + 190, 6, -40)
    theatre.add(sheet)
    this.sheet = sheet

    const teleMat = new THREE.MeshStandardMaterial({ color: 0x2b2418, roughness: 0.7, metalness: 0.35 })
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 34, 10), teleMat)
    tube.rotation.set(-1.05, 0.4, 0)
    tube.position.set(52, 15, 12)
    theatre.add(tube)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 20, 5), teleMat)
      leg.position.set(52 + Math.cos(a) * 5, 6, 12 + Math.sin(a) * 5)
      leg.rotation.set(Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22)
      theatre.add(leg)
    }

    const catMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1c, roughness: 1 })
    const cat = new THREE.Group()
    const catBody = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 10), catMat)
    catBody.scale.set(1.3, 0.9, 1)
    cat.add(catBody)
    const catHead = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 10), catMat)
    catHead.position.set(4.6, 3, 0)
    cat.add(catHead)
    for (const dz of [-1.8, 1.8]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 6), catMat)
      ear.position.set(5.2, 6, dz)
      cat.add(ear)
    }
    const catTail = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.7, 6, 14, Math.PI * 1.2), catMat)
    catTail.position.set(-5, 2, 0)
    catTail.rotation.z = 0.4
    cat.add(catTail)
    cat.position.set(-BW / 2 + 66, 90, -10)
    theatre.add(cat)
    this.roofCat = cat

    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 60, 4), railMat)
    ant.position.set(BW / 2 - 50, 30, 0)
    theatre.add(ant)
    this.antLight = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a5a, toneMapped: false }))
    this.antLight.position.set(BW / 2 - 50, 62, 0)
    theatre.add(this.antLight)
  }

  _buildTrees() {
    this.trees = []
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x120f1a, roughness: 1 })
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x16233b, roughness: 1, flatShading: true })
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x1d3050, roughness: 1, flatShading: true })

    for (const mat of [leafMat, leafMat2, trunkMat]) {
      mat.onBeforeCompile = shader => {
        shader.uniforms.uWindTime = this._windTimeUniform
        shader.uniforms.uWindStrength = this._windStrengthUniform
        shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          'vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;\n' +
          'float lift = clamp((wPos.y + 210.0) / 220.0, 0.0, 1.0);\n' +
          'float sway = sin(uWindTime * 1.55 + wPos.x * 0.04 + wPos.y * 0.08);\n' +
          'transformed.x += sway * uWindStrength * lift;\n' +
          'transformed.z += cos(uWindTime * 1.1 + wPos.x * 0.03) * uWindStrength * 0.35 * lift;\n')
      }
    }

    const spots = [[-330, -60], [340, -40], [-300, 60], [320, 80], [-430, -160], [440, -140]]
    for (const [x, z] of spots) {
      const g = new THREE.Group()
      const h = 120 + Math.random() * 90
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, h, 6), trunkMat)
      trunk.position.y = h / 2 - 210
      g.add(trunk)
      for (let i = 0; i < 4; i++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(38 + Math.random() * 26, 1), i % 2 ? leafMat : leafMat2)
        blob.position.set((Math.random() - 0.5) * 50, h - 210 + i * 18, (Math.random() - 0.5) * 30)
        blob.scale.y = 0.8
        g.add(blob)
      }
      g.position.set(x, 0, z)
      this.scene.add(g)
      this.trees.push(g)
    }
  }

  _buildFireflies() {
    const N = 40
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
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
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xffd98a) }, size: { value: 13 }, opacity: { value: 0.85 } },
      vertexShader: 'attribute float phase; uniform float time; uniform float size; varying float a;\n' +
        'void main(){ vec3 p=position; p.x+=sin(time*0.6+phase)*20.0; p.y+=cos(time*0.5+phase*1.3)*16.0; p.z+=sin(time*0.4+phase)*15.0;\n' +
        'a=0.35+0.65*pow(0.5+0.5*sin(time*2.0+phase),2.0); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=size*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float a; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(color, a*opacity*(1.0-d*2.0)); }'
    })
    this.fireflies = new THREE.Points(geo, this.fireflyMat)
    this.scene.add(this.fireflies)
  }

  _buildWeather() {
    this.weatherGroup = new THREE.Group()
    this.scene.add(this.weatherGroup)
    const mk = (n, size, color) => {
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 900
        pos[i * 3 + 1] = Math.random() * 500 - 100
        pos[i * 3 + 2] = 50 + Math.random() * 500
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return new THREE.Points(geo, new THREE.PointsMaterial({ size, map: softDot(color, 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
    }
    this.snow = mk(700, 5, 'rgba(222,226,255,1)')
    this.snow.visible = false
    this.weatherGroup.add(this.snow)
    this.rain = mk(1200, 3, 'rgba(198,220,255,1)')
    this.rain.visible = false
    this.weatherGroup.add(this.rain)
  }

  _buildLights() {
    this.amb = new THREE.AmbientLight(0x5a6d9a, 0.85)
    this.scene.add(this.amb)
    this.hemi = new THREE.HemisphereLight(0x9fb8e8, 0x22304f, 1.15)
    this.scene.add(this.hemi)
    this.fillLight = new THREE.DirectionalLight(0xaec2ff, 0.7)
    this.fillLight.position.set(-200, 220, 500)
    this.scene.add(this.fillLight)
    this.moonLight = new THREE.DirectionalLight(0xbfd2ff, 1.1)
    this.moonLight.position.set(300, 400, -600)
    this.scene.add(this.moonLight)
    this.rimLight = new THREE.DirectionalLight(0x6a86c4, 0.5)
    this.rimLight.position.set(-300, 100, 300)
    this.scene.add(this.rimLight)
    this.warmLight = new THREE.PointLight(0xffb060, 0, 600, 2)
    this.warmLight.position.set(0, 60, 200)
    this.scene.add(this.warmLight)
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

  // ---------------------------------------------------------------- windows

  /**
   * Repaint one window's three layers for its current state.
   * @param {WindowRecord} w
   */
  _paintWindow(w) {
    const warm = this._target ? this._target.warm : 0xffc06a
    const sil = RESIDENT_SILHOUETTES[w.roomId] || ['person', 'plant', 'cat', 'laundry', 'lamp', 'shelf', 'chat'][w.variant % 7]
    const key = w.state + '|' + warm + '|' + sil + '|' + w.variant
    if (w.texKey === key) return
    let tex = this._textures.get(key)
    if (!tex) {
      tex = windowTexture(192, w.state, warm, sil, w.variant)
      this._textures.set(key, tex)
      // Guard the cache so a long replay session cannot grow it forever.
      if (this._textures.size > 240) {
        const oldest = this._textures.keys().next().value
        const dead = this._textures.get(oldest)
        this._textures.delete(oldest)
        if (dead && dead.dispose) dead.dispose()
      }
    }
    w.texKey = key
    // Mesh.material is typed as Material | Material[]; these windows always use
    // a single MeshBasicMaterial, so narrow it once here.
    const glassMat = /** @type {THREE.MeshBasicMaterial} */ (w.glass.material)
    glassMat.map = tex
    glassMat.needsUpdate = true

    const lit = w.state !== WINDOW_STATES.DARK
    glassMat.color.set(lit ? 0xffffff : 0x8fb0e0)
    // The middle layer is a dark ink silhouette standing in front of the warm
    // back panel, which is what gives the interior its fake depth.
    const silMat = /** @type {THREE.MeshBasicMaterial} */ (w.silhouette.material)
    const backMat = /** @type {THREE.MeshBasicMaterial} */ (w.backPanel.material)
    w.silhouette.visible = lit
    silMat.color.set(lit ? 0x2a1408 : 0x120e18)
    silMat.opacity = lit ? 0.85 : 0
    backMat.color.set(lit ? warm : 0x141020)

    w.target.glow = lit ? (w.state === WINDOW_STATES.LIT ? 0.52 : 0.44) : 0
    w.target.halo = (w.state === WINDOW_STATES.GLIMMER || w.state === WINDOW_STATES.RESONANCE_PAIR) ? 1 : 0
    w.target.beacon = w.state === WINDOW_STATES.STORY_BEACON ? 1 : 0
  }

  /**
   * @param {number|WindowRecord} target window index or record
   * @param {string} state one of WINDOW_STATES
   */
  setWindowState(target, state) {
    const w = typeof target === 'number' ? this.windows[target] : target
    if (!w) return
    if (w.state === state) return
    w.state = state
    w.lit = state !== WINDOW_STATES.DARK
    if (w.lit) w.pulse = Math.max(w.pulse, 1)
    this._paintWindow(w)
  }

  /**
   * Convenience: mark a window lit (v2 compatible).
   * @param {WindowRecord} w
   * @returns {boolean}
   */
  litWindow(w) {
    if (!w) return false
    if (w.state === WINDOW_STATES.LIT) return false
    this.setWindowState(w, WINDOW_STATES.LIT)
    return true
  }

  /**
   * @param {WindowRecord} w
   * @param {number|string} [color]
   */
  burstAt(w, color) {
    w.glass.getWorldPosition(w.world)
    this.vfx.emitBurst(w.world, color ?? (this._target ? this._target.warm : 0xffd98a), 26, 0)
    this.vfx.emitBurst(w.world, 0xffe9c0, 6, 1)
  }

  /**
   * @param {number} idx
   * @param {number|string} [color]
   */
  burstWindow(idx, color) {
    const w = this.windows[idx]
    if (w) this.burstAt(w, color)
  }

  resetWindows() {
    for (const w of this.windows) {
      w.state = WINDOW_STATES.DARK
      w.lit = false
      w.pulse = 0
      w.cur.glow = 0
      w.cur.halo = 0
      w.cur.beacon = 0
      w.target.glow = 0
      w.target.halo = 0
      w.target.beacon = 0
      this._paintWindow(w)
    }
    this.lit = 0
    this.groundMat.uniforms.glow.value = 0
    this.warmLight.intensity = 0
    this.doorGlow.material.opacity = 0
    this.doorLight.intensity = 0
    this.clearResonancePair()
  }

  /**
   * Title-screen ambience: the hottest windows across the whole server glow.
   * @param {Array<{ roomId: number, litTotal: number }>} heat
   */
  applyHeatmap(heat) {
    if (!Array.isArray(heat) || !heat.length) return
    const ranked = heat.slice().sort((a, b) => (b.litTotal || 0) - (a.litTotal || 0))
    const top = ranked.slice(0, 9)
    for (const entry of top) {
      const w = this.windows.find(x => x.roomId === Number(entry.roomId))
      if (!w || w.state !== WINDOW_STATES.DARK) continue
      this.setWindowState(w, WINDOW_STATES.GLIMMER)
      w.expiresAt = 0
    }
    this.setLitCount(this.windows.filter(w => w.state === WINDOW_STATES.LIT).length)
  }

  /** @param {number} n 0..24 */
  setLitCount(n) {
    this.lit = Math.max(0, Math.min(24, n))
    const p = this.lit / 24
    this.groundMat.uniforms.glow.value = p
    this.warmLight.intensity = p * 900
    this.warmLight.color.set(this._target ? this._target.warm : 0xffb060)
    this.doorGlow.material.opacity = p * 0.9
    this.doorLight.intensity = p * 120
    this.bloom.strength = 0.42 + p * 0.34
  }

  /**
   * @param {number} a room id
   * @param {number} b room id
   */
  setResonancePair(a, b) {
    const idxA = this.windows.findIndex(w => w.roomId === Number(a))
    const idxB = this.windows.findIndex(w => w.roomId === Number(b))
    if (idxA < 0 || idxB < 0) return
    for (const i of [idxA, idxB]) {
      if (this.windows[i].state === WINDOW_STATES.LIT) continue
      this.setWindowState(i, WINDOW_STATES.RESONANCE_PAIR)
    }
    if (!this._resA) this._resA = new THREE.Vector3()
    if (!this._resB) this._resB = new THREE.Vector3()
    this.windows[idxA].glass.getWorldPosition(this._resA)
    this.windows[idxB].glass.getWorldPosition(this._resB)
    this.vfx.emitResonanceBridge(this._resA, this._resB, 0xffd6e8)
    this._resonance = { a: Number(a), b: Number(b) }
  }

  clearResonancePair() {
    if (this._resonance) {
      for (const room of [this._resonance.a, this._resonance.b]) {
        const w = this.windows.find(x => x.roomId === room)
        if (w && w.state === WINDOW_STATES.RESONANCE_PAIR) this.setWindowState(w, WINDOW_STATES.GLIMMER)
      }
    }
    this._resonance = null
    this.vfx.clearBridge()
  }

  /** @returns {{ a: number, b: number } | null} */
  get resonancePair() {
    return this._resonance ? { a: this._resonance.a, b: this._resonance.b } : null
  }

  /** @returns {WindowRecord[]} */
  actionableWindows() {
    return this.windows.filter(w => w.state === WINDOW_STATES.GLIMMER || w.state === WINDOW_STATES.STORY_BEACON || w.state === WINDOW_STATES.RESONANCE_PAIR)
  }

  // ----------------------------------------------------------------- input

  _screenToNdc(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect()
    return {
      ndc: new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1),
      rect: r
    }
  }

  /**
   * Which window is under this screen point?
   * @param {number} x client x
   * @param {number} y client y
   * @param {number} [slack] extra CSS pixels of tolerance
   * @returns {WindowRecord | null}
   */
  windowAt(x, y, slack = 0) {
    const ndc = this._screenToNdc(x, y).ndc
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const hits = ray.intersectObjects(this.windows.map(w => w.glass), false)
    if (!hits.length) {
      if (slack <= 0) return null
      let best = null
      let bestD = Infinity
      for (const w of this.windows) {
        const p = this.windowScreenPos(w)
        if (!p) continue
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < bestD && d <= slack) { bestD = d; best = w }
      }
      return best
    }
    const idx = hits[0].object.userData.idx
    return this.windows[idx] || null
  }

  /**
   * @param {WindowRecord} w
   * @returns {{ x: number, y: number } | null} CSS pixel position of the centre
   */
  windowScreenPos(w) {
    if (!w || !w.glass) return null
    w.glass.getWorldPosition(w.world)
    const v = w.world.clone().project(this.camera)
    if (v.z > 1) return null
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }
  }

  /** Magnet targets for the ribbon trail. */
  magnetPoints() {
    const out = []
    for (const w of this.actionableWindows()) {
      const p = this.windowScreenPos(w)
      if (p) out.push(p)
    }
    return out
  }

  _onDown(e) {
    this._pointer.dragging = true
    this._pointer.x = e.clientX
    this._pointer.y = e.clientY
    const w = this.windowAt(e.clientX, e.clientY)
    if (w && this.onWindowTap) this.onWindowTap(w, e.clientX, e.clientY)
    if (this.onPointerDown) this.onPointerDown(e.clientX, e.clientY)
  }

  _onMove(e) {
    this._pointer.x = e.clientX
    this._pointer.y = e.clientY
    this._spring.tx = (e.clientX / Math.max(1, innerWidth)) * 2 - 1
    this._spring.ty = (e.clientY / Math.max(1, innerHeight)) * 2 - 1
    if (this.onPointerMove) this.onPointerMove(e.clientX, e.clientY, this._pointer.dragging)
  }

  _onUp(e) {
    const was = this._pointer.dragging
    this._pointer.dragging = false
    if (was && this.onPointerUp) this.onPointerUp(e.clientX ?? this._pointer.x, e.clientY ?? this._pointer.y)
  }

  // ----------------------------------------------------------------- theme

  /** @param {string} name @param {boolean} [instant] */
  applyTheme(name, instant = false) {
    if (!PALETTES[name]) name = 'warm_blue'
    this.theme = name
    const p = PALETTES[name]
    this._target = p

    const top = new THREE.Color(p.sky[0])
    const mid = new THREE.Color(p.sky[1])
    const bot = new THREE.Color(p.sky[2])

    this._skyFrom = {
      top: this.skyMat.uniforms.top.value.clone(),
      mid: this.skyMat.uniforms.mid.value.clone(),
      bot: this.skyMat.uniforms.bot.value.clone(),
      fog: this.scene.fog.color.clone()
    }
    this._skyTo = { top, mid, bot, fog: new THREE.Color(p.fog) }
    this._skyT = instant ? 1 : 0

    if (instant) {
      this.skyMat.uniforms.top.value.copy(top)
      this.skyMat.uniforms.mid.value.copy(mid)
      this.skyMat.uniforms.bot.value.copy(bot)
      this.scene.fog.color.set(p.fog)
    }
    this.moonSprite.material.color.set(p.moon)
    this.fireflyMat.uniforms.color.value.set(p.particle)
    this.groundMat.uniforms.c1.value.set(p.sky[0]).multiplyScalar(0.6)
    this.groundMat.uniforms.c2.value.set(p.fog)
    this.doorGlow.material.color.set(p.warm)
    this.warmLight.color.set(p.warm)
    this.lampConeMat.uniforms.uColor.value.set(p.warm)
    if (this.painterly) this.painterly.material.uniforms.tint.value.copy(new THREE.Color(p.fog))
    for (const w of this.windows) {
      w.glow.material.color.set(p.warm)
      w.texKey = ''
      this._paintWindow(w)
    }
  }

  /** @param {string} weather */
  setWeatherFx(weather) {
    const rain = weather === 'light_rain' || weather === 'rain'
    const snow = weather === 'fog' || weather === 'snow'
    this.rain.visible = rain
    this.snow.visible = snow
    this._rainTarget = rain ? 0.62 : 0
    this.groundMat.uniforms.wet.value = rain ? 1 : 0
    this._windTarget = weather === 'wind' ? 2.4 : 0
    const fog = /** @type {THREE.FogExp2} */ (this.scene.fog)
    fog.density = weather === 'fog' ? 0.0016 : 0.0009
  }

  /** @param {number} value 0..1 */
  setRain(value) {
    this._rainTarget = Math.max(0, Math.min(1, value))
  }

  /** @param {number} t 0..1 */
  setDawn(t) {
    this._dawnTarget = Math.max(0, Math.min(1, t))
  }

  /** Pulse the camera fov inward for a combo beat. */
  pulseCameraFov(amount = 0.8) {
    this._fovImpulse = -Math.abs(amount)
  }

  /** @param {boolean} v */
  setPaused(v) {
    this.paused = Boolean(v)
  }

  // ------------------------------------------------------------- cutscenes

  /**
   * Kick off the ending camera move.
   * @param {string} endingId
   * @returns {number} duration in ms
   */
  playEndingCutscene(endingId) {
    const base = this._baseCam()
    const look = this._lookBase || new THREE.Vector3(0, 12, 0)
    let to = base.clone()
    let lookTo = look.clone()
    let dur = 3500

    if (endingId === 'ENDING_C_STARGAZER') {
      to = new THREE.Vector3(-40, 210, 470)
      lookTo = new THREE.Vector3(-90, 250, -40)
      dur = 4200
    } else if (endingId === 'ENDING_D_HARMONY') {
      to = new THREE.Vector3(0, 40, 760)
      lookTo = new THREE.Vector3(0, 20, 0)
      this._harmonyUntil = performance.now() + 9600
      dur = 3600
    } else if (endingId === 'ENDING_E_DAWN') {
      to = new THREE.Vector3(0, 90, 900)
      lookTo = new THREE.Vector3(0, 40, 0)
      this.setDawn(1)
      dur = 4200
    } else if (endingId === 'ENDING_A_WARMTH') {
      to = base.clone().multiplyScalar(1.12)
      lookTo = new THREE.Vector3(0, 30, 0)
      this.releaseLanterns(6)
      dur = 3800
    } else if (endingId === 'ENDING_B_COMPANION') {
      to = new THREE.Vector3(0, -20, 640)
      lookTo = new THREE.Vector3(0, -40, 0)
      dur = 3600
    } else {
      to = base.clone().multiplyScalar(0.96)
      lookTo = look.clone()
      dur = 3000
    }

    this._cutscene = {
      from: this.camera.position.clone(),
      to,
      lookFrom: this._lookTarget ? this._lookTarget.clone() : look.clone(),
      lookTo,
      t: 0,
      dur: dur / 1000
    }
    return dur
  }

  /** Return the camera to the playable framing. */
  resetCamera() {
    this._cutscene = null
    this._harmonyUntil = 0
    this._dawnTarget = 0
    this._lookBase = new THREE.Vector3(0, 12, 0)
    this._lookTarget = this._lookBase.clone()
    this.camera.position.copy(this._baseCam())
    this.camera.lookAt(this._lookTarget)
    this.camera.fov = this._baseFov()
    this.camera.updateProjectionMatrix()
  }

  _baseCam() {
    const aspect = this.camera.aspect || 1
    if (aspect < 0.7) return new THREE.Vector3(0, 18, 840)
    if (aspect < 1) return new THREE.Vector3(0, 30, 880)
    return new THREE.Vector3(0, 40, 920)
  }

  _baseFov() {
    const aspect = this.camera.aspect || 1
    if (aspect < 0.7) return 54
    if (aspect < 1) return 50
    return 40
  }

  // ------------------------------------------------------------- surprise

  shootingStar() {
    const from = new THREE.Vector3(-700, 420, -500)
    const to = new THREE.Vector3(500, 120, -600)
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Vector3().lerpVectors(from, to, i / 14)
      this.vfx.emitBurst(p, 0xfff4d0, 2, 2)
    }
    const streak = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    )
    this.scene.add(streak)
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1400
      if (t >= 1) {
        this.scene.remove(streak)
        streak.geometry.dispose()
        streak.material.dispose()
        return
      }
      streak.material.opacity = 0.85 * (1 - t)
      requestAnimationFrame(step)
    }
    step()
  }

  /** @param {number} n */
  releaseLanterns(n = 5) {
    const lanterns = []
    for (let i = 0; i < n; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDot('rgba(255,170,80,1)', 128), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, color: 0xffc070
      }))
      sprite.position.set((Math.random() - 0.5) * 360, -180 + Math.random() * 60, -120 + Math.random() * 260)
      sprite.scale.setScalar(34 + Math.random() * 16)
      this.scene.add(sprite)
      lanterns.push({ sprite, speed: 30 + Math.random() * 22, phase: Math.random() * 6 })
    }
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1000
      for (const l of lanterns) {
        l.sprite.position.y += l.speed * 0.016
        l.sprite.position.x += Math.sin(t + l.phase) * 0.4
        l.sprite.material.opacity = Math.min(1, (l.sprite.position.y + 200) / 120) * (1 - Math.max(0, (l.sprite.position.y - 400) / 300))
      }
      if (t < 11) requestAnimationFrame(step)
      else lanterns.forEach(l => { this.scene.remove(l.sprite); l.sprite.material.dispose() })
    }
    step()
  }

  rooftopCat() {
    if (!this.roofCat) return
    this.roofCat.visible = true
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1000
      this.roofCat.rotation.y = Math.sin(t * 0.9) * 0.55
      this.roofCat.position.y = 90 + Math.sin(t * 0.7) * 1.2
      if (t < 6) requestAnimationFrame(step)
    }
    step()
  }

  // ------------------------------------------------------------------ loop

  _resize() {
    const w = this.host.clientWidth || innerWidth
    const h = this.host.clientHeight || innerHeight
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    if (this.painterly) {
      this.painterly.material.uniforms.resolution.value.set(w, h)
      this.painterly.material.uniforms.paperScale.value = Math.min(2, Math.max(0.7, w / 1400))
    }
    this.camera.aspect = w / h
    this.camera.fov = this._baseFov()
    this.camera.position.copy(this._baseCam())
    this.camera.updateProjectionMatrix()
    this._lookBase = new THREE.Vector3(0, -26, 0)
    this._lookTarget = this._lookBase.clone()
    this.camera.lookAt(this._lookTarget)
    const portrait = this.camera.aspect < 1
    this.moonGroup.position.set(portrait ? 230 : 430, portrait ? 420 : 340, -900)
  }

  tick() {
    const now = performance.now()
    const t = (now - this._t0) / 1000
    const dt = Math.min((now - this._lastNow) / 1000, 0.05)
    this._lastNow = now

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
    this._windTimeUniform.value = t
    this._windStrength += (this._windTarget - this._windStrength) * Math.min(1, dt * 1.6)
    this._windStrengthUniform.value = this._windStrength
    this.lampConeMat.uniforms.uTime.value = t

    this._dawn += (this._dawnTarget - this._dawn) * Math.min(1, dt * 1.2)
    this._rain += (this._rainTarget - this._rain) * Math.min(1, dt * 3)

    if (!this.paused) {
      const s = this._spring
      const k = 18
      const damp = 8.5
      s.vx += (k * (s.tx - s.x) - damp * s.vx) * dt
      s.vy += (k * (s.ty - s.y) - damp * s.vy) * dt
      s.x += s.vx * dt
      s.y += s.vy * dt

      if (this._cutscene) {
        const c = this._cutscene
        c.t = Math.min(1, c.t + dt / c.dur)
        const e = c.t < 0.5 ? 4 * c.t * c.t * c.t : 1 - Math.pow(-2 * c.t + 2, 3) / 2
        this.camera.position.lerpVectors(c.from, c.to, e)
        this._lookTarget.lerpVectors(c.lookFrom, c.lookTo, e)
        this.camera.lookAt(this._lookTarget)
      } else {
        const base = this._baseCam()
        this.camera.position.set(
          base.x + s.x * 28 + Math.sin(t * 0.18) * 6,
          base.y + s.y * 16 + Math.sin(t * 0.25) * 3,
          base.z
        )
        this.camera.lookAt(this._lookTarget || this._lookBase)
      }

      this._fovImpulse *= Math.pow(0.02, dt)
      const targetFov = this._baseFov() + this._fovImpulse
      if (Math.abs(this.camera.fov - targetFov) > 0.01) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12)
        this.camera.updateProjectionMatrix()
      }

      const parallaxX = s.x * 1.35
      const parallaxY = s.y * 0.9
      const harmony = this._harmonyUntil > performance.now()
      for (const w of this.windows) {
        if (w.pulse > 0) w.pulse = Math.max(0, w.pulse - dt * 2.2)
        const pop = 1 + 0.28 * w.pulse * Math.cos(18 * (1 - w.pulse))
        w.cur.glow += (w.target.glow - w.cur.glow) * Math.min(1, dt * 8)
        w.cur.halo += (w.target.halo - w.cur.halo) * Math.min(1, dt * 8)
        w.cur.beacon += (w.target.beacon - w.cur.beacon) * Math.min(1, dt * 8)

        if (harmony) {
          const wave = 0.5 + 0.5 * Math.sin(t * 6 - w.idx * 0.45)
          w.glow.material.opacity = (w.lit ? 0.55 : 0) * (0.55 + wave * 0.9)
          w.glass.scale.setScalar(1 + wave * 0.06)
        } else {
          const flicker = w.state === WINDOW_STATES.LIT ? 0.86 + Math.sin(t * 3 + w.idx) * 0.09 : 1
          w.glow.material.opacity = w.cur.glow * flicker + w.pulse * 0.5
          w.glass.scale.setScalar(pop)
        }

        w.halo.material.opacity = w.cur.halo * (0.55 + 0.45 * Math.sin(t * 2.6 + w.idx))
        w.halo.material.rotation = t * 0.55 + w.idx * 0.3
        w.beacon.material.opacity = w.cur.beacon
        w.beacon.position.y = w.home.y + 35 + Math.sin(t * 2.2 + w.idx) * 2.2

        // 3-layer depth: the glass leads the camera, the room trails behind it
        w.backPanel.position.x = -parallaxX * 0.55
        w.silhouette.position.x = parallaxX * 0.42
        w.glass.position.x = parallaxX * 0.72
        w.backPanel.position.y = -parallaxY * 0.35
        w.silhouette.position.y = parallaxY * 0.25
        w.glass.position.y = parallaxY * 0.45
      }

      if (this.snow.visible) {
        const arr = this.snow.geometry.attributes.position.array
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= 0.6 + (i % 7) * 0.05
          arr[i] += Math.sin(t + i) * 0.2
          if (arr[i + 1] < -180) arr[i + 1] = 420
        }
        this.snow.geometry.attributes.position.needsUpdate = true
        this.snow.material.opacity = 0.62
      }
      if (this.rain.visible) {
        const arr = this.rain.geometry.attributes.position.array
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= 8
          if (arr[i + 1] < -180) arr[i + 1] = 420
        }
        this.rain.geometry.attributes.position.needsUpdate = true
        this.rain.material.opacity = 0.42
      }

      const mothArr = this.moths.geometry.attributes.position.array
      for (let i = 0; i < mothArr.length / 3; i++) {
        const a = t * (0.7 + i * 0.09) + i * 1.7
        const r = 6 + (i % 4) * 3
        mothArr[i * 3] = Math.cos(a) * r
        mothArr[i * 3 + 1] = Math.sin(a * 1.3) * 10 - (i % 5) * 6
        mothArr[i * 3 + 2] = Math.sin(a) * r
      }
      this.moths.geometry.attributes.position.needsUpdate = true

      if (this.antLight) this.antLight.visible = Math.sin(t * 1.4) > 0.2
    }

    if (this.vfx) this.vfx.update(t)

    if (this.painterly) {
      const u = this.painterly.material.uniforms
      u.time.value = t
      u.uRainAmount.value = this._rain
      u.uDawn.value = this._dawn
    }
    this.composer.render()
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    document.removeEventListener('visibilitychange', this._onVis)
    if (this.vfx) this.vfx.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
  }
}
