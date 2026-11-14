import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// Watercolor / gouache look: ink edges (Sobel), tonal posterization,
// paper grain and a warm wash. Tuned for a cozy storybook night.
export const PainterlyShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 1.0 },
    time: { value: 0 },
    paperScale: { value: 1.0 },
    tint: { value: new THREE.Color(0x2a1c3a) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
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

    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    // fbm value noise for paper
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.0; a*=0.5; } return s; }

    float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

    void main(){
      vec2 uv = vUv;
      vec2 px = 1.0 / resolution;

      // slight hand-painted wobble so straight cuts feel brushed
      vec2 wob = vec2(fbm(uv*6.0 + time*0.02), fbm(uv*6.0 + 17.3 - time*0.02)) - 0.5;
      vec2 suv = uv + wob * px * 0.75;

      vec3 col = texture2D(tDiffuse, suv).rgb;

      // --- ink edge detection (Sobel on luminance) ---
      vec3 tl = texture2D(tDiffuse, suv + px*vec2(-1.0,-1.0)).rgb;
      vec3 tc = texture2D(tDiffuse, suv + px*vec2( 0.0,-1.0)).rgb;
      vec3 tr = texture2D(tDiffuse, suv + px*vec2( 1.0,-1.0)).rgb;
      vec3 ml = texture2D(tDiffuse, suv + px*vec2(-1.0, 0.0)).rgb;
      vec3 mr = texture2D(tDiffuse, suv + px*vec2( 1.0, 0.0)).rgb;
      vec3 bl = texture2D(tDiffuse, suv + px*vec2(-1.0, 1.0)).rgb;
      vec3 bc = texture2D(tDiffuse, suv + px*vec2( 0.0, 1.0)).rgb;
      vec3 br = texture2D(tDiffuse, suv + px*vec2( 1.0, 1.0)).rgb;
      float gx = -lum(tl) - 2.0*lum(ml) - lum(bl) + lum(tr) + 2.0*lum(mr) + lum(br);
      float gy = -lum(tl) - 2.0*lum(tc) - lum(tr) + lum(bl) + 2.0*lum(bc) + lum(br);
      float edge = smoothstep(0.12, 0.42, sqrt(gx*gx+gy*gy));
      // only darken edges on the darker side for ink, not on glowing windows
      float glowMask = smoothstep(0.55, 0.85, lum(col));
      edge *= (1.0 - glowMask*0.7);

      // --- very light tonal banding (keep it subtle, avoid moiré) ---
      vec3 band = col;
      // warm paper base so shadows read as gouache, not black void
      vec3 paperBase = vec3(0.09,0.075,0.11);
      band = mix(band, max(band, paperBase*1.1), 0.35);
      // watercolor pooling: darken slightly where color is dense, lighten highlights
      float dens = fbm(uv*9.0);
      band *= (0.94 + dens*0.12);

      // --- warm watercolor wash on shadows ---
      float shade = smoothstep(0.0, 0.45, 1.0 - lum(band));
      band = mix(band, band*0.9 + tint*0.1, shade*0.35);

      // --- paper grain ---
      float grain = fbm(uv*140.0*paperScale);
      float paper = 0.975 + grain*0.05;
      band *= paper;

      // --- soft painterly light bleed around bright areas ---
      vec3 bleed = (tc+ml+mr+bc)*0.25;
      float bl2 = smoothstep(0.7, 1.0, lum(bleed));
      band += bleed * bl2 * 0.06;

      // apply ink lines (lightened: keep some color, don't go pure black)
      vec3 ink = vec3(0.10,0.09,0.16);
      band = mix(band, ink, edge*0.4);

      // gentle vignette + contrast lift
      float v = smoothstep(1.15, 0.35, length(uv-0.5));
      band *= mix(0.82, 1.0, v);
      band = pow(band, vec3(1.02));

      col = mix(col, band, strength);
      gl_FragColor = vec4(col, 1.0);
    }
  `
}

export function createPainterlyPass() {
  const pass = new ShaderPass(PainterlyShader)
  pass.material.uniforms.strength.value = 0.8
  return pass
}
