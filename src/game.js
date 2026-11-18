// Real gameplay rules (tick-lock-game-design.md §2–7) + Fun-to-Fail mechanics:
// Near-Miss Graze, Ghost Tick Mark, Recovery/Unjam Zone, Fatal Freeze-Frame, and Flow State.

const LEVELS = [ // [hits in level, speed rad/s, width degrees, zones, lifetime s (0 = no shrink), blue chance]
  [4, 2.0, 34, 1, 0,   0.00],
  [4, 2.2, 32, 2, 0,   0.00],
  [5, 2.4, 30, 2, 0,   0.18],
  [5, 2.6, 28, 3, 5.2, 0.18],
  [6, 2.9, 27, 3, 4.5, 0.20],
  [6, 3.2, 26, 4, 3.9, 0.22],
  [8, 3.5, 24, 4, 3.4, 0.22],
  [8, 3.8, 23, 5, 3.0, 0.24],
];
const START_TIME = 30, HIT_TIME = 0.45, BLUE_TIME = 2, LEVEL_TIME = 2, MISS_TIME = 1.2;
const ENDLESS_SPEED = 0.1, MIN_WINDOW = 0.10;          // endless: +0.1 rad/s per level; widen zones so window >= 100 ms
const BOOST_SPEED = 1.8, BOOST_SCORE = 2, PERFECT_CORE = 0.3, SPAWN_GAP = 0.7, BLINK = 0.8, BLUE_LIFE = 0.7;

// Fun-to-fail & Flow State constants
const GRAZE_RAD = (6.0 * Math.PI) / 180;               // within 6.0 deg of zone edge = Graze ("SO CLOSE!")
const GRAZE_TIME = 0.4;                                // Graze costs only 0.4 s instead of 1.2 s
const RECOVERY_LIFE = 2.8;                             // seconds to hit the clutch Recovery zone after a miss
const FLOW_COMBO = 10, FLOW_BONUS = 1.25;              // Flow State starts at 10x combo
const FREEZE_DUR = 0.45;                               // fatal freeze-frame duration before Game Over

const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const rad = (deg) => (deg * Math.PI) / 180;

