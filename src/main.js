// Entry: builds the stage, wires visuals + WebAudio to the gameplay engine and input.
import { createStage } from './scene.js';
import { createDial } from './dial.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { createPauseMenu } from './pause3d.js';
import { AVATARS, getAvatar } from './avatars.js';
import { createApi } from './api.js';

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
await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px "Barlow Condensed"`))).catch(() => { });
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
await stage.renderer.compileAsync(stage.scene, stage.camera).catch(() => { });
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
const LB_DATE_KEY = 'ticklock_lb_date';
const todayKey = () => new Date().toLocaleDateString('en-CA');
const SEED_BOARD = [
  { name: 'LITT1ESTAR', score: 14800, level: 7, maxCombo: 18, perfects: 12, avatar: 'ace', timeLabel: '10:15', runTime: 54.2 },
  { name: 'MUASOOM', score: 9600, level: 5, maxCombo: 12, perfects: 8, avatar: 'vinyl', timeLabel: '10:08', runTime: 41.8 },
  { name: 'AGENT-01', score: 6400, level: 4, maxCombo: 9, perfects: 5, avatar: 'operator', timeLabel: '09:55', runTime: 34.5 },
  { name: 'KMUTT-CMM', score: 5200, level: 4, maxCombo: 7, perfects: 4, avatar: 'camera', timeLabel: '09:42', runTime: 31.0 },
  { name: 'VINYL-77', score: 3900, level: 3, maxCombo: 6, perfects: 3, avatar: 'synth', timeLabel: '09:30', runTime: 26.4 },
  { name: 'NIGHT-OWL', score: 2650, level: 2, maxCombo: 4, perfects: 2, avatar: 'onair', timeLabel: '09:18', runTime: 22.1 },
  { name: 'VISITOR', score: 1400, level: 2, maxCombo: 3, perfects: 1, avatar: 'padlock', timeLabel: '09:05', runTime: 16.7 },
];
const today = todayKey();
let rolledOver = false;
try {
  const savedDate = localStorage.getItem(LB_DATE_KEY);
  if (savedDate && savedDate !== today) {
    rolledOver = true;
    localStorage.setItem(LB_KEY, '[]');
    localStorage.setItem(RUN_SEQ_KEY, '0');
    localStorage.setItem('ticklock_best', '0');
    localStorage.setItem(LB_DATE_KEY, today);
    demo.state.best = 0;
  } else if (!savedDate) {
    localStorage.setItem(LB_DATE_KEY, today);
  }
} catch { }
let selectedAvatar = AVATARS[0].id;
let lastRun = null;
let runSeq = Number(localStorage.getItem(RUN_SEQ_KEY) || 0);
let runLog = [];
try {
  const rawLog = JSON.parse(localStorage.getItem(LOG_KEY) || 'null');
  if (Array.isArray(rawLog)) runLog = rawLog;
} catch { }

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
if (rolledOver) {
  board = [];
} else {
  try {
    const raw = JSON.parse(localStorage.getItem(LB_KEY) || 'null');
    board = Array.isArray(raw) ? raw : [...SEED_BOARD];
  } catch {
    board = [...SEED_BOARD];
  }
}

const api = createApi();
let lbScope = 'today';
let todayBoard = [...board];
let currentRunId = '';
let currentRunCountedStart = false;

const fmtScore = (n) => Math.round(n || 0).toLocaleString('en-US');
const escHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function syncAvatarPicker(id) {
  selectedAvatar = id || AVATARS[0].id;
  avPicker.querySelectorAll('.av-opt').forEach((b) => b.classList.toggle('active', b.dataset.av === selectedAvatar));
}

function applyServerState(res) {
  if (!res?.ok) return;
  if (Array.isArray(res.board)) {
    board = res.board;
    if ((res.scope || lbScope) === 'today') {
      todayBoard = res.board;
      try { localStorage.setItem(LB_KEY, JSON.stringify(todayBoard)); } catch { }
    }
  }
  syncLeaderboardUI();
  syncAccountUI();
}

function syncLeaderboardUI() {
  board.sort((a, b) => b.score - a.score);
  board = board.slice(0, 10);
  if (lbScope === 'today') todayBoard = [...board];
  const topScore = todayBoard[0]?.score || 0;
  if (topScore > demo.state.best) {
    demo.state.best = topScore;
    try { localStorage.setItem('ticklock_best', String(topScore)); } catch { }
  }

  const st = api.state.stats;
  const playsCount = api.state.online ? st.totalPlays : Math.max(st.totalPlays, runLog.length);
  const playersCount = api.state.online ? st.uniquePlayers : new Set([...todayBoard, ...runLog].filter((b) => b.score > 0).map((b) => b.name)).size;
  $('lb-stats').textContent = `${fmtScore(playsCount)} plays / ${fmtScore(playersCount)} players`;

  // The studio monitor always shows today's top five + live play counter on the menu
  hud.setBoard(todayBoard, { totalPlays: playsCount, uniquePlayers: playersCount });

  // Studio Ranking: Olympic Hanging Podium (#2 Left, #1 Center, #3 Right) + Ranked List
  const podium = $('lb-podium');
  const tracks = $('lb-tracks');
  if (board.length === 0) {
    podium.innerHTML = '';
    tracks.innerHTML = '<li class="lb-empty">No scores yet for this view. Set the first one.</li>';
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
  }
}
syncLeaderboardUI();

let scoreSavedThisRun = false;
let pendingRun = null;

function formatClockTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function upsertLocalEntry(list, entry) {
  const idx = entry.clientRunId ? list.findIndex((r) => r.clientRunId === entry.clientRunId) : -1;
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
}

function commitRunScore(explicitName = '') {
  if (scoreSavedThisRun || !pendingRun || pendingRun.score <= 0) return;
  runSeq += 1;
  const typed = (explicitName || $('player-name').value || api.state.user?.displayName || '').trim();
  const name = (typed || `PLAYER #${runSeq}`).slice(0, 14).toUpperCase();
  const entry = {
    ...pendingRun,
    name,
    avatar: selectedAvatar,
    at: pendingRun.at || new Date().toISOString(),
    timeLabel: pendingRun.timeLabel || formatClockTime(),
    dayKey: pendingRun.dayKey || todayKey(),
  };
  upsertLocalEntry(todayBoard, entry);
  if (lbScope === 'today') upsertLocalEntry(board, entry);
  upsertLocalEntry(runLog, entry);
  scoreSavedThisRun = true;
  pendingRun = null;

  const rank = todayBoard.filter((b) => b.score > entry.score).length + 1;
  lastRun = { ...entry, rank };
  syncLeaderboardUI();
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(todayBoard.slice(0, 10)));
    localStorage.setItem(LOG_KEY, JSON.stringify(runLog));
    localStorage.setItem(RUN_SEQ_KEY, String(runSeq));
    localStorage.setItem(LB_DATE_KEY, todayKey());
  } catch { }
  api.submitRun(entry, lbScope).then(applyServerState);
}

