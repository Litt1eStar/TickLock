// Stage: single-pass hardware renderer (120+ fps budget on Intel UHD), camera framing, lights, studio.glb.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PALETTE = {
  navy: 0x0d1120,
  cream: 0xffe9c9,
  gold: 0xffc23d,
  blue: 0x39d5ff,
  magenta: 0xff3ea5,
  red: 0xff3b3b,
  white: 0xffffff,
  softbox: 0xfff4e6,
};

// Names the Blender scene must provide (see the visual spec, section 5).
const REQUIRED_PARTS = [
  'Lock_Body', 'Lock_Shackle', 'Lock_Badge', 'Dial_Vinyl', 'Dial_Label',
  'Prop_Softbox_L', 'Prop_Softbox_R', 'Softbox_L_Panel', 'Softbox_R_Panel',
  'Prop_Camera', 'Camera_REC', 'Prop_Monitor', 'Monitor_Screen',
  'Prop_Headphones', 'Prop_Speaker', 'Speaker_Cone', 'Prop_Desk', 'Room_Wall', 'Room_Foam',
];

// Night-studio props: nice to have, never fatal if missing.
const OPTIONAL_PARTS = ['Prop_DeskLamp', 'Lamp_Bulb', 'Sign_OnAir', 'Sign_OnAir_Glow'];

const NIGHT = 0x090b16;   // deep indigo-navy background + fog colour

// Procedural tileable micro-normal texture (cast metal & brushed iron grain, generated once at boot).
function makeMicroNormal(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const n1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const n2 = Math.sin(((x >> 1) * 39.346 + (y >> 1) * 11.135)) * 23421.631;
    h[i] = (n1 - Math.floor(n1)) * 0.65 + (n2 - Math.floor(n2)) * 0.35;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, 128 + dx * 70));
      data[idx + 1] = Math.max(0, Math.min(255, 128 + dy * 70));
      data[idx + 2] = 245;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.needsUpdate = true;
  return tex;
}

// Soft radial glow texture for practical light halos (replaces 12-pass full-screen UnrealBloomPass).
function makeGlowTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const R = size / 2;
  const grd = g.createRadialGradient(R, R, 0, R, R, R);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.32)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export const CAMERA_HOME = new THREE.Vector3(0, 0.15, 10);
export const CAMERA_TARGET = new THREE.Vector3(0, 0.0, 0);
const BASE_FOV = 23;          // vertical, degrees, for 16:9
const FAST = new URLSearchParams(location.search).has('fast');
const MIN_PIXEL_RATIO = 0.55;
const RENDER_SCALE = FAST ? 0.7 : 0.9;
const MAX_BUFFER_W = FAST ? 1280 : 1536; // cap total buffer width on 1440p/4K displays for 120+ fps on Intel UHD
const MIN_HALF_WIDTH = 1.85;

