// Effects and late-night studio reactions. Everything is short (<= 0.3 s) and stays off the dial.
import * as THREE from 'three';
import { PALETTE, dialPoint } from './scene.js';
import { VIOLET } from './dial.js';

const MAX_PARTICLES = 320;
const DUST_COUNT = 40;
const SHACKLE_OPEN = 0.38;       // shackle lifted while the lock is "being picked"
const SPARK_RATE = 20;         // delicate sparkles per second from the needle tip while playing
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Soft additive dots with per-particle size and twinkle. Used for bursts, the needle sparkle trail and dust.
function makeParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute float size; attribute float seed; attribute float alpha;
      uniform float uTime, uScale;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.65 + 0.35 * sin(uTime * (9.0 + seed * 14.0) + seed * 40.0);   // twinkle
        vColor = color; vAlpha = alpha * tw;
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float core = exp(-r * r * 9.0);
        float star = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 6.0) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 6.0);
        float a = (core + star * 0.35) * vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function particleBuffers(n) {
  const geo = new THREE.BufferGeometry();
  const b = {
    pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n),
    seed: new Float32Array(n), alpha: new Float32Array(n),
    vel: new Float32Array(n * 3), life: new Float32Array(n), maxLife: new Float32Array(n), geo,
  };
  for (let i = 0; i < n; i++) b.seed[i] = Math.random();
  const dynAttr = (arr, itemSize) => new THREE.BufferAttribute(arr, itemSize).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', dynAttr(b.pos, 3));
  geo.setAttribute('color', dynAttr(b.col, 3));
  geo.setAttribute('size', dynAttr(b.size, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(b.seed, 1));
  geo.setAttribute('alpha', dynAttr(b.alpha, 1));
  return b;
}