function onGameEvent(evt, d = {}) {
  if (evt === 'start') {
    phase = 'run';
    if (!scoreSavedThisRun && pendingRun && pendingRun.score > 0) {
      commitRunScore();
    }
    scoreSavedThisRun = false;
    pendingRun = null;
    currentRunId = crypto.randomUUID?.() || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentRunCountedStart = false;
    api.notifyPlayStart().then((ok) => {
      if (ok) currentRunCountedStart = true;
      syncLeaderboardUI();
    });
    $('player-name').value = ''; // Fresh callsign for the next booth visitor
    $('gameover-panel').hidden = true;
  } else if (evt === 'title') {
    phase = 'menu';
    setRailFocus(0);
    if (!scoreSavedThisRun && pendingRun && pendingRun.score > 0) {
      commitRunScore();
    }
    scoreSavedThisRun = false;
    pendingRun = null;
    $('player-name').value = '';
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

    if (api.state.user) {
      syncAvatarPicker(api.state.user.avatar);
      $('player-name').value = api.state.user.displayName;
    }

    const rank = todayBoard.filter((b) => b.score > sc).length + 1;
    const tag = $('go-rank-tag');
    if (sc > 0 && rank <= 10) {
      tag.textContent = `New #${rank} on today\u2019s board`;
      tag.classList.add('high');
    } else {
      tag.textContent = 'Locked out';
      tag.classList.remove('high');
    }

    const runPayload = {
      clientRunId: currentRunId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      countedStart: currentRunCountedStart,
      score: sc,
      level: d.level || 1,
      maxCombo: d.maxCombo || 0,
      perfects: d.perfects || 0,
      hits: d.hits || 0,
      runTime: Number((d.runTime || 0).toFixed(1)),
      fatalText: d.fatalText || 'Time up',
      at: new Date().toISOString(),
      timeLabel: formatClockTime(),
      dayKey: todayKey(),
    };

    const provisionalName = api.state.user?.displayName || (sc > 0 ? `PLAYER #${runSeq + 1}` : 'ANON');
    api.submitRun({ ...runPayload, name: provisionalName, avatar: selectedAvatar }, lbScope).then(applyServerState);

    const canSave = sc > 0;
    pendingRun = canSave ? runPayload : null;
    lastRun = canSave ? {
      name: provisionalName,
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
  api.fetchState(lbScope).then(applyServerState);
}
function closeLeaderboard() {
  openModal('leaderboard-modal', false);
  if (demo.state.mode === 'title') document.activeElement?.blur?.();
}

const SCOPE_TITLES = {
  today: 'Today\u2019s top 10',
  openhouse: 'Open House 2026 top 10',
  all: 'All-time top 10',
};
document.querySelectorAll('#leaderboard-modal .lb-tab[data-scope]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const next = tab.dataset.scope || 'today';
    lbScope = next;
    document.querySelectorAll('#leaderboard-modal .lb-tab[data-scope]').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('lb-title').textContent = SCOPE_TITLES[next] || SCOPE_TITLES.today;
    if (api.state.online) {
      api.fetchState(lbScope).then(applyServerState);
    } else {
      board = next === 'today' ? [...todayBoard] : [...todayBoard];
      syncLeaderboardUI();
    }
  });
});

