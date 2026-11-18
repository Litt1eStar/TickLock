// Entry: builds the stage, wires visuals + WebAudio to the gameplay engine and input.
import { createStage } from './scene.js';
import { createDial } from './dial.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { createPauseMenu } from './pause3d.js';
import { AVATARS, getAvatar } from './avatars.js';

const $ = (id) => document.getElementById(id);
const dom = { floats: $('floats'), flash: $('flash') };

// canvas text needs the vendored font loaded before the first hub/monitor draw
await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px "Barlow Condensed"`))).catch(() => {});
const stage = await createStage($('stage'));
const dial = createDial(stage);
stage.dial = dial;
const hud = createHud(stage.parts, stage.renderer.capabilities.getMaxAnisotropy());
const fx = createFx(stage, dom);
const audio = createAudio();

const emit = (evt, data) => {
  fx.react(evt, data);
  hud.react(evt, data);
  audio.react(evt, data);
  onGameEvent(evt, data);
};
const demo = createGame(emit);
const pause3d = createPauseMenu(stage, (action) => {
  audio.unlock();
  if (action === 'resume') setPaused(demo.togglePause());
  else if (action === 'restart') { setPaused(false); demo.start(); }
  else if (action === 'settings') toggleSettings();
  else if (action === 'menu') { setPaused(false); demo.toTitle(); }
});
const perf = { frames: 0, acc: 0, avgMs: 0, pixelRatio: stage.renderer.getPixelRatio() };
$('loading').remove();

// ---------- Top-10 Arcade Leaderboard & Booth Time-Per-Score Log
const LB_KEY = 'ticklock_leaderboard';
const LOG_KEY = 'ticklock_history';
const RUN_SEQ_KEY = 'ticklock_run_seq';
const SEED_BOARD = [
  { name: 'LITT1ESTAR', score: 14800, level: 7, maxCombo: 18, perfects: 12, avatar: 'ace',      timeLabel: '10:15', runTime: 54.2 },
  { name: 'MUASOOM',    score: 9600,  level: 5, maxCombo: 12, perfects: 8,  avatar: 'vinyl',    timeLabel: '10:08', runTime: 41.8 },
  { name: 'AGENT-01',   score: 6400,  level: 4, maxCombo: 9,  perfects: 5,  avatar: 'operator', timeLabel: '09:55', runTime: 34.5 },
  { name: 'KMUTT-CMM',  score: 5200,  level: 4, maxCombo: 7,  perfects: 4,  avatar: 'camera',   timeLabel: '09:42', runTime: 31.0 },
  { name: 'VINYL-77',   score: 3900,  level: 3, maxCombo: 6,  perfects: 3,  avatar: 'synth',    timeLabel: '09:30', runTime: 26.4 },
  { name: 'NIGHT-OWL',  score: 2650,  level: 2, maxCombo: 4,  perfects: 2,  avatar: 'onair',    timeLabel: '09:18', runTime: 22.1 },
  { name: 'VISITOR',    score: 1400,  level: 2, maxCombo: 3,  perfects: 1,  avatar: 'padlock',  timeLabel: '09:05', runTime: 16.7 },
];
let selectedAvatar = AVATARS[0].id;
let lastRun = null;
let runSeq = Number(localStorage.getItem(RUN_SEQ_KEY) || 0);
let runLog = [];
try {
  const rawLog = JSON.parse(localStorage.getItem(LOG_KEY) || 'null');
  if (Array.isArray(rawLog)) runLog = rawLog;
} catch {}

// Render Avatar Picker in Game Over form
const avPicker = $('avatar-picker');
avPicker.innerHTML = AVATARS.map((a, i) => (
  `<button type="button" class="av-opt${i === 0 ? ' active' : ''}" data-av="${a.id}" title="${a.label}">${a.svg}</button>`
)).join('');
avPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.av-opt');
  if (!btn) return;
  selectedAvatar = btn.dataset.av;
  avPicker.querySelectorAll('.av-opt').forEach((b) => b.classList.toggle('active', b === btn));
});
let board = [];
try {
  const raw = JSON.parse(localStorage.getItem(LB_KEY) || 'null');
  board = Array.isArray(raw) && raw.length > 0 ? raw : [...SEED_BOARD];
} catch {
  board = [...SEED_BOARD];
}

const fmtScore = (n) => Math.round(n || 0).toLocaleString('en-US');
const escHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function syncLeaderboardUI() {
  board.sort((a, b) => b.score - a.score);
  board = board.slice(0, 10);
  const topScore = board[0]?.score || 0;
  if (topScore > demo.state.best) {
    demo.state.best = topScore;
    try { localStorage.setItem('ticklock_best', String(topScore)); } catch {}
  }

  // Title screen compact Top-3 record strip
  const sideList = $('title-lb-list');
  if (board.length === 0) {
    sideList.innerHTML = '<li><span class="rk">--</span><span class="nm">NO RECORDS TODAY</span><span class="sc">0</span></li>';
  } else {
    sideList.innerHTML = board.slice(0, 3).map((e, i) => (
      `<li><span class="rk">0${i + 1}</span><span class="nm">${escHtml(e.name)}</span><span class="sc">${fmtScore(e.score)}</span></li>`
    )).join('');
  }

  // Studio Ranking: Olympic Hanging Podium (#2 Left, #1 Center, #3 Right) + Ranked List + Pinned Current Player
  const podium = $('lb-podium');
  const tracks = $('lb-tracks');
  const selfBar = $('lb-self');
  if (board.length === 0) {
    podium.innerHTML = '';
    tracks.innerHTML = '<li class="lb-empty">NO SCORES RECORDED TODAY · BE THE FIRST TO SET A RECORD</li>';
    selfBar.hidden = true;
  } else {
    const order = [1, 0, 2]; // #2 Left, #1 Center, #3 Right
    podium.innerHTML = order.map((idx) => {
      const e = board[idx];
      if (!e) return '<div></div>';
      const rank = idx + 1;
      const av = getAvatar(e.avatar || idx);
      return `<div class="pod-banner rank-${rank}">
        <span class="pod-crown">RANK #${rank}</span>
        <div class="pod-avatar-wrap">${av.svg}</div>
        <span class="pod-name">${escHtml(e.name)}</span>
        <span class="pod-score">${fmtScore(e.score)}</span>
        <span class="pod-meta">LV ${e.level || 1} · ×${e.maxCombo || 0}</span>
      </div>`;
    }).join('');

    tracks.innerHTML = board.map((e, idx) => {
      const rank = idx + 1;
      const av = getAvatar(e.avatar || idx);
      const timeMeta = e.timeLabel ? `${e.timeLabel} · ` : '';
      const durMeta = e.runTime ? `${Number(e.runTime).toFixed(1)}s` : `${e.perfects || 0}P`;
      return `<li class="lb-track${rank === 1 ? ' top-1' : ''}">
        <span class="trk-rk">${rank}</span>
        <div class="lb-av">${av.svg}</div>
        <div class="trk-main">
          <span class="trk-nm">${escHtml(e.name)}</span>
          <span class="trk-sc">${fmtScore(e.score)}</span>
        </div>
        <div class="trk-right">
          <span class="trk-lv">LV ${e.level || 1} · ${durMeta}</span>
          <span class="trk-sub">${timeMeta}×${e.maxCombo || 0} · ${e.perfects || 0} PERF</span>
        </div>
      </li>`;
    }).join('');

    if (lastRun) {
      const av = getAvatar(lastRun.avatar || selectedAvatar);
      selfBar.hidden = false;
      selfBar.innerHTML = `
        <span class="self-rk">${lastRun.rank <= 10 ? `#${lastRun.rank}` : '—'}</span>
        <div class="lb-av">${av.svg}</div>
        <div class="trk-main">
          <span class="trk-nm">${escHtml(lastRun.name)}</span>
          <span class="trk-sc">${fmtScore(lastRun.score)}</span>
        </div>
        <div class="trk-right">
          <span class="trk-lv">LV ${lastRun.level}</span>
          <span class="trk-sub">YOUR RUN</span>
        </div>`;
    } else {
      selfBar.hidden = true;
    }
  }
}
syncLeaderboardUI();

let scoreSavedThisRun = false;
let pendingRun = null;

function formatClockTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function commitRunScore(explicitName = '') {
  if (scoreSavedThisRun || !pendingRun || pendingRun.score <= 0) return;
  runSeq += 1;
  const typed = (explicitName || $('player-name').value || '').trim();
  const name = (typed || `PLAYER #${runSeq}`).slice(0, 14).toUpperCase();
  const entry = {
    ...pendingRun,
    name,
    avatar: selectedAvatar,
    at: new Date().toISOString(),
    timeLabel: formatClockTime(),
  };
  board.push(entry);
  runLog.push(entry);
  scoreSavedThisRun = true;
  pendingRun = null;

  const rank = board.filter((b) => b.score > entry.score).length + 1;
  lastRun = { ...entry, rank };
  syncLeaderboardUI();
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(board));
    localStorage.setItem(LOG_KEY, JSON.stringify(runLog));
    localStorage.setItem(RUN_SEQ_KEY, String(runSeq));
  } catch {}
}

