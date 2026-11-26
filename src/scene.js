import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createPainterlyPass } from './painterly.js'
import { createStardewTextureKit } from './textures-procedural.js'
import { renderNpcPortraitSvg } from './npc-portraits.js'
import { VfxPool } from './vfx-pool.js'
import {
  buildWindowIds,
  dormDef,
  DORM_IDS,
  seasonDef,
  WINDOW_STATES
} from '../shared/constants.js'
import { RESIDENT_SILHOUETTES } from './narrative-graph.js'

export const PALETTES = {
  warm_blue:    { sky: [0x0b1533, 0x233f74, 0x6a86c4], moon: 0xfff3d0, warm: 0xffc06a, rim: 0x9fc2ff, fog: 0x1b2b4d, particle: 0xffe6b0 },
  rainy_amber:  { sky: [0x120f1f, 0x3a2a3f, 0x8a5a4a], moon: 0xffd9a0, warm: 0xffab5a, rim: 0xd8a8ff, fog: 0x241b2c, particle: 0xffcf8a },
  foggy_lilac:  { sky: [0x171630, 0x363258, 0x8a86ad], moon: 0xe9e3ff, warm: 0xffc48a, rim: 0xb9a8ff, fog: 0x2a2747, particle: 0xd8ccff },
  clear_peach:  { sky: [0x1a1430, 0x5a3a54, 0xd08a72], moon: 0xfff0c8, warm: 0xffb85e, rim: 0xffc2a0, fog: 0x35284a, particle: 0xffd9a8 },
  dawn_rose:    { sky: [0x2a2b52, 0x7a5a72, 0xf0b98a], moon: 0xfff6e0, warm: 0xffcf8a, rim: 0xffd9c0, fog: 0x6a5468, particle: 0xffe2b8 }
}

const hex = n => '#' + n.toString(16).padStart(6, '0')
const DORM_SCALE = 24.0
const BASE_Y = -210

// ---------------------------------------------------------------- procedural window textures

function roundedRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r); g.closePath()
}

function softDot(color, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d'); const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, color); grad.addColorStop(0.4, color.replace('1)', '0.7)')); grad.addColorStop(1, color.replace('1)', '0)'))
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

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

function beaconTexture() {
  const S = 128
  const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,250,226,0.98)')
  grad.addColorStop(0.35, 'rgba(255,208,130,0.85)')
  grad.addColorStop(1, 'rgba(255,180,90,0)')
  g.fillStyle = grad; g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(92,52,16,0.92)'; g.lineWidth = 4; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(S * 0.30, S * 0.40); g.lineTo(S * 0.50, S * 0.55); g.lineTo(S * 0.70, S * 0.40); g.stroke()
  roundedRect(g, S * 0.28, S * 0.33, S * 0.44, S * 0.32, 5); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function drawSilhouette(g, S, kind, variant) {
  const ink = 'rgba(74,36,12,0.58)'
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
  } else if (kind === 'easel') {
    g.lineWidth = S * 0.022
    g.beginPath(); g.moveTo(S * 0.38, S * 0.78); g.lineTo(S * 0.50, S * 0.40); g.lineTo(S * 0.62, S * 0.78); g.stroke()
    g.fillStyle = soft; g.fillRect(S * 0.36, S * 0.44, S * 0.30, S * 0.22)
  } else if (kind === 'mic') {
    g.fillRect(S * 0.44, S * 0.26, S * 0.10, S * 0.22)
    g.beginPath(); g.arc(S * 0.49, S * 0.26, S * 0.05, Math.PI, 0); g.fill()
    g.lineWidth = S * 0.018
    g.beginPath(); g.arc(S * 0.74, S * 0.60, S * 0.09, Math.PI * 0.85, Math.PI * 2.15); g.stroke()
  } else if (kind === 'hotpot') {
    g.fillRect(S * 0.30, S * 0.56, S * 0.34, S * 0.16)
    g.fillRect(S * 0.34, S * 0.72, S * 0.04, S * 0.06)
    g.fillRect(S * 0.56, S * 0.72, S * 0.04, S * 0.06)
  } else if (kind === 'books') {
    for (let r = 0; r < 3; r++) {
      g.fillRect(S * 0.22, S * (0.44 + r * 0.13), S * 0.40, S * 0.022)
      for (let b = 0; b < 4; b++) {
        if ((b + r) % 3 === 0) continue
        g.fillRect(S * (0.24 + b * 0.085), S * (0.38 + r * 0.13), S * 0.048, S * 0.055)
      }
    }
    g.beginPath(); g.ellipse(S * 0.76, S * 0.66, S * 0.11, S * 0.06, 0, 0, 7); g.fill()
    g.beginPath(); g.arc(S * 0.86, S * 0.60, S * 0.05, 0, 7); g.fill()
  } else if (kind === 'telescope') {
    g.save(); g.translate(S * 0.52, S * 0.58); g.rotate(-0.6)
    g.fillRect(-S * 0.20, -S * 0.045, S * 0.40, S * 0.09); g.restore()
    g.lineWidth = S * 0.018
    g.beginPath(); g.moveTo(S * 0.44, S * 0.64); g.lineTo(S * 0.38, S * 0.84); g.stroke()
    g.beginPath(); g.moveTo(S * 0.56, S * 0.64); g.lineTo(S * 0.62, S * 0.84); g.stroke()
  } else {
    const v = variant % 4
    if (v === 0) {
      g.beginPath(); g.arc(S * 0.58, S * 0.42, S * 0.07, 0, 7); g.fill()
      g.fillRect(S * 0.34, S * 0.66, S * 0.34, S * 0.045)
    } else if (v === 1) {
      g.beginPath(); g.moveTo(S * 0.5, S * 0.76); g.lineTo(S * 0.5, S * 0.56); g.lineWidth = S * 0.02; g.stroke()
      g.fillRect(S * 0.42, S * 0.74, S * 0.16, S * 0.08)
    } else if (v === 2) {
      g.beginPath(); g.ellipse(S * 0.55, S * 0.68, S * 0.13, S * 0.07, 0, 0, 7); g.fill()
      g.beginPath(); g.arc(S * 0.66, S * 0.62, S * 0.06, 0, 7); g.fill()
    } else {
      g.fillRect(S * 0.28, S * 0.38, S * 0.03, S * 0.3)
      g.beginPath(); g.moveTo(S * 0.20, S * 0.38); g.lineTo(S * 0.40, S * 0.38); g.lineTo(S * 0.34, S * 0.28); g.lineTo(S * 0.26, S * 0.28); g.fill()
    }
  }
  g.restore()
}

