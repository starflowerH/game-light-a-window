import * as THREE from 'three'

// Hand-brushed Stardew-Oil PBR texture synthesizer.
//
// Builds 256x256 organic oil-and-gouache diffuse + gentle normal textures with
// smooth painterly brushwork, subtle masonry course variation, terracotta shingle
// overlap, meadow clover specks, and water ripple caustics. Linear filtering +
// soft normal strength eliminate synthetic grid noise while preserving warmth.

const S = 256

/** @param {number} x @param {number} y @param {number} seed */
function hash2(x, y, seed = 1) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/** Smooth 2D value noise for organic gouache brush strokes. @param {number} x @param {number} y @param {number} seed */
function smoothNoise(x, y, seed = 1) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi & 255, yi & 255, seed)
  const b = hash2((xi + 1) & 255, yi & 255, seed)
  const c = hash2(xi & 255, (yi + 1) & 255, seed)
  const d = hash2((xi + 1) & 255, (yi + 1) & 255, seed)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/**
 * Convert a 2D heightfield [0..1] into a soft tangent-space normal DataTexture.
 * @param {Float32Array} heights
 * @param {number} strength
 * @param {number} [rep]
 * @returns {THREE.DataTexture}
 */
function heightsToNormalTexture(heights, strength = 1.35, rep = 2) {
  const data = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S
      const xr = (x + 1) % S
      const yd = (y - 1 + S) % S
      const yu = (y + 1) % S
      const dx = (heights[y * S + xl] - heights[y * S + xr]) * strength
      const dy = (heights[yd * S + x] - heights[yu * S + x]) * strength
      const nz = 1.0
      const len = Math.hypot(dx, dy, nz) || 1
      const i = (y * S + x) * 4
      data[i] = Math.round(((dx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(rep, rep)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/**
 * Build a paired hand-painted gouache color + soft normal texture set at 256x256.
 * @param {(x: number, y: number, brush: number) => [number, number, number, number]} pixelFn
 * @param {number} [repeat]
 * @param {number} [normalStrength]
 */
function buildGouachePbr(pixelFn, repeat = 2, normalStrength = 1.25) {
  const col = new Uint8Array(S * S * 4)
  const h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Soft horizontal painterly impasto brush variation
      const brush = (
        smoothNoise(x * 0.045, y * 0.14, 71) * 0.65 +
        smoothNoise(x * 0.11, y * 0.28, 103) * 0.35 - 0.5
      )
      const [r, g, b, ht] = pixelFn(x, y, brush)
      const idx = y * S + x
      h[idx] = Math.max(0, Math.min(1, ht + brush * 0.08))
      const i4 = idx * 4
      col[i4] = Math.max(0, Math.min(255, Math.round(r)))
      col[i4 + 1] = Math.max(0, Math.min(255, Math.round(g)))
      col[i4 + 2] = Math.max(0, Math.min(255, Math.round(b)))
      col[i4 + 3] = 255
    }
  }
  const map = new THREE.DataTexture(col, S, S, THREE.RGBAFormat)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.repeat.set(repeat, repeat)
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true

  const normalMap = heightsToNormalTexture(h, normalStrength, repeat)
  return { map, normalMap }
}

/** @returns {Record<string, { map: THREE.DataTexture, normalMap: THREE.DataTexture }>} */
export function createStardewTextureKit() {
  // 1. Hand-brushed masonry with warm feathered mortar instead of rigid grid lines
  const makeBrick = (baseRgb, mortarRgb, seed) => buildGouachePbr((x, y, brush) => {
    const warp = smoothNoise(x * 0.05, y * 0.05, seed + 5) * 1.4
    const wy = y + warp * 0.5
    const row = Math.floor(wy / 16)
    const offset = (row % 2) * 16
    const bx = (x + offset + warp * 0.4) % 32
    const by = wy % 16
    const mortarMask = (bx < 1.8 || by < 1.6) ? 1.0 : (bx < 3.0 || by < 2.6) ? 0.38 : 0.0
    const tile = Math.floor((x + offset) / 32)
    const tileTone = (hash2(tile, row, seed) - 0.5) * 26 + brush * 18
    const bevel = (by >= 1.6 && by < 4.0) ? 7 : (by > 13.5 ? -7 : 0)
    const br = baseRgb[0] + tileTone + bevel
    const bg = baseRgb[1] + tileTone * 0.86 + bevel
    const bb = baseRgb[2] + tileTone * 0.74 + bevel
    return [
      br * (1 - mortarMask) + (mortarRgb[0] + brush * 10) * mortarMask,
      bg * (1 - mortarMask) + (mortarRgb[1] + brush * 10) * mortarMask,
      bb * (1 - mortarMask) + (mortarRgb[2] + brush * 9) * mortarMask,
      0.72 * (1 - mortarMask) + 0.25 * mortarMask
    ]
  }, 1.8, 1.35)

  // 2. Painterly overlapped roof barrel shingles
  const makeShingles = (baseRgb, edgeRgb, seed) => buildGouachePbr((x, y, brush) => {
    const curve = Math.sin((x % 16) / 16 * Math.PI) * 1.8
    const wy = y + curve
    const row = Math.floor(wy / 18)
    const ox = (row % 2) * 8
    const sx = (x + ox) % 16
    const sy = wy % 18
    const lip = sy < 2.2 ? 0.72 : sy < 3.4 ? 0.28 : 0.0
    const col = Math.floor((x + ox) / 16)
    const tone = (hash2(col, row, seed) - 0.5) * 24 + brush * 18 + (sy >= 2.2 && sy < 6.0 ? 8 : 0) - (sx < 1.5 ? 6 : 0)
    return [
      (baseRgb[0] + tone) * (1 - lip) + edgeRgb[0] * lip,
      (baseRgb[1] + tone * 0.92) * (1 - lip) + edgeRgb[1] * lip,
      (baseRgb[2] + tone * 0.85) * (1 - lip) + edgeRgb[2] * lip,
      0.34 + (sy / 18) * 0.58 * (1 - lip)
    ]
  }, 2.4, 1.45)

  // 3. Soft cream gouache stucco plaster with warm painterly mottling
  const plaster = buildGouachePbr((x, y, brush) => {
    const cloud = (smoothNoise(x * 0.025, y * 0.025, 19) - 0.5) * 18
    const stroke = brush * 15
    return [222 + cloud + stroke, 210 + cloud * 0.95 + stroke * 0.9, 189 + cloud * 0.85 + stroke * 0.75, 0.5 + (cloud + stroke) * 0.01]
  }, 1.6, 0.75)

  // 4. Warm oiled oak timber planks
  const wood = buildGouachePbr((x, y, brush) => {
    const plank = Math.floor(y / 22)
    const py = y % 22
    if (py < 1.6) return [72, 46, 28, 0.22]
    const grain = Math.sin(y * 0.55 + smoothNoise(x * 0.03, y * 0.04, plank + 41) * 8.0) * 11 + brush * 14
    const plankTone = (hash2(plank, 0, 41) - 0.5) * 16
    return [
      142 + grain + plankTone,
      97 + (grain + plankTone) * 0.72,
      64 + (grain + plankTone) * 0.52,
      0.66 + grain * 0.012
    ]
  }, 1.6, 1.15)

  // 5. Rounded cobblestone promenade stones
  const cobble = buildGouachePbr((x, y, brush) => {
    const row = Math.floor(y / 20)
    const ox = (row % 2) * 12
    const cx = ((x + ox) % 24) / 24 - 0.5
    const cy = (y % 20) / 20 - 0.5
    const dist = Math.hypot(cx * 1.05, cy * 1.2)
    const seam = Math.max(0, Math.min(1, (dist - 0.44) / 0.14))
    const id = Math.floor((x + ox) / 24)
    const t = (hash2(id, row, 71) - 0.5) * 26 + brush * 14
    const dome = Math.max(0, 1 - dist * 1.4)
    return [
      (108 + t + dome * 12) * (1 - seam) + 56 * seam,
      (110 + t + dome * 12) * (1 - seam) + 58 * seam,
      (124 + t + dome * 10) * (1 - seam) + 68 * seam,
      0.24 + dome * 0.68
    ]
  }, 3.6, 1.45)

  // 6. Lush painterly Stardew meadow grass with warm flower/clover accents
  const grass = buildGouachePbr((x, y, brush) => {
    const patch = (smoothNoise(x * 0.025, y * 0.025, 91) - 0.5) * 24
    const blade = smoothNoise(x * 0.18, y * 0.14, 97)
    const flowerSeed = hash2(Math.floor(x / 8), Math.floor(y / 8), 137)
    const isBlossom = flowerSeed > 0.986 && (x % 8 > 2 && x % 8 < 5 && y % 8 > 2 && y % 8 < 5)
    if (isBlossom) {
      return flowerSeed > 0.993 ? [232, 206, 126, 0.72] : [206, 222, 186, 0.65]
    }
    const l = patch + brush * 14 + (blade > 0.72 ? 12 : 0)
    return [68 + l * 0.62, 114 + l * 0.95, 78 + l * 0.68, 0.45 + blade * 0.25]
  }, 6.0, 0.85)

  // 7. Moonlit campus lotus pond water with soft painterly ripples
  const pond = buildGouachePbr((x, y, brush) => {
    const wave = Math.sin(x * 0.09 + smoothNoise(x * 0.03, y * 0.03, 55) * 4.0) * 0.5 + 0.5
    const rip = smoothNoise(x * 0.06, y * 0.12, 63)
    const gleam = Math.max(0, wave * rip - 0.42) * 58
    return [
      38 + brush * 10 + gleam * 0.8,
      78 + brush * 14 + gleam * 0.95,
      104 + brush * 16 + gleam,
      0.42 + wave * 0.28
    ]
  }, 2.0, 0.7)

  return {
    Mat_Wall_BrickRed: makeBrick([172, 92, 74], [128, 112, 102], 11),
    Mat_Wall_BrickWarm: makeBrick([136, 148, 174], [102, 112, 134], 13),
    Mat_Wall_StoneGrad: makeBrick([164, 152, 140], [122, 114, 106], 17),
    Mat_Wall_Wing: makeBrick([170, 154, 142], [126, 116, 108], 23),
    Mat_Wall_Plaster: plaster,
    Mat_Roof_Terracotta: makeShingles([178, 82, 60], [108, 46, 34], 31),
    Mat_Roof_Slate: makeShingles([76, 86, 112], [44, 52, 70], 37),
    Mat_Roof_Moss: makeShingles([64, 108, 82], [38, 68, 50], 41),
    Mat_Wood_Warm: wood,
    Mat_Wood_Green: makeShingles([66, 116, 86], [42, 72, 54], 47),
    Mat_Ground_Cobble: cobble,
    Mat_Ground_Stone: cobble,
    Mat_Ground_Grass: grass,
    Mat_Pond_Water: pond
  }
}