function onGameEvent(evt, d = {}) {
  if (evt === 'start' || evt === 'title') {
    // Auto-record previous run if visitor hit Retry / Main Menu without clicking Save
    if (!scoreSavedThisRun && pendingRun && pendingRun.score > 0) {
      commitRunScore();
    }
    scoreSavedThisRun = false;
    pendingRun = null;
    $('player-name').value = ''; // Fresh callsign for the next booth visitor
    $('gameover-panel').hidden = true;
  } else if (evt === 'gameover') {
    const sc = Math.round(d.score || 0);
    const scoreEl = $('go-score-val');
    const animStart = performance.now();
    const animCount = (now) => {
      const t = Math.min(1, (now - animStart) / 480);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreEl.textContent = fmtScore(sc * eased);
      if (t < 1 && !$('gameover-panel').hidden) requestAnimationFrame(animCount);
    };
    requestAnimationFrame(animCount);
    $('go-lv').textContent = String(d.level || 1);
    $('go-combo').textContent = `×${d.maxCombo || d.combo || 0}`;
    $('go-hits').textContent = String(d.hits || 0);
    $('go-perf').textContent = String(d.perfects || 0);
    $('go-reason-val').textContent = d.fatalText || 'TIME UP';

    const rank = board.filter((b) => b.score > sc).length + 1;
    const tag = $('go-rank-tag');
    if (sc > 0 && rank <= 10) {
      tag.textContent = `NEW #${rank} RECORD // SIGNAL LOST`;
      tag.classList.add('high');
    } else {
      tag.textContent = 'SIGNAL LOST // LOCKED OUT';
      tag.classList.remove('high');
    }

    const canSave = sc > 0;
    pendingRun = canSave ? {
      score: sc,
      level: d.level || 1,
      maxCombo: d.maxCombo || 0,
      perfects: d.perfects || 0,
      hits: d.hits || 0,
      runTime: Number((d.runTime || 0).toFixed(1)),
    } : null;
    lastRun = canSave ? {
      name: `PLAYER #${runSeq + 1}`,
      score: sc,
      level: d.level || 1,
      rank,
      avatar: selectedAvatar,
    } : null;
    syncLeaderboardUI();
    $('player-name').placeholder = `PLAYER #${runSeq + 1} (OPTIONAL)`;
    $('score-form').hidden = !canSave;
    $('avatar-picker').hidden = !canSave;
    $('score-form').querySelector('.sf-row').hidden = false;
    $('score-saved-msg').hidden = true;
    $('gameover-panel').hidden = false;
  }
}