export function createFx(stage, dom) {
  const { scene, camera, parts, lights, grade, rig, renderer, viewport } = stage;
  const pMat = makeParticleMaterial();

  // ---------- event particles + needle sparkles
  const P = particleBuffers(MAX_PARTICLES);
  const points = new THREE.Points(P.geo, pMat);
  points.frustumCulled = false; points.renderOrder = 5;
  scene.add(points);
  let cursor = 0;
  const tmpCol = new THREE.Color();

  let pDirty = false;
  function spawn(o, vx, vy, vz, colorHex, k, size, lifeS) {
    const i = cursor; cursor = (cursor + 1) % MAX_PARTICLES;
    tmpCol.set(colorHex).multiplyScalar(k);
    P.pos.set([o.x, o.y, o.z], i * 3);
    P.vel.set([vx, vy, vz], i * 3);
    P.col.set([tmpCol.r, tmpCol.g, tmpCol.b], i * 3);
    P.size[i] = size; P.life[i] = lifeS; P.maxLife[i] = lifeS;
    pDirty = true;
  }

  const o3 = new THREE.Vector3();
  function burst(angle, colorHex, count, speed) {
    dialPoint(angle, 0.92, 0.16, o3);
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
      spawn(o3, Math.cos(a) * s, Math.sin(a) * s, Math.random() * 0.6 * s, colorHex, 2.6,
        0.05 + Math.random() * 0.06, 0.35 + Math.random() * 0.35);
    }
  }

  let sparkAcc = 0;
  const SPARK_COLORS = [VIOLET, VIOLET, 0xc9c0ff, 0xffffff];
  function emitSparkles(dt, s) {
    const rate = s.mode === 'play' && !s.paused ? SPARK_RATE : s.mode === 'title' ? 14 : 0;
    sparkAcc += rate * dt;
    while (sparkAcc >= 1) {
      sparkAcc -= 1;
      const r = 0.7 + Math.random() * 0.32;
      dialPoint(s.needleAngle, r, 0.14, o3);
      // drift outward + slightly behind the needle's motion
      const out = 0.15 + Math.random() * 0.35;
      const tang = -s.dir * (0.1 + Math.random() * 0.25);
      const ca = Math.cos(s.needleAngle), sa = Math.sin(s.needleAngle);
      const c = s.boost ? (Math.random() < 0.7 ? PALETTE.blue : 0xffffff) : SPARK_COLORS[(Math.random() * 4) | 0];
      spawn(o3, sa * out + ca * tang, ca * out - sa * tang, Math.random() * 0.15, c, 2.4,
        0.03 + Math.random() * 0.045, 0.5 + Math.random() * 0.4);
    }
  }

  function updateParticles(dt) {
    const drag = Math.exp(-dt * 2.2);
    let maxAlive = -1;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (P.life[i] <= 0) {
        if (P.alpha[i] !== 0) P.alpha[i] = 0;
        continue;
      }
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        P.alpha[i] = 0;
        continue;
      }
      maxAlive = i;
      const idx = i * 3;
      P.vel[idx] *= drag;
      P.vel[idx + 1] *= drag;
      P.vel[idx + 2] *= drag;
      P.pos[idx] += P.vel[idx] * dt;
      P.pos[idx + 1] += P.vel[idx + 1] * dt;
      P.pos[idx + 2] += P.vel[idx + 2] * dt;
      const t = P.life[i] / P.maxLife[i];                 // 1 -> 0
      P.alpha[i] = Math.max(0, Math.min(1, t * 1.6)) * Math.min(1, (1 - t) * 8);
    }
    P.geo.setDrawRange(0, maxAlive + 1);
    if (maxAlive < 0 && !pDirty) return;
    P.geo.attributes.position.needsUpdate = true;
    P.geo.attributes.alpha.needsUpdate = true;
    if (pDirty) {
      P.geo.attributes.color.needsUpdate = true;
      P.geo.attributes.size.needsUpdate = true;
      pDirty = false;
    }
  }

  // ---------- ambient dust drifting in the key-light pool
  const D = particleBuffers(DUST_COUNT);
  const dustCol = new THREE.Color(0xffd29e).multiplyScalar(0.65);
  const rnd = (a, b) => a + Math.random() * (b - a);
  function placeDust(i, anywhere) {
    D.pos.set([rnd(-2.8, 2.8), anywhere ? rnd(-1.8, 2.8) : -1.9, rnd(0.4, 3.5)], i * 3);
    D.vel.set([rnd(-0.03, 0.03), rnd(0.02, 0.07), rnd(-0.02, 0.02)], i * 3);
    D.col.set([dustCol.r, dustCol.g, dustCol.b], i * 3);
    D.size[i] = rnd(0.014, 0.032); D.alpha[i] = rnd(0.3, 0.72);
  }
  for (let i = 0; i < DUST_COUNT; i++) placeDust(i, true);
  const dust = new THREE.Points(D.geo, pMat);
  dust.frustumCulled = false; dust.renderOrder = 1;
  scene.add(dust);
  function updateDust(dt, t) {
    for (let i = 0; i < DUST_COUNT; i++) {
      D.pos[i * 3] += (D.vel[i * 3] + Math.sin(t * 0.4 + D.seed[i] * 20) * 0.02) * dt;
      D.pos[i * 3 + 1] += D.vel[i * 3 + 1] * dt;
      D.pos[i * 3 + 2] += D.vel[i * 3 + 2] * dt;
      if (D.pos[i * 3 + 1] > 2.9) placeDust(i, false);
    }
    D.geo.attributes.position.needsUpdate = true;
  }

  // ---------- floating text (pooled DOM nodes, projected from the dial, zero GC/reflow)
  const tmp = new THREE.Vector3();
  const FLOAT_POOL = Array.from({ length: 16 }, () => {
    const el = document.createElement('div');
    el.className = 'float';
    el.style.display = 'none';
    dom.floats.appendChild(el);
    return el;
  });
  let floatCursor = 0;
  const FLOAT_FRAMES = [
    { opacity: 0, transform: 'translate(-50%, -30%) scale(0.6)' },
    { opacity: 1, transform: 'translate(-50%, -60%) scale(1.15)', offset: 0.12 },
    { opacity: 1, transform: 'translate(-50%, -70%) scale(1)', offset: 0.25 },
    { opacity: 1, transform: 'translate(-50%, -110%) scale(1)', offset: 0.65 },
    { opacity: 0, transform: 'translate(-50%, -150%) scale(1)' },
  ];
  function floatText(text, angle, radius, color, big = false) {
    dialPoint(angle, radius, 0.2, tmp).project(camera);
    const el = FLOAT_POOL[floatCursor];
    floatCursor = (floatCursor + 1) % FLOAT_POOL.length;
    el.className = big ? 'float big' : 'float';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(tmp.x * 0.5 + 0.5) * viewport.w}px`;
    el.style.top = `${(-tmp.y * 0.5 + 0.5) * viewport.h}px`;
    el.style.display = '';
    if (el._anim) el._anim.cancel();
    const anim = el.animate(FLOAT_FRAMES, { duration: big ? 1200 : 900, easing: 'linear', fill: 'forwards' });
    el._anim = anim;
    anim.onfinish = () => { if (el._anim === anim) el.style.display = 'none'; };
  }

  // ---------- studio parts (practicals are optional)
  const cloneMat = (o) => { if (o) o.material = o.material.clone(); return o; };
  const bulb = cloneMat(parts.Lamp_Bulb);
  const signGlow = cloneMat(parts.Sign_OnAir_Glow);
  const panels = ['L', 'R'].map((sd) => cloneMat(parts[`Softbox_${sd}_Panel`])).filter(Boolean);
  const rec = cloneMat(parts.Camera_REC);
  const cone = parts.Speaker_Cone;
  const shackle = parts.Lock_Shackle;
  const shackleClosedY = shackle.position.y;

  // ---------- overhead volumetric key-light beam cone (cheap additive atmospheric haze)
  const beamEnd = new THREE.Vector3(0, -0.35, 0);
  const beamDir = new THREE.Vector3().subVectors(lights.key.position, beamEnd);
  const beamLen = beamDir.length();
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffbe7a) }, uOpacity: { value: 0.07 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vNorm; varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNorm = normalize(normalMatrix * normal);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vNorm; varying vec3 vViewPos;
      void main() {
        float fresnel = pow(abs(dot(normalize(vNorm), normalize(vViewPos))), 2.2);
        float vertical = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
        gl_FragColor = vec4(uColor, fresnel * vertical * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const keyCone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 2.55, beamLen, 32, 1, true), coneMat);
  keyCone.position.copy(beamEnd).addScaledVector(beamDir, 0.5);
  keyCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().normalize());
  keyCone.renderOrder = 1;
  scene.add(keyCone);

  const st = {
    pump: 0, shake: 0, recMiss: 0, camFlash: 0,
    dim: 0, dimTarget: 0, swell: 0, white: 0, missDip: 0, signFlare: 0, red: 0,
    onAir: 0.12, ignite: 0,   // ON AIR sign: dim on the menu, lit (after a neon flicker) once a run starts
    shackle: SHACKLE_OPEN, shackleFrom: SHACKLE_OPEN, shackleTo: SHACKLE_OPEN, shackleT: 1, shackleDur: 0.3,
    parallax: new THREE.Vector2(), push: 0, punch: 0, overCam: 0, pauseCam: 0, softHit: 0, softColor: new THREE.Color(),
  };
  shackle.position.y = shackleClosedY + SHACKLE_OPEN;

  function moveShackle(to, dur) {
    st.shackleFrom = st.shackle; st.shackleTo = to; st.shackleT = 0; st.shackleDur = dur;
  }

  // ---------- event reactions
  function react(evt, d = {}) {
    switch (evt) {
      case 'hit': {
        const c = d.perfect ? 0xfff1d6 : d.kind === 'recovery' ? 0x42ffa1 : d.kind === 'blue' ? PALETTE.blue : 0xffb347;
        burst(d.angle, c, d.perfect ? 70 : 34, d.perfect ? 2.6 : 1.8);
        stage.dial.ringFlash(c, d.perfect ? 1 : 0.7, d.angle);
        floatText(`+${Math.round(d.points)}`, d.angle, 1.18, d.perfect ? '#fff1d6' : d.kind === 'recovery' ? '#42ffa1' : '#ffb347');
        if (d.perfect) {
          floatText('Perfect', d.angle, 1.42, '#fff1d6', true);
          st.camFlash = 1; st.white = 1; st.punch = 1;
          if (!REDUCED_MOTION) dom.flash.animate([{ opacity: 0.22 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
        }
        st.swell = 1; st.pump = 1; st.softHit = 1; st.softColor.set(c);
        break;
      }
      case 'blue':
        floatText('+2s', d.angle, 1.42, '#39d5ff', true);
        break;
      case 'recovery':
        burst(d.angle, 0x42ffa1, 55, 2.4);
        floatText('Saved! +1.2s', d.angle, 1.48, '#42ffa1', true);
        st.punch = Math.max(st.punch, 0.85); st.swell = 1;
        break;
      case 'flow':
        burst(d.angle || 0, 0xffb347, 60, 2.3);
        floatText('Flow state!', 0, 1.52, '#ffb347', true);
        st.swell = 1; st.punch = Math.max(st.punch, 0.75);
        break;
      case 'graze':
        burst(d.angle, 0xff9238, 22, 1.5);
        stage.dial.ringFlash(0xff9238, 0.65);
        floatText(`So close! (${d.deg}° ${d.timing}) −0.4s`, d.angle, 1.24, '#ffb347', true);
        st.shake = 0.45; st.red = Math.max(st.red, 0.18);
        break;
      case 'miss': {
        stage.dial.ringFlash(PALETTE.red, 1);
        const detail = d.deg ? `−1.2s (${d.deg}° ${d.timing})` : '−1.2s';
        floatText(detail, d.angle, 1.22, '#ff5a46', true);
        st.shake = 1; st.recMiss = 1; st.missDip = 1; st.red = Math.max(st.red, 0.35);
        break;
      }
      case 'fatal':
        stage.dial.ringFlash(PALETTE.red, 1);
        if (d.text) floatText(d.text, d.angle || 0, 1.38, '#ff5a46', true);
        st.shake = 0.85; st.red = Math.max(st.red, 0.45);
        break;
      case 'levelup':
        floatText(`Level ${d.level} +2s`, 0, 1.55, '#ffb347', true);
        st.signFlare = 1; st.swell = 1; st.pump = 1; st.punch = Math.max(st.punch, 0.65);
        break;
      case 'start':
        st.dimTarget = 0; moveShackle(SHACKLE_OPEN, 0.35);
        if (st.onAir < 0.5) st.ignite = REDUCED_MOTION ? 0 : 0.55;
        break;
      case 'gameover':
        st.dimTarget = 1; st.shake = 0.7; moveShackle(0, 0.28);
        break;
      case 'title':
        st.dimTarget = 0; moveShackle(SHACKLE_OPEN, 0.4);
        break;
    }
  }

  // ---------- per-frame
  const red = new THREE.Color(PALETTE.red);
  const white = new THREE.Color(0xffffff);
  let clock = 0;
  const decay = (v, dt, dur) => Math.max(0, v - dt / dur);

  function update(dt, s) {
    clock += dt;
    const vis = stage.visuals || { brightness: 1.2, glow: 1.0, vignette: 0.45, particles: true };
    const showP = vis.particles !== false;
    points.visible = showP;
    dust.visible = showP;
    keyCone.visible = showP;
    if (showP) {
      pMat.uniforms.uTime.value = clock;
      pMat.uniforms.uScale.value = renderer.domElement.height * 0.9;
      emitSparkles(dt, s);
      updateParticles(dt);
      updateDust(dt, clock);
    }

    st.dim += (st.dimTarget - st.dim) * Math.min(1, dt * 4);
    st.swell = decay(st.swell, dt, 0.3);
    st.white = decay(st.white, dt, 0.2);
    st.missDip = decay(st.missDip, dt, 0.4);
    st.signFlare = decay(st.signFlare, dt, 0.6);
    st.ignite = Math.max(0, st.ignite - dt);
    const onAirTarget = s.mode === 'title' ? 0.12 : 1;
    st.onAir += (onAirTarget - st.onAir) * Math.min(1, dt * (onAirTarget > st.onAir ? 9 : 2.5));
    st.softHit = decay(st.softHit, dt, 0.3);
    st.red = Math.max(st.dim * 0.3, decay(st.red, dt, 0.35));

    // tungsten flicker (low-frequency, subtle) + buzz on a miss
    const flicker = 1 + 0.035 * Math.sin(clock * 7.3) + 0.025 * Math.sin(clock * 13.1 + 1.7) + 0.015 * Math.sin(clock * 29.0);
    const buzz = st.missDip > 0 ? (Math.random() < 0.5 ? 0.25 : 1) : 1;
    const bMult = vis.brightness / 1.2;

    // key light: warm pool, swells on hits, white pop on perfect, dims to red on game over
    const key = lights.key;
    key.intensity = key.userData.base.intensity * bMult * (1 + 0.25 * st.swell) * (1 - 0.55 * st.dim) * (1 - 0.3 * st.missDip);
    key.color.copy(key.userData.base.color).lerp(white, st.white * 0.55).lerp(red, st.dim * 0.55);
    lights.rim.intensity = lights.rim.userData.base.intensity * bMult * (1 + 0.25 * st.swell) * (1 - 0.5 * st.dim);
    lights.rim.color.copy(lights.rim.userData.base.color).lerp(red, st.dim * 0.7);
    lights.hemi.intensity = lights.hemi.userData.base.intensity * bMult * (1 - 0.5 * st.dim);

    coneMat.uniforms.uOpacity.value = (0.065 + 0.025 * st.swell + 0.02 * st.white) * vis.glow * (1 - 0.55 * st.dim);
    coneMat.uniforms.uColor.value.copy(key.color);

    // desk lamp practical
    lights.lamp.intensity = lights.lamp.userData.base.intensity * bMult * flicker * buzz * (1 + 0.3 * st.swell) * (1 - 0.6 * st.dim);
    if (bulb) bulb.material.emissiveIntensity = 9 * vis.glow * flicker * buzz * (1 - 0.55 * st.dim);

    // ON AIR sign: slow hum, flares on level up, stutters on a miss
    const hum = 0.9 + 0.1 * Math.sin(clock * 2.2);
    const stutter = st.missDip > 0 && Math.random() < 0.45 ? 0.1 : 1;
    // neon ignition: a few hard on/off stutters before the tube holds
    const igniteK = st.ignite > 0 ? (Math.sin(st.ignite * 61) > 0.15 ? 1 : 0.08) : 1;
    const signK = hum * stutter * (1 + 1.6 * st.signFlare) * st.onAir * igniteK;
    lights.sign.intensity = lights.sign.userData.base.intensity * bMult * signK;
    if (signGlow) signGlow.material.emissiveIntensity = 5.5 * vis.glow * signK;
    if (stage.halos?.sign) stage.halos.sign.material.opacity = 0.32 * vis.glow * Math.min(1, signK);

    // softboxes are "off" at night; they pulse faintly with hit colour
    for (const p of panels) {
      p.material.emissive.copy(st.softColor);
      p.material.emissiveIntensity = (0.08 + 0.6 * st.softHit) * vis.glow;
    }

    // grade: red tint on miss / game over, vignette closes in on game over
    grade.uniforms.uRed.value = st.red;
    grade.uniforms.uVignette.value = Math.min(0.92, vis.vignette + 0.28 * st.dim);

    // speaker pump (events + continuous while boosting)
    st.pump = decay(st.pump, dt, 0.22);
    const boostPump = s.boost && s.mode === 'play' ? 0.5 + 0.5 * Math.sin(clock * 28) : 0;
    cone.scale.setScalar(1 + 0.14 * st.pump + 0.05 * boostPump);

    // REC LED: 1.6 Hz blink while playing, solid bright flash on a miss / perfect
    st.recMiss = decay(st.recMiss, dt, 0.3);
    st.camFlash = decay(st.camFlash, dt, 0.18);
    const blinkOn = s.mode !== 'play' || Math.floor(clock * 1.6) % 2 === 0;
    rec.material.emissiveIntensity = Math.max(st.recMiss > 0 ? 10 : blinkOn ? 4 : 0.3, 12 * st.camFlash);

    // shake
    st.shake = decay(st.shake, dt, 0.25);
    const a = 0.09 * st.shake * st.shake;
    rig.shake.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);

    // shackle: open while playing, snaps shut (with a small bounce) on game over
    if (st.shackleT < 1) {
      st.shackleT = Math.min(1, st.shackleT + dt / st.shackleDur);
      const t = st.shackleT;
      const e = st.shackleTo < st.shackleFrom
        ? 1 - Math.abs(Math.cos(t * Math.PI * 1.5)) * (1 - t)      // drop + bounce
        : 1 - Math.pow(1 - t, 3);                                  // ease out
      st.shackle = st.shackleFrom + (st.shackleTo - st.shackleFrom) * e;
      shackle.position.y = shackleClosedY + st.shackle;
    }

    // camera: slow push-in + parallax on title, steady during play with impact punch on perfect/levelup, close-up on fatal/game over
    const onTitle = s.mode === 'title';
    const onOver = s.mode === 'over' || s.freezeT > 0;
    st.push += ((onTitle ? 1 : 0) - st.push) * Math.min(1, dt * 2.5);
    st.overCam += ((onOver ? 1 : 0) - st.overCam) * Math.min(1, dt * 4.5);
    st.punch = decay(st.punch, dt, 0.22);
    const punchZ = -0.18 * Math.sin(st.punch * Math.PI);
    const dolly = st.push * (1.4 - 0.9 * ((Math.sin(clock * 0.25) + 1) / 2));
    rig.offset.set(st.parallax.x * 0.5 * st.push, st.parallax.y * 0.3 * st.push, dolly + punchZ - 0.55 * st.overCam);
    if (rig.targetOffset) rig.targetOffset.set(0, -0.08 * st.overCam, 0);
  }

  function updatePauseCam(realDt, s) {
    const onPause = s.mode === 'play' && s.paused;
    st.pauseCam += ((onPause ? 1 : 0) - st.pauseCam) * Math.min(1, realDt * 8.5);
    const p = st.pauseCam;
    if (p > 0.001) {
      // Pan & pull back so the padlock sits cleanly on the left and the angled 3D pause menu sits on the right with zero overlap
      rig.offset.x += 1.85 * p;
      rig.offset.y += 0.08 * p;
      rig.offset.z += 0.85 * p;
      if (rig.targetOffset) rig.targetOffset.x += 1.25 * p;
    }
    return p;
  }

  function setParallax(nx, ny) { st.parallax.set(nx, ny); }

  return { react, update, updatePauseCam, setParallax };
}
