// Dial visuals: zones on the groove band (one shader), needle arm, sweep trail, ring flash.
// Angles: 0 = 12 o'clock, increasing clockwise as seen by the player. Radians.
import * as THREE from 'three';
import { PALETTE } from './scene.js';

export const DIAL = {
  R_IN: 0.62,       // groove band (matches Blender Dial_Vinyl)
  R_OUT: 0.92,
  FACE_Z: 0.08,     // vinyl front plane
  HUB_R: 0.455,     // needle base sits on the hub ring edge
  TIP_R: 1.0,       // needle tip just past the band
  MAX_ZONES: 6,
  PERFECT: 0.3,     // middle 30% of a zone
};

// Late-night palette
export const VIOLET = 0x7b8cff;      // needle beam + trail + sparkles
const EMBER = 0xffae2b;              // gold zones
const RECOVERY = 0x42ffa1;           // clutch recovery zone (mint-emerald)
const WARM_WHITE = 0xffe7a8;         // perfect core

const glow = (hex, k) => new THREE.Color(hex).multiplyScalar(k); // >1 = blooms

const vertexShader = /* glsl */`
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = /* glsl */`
  #define MAX_ZONES ${DIAL.MAX_ZONES}
  #define PI 3.14159265359
  #define TAU 6.28318530718
  uniform int uCount;
  uniform vec4 uZone[MAX_ZONES];    // x centre angle, y half width now, z half width at spawn, w kind (0 gold, 1 blue, 2 recovery)
  uniform vec2 uZoneFx[MAX_ZONES];  // x pop-in scale 0..1, y alpha (blink)
  uniform vec3 uGold, uBlue, uRec, uCore, uTrail, uFlash;
  uniform vec2 uGhost;              // x angle of last miss/graze, y alpha 0..1
  uniform vec3 uRipple;             // x angle, y progress 0..1, z active strength
  uniform float uNeedle, uDir, uTrailLen, uFlashAmt, uFlow, uRIn, uROut, uPerfect;
  varying vec2 vPos;

  float wrapA(float a) { return mod(a + PI, TAU) - PI; }

  void main() {
    float r = length(vPos);
    float th = atan(vPos.x, vPos.y);                       // clockwise from 12 o'clock
    float outerBound = smoothstep(uRIn - 0.048, uRIn - 0.038, r) * (1.0 - smoothstep(uROut + 0.045, uROut + 0.055, r));
    if (outerBound <= 0.0) discard;

    float band = smoothstep(uRIn, uRIn + 0.006, r) * (1.0 - smoothstep(uROut - 0.006, uROut, r));
    float rn = clamp((r - uRIn) / (uROut - uRIn), 0.0, 1.0);
    float radialEdge = smoothstep(0.0, 0.14, rn) * smoothstep(1.0, 0.86, rn);
    float grooves = 0.90 + 0.10 * sin(r * 440.0);          // concentric vinyl micro-grooves
    float bevel = (0.62 + 0.38 * radialEdge) * grooves;
    float aa = 0.0045 / r;                                 // crisp anti-aliased edge
    float line = 0.009 / r;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Anisotropic vinyl butterfly sheen + subtle groove track on the band
    float c1 = 0.5 + 0.5 * cos((th - 0.45) * 2.0);
    float c2 = 0.5 + 0.5 * cos(th - uNeedle);
    float anisoLobe = (c1 * c1) * (c1 * c1) * 0.65 + (c2 * c2 * c2) * (c2 * c2 * c2) * 0.85;
    vec3 vinylSheen = mix(vec3(0.10, 0.11, 0.16), vec3(0.24, 0.21, 0.32), anisoLobe) * grooves;
    col += vinylSheen * band * 0.42;
    alpha = max(alpha, band * 0.38 * (0.35 + 0.65 * anisoLobe));

    // 60 etched precision degree ticks on outer dial scale + 12 major ticks on inner hub scale
    float nearNeedle = exp(-abs(wrapA(th - uNeedle)) * 4.5);
    if (band < 0.99) {
      float outerTickR = smoothstep(uROut + 0.008, uROut + 0.012, r) * (1.0 - smoothstep(uROut + 0.032, uROut + 0.036, r));
      float majorOuter = smoothstep(uROut + 0.006, uROut + 0.010, r) * (1.0 - smoothstep(uROut + 0.042, uROut + 0.046, r));
      float tick60 = smoothstep(0.92, 0.985, cos(th * 60.0));
      float tick12 = smoothstep(0.95, 0.992, cos(th * 12.0));
      float rimTicks = max(outerTickR * tick60 * 0.55, majorOuter * tick12);
      float innerTickR = smoothstep(uRIn - 0.032, uRIn - 0.028, r) * (1.0 - smoothstep(uRIn - 0.010, uRIn - 0.006, r));
      float innerTicks = innerTickR * smoothstep(0.94, 0.99, cos(th * 24.0)) * 0.65;
      float allTicks = max(rimTicks, innerTicks);
      if (allTicks > 0.001) {
        vec3 tickCol = mix(vec3(0.45, 0.38, 0.30), uCore, nearNeedle * 0.85 + uFlow * 0.35);
        float tickA = allTicks * (0.32 + 0.62 * nearNeedle + 0.25 * uFlow);
        col += tickCol * tickA;
        alpha = max(alpha, tickA);
      }
    }

    if (band > 0.0) {
      // Flow State inner-rim golden aura
      if (uFlow > 0.001) {
        float flowRim = smoothstep(0.22, 0.0, rn) * uFlow * band;
        col += uGold * 0.45 * flowRim;
        alpha = max(alpha, flowRim * 0.48);
      }

      for (int i = 0; i < MAX_ZONES; i++) {
        if (i >= uCount) break;
        vec4 z = uZone[i];
        vec2 fx = uZoneFx[i];
        vec3 base = z.w > 1.5 ? uRec : (z.w > 0.5 ? uBlue : uGold);
        float d = abs(wrapA(th - z.x));

        // faint outline of the original size (only once the zone has shrunk)
        float shrunk = step(z.y + line * 1.5, z.z);
        float outline = (1.0 - smoothstep(line * 0.5, line, abs(d - z.z))) * shrunk * band;
        float outlineInside = (1.0 - smoothstep(z.z - aa, z.z, d)) * shrunk * 0.10 * band;
        col += base * 0.30 * (outline + outlineInside) * fx.y;
        alpha = max(alpha, (outline * 0.8 + outlineInside) * fx.y);

        float hw = z.y * fx.x;
        float halo = (1.0 - smoothstep(hw, hw + 0.024, d)) * step(hw, d) * band;
        col += base * 0.20 * halo * fx.y;
        alpha = max(alpha, halo * 0.24 * fx.y);
        float inside = (1.0 - smoothstep(hw - aa, hw, d)) * band;
        if (inside > 0.0) {
          float core = 1.0 - smoothstep(0.0, hw * 0.85, d);  // smooth warm gradient toward center
          float perf = 1.0 - smoothstep(hw * uPerfect - aa, hw * uPerfect, d);
          // 3D glass-inlay specular lip ridge along inner/outer & angular borders
          float lipR = (1.0 - smoothstep(0.0, 0.07, abs(rn - 0.10))) + (1.0 - smoothstep(0.0, 0.07, abs(rn - 0.90)));
          float lipA = 1.0 - smoothstep(0.0, aa * 2.6, abs(d - (hw - aa * 2.2)));
          vec3 c = mix(base * 0.82, uCore, core * 0.55 + perf * 0.45) * bevel;
          c += uCore * (lipR * 0.14 + lipA * 0.28);
          float edge = smoothstep(hw - aa * 5.0, hw - aa, d); // darkened burnished rim at angular ends
          c *= 1.0 - 0.46 * edge;
          col = mix(col, c, inside * fx.y);
          alpha = max(alpha, inside * fx.y);
        }
      }
    }

    // Expanding shockwave ripple on hits
    if (uRipple.z > 0.001 && band > 0.0) {
      float rd = abs(wrapA(th - uRipple.x));
      float waveR = uRipple.y * 0.95;
      float ringW = 1.0 - smoothstep(0.0, 0.065, abs(rd - waveR));
      float fade = (1.0 - uRipple.y) * uRipple.z * band;
      col += uFlash * ringW * fade * 0.85;
      alpha = max(alpha, ringW * fade * 0.75);
    }

    // Miss / Graze ghost tick mark: shows exact angle where the player clicked
    if (uGhost.y > 0.001 && band > 0.0) {
      float gd = abs(wrapA(th - uGhost.x));
      float tick = (1.0 - smoothstep(line * 0.5, line * 1.8, gd)) * band;
      float tickGlow = (1.0 - smoothstep(line, line * 5.5, gd)) * 0.35 * band;
      vec3 gCol = vec3(1.0, 0.32, 0.25) * (tick * 1.1 + tickGlow);
      col += gCol * uGhost.y;
      alpha = max(alpha, (tick * 0.95 + tickGlow) * uGhost.y);
    }

    // subtle, minimal sweep trail behind the needle
    float behind = wrapA(uNeedle - th) * uDir;
    if (behind > 0.0 && behind < uTrailLen && band > 0.0) {
      float t = 1.0 - behind / uTrailLen;
      t = t * t;
      col += uTrail * t * 0.20 * bevel * band;
      alpha = max(alpha, t * 0.22 * band);
    }

    // whole-band flash (hit colour / miss red)
    col += uFlash * uFlashAmt * 0.42 * bevel * band;
    alpha = max(alpha, uFlashAmt * 0.42 * band);

    gl_FragColor = vec4(col, alpha * outerBound);
  }`;

export function createDial(stage) {
  const group = new THREE.Group();
  group.name = 'DialFX';
  stage.scene.add(group);

  // ---- zone band
  const zoneUniforms = {
    uCount: { value: 0 },
    uZone: { value: Array.from({ length: DIAL.MAX_ZONES }, () => new THREE.Vector4()) },
    uZoneFx: { value: Array.from({ length: DIAL.MAX_ZONES }, () => new THREE.Vector2(1, 1)) },
    uGold: { value: glow(EMBER, 0.82) },
    uBlue: { value: glow(PALETTE.blue, 0.82) },
    uRec: { value: glow(RECOVERY, 0.88) },
    uCore: { value: glow(WARM_WHITE, 0.92) },
    uTrail: { value: glow(VIOLET, 0.75) },
    uFlash: { value: new THREE.Color(PALETTE.gold) },
    uGhost: { value: new THREE.Vector2(0, 0) },
    uRipple: { value: new THREE.Vector3(0, 0, 0) },
    uNeedle: { value: 0 },
    uDir: { value: 1 },
    uTrailLen: { value: 0.5 },
    uFlashAmt: { value: 0 },
    uFlow: { value: 0 },
    uRIn: { value: DIAL.R_IN },
    uROut: { value: DIAL.R_OUT },
    uPerfect: { value: DIAL.PERFECT },
  };
  const band = new THREE.Mesh(
    new THREE.RingGeometry(DIAL.R_IN - 0.05, DIAL.R_OUT + 0.058, 128, 1),
    new THREE.ShaderMaterial({
      uniforms: zoneUniforms, vertexShader, fragmentShader,
      transparent: true, depthWrite: false,
    }),
  );
  band.position.z = DIAL.FACE_Z + 0.004;
  band.renderOrder = 2;
  group.add(band);

  // ---- needle: tapered stylus arm from the hub edge to just past the band
  const needlePivot = new THREE.Group();
  needlePivot.position.z = 0.118;
  group.add(needlePivot);

  // Light-beam needle: razor-thin white-hot core + crisp slim glow + laser contact hotspot.
  const BEAM_W = 0.082;
  const beamLen = DIAL.TIP_R + 0.04 - (DIAL.HUB_R + 0.02);
  const beamGeo = new THREE.PlaneGeometry(BEAM_W, beamLen).translate(0, DIAL.HUB_R + 0.02 + beamLen / 2, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(VIOLET) }, uIntensity: { value: 1.85 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;              // 0 centre .. 1 edge
        float along = vUv.y;                            // 0 hub .. 1 tip
        float taper = mix(0.22, 0.10, along);           // razor-slim tapered laser stylus
        float core = exp(-pow(x / (taper * 0.12), 2.0));
        float glowW = exp(-pow(x / (taper * 0.65), 2.0)) * 0.36
                    + exp(-pow(x / (taper * 1.45), 2.0)) * 0.14;
        float tip = smoothstep(0.78, 0.97, along) * (1.0 - smoothstep(0.97, 1.0, along));
        // Laser contact hotspot right where the stylus beam crosses the groove band (along ~ 0.54)
        float hotspot = exp(-pow((along - 0.54) / 0.10, 2.0)) * exp(-pow(x / 0.22, 2.0)) * 0.55;
        float ends = smoothstep(0.0, 0.06, along) * (1.0 - smoothstep(0.985, 1.0, along));
        vec3 c = uColor * (glowW * 1.25 + tip * 0.9 + core * 0.7 + hotspot * 0.8) + vec3(1.0) * (core * 0.88 + hotspot * 0.5);
        gl_FragColor = vec4(c * uIntensity * ends, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.renderOrder = 4;
  needlePivot.add(beam);
  const needleMat = beamMat;   // kept name for the colour update below

  // small dark pivot collar on the hub ring + glowing laser collar ring
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.035, 32).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.35, metalness: 0.85 }),
  );
  collar.position.set(0, DIAL.HUB_R, 0.012);
  needlePivot.add(collar);

  const collarRingMat = new THREE.MeshBasicMaterial({ color: VIOLET });
  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.006, 12, 32), collarRingMat);
  collarRing.position.set(0, DIAL.HUB_R, 0.028);
  needlePivot.add(collarRing);

  const colors = {
    needle: new THREE.Color(VIOLET),
    boost: new THREE.Color(PALETTE.blue),
    flow: new THREE.Color(EMBER),
  };
  const flash = { amt: 0, rippleT: 1, rippleStrength: 0, rippleAngle: 0 };

  /**
   * view = {
   *   needleAngle, dir (+1 clockwise / -1), boost (bool),
   *   zones: [{ angle, half, baseHalf, kind: 'gold'|'blue'|'recovery', pop: 0..1, alpha: 0..1 }]
   * }
   */
  function update(dt, view) {
    needlePivot.rotation.z = -view.needleAngle;
    const tint = view.boost ? colors.boost : colors.needle;
    const glowK = stage.visuals?.glow ?? 1.0;
    needleMat.uniforms.uColor.value.lerp(tint, Math.min(1, dt * 14));
    needleMat.uniforms.uIntensity.value = ((view.boost ? 2.3 : 1.85) + (view.flow ? 0.25 : 0)) * glowK;
    collarRingMat.color.copy(view.flow ? colors.flow : needleMat.uniforms.uColor.value).multiplyScalar(1.35 * glowK);

    zoneUniforms.uNeedle.value = view.needleAngle;
    zoneUniforms.uDir.value = view.dir;
    zoneUniforms.uTrailLen.value = view.boost ? 0.55 : view.flow ? 0.32 : 0.16;
    zoneUniforms.uTrail.value.copy(tint).multiplyScalar(0.75);
    zoneUniforms.uFlow.value += ((view.flow ? 1 : 0) - zoneUniforms.uFlow.value) * Math.min(1, dt * 8);
    if (view.ghost) zoneUniforms.uGhost.value.set(view.ghost.angle, view.ghost.alpha);

    const n = Math.min(view.zones.length, DIAL.MAX_ZONES);
    zoneUniforms.uCount.value = n;
    for (let i = 0; i < n; i++) {
      const z = view.zones[i];
      const kindCode = z.kind === 'recovery' ? 2 : z.kind === 'blue' ? 1 : 0;
      zoneUniforms.uZone.value[i].set(z.angle, z.half, z.baseHalf, kindCode);
      zoneUniforms.uZoneFx.value[i].set(z.pop ?? 1, z.alpha ?? 1);
    }

    flash.amt = Math.max(0, flash.amt - dt / 0.28);
    zoneUniforms.uFlashAmt.value = flash.amt;
    if (flash.rippleT < 1) {
      flash.rippleT = Math.min(1, flash.rippleT + dt / 0.42);
      zoneUniforms.uRipple.value.set(flash.rippleAngle, flash.rippleT, flash.rippleStrength);
    } else {
      zoneUniforms.uRipple.value.z = 0;
    }
  }

  function ringFlash(colorHex, strength = 1, angle = zoneUniforms.uNeedle.value) {
    zoneUniforms.uFlash.value.set(colorHex).multiplyScalar(1.8);
    flash.amt = strength;
    flash.rippleAngle = angle;
    flash.rippleT = 0;
    flash.rippleStrength = strength;
  }

  return { group, update, ringFlash, needle: needlePivot };
}
