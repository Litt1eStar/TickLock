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

// ---------- boot screen: real progress for fonts (10%), studio.glb (70%), scene setup + shader compile (20%)
const boot = (() => {
  const el = $('boot'), arc = $('boot-arc'), needle = $('boot-needle'), pct = $('boot-pct'), step = $('boot-step');
  let shown = 0;
  return {
    set(k, label) {
      shown = Math.max(shown, Math.min(1, k));          // never runs backwards
      arc.style.strokeDashoffset = String(100 - shown * 100);
      needle.style.transform = `rotate(${shown * 360}deg)`;
      pct.textContent = String(Math.round(shown * 100));
      if (label && step.textContent !== label) step.textContent = label;
    },
    fail() {
      el.classList.add('is-failed');
      step.textContent = 'The studio could not load. Refresh the page to try again.';
    },
    finish(onGone) {
      el.classList.add('is-done');
      let gone = false;
      const end = () => { if (gone) return; gone = true; el.remove(); onGone(); };
      el.addEventListener('transitionend', (e) => { if (e.target === el) end(); });
      setTimeout(end, 900);                               // reduced motion has no transition to wait for
    },
  };
})();

boot.set(0.02, 'Loading fonts');
// canvas text needs the vendored font loaded before the first hub/monitor draw
await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px "Barlow Condensed"`))).catch(() => {});
boot.set(0.1, 'Loading the studio');
let stage;
try {
  stage = await createStage($('stage'), (k) => boot.set(0.1 + k * 0.7, 'Loading the studio'));
} catch (err) {
  boot.fail();
  throw err;
}
boot.set(0.82, 'Setting the lights');
const dial = createDial(stage);
stage.dial = dial;
const hud = createHud(stage.parts, stage.renderer.capabilities.getMaxAnisotropy());
const fx = createFx(stage, dom);
const audio = createAudio();
// Compile every shader now, behind the boot screen, so the first menu frame doesn't hitch or flash black.
boot.set(0.9, 'Warming up the lights');
await stage.renderer.compileAsync(stage.scene, stage.camera).catch(() => {});
boot.set(1, 'Ready');
let booted = false;

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

  // The studio monitor shows today's top five on the menu
  hud.setBoard(board);

  // Studio Ranking: Olympic Hanging Podium (#2 Left, #1 Center, #3 Right) + Ranked List + Pinned Current Player
  const podium = $('lb-podium');
  const tracks = $('lb-tracks');
  const selfBar = $('lb-self');
  if (board.length === 0) {
    podium.innerHTML = '';
    tracks.innerHTML = '<li class="lb-empty">No scores yet today. Set the first one.</li>';
    selfBar.hidden = true;
  } else {
    const order = [1, 0, 2]; // #2 Left, #1 Center, #3 Right
    podium.innerHTML = order.map((idx) => {
      const e = board[idx];
      if (!e) return '<div></div>';
      const rank = idx + 1;
      const av = getAvatar(e.avatar || idx);
      return `<div class="pod-banner rank-${rank}">
        <span class="pod-crown">#${rank}</span>
        <div class="pod-avatar-wrap">${av.svg}</div>
        <span class="pod-name">${escHtml(e.name)}</span>
        <span class="pod-score">${fmtScore(e.score)}</span>
        <span class="pod-meta">Level ${e.level || 1}</span>
      </div>`;
    }).join('');

    tracks.innerHTML = board.map((e, idx) => {
      const rank = idx + 1;
      const av = getAvatar(e.avatar || idx);
      return `<li class="lb-track${rank === 1 ? ' top-1' : ''}">
        <span class="trk-rk">${rank}</span>
        <div class="lb-av">${av.svg}</div>
        <div class="trk-main">
          <span class="trk-nm">${escHtml(e.name)}</span>
          <span class="trk-sc">${fmtScore(e.score)}</span>
        </div>
        <div class="trk-right">
          <span class="trk-lv">Level ${e.level || 1}</span>
          <span class="trk-sub">Combo ×${e.maxCombo || 0}</span>
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
          <span class="trk-lv">Level ${lastRun.level}</span>
          <span class="trk-sub">Your run</span>
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
  if (evt === 'start') phase = 'run';
  if (evt === 'title') { phase = 'menu'; setRailFocus(0); }
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
    $('go-reason-val').textContent = d.fatalText || 'Time up';

    const rank = board.filter((b) => b.score > sc).length + 1;
    const tag = $('go-rank-tag');
    if (sc > 0 && rank <= 10) {
      tag.textContent = `New #${rank} on today\u2019s board`;
      tag.classList.add('high');
    } else {
      tag.textContent = 'Locked out';
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
    $('player-name').placeholder = `Player #${runSeq + 1}`;
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

// ---------- Menu flow: Play -> How to play -> "Press Space to start" -> run
// phase: 'menu' (title rail), 'brief' (tutorial open from Play), 'ready' (cue shown), 'run' (a game is on)
let phase = 'menu';
let briefOpenedAt = 0;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

function beginBrief() {
  phase = 'brief';
  openModal('tutorial-modal', true);
  briefOpenedAt = performance.now();
  $('tut-play').focus();
}
// Closing the briefing, by any route, leads to the start cue. During a run, H re-opens it as a reference.
function closeTutorial({ resume = false } = {}) {
  if ($('tutorial-modal').hidden) return;
  openModal('tutorial-modal', false);
  if (phase === 'brief') { showReady(); return; }
  if (resume && demo.state.mode === 'play' && demo.state.paused) setPaused(demo.togglePause());
}

// The cue: each glyph gets an index so the needle can wipe it away left to right.
const cue = $('ready-cue');
const cueLine = cue.querySelector('.cue-line');
let cueChars = 0;
for (const part of cueLine.children) {
  if (part.classList.contains('cue-key')) { part.style.setProperty('--i', cueChars++); continue; }
  const text = part.textContent;
  part.textContent = '';
  part.setAttribute('aria-label', text);
  for (const ch of text) {
    const span = document.createElement('span');
    span.className = 'cue-ch';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = ch;
    span.style.setProperty('--i', cueChars++);
    part.appendChild(span);
  }
}
cue.style.setProperty('--n', cueChars);
let cueLeaving = false;
let cueTimer = 0;

function showReady() {
  phase = 'ready';
  clearTimeout(cueTimer);
  cueLeaving = false;
  cue.classList.remove('is-leaving');
  cue.hidden = false;
  document.activeElement?.blur?.();
}
function hideCue(animated) {
  clearTimeout(cueTimer);
  if (!animated || REDUCED_MOTION.matches) {
    cue.classList.add('is-leaving');
    cueTimer = setTimeout(() => { cue.hidden = true; cue.classList.remove('is-leaving'); cueLeaving = false; }, REDUCED_MOTION.matches ? 160 : 0);
    cueLeaving = REDUCED_MOTION.matches;
    return;
  }
  cueLeaving = true;
  cue.classList.add('is-leaving');
  cueTimer = setTimeout(() => { cue.hidden = true; cue.classList.remove('is-leaving'); cueLeaving = false; }, 760);
}
function go() {
  if (phase !== 'ready') return;
  audio.unlock();
  phase = 'run';
  hideCue(true);
  demo.start();
}
function toMenu() {
  hideCue(false);
  if (demo.state.mode !== 'title') demo.toTitle();
  phase = 'menu';
  setRailFocus(0);
}

function openLeaderboard() {
  openModal('leaderboard-modal', true);
  $('lb-close-btn').focus();
}
function closeLeaderboard() {
  openModal('leaderboard-modal', false);
  if (demo.state.mode === 'title') document.activeElement?.blur?.();
}

$('tut-close').addEventListener('click', () => closeTutorial());
$('tut-play').addEventListener('click', () => {
  if (performance.now() - briefOpenedAt < 250) return;     // the key that opened it must not also close it
  closeTutorial({ resume: true });
});
$('tutorial-modal').addEventListener('click', (e) => { if (e.target === $('tutorial-modal')) closeTutorial(); });

$('btn-lb').addEventListener('click', openLeaderboard);
$('btn-go-lb').addEventListener('click', openLeaderboard);
$('lb-close').addEventListener('click', closeLeaderboard);
$('lb-close-btn').addEventListener('click', closeLeaderboard);
$('leaderboard-modal').addEventListener('click', (e) => { if (e.target === $('leaderboard-modal')) closeLeaderboard(); });

let resetConfirmTimer = null;
$('lb-reset').addEventListener('click', () => {
  const btn = $('lb-reset');
  if (!resetConfirmTimer) {
    btn.textContent = 'Press again to clear';
    resetConfirmTimer = setTimeout(() => {
      resetConfirmTimer = null;
      btn.textContent = 'Clear today\u2019s scores';
    }, 3000);
    return;
  }
  clearTimeout(resetConfirmTimer);
  resetConfirmTimer = null;
  btn.textContent = 'Clear today\u2019s scores';
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

$('btn-start-main').addEventListener('click', () => { audio.unlock(); beginBrief(); });
$('btn-menu-settings').addEventListener('click', () => { toggleSettings(); if (!$('settings-panel').hidden) $('sp-preset').focus(); });
$('btn-retry').addEventListener('click', () => { audio.unlock(); demo.start(); });
$('btn-go-title').addEventListener('click', () => { audio.unlock(); toMenu(); });

// Menu navigation (ArrowUp/ArrowDown/W/S, with hover and Tab focus kept in sync)
const railBtns = [...document.querySelectorAll('#menu-rail .rail-btn')];
let railIndex = 0;
function setRailFocus(idx) {
  railIndex = (idx + railBtns.length) % railBtns.length;
  railBtns.forEach((b, i) => {
    b.classList.toggle('active', i === railIndex);
    if (i === railIndex) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
}
setRailFocus(0);
railBtns.forEach((b, i) => {
  b.addEventListener('pointerenter', () => setRailFocus(i));
  b.addEventListener('focus', () => setRailFocus(i));
});

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
  if (panel.hidden && panel.contains(document.activeElement)) document.activeElement.blur();
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

const isGo = (e) => e.code === 'Space' || e.code === 'Enter';
window.addEventListener('keydown', (e) => {
  if (!booted || e.repeat) return;
  // Don't hijack keys while the player is typing their name on the Game Over leaderboard form
  if (document.activeElement === $('player-name')) {
    if (e.code === 'Escape') $('player-name').blur();
    return;
  }
  audio.unlock();
  const settings = $('settings-panel');
  const tut = $('tutorial-modal');
  const lb = $('leaderboard-modal');
  if (e.code === 'Escape') {
    if (!settings.hidden) { toggleSettings(); return; }
    if (!tut.hidden) { closeTutorial(); return; }
    if (!lb.hidden) { closeLeaderboard(); return; }
    if (phase === 'ready') { toMenu(); return; }
    setPaused(demo.togglePause());
    return;
  }
  // Settings controls keep their native keys (arrows move sliders, Space toggles the checkbox)
  if (!settings.hidden && settings.contains(document.activeElement)) return;
  if (!tut.hidden) {
    if (isGo(e)) {
      e.preventDefault();
      if (performance.now() - briefOpenedAt > 250) closeTutorial({ resume: true });
    } else if (e.code === 'KeyH') closeTutorial();
    return;
  }
  if (!lb.hidden) {
    // a focused button inside the board (Close, Export, Clear) handles its own key
    if (e.code === 'KeyL' || (isGo(e) && !lb.contains(document.activeElement))) { e.preventDefault(); closeLeaderboard(); }
    return;
  }
  if (demo.state.mode === 'title') {
    if (phase === 'ready') {
      if (isGo(e)) { e.preventDefault(); go(); }
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); setRailFocus(railIndex + 1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); setRailFocus(railIndex - 1); return; }
    if (isGo(e)) { e.preventDefault(); railBtns[railIndex]?.click(); return; }
    if (e.code === 'KeyL') { openLeaderboard(); return; }
    if (e.code === 'KeyG') { $('btn-menu-settings').click(); return; }
    if (e.code === 'KeyF') { $('perf').hidden = !$('perf').hidden; return; }
    return;
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
  else if (e.code === 'KeyH') { openModal('tutorial-modal', true); $('tut-play').focus(); }
  else if (e.code === 'KeyL') openLeaderboard();
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
  primaryPress();
});
$('btn-pick').addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); demo.pick(); });
const boostBtn = $('btn-boost');
boostBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); input.btnBoost = true; syncBoost(); });
for (const t of ['pointerup', 'pointercancel']) boostBtn.addEventListener(t, () => { input.btnBoost = false; syncBoost(); });
$('btn-pause').addEventListener('click', () => setPaused(demo.togglePause()));

