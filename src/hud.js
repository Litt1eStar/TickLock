// In-world screens: the hub label on the vinyl and the studio monitor. Both are canvas textures.
import * as THREE from 'three';

const FONT = '"Barlow Condensed", "Segoe UI", Arial, sans-serif';
// Late-night palette: calm warm cream on slate; violet accent; amber; warm red for danger.
const C = {
  cream: '#efe2c8', dim: 'rgba(239,226,200,0.75)', faint: 'rgba(239,226,200,0.48)',
  gold: '#ffb347', blue: '#5fd3ff', emerald: '#42ffa1', magenta: '#a99bff', red: '#ff6a4d', navy: '#15141c',
};

// Static slate texture for the hub (drawn once, reused every redraw).
function slateTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const R = size / 2;
  const grd = g.createRadialGradient(R, R * 0.72, size * 0.04, R, R, R);
  grd.addColorStop(0, '#3a3742'); grd.addColorStop(0.74, '#222028'); grd.addColorStop(1, '#121117');
  g.fillStyle = grd; g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {          // fine stone grain
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // Curved watch-crystal glass specular reflection across upper-left
  g.save();
  g.beginPath(); g.arc(R, R, R * 0.94, 0, Math.PI * 2); g.clip();
  const glass = g.createLinearGradient(0, 0, size * 0.75, size * 0.75);
  glass.addColorStop(0, 'rgba(255,245,225,0.11)');
  glass.addColorStop(0.38, 'rgba(255,245,225,0.03)');
  glass.addColorStop(0.46, 'rgba(255,255,255,0)');
  g.fillStyle = glass;
  g.beginPath(); g.ellipse(R * 0.78, R * 0.58, R * 0.92, R * 0.55, -0.42, 0, Math.PI * 2); g.fill();
  g.restore();

  // Inner shadow + machined brass/iron bezel ring
  const inner = g.createRadialGradient(R, R, R * 0.78, R, R, R);
  inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = inner; g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(210,168,104,0.28)';
  g.lineWidth = size * 0.006;
  g.beginPath(); g.arc(R, R, R * 0.94, 0, Math.PI * 2); g.stroke();
  return c;
}

// Canvases are drawn in "design" units (w x h) but stored at SCALE x resolution for sharp text.
// Hub redraws rarely -> 2x. Monitor uploads at 30 Hz -> 1.5x keeps that upload cheap.
// Perf: each redraw re-uploads the whole canvas to the GPU, so keep them modest
// (hub 768², redrawn ~10x/s; monitor 1024x576 at 20 Hz -> ~4x less upload than before).
// The hub shows ~180 px tall on a 1080p screen, so 1.25x (640 px square) is still sharper than it is drawn;
// at 2x it re-uploaded 4 MB to the GPU ten times a second while the clock ran.
const HUB_SCALE = 1.25, MON_SCALE = 0.75;
const MONITOR_HZ = 15;

