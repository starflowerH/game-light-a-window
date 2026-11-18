import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// v3 painterly pipeline. Four looks fused into one fullscreen shader so the
// whole thing costs a single pass:
//   1. 4-sector Kuwahara filter  -> thick gouache colour clustering
//   2. dual-scale wobbled ink    -> hand-drawn coloured contours + gold rim
//   3. procedural linen impasto  -> canvas relief, grazing specular, warm paper
//   4. screen-space raindrops    -> wet glass refraction + dawn colour grade
// Everything is procedural: no extra render targets, no texture assets.
// Default path costs ~25 texture fetches per pixel; the rain branch is gated
// on the uRainAmount uniform so it collapses to zero when the sky is dry.

export const PainterlyShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 0.40 },
    time: { value: 0 },
    paperScale: { value: 1.0 },
    tint: { value: new THREE.Color(0x2a1c3a) },
    uRainAmount: { value: 0 },
    uDawn: { value: 0 },
    uKuwaharaRadius: { value: 0.95 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;

    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float strength;
    uniform float time;
    uniform float paperScale;
    uniform vec3 tint;
    uniform float uRainAmount;
    uniform float uDawn;
    uniform float uKuwaharaRadius;

    const vec3 INK_COLD = vec3(0.0784, 0.0941, 0.1804); // #14182e deep ultramarine
    const vec3 INK_WARM = vec3(0.2196, 0.1333, 0.0784); // #382214 warm burnt tea
    const vec3 INK_GOLD = vec3(1.0000, 0.7882, 0.5412); // #ffc98a moonlit gold rim
    const vec3 STUDIO_LIGHT = vec3(-0.5, 0.7, 0.5);     // raking studio lamp
    const float RELIEF = 3.0;                           // impasto slope gain

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    // --- cheap hashes (no trig, no texture lookups) -----------------------
    float hash21(vec2 p) {
      vec3 p3 = fract(p.xyx * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // two octaves, range 0..1 -- hand wobble / ink break-up / linen fibre
    float fbm2(vec2 p) {
      return vnoise(p) * 0.62 + vnoise(p * 2.07 + vec2(11.3, 5.7)) * 0.38;
    }

    // three octaves normalised back to 0..1 -- broad paper tone
    float fbm3(vec2 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        s += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return s * 1.1428;
    }

    float lumAt(sampler2D tex, vec2 uv) {
      return lum(texture2D(tex, uv).rgb);
    }

    // --- 1. 4-sector Kuwahara --------------------------------------------
    // 4 quadrants, 2x2 taps each (16 reads). The quadrant with the lowest
    // summed variance wins, which is what turns digital gradients into flat
    // palette-knife strokes without any moire.
    vec3 kuwahara(sampler2D tex, vec2 uv, vec2 px, float radius) {
      vec3 mean[4];
      vec3 sq[4];
      for (int k = 0; k < 4; k++) { mean[k] = vec3(0.0); sq[k] = vec3(0.0); }

      vec2 offsets[4];
      offsets[0] = vec2(-1.0, -1.0);
      offsets[1] = vec2(0.0, -1.0);
      offsets[2] = vec2(-1.0, 0.0);
      offsets[3] = vec2(0.0, 0.0);

      for (int k = 0; k < 4; k++) {
        for (int j = 0; j <= 1; j++) {
          for (int i = 0; i <= 1; i++) {
            vec2 sampleOffset = (offsets[k] + vec2(float(i), float(j))) * px * radius;
            vec3 c = texture2D(tex, uv + sampleOffset).rgb;
            mean[k] += c;
            sq[k] += c * c;
          }
        }
        mean[k] /= 4.0;
        sq[k] = abs(sq[k] / 4.0 - mean[k] * mean[k]);
      }

      float minVar = 1e6;
      vec3 best = mean[0];
      for (int k = 0; k < 4; k++) {
        float v = sq[k].r + sq[k].g + sq[k].b;
        if (v < minVar) { minVar = v; best = mean[k]; }
      }
      return best;
    }

    // --- 3a. woven linen height field ------------------------------------
    // H(u,v) = sin(u*wx)*cos(v*wy)*0.4 + fbm(uv*160)*0.6
    float canvasHeight(vec2 uv) {
      float fibre = fbm2(uv * (160.0 * paperScale));
      // the fibre phase warps the weave so the threads never read as a plaid
      float warpX = sin(uv.x * (430.0 * paperScale) + fibre * 2.2);
      float warpY = cos(uv.y * (497.0 * paperScale) + fibre * 1.7);
      float weave = warpX * warpY * (0.35 + 0.65 * fibre);
      return weave * 0.4 + fibre * 0.6;
    }

    // --- 4b. one Voronoi layer -------------------------------------------
    // Returns (vector to drop centre, squared distance, cell random).
    vec4 dropletCell(vec2 p, float cells) {
      vec2 q = p * cells;
      vec2 g = floor(q);
      vec2 f = fract(q);
      float best = 9.0;
      vec2 bestPos = vec2(0.0);
      float bestRnd = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          vec2 rnd = hash22(g + o);
          vec2 pos = o + rnd * 0.82 + 0.09 - f;
          float d = dot(pos, pos);
          if (d < best) { best = d; bestPos = pos; bestRnd = rnd.x; }
        }
      }
      return vec4(bestPos, best, bestRnd);
    }

    void main() {
      vec2 uv = vUv;
      vec2 px = 1.0 / max(resolution, vec2(1.0));

      vec3 baseCol = texture2D(tDiffuse, uv).rgb;
      float baseLum = lum(baseCol);

      // ---- 1. brush clustering -----------------------------------------
      // Radius shrinks on glowing window cores so silhouettes stay readable.
      float kr = max(0.6, uKuwaharaRadius * (1.0 - 0.62 * smoothstep(0.72, 0.96, baseLum)));
      vec3 paint = kuwahara(tDiffuse, uv, px, kr);

      // ---- 2. dual-scale hand-wobbled ink ------------------------------
      vec2 wob = vec2(
        fbm2(uv * 18.0),
        fbm2(uv * 18.0 + vec2(19.7, 7.3))
      ) - 0.5;
      vec2 brushUv = uv + wob * px * 1.6;

      float fL = lumAt(tDiffuse, brushUv - vec2(px.x, 0.0));
      float fR = lumAt(tDiffuse, brushUv + vec2(px.x, 0.0));
      float fD = lumAt(tDiffuse, brushUv - vec2(0.0, px.y));
      float fU = lumAt(tDiffuse, brushUv + vec2(0.0, px.y));
      float bL = lumAt(tDiffuse, brushUv - vec2(px.x * 2.2, 0.0));
      float bR = lumAt(tDiffuse, brushUv + vec2(px.x * 2.2, 0.0));
      float bD = lumAt(tDiffuse, brushUv - vec2(0.0, px.y * 2.2));
      float bU = lumAt(tDiffuse, brushUv + vec2(0.0, px.y * 2.2));

      float gFine = length(vec2(fR - fL, fU - fD));
      float gBroad = length(vec2(bR - bL, bU - bD));
      float edgeFine = smoothstep(0.16, 0.45, gFine);
      float edgeBroad = smoothstep(0.16, 0.45, gBroad);

      // dry-brush break-up: contours must look pulled by a hand, not a filter
      float inkNoise = fbm2(brushUv * 26.0);
      float inkAmt = clamp(max(edgeFine * 0.86, edgeBroad * 0.68) * (0.58 + 0.8 * inkNoise), 0.0, 1.0);
      inkAmt *= 1.0 - smoothstep(0.72, 0.95, baseLum); // never ink a lit window core

      // ink colour follows local colour temperature, never pure black
      float warmth = clamp((baseCol.r - baseCol.b) * 2.6 + 0.42, 0.0, 1.0);
      vec3 inkCol = mix(INK_COLD, INK_WARM, warmth);
      // grazing gold rim: keyed on the brightest tap so the moonlit side of an
      // edge gilds the shadow side too, the way a lamp rims a silhouette
      float nPeak = max(max(fL, fR), max(fD, fU));
      float rimBand = smoothstep(0.46, 0.80, nPeak) * (1.0 - smoothstep(0.90, 1.0, nPeak));
      inkCol = mix(inkCol, INK_GOLD, rimBand * (0.22 + 0.40 * edgeFine));
      paint = mix(paint, inkCol, inkAmt * 0.85);

      // ---- 3. impasto relief on the linen canvas -----------------------
      // 0.75px step keeps the tooth from aliasing into a hard screen door
      vec2 hp = px * 0.75;
      float h0 = canvasHeight(uv);
      float hx = canvasHeight(uv + vec2(hp.x, 0.0));
      float hy = canvasHeight(uv + vec2(0.0, hp.y));
      vec3 N = normalize(vec3((h0 - hx) * RELIEF, (h0 - hy) * RELIEF, 1.0));
      vec3 Lg = normalize(STUDIO_LIGHT);
      float ndl = dot(N, Lg);
      // paint tooth bites in mid-tones; lit glass keeps its clarity
      float tooth = 1.0 - 0.55 * smoothstep(0.55, 0.95, lum(paint));
      paint *= 1.0 + (ndl - 0.5025) * 0.20 * tooth; // 0.5025 = flat-normal baseline

      // grazing specular: thick paint only catches light where it is lit
      vec3 Hv = normalize(Lg + vec3(0.0, 0.0, 1.0));
      // only the ridges of the weave catch the lamp -> sparse paint glints
      float ridge = 0.25 + 0.75 * smoothstep(0.05, 0.95, h0);
      float spec = max(pow(max(dot(N, Hv), 0.0), 40.0) - 0.006, 0.0) * ridge;
      paint += vec3(1.0, 0.93, 0.80) * spec * (0.05 + 0.26 * smoothstep(0.15, 0.85, lum(paint)));

      // warm gouache paper undertone so shadows read as paint, not void
      float paperTone = fbm3(uv * (3.2 * paperScale) + vec2(time * 0.006, 0.0));
      vec3 creamPaper = vec3(0.93, 0.86, 0.71);   // rice-cream drawing paper
      vec3 parchment = vec3(0.40, 0.41, 0.49);    // warm parchment grey-blue
      vec3 under = mix(parchment, creamPaper, 0.35 + 0.5 * paperTone) * 0.55 + tint * 0.45;
      float shade = 1.0 - smoothstep(0.02, 0.42, lum(paint));
      paint += under * 0.085 * shade;

      // watercolour pooling: pigment settles and darkens along every edge
      float pool = smoothstep(0.05, 0.20, max(gFine, gBroad)) * (1.0 - inkAmt);
      paint *= 1.0 - pool * 0.13;

      vec3 col = mix(baseCol, paint, clamp(strength, 0.0, 1.0));

      // ---- dawn grade: night -> rose-gold sunrise ----------------------
      float dl = lum(col);
      vec3 dawnLift = mix(vec3(0.34, 0.22, 0.30), vec3(1.00, 0.84, 0.62), smoothstep(0.05, 0.85, dl));
      vec3 dawnCol = col * vec3(1.10, 1.00, 0.94) + dawnLift * (0.13 + 0.09 * smoothstep(0.55, 1.0, dl));
      col = mix(col, dawnCol, clamp(uDawn, 0.0, 1.0));

      // ---- 4. raindrops on the glass -----------------------------------
      if (uRainAmount > 0.001) {
        float mn = max(min(resolution.x, resolution.y), 1.0);
        vec2 spToUv = vec2(mn / max(resolution.x, 1.0), mn / max(resolution.y, 1.0));
        vec2 sp = (uv * resolution) / mn;

        // layer A: ~12-18 fat beads crawling down; layer B: fine mist beads
        vec4 cA = dropletCell(sp + vec2(0.0, -time * 0.050), 40.0);
        vec4 cB = dropletCell(sp * 1.37 + vec2(0.37, -time * 0.110), 96.0);

        // radii stay inside their cell so no bead gets sliced by a cell seam
        float rA = 0.15 + 0.07 * cA.w;
        float rB = 0.13 + 0.06 * cB.w;
        float dA = sqrt(cA.z);
        float dB = sqrt(cB.z);
        float mA = (1.0 - smoothstep(rA * 0.90, rA, dA)) * step(0.90, cA.w);
        float mB = (1.0 - smoothstep(rB * 0.88, rB, dB)) * step(0.82, cB.w);

        // sphere normals, layered so the two scales never align
        vec2 nOff = cA.xy / rA * mA + cB.xy / rB * mB * 0.55;
        float dropMask = clamp(mA + mB * 0.55, 0.0, 1.0);

        // refract, then carry the local painted delta across so the bead sits
        // inside the same tonal world instead of punching a grey hole
        vec3 wet = texture2D(tDiffuse, uv + nOff * spToUv * 0.018).rgb + (col - baseCol) * 0.9;
        // thin meniscus ring: the bright outline that makes a bead read as water
        float ringA = smoothstep(rA * 0.70, rA * 0.93, dA) * (1.0 - smoothstep(rA * 0.93, rA, dA)) * mA;
        float ringB = smoothstep(rB * 0.66, rB * 0.92, dB) * (1.0 - smoothstep(rB * 0.92, rB, dB)) * mB;
        wet += vec3(0.92, 0.88, 0.86) * (ringA + ringB * 0.5) * 0.10;

        // warm window reflection caught on the upper rim, cool shading below
        float rimA = smoothstep(0.10, 0.80, -cA.y / rA) * (1.0 - smoothstep(0.30, 1.0, dA / rA)) * mA;
        float rimB = smoothstep(0.10, 0.80, -cB.y / rB) * (1.0 - smoothstep(0.30, 1.0, dB / rB)) * mB;
        wet += vec3(1.0, 0.78, 0.46) * (rimA + rimB * 0.6) * 0.85;
        float underA = smoothstep(0.15, 0.85, cA.y / rA) * (1.0 - smoothstep(0.45, 1.0, dA / rA)) * mA;
        wet *= 1.0 - underA * 0.16;

        col = mix(col, wet, clamp(dropMask, 0.0, 1.0) * clamp(uRainAmount, 0.0, 1.0) * 0.85);
      }

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `
}

export function createPainterlyPass() {
  const pass = new ShaderPass(PainterlyShader)
  setPainterlyStyle(pass, 'stardew')
  pass.material.uniforms.uRainAmount.value = 0
  pass.material.uniforms.uDawn.value = 0
  return pass
}

/**
 * 切换后处理画风：'stardew' 保留像素砖瓦锐度，'oil' 使用强笔触油画感
 * @param {any} pass
 * @param {'stardew' | 'oil'=} mode
 */
export function setPainterlyStyle(pass, mode = 'stardew') {
  if (!pass?.material?.uniforms) return
  const u = pass.material.uniforms
  if (mode === 'oil') {
    u.strength.value = 0.55
    u.uKuwaharaRadius.value = 2.4
  } else {
    u.strength.value = 0.40
    u.uKuwaharaRadius.value = 0.95
  }
}
