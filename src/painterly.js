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
    uKuwaharaRadius: { value: 0.95 },
    uComboVignette: { value: 0 },
    uTiltShiftAmount: { value: 0.55 },
    uTiltShiftCenter: { value: 0.46 },
    uTiltShiftRange: { value: 0.24 },
    uFastMode: { value: 0.0 },
    uExposure: { value: 1.18 },
    uOutputToScreen: { value: 1.0 }
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
    uniform float uComboVignette;
    uniform float uTiltShiftAmount;
    uniform float uTiltShiftCenter;
    uniform float uTiltShiftRange;
    uniform float uFastMode;
    uniform float uExposure;
    uniform float uOutputToScreen;

    vec3 rrtAndOdtFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }

    vec3 acesFilmicToneMap(vec3 color, float exposure) {
      const mat3 ACESInputMat = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777)
      );
      const mat3 ACESOutputMat = mat3(
        vec3( 1.60475, -0.10208, -0.00327),
        vec3(-0.53108,  1.10813, -0.07276),
        vec3(-0.07367, -0.00605,  1.07602)
      );
      color *= exposure / 0.6;
      color = ACESInputMat * color;
      color = rrtAndOdtFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }

    vec3 linearToSRGBExact(vec3 rgb) {
      return mix(
        pow(max(rgb, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055),
        rgb * 12.92,
        vec3(lessThanEqual(rgb, vec3(0.0031308)))
      );
    }

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

    // fast 2-octave paper grain
    float fbmPaper(vec2 p) {
      return vnoise(p) * 0.65 + vnoise(p * 2.07 + vec2(4.1, 8.9)) * 0.35;
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

      vec3 c11 = texture2D(tDiffuse, uv).rgb;
      vec3 baseCol = c11;
      float baseLum = lum(baseCol);

      // ---- 1. tilt-shift radius + fused Kuwahara + Sobel ---------------
      float distFromFocal = abs(uv.y - uTiltShiftCenter);
      float dof = smoothstep(uTiltShiftRange * 0.5, uTiltShiftRange * 2.2, distFromFocal);
      float tiltRadius = uKuwaharaRadius * (1.0 + dof * 2.2 * uTiltShiftAmount);
      // Shrink radius on glowing window cores so interior silhouettes stay sharp
      float kr = max(0.6, tiltRadius * (1.0 - 0.62 * smoothstep(0.72, 0.96, baseLum)));
      vec2 stepK = px * kr;

      vec3 paint;
      float gFine;
      float gBroad;
      float nPeak;
      float mAvgLum;

      if (uFastMode > 0.5) {
        // Directional structure-aware oil-brush filter (7 taps)
        vec3 c01 = texture2D(tDiffuse, uv - vec2(stepK.x, 0.0)).rgb;
        vec3 c21 = texture2D(tDiffuse, uv + vec2(stepK.x, 0.0)).rgb;
        vec3 c10 = texture2D(tDiffuse, uv - vec2(0.0, stepK.y)).rgb;
        vec3 c12 = texture2D(tDiffuse, uv + vec2(0.0, stepK.y)).rgb;

        float l01 = lum(c01), l21 = lum(c21), l10 = lum(c10), l12 = lum(c12);
        float gx = l21 - l01;
        float gy = l12 - l10;
        gFine = length(vec2(gx, gy));
        gBroad = gFine * 0.85;
        nPeak = max(max(l01, l21), max(l10, l12));
        mAvgLum = (l01 + l21 + l10 + l12) * 0.25;

        vec2 tangent = gFine > 0.015 ? normalize(vec2(-gy, gx) + vec2(1e-5, 0.0)) : vec2(1.0, 0.0);
        vec3 cTanA = texture2D(tDiffuse, uv - tangent * stepK * 1.35).rgb;
        vec3 cTanB = texture2D(tDiffuse, uv + tangent * stepK * 1.35).rgb;
        vec3 strokeDir = (cTanA + c11 + cTanB) / 3.0;
        float varH = dot(abs(c21 - c01), vec3(1.0));
        float varV = dot(abs(c12 - c10), vec3(1.0));
        vec3 strokeAxis = varH < varV ? (c01 + c11 + c21) / 3.0 : (c10 + c11 + c12) / 3.0;
        vec3 bestStroke = mix(strokeAxis, strokeDir, smoothstep(0.02, 0.16, gFine));
        paint = mix(c11, bestStroke, 0.80 * (1.0 - smoothstep(0.22, 0.60, gFine)));
      } else {
        // Structure-tensor oriented Anisotropic 2x2 Kuwahara & Sobel
        float lL = lum(texture2D(tDiffuse, uv - vec2(stepK.x * 0.78, 0.0)).rgb);
        float lR = lum(texture2D(tDiffuse, uv + vec2(stepK.x * 0.78, 0.0)).rgb);
        float lD = lum(texture2D(tDiffuse, uv - vec2(0.0, stepK.y * 0.78)).rgb);
        float lU = lum(texture2D(tDiffuse, uv + vec2(0.0, stepK.y * 0.78)).rgb);
        float gx0 = lR - lL;
        float gy0 = lU - lD;
        float gBase = length(vec2(gx0, gy0));
        vec2 rawTan = gBase > 0.01 ? normalize(vec2(-gy0, gx0) + vec2(1e-5, 0.0)) : vec2(1.0, 0.0);
        vec2 tangent = normalize(mix(vec2(1.0, 0.0), rawTan, smoothstep(0.015, 0.09, gBase)));
        vec2 normal = vec2(-tangent.y, tangent.x);

        #define KUW_UV(ox, oy) (uv + (tangent * ((ox) * 1.35) + normal * ((oy) * 0.80)) * stepK)
        vec3 c00 = texture2D(tDiffuse, KUW_UV(-1.0, -1.0)).rgb;
        vec3 c10 = texture2D(tDiffuse, KUW_UV( 0.0, -1.0)).rgb;
        vec3 c20 = texture2D(tDiffuse, KUW_UV( 1.0, -1.0)).rgb;
        vec3 c01 = texture2D(tDiffuse, KUW_UV(-1.0,  0.0)).rgb;
        vec3 c21 = texture2D(tDiffuse, KUW_UV( 1.0,  0.0)).rgb;
        vec3 c02 = texture2D(tDiffuse, KUW_UV(-1.0,  1.0)).rgb;
        vec3 c12 = texture2D(tDiffuse, KUW_UV( 0.0,  1.0)).rgb;
        vec3 c22 = texture2D(tDiffuse, KUW_UV( 1.0,  1.0)).rgb;
        #undef KUW_UV

        vec3 m0 = (c00 + c10 + c01 + c11) * 0.25;
        vec3 m1 = (c10 + c20 + c11 + c21) * 0.25;
        vec3 m2 = (c01 + c11 + c02 + c12) * 0.25;
        vec3 m3 = (c11 + c21 + c12 + c22) * 0.25;

        vec3 s0 = (c00*c00 + c10*c10 + c01*c01 + c11*c11) * 0.25 - m0*m0;
        vec3 s1 = (c10*c10 + c20*c20 + c11*c11 + c21*c21) * 0.25 - m1*m1;
        vec3 s2 = (c01*c01 + c11*c11 + c02*c02 + c12*c12) * 0.25 - m2*m2;
        vec3 s3 = (c11*c11 + c21*c21 + c12*c12 + c22*c22) * 0.25 - m3*m3;

        float v0 = dot(abs(s0), vec3(1.0));
        float v1 = dot(abs(s1), vec3(1.0));
        float v2 = dot(abs(s2), vec3(1.0));
        float v3 = dot(abs(s3), vec3(1.0));

        float minVar = v0;
        paint = m0;
        if (v1 < minVar) { minVar = v1; paint = m1; }
        if (v2 < minVar) { minVar = v2; paint = m2; }
        if (v3 < minVar) { paint = m3; }

        mAvgLum = lum((m0 + m1 + m2 + m3) * 0.25);

        float l00 = lum(c00), l20 = lum(c20), l02 = lum(c02), l22 = lum(c22);
        float l01 = lum(c01), l21 = lum(c21), l10 = lum(c10), l12 = lum(c12);
        gFine = length(vec2(l21 - l01, l12 - l10));
        gBroad = length(vec2((l20 + l22) - (l00 + l02), (l02 + l22) - (l00 + l20))) * 0.5;
        nPeak = max(max(l01, l21), max(l10, l12));
      }

      // ---- 2. gentle warm sepia-pencil contour & sunlit gold rim ---------
      float edgeFine = smoothstep(0.20, 0.50, gFine);
      float edgeBroad = smoothstep(0.20, 0.50, gBroad);

      // dry-brush break-up: single vnoise pass saves ~70% ALU noise cost
      float inkNoise = vnoise(uv * 26.0);
      float inkAmt = clamp(max(edgeFine * 0.72, edgeBroad * 0.58) * (0.55 + 0.75 * inkNoise), 0.0, 1.0);
      inkAmt *= 1.0 - smoothstep(0.68, 0.94, baseLum);

      float warmth = clamp((baseCol.r - baseCol.b) * 2.6 + 0.48, 0.0, 1.0);
      vec3 inkCol = mix(INK_COLD * 1.15, INK_WARM * 1.25, warmth);
      float rimBand = smoothstep(0.46, 0.80, nPeak) * (1.0 - smoothstep(0.90, 1.0, nPeak));
      inkCol = mix(inkCol, INK_GOLD, rimBand * (0.28 + 0.44 * edgeFine));
      paint = mix(paint, inkCol, inkAmt * 0.68);

      // ---- 3. analytic impasto relief on the linen canvas --------------
      float fibre = vnoise(uv * (160.0 * paperScale));
      float wx = uv.x * (430.0 * paperScale) + fibre * 2.2;
      float wy = uv.y * (497.0 * paperScale) + fibre * 1.7;
      float sinX = sin(wx);
      float cosX = cos(wx);
      float sinY = sin(wy);
      float cosY = cos(wy);
      float weaveGain = 0.35 + 0.65 * fibre;
      float h0 = sinX * cosY * weaveGain * 0.4 + fibre * 0.6;
      float dHx = cosX * cosY * weaveGain * 0.4 * (430.0 * paperScale * px.x * 0.75);
      float dHy = -sinX * sinY * weaveGain * 0.4 * (497.0 * paperScale * px.y * 0.75);
      vec3 N = normalize(vec3(-dHx * RELIEF, -dHy * RELIEF, 1.0));
      vec3 Lg = normalize(STUDIO_LIGHT);
      float ndl = dot(N, Lg);
      float tooth = 1.0 - 0.55 * smoothstep(0.55, 0.95, lum(paint));
      paint *= 1.0 + (ndl - 0.5025) * 0.24 * tooth;

      vec3 Hv = normalize(Lg + vec3(0.0, 0.0, 1.0));
      float ridge = 0.25 + 0.75 * smoothstep(0.05, 0.95, h0);
      float spec = max(pow(max(dot(N, Hv), 0.0), 40.0) - 0.006, 0.0) * ridge;
      paint += vec3(1.0, 0.93, 0.80) * spec * (0.06 + 0.28 * smoothstep(0.15, 0.85, lum(paint)));

      // warm gouache paper undertone & candlelight honey wash
      float paperTone = fbmPaper(uv * (3.2 * paperScale) + vec2(time * 0.006, 0.0));
      vec3 creamPaper = vec3(0.96, 0.89, 0.74);
      vec3 parchment = vec3(0.45, 0.43, 0.52);
      vec3 under = mix(parchment, creamPaper, 0.42 + 0.50 * paperTone) * 0.58 + tint * 0.42;
      float shade = 1.0 - smoothstep(0.02, 0.48, lum(paint));
      paint += under * 0.115 * shade;
      paint += vec3(0.14, 0.08, 0.02) * smoothstep(0.45, 0.95, warmth) * 0.22;

      // watercolour pooling
      float pool = smoothstep(0.05, 0.20, max(gFine, gBroad)) * (1.0 - inkAmt);
      paint *= 1.0 - pool * 0.11;

      vec3 col = mix(baseCol, paint, clamp(strength, 0.0, 1.0));

      // ---- screen-space contact micro-AO for grounded eaves & plinths ----
      float valley = clamp((mAvgLum - baseLum) * 2.4, 0.0, 1.0) * (1.0 - smoothstep(0.50, 0.88, baseLum));
      col *= 1.0 - valley * 0.22;

      // ---- healing split-toning: soft indigo shadows & golden highlights ----
      float splitL = lum(col);
      vec3 shadowTint = mix(vec3(0.11, 0.12, 0.24), vec3(0.16, 0.19, 0.29), uDawn);
      vec3 highlightTint = mix(vec3(1.02, 0.91, 0.73), vec3(1.06, 0.93, 0.82), uDawn);
      vec3 graded = mix(col * shadowTint * 2.1, col * highlightTint, smoothstep(0.16, 0.76, splitL));
      col = mix(col, graded, 0.30);

      // ---- combo-driven vignette contraction ----------------------------
      if (uComboVignette > 0.001) {
        vec2 dVig = (uv - 0.5) * vec2(resolution.x / max(resolution.y, 1.0), 1.0);
        float rVig = dot(dVig, dVig);
        float vigRadius = mix(0.72, 0.38, uComboVignette);
        float vigSoft = mix(0.42, 0.20, uComboVignette);
        float vig = smoothstep(vigRadius, vigRadius - vigSoft, rVig);
        col *= mix(vec3(0.55, 0.60, 0.75), vec3(1.0), vig);
      }

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

      col = max(col, vec3(0.0));
      if (uOutputToScreen > 0.5) {
        col = linearToSRGBExact(acesFilmicToneMap(col, uExposure));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `
}

export function createPainterlyPass() {
  const pass = new ShaderPass(PainterlyShader)
  setPainterlyStyle(pass, 'stardew')
  pass.material.uniforms.uRainAmount.value = 0
  pass.material.uniforms.uDawn.value = 0
  pass.material.uniforms.uComboVignette.value = 0
  pass.material.uniforms.uExposure.value = 1.18
  pass.material.uniforms.uOutputToScreen.value = 1.0
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
    u.strength.value = 0.58
    u.uKuwaharaRadius.value = 2.15
  } else {
    u.strength.value = 0.44
    u.uKuwaharaRadius.value = 1.18
  }
}

/**
 * 设置连击驱动暗角收缩
 * @param {any} pass
 * @param {number} comboStreak
 */
export function setComboVignette(pass, comboStreak) {
  if (!pass?.material?.uniforms?.uComboVignette) return
  const norm = Math.min(1.0, Math.max(0.0, (comboStreak || 0) / 15.0))
  pass.material.uniforms.uComboVignette.value = norm
}