export function createGame(emit) {
  const s = {
    mode: 'title', paused: false,
    needleAngle: 0, dir: 1, boost: false, boostLatch: false,
    time: START_TIME, score: 0, combo: 0, maxCombo: 0, level: 1,
    hits: 0, levelHits: 0, levelGoal: LEVELS[0][0], perfects: 0, runTime: 0,
    best: Number(localStorage.getItem('ticklock_best') || 0),
    flow: false, savedCombo: 0, jamT: 0, slowT: 0, missLockT: 0, clockStarted: false,
    freezeT: 0, fatalText: '',
    ghost: { angle: 0, alpha: 0 },
    zones: [], overT: 0, retryReady: false,
  };

  function levelSpec(lv = s.level) {
    if (lv <= LEVELS.length) {
      const [hitsReq, speed, widthDeg, count, life, blueChance] = LEVELS[lv - 1];
      return { hitsReq, speed, widthRad: rad(widthDeg), count, life, blueChance };
    }
    const base = LEVELS[LEVELS.length - 1];
    const extra = lv - LEVELS.length;
    const speed = base[1] + extra * ENDLESS_SPEED;
    const widthRad = Math.max(rad(base[2]), speed * MIN_WINDOW);
    return { hitsReq: 8, speed, widthRad, count: base[3], life: base[4], blueChance: base[5] };
  }

  function spawnZone(forceKind) {
    const { widthRad, life, blueChance } = levelSpec();
    const hasBlue = s.zones.some((z) => z.kind === 'blue');
    const kind = forceKind || (!hasBlue && Math.random() < blueChance ? 'blue' : 'gold');
    const half = (kind === 'recovery' ? widthRad * 1.15 : widthRad) / 2;

    for (let tries = 0; tries < 80; tries++) {
      // Recovery zone spawns comfortably ahead of the needle so the player can re-focus and clutch-save
      const angle = kind === 'recovery' && tries < 25
        ? wrap(s.needleAngle + s.dir * (1.05 + Math.random() * 0.45 + half))
        : wrap(Math.random() * TAU);
      if (Math.abs(wrap(angle - s.needleAngle)) < SPAWN_GAP + half) continue;
      if (s.zones.some((z) => Math.abs(wrap(angle - z.angle)) < z.baseHalf + half + 0.08)) continue;
      const zl = kind === 'recovery'
        ? RECOVERY_LIFE
        : life ? (kind === 'blue' ? life * BLUE_LIFE : life) : 0;
      s.zones.push({ angle, half, baseHalf: half, kind, age: 0, life: zl, pop: 0, alpha: 1 });
      return;
    }
  }

  function fillZones() {
    const { count } = levelSpec();
    const regularCount = () => s.zones.filter((z) => z.kind !== 'recovery').length;
    let guard = 0;
    while (regularCount() < count && guard++ < 16) spawnZone();
  }

  function start() {
    const spec = levelSpec(1);
    Object.assign(s, {
      mode: 'play', paused: false, time: START_TIME, score: 0, combo: 0, maxCombo: 0, level: 1,
      hits: 0, levelHits: 0, levelGoal: spec.hitsReq, perfects: 0, runTime: 0,
      dir: 1, flow: false, savedCombo: 0, jamT: 0, slowT: 0, missLockT: 0, clockStarted: false, freezeT: 0, fatalText: '',
      ghost: { angle: 0, alpha: 0 }, zones: [],
    });
    fillZones();
    emit('start');
  }

  function toTitle() {
    Object.assign(s, { mode: 'title', paused: false, zones: [], combo: 0, flow: false, freezeT: 0, jamT: 0, clockStarted: false });
    emit('title');
  }

  function triggerFatal(text) {
    s.time = 0;
    s.freezeT = FREEZE_DUR;
    s.fatalText = text;
    emit('fatal', { angle: s.needleAngle, text });
  }

  function gameOver() {
    s.mode = 'over'; s.overT = 0; s.retryReady = false; s.freezeT = 0; s.flow = false;
    if (s.score > s.best) { s.best = Math.round(s.score); localStorage.setItem('ticklock_best', String(s.best)); }
    emit('gameover', { ...s });
  }

  function levelUp() {
    s.level += 1;
    s.levelHits = 0;
    s.levelGoal = levelSpec().hitsReq;
    s.time += LEVEL_TIME;
    emit('levelup', { level: s.level });
    fillZones();
  }

  function registerHit(zone, perfect) {
    const wasRecovery = zone.kind === 'recovery';
    if (wasRecovery && s.savedCombo > s.combo) {
      s.combo = s.savedCombo;
      s.savedCombo = 0;
    } else {
      s.combo += 1;
    }
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.hits += 1;
    s.levelHits += 1;
    if (perfect) s.perfects += 1;
    const firstHit = !s.clockStarted;
    s.clockStarted = true;

    const enteredFlow = !s.flow && s.combo >= FLOW_COMBO;
    s.flow = s.combo >= FLOW_COMBO;

    const flowMult = s.flow ? FLOW_BONUS : 1;
    const points = 100 * (1 + 0.1 * s.combo) * (perfect ? 2 : 1) * (s.boost ? BOOST_SCORE : 1) * flowMult;
    s.score += points;
    if (!firstHit) s.time += HIT_TIME + (zone.kind === 'blue' ? BLUE_TIME : 0) + (wasRecovery ? MISS_TIME : 0);
    s.dir *= -1;
    s.jamT = 0;
    s.slowT = 0;
    s.missLockT = 0;

    emit('hit', {
      angle: s.needleAngle, kind: zone.kind, perfect, points,
      combo: s.combo, flow: s.flow,
    });
    if (zone.kind === 'blue') emit('blue', { angle: s.needleAngle });
    if (wasRecovery) emit('recovery', { angle: s.needleAngle, combo: s.combo });
    if (enteredFlow) emit('flow', { angle: s.needleAngle, combo: s.combo });

    s.zones.splice(s.zones.indexOf(zone), 1);
    // Clear any leftover recovery zone once the player gets a hit
    if (!wasRecovery) {
      const recIdx = s.zones.findIndex((z) => z.kind === 'recovery');
      if (recIdx !== -1) s.zones.splice(recIdx, 1);
    }

    if (s.levelHits >= s.levelGoal) levelUp();
    else fillZones();
  }

  function findNearestMiss() {
    let best = null, bestGap = Infinity, bestSigned = 0;
    for (const z of s.zones) {
      const diff = wrap(z.angle - s.needleAngle);
      const gap = Math.max(0, Math.abs(diff) - z.half);
      if (gap < bestGap) {
        bestGap = gap;
        best = z;
        bestSigned = diff * s.dir; // > 0 means needle hadn't reached zone yet (EARLY), < 0 means passed it (LATE)
      }
    }
    const deg = Math.max(1, Math.round((bestGap * 180) / Math.PI));
    const timing = bestSigned >= 0 ? 'EARLY' : 'LATE';
    return { zone: best, gapRad: bestGap, deg, timing };
  }

  function registerGraze(info) {
    s.ghost = { angle: s.needleAngle, alpha: 1 };
    if (!s.clockStarted) return; // Free practice before Hit #1
    s.combo = Math.floor(s.combo * 0.5);
    s.flow = s.combo >= FLOW_COMBO;
    s.time -= GRAZE_TIME;
    emit('graze', { angle: s.needleAngle, deg: info.deg, timing: info.timing });
    if (s.time <= 0) triggerFatal(`MISSED BY ${info.deg}° (${info.timing})`);
  }

  function registerMiss(info = findNearestMiss()) {
    s.ghost = { angle: s.needleAngle, alpha: 1 };
    if (!s.clockStarted) {
      s.jamT = 0.08;
      return; // Free practice before Hit #1
    }
    s.savedCombo = s.combo >= 2 ? Math.max(2, Math.ceil(s.combo * 0.5)) : 0;
    s.combo = 0;
    s.flow = false;
    s.time -= MISS_TIME;
    s.jamT = 0.10;       // brief physical pin-jam recoil on the needle
    s.slowT = 0.45;      // 0.45s breather at reduced speed so one miss doesn't cause chain-failing
    s.missLockT = 0.22;  // ignore accidental double-taps right after a miss

    emit('miss', { angle: s.needleAngle, deg: info.deg, timing: info.timing });

    if (s.time <= 0) {
      triggerFatal(`MISSED BY ${info.deg}° (${info.timing})`);
      return;
    }

    // Spawn a high-stakes Recovery Zone ahead of the needle if one isn't already active
    if (!s.zones.some((z) => z.kind === 'recovery')) {
      spawnZone('recovery');
    }
  }

  // Player input: Pick
  function pick() {
    if (s.paused || s.freezeT > 0 || s.missLockT > 0) return;
    if (s.mode === 'title') return start();
    if (s.mode === 'over') { if (s.retryReady) start(); return; }

    const zone = s.zones.find((z) => Math.abs(wrap(s.needleAngle - z.angle)) <= z.half);
    if (zone) {
      const perfect = Math.abs(wrap(s.needleAngle - zone.angle)) <= zone.half * PERFECT_CORE;
      return registerHit(zone, perfect);
    }

    const info = findNearestMiss();
    if (info.gapRad <= GRAZE_RAD) return registerGraze(info);
    return registerMiss(info);
  }

  // Debug keys (0–7) preserved for instant visual/event verification
  function debugKey(k) {
    if (k === '0') return toTitle();
    if (k === '7') { if (s.mode !== 'play') start(); return gameOver(); }
    if (s.mode !== 'play') start();
    const zone = s.zones[0];
    if (k === '1' && zone) registerHit(zone, false);
    if (k === '2' && zone) registerHit(zone, true);
    if (k === '3') {
      const b = s.zones.find((z) => z.kind === 'blue');
      if (b) registerHit(b, false);
      else { spawnZone('blue'); registerHit(s.zones.at(-1), false); }
    }
    if (k === '4') registerMiss();
    if (k === '5') levelUp();
    if (k === '6') s.boostLatch = !s.boostLatch;
  }

  function update(dt, input) {
    s.boost = input.boost || s.boostLatch;
    if (s.paused) return;

    if (s.ghost.alpha > 0) {
      s.ghost.alpha = Math.max(0, s.ghost.alpha - dt / 0.9);
    }

    if (s.mode === 'title') {
      s.needleAngle = wrap(s.needleAngle + 0.9 * dt);
      return;
    }
    if (s.mode === 'over') {
      s.overT += dt;
      s.retryReady = s.overT > 0.6;
      return;
    }

    // Fatal freeze-frame: hold the dial for 0.45 s so the player sees how close they were before the shackle slams
    if (s.freezeT > 0) {
      s.freezeT -= dt;
      if (s.freezeT <= 0) gameOver();
      return;
    }

    const { speed } = levelSpec();
    s.runTime += dt;
    if (s.missLockT > 0) s.missLockT = Math.max(0, s.missLockT - dt);

    // Brief mechanical jam recoil on a miss, then a 0.62x breather window before full speed resumes
    if (s.jamT > 0) {
      s.jamT = Math.max(0, s.jamT - dt);
      s.needleAngle = wrap(s.needleAngle - s.dir * speed * 0.45 * dt);
    } else {
      const slowMult = s.slowT > 0 ? 0.62 : 1;
      if (s.slowT > 0) s.slowT = Math.max(0, s.slowT - dt);
      s.needleAngle = wrap(s.needleAngle + s.dir * speed * slowMult * (s.boost ? BOOST_SPEED : 1) * dt);
    }

    if (s.clockStarted) {
      s.time -= dt;
      if (s.time <= 0) {
        const info = findNearestMiss();
        return triggerFatal(`TIME UP, ${info.deg}° AWAY`);
      }
    }

    for (const z of [...s.zones]) {
      z.age += dt;
      z.pop = Math.min(1, z.age / 0.15);
      z.pop = 1 - Math.pow(1 - z.pop, 3);
      if (z.life) {
        const k = Math.min(1, z.age / z.life);
        z.half = z.baseHalf * (1 - k * (z.kind === 'recovery' ? 0.55 : 0.85));
        const left = z.life - z.age;
        if (z.kind === 'recovery') {
          // Fast urgent pulse on the Recovery zone
          z.alpha = 0.55 + 0.45 * Math.sin(z.age * 24);
        } else {
          z.alpha = left < BLINK ? (Math.floor(left * 10) % 2 ? 0.35 : 1) : 1;
        }
        if (z.age >= z.life) {
          const wasRec = z.kind === 'recovery';
          s.zones.splice(s.zones.indexOf(z), 1);
          if (!wasRec) fillZones();
        }
      }
    }
  }

  function togglePause() { if (s.mode === 'play') s.paused = !s.paused; return s.paused; }

  return { state: s, update, pick, start, toTitle, debugKey, togglePause };
}