$('score-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (scoreSavedThisRun || !pendingRun) return;
  commitRunScore($('player-name').value);
  $('avatar-picker').hidden = true;
  $('score-form').querySelector('.sf-row').hidden = true;
  $('score-saved-msg').hidden = false;
  $('player-name').blur();
});

// ---------- Modals (How to Play & Leaderboard)
function openModal(id, show = true) {
  const el = $(id);
  if (!el) return;
  el.hidden = !show;
  if (show && demo.state.mode === 'play' && !demo.state.paused) {
    setPaused(demo.togglePause());
  }
}
const anyModalOpen = () => !$('tutorial-modal').hidden || !$('leaderboard-modal').hidden;

$('btn-howto').addEventListener('click', () => openModal('tutorial-modal', $('tutorial-modal').hidden));
$('tut-close').addEventListener('click', () => openModal('tutorial-modal', false));
$('tut-play').addEventListener('click', () => {
  openModal('tutorial-modal', false);
  audio.unlock();
  if (demo.state.mode !== 'play') demo.start();
  else if (demo.state.paused) setPaused(demo.togglePause());
});
$('tutorial-modal').addEventListener('click', (e) => { if (e.target === $('tutorial-modal')) openModal('tutorial-modal', false); });

$('btn-lb').addEventListener('click', () => openModal('leaderboard-modal', $('leaderboard-modal').hidden));
$('btn-open-lb-side').addEventListener('click', () => openModal('leaderboard-modal', true));
$('btn-go-lb').addEventListener('click', () => openModal('leaderboard-modal', true));
$('lb-close').addEventListener('click', () => openModal('leaderboard-modal', false));
$('lb-close-btn').addEventListener('click', () => openModal('leaderboard-modal', false));
$('leaderboard-modal').addEventListener('click', (e) => { if (e.target === $('leaderboard-modal')) openModal('leaderboard-modal', false); });

