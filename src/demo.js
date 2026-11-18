// TEMPORARY visual driver. It runs a simplified loop so every visual can be reviewed.
// The real rules (LEVELS table, time economy, scoring) replace this in the gameplay plan.
import { DIAL } from './dial.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const rad = (deg) => (deg * Math.PI) / 180;

// Rough per-level look for the demo only: [speed rad/s, width deg, zones, lifetime s (0 = no shrink), blue chance]
const DEMO_LEVELS = [
  [2.0, 30, 1, 0, 0], [2.2, 28, 2, 0, 0], [2.4, 26, 2, 0, 0.3], [2.6, 25, 3, 5.0, 0.3],
  [2.9, 24, 3, 4.2, 0.3], [3.2, 23, 4, 3.6, 0.3], [3.5, 22, 4, 3.2, 0.3], [3.8, 22, 5, 2.8, 0.3],
];

export function createDemo(emit) {
  const s = {
    mode: 'title', paused: false,
    needleAngle: 0, dir: 1, boost: false, boostLatch: false,
    time: 30, score: 0, combo: 0, level: 1, hits: 0, perfects: 0, runTime: 0,
    best: Number(localStorage.getItem('ticklock_best') || 0),
    zones: [], overT: 0, retryReady: false,
  };
  const cfg = () => DEMO_LEVELS[Math.min(s.level, DEMO_LEVELS.length) - 1];

  function spawnZone(forceKind) {
    const [, widthDeg, , life, blueChance] = cfg();
    const hasBlue = s.zones.some((z) => z.kind === 'blue');
    const kind = forceKind || (!hasBlue && Math.random() < blueChance ? 'blue' : 'gold');
    const half = rad(widthDeg) / 2;
    for (let tries = 0; tries < 60; tries++) {
      const angle = wrap(Math.random() * TAU);
      if (Math.abs(wrap(angle - s.needleAngle)) < 0.7 + half) continue;          // spawn gap from the needle
      if (s.zones.some((z) => Math.abs(wrap(angle - z.angle)) < z.baseHalf + half + 0.08)) continue; // no overlap
      const zl = life ? (kind === 'blue' ? life * 0.7 : life) : 0;
      s.zones.push({ angle, half, baseHalf: half, kind, age: 0, life: zl, pop: 0, alpha: 1 });
      return;
    }
  }

  function fillZones() {
    const want = cfg()[2];
    while (s.zones.length < want) spawnZone();
  }

  function start() {
    Object.assign(s, { mode: 'play', time: 30, score: 0, combo: 0, level: 1, hits: 0, perfects: 0, runTime: 0, dir: 1, zones: [] });
    fillZones();
    emit('start');
  }

  function toTitle() {
    Object.assign(s, { mode: 'title', zones: [], combo: 0 });
    emit('title');
  }

  function gameOver() {
    s.mode = 'over'; s.overT = 0; s.retryReady = false;
    if (s.score > s.best) { s.best = s.score; localStorage.setItem('ticklock_best', String(s.best)); }
    emit('gameover', { ...s });
  }

  function levelUp() {
    s.level += 1; s.time += 2;
    emit('levelup', { level: s.level });
    fillZones();
  }

  function registerHit(zone, perfect) {
    s.combo += 1; s.hits += 1;
    if (perfect) s.perfects += 1;
    const points = 100 * (1 + 0.1 * s.combo) * (perfect ? 2 : 1) * (s.boost ? 2 : 1);
    s.score += points;
    s.time += 0.3 + (zone.kind === 'blue' ? 2 : 0);
    s.dir *= -1;
    emit('hit', { angle: s.needleAngle, kind: zone.kind, perfect, points });
    if (zone.kind === 'blue') emit('blue', { angle: s.needleAngle });
    s.zones.splice(s.zones.indexOf(zone), 1);
    if (s.hits % 6 === 0) levelUp();
    fillZones();
  }

  function registerMiss() {
    s.combo = 0; s.time -= 1.5;
    emit('miss', { angle: s.needleAngle });
  }

  // Player input: Pick
  function pick() {
    if (s.paused) return;
    if (s.mode === 'title') return start();
    if (s.mode === 'over') { if (s.retryReady) start(); return; }
    const zone = s.zones.find((z) => Math.abs(wrap(s.needleAngle - z.angle)) <= z.half);
    if (!zone) return registerMiss();
    registerHit(zone, Math.abs(wrap(s.needleAngle - zone.angle)) <= zone.half * DIAL.PERFECT);
  }

  // Review keys: force each visual event
  function debugKey(k) {
    if (k === '0') return toTitle();
    if (k === '7') { if (s.mode !== 'play') start(); return gameOver(); }
    if (s.mode !== 'play') start();
    const zone = s.zones[0];
    if (k === '1') registerHit(zone, false);
    if (k === '2') registerHit(zone, true);
    if (k === '3') { const b = s.zones.find((z) => z.kind === 'blue'); if (b) registerHit(b, false); else { spawnZone('blue'); registerHit(s.zones.at(-1), false); } }
    if (k === '4') registerMiss();
    if (k === '5') levelUp();
    if (k === '6') s.boostLatch = !s.boostLatch;
  }

  function update(dt, input) {
    s.boost = input.boost || s.boostLatch;
    if (s.paused) return;
    const [speed] = cfg();

    if (s.mode === 'title') {
      s.needleAngle = wrap(s.needleAngle + 0.9 * dt);           // idle sweep
      return;
    }
    if (s.mode === 'over') {
      s.overT += dt;
      s.retryReady = s.overT > 0.6;
      return;
    }

    s.runTime += dt;
    s.needleAngle = wrap(s.needleAngle + s.dir * speed * (s.boost ? 1.8 : 1) * dt);
    s.time -= dt * 0.35;                                        // drains slowly in the demo
    if (s.time <= 0) { s.time = 0; return gameOver(); }

    for (const z of [...s.zones]) {
      z.age += dt;
      z.pop = Math.min(1, z.age / 0.15);
      z.pop = 1 - Math.pow(1 - z.pop, 3);
      if (z.life) {
        const k = Math.min(1, z.age / z.life);
        z.half = z.baseHalf * (1 - k * 0.85);
        const left = z.life - z.age;
        z.alpha = left < 0.8 ? (Math.floor(left * 10) % 2 ? 0.35 : 1) : 1;
        if (z.age >= z.life) { s.zones.splice(s.zones.indexOf(z), 1); spawnZone(); }
      }
    }
  }

  function togglePause() { if (s.mode === 'play') s.paused = !s.paused; return s.paused; }

  return { state: s, update, pick, debugKey, togglePause };
}