export async function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const MAX_PIXEL_RATIO = Math.min(Math.max(window.devicePixelRatio, 1), 1.15) * RENDER_SCALE;
  renderer.setPixelRatio(MAX_PIXEL_RATIO);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[TickLock] WebGL context lost, reloading');
    setTimeout(() => location.reload(), 600);
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.075);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 0.1, 100);
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(CAMERA_TARGET);

  // ---- lights: 5-light rig.
  const lights = {
    hemi: new THREE.HemisphereLight(0x4c5c92, 0x261810, 0.65),
    key: new THREE.SpotLight(0xffbe7a, 130, 0, 0.44, 0.85, 2),
    rim: new THREE.DirectionalLight(0xffa656, 2.5),
    lamp: new THREE.PointLight(0xff9e44, 13.0, 8.5, 1.7),
    sign: new THREE.PointLight(0xff4a2a, 5.0, 6.5, 1.8),
  };
  lights.key.position.set(0.2, 3.8, 6.4);
  lights.key.target.position.set(0, -0.1, 0);
  scene.add(lights.key.target);
  lights.rim.position.set(-2.4, 3.0, 2.4);

  // ---- studio model
  const gltf = await new GLTFLoader().loadAsync('assets/studio.glb');
  scene.add(gltf.scene);
  const parts = {};
  gltf.scene.traverse((o) => { if (o.name) parts[o.name] = o; });
  const missing = REQUIRED_PARTS.filter((n) => !parts[n]);
  if (missing.length) console.warn('[TickLock] studio.glb is missing parts:', missing);
  else console.info(`[TickLock] studio.glb ok: ${REQUIRED_PARTS.length} required parts found`);

  if (parts.Prop_Monitor) {
    parts.Prop_Monitor.scale.setScalar(0.8);
    parts.Prop_Monitor.position.set(2.95, -0.64, -1.2);
  }

  // Convert hero lock to fast MeshPhongMaterial (with micro-normals & specular bevels, no costly PMREM CubeUV lookup)
  // and peripheral studio props to MeshLambertMaterial so Intel UHD hits 120+ fps (< 6 ms/frame).
  const microNormal = makeMicroNormal(128);
  const HERO_LOCK = /^(Lock_Body|Lock_Shackle|Lock_Badge|Dial_Bezel|Dial_Vinyl)$/;
  const KEEP_MAT = /^(Dial_Label|Monitor_Screen|Camera_REC|Lamp_Bulb|Sign_OnAir_Glow|Softbox_._Panel)$/;
  gltf.scene.traverse((o) => {
    const m = o.material;
    if (!m || !o.isMesh) return;
    if (/Accent_(Magenta|Cyan)/.test(m.name)) m.color.multiplyScalar(0.45);
    if (HERO_LOCK.test(o.name)) {
      const isVinyl = o.name === 'Dial_Vinyl';
      const isBody = o.name === 'Lock_Body';
      const color = m.color.clone();
      if (isVinyl) color.multiplyScalar(0.72);
      o.material = new THREE.MeshPhongMaterial({
        color,
        map: m.map || null,
        normalMap: isVinyl ? null : microNormal,
        normalScale: new THREE.Vector2(isBody ? 0.18 : 0.12, isBody ? 0.18 : 0.12),
        specular: new THREE.Color(isVinyl ? 0x22202c : isBody ? 0x553822 : 0x8a7258),
        shininess: isVinyl ? 28 : isBody ? 22 : 48,
        name: m.name,
      });
      m.dispose();
    } else if (!KEEP_MAT.test(o.name) && !m.emissiveIntensity) {
      o.material = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, name: m.name });
      m.dispose();
    }
  });

  const missingOpt = OPTIONAL_PARTS.filter((n) => !parts[n]);
  if (missingOpt.length) console.warn('[TickLock] optional parts missing (lights fall back):', missingOpt);

  gltf.scene.updateMatrixWorld(true);
  if (parts.Lamp_Bulb) parts.Lamp_Bulb.getWorldPosition(lights.lamp.position);
  else lights.lamp.position.set(-2.2, 0.1, -0.8);
  if (parts.Sign_OnAir) { parts.Sign_OnAir.getWorldPosition(lights.sign.position); lights.sign.position.z += 0.5; }
  else lights.sign.position.set(-2.3, 2.3, -4);
  for (const l of Object.values(lights)) {
    l.userData.base = { intensity: l.intensity, color: l.color.clone() };
    scene.add(l);
  }

  // In-world additive bloom halos on the desk lamp and ON AIR sign (replaces costly full-screen bloom chain).
  const glowTex = makeGlowTexture(64);
  const lampHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9e44, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  lampHalo.position.copy(lights.lamp.position);
  lampHalo.scale.setScalar(1.35);
  scene.add(lampHalo);

  const signHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff4a2a, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  signHalo.position.copy(lights.sign.position);
  signHalo.scale.set(1.8, 0.95, 1);
  scene.add(signHalo);

  // User-adjustable visual & performance settings (persisted in localStorage by main.js).
  const visuals = {
    preset: FAST ? 'perf' : 'balanced',
    scale: FAST ? 0.70 : 0.90,
    brightness: 1.20,
    contrast: 1.05,
    saturation: 1.05,
    glow: 1.00,
    vignette: 0.45,
    particles: true,
  };

  // Lightweight shims so fx.js & main.js work seamlessly without the 13-pass EffectComposer.
  const bloom = { enabled: true, strength: 0.48 };
  const glitch = { enabled: false, uniforms: { amount: { value: 0 }, angle: { value: 0 } } };
  const grade = { uniforms: { uRed: { value: 0 }, uVignette: { value: 0.45 }, uTime: { value: 0 } } };
  const composer = null;

  const rig = { offset: new THREE.Vector3(), shake: new THREE.Vector3(), targetOffset: new THREE.Vector3() };
  let basePr = MAX_PIXEL_RATIO;
  let maxBufW = MAX_BUFFER_W;

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / h;
    camera.aspect = aspect;
    const tanV = Math.max(
      Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)),
      MIN_HALF_WIDTH / CAMERA_HOME.z / aspect,
    );
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV));
    camera.updateProjectionMatrix();
    const effPr = Math.min(basePr, maxBufW / Math.max(w, 1));
    renderer.setPixelRatio(effPr);
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  function applyVisuals(next = {}) {
    const prevScale = visuals.scale;
    const prevPreset = visuals.preset;
    Object.assign(visuals, next);
    renderer.toneMappingExposure = 0.96 * visuals.brightness;
    container.style.setProperty('--canvas-contrast', visuals.contrast.toFixed(2));
    container.style.setProperty('--canvas-sat', visuals.saturation.toFixed(2));
    lampHalo.material.opacity = 0.42 * visuals.glow;
    signHalo.material.opacity = 0.32 * visuals.glow;
    maxBufW = visuals.preset === 'perf' ? 1152 : visuals.preset === 'ultra' ? 2048 : 1536;
    const dprCap = visuals.preset === 'ultra' ? 1.5 : 1.15;
    basePr = THREE.MathUtils.clamp(Math.min(Math.max(window.devicePixelRatio, 1), dprCap) * visuals.scale, MIN_PIXEL_RATIO, 1.5);
    if (visuals.scale !== prevScale || visuals.preset !== prevPreset) resize();
    return renderer.getPixelRatio();
  }
  applyVisuals();
  resize();

  let lastVig = -1, lastRed = -1;
  function render() {
    camera.position.copy(CAMERA_HOME).add(rig.offset).add(rig.shake);
    camera.lookAt(
      CAMERA_TARGET.x + rig.targetOffset.x + rig.shake.x * 0.5,
      CAMERA_TARGET.y + rig.targetOffset.y + rig.shake.y * 0.5,
      CAMERA_TARGET.z + rig.targetOffset.z,
    );
    const vig = grade.uniforms.uVignette.value;
    const red = grade.uniforms.uRed.value;
    if (Math.abs(vig - lastVig) > 0.01) { lastVig = vig; container.style.setProperty('--vig', vig.toFixed(2)); }
    if (Math.abs(red - lastRed) > 0.01) { lastRed = red; container.style.setProperty('--red-tint', (red * 0.85).toFixed(2)); }
    renderer.render(scene, camera);
  }

  function setPixelRatio(pr) {
    basePr = THREE.MathUtils.clamp(pr, MIN_PIXEL_RATIO, 1.5);
    resize();
    return renderer.getPixelRatio();
  }

  return {
    renderer, scene, camera, composer, bloom, glitch, grade, lights, parts, rig,
    visuals, applyVisuals, render, resize, setPixelRatio,
    maxPixelRatio: MAX_PIXEL_RATIO,
  };
}

// World position of a point on the dial face. Angle 0 = 12 o'clock, increasing clockwise.
export function dialPoint(angle, radius, z = 0.14, target = new THREE.Vector3()) {
  return target.set(radius * Math.sin(angle), radius * Math.cos(angle), z);
}
