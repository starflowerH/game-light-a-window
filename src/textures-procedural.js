import * as THREE from 'three'

// High-Detail Hand-Brushed Stardew-Oil PBR Texture Synthesizer (512x512).
//
// Builds 512x512 organic oil-and-gouache diffuse + matched tangent-space normal
// textures with fine masonry coursing, weathered patina, overlapping barrel
// shingles, heartwood oak planks, rounded flagstones, wildflower clover grass,
// moonlit lotus pond caustics, and hand-troweled limestone trim.

const S = 512

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
 * Convert a 2D heightfield [0..1] into a crisp tangent-space normal DataTexture.
 * @param {Float32Array} heights
 * @param {number} strength
 * @param {number} [rep]
 * @returns {THREE.DataTexture}
 */
function heightsToNormalTexture(heights, strength = 1.35, rep = 2) {
  const data = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    const yd = ((y - 1 + S) % S) * S
    const y0 = y * S
    const yu = ((y + 1) % S) * S
    for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S
      const xr = (x + 1) % S
      const dx = (heights[y0 + xl] - heights[y0 + xr]) * strength
      const dy = (heights[yd + x] - heights[yu + x]) * strength
      const len = Math.hypot(dx, dy, 1.0) || 1
      const i = (y0 + x) * 4
      data[i] = Math.round(((dx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round(((1.0 / len) * 0.5 + 0.5) * 255)
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
 * Build a paired hand-painted gouache color + soft normal texture set at 512x512.
 * @param {(x: number, y: number, brush: number, micro: number) => [number, number, number, number]} pixelFn
 * @param {number} [repeat]
 * @param {number} [normalStrength]
 */
function buildGouachePbr(pixelFn, repeat = 2, normalStrength = 1.25) {
  const col = new Uint8Array(S * S * 4)
  const h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Multi-frequency painterly impasto stroke + bristle texture
      const brush = (
        smoothNoise(x * 0.025, y * 0.08, 71) * 0.60 +
        smoothNoise(x * 0.065, y * 0.16, 103) * 0.40 - 0.5
      )
      const micro = smoothNoise(x * 0.19, y * 0.19, 139) - 0.5
      const [r, g, b, ht] = pixelFn(x, y, brush, micro)
      const idx = y * S + x
      h[idx] = Math.max(0, Math.min(1, ht + brush * 0.07 + micro * 0.03))
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
  // 1. Artisan hand-laid masonry with fine clay pores, patina & beveled courses
  const makeBrick = (baseRgb, mortarRgb, seed) => buildGouachePbr((x, y, brush, micro) => {
    const warp = smoothNoise(x * 0.03, y * 0.03, seed + 5) * 1.9
    const wy = y + warp * 0.45
    const row = Math.floor(wy / 24)
    const offset = (row % 2) * 24
    const bx = (x + offset + warp * 0.35) % 48
    const by = wy % 24
    const mortarMask = (bx < 2.4 || by < 2.2) ? 1.0 : (bx < 4.2 || by < 3.6) ? 0.35 : 0.0
    const tile = Math.floor((x + offset) / 48)
    const patina = (smoothNoise(x * 0.014, y * 0.014, seed + 19) - 0.5) * 18
    const tileTone = (hash2(tile, row, seed) - 0.5) * 28 + brush * 17 + micro * 10 + patina
    const bevel = (by >= 2.2 && by < 5.6) ? 8 : (by > 20.5 ? -8 : 0)
    const br = baseRgb[0] + tileTone + bevel
    const bg = baseRgb[1] + tileTone * 0.86 + bevel
    const bb = baseRgb[2] + tileTone * 0.74 + bevel
    return [
      br * (1 - mortarMask) + (mortarRgb[0] + brush * 10 + micro * 7) * mortarMask,
      bg * (1 - mortarMask) + (mortarRgb[1] + brush * 10 + micro * 7) * mortarMask,
      bb * (1 - mortarMask) + (mortarRgb[2] + brush * 9 + micro * 6) * mortarMask,
      0.74 * (1 - mortarMask) + 0.24 * mortarMask
    ]
  }, 1.85, 1.45)

  // 2. Painterly overlapped barrel shingles with weathered tile edges & patina
  const makeShingles = (baseRgb, edgeRgb, seed) => buildGouachePbr((x, y, brush, micro) => {
    const curve = Math.sin((x % 24) / 24 * Math.PI) * 2.8
    const wy = y + curve
    const row = Math.floor(wy / 26)
    const ox = (row % 2) * 12
    const sx = (x + ox) % 24
    const sy = wy % 26
    const lip = sy < 3.0 ? 0.78 : sy < 4.8 ? 0.30 : 0.0
    const col = Math.floor((x + ox) / 24)
    const lichen = smoothNoise(x * 0.025, y * 0.025, seed + 29) > 0.68 ? 1 : 0
    const tone = (hash2(col, row, seed) - 0.5) * 26 + brush * 17 + micro * 8 +
      (sy >= 3.0 && sy < 9.0 ? 9 : 0) - (sx < 2.2 ? 8 : 0) - lichen * 7
    return [
      (baseRgb[0] + tone) * (1 - lip) + edgeRgb[0] * lip,
      (baseRgb[1] + tone * 0.94 + lichen * 5) * (1 - lip) + edgeRgb[1] * lip,
      (baseRgb[2] + tone * 0.85) * (1 - lip) + edgeRgb[2] * lip,
      0.32 + (sy / 26) * 0.60 * (1 - lip)
    ]
  }, 2.5, 1.55)

  // 3. Hand-troweled gouache lime plaster + stone architectural trim texture
  const plaster = buildGouachePbr((x, y, brush, micro) => {
    const cloud = (smoothNoise(x * 0.015, y * 0.015, 19) - 0.5) * 20
    const stroke = brush * 14 + micro * 7
    return [224 + cloud + stroke, 212 + cloud * 0.95 + stroke * 0.9, 191 + cloud * 0.85 + stroke * 0.75, 0.5 + (cloud + stroke) * 0.008]
  }, 1.8, 0.72)

  const limestoneTrim = buildGouachePbr((x, y, brush, micro) => {
    const seamY = (y % 64) < 2.0 ? 0.35 : 0.0
    const grain = (smoothNoise(x * 0.02, y * 0.02, 51) - 0.5) * 14 + brush * 10 + micro * 9
    return [
      (226 + grain) * (1 - seamY) + 178 * seamY,
      (219 + grain * 0.95) * (1 - seamY) + 171 * seamY,
      (206 + grain * 0.88) * (1 - seamY) + 160 * seamY,
      0.60 * (1 - seamY) + 0.25 * seamY
    ]
  }, 1.5, 0.65)

  // 4. Warm oiled oak timber planks with woodgrain knots & dowel nails
  const wood = buildGouachePbr((x, y, brush, micro) => {
    const plank = Math.floor(y / 32)
    const py = y % 32
    if (py < 2.2) return [68, 42, 24, 0.20]
    const knotWave = Math.sin(y * 0.34 + smoothNoise(x * 0.018, y * 0.025, plank + 41) * 9.5) * 12
    const grain = knotWave + brush * 14 + micro * 6
    const plankTone = (hash2(plank, 0, 41) - 0.5) * 18
    const bx = (x + plank * 73) % 128
    const nail = ((bx > 6 && bx < 10) && (py > 7 && py < 11 || py > 21 && py < 25)) ? -28 : 0
    return [
      146 + grain + plankTone + nail,
      99 + (grain + plankTone) * 0.73 + nail,
      64 + (grain + plankTone) * 0.52 + nail,
      0.68 + grain * 0.011
    ]
  }, 1.8, 1.25)

  // 5. Hand-set cobblestone avenue & stone flagstones with mossy mortar
  const cobble = buildGouachePbr((x, y, brush, micro) => {
    const row = Math.floor(y / 28)
    const ox = (row % 2) * 17
    const cx = ((x + ox) % 34) / 34 - 0.5
    const cy = (y % 28) / 28 - 0.5
    const dist = Math.hypot(cx * 1.04, cy * 1.18)
    const seam = Math.max(0, Math.min(1, (dist - 0.43) / 0.14))
    const id = Math.floor((x + ox) / 34)
    const moss = smoothNoise(x * 0.022, y * 0.022, 79) > 0.62 ? 1 : 0
    const t = (hash2(id, row, 71) - 0.5) * 28 + brush * 14 + micro * 8
    const dome = Math.max(0, 1 - dist * 1.35)
    return [
      (112 + t + dome * 14) * (1 - seam) + (52 - moss * 8) * seam,
      (114 + t + dome * 14) * (1 - seam) + (62 + moss * 14) * seam,
      (128 + t + dome * 11) * (1 - seam) + (66 - moss * 8) * seam,
      0.22 + dome * 0.72
    ]
  }, 3.6, 1.55)

  // 6. Lush painterly Stardew meadow grass with clover & tiny starry blooms
  const grass = buildGouachePbr((x, y, brush, micro) => {
    const patch = (smoothNoise(x * 0.014, y * 0.014, 91) - 0.5) * 26
    const blade = smoothNoise(x * 0.14, y * 0.11, 97)
    const flowerCell = hash2(Math.floor(x / 12), Math.floor(y / 12), 137)
    const fx = x % 12
    const fy = y % 12
    const isBlossom = flowerCell > 0.985 && Math.hypot(fx - 6, fy - 6) < 2.2
    if (isBlossom) {
      return flowerCell > 0.993 ? [238, 212, 130, 0.75] : flowerCell > 0.989 ? [220, 232, 198, 0.68] : [224, 178, 196, 0.68]
    }
    const l = patch + brush * 15 + micro * 9 + (blade > 0.68 ? 11 : 0)
    return [68 + l * 0.62, 118 + l * 0.96, 78 + l * 0.68, 0.45 + blade * 0.25]
  }, 6.2, 0.90)

  // 7. Moonlit campus lotus pond water with ripples & soft caustic shimmer
  const pond = buildGouachePbr((x, y, brush, micro) => {
    const wave = Math.sin(x * 0.055 + smoothNoise(x * 0.02, y * 0.02, 55) * 4.5) * 0.5 + 0.5
    const rip = smoothNoise(x * 0.04, y * 0.08, 63)
    const gleam = Math.max(0, wave * rip - 0.40) * 66
    return [
      36 + brush * 10 + micro * 5 + gleam * 0.85,
      80 + brush * 14 + micro * 6 + gleam * 0.98,
      110 + brush * 16 + micro * 6 + gleam,
      0.40 + wave * 0.34
    ]
  }, 2.2, 0.85)

  return {
    Mat_Wall_BrickRed: makeBrick([174, 92, 74], [130, 114, 104], 11),
    Mat_Wall_BrickWarm: makeBrick([136, 148, 176], [102, 114, 136], 13),
    Mat_Wall_StoneGrad: makeBrick([166, 154, 142], [122, 115, 108], 17),
    Mat_Wall_Wing: makeBrick([170, 154, 142], [126, 116, 108], 23),
    Mat_Wall_Plaster: plaster,
    Mat_Trim_Cream: limestoneTrim,
    Mat_Stone_Trim: limestoneTrim,
    Mat_Roof_Terracotta: makeShingles([180, 82, 60], [106, 44, 32], 31),
    Mat_Roof_Slate: makeShingles([76, 86, 114], [42, 50, 70], 37),
    Mat_Roof_Moss: makeShingles([64, 110, 82], [36, 66, 48], 41),
    Mat_Wood_Warm: wood,
    Mat_Wood_Green: makeShingles([66, 118, 86], [40, 70, 52], 47),
    Mat_Ground_Cobble: cobble,
    Mat_Ground_Stone: cobble,
    Mat_Ground_Grass: grass,
    Mat_Pond_Water: pond
  }
}
