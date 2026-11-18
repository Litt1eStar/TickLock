// True 3D World-Space Pause Menu: CanvasTexture plane in the scene + raycasted hover/clicks.
import * as THREE from 'three';

const FONT = '"Barlow Condensed", "Segoe UI", Arial, sans-serif';
const ITEMS = [
  { id: 'resume',   num: '01', label: 'RESUME',    key: 'ESC' },
  { id: 'restart',  num: '02', label: 'RESTART',   key: 'R'   },
  { id: 'settings', num: '03', label: 'SETTINGS',  key: 'G'   },
  { id: 'menu',     num: '04', label: 'MAIN MENU', key: 'M'   },
];

// Normalized UV Y-ranges (0 = bottom, 1 = top) for each of the 4 stacked cards
const CARD_UV = [
  { minY: 0.675, maxY: 0.875 },
  { minY: 0.455, maxY: 0.655 },
  { minY: 0.235, maxY: 0.435 },
  { minY: 0.015, maxY: 0.215 },
];

export function createPauseMenu(stage, onAction) {
  const W = 1024, H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 1.68), mat);
  mesh.position.set(2.95, 0.04, 0.45);
  mesh.rotation.y = -0.32;
  mesh.renderOrder = 10;
  mesh.visible = false;
  stage.scene.add(mesh);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let selected = 0;
  let dirty = true;

  function drawCornerBrackets(x, y, w, h, len, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // top-left
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    // top-right
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    // bottom-left
    ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h);
    // bottom-right
    ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
    ctx.stroke();
  }

  function redraw() {
    dirty = false;
    ctx.clearRect(0, 0, W, H);

    // Top tab: "PAUSED ▾" (matching reference image header tab)
    ctx.fillStyle = 'rgba(13, 17, 26, 0.94)';
    ctx.fillRect(0, 0, 290, 62);
    ctx.strokeStyle = 'rgba(212, 162, 89, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 288, 60);

    ctx.fillStyle = '#efe2c8';
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.16em';
    ctx.fillText('PAUSED', 24, 33);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // Small amber corner triangle on tab
    ctx.fillStyle = '#d4a259';
    ctx.beginPath();
    ctx.moveTo(256, 16); ctx.lineTo(274, 16); ctx.lineTo(274, 34);
    ctx.closePath(); ctx.fill();

    // 4 stacked studio cards
    const padX = 0, cardW = W, cardH = 152, startY = 88, gap = 16;
    ITEMS.forEach((item, i) => {
      const y = startY + i * (cardH + gap);
      const active = i === selected;

      // Card body (high opacity so background monitor doesn't bleed through)
      ctx.fillStyle = active ? 'rgba(22, 28, 42, 0.97)' : 'rgba(11, 14, 22, 0.94)';
      ctx.fillRect(padX, y, cardW, cardH);

      // Hairline border + left brass indicator
      ctx.strokeStyle = active ? 'rgba(212, 162, 89, 0.72)' : 'rgba(239, 226, 200, 0.14)';
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.strokeRect(padX + 1, y + 1, cardW - 2, cardH - 2);
      if (active) {
        ctx.fillStyle = '#d4a259';
        ctx.fillRect(padX, y, 8, cardH);
      }

      // Inner corner bracket ticks (reference look)
      drawCornerBrackets(padX + 18, y + 16, cardW - 36, cardH - 32, 14,
        active ? 'rgba(239, 226, 200, 0.75)' : 'rgba(239, 226, 200, 0.25)');

      // Number prefix
      ctx.fillStyle = active ? '#d4a259' : 'rgba(212, 162, 89, 0.52)';
      ctx.font = `700 28px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${item.num} //`, 46, y + 72);

      // Action label
      ctx.fillStyle = active ? '#efe2c8' : 'rgba(239, 226, 200, 0.78)';
      ctx.font = `700 52px ${FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.12em';
      ctx.fillText(item.label, 145, y + 70);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      // Right key hint badge
      ctx.textAlign = 'right';
      ctx.fillStyle = active ? '#d4a259' : 'rgba(239, 226, 200, 0.42)';
      ctx.font = `600 26px ui-monospace, Consolas, monospace`;
      ctx.fillText(`[${item.key}]`, cardW - 44, y + 70);

      // Bottom horizontal progress/accent bar (from reference image)
      ctx.fillStyle = 'rgba(239, 226, 200, 0.10)';
      ctx.fillRect(42, y + cardH - 22, cardW - 84, 5);
      if (active) {
        ctx.fillStyle = '#efe2c8';
        ctx.fillRect(42, y + cardH - 22, (cardW - 84) * 0.62, 5);
      }
    });

    tex.needsUpdate = true;
  }

  function hitTest(clientX, clientY) {
    if (!mesh.visible) return -1;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, stage.camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length || !hits[0].uv) return -1;
    const v = hits[0].uv.y;
    return CARD_UV.findIndex((c) => v >= c.minY && v <= c.maxY);
  }

  function onPointerMove(clientX, clientY) {
    const idx = hitTest(clientX, clientY);
    if (idx !== -1 && idx !== selected) {
      selected = idx;
      dirty = true;
    }
    return idx !== -1;
  }

  function onPointerDown(clientX, clientY) {
    const idx = hitTest(clientX, clientY);
    if (idx !== -1) {
      selected = idx;
      dirty = true;
      onAction(ITEMS[idx].id);
      return true;
    }
    return false;
  }

  function moveSelection(delta) {
    selected = (selected + delta + ITEMS.length) % ITEMS.length;
    dirty = true;
  }

  function activateSelected() {
    onAction(ITEMS[selected].id);
  }

  function update(amount) {
    const show = amount > 0.02;
    mesh.visible = show;
    if (!show) return;
    if (dirty) redraw();
    mat.opacity = Math.min(1, amount * 1.15);
    const sc = 0.90 + 0.10 * amount;
    mesh.scale.setScalar(sc);
    mesh.position.x = 3.15 - 0.20 * amount;
  }

  redraw();
  return { mesh, update, onPointerMove, onPointerDown, moveSelection, activateSelected };
}