// ---------- Account Modal (Sign in / Create account / Guest)
let authMode = 'login';
let authAvatar = AVATARS[0].id;
const authAvPicker = $('auth-avatar-picker');
authAvPicker.innerHTML = AVATARS.map((a, i) => (
  `<button type="button" class="av-opt${i === 0 ? ' active' : ''}" data-av="${a.id}" title="${a.label}">${a.svg}</button>`
)).join('');
authAvPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.av-opt');
  if (!btn) return;
  authAvatar = btn.dataset.av;
  authAvPicker.querySelectorAll('.av-opt').forEach((b) => b.classList.toggle('active', b === btn));
});

function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === 'register';
  $('tab-login').classList.toggle('active', !reg);
  $('tab-register').classList.toggle('active', reg);
  $('auth-name-wrap').hidden = !reg;
  $('auth-av-wrap').hidden = !reg;
  $('auth-submit').textContent = reg ? 'Create account' : 'Sign in';
  $('auth-msg').hidden = true;
}
$('tab-login').addEventListener('click', () => setAuthMode('login'));
$('tab-register').addEventListener('click', () => setAuthMode('register'));

function syncAccountUI() {
  const u = api.state.user;
  $('btn-account').textContent = u ? `Account: ${u.displayName}` : 'Account';
  $('acct-signed-out').hidden = Boolean(u);
  $('acct-signed-in').hidden = !u;
  if (u) {
    $('acct-av').innerHTML = getAvatar(u.avatar).svg;
    $('acct-name').textContent = u.displayName;
    $('acct-user').textContent = `@${u.username}`;
    $('acct-best').textContent = fmtScore(u.bestScore);
    $('acct-runs').textContent = `${fmtScore(u.totalRuns)} runs`;
  }
  const serverInput = $('acct-server-url');
  if (serverInput && document.activeElement !== serverInput) serverInput.value = api.state.apiBase || '';
  const pendingSuffix = api.state.pendingCount > 0 ? ` (${api.state.pendingCount} queued)` : '';
  $('acct-conn-status').textContent = api.state.online
    ? `${api.state.apiBase ? 'Connected to VPS' : 'Connected (local)'}${pendingSuffix}`
    : `Offline${pendingSuffix}`;
}
syncAccountUI();