let resetConfirmTimer = null;
$('lb-reset').addEventListener('click', () => {
  const btn = $('lb-reset');
  if (!resetConfirmTimer) {
    btn.textContent = 'CLICK AGAIN TO CONFIRM RESET';
    resetConfirmTimer = setTimeout(() => {
      resetConfirmTimer = null;
      btn.textContent = "RESET DAY'S SCORES (BOOTH)";
    }, 3000);
    return;
  }
  clearTimeout(resetConfirmTimer);
  resetConfirmTimer = null;
  btn.textContent = "RESET DAY'S SCORES (BOOTH)";
  board = [];
  runLog = [];
  runSeq = 0;
  lastRun = null;
  demo.state.best = 0;
  try {
    localStorage.setItem(LB_KEY, '[]');
    localStorage.setItem(LOG_KEY, '[]');
    localStorage.setItem(RUN_SEQ_KEY, '0');
    localStorage.setItem('ticklock_best', '0');
  } catch {}
  syncLeaderboardUI();
});

$('lb-export').addEventListener('click', () => {
  const rows = runLog.length > 0 ? runLog : board;
  const header = 'Timestamp,Time,Callsign,Score,SurvivalTime_s,Level,MaxCombo,Perfects,Avatar';
  const lines = rows.map((r) => [
    r.at || '',
    r.timeLabel || '',
    `"${String(r.name || '').replace(/"/g, '""')}"`,
    Math.round(r.score || 0),
    r.runTime ?? '',
    r.level || 1,
    r.maxCombo || 0,
    r.perfects || 0,
    r.avatar || '',
  ].join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ticklock-openhouse-scores-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('btn-start-main').addEventListener('click', () => { audio.unlock(); demo.start(); });
$('btn-menu-settings').addEventListener('click', toggleSettings);
$('btn-retry').addEventListener('click', () => { audio.unlock(); demo.start(); });
$('btn-go-title').addEventListener('click', () => { audio.unlock(); demo.toTitle(); });

// Left-Rail Menu navigation (ArrowUp/ArrowDown/W/S + mouse hover focus sync)
const railBtns = [...document.querySelectorAll('#menu-rail .rail-btn')];
let railIndex = 0;
function setRailFocus(idx) {
  railIndex = (idx + railBtns.length) % railBtns.length;
  railBtns.forEach((b, i) => b.classList.toggle('active', i === railIndex));
}
railBtns.forEach((b, i) => b.addEventListener('pointerenter', () => setRailFocus(i)));

// ---------- visual & performance settings panel
const SETTINGS_KEY = 'ticklock_settings';
const DEFAULTS = {
  preset: 'balanced', scale: 0.90, brightness: 1.20, contrast: 1.05,
  saturation: 1.05, glow: 1.00, vignette: 0.45, particles: true,
};
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (saved && typeof saved === 'object') stage.applyVisuals({ ...DEFAULTS, ...saved });
} catch {}

function syncSettingsUI() {
  const v = stage.visuals;
  $('sp-preset').value = v.preset;
  $('sp-scale').value = Math.round(v.scale * 100);
  $('val-scale').textContent = `${Math.round(v.scale * 100)}%`;
  $('sp-bright').value = Math.round(v.brightness * 100);
  $('val-bright').textContent = `${Math.round(v.brightness * 100)}%`;
  $('sp-contrast').value = Math.round(v.contrast * 100);
  $('val-contrast').textContent = `${Math.round(v.contrast * 100)}%`;
  $('sp-sat').value = Math.round(v.saturation * 100);
  $('val-sat').textContent = `${Math.round(v.saturation * 100)}%`;
  $('sp-glow').value = Math.round(v.glow * 100);
  $('val-glow').textContent = `${Math.round(v.glow * 100)}%`;
  $('sp-vig').value = Math.round(v.vignette * 100);
  $('val-vig').textContent = `${Math.round(v.vignette * 100)}%`;
  $('sp-particles').checked = v.particles !== false;
  perf.pixelRatio = stage.renderer.getPixelRatio();
}
function saveVisuals(patch) {
  stage.applyVisuals(patch);
  syncSettingsUI();
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(stage.visuals)); } catch {}
}
syncSettingsUI();