function makeScreen(mesh, w, h, maxAniso, SCALE) {
  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE; canvas.height = h * SCALE;
  // CPU-backed canvas: uploading a GPU-accelerated 2D canvas into WebGL forces a readback stall.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;                 // glTF UV convention: v=0 is the top of the image
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;       // skip per-frame GPU mipmap generation & keep text razor-sharp
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (mesh) mesh.material = new THREE.MeshBasicMaterial({ map: tex });
  // every draw starts in design units
  const begin = () => ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  return { canvas, ctx, tex, begin };
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function timecode(t) {
  const f = Math.floor((t % 1) * 30), s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60;
  const p = (v) => String(v).padStart(2, '0');
  return `00:${p(m)}:${p(s)}:${p(f)}`;
}

export function createHud(parts, maxAniso = 8) {
  const hub = makeScreen(parts.Dial_Label, 512, 512, maxAniso, HUB_SCALE);
  const mon = makeScreen(parts.Monitor_Screen, 1024, 576, maxAniso, MON_SCALE);
  const SCALE = MON_SCALE;   // used by the monitor glitch slice copy
  const slate = slateTexture(512 * HUB_SCALE);
  // night: the monitor is a dim glow in the dark, not a second focal point
  mon.tex.colorSpace = THREE.SRGBColorSpace;
  if (parts.Monitor_Screen) parts.Monitor_Screen.material.color.setScalar(0.55);

  const scanTile = document.createElement('canvas'); scanTile.width = 4; scanTile.height = 3;
  { const g = scanTile.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 4, 1); }
  const scanlines = mon.ctx.createPattern(scanTile, 'repeat');
  const wave = new Float32Array(56);      // monitor waveform bars
  let energy = 0;                         // spikes on hits
  let glitchT = 0;                        // monitor glitch on miss
  let card = null;                        // { title, sub, color, t, dur }
  let clock = 0;

  function react(evt, d = {}) {
    if (evt === 'hit') energy = Math.min(1.6, energy + (d.perfect ? 1.0 : 0.6));
    if (evt === 'blue') card = { title: '+2s', sub: 'Time bonus', color: C.blue, t: 0, dur: 0.9 };
    if (evt === 'recovery') card = { title: 'Saved! +1.2s', sub: `Combo ×${d.combo} rescued`, color: C.emerald, t: 0, dur: 1.1 };
    if (evt === 'flow') card = { title: 'Flow state', sub: 'Score ×1.25 active', color: C.gold, t: 0, dur: 1.2 };
    if (evt === 'graze') card = { title: 'So close!', sub: `${d.deg}° ${d.timing} · −0.4s`, color: C.gold, t: 0, dur: 0.75 };
    if (evt === 'levelup') card = { title: `Level ${d.level}`, sub: '+2s', color: C.gold, t: 0, dur: 1.3 };
    if (evt === 'miss') { glitchT = 0.3; energy = 0; }
    if (evt === 'fatal') { glitchT = 0.45; card = { title: 'Locked out', sub: d.text || 'Time up', color: C.red, t: 0, dur: 0.9 }; }
    if (evt === 'start' || evt === 'title') { card = null; glitchT = 0; }
  }

  // ---------- hub label (circle inscribed in the 512 square)
  function drawHub(s) {
    const { ctx } = hub;
    hub.begin();
    const W = 512, R = 256;
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(slate, 0, 0, W, W);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
    const blink = Math.floor(clock * 2.2) % 2 === 0;

    if (s.mode === 'title') {
      // The title lives once, in the screen corner; the label carries the number to beat.
      ctx.fillStyle = C.dim; ctx.font = `600 46px ${FONT}`;
      ctx.fillText('Best score', R, 184);
      ctx.fillStyle = C.cream; ctx.font = `600 128px ${FONT}`;
      ctx.fillText(fmt(s.best), R, 282);
    } else if (s.mode === 'over') {
      ctx.fillStyle = C.red; ctx.font = `700 88px ${FONT}`;
      ctx.fillText('Locked out', R, 192);
      if (s.fatalText) {
        ctx.fillStyle = C.gold; ctx.font = `600 28px ${FONT}`;
        ctx.fillText(s.fatalText, R, 250);
      }
      ctx.fillStyle = C.dim; ctx.font = `600 28px ${FONT}`;
      ctx.fillText('Score', R, 296);
      ctx.fillStyle = C.cream; ctx.font = `700 56px ${FONT}`;
      ctx.fillText(fmt(s.score), R, 340);
      if (blink && s.retryReady) { ctx.fillStyle = C.magenta; ctx.font = `600 30px ${FONT}`; ctx.fillText('Space to retry', R, 404); }
    } else {
      if (s.flow) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,179,71,0.45)';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(R, R, R - 10, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Calm layout: label, big number, label, value.
      const low = s.time < 5;
      const pulse = low ? 1 + 0.05 * Math.sin(clock * 14) : 1;
      ctx.fillStyle = s.freezeT > 0 ? C.red : C.dim; ctx.font = `600 34px ${FONT}`;
      ctx.fillText(s.freezeT > 0 && s.fatalText ? s.fatalText : 'Time remaining', R, 108);
      ctx.save(); ctx.translate(R, 212); ctx.scale(pulse, pulse);
      ctx.fillStyle = low ? C.red : C.cream; ctx.font = `600 200px ${FONT}`;
      ctx.fillText(Math.max(0, s.time).toFixed(1), 0, 0);
      ctx.restore();
      ctx.fillStyle = C.dim; ctx.font = `600 34px ${FONT}`;
      ctx.fillText('Score', R, 318);
      ctx.fillStyle = C.cream; ctx.font = `600 72px ${FONT}`;
      ctx.fillText(fmt(s.score), R, 368);
      ctx.font = `600 34px ${FONT}`;
      ctx.fillStyle = s.flow ? C.gold : s.combo > 0 ? C.magenta : C.faint;
      ctx.fillText(s.flow ? `Flow ×${s.combo}` : `×${s.combo}`, R - 64, 424);
      ctx.fillStyle = C.faint; ctx.fillText(`Lv ${s.level}`, R + 64, 424);

      // Physical lock-tumbler pins along the bottom arc (level progress toward Level Up)
      const goal = Math.max(1, s.levelGoal || 4);
      const done = s.levelHits || 0;
      const span = Math.min(0.68, goal * 0.095);
      ctx.save();
      ctx.shadowColor = 'transparent';
      for (let i = 0; i < goal; i++) {
        const a = Math.PI + (goal === 1 ? 0 : ((i / (goal - 1)) - 0.5) * span * 2);
        const px = R - Math.sin(a) * 214;
        const py = R - Math.cos(a) * 214;
        const lit = i < done;
        ctx.fillStyle = lit ? C.gold : 'rgba(20,18,26,0.85)';
        ctx.strokeStyle = lit ? '#fff1d6' : 'rgba(239,226,200,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, lit ? 7.5 : 6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.shadowColor = 'transparent';
    hub.tex.needsUpdate = true;
  }

  // ---------- monitor (16:9)
  function drawMonitor(s, dt) {
    const { ctx } = mon;
    mon.begin();
    const W = 1024, H = 576;
    ctx.fillStyle = s.mode === 'over' ? '#1a0d14' : '#0e1424';
    ctx.fillRect(0, 0, W, H);

    // scanlines (one cached pattern fill instead of 192 rects per redraw)
    ctx.fillStyle = scanlines; ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'middle';
    if (s.mode === 'title') { drawBoard(ctx, W); mon.tex.needsUpdate = true; return; }

    // top bar while recording: Rec + timecode
    const recOn = s.mode === 'play' ? Math.floor(clock * 1.6) % 2 === 0 : true;
    ctx.fillStyle = recOn ? C.red : 'rgba(255,59,59,0.25)';
    ctx.beginPath(); ctx.arc(48, 46, 13, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.font = `700 30px ${FONT}`; ctx.fillStyle = C.cream;
    ctx.fillText(s.mode === 'play' ? 'Rec' : 'Stby', 72, 47);
    ctx.font = `600 30px ui-monospace, Consolas, monospace`; ctx.fillStyle = C.dim;
    ctx.fillText(timecode(s.runTime), 150, 47);

    ctx.textAlign = 'center';
    if (s.mode === 'over') {
      ctx.fillStyle = C.red; ctx.font = `700 92px ${FONT}`;
      ctx.fillText('Locked out', W / 2, 160);
      const rows = [['Score', fmt(s.score)], ['Level', s.level], ['Hits', s.hits], ['Perfect', s.perfects], ['Best', fmt(s.best)]];
      ctx.font = `700 36px ${FONT}`;
      rows.forEach(([k, v], i) => {
        const y = 250 + i * 54;
        ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText(k, 300, y);
        ctx.textAlign = 'right'; ctx.fillStyle = k === 'Best' ? C.gold : C.cream; ctx.fillText(String(v), W - 300, y);
      });
    } else {
      // waveform
      energy = Math.max(0, energy - dt * 2.2);
      const speed = s.boost ? 2.2 : 1;
      const base = 0.12 + Math.min(1, s.combo / 20) * 0.25;
      for (let i = 0; i < wave.length; i++) {
        const n = 0.5 + 0.5 * Math.sin(clock * 7 * speed + i * 0.7) * Math.sin(clock * 3.1 * speed + i * 0.23);
        const target = base + n * 0.35 + energy * (0.5 + 0.5 * Math.sin(i * 1.7 + clock * 20));
        wave[i] += (target - wave[i]) * Math.min(1, dt * 18);
      }
      const bw = (W - 120) / wave.length;
      for (let i = 0; i < wave.length; i++) {
        const h = Math.min(1, wave[i]) * 300;
        const grad = ctx.createLinearGradient(0, 300 - h / 2, 0, 300 + h / 2);
        grad.addColorStop(0, s.boost ? C.blue : C.magenta); grad.addColorStop(1, C.blue);
        ctx.fillStyle = grad;
        ctx.fillRect(60 + i * bw + 2, 300 - h / 2, bw - 5, h);
      }
      ctx.font = `700 64px ${FONT}`;
      ctx.textAlign = 'left'; ctx.fillStyle = s.flow ? C.gold : s.combo > 0 ? C.magenta : C.faint;
      ctx.fillText(s.flow ? `Flow ×${s.combo}` : `Combo ×${s.combo}`, 60, 515);
      ctx.textAlign = 'right'; ctx.fillStyle = C.blue;
      ctx.fillText(`Level ${s.level}`, W - 60, 515);
    }

    // event card (+2s, LEVEL n)
    if (card && s.mode === 'play') {
      card.t += dt;
      const k = card.t / card.dur;
      if (k >= 1) card = null;
      else {
        const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
        const sc = 0.8 + 0.2 * Math.min(1, k / 0.15);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(14,20,36,0.88)'; ctx.fillRect(0, 150, W, 300);
        ctx.translate(W / 2, 280); ctx.scale(sc, sc);
        ctx.textAlign = 'center'; ctx.fillStyle = card.color; ctx.font = `900 150px ${FONT}`;
        ctx.fillText(card.title, 0, 0);
        ctx.fillStyle = C.cream; ctx.font = `800 40px ${FONT}`; ctx.fillText(card.sub, 0, 110);
        ctx.restore();
      }
    }

    // miss glitch: shifted slices + red tint
    if (glitchT > 0) {
      glitchT -= dt;
      for (let i = 0; i < 7; i++) {
        const y = Math.random() * H, h = 10 + Math.random() * 50, dx = (Math.random() - 0.5) * 120;
        // source rect is in real canvas pixels, destination in design units
        ctx.drawImage(mon.canvas, 0, y * SCALE, W * SCALE, h * SCALE, dx, y, W, h);
      }
      ctx.fillStyle = 'rgba(255,59,59,0.22)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.red; ctx.font = `900 110px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('−1.2s', W / 2, 300);
    }
    mon.tex.needsUpdate = true;
  }

  // ---------- monitor on the menu: today's top five, the reason to stay and play
  let board = [];
  let boardStats = null;
  let boardVer = 0;
  function setBoard(rows, stats = null) { board = rows.slice(0, 5); boardStats = stats; boardVer++; }
  function drawBoard(ctx, W) {
    const L = 84, Rx = W - 84;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.cream; ctx.font = `600 52px ${FONT}`;
    ctx.fillText('Today’s top five', L, 92);
    if (boardStats && typeof boardStats.totalPlays === 'number') {
      ctx.textAlign = 'right';
      ctx.fillStyle = C.dim; ctx.font = `600 30px ${FONT}`;
      ctx.fillText(`${boardStats.totalPlays} plays`, Rx, 94);
    }
    ctx.fillStyle = 'rgba(212,162,89,0.45)';
    ctx.fillRect(L, 134, Rx - L, 2);
    if (!board.length) {
      ctx.fillStyle = C.dim; ctx.font = `600 44px ${FONT}`;
      ctx.fillText('No scores yet. Set the first one.', L, 300);
      return;
    }
    board.forEach((e, i) => {
      const y = 196 + i * 78;
      const first = i === 0;
      ctx.textAlign = 'left';
      ctx.fillStyle = first ? C.gold : C.faint; ctx.font = `600 44px ${FONT}`;
      ctx.fillText(String(i + 1), L, y);
      ctx.fillStyle = first ? C.cream : C.dim; ctx.font = `600 ${first ? 52 : 46}px ${FONT}`;
      ctx.fillText(String(e.name).slice(0, 14), L + 64, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = first ? C.gold : C.dim;
      ctx.fillText(fmt(e.score), Rx, y);
    });
  }

  // Redraw the hub only when what it shows changes; the monitor animates at 30 Hz.
  let hubKey = '';
  let monAcc = 1;
  let monKey = '';
  function update(dt, s) {
    clock += dt;
    // dim glow during play; results/title cards brighten so they stay readable
    if (parts.Monitor_Screen) {
      const target = s.mode === 'play' ? 0.55 : 0.95;
      const m = parts.Monitor_Screen.material.color;
      m.setScalar(m.r + (target - m.r) * Math.min(1, dt * 4));
    }
    const blink = s.mode === 'over' && s.retryReady ? Math.floor(clock * 2.2) % 2 : 0;   // only "Space to retry" blinks
    const pulse = s.mode === 'play' && s.time < 5 ? Math.floor(clock * 30) : 0;
    const key = `${s.mode}|${s.time.toFixed(1)}|${Math.round(s.score)}|${s.combo}|${s.flow}|${s.levelHits}|${s.levelGoal}|${s.freezeT > 0}|${s.fatalText}|${s.level}|${s.best}|${blink}|${pulse}|${s.retryReady}`;
    if (key !== hubKey) { hubKey = key; drawHub(s); }
    // The monitor only animates during a run (waveform, cards, glitch). On the menu and results screens it is a
    // still image, so it redraws (and re-uploads to the GPU) only when what it shows changes.
    monAcc += dt;
    const animating = s.mode === 'play' || glitchT > 0;
    if (animating) {
      if (monAcc >= 1 / MONITOR_HZ) { drawMonitor(s, monAcc); monAcc = 0; monKey = ''; }
    } else {
      const k = s.mode === 'title' ? `t|${boardVer}` : `o|${Math.round(s.score)}|${s.level}|${s.hits}|${s.perfects}|${s.best}|${Math.floor(s.runTime * 30)}`;
      if (k !== monKey) { monKey = k; drawMonitor(s, monAcc); monAcc = 0; }
    }
  }

  return { update, react, setBoard };
}