function openAccount() {
  setAuthMode('login');
  syncAccountUI();
  openModal('account-modal', true);
  if (api.state.user) $('acct-done').focus();
  else $('auth-username').focus();
}
function closeAccount() {
  openModal('account-modal', false);
  if (demo.state.mode === 'title') document.activeElement?.blur?.();
}

$('btn-account').addEventListener('click', openAccount);
$('acct-close').addEventListener('click', closeAccount);
$('acct-done').addEventListener('click', closeAccount);
$('acct-guest-btn').addEventListener('click', closeAccount);
$('account-modal').addEventListener('click', (e) => { if (e.target === $('account-modal')) closeAccount(); });

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('auth-msg');
  msg.hidden = true;
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  if (!api.state.online) {
    const check = await api.fetchState(lbScope);
    if (!check) {
      msg.textContent = 'Start the server (node server.mjs) to use accounts.';
      msg.hidden = false;
      return;
    }
  }
  const res = authMode === 'register'
    ? await api.register({ username, password, displayName: $('auth-display').value.trim(), avatar: authAvatar })
    : await api.login({ username, password });
  if (!res?.ok) {
    msg.textContent = res?.error || 'Could not complete request.';
    msg.hidden = false;
    return;
  }
  $('auth-password').value = '';
  syncAccountUI();
  if (res.user?.avatar) syncAvatarPicker(res.user.avatar);
  api.fetchState(lbScope).then(applyServerState);
});

$('acct-logout').addEventListener('click', async () => {
  await api.logout();
  syncAccountUI();
  setAuthMode('login');
});

$('acct-server-save').addEventListener('click', async () => {
  const btn = $('acct-server-save');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  const res = await api.setApiBase($('acct-server-url').value.trim());
  btn.disabled = false;
  btn.textContent = 'Connect';
  if (res) applyServerState(res);
  else syncAccountUI();
});

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
$('lb-reset').addEventListener('click', async () => {
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

  if (api.state.online) {
    const key = api.state.adminProtected ? (window.prompt('Enter admin key to clear today\u2019s live board:') || '') : '';
    if (api.state.adminProtected && !key) {
      btn.textContent = 'Clear today\u2019s scores';
      return;
    }
    const r = await api.clearToday(key);
    if (!r.ok) {
      btn.textContent = 'Admin key rejected';
      setTimeout(() => { btn.textContent = 'Clear today\u2019s scores'; }, 2000);
      return;
    }
  }

  btn.textContent = 'Clear today\u2019s scores';
  board = [];
  todayBoard = [];
  runLog = [];
  runSeq = 0;
  lastRun = null;
  demo.state.best = 0;
  try {
    localStorage.setItem(LB_KEY, '[]');
    localStorage.setItem(LOG_KEY, '[]');
    localStorage.setItem(RUN_SEQ_KEY, '0');
    localStorage.setItem('ticklock_best', '0');
    localStorage.setItem(LB_DATE_KEY, todayKey());
  } catch { }
  syncLeaderboardUI();
});