function toggleSettings() {
  const panel = $('settings-panel');
  panel.hidden = !panel.hidden;
  $('btn-settings').classList.toggle('on', !panel.hidden);
}
$('btn-settings').addEventListener('click', toggleSettings);
$('sp-close').addEventListener('click', toggleSettings);
$('sp-preset').addEventListener('change', (e) => {
  const preset = e.target.value;
  if (preset === 'perf') saveVisuals({ preset, scale: 0.70, particles: false, glow: 0.85 });
  else if (preset === 'ultra') saveVisuals({ preset, scale: 1.05, particles: true, glow: 1.15 });
  else saveVisuals({ preset, scale: 0.90, particles: true, glow: 1.00 });
});
$('sp-scale').addEventListener('input', (e) => saveVisuals({ scale: Number(e.target.value) / 100 }));
$('sp-bright').addEventListener('input', (e) => saveVisuals({ brightness: Number(e.target.value) / 100 }));
$('sp-contrast').addEventListener('input', (e) => saveVisuals({ contrast: Number(e.target.value) / 100 }));
$('sp-sat').addEventListener('input', (e) => saveVisuals({ saturation: Number(e.target.value) / 100 }));
$('sp-glow').addEventListener('input', (e) => saveVisuals({ glow: Number(e.target.value) / 100 }));
$('sp-vig').addEventListener('input', (e) => saveVisuals({ vignette: Number(e.target.value) / 100 }));
$('sp-particles').addEventListener('change', (e) => saveVisuals({ particles: e.target.checked }));
$('sp-reset').addEventListener('click', () => {
  try { localStorage.removeItem(SETTINGS_KEY); } catch {}
  saveVisuals({ ...DEFAULTS });
});

// ---------- input
const input = { boost: false, keyBoost: false, btnBoost: false, padBoost: false };
const syncBoost = () => {
  input.boost = input.keyBoost || input.btnBoost || input.padBoost;
  $('btn-boost').classList.toggle('on', input.boost);
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // Don't hijack keys while the player is typing their name on the Game Over leaderboard form
  if (document.activeElement === $('player-name')) {
    if (e.code === 'Escape') $('player-name').blur();
    return;
  }
  audio.unlock();
  if (e.code === 'Escape') {
    if (anyModalOpen()) {
      openModal('tutorial-modal', false);
      openModal('leaderboard-modal', false);
      return;
    }
    setPaused(demo.togglePause());
    return;
  }
  if (anyModalOpen()) {
    if (e.code === 'KeyH') openModal('tutorial-modal', false);
    if (e.code === 'KeyL') openModal('leaderboard-modal', false);
    return;
  }
  if (demo.state.mode === 'title') {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); setRailFocus(railIndex + 1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); setRailFocus(railIndex - 1); return; }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      railBtns[railIndex]?.click();
      return;
    }
  }
  if (demo.state.mode === 'play' && demo.state.paused) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); pause3d.moveSelection(1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); pause3d.moveSelection(-1); return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); pause3d.activateSelected(); return; }
    if (e.code === 'KeyR') { setPaused(false); demo.start(); return; }
    if (e.code === 'KeyM') { setPaused(false); demo.toTitle(); return; }
    if (e.code === 'KeyP') { setPaused(demo.togglePause()); return; }
    if (e.code === 'KeyG') { toggleSettings(); return; }
    if (e.code === 'KeyF') { $('perf').hidden = !$('perf').hidden; return; }
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); demo.pick(); }
  else if (e.key === 'Shift') { input.keyBoost = true; syncBoost(); }
  else if (e.code === 'KeyP') setPaused(demo.togglePause());
  else if (e.code === 'KeyH') openModal('tutorial-modal', $('tutorial-modal').hidden);
  else if (e.code === 'KeyL') openModal('leaderboard-modal', $('leaderboard-modal').hidden);
  else if (e.code === 'KeyF') $('perf').hidden = !$('perf').hidden;
  else if (e.code === 'KeyG') toggleSettings();
  else if (/^[0-7]$/.test(e.key)) demo.debugKey(e.key);
});
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') { input.keyBoost = false; syncBoost(); } });

