// True 3D World-Space Pause Menu: CanvasTexture plane in the scene + raycasted hover/clicks.
import * as THREE from 'three';

const FONT = '"Barlow Condensed", "Segoe UI", Arial, sans-serif';
const ITEMS = [
  { id: 'resume',   label: 'Resume',    key: 'Esc' },
  { id: 'restart',  label: 'Restart',   key: 'R'   },
  { id: 'settings', label: 'Settings',  key: 'G'   },
  { id: 'menu',     label: 'Main menu', key: 'M'   },
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

  function drawKeycap(keyText, rightX, midY, active) {
    ctx.font = `600 26px ${FONT}`;
    const textW = ctx.measureText(keyText).width;
    const pillW = Math.max(46, Math.ceil(textW + 28));
    const pillH = 42;
    const x = rightX - pillW;
    const y = midY - pillH / 2;

    ctx.strokeStyle = active ? 'rgba(212, 162, 89, 0.65)' : 'rgba(212, 162, 89, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, pillW, pillH, 6);
    else ctx.rect(x, y, pillW, pillH);
    ctx.stroke();

    ctx.fillStyle = active ? '#efe2c8' : 'rgba(239, 226, 200, 0.52)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(keyText, x + pillW / 2, midY + 1);
  }

  function redraw() {
    dirty = false;
    ctx.clearRect(0, 0, W, H);

    // Quiet studio header with a subtle brass rule
    ctx.fillStyle = '#d4a259';
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Paused', 4, 34);

    ctx.fillStyle = 'rgba(212, 162, 89, 0.28)';
    ctx.fillRect(0, 66, W, 1);

    // 4 stacked studio rows matching the Hallmark main menu palette
    const cardW = W, cardH = 152, startY = 88, gap = 16;
    ITEMS.forEach((item, i) => {
      const y = startY + i * (cardH + gap);
      const midY = y + cardH / 2;
      const active = i === selected;

      ctx.fillStyle = active ? 'rgba(16, 18, 28, 0.95)' : 'rgba(10, 11, 16, 0.90)';
      ctx.fillRect(0, y, cardW, cardH);

      ctx.strokeStyle = active ? 'rgba(139, 124, 255, 0.55)' : 'rgba(239, 226, 200, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, y + 0.5, cardW - 1, cardH - 1);

      if (active) {
        ctx.save();
        ctx.fillStyle = '#8b7cff';
        ctx.shadowColor = 'rgba(139, 124, 255, 0.65)';
        ctx.shadowBlur = 14;
        ctx.fillRect(0, y + 24, 6, cardH - 48);
        ctx.restore();
      }

      ctx.fillStyle = active ? '#efe2c8' : 'rgba(239, 226, 200, 0.68)';
      ctx.font = `700 56px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, 36, midY + 2);

      drawKeycap(item.key, cardW - 36, midY, active);
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