// One "go" action for the canvas and the gamepad, routed through the menu flow on the title screen.
function primaryPress() {
  if (!booted) return;
  if (demo.state.mode !== 'title') { demo.pick(); return; }
  if (phase === 'ready') go();
  else if (phase === 'brief') closeTutorial();
  else if (phase === 'menu' && !anyOverlayOpen()) beginBrief();
}
const anyOverlayOpen = () => !$('tutorial-modal').hidden || !$('leaderboard-modal').hidden || !$('settings-panel').hidden;

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
  if (a && !padA) primaryPress();
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
  const menuUp = booted && s.mode === 'title' && phase === 'menu';
  if ($('title-ui').hidden === menuUp) $('title-ui').hidden = !menuUp;
  const banner = $('tutorial-banner');
  if (s.mode === 'play' && !s.paused && !cueLeaving) {
    if (!s.clockStarted) {
      banner.hidden = false;
      const html = 'Hit a <strong>gold zone</strong> to start the 30-second clock';
      if (banner.innerHTML !== html) banner.innerHTML = html;
    } else if (s.hits < 3) {
      banner.hidden = false;
      const html = 'Hit the white centre for a <strong>perfect</strong>. Hold <strong>Shift</strong> to boost.';
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
  if (!booted && !bootHandoff) {
    // the first lit frame is on screen: fade the boot screen away, then let the menu in
    bootHandoff = true;
    boot.finish(() => { booted = true; });
  }
  requestAnimationFrame(frame);
}
let bootHandoff = false;
requestAnimationFrame(frame);
