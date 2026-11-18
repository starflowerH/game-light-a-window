import * as THREE from 'three'

// Stardew-3D Pixel-Painterly PBR texture synthesizer.
//
// Builds crisp, tileable diffuse + normal textures at a tactile 128x128 pixel
// grid resolution with subtle painterly brush variation. Applied to every GLB
// material loaded from Blender so buildings show brick courses, roof shingles,
// timber planks and cobblestone depth under real 3D lighting and shadows.

const S = 128

/** @param {number} x @param {number} y @param {number} seed */
function hash2(x, y, seed = 1) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/**
 * Convert a 2D heightfield [0..1] into a tangent-space normal DataTexture.
 * @param {Float32Array} heights
 * @param {number} strength
 * @param {number} [rep]
 * @returns {THREE.DataTexture}
 */
function heightsToNormalTexture(heights, strength = 2.4, rep = 2) {
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
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Build a paired pixel-painterly color + normal texture set.
 * @param {(x: number, y: number) => [number, number, number, number]} pixelFn returns [r, g, b, height01]
 * @param {number} [repeat]
 * @param {number} [normalStrength]
 */
function buildPixelPbr(pixelFn, repeat = 2, normalStrength = 2.2) {
  const col = new Uint8Array(S * S * 4)
  const h = new Float32Array(S * S)
  // Paint on a 64x64 pixel-art grid upscaled 2x so pixels read tactile & crisp
  const P = 64
  for (let py = 0; py < P; py++) {
    for (let px = 0; px < P; px++) {
      const [r, g, b, ht] = pixelFn(px, py)
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const x = px * 2 + sx
          const y = py * 2 + sy
          const idx = y * S + x
          const micro = (hash2(x, y, 7) - 0.5) * 0.04
          h[idx] = Math.max(0, Math.min(1, ht + micro))
          const i4 = idx * 4
          col[i4] = Math.max(0, Math.min(255, Math.round(r)))
          col[i4 + 1] = Math.max(0, Math.min(255, Math.round(g)))
          col[i4 + 2] = Math.max(0, Math.min(255, Math.round(b)))
          col[i4 + 3] = 255
        }
      }
    }
  }
  const map = new THREE.DataTexture(col, S, S, THREE.RGBAFormat)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.repeat.set(repeat, repeat)
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.needsUpdate = true

  const normalMap = heightsToNormalTexture(h, normalStrength, repeat)
  return { map, normalMap }
}

/** @returns {Record<string, { map: THREE.DataTexture, normalMap: THREE.DataTexture }>} */
export function createStardewTextureKit() {
  // 1. Brick wall (red / warm slate / modern stone)
  const makeBrick = (baseRgb, mortarRgb, seed) => buildPixelPbr((x, y) => {
    const row = Math.floor(y / 8)
    const offset = (row % 2) * 8
    const bx = (x + offset) % 16
    const by = y % 8
    const isMortar = bx === 0 || by === 0
    if (isMortar) return [mortarRgb[0], mortarRgb[1], mortarRgb[2], 0.15]
    const tile = Math.floor((x + offset) / 16)
    const tone = (hash2(tile, row, seed) - 0.5) * 24 + (hash2(x, y, seed + 3) - 0.5) * 10
    const bevel = (by === 1 || bx === 1) ? 10 : (by === 7 ? -10 : 0)
    return [
      baseRgb[0] + tone + bevel,
      baseRgb[1] + tone * 0.8 + bevel,
      baseRgb[2] + tone * 0.7 + bevel,
      0.72 + hash2(tile, row, seed) * 0.22
    ]
  }, 2.4, 2.8)

  // 2. Roof shingles (terracotta / slate / mossy)
  const makeShingles = (baseRgb, edgeRgb, seed) => buildPixelPbr((x, y) => {
    const row = Math.floor(y / 8)
    const ox = (row % 2) * 4
    const sx = (x + ox) % 8
    const sy = y % 8
    if (sy === 0) return [edgeRgb[0], edgeRgb[1], edgeRgb[2], 0.2]
    const col = Math.floor((x + ox) / 8)
    const tone = (hash2(col, row, seed) - 0.5) * 26 + (sy === 1 ? 12 : 0) - (sx === 0 ? 8 : 0)
    return [baseRgb[0] + tone, baseRgb[1] + tone, baseRgb[2] + tone, 0.35 + (sy / 8) * 0.55]
  }, 3.0, 3.0)

  // 3. Plaster stucco with subtle brushwork
  const plaster = buildPixelPbr((x, y) => {
    const n = (hash2(Math.floor(x / 2), Math.floor(y / 2), 19) - 0.5) * 14
    const speck = (hash2(x, y, 29) - 0.5) * 8
    return [218 + n + speck, 206 + n + speck, 184 + n + speck, 0.5 + (n + speck) * 0.012]
  }, 2.0, 1.3)

  // 4. Wood planks
  const wood = buildPixelPbr((x, y) => {
    const plank = Math.floor(y / 8)
    const py = y % 8
    if (py === 0) return [64, 42, 26, 0.18]
    const grain = Math.sin(x * 0.35 + hash2(plank, 0, 41) * 6.0) * 8 + (hash2(x, y, 43) - 0.5) * 10
    return [136 + grain, 94 + grain * 0.7, 62 + grain * 0.5, 0.65 + grain * 0.015]
  }, 2.0, 2.2)

  // 5. Cobblestone path
  const cobble = buildPixelPbr((x, y) => {
    const row = Math.floor(y / 10)
    const ox = (row % 2) * 6
    const cx = (x + ox) % 12
    const cy = y % 10
    const seam = cx === 0 || cy === 0 || (cx === 1 && cy === 1)
    if (seam) return [54, 58, 70, 0.12]
    const id = Math.floor((x + ox) / 12)
    const t = (hash2(id, row, 71) - 0.5) * 26
    const hi = cy === 1 ? 12 : 0
    return [102 + t + hi, 104 + t + hi, 118 + t + hi, 0.65 + (cy / 10) * 0.25]
  }, 4.0, 2.6)

  // 6. Grass & soil tufts (tactile Stardew turf)
  const grass = buildPixelPbr((x, y) => {
    const patch = hash2(Math.floor(x / 4), Math.floor(y / 4), 91)
    const blade = hash2(x, y, 97)
    const l = (patch - 0.5) * 18 + (blade > 0.85 ? 16 : 0)
    return [72 + l * 0.6, 112 + l, 82 + l * 0.7, 0.45 + (blade > 0.8 ? 0.35 : 0)]
  }, 8.0, 1.5)

  return {
    Mat_Wall_BrickRed: makeBrick([168, 86, 70], [116, 102, 92], 11),
    Mat_Wall_BrickWarm: makeBrick([134, 146, 174], [96, 104, 128], 13),
    Mat_Wall_StoneGrad: makeBrick([158, 148, 138], [110, 104, 98], 17),
    Mat_Wall_Wing: makeBrick([166, 150, 140], [118, 108, 102], 23),
    Mat_Wall_Plaster: plaster,
    Mat_Roof_Terracotta: makeShingles([172, 76, 56], [96, 38, 28], 31),
    Mat_Roof_Slate: makeShingles([72, 82, 108], [38, 44, 62], 37),
    Mat_Roof_Moss: makeShingles([60, 102, 78], [34, 60, 44], 41),
    Mat_Wood_Warm: wood,
    Mat_Wood_Green: makeShingles([62, 110, 82], [38, 66, 50], 47),
    Mat_Ground_Cobble: cobble,
    Mat_Ground_Stone: cobble,
    Mat_Ground_Grass: grass
  }
}