function windowTexture(S, state, warmHex, silhouette, variant) {
  const c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)

  const isDark = state === WINDOW_STATES.DARK
  if (!isDark) {
    let core = '#fffdf2'
    let outer = hex(warmHex)
    if (state === WINDOW_STATES.TARGET_HINT) {
      core = '#ffffff'
      outer = '#ffd858'
    } else if (state === WINDOW_STATES.DECOY_BLUE) {
      core = '#e0eeff'
      outer = '#5a8fff'
    } else if (state === WINDOW_STATES.SAFE_WARM) {
      core = '#f4fff4'
      outer = '#90dba0'
    } else if (state === WINDOW_STATES.CORRECT_GREEN) {
      core = '#ecfff3'
      outer = '#56d98c'
    } else if (state === WINDOW_STATES.WRONG_AMBER) {
      core = '#fff0ea'
      outer = '#ff7c5c'
    }

    const grad = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.04, S * 0.5, S * 0.52, S * 0.78)
    grad.addColorStop(0, core)
    grad.addColorStop(0.36, outer)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)

    g.globalCompositeOperation = 'source-atop'
    if (state === WINDOW_STATES.DECOY_BLUE) {
      // Subtle monitor screen glow motif for late-night gaming/phone owl
      g.fillStyle = 'rgba(24,38,94,0.45)'
      g.fillRect(S * 0.26, S * 0.46, S * 0.48, S * 0.28)
      g.fillStyle = 'rgba(130,210,255,0.65)'
      g.fillRect(S * 0.30, S * 0.49, S * 0.40, S * 0.20)
    } else {
      g.fillStyle = 'rgba(120,50,10,0.22)'
      g.fillRect(0, 0, S * 0.12, S)
      g.fillRect(S * 0.88, 0, S * 0.12, S)
      drawSilhouette(g, S, silhouette, variant)
    }
    g.globalCompositeOperation = 'source-over'

    if (state === WINDOW_STATES.STORY_BEACON || state === WINDOW_STATES.TARGET_HINT) {
      g.strokeStyle = state === WINDOW_STATES.TARGET_HINT ? 'rgba(255,244,170,0.92)' : 'rgba(255,214,150,0.75)'
      g.lineWidth = S * 0.026
      roundedRect(g, S * 0.045, S * 0.045, S * 0.91, S * 0.91, S * 0.10)
      g.stroke()
    } else if (state === WINDOW_STATES.RESONANCE_PAIR) {
      g.strokeStyle = 'rgba(255,210,235,0.72)'
      g.lineWidth = S * 0.016
      g.beginPath(); g.moveTo(S * 0.22, S * 0.30); g.lineTo(S * 0.50, S * 0.18); g.lineTo(S * 0.78, S * 0.34); g.stroke()
    } else if (state === WINDOW_STATES.CORRECT_GREEN) {
      g.strokeStyle = 'rgba(230,255,238,0.92)'; g.lineWidth = S * 0.045; g.lineCap = 'round'; g.lineJoin = 'round'
      g.beginPath(); g.moveTo(S * 0.32, S * 0.52); g.lineTo(S * 0.46, S * 0.66); g.lineTo(S * 0.70, S * 0.36); g.stroke()
    } else if (state === WINDOW_STATES.WRONG_AMBER) {
      g.strokeStyle = 'rgba(255,236,228,0.92)'; g.lineWidth = S * 0.04; g.lineCap = 'round'
      g.beginPath(); g.moveTo(S * 0.35, S * 0.35); g.lineTo(S * 0.65, S * 0.65); g.moveTo(S * 0.65, S * 0.35); g.lineTo(S * 0.35, S * 0.65); g.stroke()
    }
  } else {
    g.fillStyle = 'rgba(17,30,58,0.97)'
    roundedRect(g, 2, 2, S - 4, S - 4, 8)
    g.fill()
    const sheen = g.createLinearGradient(0, 0, S, S * 0.7)
    sheen.addColorStop(0, 'rgba(126,162,222,0.34)')
    sheen.addColorStop(0.55, 'rgba(78,110,172,0.12)')
    sheen.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sheen
    roundedRect(g, 8, 6, S - 16, S * 0.5, 6)
    g.fill()
  }

  g.strokeStyle = !isDark ? 'rgba(90,50,15,0.55)' : 'rgba(120,150,200,0.32)'
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
  const W = 4096, H = 360
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.clearRect(0, 0, W, H)

  // Soft distant hillside tree line silhouette behind town gables
  g.fillStyle = 'rgba(18, 28, 44, 0.85)'
  g.beginPath()
  g.moveTo(0, H)
  for (let px = 0; px <= W; px += 32) {
    const hillY = H - 96 - Math.sin(px * 0.0045) * 32 - Math.cos(px * 0.011) * 18 - (px % 96 === 0 ? 18 : 6)
    g.lineTo(px, hillY)
  }
  g.lineTo(W, H)
  g.closePath()
  g.fill()

  let x = 24
  let idx = 0
  while (x < W - 40) {
    const isTower = idx % 9 === 4
    const w = isTower ? 76 + Math.random() * 28 : 96 + Math.random() * 145
    const h = isTower ? 185 + Math.random() * 45 : 74 + Math.random() * 108
    const base = H - 24
    g.fillStyle = isTower ? 'rgba(20, 26, 48, 0.96)' : (idx % 2 === 0 ? 'rgba(16, 22, 42, 0.94)' : 'rgba(22, 26, 46, 0.92)')
    g.fillRect(x, base - h, w, h)
    // Pitched roof / spire / dormer silhouettes
    g.beginPath()
    if (isTower) {
      g.moveTo(x - 6, base - h)
      g.lineTo(x + w * 0.5, base - h - 68)
      g.lineTo(x + w + 6, base - h)
    } else if (idx % 3 === 0) {
      g.moveTo(x - 6, base - h)
      g.lineTo(x + w * 0.5, base - h - 28 - Math.random() * 16)
      g.lineTo(x + w + 6, base - h)
    } else {
      g.rect(x - 4, base - h - 12, w + 8, 12)
      g.rect(x + w * 0.16, base - h - 24, 14, 18)
    }
    g.fill()
    // Clockface or warm amber house windows
    if (isTower) {
      g.fillStyle = 'rgba(255, 222, 152, 0.85)'
      g.beginPath()
      g.arc(x + w * 0.5, base - h + 26, 13, 0, Math.PI * 2)
      g.fill()
    }
    for (let ry = 18; ry < h - 22; ry += 18) {
      for (let rx = 12; rx < w - 12; rx += 16) {
        if (Math.random() > 0.58) {
          g.fillStyle = 'rgba(255, 206, 126, ' + (0.34 + Math.random() * 0.45) + ')'
          g.fillRect(x + rx, base - h + ry, 6, 9)
        }
      }
    }
    x += w + 12 + Math.random() * 34
    idx += 1
  }
  const gg = g.createLinearGradient(0, H - 85, 0, H)
  gg.addColorStop(0, 'rgba(14, 22, 34, 0)')
  gg.addColorStop(1, 'rgba(14, 22, 34, 0.96)')
  g.fillStyle = gg; g.fillRect(0, H - 85, W, 85)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function createInteriorAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()
  ctx.scale(2, 2)

  ctx.fillStyle = '#0f121d'
  ctx.fillRect(0, 0, 512, 512)

  const cellW = 128
  const cellH = 256

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * cellW
      const y = row * cellH
      const isWarm = (row === 0)

      // Wall background
      ctx.fillStyle = isWarm ? '#28202e' : '#141d2e'
      ctx.fillRect(x, y, cellW, cellH)

      // Floor (bottom 25%)
      const floorH = 64
      ctx.fillStyle = isWarm ? '#3a2720' : '#101624'
      ctx.fillRect(x, y + cellH - floorH, cellW, floorH)

      // Floor plank lines
      ctx.strokeStyle = isWarm ? '#221612' : '#080c14'
      ctx.lineWidth = 1.5
      for (let p = 0; p < cellW; p += 24) {
        ctx.beginPath()
        ctx.moveTo(x + p, y + cellH - floorH)
        ctx.lineTo(x + p - 12, y + cellH)
        ctx.stroke()
      }

      // Ceiling pendant light or monitor glow
      if (isWarm) {
        ctx.strokeStyle = '#5a4635'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x + cellW / 2, y)
        ctx.lineTo(x + cellW / 2, y + 36)
        ctx.stroke()

        const lampGrad = ctx.createRadialGradient(x + cellW / 2, y + 42, 4, x + cellW / 2, y + 42, 54)
        lampGrad.addColorStop(0, 'rgba(255, 230, 160, 0.95)')
        lampGrad.addColorStop(0.4, 'rgba(255, 180, 80, 0.45)')
        lampGrad.addColorStop(1, 'rgba(255, 180, 80, 0.0)')
        ctx.fillStyle = lampGrad
        ctx.beginPath()
        ctx.arc(x + cellW / 2, y + 42, 54, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const screenGrad = ctx.createRadialGradient(x + cellW * 0.6, y + cellH * 0.58, 8, x + cellW * 0.6, y + cellH * 0.58, 70)
        screenGrad.addColorStop(0, 'rgba(120, 200, 255, 0.85)')
        screenGrad.addColorStop(0.5, 'rgba(50, 120, 220, 0.35)')
        screenGrad.addColorStop(1, 'rgba(20, 50, 120, 0.0)')
        ctx.fillStyle = screenGrad
        ctx.beginPath()
        ctx.arc(x + cellW * 0.6, y + cellH * 0.58, 70, 0, Math.PI * 2)
        ctx.fill()
      }

      if (col === 0) {
        // Study Room: Bookshelf left, desk right
        ctx.fillStyle = isWarm ? '#1c1420' : '#0b101c'
        ctx.fillRect(x + 8, y + 40, 32, 140)
        ctx.fillStyle = isWarm ? '#4a342a' : '#1c283c'
        ctx.fillRect(x + 10, y + 75, 28, 4)
        ctx.fillRect(x + 10, y + 110, 28, 4)
        ctx.fillRect(x + 10, y + 145, 28, 4)

        ctx.fillStyle = isWarm ? '#a04838' : '#286088'
        ctx.fillRect(x + 12, y + 83, 7, 26)
        ctx.fillStyle = isWarm ? '#d0a040' : '#4090c0'
        ctx.fillRect(x + 20, y + 86, 6, 23)
        ctx.fillStyle = isWarm ? '#508060' : '#305070'
        ctx.fillRect(x + 27, y + 80, 8, 29)

        ctx.fillStyle = isWarm ? '#281c20' : '#121824'
        ctx.fillRect(x + 48, y + 150, 72, 38)
        ctx.fillStyle = isWarm ? '#fff2c0' : '#64c8ff'
        ctx.fillRect(x + 68, y + 134, 24, 16)

        ctx.fillStyle = '#08060a'
        ctx.beginPath()
        ctx.arc(x + 104, y + 130, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(x + 96, y + 139, 20, 48)
      } else if (col === 1) {
        // Bedroom: Bed left, nightstand with mug
        ctx.fillStyle = isWarm ? '#8a4055' : '#2a4870'
        ctx.fillRect(x + 20, y + 45, 36, 48)
        ctx.fillStyle = isWarm ? '#442a26' : '#1a2234'
        ctx.fillRect(x + 10, y + 155, 80, 32)
        ctx.fillStyle = isWarm ? '#c89078' : '#3a5070'
        ctx.fillRect(x + 12, y + 150, 76, 14)
        ctx.fillStyle = isWarm ? '#e8d8c0' : '#607898'
        ctx.fillRect(x + 14, y + 142, 22, 10)
        ctx.fillStyle = isWarm ? '#30201c' : '#141c28'
        ctx.fillRect(x + 94, y + 158, 24, 30)
        ctx.fillStyle = isWarm ? '#ffd888' : '#80c0ff'
        ctx.fillRect(x + 102, y + 150, 8, 8)
      } else if (col === 2) {
        // Lounge: Fairy lights, cat tree, cat
        ctx.strokeStyle = isWarm ? '#ffc860' : '#50b0ff'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 10, y + 40)
        ctx.quadraticCurveTo(x + 64, y + 60, x + 118, y + 42)
        ctx.stroke()
        for (let t = 0.15; t <= 0.85; t += 0.18) {
          ctx.fillStyle = isWarm ? '#ffe890' : '#90e0ff'
          const lx = x + 10 + t * 108
          const ly = y + 40 + Math.sin(t * Math.PI) * 18
          ctx.beginPath()
          ctx.arc(lx, ly, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = isWarm ? '#362420' : '#162030'
        ctx.fillRect(x + 82, y + 110, 8, 80)
        ctx.fillRect(x + 70, y + 110, 32, 6)
        ctx.fillStyle = isWarm ? '#d67830' : '#d07028'
        ctx.beginPath()
        ctx.arc(x + 86, y + 104, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = isWarm ? '#d67830' : '#d07028'
        ctx.beginPath()
        ctx.moveTo(x + 92, y + 106)
        ctx.quadraticCurveTo(x + 97, y + 114, x + 94, y + 120)
        ctx.stroke()
        ctx.fillStyle = isWarm ? '#783850' : '#284868'
        ctx.beginPath()
        ctx.ellipse(x + 40, y + 175, 24, 12, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Tech Room: Whiteboard, monitors, desk plant
        ctx.fillStyle = isWarm ? '#d0c8b0' : '#304050'
        ctx.fillRect(x + 16, y + 45, 54, 38)
        ctx.fillStyle = isWarm ? '#201824' : '#101826'
        ctx.fillRect(x + 20, y + 148, 92, 38)
        ctx.fillStyle = isWarm ? '#ffe890' : '#48c0ff'
        ctx.fillRect(x + 36, y + 130, 26, 18)
        ctx.fillStyle = isWarm ? '#a0e8c0' : '#80e8ff'
        ctx.fillRect(x + 66, y + 128, 28, 20)
        ctx.fillStyle = isWarm ? '#c06030' : '#804020'
        ctx.fillRect(x + 24, y + 142, 8, 8)
        ctx.fillStyle = isWarm ? '#48a050' : '#309060'
        ctx.beginPath()
        ctx.arc(x + 28, y + 138, 5, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = isWarm ? 'rgba(30, 18, 36, 0.85)' : 'rgba(12, 18, 30, 0.85)'
      ctx.fillRect(x, y, 10, cellH)
      ctx.fillRect(x + cellW - 10, y, 10, cellH)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function createSpillAlphaTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()

  const grad = ctx.createRadialGradient(64, 16, 4, 64, 48, 72)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.65)')
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.15)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(64, 16)
  ctx.arc(64, 16, 100, 0.1 * Math.PI, 0.9 * Math.PI)
  ctx.closePath()
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---------------------------------------------------------------- volumetric mist + camera presets

const VIEW_PRESETS = {
  front:   { pos: [0, 32, 920],      look: [0, -34, 0],  fov: 40 },
  stardew: { pos: [340, 270, 790],   look: [0, -34, 0],  fov: 41 },
  street:  { pos: [-175, -125, 485], look: [15, 18, -20], fov: 44 },
  rooftop: { pos: [215, 420, 600],   look: [0, 36, -10], fov: 42 }
}

/**
 * @typedef {{
 *   idx: number, roomId: number, r: number, c: number,
 *   state: string, lit: boolean,
 *   winW: number, winH: number,
 *   group: THREE.Group, glass: THREE.Mesh, silhouette: THREE.Mesh, backPanel: THREE.Mesh,
 *   frame?: THREE.Mesh, glow: THREE.Sprite, halo: THREE.Sprite, beacon: THREE.Sprite,
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
    this.dormId = 'university'
    this.season = 'autumn'
    this.weather = 'clear'
    /** @type {'front'|'stardew'|'street'|'rooftop'} */
    this.cameraView = 'stardew'
    this.npcActorId = 'aunt_lin'
    this.lit = 0
    this.paused = false
    this._flyover = false
    this._orbitLocked = false
    this._pointerOverWindow = false
    this._textures = new Map()
    this._gltfCache = new Map()
    this._leafMaterials = []
    this._snowNodes = []
    this._loader = new GLTFLoader()
    this._texKit = createStardewTextureKit()

    this._pointer = { x: 0, y: 0, dragging: false }
    this._spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
    this._fovImpulse = 0
    this._dawn = 0
    this._dawnTarget = 0
    this._rain = 0
    this._rainTarget = 0
    this._fogStrength = 0
    this._fogTarget = 0
    this._windStrength = 0
    this._windTarget = 0
    this._windTimeUniform = { value: 0 }
    this._windStrengthUniform = { value: 0 }
    this._cutscene = null
    this._resonance = null
    this._harmonyUntil = 0

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    const isCoarse = matchMedia('(pointer: coarse)').matches
    this._pixelRatioCap = isCoarse ? 1.65 : 2.0
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this._pixelRatioCap))
    this._maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy?.() || 4)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.18
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x1b2b4d, 0.00017)
    this.camera = new THREE.PerspectiveCamera(41, 1, 5.0, 7600)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = 400
    this.controls.maxDistance = 1280
    this.controls.minPolarAngle = Math.PI * 0.20
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minAzimuthAngle = -Math.PI * 0.40
    this.controls.maxAzimuthAngle = Math.PI * 0.40
    this.controls.target.set(0, -32, 0)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this._envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this._envTex
    this.scene.environmentIntensity = 0.28
    this._useComposer = true

    this._haloTex = brushHaloTexture()
    this._beaconTex = beaconTexture()

    this.groundsGroup = new THREE.Group()
    this.scene.add(this.groundsGroup)

    this.dormAnchor = new THREE.Group()
    this.scene.add(this.dormAnchor)

    this.dorm = new THREE.Group()
    this.dormAnchor.add(this.dorm)

    this._floorSigns = new Map()
    this._pings = []

    // Adaptive quality controller state (auto | ultra | eco)
    this._targetFps = 60
    this._qualityMode = 'auto'
    this._quality = 3
    this._pondWaterMat = null
    this._frameTimes = new Float32Array(60)
    this._frameTimeIdx = 0
    this._frameCount = 0
    this._degradeTimer = 0
    this._upgradeTimer = 0
    this._tempLocalCam = new THREE.Vector3()
    this._lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity)
    this._raycaster = new THREE.Raycaster()
    this._ndcVec = new THREE.Vector2()
    this._tmpProj = new THREE.Vector3()
    this._tmpProj2 = new THREE.Vector3()
    this._spillDummy = new THREE.Object3D()
    this._spillColor = new THREE.Color()
    this._glassMeshes = []
    this._canvasRect = null

    // Shared procedural interior mapping atlas (Feature A1)
    this._interiorAtlas = createInteriorAtlas()

    // Spill decal alpha texture & InstancedMesh (Feature A2)
    this._spillTex = createSpillAlphaTexture()
    this.spillMesh = null

    // Campus animated ecology references (Feature A5)
    this._acFans = []
    this.flashlight = null
    this.flashlightMat = null

    this._buildSky()
    this._buildStars()
    this._buildMoon()
    this._buildClouds()
    this._buildMountains()
    this._buildGround()
    this._buildVolumetricFog()
    this._buildPuddleOverlay()
    this._buildWeather()
    this._buildSeasonParticles()
    this._buildLights()
    this._buildNpcActor()
    this._buildProceduralDorm('university')
    this._buildComposer()

    this.vfx = new VfxPool(this.scene, { max: 1024 })

    this.applyTheme('warm_blue', true)
    this.setSeason(this.season)
    this.setWeatherFx(this.weather)
    this.setCameraView(this.cameraView, true)
    this._resize()
    addEventListener('resize', () => this._resize())
    this._onVis = () => {
      if (document.hidden) this.renderer.setAnimationLoop(null)
      else this.renderer.setAnimationLoop(this._boundTick)
    }
    document.addEventListener('visibilitychange', this._onVis)

    const el = this.renderer.domElement
    // Register pointerdown in CAPTURE phase so our window-hit & orbit-lock guard runs BEFORE OrbitControls
    el.addEventListener('pointerdown', e => this._onDown(e), { capture: true })
    el.addEventListener('pointermove', e => this._onMove(e))
    addEventListener('pointerup', e => this._onUp(e))
    addEventListener('pointercancel', e => this._onUp(e))

    this._boundTick = () => this.tick()
    this.renderer.setAnimationLoop(this._boundTick)

    this.ready = this._bootstrapGlbCampuses()
  }

  // ---------------------------------------------------------------- glTF / Stardew material pipeline

  /** @param {string} url */
  _loadGlb(url) {
    if (this._gltfCache.has(url)) return this._gltfCache.get(url)
    const p = this._loader.loadAsync(url).catch(() => null)
    this._gltfCache.set(url, p)
    return p
  }

  async _bootstrapGlbCampuses() {
    try {
      const [groundsGltf, uniGltf] = await Promise.all([
        this._loadGlb('./models/campus_grounds.glb'),
        this._loadGlb(dormDef(this.dormId).modelUrl)
      ])
      if (groundsGltf && groundsGltf.scene) {
        this._mountGroundsGlb(groundsGltf.scene)
      }
      if (uniGltf && uniGltf.scene) {
        const snapshot = this.windows.map(w => w.state)
        this._mountDormGlb(uniGltf.scene, this.dormId, snapshot)
      }
      // Pre-warm remaining 3 dorm models quietly in background
      for (const id of DORM_IDS) {
        if (id !== this.dormId) this._loadGlb(dormDef(id).modelUrl)
      }
    } catch {
      // Procedural dorm fallback already active
    }
  }

  /** @param {THREE.Object3D} root @param {boolean} [isGrounds] */
  _styleGlbHierarchy(root, isGrounds = false) {
    root.scale.setScalar(DORM_SCALE)
    root.position.set(0, BASE_Y, 0)
    root.updateMatrixWorld(true)

    root.traverse(obj => {
      const mesh = /** @type {THREE.Mesh} */ (obj)
      if (!mesh.isMesh) return
      const name = mesh.name || ''
      mesh.castShadow = !name.startsWith('Campus_Grass') && !name.startsWith('Campus_Road') && !name.startsWith('Window_Glass')
      mesh.receiveShadow = true

      if (name.startsWith('Season_Snow_')) {
        this._snowNodes.push(mesh)
        mesh.visible = this.season === 'winter' || this.weather === 'snow'
      }

      const rawMat = /** @type {any} */ (mesh.material)
      if (!rawMat) return
      const matName = rawMat.name || ''

      // Clone once per mesh material so leaf/texture mutations stay clean
      const mat = rawMat.clone()
      if (name.startsWith('Season_Snow_') && mat.isMeshStandardMaterial) {
        // Keep snow softly matte so UnrealBloom never washes rooftops into white glare
        if (mat.color) mat.color.setHex(0xcbd8ec)
        mat.roughness = 0.94
        mat.metalness = 0.0
      }
      if (mesh.geometry && mesh.geometry.attributes.color) {
        mat.vertexColors = true
      }

      const texSet = this._texKit[matName]
      if (texSet && mat.isMeshStandardMaterial) {
        if (texSet.map.anisotropy !== this._maxAniso) texSet.map.anisotropy = this._maxAniso
        if (texSet.normalMap.anisotropy !== this._maxAniso) texSet.normalMap.anisotropy = this._maxAniso
        mat.map = texSet.map
        mat.normalMap = texSet.normalMap
        const nStr = (matName === 'Mat_Trim_Cream' || matName === 'Mat_Stone_Trim') ? 0.24 : 0.42
        mat.normalScale = new THREE.Vector2(nStr, nStr)
        // Brighten albedo multiplier when vertex colors & diffuse texture combine
        if (mat.color) mat.color.lerp(new THREE.Color(0xffffff), 0.78)
        mat.roughness = matName === 'Mat_Pond_Water' ? 0.16 : Math.max(0.54, mat.roughness || 0.82)
        if (matName === 'Mat_Pond_Water') {
          mat.metalness = 0.28
          this._pondWaterMat = mat
        }
        mat.needsUpdate = true
      }

      if (matName === 'Mat_Leaf_Main' || matName === 'Mat_Leaf_Accent') {
        mat.userData.leafRole = matName === 'Mat_Leaf_Main' ? 'main' : 'accent'
        this._injectWindShader(mat, 0.65)
        this._leafMaterials.push(mat)
      } else if (matName.startsWith('Mat_Laundry_') || name.startsWith('Laundry_') || name.startsWith('Season_Vines_')) {
        this._injectWindShader(mat, 1.0)
      }

      if (matName === 'Mat_Lamp_Glow' || matName === 'Mat_Door_Glow') {
        mat.emissiveIntensity = isGrounds ? 1.5 : 1.15
      }
      if (matName === 'Mat_Door_Glow') {
        mat.polygonOffset = true
        mat.polygonOffsetFactor = -1
        mat.polygonOffsetUnits = -2
      }

      mesh.material = mat
    })
  }

  /** @param {THREE.Material} mat @param {number} amp */
  _injectWindShader(mat, amp = 1.0) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uWindTime = this._windTimeUniform
      shader.uniforms.uWindStrength = this._windStrengthUniform
      shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;\n' +
        `float wFactor = clamp((wPos.y + 190.0) / 140.0, 0.0, 1.4) * ${amp.toFixed(2)};\n` +
        'transformed.x += sin(uWindTime * 1.8 + wPos.x * 0.08 + wPos.y * 0.12) * uWindStrength * 0.018 * wFactor;\n' +
        'transformed.z += cos(uWindTime * 1.4 + wPos.z * 0.08) * uWindStrength * 0.010 * wFactor;\n'
      )
    }
  }

  /** @param {THREE.Object3D} sceneClone */
  _mountGroundsGlb(sceneClone) {
    this._clearGroup(this.groundsGroup)
    this._pondWaterMat = null
    this.groundsRoot = sceneClone.clone(true)
    this._styleGlbHierarchy(this.groundsRoot, true)
    this.groundsGroup.add(this.groundsRoot)
    // Add crisp additive glow halos over the 4 foreground boulevard lamps + garden pavilion & bridge lanterns
    this.aveLampHalos = []
    for (const lx of [-12.2, 12.2, -26.0, 26.0]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDot('rgba(255,214,136,1)', 128),
        color: 0xffca7a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.44
      }))
      sp.position.set(lx * DORM_SCALE, BASE_Y + 4.86 * DORM_SCALE, 7.92 * DORM_SCALE)
      sp.scale.setScalar(76)
      this.groundsGroup.add(sp)
      this.aveLampHalos.push(sp)
    }
    for (const [gx, gy, gz, sc] of [
      [-19.5, 3.25, -0.5, 68],
      [16.8, 1.55, 1.6, 52],
      [22.2, 1.55, 1.6, 52],
      [-19.5, 14.2, -17.5, 64]
    ]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDot('rgba(255,210,128,1)', 128),
        color: 0xffc66e,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.36
      }))
      sp.position.set(gx * DORM_SCALE, BASE_Y + gy * DORM_SCALE, gz * DORM_SCALE)
      sp.scale.setScalar(sc)
      this.groundsGroup.add(sp)
      this.aveLampHalos.push(sp)
    }
    this.setSeason(this.season)
    this._syncSnowVisibility()
    this._bakeShadows()
  }

  _bakeShadows() {
    if (this.renderer && this.renderer.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true
    }
  }

  /** @param {THREE.Object3D} sceneSrc @param {string} dormId @param {string[]} [prevStates] */
  _mountDormGlb(sceneSrc, dormId, prevStates = []) {
    const def = dormDef(dormId)
    this._clearGroup(this.dorm)
    this._snowNodes = this._snowNodes.filter(n => !n.userData.isDormSnow)
    this._leafMaterials = this._leafMaterials.filter(m => !m.userData.isDormLeaf)
    this.windows = []

    const glb = sceneSrc.clone(true)
    this._styleGlbHierarchy(glb, false)
    glb.traverse(o => {
      if (o.name && o.name.startsWith('Season_Snow_')) o.userData.isDormSnow = true
      const m = /** @type {any} */ (o).material
      if (m && m.userData && m.userData.leafRole) m.userData.isDormLeaf = true
    })
    this.dorm.add(glb)

    const gridIds = buildWindowIds(def.rows, def.cols)
    /** @type {Map<string, THREE.Mesh>} */
    const glassNodes = new Map()
    /** @type {THREE.Mesh | null} */
    let doorNode = null
    glb.traverse(obj => {
      const m = /** @type {THREE.Mesh} */ (obj)
      if (!m.isMesh) return
      if (m.name === 'Entrance_Door') {
        doorNode = m
        return
      }
      const match = /^Window_Glass_(\d+)_(\d+)$/.exec(m.name)
      if (match) {
        glassNodes.set(`${match[1]}_${match[2]}`, m)
      }
    })

    const worldBox = new THREE.Box3()
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()

    /** @type {{ x: number, y: number, z: number, w: number, h: number } | null} */
    let doorMetrics = null
    if (doorNode) {
      /** @type {THREE.Mesh} */ (doorNode).updateWorldMatrix(true, false)
      worldBox.setFromObject(doorNode)
      worldBox.getCenter(center)
      worldBox.getSize(size)
      if (size.x > 8 && size.y > 8) {
        doorMetrics = {
          x: center.x,
          y: center.y,
          z: worldBox.max.z + 0.55,
          w: Math.max(40, size.x * 1.02),
          h: Math.max(48, size.y * 1.02)
        }
      }
    }

    for (const meta of gridIds) {
      const key = `${meta.row}_${meta.col}`
      const node = glassNodes.get(key)
      let cx = (meta.col - (def.cols - 1) / 2) * 65
      let cy = BASE_Y + 106 + meta.row * 72
      let cz = 78
      let winW = 36
      let winH = 44

      if (node) {
        node.updateWorldMatrix(true, false)
        worldBox.setFromObject(node)
        worldBox.getCenter(center)
        worldBox.getSize(size)
        if (size.x > 10 && size.x < 95 && size.y > 10 && size.y < 95) {
          cx = center.x
          cy = center.y
          cz = worldBox.max.z + 1.2
          winW = Math.max(24, size.x * 0.96)
          winH = Math.max(28, size.y * 0.96)
        }
        node.visible = false
      }

      const rec = this._createInteractiveWindow(meta.idx, meta.roomId, meta.row, meta.col, cx, cy, cz, winW, winH)
      this.windows.push(rec)
      if (prevStates[meta.idx] && prevStates[meta.idx] !== WINDOW_STATES.DARK) {
        rec.state = prevStates[meta.idx]
        rec.lit = true
      }
      this._paintWindow(rec)
    }

    this._acFans = []
    glb.traverse(obj => {
      if (obj.name && /^AC_Fan_/i.test(obj.name)) {
        this._acFans.push(obj)
      }
    })

    this._glassMeshes = this.windows.map(w => w.glass)
    this._lastCamPos.set(Infinity, Infinity, Infinity)
    this._buildFloorSigns(def)
    this._attachDormAtmosphereLights(doorMetrics)
    this._buildSpillDecals()
    this.setSeason(this.season)
    this._syncSnowVisibility()
    this.setLitCount(this.windows.filter(w => w.state === WINDOW_STATES.LIT).length)
    this._bakeShadows()
  }

  _createInteriorMaterial(idx, winW, winH) {
    const depth = 38.0
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: this._interiorAtlas },
        uCamLocal: { value: new THREE.Vector3(0, 0, 800) },
        uWinSize: { value: new THREE.Vector2(winW, winH) },
        uRoomDepth: { value: depth },
        uRoomIndex: { value: idx % 4 },
        uPaletteRow: { value: 0.0 },
        uState: { value: 0.0 },
        uWarmColor: { value: new THREE.Color(0xffc06a) },
        uTime: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vLocalPos;
        void main() {
          vUv = uv;
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        varying vec2 vUv;
        varying vec3 vLocalPos;

        uniform sampler2D uAtlas;
        uniform vec3 uCamLocal;
        uniform vec2 uWinSize;
        uniform float uRoomDepth;
        uniform float uRoomIndex;
        uniform float uPaletteRow;
        uniform float uState;
        uniform vec3 uWarmColor;
        uniform float uTime;

        void main() {
          float edgeDist = min(vUv.x, min(1.0 - vUv.x, min(vUv.y, 1.0 - vUv.y)));
          float frame = smoothstep(0.015, 0.040, edgeDist);
          vec3 frameCol = vec3(0.07, 0.06, 0.10);

          if (uState < 0.5) {
            vec3 darkGlass = vec3(0.036, 0.052, 0.102) * (0.82 + 0.22 * vUv.y);
            gl_FragColor = vec4(mix(frameCol, darkGlass, frame), 1.0);
            return;
          }

          vec3 boxMin = vec3(-uWinSize.x * 0.5, -uWinSize.y * 0.5, -uRoomDepth);
          vec3 boxMax = vec3(uWinSize.x * 0.5, uWinSize.y * 0.5, 0.0);

          vec3 rayOrigin = uCamLocal;
          vec3 rayDir = normalize(vLocalPos - uCamLocal);

          vec3 invDir = 1.0 / (rayDir + vec3(equal(rayDir, vec3(0.0))) * 1e-6);
          vec3 t0 = (boxMin - rayOrigin) * invDir;
          vec3 t1 = (boxMax - rayOrigin) * invDir;
          vec3 tMax = max(t0, t1);
          float tFar = min(min(tMax.x, tMax.y), tMax.z);
          vec3 hit = rayOrigin + rayDir * tFar;

          vec3 normPos = (hit - boxMin) / (boxMax - boxMin);

          vec2 roomUv;
          if (tFar == tMax.z) {
            roomUv = normPos.xy;
          } else if (tFar == tMax.x) {
            roomUv = (rayDir.x < 0.0) ? vec2(1.0 - normPos.z, normPos.y) : vec2(normPos.z, normPos.y);
          } else {
            roomUv = (rayDir.y < 0.0) ? vec2(normPos.x, normPos.z) : vec2(normPos.x, 1.0 - normPos.z);
          }

          roomUv = clamp(roomUv, 0.002, 0.998);

          vec2 cellOffset = vec2(floor(mod(uRoomIndex, 4.0)) * 0.25, uPaletteRow * 0.5);
          vec2 atlasUv = cellOffset + roomUv * vec2(0.25, 0.5);
          vec4 roomTex = texture2D(uAtlas, atlasUv);

          vec3 col;
          if (uState >= 2.5 && uState < 3.5) {
            float flick = 0.94 + 0.06 * sin(uTime * 16.0 + uRoomIndex);
            col = roomTex.rgb * vec3(0.40, 0.70, 1.15) * flick;
          } else if (uState >= 4.5 && uState < 5.5) {
            col = roomTex.rgb * vec3(0.45, 1.10, 0.65);
          } else if (uState >= 5.5 && uState < 6.5) {
            col = roomTex.rgb * vec3(1.15, 0.55, 0.35);
          } else {
            float breath = 1.0 + 0.04 * sin(uTime * 2.8 + uRoomIndex * 1.5);
            col = roomTex.rgb * uWarmColor * breath;
          }

          col = mix(frameCol, col, frame);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  }

  _buildSpillDecals() {
    if (this.spillMesh) {
      if (this.spillMesh.parent) this.spillMesh.parent.remove(this.spillMesh)
      this.spillMesh.geometry.dispose()
      this.spillMesh.dispose()
      this.spillMesh = null
    }

    const count = Math.max(30, this.windows.length || 30)
    const sampleW = /** @type {any} */ (this.windows[0]?.glass?.geometry)?.parameters?.width || 34
    const sampleH = /** @type {any} */ (this.windows[0]?.glass?.geometry)?.parameters?.height || 44
    const geom = new THREE.PlaneGeometry(sampleW * 1.6, sampleH * 2.2)
    geom.translate(0, -sampleH * 0.75, 0)

    const mat = new THREE.MeshBasicMaterial({
      map: this._spillTex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })

    this.spillMesh = new THREE.InstancedMesh(geom, mat, count)
    this.spillMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.spillMesh.frustumCulled = false
    this.spillMesh.visible = this._quality >= 2

    const dummy = new THREE.Object3D()
    const zeroColor = new THREE.Color(0x000000)

    for (let i = 0; i < count; i++) {
      const w = this.windows[i]
      if (w) {
        dummy.position.set(w.home.x, w.home.y, w.home.z + 1.2)
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        this.spillMesh.setMatrixAt(i, dummy.matrix)
        this.spillMesh.setColorAt(i, zeroColor)
      }
    }
    this.spillMesh.instanceMatrix.needsUpdate = true
    if (this.spillMesh.instanceColor) this.spillMesh.instanceColor.needsUpdate = true

    this.dorm.add(this.spillMesh)
    this._syncSpillDecals()
  }

  _syncSpillDecals() {
    if (!this.spillMesh || !this.spillMesh.instanceColor) return
    const dummy = this._spillDummy
    const color = this._spillColor
    const warmHex = this._target ? this._target.warm : 0xffc06a

    for (let i = 0; i < this.windows.length; i++) {
      const w = this.windows[i]
      const lit = w.state !== WINDOW_STATES.DARK
      if (!lit) {
        dummy.position.set(w.home.x, w.home.y, w.home.z + 1.2)
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        this.spillMesh.setMatrixAt(i, dummy.matrix)
        color.set(0x000000)
      } else {
        dummy.position.set(w.home.x, w.home.y, w.home.z + 1.2)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        this.spillMesh.setMatrixAt(i, dummy.matrix)

        if (w.state === WINDOW_STATES.DECOY_BLUE) color.set(0x5588ff)
        else if (w.state === WINDOW_STATES.CORRECT_GREEN) color.set(0x5ae696)
        else if (w.state === WINDOW_STATES.WRONG_AMBER) color.set(0xff8866)
        else color.set(warmHex)
      }
      this.spillMesh.setColorAt(i, color)
    }
    this.spillMesh.instanceMatrix.needsUpdate = true
    this.spillMesh.instanceColor.needsUpdate = true
  }

  getQuality() {
    return this._quality
  }

  getQualityMode() {
    return this._qualityMode
  }

  /** @param {'auto'|'ultra'|'eco'} mode */
  setQualityMode(mode) {
    const m = (mode === 'ultra' || mode === 'eco') ? mode : 'auto'
    this._qualityMode = m
    this._degradeTimer = 0
    this._upgradeTimer = 0
    if (m === 'ultra') {
      this._quality = -1
      this.setQuality(3)
    } else if (m === 'eco') {
      this._quality = -1
      this.setQuality(0)
    } else {
      this._quality = -1
      this.setQuality(3)
    }
  }

  setQuality(q) {
    const level = Math.max(0, Math.min(3, Math.floor(q)))
    if (this._quality === level) return
    this._quality = level

    const coarse = matchMedia('(pointer: coarse)').matches
    const ultra = this._qualityMode === 'ultra'
    const dpr = level === 3
      ? (ultra ? 2.0 : (coarse ? 1.35 : 1.5))
      : level === 2
        ? (coarse ? 1.25 : 1.35)
        : level === 1 ? 1.1 : (this._qualityMode === 'eco' ? (coarse ? 1.0 : 1.1) : 1.0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dpr))
    this._resize()

    if (this.scene && this._envTex !== undefined) {
      this.scene.environment = level >= 2 ? this._envTex : null
    }

    if (this.moonLight && this.moonLight.shadow) {
      const targetShadow = level >= 2 ? 2048 : 1024
      if (this.moonLight.shadow.mapSize.x !== targetShadow) {
        this.moonLight.shadow.mapSize.set(targetShadow, targetShadow)
        if (this.moonLight.shadow.map) {
          this.moonLight.shadow.map.dispose()
          this.moonLight.shadow.map = null
        }
        this._bakeShadows()
      }
    }

    this._useComposer = level >= 1
    if (this.spillMesh) {
      this.spillMesh.visible = level >= 2 || this._qualityMode === 'eco'
    }

    if (this.bloom) {
      this.bloom.enabled = level >= 2
    }

    if (this.painterly) {
      const u = this.painterly.material.uniforms
      u.strength.value = level === 0 ? 0.0 : level === 1 ? 0.36 : level === 2 ? 0.42 : 0.44
      u.uKuwaharaRadius.value = level >= 3 ? 1.18 : level === 2 ? 1.05 : 0.85
      if (u.uFastMode) u.uFastMode.value = (level <= 2 && !ultra) ? 1.0 : 0.0
    }

    if (this.mistGroup) {
      this.mistGroup.visible = (level >= 2) && (this._fogStrength > 0.015)
    }

    // Keep Interior Mapping enabled across all tiers cleanly via dark-window early-out
    for (const w of this.windows) {
      const isShader = Boolean(w.glass.material && /** @type {any} */ (w.glass.material).uniforms)
      if (!isShader) {
        const winW = w.winW || 34
        const winH = w.winH || 44
        const oldMat = /** @type {any} */ (w.glass.material)
        if (oldMat && oldMat.dispose) oldMat.dispose()
        w.glass.material = this._createInteriorMaterial(w.idx, winW, winH)
        w.texKey = ''
        this._paintWindow(w)
      }
    }
  }

  setCombo(combo) {
    if (this.painterly) {
      const norm = Math.min(1.0, Math.max(0, (combo || 0) / 15.0))
      this.painterly.material.uniforms.uComboVignette.value = norm
    }
  }

  _createInteractiveWindow(idx, roomId, r, c, x, y, z, winW, winH) {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    this.dorm.add(group)

    const backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(winW, winH),
      new THREE.MeshBasicMaterial({ color: 0x1a1526, toneMapped: false })
    )
    backPanel.position.z = -1.2
    group.add(backPanel)

    const silhouette = new THREE.Mesh(
      new THREE.PlaneGeometry(winW * 0.92, winH * 0.92),
      new THREE.MeshBasicMaterial({ color: 0x120e18, transparent: true, opacity: 0.9, depthWrite: false })
    )
    silhouette.position.z = 0.8
    group.add(silhouette)

    const glassMat = this._createInteriorMaterial(idx, winW, winH)
    backPanel.visible = false
    silhouette.visible = false

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(winW, winH),
      glassMat
    )
    glass.position.z = 2.8
    glass.userData.idx = idx
    group.add(glass)

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot('rgba(255,190,110,1)', 128),
      color: 0xffc06a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
    }))
    glow.scale.setScalar(winW * 1.6)
    glow.position.set(x, y, z + 2)
    glow.visible = false
    this.dorm.add(glow)

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTex, color: 0xffd08a, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0
    }))
    halo.scale.setScalar(winW * 2.15)
    halo.position.set(x, y, z + 5)
    halo.visible = false
    this.dorm.add(halo)

    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._beaconTex, color: 0xffe0a0, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0
    }))
    beacon.scale.setScalar(22)
    beacon.position.set(x, y + winH / 2 + 12, z + 7)
    beacon.visible = false
    this.dorm.add(beacon)

    return /** @type {WindowRecord} */ ({
      idx, roomId, r, c,
      state: WINDOW_STATES.DARK,
      lit: false,
      winW, winH,
      group, glass, silhouette, backPanel,
      glow, halo, beacon,
      pulse: 0,
      world: new THREE.Vector3(),
      home: { x, y, z },
      target: { glow: 0, halo: 0, beacon: 0, scale: 1 },
      cur: { glow: 0, halo: 0, beacon: 0, scale: 1 },
      texKey: '',
      variant: idx % 6
    })
  }

  /** @param {{ x: number, y: number, z: number, w: number, h: number } | null} [doorMetrics] */
  _attachDormAtmosphereLights(doorMetrics = null) {
    const gw = doorMetrics ? doorMetrics.w : 52
    const gh = doorMetrics ? doorMetrics.h : 62
    const gx = doorMetrics ? doorMetrics.x : 0
    const gy = doorMetrics ? doorMetrics.y : BASE_Y + 36
    const gz = doorMetrics ? doorMetrics.z : 96
    this.doorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(gw, gh),
      new THREE.MeshBasicMaterial({
        color: 0xffc46a,
        transparent: true,
        opacity: 0.12,
        toneMapped: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      })
    )
    this.doorGlow.position.set(gx, gy, gz)
    this.dorm.add(this.doorGlow)

    this.doorLight = new THREE.PointLight(0xffc46a, 45, 260, 1.8)
    this.doorLight.position.set(gx, gy + 10, gz + 28)
    this.dorm.add(this.doorLight)

    // Side street lamp volumetric beam kept for theme harmony
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffca86) }, uIntensity: { value: 0.28 }, uTime: { value: 0 } },
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
    this.lampCone = new THREE.Mesh(new THREE.ConeGeometry(54, 116, 20, 1, true), coneMat)
    this.lampCone.position.set(-292, BASE_Y + 58, 188)
    this.dorm.add(this.lampCone)
    this.lampConeMat = coneMat

    // Moths around foreground lamp
    const N = 8
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    this.mothMat = new THREE.PointsMaterial({
      size: 3.4, map: softDot('rgba(255,226,168,1)', 32),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0a8, opacity: 0.85
    })
    this.moths = new THREE.Points(geo, this.mothMat)
    this.moths.position.set(-292, BASE_Y + 95, 190)
    this.dorm.add(this.moths)

    // Rooftop cat: default visible so it's always part of campus ecology
    const cat = new THREE.Group()
    const cMat = new THREE.MeshStandardMaterial({ color: 0xd98038, roughness: 0.85 })
    const b = new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 8), cMat)
    b.scale.set(1.25, 0.9, 1)
    cat.add(b)
    cat.position.set(0, BASE_Y + 370, -10)
    cat.visible = true
    this.dorm.add(cat)
    this.roofCat = cat

    // Night watch flashlight cone at ground level (Feature A5)
    const flashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xfff2c8) }, uIntensity: { value: 0.35 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);\n' +
        '  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);\n' +
        '  gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'uniform vec3 uColor; uniform float uIntensity; uniform float uTime;\n' +
        'void main(){\n' +
        '  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);\n' +
        '  float fall = pow(clamp(vUv.y, 0.0, 1.0), 1.6);\n' +
        '  float flick = 0.95 + 0.05 * sin(uTime * 4.2 + vUv.y * 7.0);\n' +
        '  gl_FragColor = vec4(uColor, uIntensity * fres * fall * flick);\n' +
        '}'
    })
    this.flashlight = new THREE.Mesh(new THREE.ConeGeometry(38, 92, 16, 1, true), flashMat)
    this.flashlight.position.set(-180, BASE_Y + 14, 160)
    this.flashlight.rotation.x = Math.PI / 2 - 0.15
    this.flashlightMat = flashMat
    this.dorm.add(this.flashlight)
  }

  /** Instant fallback builder before GLB fetch settles (or in offline test runs). */
  _buildProceduralDorm(dormId) {
    const def = dormDef(dormId)
    this._clearGroup(this.dorm)
    this.windows = []
    const BW = 430, BH = def.rows * 78 + 70, BD = 140
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BW, BH, BD),
      new THREE.MeshStandardMaterial({ color: 0x485678, roughness: 0.86 })
    )
    body.position.y = BH / 2 + BASE_Y
    this.dorm.add(body)

    const gapX = (BW - 60) / def.cols
    const gapY = 74
    const baseX = -BW / 2 + gapX / 2 + 30
    const baseY = BASE_Y + 104
    const ids = buildWindowIds(def.rows, def.cols)
    for (const meta of ids) {
      const x = baseX + meta.col * gapX
      const y = baseY + meta.row * gapY
      const rec = this._createInteractiveWindow(meta.idx, meta.roomId, meta.row, meta.col, x, y, BD / 2 + 2, 34, 44)
      this.windows.push(rec)
      this._paintWindow(rec)
    }
    this._glassMeshes = this.windows.map(w => w.glass)
    this._lastCamPos.set(Infinity, Infinity, Infinity)
    this._buildFloorSigns(def)
    this._attachDormAtmosphereLights()
    this._buildSpillDecals()
    this._bakeShadows()
  }

  _buildFloorSigns(def) {
    this._clearFloorSigns()
    if (!this._floorSigns) this._floorSigns = new Map()

    const rows = def?.rows || 4
    for (let r = 0; r < rows; r++) {
      const floor = r + 1
      const floorLabel = `${floor}F`

      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, 128, 64)
        ctx.fillStyle = 'rgba(16, 12, 26, 0.82)'
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(8, 8, 112, 48, 14)
        } else {
          ctx.rect(8, 8, 112, 48)
        }
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 218, 160, 0.55)'
        ctx.lineWidth = 2.5
        ctx.stroke()

        ctx.fillStyle = '#fff4db'
        ctx.font = 'bold 28px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(floorLabel, 64, 33)
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      })
      const sprite = new THREE.Sprite(material)

      const rowWins = this.windows.filter(w => w.r === r)
      const minX = rowWins.length > 0 ? rowWins.reduce((min, w) => Math.min(min, w.home.x), 0) : (-((def?.cols || 6) - 1) * 32.5)
      const winY = rowWins.length > 0 ? rowWins[0].home.y : (BASE_Y + 106 + r * 72)
      const winZ = rowWins.length > 0 ? rowWins[0].home.z + 2 : 82

      sprite.position.set(minX - 44, winY, winZ)
      sprite.scale.set(34, 17, 1)
      this.dorm.add(sprite)

      this._floorSigns.set(floor, {
        sprite,
        texture,
        material,
        active: false,
        baseScale: { x: 34, y: 17 }
      })
    }
  }

  /**
   * Highlight building facade floor sign for a given floor (1-based, 1..5).
   * @param {number} floor
   * @param {boolean} [active=true]
   */
  highlightFloorSign(floor, active = true) {
    if (!this._floorSigns) return
    const sign = this._floorSigns.get(Number(floor))
    if (!sign) return
    sign.active = Boolean(active)
    if (sign.active) {
      sign.material.color.setHex(0xffea88)
      sign.sprite.scale.set(sign.baseScale.x * 1.25, sign.baseScale.y * 1.25, 1)
    } else {
      sign.material.color.setHex(0xffffff)
      sign.sprite.scale.set(sign.baseScale.x, sign.baseScale.y, 1)
    }
  }

  /**
   * Emit 2-second expanding radar ripple ring at target window room.
   * @param {number} roomId
   */
  pingRoom(roomId) {
    const w = this.windows.find(win => win.roomId === Number(roomId))
    if (!w) return
    this._spawnRadarPing(w.home.x, w.home.y, w.home.z + 4)
    if (this.vfx) {
      this.vfx.emitBurst(w.world, 0xffe2b0, 16, 1)
    }
    w.cur.halo = Math.max(w.cur.halo, 0.9)
  }

  /**
   * Emit 2-second expanding radar ripple rings across all windows on a floor.
   * @param {number} floor - 1-based floor number
   */
  pingFloor(floor) {
    const f = Number(floor)
    const floorWins = this.windows.filter(w => w.r === f - 1)
    for (const w of floorWins) {
      this._spawnRadarPing(w.home.x, w.home.y, w.home.z + 4)
    }
    this.highlightFloorSign(f, true)
    setTimeout(() => this.highlightFloorSign(f, false), 2200)
  }

  _spawnRadarPing(x, y, z) {
    if (!this._pings) this._pings = []
    const geom = new THREE.RingGeometry(10, 13, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffdf80,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(x, y, z)
    this.dorm.add(mesh)
    this._pings.push({
      mesh,
      geom,
      mat,
      startedAt: performance.now(),
      duration: 2000
    })
  }

  _clearPings() {
    if (!this._pings) return
    for (const p of this._pings) {
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh)
      p.geom.dispose()
      p.mat.dispose()
    }
    this._pings = []
  }

  _clearFloorSigns() {
    if (!this._floorSigns) return
    for (const item of this._floorSigns.values()) {
      if (item.sprite && item.sprite.parent) item.sprite.parent.remove(item.sprite)
      if (item.texture) item.texture.dispose()
      if (item.material) item.material.dispose()
    }
    this._floorSigns.clear()
  }

  _clearGroup(group) {
    if (group === this.dorm) {
      this._clearPings()
      this._clearFloorSigns()
      if (this.spillMesh) {
        if (this.spillMesh.parent) this.spillMesh.parent.remove(this.spillMesh)
        this.spillMesh.geometry.dispose()
        this.spillMesh.dispose()
        this.spillMesh = null
      }
      this._acFans = []
      this.flashlight = null
      this.flashlightMat = null
      this.roofCat = null
    }
    while (group.children.length) {
      const ch = group.children[0]
      group.remove(ch)
    }
  }

  // ---------------------------------------------------------------- environment builders

  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      depthWrite: false, side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;\n' +
        'float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);\n' +
        '  return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),u.x), mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),u.x), u.y); }\n' +
        'void main(){\n' +
        '  vec3 d = normalize(vP);\n' +
        '  float h = d.y;\n' +
        '  vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.68)) : mix(mid, bot, clamp(-h*2.2,0.0,1.0));\n' +
        '  float milky = exp(-pow((d.x * 0.72 + d.y * 0.65 - 0.34) * 3.8, 2.0)) * smoothstep(0.04, 0.55, h);\n' +
        '  float neb = n2(d.xy * 11.0) * 0.65 + n2(d.xz * 21.0) * 0.35;\n' +
        '  c += mix(vec3(0.14, 0.20, 0.38), vec3(0.26, 0.22, 0.42), neb) * milky * 0.32;\n' +
        '  float horiz = exp(-abs(h - 0.02) * 14.0);\n' +
        '  c += mix(mid, vec3(0.55, 0.42, 0.34), 0.35) * horiz * 0.16;\n' +
        '  gl_FragColor = vec4(c, 1.0);\n' +
        '}'
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 40, 20), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    this.scene.add(this.sky)
  }

  _buildStars() {
    const N = 900
    const pos = new Float32Array(N * 3)
    const sizes = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const r = 2300
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(1 - Math.random() * 0.78)
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.72 + 200
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
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot('rgba(255,244,214,1)', 256), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xfff3d0
    }))
    this.moonSprite.scale.setScalar(160)
    this.moonGroup.add(this.moonSprite)
    const crisp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot('rgba(255,250,232,1)', 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }))
    crisp.scale.setScalar(68)
    crisp.position.z = 2
    this.moonGroup.add(crisp)
    this.moonGroup.position.set(430, 340, -900)
    this.scene.add(this.moonGroup)
  }

  _buildClouds() {
    this.cloudsGroup = new THREE.Group()
    const mkCloudTex = () => {
      const c = document.createElement('canvas')
      c.width = 512; c.height = 160
      const g = c.getContext('2d')
      if (g) {
        g.clearRect(0, 0, 512, 160)
        for (const [cx, cy, rx, ry, a] of [
          [140, 96, 86, 36, 0.22],
          [220, 74, 118, 46, 0.28],
          [310, 82, 108, 42, 0.25],
          [385, 100, 78, 32, 0.18],
          [265, 92, 155, 34, 0.16]
        ]) {
          const gr = g.createRadialGradient(cx, cy, 4, cx, cy, rx)
          gr.addColorStop(0, `rgba(255, 232, 198, ${a})`)
          gr.addColorStop(0.55, `rgba(182, 198, 240, ${a * 0.55})`)
          gr.addColorStop(1, 'rgba(120, 140, 196, 0)')
          g.fillStyle = gr
          g.beginPath()
          g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
          g.fill()
        }
      }
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      return tex
    }
    this._cloudTex = mkCloudTex()
    this._clouds = []
    for (const [x, y, z, w, h, spd] of [
      [-640, 290, -1350, 720, 210, 4.5],
      [80, 355, -1480, 880, 240, 3.2],
      [760, 275, -1280, 680, 195, 5.1],
      [-980, 235, -1120, 620, 180, 3.8],
      [390, 225, -1080, 580, 175, 4.2],
      [-260, 410, -1580, 920, 250, 2.6]
    ]) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: this._cloudTex, transparent: true, depthWrite: false, opacity: 0.72, fog: false })
      )
      m.position.set(x, y, z)
      this.cloudsGroup.add(m)
      this._clouds.push({ mesh: m, baseX: x, spd })
    }
    this.scene.add(this.cloudsGroup)
  }

  _buildMountains() {
    const makeCurvedRange = (peakColHex, baseColHex, radius, baseY, amp, ridgeBias, pineSpikes = false) => {
      const seg = 140
      const startAng = Math.PI * 0.42
      const spanAng = Math.PI * 1.16
      const positions = []
      const colors = []
      const indices = []
      const cPeak = new THREE.Color(peakColHex)
      const cBase = new THREE.Color(baseColHex)

      for (let i = 0; i <= seg; i++) {
        const u = i / seg
        const ang = startAng + u * spanAng
        const x = Math.sin(ang) * radius
        const z = 240 + Math.cos(ang) * radius
        const ridge = ridgeBias +
          Math.sin(i * 0.14 + radius * 0.01) * (amp * 0.48) +
          Math.sin(i * 0.06 - 0.7) * (amp * 0.36) +
          Math.cos(i * 0.33) * (amp * 0.16) +
          (pineSpikes ? ((i % 2 === 0 ? 18 : 0) + Math.sin(i * 0.9) * 14) : 0)

        // Bottom vertex at horizon baseline, top vertex at mountain crest
        positions.push(x, baseY - 380, z)
        colors.push(cBase.r, cBase.g, cBase.b)
        positions.push(x, baseY + ridge, z)
        colors.push(cPeak.r, cPeak.g, cPeak.b)
      }

      for (let i = 0; i < seg; i++) {
        const b0 = i * 2
        const t0 = i * 2 + 1
        const b1 = (i + 1) * 2
        const t1 = (i + 1) * 2 + 1
        indices.push(b0, b1, t0, t0, b1, t1)
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geo.setIndex(indices)
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })
      const m = new THREE.Mesh(geo, mat)
      this.scene.add(m)
      return m
    }

    // 3 overlapping layered twilight mountain ridges curving seamlessly around horizon & flanks
    this.mtnFar = makeCurvedRange(0x283663, 0x1e2c4f, 1950, -180, 210, 260, false)
    this.mtnMid = makeCurvedRange(0x1b2848, 0x162238, 1580, -210, 165, 195, true)
    this.mtnNear = makeCurvedRange(0x15252f, 0x142228, 1320, -230, 105, 135, true)

    // Wide panoramic illuminated town + tree skyline arc behind and beside the campus
    const arcGeo = new THREE.CylinderGeometry(1180, 1180, 350, 72, 1, true, Math.PI * 0.52, Math.PI * 0.96)
    this.farTown = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({ map: rooftopSvg(), transparent: true, depthWrite: false, side: THREE.BackSide, opacity: 0.94, fog: false })
    )
    this.farTown.position.set(0, -105, 220)
    this.scene.add(this.farTown)
  }

  _buildGround() {
    // Seamless horizon meadow ground blending out to distant twilight haze
    const geo = new THREE.PlaneGeometry(6400, 4400, 1, 1)
    this.groundMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        c1: { value: new THREE.Color(0x162820) },
        c2: { value: new THREE.Color(0x1e2b44) },
        glow: { value: 0 },
        wet: { value: 0 }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader:
        'varying vec2 vUv; uniform vec3 c1; uniform vec3 c2; uniform float glow; uniform float wet;\n' +
        'void main(){\n' +
        '  vec2 p = vUv - vec2(0.5, 0.52);\n' +
        '  float radial = smoothstep(0.10, 0.50, length(p * vec2(1.0, 1.15)));\n' +
        '  vec3 meadow = mix(vec3(0.09, 0.16, 0.14), c1, 0.55);\n' +
        '  vec3 c = mix(meadow, c2, radial);\n' +
        '  c += vec3(0.45, 0.32, 0.16) * glow * 0.08 * (1.0 - radial);\n' +
        '  gl_FragColor = vec4(c, 1.0);\n' +
        '}'
    })
    this.ground = new THREE.Mesh(geo, this.groundMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.set(0, BASE_Y - 8, -120)
    this.scene.add(this.ground)
  }

  /**
   * Real 8-layer drifting Perlin FBM volumetric mist across the campus plaza,
   * replacing v3's blurry fog filter / snow particles.
   */
  _buildVolumetricFog() {
    this.mistGroup = new THREE.Group()
    this.mistPlanes = []
    this.mistUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color(0x8fa6d4) },
      uColorWarm: { value: new THREE.Color(0xffc988) }
    }

    const mkMat = (layerSeed, speed) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.mistUniforms.uTime,
        uOpacity: this.mistUniforms.uOpacity,
        uColorA: this.mistUniforms.uColorA,
        uColorWarm: this.mistUniforms.uColorWarm,
        uSeed: { value: layerSeed },
        uSpeed: { value: speed }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uSeed;
        uniform float uSpeed;
        uniform vec3 uColorA;
        uniform vec3 uColorWarm;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f*f*(3.0 - 2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
                     mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
        }
        float fbm(vec2 p){
          float v = 0.0; float a = 0.5;
          for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.04; a *= 0.5; }
          return v;
        }
        void main(){
          vec2 uv = vUv;
          float n1 = fbm(vec2(uv.x * 4.5 + uTime * 0.055 * uSpeed + uSeed, uv.y * 2.6 - uTime * 0.02));
          float n2 = fbm(vec2(uv.x * 8.0 - uTime * 0.03 * uSpeed + uSeed * 1.7, uv.y * 4.0 + uSeed));
          float wisp = smoothstep(0.32, 0.78, n1 * 0.65 + n2 * 0.35);
          float edgeX = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.84, uv.x);
          float edgeY = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.55, uv.y);
          // Warm Mie scattering glow near streetlamp pools
          float lampPool = exp(-pow((uv.x - 0.33) * 5.2, 2.0)) + exp(-pow((uv.x - 0.67) * 5.2, 2.0));
          vec3 col = mix(uColorA, uColorWarm, clamp(lampPool * 0.38, 0.0, 0.55));
          float alpha = wisp * edgeX * edgeY * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `
    })

    const depths = [-80, 60, 190, 330]
    for (let i = 0; i < depths.length; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1560, 210),
        mkMat(i * 3.17, (i % 2 === 0 ? 1 : -0.8) * (0.7 + i * 0.1))
      )
      m.position.set((i % 2 === 0 ? -24 : 24), BASE_Y + 62 + (i % 3) * 26, depths[i])
      this.mistGroup.add(m)
      this.mistPlanes.push(m)
    }
    this.mistGroup.visible = false
    this.scene.add(this.mistGroup)
  }

  /** Concentric rain puddle ripple sheen right across the campus cobblestone & plaza apron. */
  _buildPuddleOverlay() {
    this.puddleUniforms = {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uWarmGlow: { value: 0 }
    }
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.puddleUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uRain;
        uniform float uWarmGlow;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float ring(vec2 uv, vec2 center, float phase){
          float t = fract(uTime * 0.65 + phase);
          float d = length((uv - center) * vec2(2.2, 1.0));
          float r = t * 0.08;
          return smoothstep(0.010, 0.0, abs(d - r)) * (1.0 - t);
        }
        void main(){
          if(uRain < 0.02) discard;
          vec2 cell = floor(vUv * vec2(14.0, 6.0));
          vec2 center = (cell + 0.3 + 0.4 * vec2(hash(cell), hash(cell + 17.3))) / vec2(14.0, 6.0);
          float r = ring(vUv, center, hash(cell + 5.1));
          float sheen = (0.04 + 0.06 * uWarmGlow) * smoothstep(0.15, 0.75, sin(vUv.x * 28.0) * 0.5 + 0.5);
          vec3 col = mix(vec3(0.55, 0.72, 0.98), vec3(1.0, 0.80, 0.50), uWarmGlow * 0.55);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(col, (r * 0.34 + sheen) * uRain * edge);
        }
      `
    })
    this.puddleOverlay = new THREE.Mesh(new THREE.PlaneGeometry(1560, 420), mat)
    this.puddleOverlay.rotation.x = -Math.PI / 2
    this.puddleOverlay.position.set(0, BASE_Y + 3.8, 175)
    this.scene.add(this.puddleOverlay)
  }

  _buildWeather() {
    this.weatherGroup = new THREE.Group()
    this.scene.add(this.weatherGroup)
    const mk = (n, size, color) => {
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 1200
        pos[i * 3 + 1] = Math.random() * 560 - 140
        pos[i * 3 + 2] = -120 + Math.random() * 680
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return new THREE.Points(geo, new THREE.PointsMaterial({
        size, map: softDot(color, 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
      }))
    }
    this.snow = mk(900, 6.2, 'rgba(235,244,255,1)')
    this.snow.visible = false
    this.weatherGroup.add(this.snow)
    this.rain = mk(1400, 3.4, 'rgba(198,220,255,1)')
    this.rain.visible = false
    this.weatherGroup.add(this.rain)
  }

  _buildSeasonParticles() {
    const N = 60
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1050
      pos[i * 3 + 1] = -180 + Math.random() * 340
      pos[i * 3 + 2] = 60 + Math.random() * 340
      phase[i] = Math.random() * Math.PI * 2
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
    this.fireflyMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xffd98a) }, size: { value: 14 }, opacity: { value: 0.85 } },
      vertexShader: 'attribute float phase; uniform float time; uniform float size; varying float a;\n' +
        'void main(){ vec3 p=position; p.x+=sin(time*0.6+phase)*24.0; p.y+=cos(time*0.5+phase*1.3)*18.0; p.z+=sin(time*0.4+phase)*16.0;\n' +
        'a=0.35+0.65*pow(0.5+0.5*sin(time*2.0+phase),2.0); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=size*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float a; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(color, a*opacity*(1.0-d*2.0)); }'
    })
    this.fireflies = new THREE.Points(geo, this.fireflyMat)
    this.scene.add(this.fireflies)
  }

  _buildLights() {
    this.amb = new THREE.AmbientLight(0x66739c, 0.90)
    this.scene.add(this.amb)
    this.hemi = new THREE.HemisphereLight(0xb8cef8, 0x332c38, 1.25)
    this.scene.add(this.hemi)
    this.fillLight = new THREE.DirectionalLight(0xffdfb4, 0.58)
    this.fillLight.position.set(-240, 220, 540)
    this.scene.add(this.fillLight)

    this.moonLight = new THREE.DirectionalLight(0xcbe0ff, 1.38)
    this.moonLight.position.set(340, 460, 280)
    this.moonLight.castShadow = true
    this.moonLight.shadow.mapSize.set(2048, 2048)
    this.moonLight.shadow.camera.near = 60
    this.moonLight.shadow.camera.far = 1600
    const d = 480
    this.moonLight.shadow.camera.left = -d
    this.moonLight.shadow.camera.right = d
    this.moonLight.shadow.camera.top = d
    this.moonLight.shadow.camera.bottom = -d
    this.moonLight.shadow.bias = -0.00035
    this.moonLight.shadow.normalBias = 0.40
    this.scene.add(this.moonLight)

    this.warmLight = new THREE.PointLight(0xffb060, 0, 720, 1.8)
    this.warmLight.position.set(0, 40, 220)
    this.scene.add(this.warmLight)
  }

  /** Renders weather-aware SVG portrait for active NPC at dorm steps as live 3D billboard sprite. */
  _buildNpcActor() {
    this.npcGroup = new THREE.Group()
    this.npcGroup.position.set(76, BASE_Y + 42, 126)
    this.scene.add(this.npcGroup)

    this.npcSpriteMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
    this.npcSprite = new THREE.Sprite(this.npcSpriteMat)
    this.npcSprite.scale.set(76, 76, 1)
    this.npcGroup.add(this.npcSprite)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(18, 16),
      new THREE.MeshBasicMaterial({ color: 0x050914, transparent: true, opacity: 0.45, depthWrite: false })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, -39, 0)
    this.npcGroup.add(shadow)

    this._refreshNpcSprite()
  }

  _refreshNpcSprite() {
    if (!this.npcSpriteMat) return
    const svg = renderNpcPortraitSvg(this.npcActorId, this.weather, this.season)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 256; c.height = 256
      const g = c.getContext('2d')
      g.beginPath()
      g.arc(128, 128, 118, 0, Math.PI * 2)
      g.clip()
      g.drawImage(img, 0, 0, 256, 256)
      g.strokeStyle = 'rgba(255, 228, 178, 0.85)'
      g.lineWidth = 8
      g.stroke()
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      if (this.npcSpriteMat.map) this.npcSpriteMat.map.dispose()
      this.npcSpriteMat.map = tex
      this.npcSpriteMat.needsUpdate = true
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.42, 0.90)
    this.composer.addPass(this.bloom)
    this.painterly = createPainterlyPass()
    this.composer.addPass(this.painterly)
    this.composer.addPass(new OutputPass())
  }

  // ---------------------------------------------------------------- public v4 APIs

  /** @param {string} npcId */
  setNpcActor(npcId) {
    if (!npcId || npcId === this.npcActorId) return
    this.npcActorId = npcId
    this._refreshNpcSprite()
  }

  /** @param {string} seasonId */
  setSeason(seasonId) {
    const def = seasonDef(seasonId)
    this.season = def.id
    const mainCol = new THREE.Color(def.leafMain)
    const accCol = new THREE.Color(def.leafAccent)
    for (const mat of this._leafMaterials) {
      if (mat.userData.leafRole === 'accent') mat.color.copy(accCol)
      else mat.color.copy(mainCol)
    }
    this._syncSnowVisibility()
    if (this.fireflyMat) {
      const pCol = def.id === 'spring' ? 0xffc6de
        : def.id === 'autumn' ? 0xffb358
        : def.id === 'winter' ? 0xdcf0ff
        : 0xffe48a
      this.fireflyMat.uniforms.color.value.set(pCol)
      this.fireflyMat.uniforms.size.value = def.id === 'spring' ? 16 : def.id === 'autumn' ? 17 : 13
    }
    this._refreshNpcSprite()
  }

  _syncSnowVisibility() {
    const showSnow = this.season === 'winter' || this.weather === 'snow'
    for (const mesh of this._snowNodes) mesh.visible = showSnow
    this._bakeShadows()
  }

  /**
   * Switch between the 4 Blender dormitory GLBs with an optional scenic campus flyover pan.
   * @param {string} dormId
   * @param {boolean} [instant]
   */
  async switchDorm(dormId, instant = false) {
    const def = dormDef(dormId)
    const changed = def.id !== this.dormId
    this.dormId = def.id
    const gltf = await this._loadGlb(def.modelUrl)
    if (this.dormId !== def.id) return

    const applyGlb = () => {
      if (gltf && gltf.scene) {
        this._mountDormGlb(gltf.scene, def.id)
      } else {
        this._buildProceduralDorm(def.id)
      }
      this.setCameraView(this.cameraView, instant)
    }

    if (instant || !changed) {
      applyGlb()
      return
    }

    const offset = new THREE.Vector3(...def.flyOffset)
    const midCam = this.camera.position.clone().add(offset).add(new THREE.Vector3(0, 140, 180))
    const view = VIEW_PRESETS[this.cameraView] || VIEW_PRESETS.stardew
    const endPos = this._adjustedViewPos(view.pos)
    const endLook = new THREE.Vector3(...view.look)
    let swapped = false
    this._cutscene = {
      from: this.camera.position.clone(),
      mid: midCam,
      to: endPos,
      lookFrom: this.controls.target.clone(),
      lookTo: endLook,
      t: 0,
      dur: 1.35,
      onMid: () => {
        if (!swapped) { swapped = true; applyGlb() }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1380))
  }

  /** @param {'front'|'stardew'|'street'|'rooftop'} viewId @param {boolean} [instant] */
  setCameraView(viewId, instant = false) {
    /** @type {'front'|'stardew'|'street'|'rooftop'} */
    const preset = VIEW_PRESETS[viewId] ? viewId : 'stardew'
    this.cameraView = preset
    const v = VIEW_PRESETS[preset]
    const to = this._adjustedViewPos(v.pos)
    const lookTo = new THREE.Vector3(...v.look)
    this.camera.fov = v.fov
    this.camera.updateProjectionMatrix()

    if (instant) {
      this._cutscene = null
      this.camera.position.copy(to)
      this.controls.target.copy(lookTo)
      this.controls.update()
      return
    }
    this._cutscene = {
      from: this.camera.position.clone(),
      to,
      lookFrom: this.controls.target.clone(),
      lookTo,
      t: 0,
      dur: 0.9
    }
  }

  _adjustedViewPos(pos) {
    const aspect = this.camera.aspect || 1
    const v = new THREE.Vector3(...pos)
    // Scale distance proportionally on narrow portrait viewports so all 6 columns remain visible
    if (aspect < 1.0) {
      const portraitZoom = Math.min(2.15, Math.max(1.10, 0.90 / Math.max(0.40, aspect)))
      v.multiplyScalar(portraitZoom)
    }
    if (this.dormId === 'grad') v.multiplyScalar(1.07)
    return v
  }

  /** Toggle slow living campus orbit for title screen. */
  setFlyover(enabled) {
    this._flyover = Boolean(enabled)
  }

  /**
   * Lock left-drag / single-finger orbit during gameplay so window swiping never spins the building.
   * Right-click drag, scroll-wheel zoom, and two-finger touch remain smoothly available.
   */
  setOrbitLocked(locked) {
    this._orbitLocked = Boolean(locked)
    this._applyOrbitMode()
  }

  _applyOrbitMode() {
    if (!this.controls) return
    if (this._orbitLocked) {
      // Fixed building mode: left-drag / 1-finger draws ribbons & connects windows; right-drag / 2-finger can still inspect
      this.controls.enabled = true
      this.controls.mouseButtons = {
        LEFT: /** @type {any} */ (null),
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      }
      this.controls.touches = {
        ONE: /** @type {any} */ (null),
        TWO: THREE.TOUCH.DOLLY_ROTATE
      }
    } else {
      // Free preview mode: left-drag / 1-finger rotates unless directly pressing on a window
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      }
      this.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_ROTATE
      }
      this.controls.enabled = !this._pointerOverWindow
    }
  }

  /** Play crisp 2.2s opening campus arrival fly-in cutscene. */
  playOpeningCutscene() {
    const v = VIEW_PRESETS[this.cameraView] || VIEW_PRESETS.stardew
    const to = this._adjustedViewPos(v.pos)
    const lookTo = new THREE.Vector3(...v.look)
    this.camera.position.set(460, 360, 1080)
    this.controls.target.set(0, 60, -40)
    this.controls.update()
    this._cutscene = {
      from: this.camera.position.clone(),
      to,
      lookFrom: this.controls.target.clone(),
      lookTo,
      t: 0,
      dur: 2.2
    }
    this.releaseLanterns(4)
    return 2200
  }

  // ---------------------------------------------------------------- windows

  _paintWindow(w) {
    const warm = this._target ? this._target.warm : 0xffc06a
    const lit = w.state !== WINDOW_STATES.DARK
    const isShader = Boolean(w.glass.material && /** @type {any} */ (w.glass.material).uniforms)

    if (isShader) {
      const key = w.state + '|' + warm
      if (w.texKey === key) return
      w.texKey = key
      w.backPanel.visible = false
      w.silhouette.visible = false

      const u = /** @type {any} */ (w.glass.material).uniforms
      let stateNum = 0.0
      if (w.state === WINDOW_STATES.LIT) stateNum = 1.0
      else if (w.state === WINDOW_STATES.GLIMMER) stateNum = 2.0
      else if (w.state === WINDOW_STATES.DECOY_BLUE) stateNum = 3.0
      else if (w.state === WINDOW_STATES.TARGET_HINT) stateNum = 4.0
      else if (w.state === WINDOW_STATES.CORRECT_GREEN) stateNum = 5.0
      else if (w.state === WINDOW_STATES.WRONG_AMBER) stateNum = 6.0
      else if (w.state === WINDOW_STATES.STORY_BEACON) stateNum = 7.0
      else if (w.state === WINDOW_STATES.RESONANCE_PAIR) stateNum = 8.0
      else if (w.state === WINDOW_STATES.SAFE_WARM) stateNum = 9.0

      u.uState.value = stateNum
      u.uPaletteRow.value = (w.state === WINDOW_STATES.DECOY_BLUE) ? 1.0 : 0.0
      u.uWarmColor.value.set(warm)
      if (this.camera && u.uCamLocal) {
        w.group.worldToLocal(this._tempLocalCam.copy(this.camera.position))
        u.uCamLocal.value.copy(this._tempLocalCam)
      }
    } else {
      const sil = RESIDENT_SILHOUETTES[w.roomId] || ['person', 'plant', 'cat', 'laundry', 'lamp', 'shelf', 'chat'][w.variant % 7]
      const key = w.state + '|' + warm + '|' + sil + '|' + w.variant
      if (w.texKey === key) return
      let tex = this._textures.get(key)
      if (!tex) {
        tex = windowTexture(192, w.state, warm, sil, w.variant)
        this._textures.set(key, tex)
        if (this._textures.size > 260) {
          const oldest = this._textures.keys().next().value
          const dead = this._textures.get(oldest)
          this._textures.delete(oldest)
          if (dead && dead.dispose) dead.dispose()
        }
      }
      w.texKey = key

      const glassMat = /** @type {THREE.MeshBasicMaterial} */ (w.glass.material)
      glassMat.map = tex
      glassMat.needsUpdate = true
      glassMat.color.set(lit ? 0xffffff : 0xa9c6ee)

      w.backPanel.visible = true
      const silMat = /** @type {THREE.MeshBasicMaterial} */ (w.silhouette.material)
      const backMat = /** @type {THREE.MeshBasicMaterial} */ (w.backPanel.material)
      w.silhouette.visible = lit && w.state !== WINDOW_STATES.DECOY_BLUE
      silMat.color.set(lit ? 0x2a1408 : 0x120e18)
      silMat.opacity = lit ? 0.85 : 0

      let backHex = warm
      if (w.state === WINDOW_STATES.DECOY_BLUE) backHex = 0x5288ff
      else if (w.state === WINDOW_STATES.SAFE_WARM) backHex = 0x7fd49a
      else if (w.state === WINDOW_STATES.CORRECT_GREEN) backHex = 0x4fd98c
      else if (w.state === WINDOW_STATES.WRONG_AMBER) backHex = 0xff7050
      else if (w.state === WINDOW_STATES.TARGET_HINT) backHex = 0xffe468
      backMat.color.set(lit ? backHex : 0x141020)
    }

    let glowHex = warm
    if (w.state === WINDOW_STATES.DECOY_BLUE) glowHex = 0x62a2ff
    else if (w.state === WINDOW_STATES.SAFE_WARM) glowHex = 0x90e4aa
    else if (w.state === WINDOW_STATES.CORRECT_GREEN) glowHex = 0x5ae696
    else if (w.state === WINDOW_STATES.WRONG_AMBER) glowHex = 0xff8866
    else if (w.state === WINDOW_STATES.TARGET_HINT) glowHex = 0xffee88
    w.glow.material.color.set(glowHex)

    w.target.glow = lit ? (w.state === WINDOW_STATES.LIT || w.state === WINDOW_STATES.TARGET_HINT ? 0.62 : 0.48) : 0
    w.target.halo = (w.state === WINDOW_STATES.GLIMMER || w.state === WINDOW_STATES.RESONANCE_PAIR || w.state === WINDOW_STATES.TARGET_HINT || w.state === WINDOW_STATES.DECOY_BLUE) ? 1 : 0
    w.target.beacon = w.state === WINDOW_STATES.STORY_BEACON ? 1 : 0

    this._syncSpillDecals()
  }

  /** @param {number|WindowRecord} target @param {string} state */
  setWindowState(target, state) {
    const w = typeof target === 'number' ? this.windows[target] : target
    if (!w || w.state === state) return
    w.state = state
    w.lit = state !== WINDOW_STATES.DARK
    if (w.lit) w.pulse = Math.max(w.pulse, 1)
    this._paintWindow(w)
  }

  /** @param {WindowRecord} w */
  litWindow(w) {
    if (!w || w.state === WINDOW_STATES.LIT) return false
    this.setWindowState(w, WINDOW_STATES.LIT)
    return true
  }

  /** @param {WindowRecord} w @param {number|string} [color] */
  burstAt(w, color) {
    w.glass.getWorldPosition(w.world)
    this.vfx.emitBurst(w.world, color ?? (this._target ? this._target.warm : 0xffd98a), 26, 0)
    this.vfx.emitBurst(w.world, 0xffe9c0, 6, 1)
  }

  /** @param {number} idx @param {number|string} [color] */
  burstWindow(idx, color) {
    const w = this.windows[idx]
    if (w) this.burstAt(w, color)
  }

  /**
   * C3 Golden wave sweep burst across all windows on a given floor / row.
   * @param {number} rowIndex 0-based row index or 1-based floor number
   */
  sweepFloor(rowIndex) {
    const targetRow = (rowIndex >= 1 && rowIndex <= 5) ? rowIndex - 1 : rowIndex
    const rowWindows = this.windows
      .filter(w => w.r === targetRow || Math.floor(w.roomId / 100) === (targetRow + 1))
      .sort((a, b) => a.c - b.c)

    const floorNum = targetRow + 1
    if (typeof this.highlightFloorSign === 'function') {
      this.highlightFloorSign(floorNum, true)
      setTimeout(() => {
        if (typeof this.highlightFloorSign === 'function') {
          this.highlightFloorSign(floorNum, false)
        }
      }, 2200)
    }

    rowWindows.forEach((w, colIdx) => {
      setTimeout(() => {
        this.burstAt(w, 0xffd700)
        if (this.vfx && this.vfx.emitBurst) {
          this.vfx.emitBurst(w.world, 0xfff0aa, 12, 1)
        }
      }, colIdx * 65)
    })
  }

  resetWindows() {
    for (const w of this.windows) {
      w.state = WINDOW_STATES.DARK
      w.lit = false
      w.pulse = 0
      w.cur.glow = 0; w.cur.halo = 0; w.cur.beacon = 0
      w.target.glow = 0; w.target.halo = 0; w.target.beacon = 0
      this._paintWindow(w)
    }
    this.lit = 0
    if (this.groundMat) this.groundMat.uniforms.glow.value = 0
    this.warmLight.intensity = 0
    if (this.doorGlow) this.doorGlow.material.opacity = 0.12
    if (this.doorLight) this.doorLight.intensity = 45
    this.clearResonancePair()
  }

  /** @param {Array<{ roomId: number, litTotal: number }>} heat */
  applyHeatmap(heat) {
    if (!Array.isArray(heat) || !heat.length) return
    const ranked = heat.slice().sort((a, b) => (b.litTotal || 0) - (a.litTotal || 0))
    for (const entry of ranked.slice(0, 9)) {
      const w = this.windows.find(x => x.roomId === Number(entry.roomId))
      if (!w || w.state !== WINDOW_STATES.DARK) continue
      this.setWindowState(w, WINDOW_STATES.GLIMMER)
      w.expiresAt = 0
    }
    this.setLitCount(this.windows.filter(w => w.state === WINDOW_STATES.LIT).length)
  }

  /** @param {number} n */
  setLitCount(n) {
    const total = Math.max(1, this.windows.length || 24)
    this.lit = Math.max(0, Math.min(total, n))
    const p = this.lit / total
    if (this.groundMat) this.groundMat.uniforms.glow.value = p
    if (this.puddleUniforms) this.puddleUniforms.uWarmGlow.value = p
    this.warmLight.intensity = p * 920
    this.warmLight.color.set(this._target ? this._target.warm : 0xffb060)
    if (this.doorGlow) this.doorGlow.material.opacity = 0.12 + p * 0.78
    if (this.doorLight) this.doorLight.intensity = 45 + p * 120
    this.bloom.strength = 0.45 + p * 0.17
    this.renderer.toneMappingExposure = 1.18 + p * 0.10
    this._syncSpillDecals()
  }

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

  get resonancePair() {
    return this._resonance ? { a: this._resonance.a, b: this._resonance.b } : null
  }

  actionableWindows() {
    return this.windows.filter(w =>
      w.state === WINDOW_STATES.GLIMMER ||
      w.state === WINDOW_STATES.STORY_BEACON ||
      w.state === WINDOW_STATES.RESONANCE_PAIR ||
      w.state === WINDOW_STATES.DECOY_BLUE
    )
  }

  // ----------------------------------------------------------------- input

  _getRect() {
    if (this._canvasRect && this._canvasRect.width > 0) return this._canvasRect
    this._canvasRect = this.renderer.domElement.getBoundingClientRect()
    return this._canvasRect
  }

  _screenToNdc(x, y) {
    const r = this._getRect()
    this._ndcVec.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    return { ndc: this._ndcVec, rect: r }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} [slack]
   * @returns {WindowRecord | null}
   */
  windowAt(x, y, slack = 0) {
    if (!this.windows.length) return null
    const ndc = this._screenToNdc(x, y).ndc
    this._raycaster.setFromCamera(ndc, this.camera)
    const meshes = this._glassMeshes.length === this.windows.length ? this._glassMeshes : (this._glassMeshes = this.windows.map(w => w.glass))
    const hits = this._raycaster.intersectObjects(meshes, false)
    if (!hits.length) {
      if (slack <= 0) return null
      let best = null
      let bestD = Infinity
      for (let i = 0; i < this.windows.length; i++) {
        const w = this.windows[i]
        const p = this.windowScreenRect(w)
        if (!p) continue
        const hitR = Math.max(slack, Math.max(p.w, p.h) * 0.58)
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < bestD && d <= hitR) { bestD = d; best = w }
      }
      return best
    }
    const idx = hits[0].object.userData.idx
    return this.windows[idx] || null
  }

  /** @param {WindowRecord} w */
  windowScreenPos(w) {
    if (!w || !w.glass) return null
    w.glass.getWorldPosition(w.world)
    const v = this._tmpProj.copy(w.world).project(this.camera)
    if (v.z > 1) return null
    const r = this._getRect()
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }
  }

  /** Projected center + approximate screen width/height of a window glass mesh. @param {WindowRecord} w */
  windowScreenRect(w) {
    if (!w || !w.glass) return null
    w.glass.getWorldPosition(w.world)
    const v = this._tmpProj.copy(w.world).project(this.camera)
    if (v.z > 1) return null
    const r = this._getRect()
    const cx = (v.x * 0.5 + 0.5) * r.width + r.left
    const cy = (-v.y * 0.5 + 0.5) * r.height + r.top
    const m = this.camera.matrixWorld.elements
    const hw = (w.winW || 34) * 0.5
    const hh = (w.winH || 44) * 0.5
    const v2 = this._tmpProj2.set(
      w.world.x + m[0] * hw + m[4] * hh,
      w.world.y + m[1] * hw + m[5] * hh,
      w.world.z + m[2] * hw + m[6] * hh
    ).project(this.camera)
    const pw = Math.max(28, Math.abs(v2.x - v.x) * r.width)
    const ph = Math.max(32, Math.abs(v2.y - v.y) * r.height)
    return { x: cx, y: cy, w: pw, h: ph }
  }

  magnetPoints() {
    const out = []
    for (const w of this.actionableWindows()) {
      const p = this.windowScreenPos(w)
      if (p) out.push(p)
    }
    return out
  }

  _onDown(e) {
    // Only treat primary button / touch as window interaction; let right-click / middle-click go straight to OrbitControls
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this._pointer.dragging = true
    this._pointer.x = e.clientX
    this._pointer.y = e.clientY
    const w = this.windowAt(e.clientX, e.clientY, 16)
    // In free-preview mode, suppress OrbitControls only when directly pressing on a window; in locked mode, OrbitControls LEFT/ONE is already disabled
    this._pointerOverWindow = Boolean(w)
    this._applyOrbitMode()
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
    this._pointerOverWindow = false
    this._applyOrbitMode()
    if (was && this.onPointerUp) this.onPointerUp(e.clientX ?? this._pointer.x, e.clientY ?? this._pointer.y)
  }

  // ----------------------------------------------------------------- theme & weather

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
    if (this._clouds) {
      const cCol = new THREE.Color(p.rim).lerp(new THREE.Color(p.warm), 0.35)
      for (const item of this._clouds) {
        /** @type {THREE.MeshBasicMaterial} */ (item.mesh.material).color.copy(cCol)
      }
    }
    if (this.groundMat) {
      this.groundMat.uniforms.c1.value.set(p.sky[0]).lerp(new THREE.Color(0x162b22), 0.45)
      this.groundMat.uniforms.c2.value.set(p.fog)
    }
    if (this.doorGlow) this.doorGlow.material.color.set(p.warm)
    this.warmLight.color.set(p.warm)
    if (this.lampConeMat) this.lampConeMat.uniforms.uColor.value.set(p.warm)
    if (this.mistUniforms) {
      this.mistUniforms.uColorA.value.set(p.fog).lerp(new THREE.Color(0xcfd9f6), 0.55)
      this.mistUniforms.uColorWarm.value.set(p.warm)
    }
    if (this.painterly) this.painterly.material.uniforms.tint.value.copy(new THREE.Color(p.fog))
    for (const w of this.windows) {
      w.texKey = ''
      this._paintWindow(w)
    }
  }

  /** @param {string} weather */
  setWeatherFx(weather) {
    this.weather = weather || 'clear'
    const isRain = this.weather === 'light_rain' || this.weather === 'rain'
    const isFog = this.weather === 'fog'
    const isSnow = this.weather === 'snow'

    this.rain.visible = isRain
    this.snow.visible = isSnow
    this.mistGroup.visible = isFog || this._fogStrength > 0.02
    this._rainTarget = isRain ? 0.68 : 0
    this._fogTarget = isFog ? 0.34 : 0
    this._windTarget = this.weather === 'wind' ? 3.0 : isSnow ? 0.9 : 0.3

    if (this.groundMat) this.groundMat.uniforms.wet.value = isRain ? 1 : 0
    if (this.aveLampHalos) {
      for (const sp of this.aveLampHalos) {
        const base = sp.userData.baseScale || (sp.userData.baseScale = sp.scale.x || 74)
        const baseOp = sp.userData.baseOpacity !== undefined ? sp.userData.baseOpacity : (sp.userData.baseOpacity = sp.material.opacity)
        sp.scale.setScalar(base * (isFog ? 1.65 : 1.0))
        sp.material.opacity = isFog ? Math.min(0.75, baseOp * 1.55) : baseOp
      }
    }

    const fog = /** @type {THREE.FogExp2} */ (this.scene.fog)
    const DENSITY = { light_rain: 0.00028, rain: 0.00028, fog: 0.00052, snow: 0.00026, wind: 0.00022, clear: 0.00023 }
    fog.density = DENSITY[this.weather] !== undefined ? DENSITY[this.weather] : 0.00023

    this._syncSnowVisibility()
    this._refreshNpcSprite()
  }

  setRain(value) { this._rainTarget = Math.max(0, Math.min(1, value)) }
  setDawn(t) { this._dawnTarget = Math.max(0, Math.min(1, t)) }
  pulseCameraFov(amount = 0.8) { this._fovImpulse = -Math.abs(amount) }
  setPaused(v) { this.paused = Boolean(v) }

  // ------------------------------------------------------------- cutscenes & surprises

  playEndingCutscene(endingId) {
    const look = new THREE.Vector3(0, 12, 0)
    let to = this.camera.position.clone()
    let lookTo = look.clone()
    let dur = 3500

    if (endingId === 'ENDING_C_STARGAZER') {
      to = new THREE.Vector3(-40, 210, 470); lookTo = new THREE.Vector3(-90, 250, -40); dur = 4200
    } else if (endingId === 'ENDING_D_HARMONY') {
      to = new THREE.Vector3(0, 40, 760); lookTo = new THREE.Vector3(0, 20, 0)
      this._harmonyUntil = performance.now() + 9600; dur = 3600
    } else if (endingId === 'ENDING_E_DAWN') {
      to = new THREE.Vector3(0, 90, 900); lookTo = new THREE.Vector3(0, 40, 0)
      this.setDawn(1); dur = 4200
    } else if (endingId === 'ENDING_A_WARMTH') {
      to = new THREE.Vector3(240, 140, 820); lookTo = new THREE.Vector3(0, 20, 0)
      this.releaseLanterns(6); dur = 3800
    } else {
      to = this._adjustedViewPos(VIEW_PRESETS.stardew.pos); lookTo = new THREE.Vector3(0, -10, 0); dur = 3200
    }

    this._cutscene = {
      from: this.camera.position.clone(),
      to,
      lookFrom: this.controls.target.clone(),
      lookTo,
      t: 0,
      dur: dur / 1000
    }
    return dur
  }

  resetCamera() {
    this._cutscene = null
    this._harmonyUntil = 0
    this._dawnTarget = 0
    this.setCameraView(this.cameraView, true)
  }

  shootingStar() {
    const from = new THREE.Vector3(-700, 420, -500)
    const to = new THREE.Vector3(500, 120, -600)
    for (let i = 0; i < 14; i++) {
      this.vfx.emitBurst(new THREE.Vector3().lerpVectors(from, to, i / 14), 0xfff4d0, 2, 2)
    }

    const segments = 16
    const ribbonVerts = (segments + 1) * 2
    const positions = new Float32Array(ribbonVerts * 3)
    const indices = new Uint16Array(segments * 6)

    const dir = new THREE.Vector3().subVectors(to, from).normalize()
    const camDir = new THREE.Vector3().subVectors(from, this.camera.position).normalize()
    const normal = new THREE.Vector3().crossVectors(dir, camDir).normalize()

    const maxW = 7.5
    for (let i = 0; i <= segments; i++) {
      const u = i / segments
      const pt = new THREE.Vector3().lerpVectors(from, to, u)
      const w = maxW * u
      const v0 = i * 2
      const v1 = i * 2 + 1

      positions[v0 * 3] = pt.x - normal.x * w
      positions[v0 * 3 + 1] = pt.y - normal.y * w
      positions[v0 * 3 + 2] = pt.z - normal.z * w

      positions[v1 * 3] = pt.x + normal.x * w
      positions[v1 * 3 + 1] = pt.y + normal.y * w
      positions[v1 * 3 + 2] = pt.z + normal.z * w
    }

    for (let i = 0; i < segments; i++) {
      const l0 = i * 2
      const r0 = i * 2 + 1
      const l1 = (i + 1) * 2
      const r1 = (i + 1) * 2 + 1
      const idx = i * 6
      indices[idx] = l0
      indices[idx + 1] = r0
      indices[idx + 2] = l1
      indices[idx + 3] = r0
      indices[idx + 4] = r1
      indices[idx + 5] = l1
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setIndex(new THREE.BufferAttribute(indices, 1))

    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff2c8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const streak = new THREE.Mesh(geom, mat)
    this.scene.add(streak)
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1400
      if (t >= 1) {
        this.scene.remove(streak); streak.geometry.dispose(); streak.material.dispose(); return
      }
      streak.material.opacity = 0.85 * (1 - t)
      requestAnimationFrame(step)
    }
    step()
  }

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
      this.roofCat.position.y = BASE_Y + 370 + Math.sin(t * 0.7) * 2
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
    if (this.bloom) {
      const bloomMul = this._qualityMode === 'ultra' ? 0.70 : 0.42
      this.bloom.setSize(Math.max(1, Math.floor(w * bloomMul)), Math.max(1, Math.floor(h * bloomMul)))
    }
    this._canvasRect = this.renderer.domElement.getBoundingClientRect()
    if (this.painterly) {
      this.painterly.material.uniforms.resolution.value.set(w, h)
      this.painterly.material.uniforms.paperScale.value = Math.min(2, Math.max(0.7, w / 1400))
    }
    const prevAspect = this.camera.aspect || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const portrait = this.camera.aspect < 1
    this.moonGroup.position.set(portrait ? 230 : 430, portrait ? 420 : 340, -900)
    if (Math.abs(prevAspect - this.camera.aspect) > 0.12 && !this._cutscene) {
      this.setCameraView(this.cameraView, true)
    }
  }

  tick() {
    const now = performance.now()
    const t = (now - this._t0) / 1000
    const dt = Math.min((now - this._lastNow) / 1000, 0.05)
    this._lastNow = now

    // Adaptive quality controller targeting 60+ FPS over a 60-frame rolling window (Features A1/A6)
    const dtMs = dt * 1000
    this._frameTimes[this._frameTimeIdx] = dtMs
    this._frameTimeIdx = (this._frameTimeIdx + 1) % 60
    this._frameCount = Math.min(60, this._frameCount + 1)

    if (this._qualityMode === 'auto' && this._frameCount >= 60) {
      let sum = 0
      for (let i = 0; i < 60; i++) sum += this._frameTimes[i]
      const avgMs = sum / 60

      if (avgMs > 19.8) {
        this._degradeTimer += dt
        this._upgradeTimer = 0
        if (this._degradeTimer >= 1.5 && this._quality > 0) {
          this.setQuality(this._quality - 1)
          this._degradeTimer = 0
        }
      } else if (avgMs < 15.0) {
        this._upgradeTimer += dt
        this._degradeTimer = 0
        if (this._upgradeTimer >= 3.5 && this._quality < 3) {
          this.setQuality(this._quality + 1)
          this._upgradeTimer = 0
        }
      } else {
        this._degradeTimer = Math.max(0, this._degradeTimer - dt)
        this._upgradeTimer = Math.max(0, this._upgradeTimer - dt)
      }
    }

    if (this._pondWaterMat && this._pondWaterMat.normalMap) {
      this._pondWaterMat.normalMap.offset.set((t * 0.022) % 1, (t * 0.016) % 1)
    }

    // Facade bloom, exposure & puddle glow easing linked to lit window ratio (zero alloc loop)
    const totalWins = Math.max(1, this.windows.length)
    let litWins = 0
    for (let i = 0; i < this.windows.length; i++) {
      if (this.windows[i].state !== WINDOW_STATES.DARK) litWins += 1
    }
    const pLit = litWins / totalWins
    const targetBloom = 0.45 + 0.17 * pLit
    const targetExposure = 1.18 + 0.10 * pLit
    if (this.bloom && this.bloom.enabled) {
      this.bloom.strength += (targetBloom - this.bloom.strength) * Math.min(1, dt * 2.5)
    }
    if (this.renderer) {
      this.renderer.toneMappingExposure += (targetExposure - this.renderer.toneMappingExposure) * Math.min(1, dt * 2.5)
    }
    if (this.puddleUniforms) {
      this.puddleUniforms.uWarmGlow.value += (pLit - this.puddleUniforms.uWarmGlow.value) * Math.min(1, dt * 2.5)
    }

    // Campus animated ecology details (Feature A5)
    if (this._acFans && this._acFans.length) {
      const fanDelta = dt * 9.0
      for (let i = 0; i < this._acFans.length; i++) {
        this._acFans[i].rotation.y += fanDelta
      }
    }

    if (this.flashlight) {
      if (this.flashlightMat) this.flashlightMat.uniforms.uTime.value = t
      const patrolCycle = t * (Math.PI * 2 / 18.0)
      this.flashlight.position.x = Math.sin(patrolCycle) * 220
      const sweepAngle = Math.sin(t * 1.8) * 0.35 + (Math.cos(patrolCycle) > 0 ? 0.3 : -0.3)
      this.flashlight.rotation.z = sweepAngle
    }

    if (this.roofCat) {
      const breathe = 1.0 + 0.04 * Math.sin(t * 2.2)
      this.roofCat.scale.set(1.25, 0.9 * breathe, 1.0)
      this.roofCat.position.y = BASE_Y + 370 + Math.sin(t * 1.1) * 1.5
    }

    // Update Interior Mapping uniforms only when camera moved or window is lit
    if (this._quality >= 0) {
      const camPos = this.camera.position
      const camMoved = this._lastCamPos.distanceToSquared(camPos) > 1e-4
      if (camMoved) this._lastCamPos.copy(camPos)

      for (let i = 0; i < this.windows.length; i++) {
        const w = this.windows[i]
        const mat = /** @type {any} */ (w.glass.material)
        if (!mat || !mat.uniforms) continue
        if (camMoved && mat.uniforms.uCamLocal) {
          w.group.worldToLocal(this._tempLocalCam.copy(camPos))
          mat.uniforms.uCamLocal.value.copy(this._tempLocalCam)
        }
        if (w.state !== WINDOW_STATES.DARK && mat.uniforms.uTime) {
          mat.uniforms.uTime.value = t
        }
      }
    }

    if (this._skyTo && this._skyT < 1) {
      this._skyT = Math.min(1, this._skyT + 0.02)
      const k = this._skyT * this._skyT * (3 - 2 * this._skyT)
      this.skyMat.uniforms.top.value.lerpColors(this._skyFrom.top, this._skyTo.top, k)
      this.skyMat.uniforms.mid.value.lerpColors(this._skyFrom.mid, this._skyTo.mid, k)
      this.skyMat.uniforms.bot.value.lerpColors(this._skyFrom.bot, this._skyTo.bot, k)
      this.scene.fog.color.lerpColors(this._skyFrom.fog, this._skyTo.fog, k)
    }

    this.starMat.uniforms.time.value = t
    if (this._clouds) {
      for (const c of this._clouds) {
        c.mesh.position.x = c.baseX + Math.sin(t * 0.04 + c.spd) * 85
      }
    }
    this.fireflyMat.uniforms.time.value = t
    this._windTimeUniform.value = t
    this._windStrength += (this._windTarget - this._windStrength) * Math.min(1, dt * 1.6)
    this._windStrengthUniform.value = this._windStrength
    if (this.lampConeMat) this.lampConeMat.uniforms.uTime.value = t

    this._dawn += (this._dawnTarget - this._dawn) * Math.min(1, dt * 1.2)
    this._rain += (this._rainTarget - this._rain) * Math.min(1, dt * 3)
    this._fogStrength += (this._fogTarget - this._fogStrength) * Math.min(1, dt * 2.2)

    if (this.mistUniforms) {
      this.mistUniforms.uTime.value = t
      this.mistUniforms.uOpacity.value = this._fogStrength
      this.mistGroup.visible = (this._quality >= 2) && (this._fogStrength > 0.015)
    }
    if (this.puddleUniforms) {
      this.puddleUniforms.uTime.value = t
      this.puddleUniforms.uRain.value = this._rain
    }

    if (this.npcGroup) {
      this.npcGroup.position.y = BASE_Y + 42 + Math.sin(t * 2.2) * 1.8
    }

    if (!this.paused) {
      const s = this._spring
      const k = 18, damp = 8.5
      s.vx += (k * (s.tx - s.x) - damp * s.vx) * dt
      s.vy += (k * (s.ty - s.y) - damp * s.vy) * dt
      s.x += s.vx * dt; s.y += s.vy * dt

      if (this._cutscene) {
        const c = this._cutscene
        c.t = Math.min(1, c.t + dt / c.dur)
        const e = c.t < 0.5 ? 4 * c.t * c.t * c.t : 1 - Math.pow(-2 * c.t + 2, 3) / 2
        if (c.mid) {
          if (c.t < 0.5) {
            const sub = c.t * 2
            const es = sub * sub * (3 - 2 * sub)
            this.camera.position.lerpVectors(c.from, c.mid, es)
          } else {
            if (c.onMid) c.onMid()
            const sub = (c.t - 0.5) * 2
            const es = sub * sub * (3 - 2 * sub)
            this.camera.position.lerpVectors(c.mid, c.to, es)
          }
        } else {
          this.camera.position.lerpVectors(c.from, c.to, e)
        }
        this.controls.target.lerpVectors(c.lookFrom, c.lookTo, e)
        this.camera.lookAt(this.controls.target)
        if (c.t >= 1) {
          this._cutscene = null
          this.controls.update()
        }
      } else if (this._flyover) {
        const radius = 840
        const angle = t * 0.14
        this.camera.position.set(
          Math.sin(angle) * 420,
          170 + Math.sin(t * 0.35) * 40,
          Math.cos(angle) * radius * 0.25 + 690
        )
        this.controls.target.set(0, -24, 0)
        this.camera.lookAt(this.controls.target)
      } else if (this.controls) {
        this.controls.update()
      }

      this._fovImpulse *= Math.pow(0.02, dt)
      const baseFov = (VIEW_PRESETS[this.cameraView] || VIEW_PRESETS.stardew).fov
      const targetFov = baseFov + this._fovImpulse
      if (Math.abs(this.camera.fov - targetFov) > 0.01) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12)
        this.camera.updateProjectionMatrix()
      }

      const parallaxX = s.x * 1.15
      const parallaxY = s.y * 0.75
      const harmony = this._harmonyUntil > performance.now()
      const lerp8 = Math.min(1, dt * 8)
      for (let i = 0; i < this.windows.length; i++) {
        const w = this.windows[i]
        if (w.pulse > 0) w.pulse = Math.max(0, w.pulse - dt * 2.2)
        const pop = 1 + 0.28 * w.pulse * Math.cos(18 * (1 - w.pulse))
        w.cur.glow += (w.target.glow - w.cur.glow) * lerp8
        w.cur.halo += (w.target.halo - w.cur.halo) * lerp8
        w.cur.beacon += (w.target.beacon - w.cur.beacon) * lerp8

        let glowOp = 0
        if (harmony) {
          const wave = 0.5 + 0.5 * Math.sin(t * 6 - w.idx * 0.45)
          glowOp = (w.lit ? 0.55 : 0) * (0.55 + wave * 0.9)
          w.glass.scale.setScalar(1 + wave * 0.06)
        } else {
          const flicker = w.state === WINDOW_STATES.LIT ? 0.86 + Math.sin(t * 3 + w.idx) * 0.09 : 1
          glowOp = w.cur.glow * flicker + w.pulse * 0.5
          w.glass.scale.setScalar(pop)
        }
        w.glow.visible = glowOp > 0.008
        if (w.glow.visible) w.glow.material.opacity = glowOp

        const haloOp = w.cur.halo * (0.55 + 0.45 * Math.sin(t * 2.8 + w.idx))
        w.halo.visible = haloOp > 0.008
        if (w.halo.visible) {
          w.halo.material.opacity = haloOp
          w.halo.material.rotation = t * 0.55 + w.idx * 0.3
        }

        w.beacon.visible = w.cur.beacon > 0.008
        if (w.beacon.visible) {
          w.beacon.material.opacity = w.cur.beacon
          w.beacon.position.y = w.home.y + 34 + Math.sin(t * 2.2 + w.idx) * 2.2
        }

        if (w.silhouette.visible) {
          w.backPanel.position.x = -parallaxX * 0.45
          w.silhouette.position.x = parallaxX * 0.35
          w.backPanel.position.y = -parallaxY * 0.30
          w.silhouette.position.y = parallaxY * 0.22
        }
        w.glass.position.x = parallaxX * 0.60
        w.glass.position.y = parallaxY * 0.38
      }

      const step60 = dt * 60
      if (this.snow.visible) {
        const arr = this.snow.geometry.attributes.position.array
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= (0.75 + (i % 7) * 0.06) * step60
          arr[i] += (Math.sin(t + i) * 0.35 + this._windStrength * 0.14) * step60
          if (arr[i + 1] < -210) arr[i + 1] = 400
          if (arr[i] > 600) arr[i] = -600
        }
        this.snow.geometry.attributes.position.needsUpdate = true
        this.snow.material.opacity = 0.78
      }
      if (this.rain.visible) {
        const arr = this.rain.geometry.attributes.position.array
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= 9.5 * step60
          arr[i] -= 1.2 * step60
          if (arr[i + 1] < -210) { arr[i + 1] = 400; arr[i] = (Math.random() - 0.5) * 1200 }
        }
        this.rain.geometry.attributes.position.needsUpdate = true
        this.rain.material.opacity = 0.48
      }

      if (this.moths) {
        const mothArr = this.moths.geometry.attributes.position.array
        for (let i = 0; i < mothArr.length / 3; i++) {
          const a = t * (0.7 + i * 0.09) + i * 1.7
          const r = 6 + (i % 4) * 3
          mothArr[i * 3] = Math.cos(a) * r
          mothArr[i * 3 + 1] = Math.sin(a * 1.3) * 10 - (i % 5) * 6
          mothArr[i * 3 + 2] = Math.sin(a) * r
        }
        this.moths.geometry.attributes.position.needsUpdate = true
      }
    }

    if (this._floorSigns) {
      for (const item of this._floorSigns.values()) {
        if (item.active) {
          const pulse = 1.0 + 0.12 * Math.sin(t * 8.0)
          item.sprite.scale.set(item.baseScale.x * 1.25 * pulse, item.baseScale.y * 1.25 * pulse, 1)
        }
      }
    }
    if (this._pings && this._pings.length > 0) {
      const nowMs = performance.now()
      for (let i = this._pings.length - 1; i >= 0; i--) {
        const p = this._pings[i]
        const prog = (nowMs - p.startedAt) / p.duration
        if (prog >= 1) {
          if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh)
          p.geom.dispose()
          p.mat.dispose()
          this._pings.splice(i, 1)
        } else {
          const s = 1.0 + 2.5 * prog
          p.mesh.scale.set(s, s, 1)
          p.mat.opacity = Math.pow(1 - prog, 1.3) * 0.95
        }
      }
    }

    if (this.vfx) this.vfx.update(t)
    if (this.painterly) {
      const u = this.painterly.material.uniforms
      u.time.value = t
      u.uRainAmount.value = this._rain
      u.uDawn.value = this._dawn
    }
    if (this._useComposer) {
      this.composer.render()
    } else {
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.scene, this.camera)
    }
  }

  dispose() {
    this._clearPings()
    this._clearFloorSigns()
    if (this.spillMesh) {
      if (this.spillMesh.parent) this.spillMesh.parent.remove(this.spillMesh)
      this.spillMesh.geometry.dispose()
      this.spillMesh.dispose()
      this.spillMesh = null
    }
    if (this._spillTex) this._spillTex.dispose()
    if (this._cloudTex) this._cloudTex.dispose()
    if (this._envTex) this._envTex.dispose()
    if (this._interiorAtlas) this._interiorAtlas.dispose()
    this.renderer.setAnimationLoop(null)
    document.removeEventListener('visibilitychange', this._onVis)
    if (this.controls) this.controls.dispose()
    if (this.vfx) this.vfx.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
  }
}