$('lb-export').addEventListener('click', () => {
  if (api.state.online) {
    const a = document.createElement('a');
    a.href = api.getExportUrl();
    a.download = `ticklock-scores-${todayKey()}.csv`;
    a.click();
    return;
  }
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

api.init().then(applyServerState);

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
} catch { }

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
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(stage.visuals)); } catch { }
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
  try { localStorage.removeItem(SETTINGS_KEY); } catch { }
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
  const acct = $('account-modal');
  if (e.code === 'Escape') {
    if (!settings.hidden) { toggleSettings(); return; }
    if (!tut.hidden) { closeTutorial(); return; }
    if (!lb.hidden) { closeLeaderboard(); return; }
    if (!acct.hidden) { closeAccount(); return; }
    if (phase === 'ready') { toMenu(); return; }
    setPaused(demo.togglePause());
    return;
  }
  // Account form keeps native keys while typing/focusing
  if (!acct.hidden) return;
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
    if (/^[0-7]$/.test(e.key)) { phase = 'run'; demo.debugKey(e.key); }   // debug keys, as before the redesign
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
  if (demo.state.mode === 'over' && $('gameover-panel').contains(document.activeElement) && document.activeElement !== $('btn-retry')) {
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
const anyOverlayOpen = () => !$('tutorial-modal').hidden || !$('leaderboard-modal').hidden || !$('settings-panel').hidden || !$('account-modal').hidden;

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
  fx.setParallax((e.clientX / stage.viewport.w) * 2 - 1, -((e.clientY / stage.viewport.h) * 2 - 1));
});

// Gamepad: A = pick, RB/RT = boost (browsers expose pads only after a button press)
let padA = false;
function pollPad() {
  const pads = navigator.getGamepads?.();
  if (!pads) return;
  let pad = null;
  for (let i = 0; i < pads.length; i++) { if (pads[i]) { pad = pads[i]; break; } }
  if (!pad) return;
  const a = pad.buttons[0]?.pressed;
  if (a && !padA) primaryPress();
  padA = a;
  const b = !!(pad.buttons[5]?.pressed || pad.buttons[7]?.pressed);
  if (b !== input.padBoost) { input.padBoost = b; syncBoost(); }
}

// ---------- loop
// Adaptive quality: never reallocate render targets mid-game (which causes black-frame flashes).
// If the GPU is consistently slow (> 28 ms for 2 s), drop particles once.
let slowSeconds = 0, drops = 0;
const startedAt = performance.now();
function adaptQuality(avgMs) {
  if (document.hidden || window.__ticklock?.noAdapt || drops >= 1) return;
  if (performance.now() - startedAt < 3000) return;           // ignore loading hitches
  slowSeconds = avgMs > 28 ? slowSeconds + 1 : 0;
  if (slowSeconds >= 2) {
    stage.visuals.particles = false;
    syncSettingsUI();
    slowSeconds = 0; drops++;
    perf.tier = drops;
  }
}
window.__ticklock = { state: demo.state, perf, stage, api };

const titleEl = $('title-ui');
const bannerEl = $('tutorial-banner');
const perfEl = $('perf');

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
  audio.update(vdt, s);
  pause3d.update(fx.updatePauseCam(dt, s));
  stage.render();

  // Contextual visibility for Title UI, Mode Attribute & Tutorial Banner
  // write only on change: attribute writes invalidate style even when the value is the same
  const ds = document.body.dataset, pausedStr = s.paused ? 'true' : 'false';
  if (ds.mode !== s.mode) ds.mode = s.mode;
  if (ds.paused !== pausedStr) ds.paused = pausedStr;
  const menuUp = booted && s.mode === 'title' && phase === 'menu';
  if (titleEl.hidden === menuUp) titleEl.hidden = !menuUp;
  if (s.mode === 'play' && !s.paused && !cueLeaving) {
    if (!s.clockStarted) {
      bannerEl.hidden = false;
      const html = 'Hit a <strong>gold zone</strong> to start the 30-second clock';
      if (bannerEl.innerHTML !== html) bannerEl.innerHTML = html;
    } else if (s.hits < 3) {
      bannerEl.hidden = false;
      const html = 'Hit the white centre for a <strong>perfect</strong>. Hold <strong>Shift</strong> to boost.';
      if (bannerEl.innerHTML !== html) bannerEl.innerHTML = html;
    } else {
      bannerEl.hidden = true;
    }
  } else {
    bannerEl.hidden = true;
  }

  perf.frames++; perf.acc += raw * 1000;
  if (perf.acc >= 1000) {
    perf.avgMs = perf.acc / perf.frames;
    adaptQuality(perf.avgMs);
    perfEl.textContent = `${(1000 / perf.avgMs).toFixed(0)} fps · ${perf.avgMs.toFixed(1)} ms · px ${perf.pixelRatio.toFixed(2)}`;
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