stage.renderer.domElement.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.unlock();
  if (demo.state.mode === 'play' && demo.state.paused) {
    pause3d.onPointerDown(e.clientX, e.clientY);
    return;
  }
  demo.pick();
});
$('btn-pick').addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); demo.pick(); });
const boostBtn = $('btn-boost');
boostBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); input.btnBoost = true; syncBoost(); });
for (const t of ['pointerup', 'pointercancel']) boostBtn.addEventListener(t, () => { input.btnBoost = false; syncBoost(); });
$('btn-pause').addEventListener('click', () => setPaused(demo.togglePause()));

function setPaused(p) {
  document.body.dataset.paused = p ? 'true' : 'false';
  if (!p) stage.renderer.domElement.style.cursor = '';
}

window.addEventListener('pointermove', (e) => {
  if (demo.state.mode === 'play' && demo.state.paused) {
    const over = pause3d.onPointerMove(e.clientX, e.clientY);
    stage.renderer.domElement.style.cursor = over ? 'pointer' : '';
    return;
  }
  fx.setParallax((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
});

// Gamepad: A = pick, RB/RT = boost (browsers expose pads only after a button press)
let padA = false;
function pollPad() {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!pad) return;
  const a = pad.buttons[0]?.pressed;
  if (a && !padA) demo.pick();
  padA = a;
  const b = !!(pad.buttons[5]?.pressed || pad.buttons[7]?.pressed);
  if (b !== input.padBoost) { input.padBoost = b; syncBoost(); }
}

// ---------- loop
// Adaptive quality: never reallocate render targets mid-game (which causes black-frame flashes).
// If the GPU is consistently slow (> 28 ms for 2 s), only disable bloom once.
let slowSeconds = 0, drops = 0;
const startedAt = performance.now();
function adaptQuality(avgMs) {
  if (document.hidden || window.__ticklock?.noAdapt || drops >= 1) return;
  if (performance.now() - startedAt < 3000) return;           // ignore loading hitches
  slowSeconds = avgMs > 28 ? slowSeconds + 1 : 0;
  if (slowSeconds >= 2) {
    stage.bloom.enabled = false;
    slowSeconds = 0; drops++;
    perf.tier = drops;
  }
}
window.__ticklock = { state: demo.state, perf, stage };

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, 0.05);

  pollPad();
  demo.update(dt, input);
  const s = demo.state;
  const vdt = s.paused ? 0 : dt;
  dial.update(vdt, {
    needleAngle: s.needleAngle, dir: s.dir,
    boost: s.boost && s.mode === 'play',
    flow: s.flow && s.mode === 'play',
    ghost: s.ghost,
    zones: s.zones,
  });
  hud.update(vdt, s);
  fx.update(vdt, s);
  pause3d.update(fx.updatePauseCam(dt, s));
  stage.render();

  // Contextual visibility for Title UI, Mode Attribute & Tutorial Banner
  document.body.dataset.mode = s.mode;
  document.body.dataset.paused = s.paused ? 'true' : 'false';
  $('title-ui').hidden = s.mode !== 'title';
  const banner = $('tutorial-banner');
  if (s.mode === 'play' && !s.paused) {
    if (!s.clockStarted) {
      banner.hidden = false;
      const html = 'HIT THE <strong>GOLD ZONE</strong> TO START THE 30s CLOCK · <strong>[SPACE / TAP]</strong>';
      if (banner.innerHTML !== html) banner.innerHTML = html;
    } else if (s.hits < 3) {
      banner.hidden = false;
      const html = 'AIM FOR <strong>WHITE CORE</strong> FOR PERFECT (×2) · HOLD <strong>[SHIFT]</strong> TO BOOST';
      if (banner.innerHTML !== html) banner.innerHTML = html;
    } else {
      banner.hidden = true;
    }
  } else {
    banner.hidden = true;
  }

  perf.frames++; perf.acc += raw * 1000;
  if (perf.acc >= 1000) {
    perf.avgMs = perf.acc / perf.frames;
    adaptQuality(perf.avgMs);
    $('perf').textContent = `${(1000 / perf.avgMs).toFixed(0)} fps · ${perf.avgMs.toFixed(1)} ms · px ${perf.pixelRatio.toFixed(2)}`;
    perf.frames = 0; perf.acc = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
