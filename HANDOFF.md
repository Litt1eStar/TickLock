# Tick Lock 3D: Project Handoff

> Rewritten 2026-11-18 for the next AI agent (or developer) on this project. It replaces an older handoff that described
> a demo driver and a post-processing chain that no longer exist.
> **The code is the source of truth.** Where this file, `tick-lock-game-design.md` or the visual spec disagree with the
> code, trust the code (section 13 lists the known gaps).

---

## 1. What this is

**Tick Lock** is a one-button timing game for the **CMM (multimedia) booth at KMUTT Open House 2026**.

- A glowing needle sweeps around a lock dial. The player presses **Space** while the needle is inside a zone.
- Every hit **reverses the needle**, so there is no rhythm to settle into.
- The clock is the player's health. A run should last about 30 to 60 seconds so the booth queue keeps moving.
- Visitors walk up, play once and leave a name on today's leaderboard.

It is a **3D web game**: Three.js r187, plain ES modules, no build step, fully offline (three.js and fonts are vendored,
because the booth may have no Wi-Fi). The studio scene is modelled in **Blender** and exported to `assets/studio.glb`.

**Theme, "Studio Lock" at night:** a chunky burnt-orange padlock whose dial is a vinyl record, on a desk in a dark
multimedia studio (speaker, camera on a tripod, monitor, headphones, two softboxes, desk lamp, ON AIR sign). The mood
(warm pools of light, darkness, vignette, a violet beam needle with sparkles) follows a reference screenshot of another
game's lock-picking minigame. **Only the mood was borrowed; the art and setting are original. Do not copy that game.**

---

## 2. Status

| Area | Status |
|---|---|
| Gameplay rules | ✅ `src/game.js`: levels, endless mode, time economy, graze, recovery zone, flow state, L6+ drifting zones, fatal freeze-frame |
| 3D scene, dial, needle, effects | ✅ Done (`BEAM_W = 0.082`, slower mid-game speeds, 45% shrink floor, sentence-case HUD & callouts) |
| Main menu, boot screen, start cue | ✅ Redesigned 2026-11-18 (section 7) |
| Leaderboard (local, top 10, avatars, daily auto-reset, CSV export) | ✅ `src/main.js` and `localStorage` |
| Audio | ✅ `src/audio.js`, synthesised WebAudio events + procedural studio beat (`audio.update()`) |
| Pause menu | ✅ `src/pause3d.js`, a plane inside the 3D scene (restyled to match the menu) |
| Performance | ✅ Optimised 2026-11-18: about 83 to 164 fps on the dev laptop (section 11) |
| Old panels (game over, leaderboard, settings, pause) restyle | ✅ Restyled to Hallmark tokens and sentence case (`sloplint`: 0 FAIL) |
| Docs in sync with code | ✅ `tick-lock-game-design.md` and visual spec updated to match code |

---

## 3. Running it

```bash
# from the project root (TickLock/); any static server works
python -m http.server 8642 --bind 127.0.0.1     # or: npx serve .
```

- Open `http://127.0.0.1:8642/`. It **must be served over HTTP**; `file://` blocks the module scripts and the `.glb`.
- Port 5173 on this machine belongs to another of the user's projects; pick something else.
- `?fast` starts at a lower render scale (0.7) with a smaller buffer cap, for weak GPUs.

### Controls (keyboard is the booth's only input)

| Where | Keys |
|---|---|
| Menu | ↑/↓ or W/S choose, Enter or Space select, L leaderboard, G settings, F fps overlay |
| How to play panel | Space / Enter "Got it", Esc or ✕ also closes it (either way leads to the start cue) |
| Start cue | Space / Enter starts the run, Esc back to the menu |
| In a run | Space / Enter pick, hold Shift boost, P or Esc pause, H how to play, L leaderboard, G settings, F fps |
| Paused (3D menu) | ↑/↓ choose, Enter / Space select, R restart, M main menu, P resume, G settings |
| Game over | Space retries (after a 0.6 s lock), plus the panel's buttons |
| Debug, any screen but modals | `1` hit, `2` perfect, `3` blue, `4` miss, `5` level up, `6` toggle boost latch, `7` game over, `0` title |

Mouse, touch and gamepad (A = pick, RB/RT = boost) still work but are secondary.

**Debug hook:** `window.__ticklock = { state, perf, stage }`. `state` is the live game state, `perf.avgMs` the
one-second average frame time, `stage` the object from `createStage()`.

---

## 4. Repository and working rules

- **Git:** initialised 2026-11-18 on `master`.
  - `a573f1b` snapshot before the menu redesign
  - `68a5592` main menu redesign, boot screen, start cue, panel copy
  - Latest commit covers the 165 Hz performance pass, needle/balance tuning, Hallmark panel & 3D pause restyle, drifting zones, procedural beat, automatic daily leaderboard reset, sentence-case HUD unification, dead-code removal, and doc sync.
- **Commit only when the user asks.** End commit messages with the attribution line the harness gives you.
- `.gitignore` excludes `/graft/` (a code-index tool, not part of the game), `/.playwright-mcp/` (browser-test screenshots) and `*.blend1`.

---

## 5. File map

```
TickLock/
├── HANDOFF.md                     ← this file
├── tick-lock-game-design.md       ← game design doc (rules, constants, progression, booth notes)
├── docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md
│                                  ← visual spec (§2.1 late-night mood, §2.2 single-pass & UI, §5 asset contract)
├── index.html                     ← all DOM: boot screen, menu, start cue, panels, modals, controls; import map
├── src/
│   ├── main.js     ← entry: boot sequence, event bus, menu flow, leaderboard, settings, input, frame loop
│   ├── scene.js    ← renderer, camera, lights, fog, glb load + material conversion, grade, halos, visuals settings
│   ├── game.js     ← the game rules and state (createGame)
│   ├── dial.js     ← zone band shader, violet beam needle, sweep trail, ring flash
│   ├── hud.js      ← canvas textures on the record label (hub) and the studio monitor
│   ├── fx.js       ← particles, floating text, light/prop reactions, ON AIR sign, shackle, camera rig
│   ├── pause3d.js  ← pause menu drawn on a plane in the 3D scene, raycast clicks
│   ├── audio.js    ← WebAudio oscillator sounds per game event
│   ├── avatars.js  ← SVG avatars for the leaderboard
│   └── style.css   ← all 2D UI styles and `:root` tokens
├── assets/studio.glb              ← exported Blender scene (about 6.6 MB with baked JPEG textures)
├── art/tick-lock-studio.blend     ← Blender source
├── vendor/three/                  ← three.js r187 (build + examples/jsm)
├── vendor/fonts/                  ← Barlow Condensed 500/600/700 woff2 + OFL licence
└── .agents/skills/hallmark/       ← a design skill used for the UI redesign (tooling, not the game)
```

The import map in `index.html` maps `three` to `./vendor/three/build/three.module.js` and `three/addons/` to
`./vendor/three/examples/jsm/`.

---

## 6. Architecture

### 6.1 Boot sequence (`main.js`, top-level `await`)

1. The boot screen (`#boot`) is already visible from the HTML.
2. Fonts load (`document.fonts.load` for Barlow Condensed 500/600/700); canvas text needs them first. Progress 0 to 10%.
3. `createStage(container, onProgress)` loads `studio.glb`; the loader's byte progress drives 10 to 80%.
4. `createDial`, `createHud`, `createFx`, `createAudio` (80 to 90%).
5. `renderer.compileAsync(scene, camera)` compiles every shader behind the boot screen, so the first frame neither hitches nor flashes black (90 to 100%).
6. The first real frame renders, then `boot.finish()` fades `#boot` out (0.6 s; a timeout covers reduced motion) and sets `booted = true`. Keys are ignored until then.
7. If the `.glb` fails to load, the boot screen shows "The studio could not load. Refresh the page to try again."

### 6.2 Frame loop

```
pollPad → game.update(dt, input) → dial.update → hud.update → fx.update → pause3d.update(fx.updatePauseCam) → stage.render
then: body data attributes (written only on change), menu visibility, in-run tip banner, fps once a second
```

`dt` is capped at 50 ms. The loop runs at the display's refresh rate (165 Hz on the dev laptop).

### 6.3 Events (`emit(evt, data)` goes to fx, hud, audio, then `onGameEvent` in main.js)

| Event | Data | Notes |
|---|---|---|
| `start` | none | new run; main sets `phase = 'run'`; fx lights the ON AIR sign with a neon flicker |
| `title` | none | back to menu; main sets `phase = 'menu'` |
| `hit` | `{ angle, kind, perfect, points, combo, flow }` | kind is `gold`, `blue` or `recovery` |
| `blue` | `{ angle }` | extra, after `hit` |
| `recovery` | `{ angle, combo }` | extra, after `hit` on a recovery zone |
| `flow` | `{ angle, combo }` | entering flow state (combo 10) |
| `graze` | `{ angle, deg, timing }` | near miss within 6°; timing is `EARLY` or `LATE` |
| `miss` | `{ angle, deg, timing }` | full miss; spawns a recovery zone |
| `fatal` | `{ angle, text }` | clock hit zero; 0.45 s freeze-frame follows |
| `levelup` | `{ level }` | |
| `gameover` | copy of the state | game-over panel and leaderboard entry |

### 6.4 Game state (`game.js`, read every frame by dial, hud, fx)

`mode` (`title` / `play` / `over`), `paused`, `needleAngle` (radians, 0 = 12 o'clock, clockwise positive), `dir`,
`boost`, `time` (seconds left), `score`, `combo`, `maxCombo`, `level`, `hits`, `levelHits`, `levelGoal`, `perfects`,
`runTime`, `best`, `flow`, `clockStarted` (the clock waits for the first hit), `freezeT`, `fatalText`,
`ghost { angle, alpha }` (marker of the last miss), `zones[]`
(`{ angle, half, baseHalf, kind, age, life, pop, alpha, drift }`), `retryReady`.

### 6.5 Rules, as coded in `game.js`

- `LEVELS` rows are `[hits, speed rad/s, width °, zone count, lifetime s, blue chance]`, 8 levels, then endless (+0.1 rad/s per level, zones widened so the window stays at least 100 ms).
- `START_TIME 30`, `HIT_TIME 0.45`, `BLUE_TIME 2`, `LEVEL_TIME 2`, `MISS_TIME 1.2`, boost ×1.8 speed and ×2 score, perfect = middle 30% of a zone (×2).
- Score per hit: `100 × (1 + 0.1·combo) × (perfect ? 2 : 1) × (boost ? 2 : 1) × (flow ? 1.25 : 1)`.
- Graze (within 6° of a zone edge): −0.4 s, combo halved. Miss: −1.2 s, combo saved for a recovery zone (2.8 s life) that restores half the combo and refunds the 1.2 s.
- Before the first hit the clock is paused and misses are free practice.
- At most one blue zone at a time; blue zones live 0.7× as long. Zones shrink from level 4 (down to 45% width; 60% for recovery) and blink in their last 0.8 s. From level 6, regular zones may drift smoothly around the ring and bounce off neighbors.
- The in-run tutorial banner (`#tutorial-banner`) prompts the first hits.

### 6.6 Coordinates

- Three.js is Y-up; the glTF export converts Blender `(x, y, z)` to `(x, z, −y)`.
- The dial centre is the world origin and faces +Z (the camera). `dialPoint(angle, r, z)` in `scene.js` returns `(r·sin θ, r·cos θ, z)`. The needle pivot uses `rotation.z = −needleAngle`; the zone shader uses `atan(x, y)`, the same convention.
- `DIAL = { R_IN 0.62, R_OUT 0.92, FACE_Z 0.08, HUB_R 0.455, TIP_R 1.0, MAX_ZONES 6, PERFECT 0.3 }`.
- Camera home `(0, 0.15, 10)` looking at the origin, 23° vertical FOV at 16:9. The FOV widens on narrow screens so the lock body stays in frame. The menu adds a slow dolly and mouse parallax; the pause menu pans the camera right. The monitor is moved to `(2.95, −0.64, −1.2)` and scaled 0.8 at load.

---

## 7. Main menu and screen flow (redesigned 2026-11-18)

The user asked for a menu that feels "polished, not AI slop". Agreed direction: **put as much as possible in the 3D
room, and keep the 2D layer minimal**.

**`phase` in `main.js`** (separate from `game.state.mode`):

```
menu ──Play──▶ brief (How to play panel) ──close, any way──▶ ready ("Press Space to start") ──Space──▶ run
  ▲                                                             │Esc
  └────────────── title event (Main menu, M in pause, 0) ◀──────┘
```

- **Every time a player chooses Play**, the How to play panel opens. Closing it shows the start cue. Space starts the run and the cue is "wiped away": a violet needle sweeps across the line and each letter flicks up and out (CSS keyframes `cue-out` / `key-out`; the letters are split into spans at init).
- **Play again** from game over and **Restart** from pause skip the panel (same player).
- `primaryPress()` routes the canvas click and gamepad A through the same flow.

**What is on the menu screen**

- 2D overlay (`#title-ui`): "Muasoom Studio" over the TICK LOCK wordmark (top left); three choices **Play** (large), **Leaderboard**, **Settings**, with a violet bar on the selected one; a key legend (bottom left); "Developed by Litt1eStar" (bottom right); a soft left-side shade so text reads over the props. No boxes, numbers, `//` separators or tracked capitals.
- In the 3D room: the record label shows only "Best score" and the number; the **monitor shows today's top five**; the **ON AIR sign is dim on the menu and lights up when a run starts**.
- **The user's must-keep list:** "Muasoom Studio", "Litt1eStar", Play, Leaderboard, Settings, and the leaderboard shown somewhere other than beside the three buttons (it lives on the monitor).

**Other panels** (restyled to the same dark studio slate, hairline brass rules, `:root` tokens, and plain sentence case): game over (`#gameover-panel`, name and avatar entry), leaderboard modal (studio podium, top 10, "your run" bar, "Clear today's scores" needing a second press, Export CSV), settings panel (quality preset, render scale, brightness, contrast, saturation, glow, vignette, particles), How to play modal.

**Keyboard focus:** opening a panel moves focus to its main button (`tut-play`, `lb-close-btn`, `sp-preset`). Every control has an instant `:focus-visible` brass outline. While focus is inside the settings panel, its controls keep their native keys.

---

## 8. Rendering (`scene.js`)

- **No post-processing composer.** Glow comes from additive sprites ("halos") on the lamp and ON AIR sign and from additive shaders on the dial and needle. `stage.grade` holds `uRed` and `uVignette` driven by `fx.js` to fade the CSS atmospheric layers.
- **Renderer:** `antialias: false`, `powerPreference: 'high-performance'`. Pixel ratio = `min(max(dpr, 1), 1.15) × visuals.scale` (0.9 by default, 0.7 with `?fast`), floor 0.55, and the buffer width is capped (1536 px balanced, 1152 performance preset, 2048 ultra) to protect integrated GPUs.
- **Tone mapping:** `THREE.CustomToneMapping`. `scene.js` replaces three's empty `CustomToneMapping` slot in `ShaderChunk.tonemapping_pars_fragment` with ACES followed by a **contrast and saturation grade** read from one shared uniform `uGrade = (contrast − 1, saturation − 1)`. `Material.prototype.onBeforeCompile` attaches that uniform to every material. The settings sliders update it live with no recompiling. This replaced a CSS `filter` on the canvas. Custom `ShaderMaterial`s (dial, needle, particles, beam) do not run three's tone mapping and so are not graded, which is intended.
- **Exposure** = `0.96 × brightness` (settings). Scene background and fog: `#090B16`, `FogExp2` 0.075.
- **Lights** (base values in `userData.base`, animated by `fx.js`): hemisphere `0x4c5c92 / 0x261810, 0.65`; key `SpotLight 0xffbe7a, 130, angle 0.44, penumbra 0.85` at `(0.2, 3.8, 6.4)`; rim `DirectionalLight 0xffa656, 2.5`; lamp `PointLight 0xff9e44, 13, 8.5, 1.7` at the bulb; ON AIR `PointLight 0xff4a2a, 5, 6.5, 1.8`.
- **Materials at load:** glTF gives every object a `MeshStandardMaterial`. Without an environment map that only ever shows diffuse plus a highlight, so `cheapMaterial()` converts:
  - non-metals → `MeshLambertMaterial` (colour, map, emissive kept)
  - metals (metalness ≥ 0.5) → `MeshPhongMaterial` with diffuse × (1 − metalness), specular = F0 × `METAL_SPEC` (0.2) and shininess from roughness
  - `Lock_Shackle` and `Dial_Vinyl` keep their hand-tuned `MeshPhongMaterial` with a procedural micro-normal map (the `HERO_LOCK` regex only matches those exact names)
  - `Dial_Label` and `Monitor_Screen` are left for `hud.js`, which gives them unlit canvas materials
  - accent plastics (`/Accent_(Magenta|Cyan)/`) are darkened ×0.45
- **Vignette and miss tint** are two full-screen CSS layers (`#stage::before`, `#stage::after`) with fixed gradients; `scene.render()` only changes their `opacity` through `--vig` and `--red-tint`, so they never repaint. The canvas sits at `z-index: -1` inside `#stage` so those layers draw above it.
- **Context loss:** on `webglcontextlost` the page reloads after 600 ms.

---

## 9. Modules

### `dial.js`
One `RingGeometry` with a `ShaderMaterial` draws the whole band: up to 6 zones (`uZone` vec4: angle, half, baseHalf, kind; `uZoneFx` vec2: pop, alpha), the perfect core, halos, shrink outlines, ghost marker, sweep trail, ring flash, flow aura, rim ticks. Colours: ember `0xffae2b`, recovery `0x42ffa1`, perfect `0xffe7a8`, needle `VIOLET 0x7b8cff` (exported). The needle is a razor-slim additive shader quad (`BEAM_W = 0.082`, `taper = mix(0.22, 0.10, along)`).

### `hud.js`
Two canvas textures with `flipY = false` (glTF UVs), sRGB, CPU-backed contexts (`willReadFrequently`; GPU-backed 2D canvases stall when uploaded). All text uses untracked sentence case matching the 2D UI.
- **Hub** (`Dial_Label`): 512 design units at ×1.25 (640 px). Redrawn only when a key string of what it shows changes. Menu: "Best score" and the number. Play: "Time remaining" (pulses red under 5 s), "Score", combo (`Flow ×n` / `×n`), `Lv n`, lock-pin progress dots. Over: "Locked out", fatal detail, score, "Space to retry".
- **Monitor** (`Monitor_Screen`): 1024×576 design units at ×0.75. **Animates at 15 Hz only during a run** (`Rec` timecode, waveform, event cards, miss glitch). On the menu (today's top five, fed by `hud.setBoard(board)`) and the results screen it redraws only when its content changes.

### `fx.js`
Particle pool (320) with one additive point shader: hit bursts, needle sparkles (20/s in play, 14/s on menu), 40 dust motes. Sentence-case floating DOM text projected from the dial. Reactions: light swells, perfect flash, shake, red tint, lamp flicker and buzz, softbox pulse, speaker pump, REC LED, shackle drop and bounce, camera dolly and parallax. **ON AIR sign:** `st.onAir` eases to 0.12 on the menu and 1 in play; on `start` it does a 0.55 s neon-ignition flicker (skipped with reduced motion).

### `main.js`
Boot, event bus, menu phase machine, modals, leaderboard and run log, settings, input, frame loop.
- **localStorage keys:** `ticklock_leaderboard` (top 10), `ticklock_lb_date` (`YYYY-MM-DD`, resets the daily board, `ticklock_run_seq`, and `ticklock_best` automatically on a new calendar day while keeping `ticklock_history`), `ticklock_history` (every saved run across days, for CSV), `ticklock_run_seq` (auto names "PLAYER #n"), `ticklock_best`, `ticklock_settings`.
- **`SEED_BOARD`** fills the board with **sample names and scores** (LITT1ESTAR 14,800 and so on) only when `ticklock_leaderboard` has never been initialised. Press "Clear today's scores" in the leaderboard before the booth opens, or the sample scores will show as real.
- A run that ends without pressing Save is auto-saved as "PLAYER #n" when the next run starts or the menu opens.
- `adaptQuality()` performs a single one-way fallback (`stage.visuals.particles = false`) if average frame time exceeds 28 ms for 2 s, without ever reallocating render buffers mid-game.

### `pause3d.js`
A 1024×768 canvas on a plane at `(2.95, 0.04, 0.45)`; the camera pans to it. Items Resume / Restart / Settings / Main menu styled to match the Hallmark main menu (sentence-case labels, needle-violet active bar, brass keycaps, hairline borders).

### `audio.js`
Oscillator tones per event (start, hit, blue, recovery, flow, graze, miss, levelup, fatal, gameover) plus `audio.update(dt, s)`, a procedural clockwork tick + sub-bass pulse scaling with level and Boost (with a harmonic shimmer during Flow State) while the timer runs. The context unlocks on the first key or click.

---

## 10. UI and CSS system (`style.css`)

- **Font:** Barlow Condensed only (500/600/700, `font-display: block`).
- **Tokens** in `:root`: all colours across the menu, panels, modals, leaderboard podium, and tutorial diagrams are declared as CSS custom properties (`--navy`, `--surface*`, `--cream*`, `--brass*`, `--violet*`, `--red*`, `--core-white`, `--rec-green*`, `--rule`, `--shade*`, `--scrim`, `--gutter`, `--ease-out`, `--vignette-ink`, `--miss-red`).
- **Hallmark stamp:** the first lines of `style.css` are a comment stamp, a critique line and a single `.cue-needle`/`.boot-needle` glow waiver from the Hallmark design skill. Keep them at the top.
- **Rules followed across the UI:** sentence-case labels without letter-spacing (capitals only for the wordmark), 4 px spacing rhythm, animations use only `transform` and `opacity`, every animation has a `prefers-reduced-motion` fallback, instant `:focus-visible` outlines, `:disabled` styling, no emoji icons (close buttons are inline SVG).
- **Linter:** `node .agents/skills/hallmark/scripts/sloplint.mjs index.html src/style.css --genre atmospheric --scope app` passes with `0 FAIL` (only the intentionally waived `.cue-needle::before` `WARN 29`).

---

## 11. Performance (optimised 2026-11-18)

**Dev machine:** Windows 11 laptop, Intel UHD (`0x9A60`) integrated GPU, **165 Hz display** (a 6.06 ms frame budget). The GPU throttles hard with heat and power: the same build measured anywhere from 6 ms to 55 ms per frame within one session. **Never compare runs taken minutes apart; serve the old and new builds side by side and alternate.**

**Results** (old build vs new, alternated in one session):

| | Before | After |
|---|---|---|
| Menu fps | 55 | 83 to 164 |
| Frames at full 165 Hz | 10% | 39 to 71% |
| During play | about 55 | 164 |
| GPU time per frame | 7.2 to 7.5 ms | 3.5 to 4.4 ms |
| JavaScript per frame | | about 1 ms |

**What made the difference**

1. The material conversion bug: an `!m.emissiveIntensity` check never fired (glTF sets it to 1), so the whole room ran `MeshStandardMaterial`. Fixed with `cheapMaterial()` (§8). This was the largest win.
2. The CSS `filter` on the canvas moved into the shaders (§8).
3. Vignette and miss tint made opacity-only, so misses no longer repaint the whole screen and a 120 px blur.
4. Hub canvas from 1024² to 640²; no idle redraws.
5. Monitor redraws only when needed outside a run.
6. Body `data-*` attributes written only on change.

**How to measure GPU time** (works on this ANGLE/D3D11 setup; `gl.finish()` does not block there):

```js
const { stage } = window.__ticklock, gl = stage.renderer.getContext();
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
// wrap stage.render: begin a TIME_ELAPSED_EXT query before, end after, read the result a frame or two later
```

**Pitfalls**

- Playwright's Chrome window throttles to 1 fps when covered or minimised.
- Do not run a second WebGL page against the game at once; it caused GPU context loss on this machine.
- Never make quality adjust both ways at runtime. Re-allocating the render buffer every second once caused black flashes the user saw.
- What is left costs little on its own (particles, light beam, dial shader, lights all measured within noise). The only big lever left is resolution, which the user does not want softer.

---

## 12. Blender asset pipeline

- **Source:** `art/tick-lock-studio.blend`. Collection `TickLock` is exported; `Preview` (camera, lights) is not.
- **Helpers:** text block `tl_helpers.py` inside the .blend, loaded with `exec(bpy.data.texts['tl_helpers.py'].as_string())`. It provides `lin`, `mat`, `box`, `cyl`, `lathe`, `curve_tube`, `set_origin`, `finish`, `add_cyl`, `biggest_face`, `recess`, and `set_mats` (which preserves per-face material indices; `me.materials.clear()` resets them).
- **Required object names** (the game warns if missing): `Lock_Body`, `Lock_Shackle`, `Lock_Badge`, `Dial_Vinyl`, `Dial_Label`, `Prop_Softbox_L/R`, `Softbox_L/R_Panel`, `Prop_Camera`, `Camera_REC`, `Prop_Monitor`, `Monitor_Screen`, `Prop_Headphones`, `Prop_Speaker`, `Speaker_Cone`, `Prop_Desk`, `Room_Wall`, `Room_Foam`. **Optional:** `Prop_DeskLamp`, `Lamp_Bulb`, `Sign_OnAir`, `Sign_OnAir_Glow`.
- **Pivots:** dial objects at the origin; `Lock_Shackle` origin at its left-leg hinge; `Speaker_Cone` at the cone centre (it is scaled to pump).
- **UVs:** `Dial_Label` and `Monitor_Screen` have planar UVs that the canvas textures depend on. **Never smart-project them.**
- **Baked worn textures** on `Lock_Body` (2K), `Dial_Bezel`, `Lock_Shackle`, `Prop_Desk`, `Prop_Speaker`, `Prop_Monitor` (1K), with per-object material copies `<Material>__<Object>`. Re-bake after remodelling, and make sure UVs exist first.
- **Metalness and roughness from Blender now matter:** `cheapMaterial()` uses them to choose Lambert or Phong (§8).
- **Export:**
  ```python
  bpy.ops.export_scene.gltf(filepath=r"...\assets\studio.glb", export_format='GLB', use_selection=True,
      export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
      export_image_format='JPEG', export_jpeg_quality=85)
  ```
  No Draco or meshopt, so no decoder files are needed.
- **Blender MCP:** `get_scene_info` output can be truncated; use `execute_blender_code` to inspect, and `look` to see results.

---

## 13. Known gaps and loose ends

1. **Sample leaderboard** (`SEED_BOARD`) shows made-up names and scores until `Clear today's scores` is pressed before the booth opens (§9). After clearing once, empty `[]` stays empty across refreshes and rolls over cleanly each calendar day (`ticklock_lb_date`).
2. **Booth playtesting** remains: run live visitors through levels 1–8+ at the booth and export `ticklock_history` CSV to validate target run durations (~30–60 s).

---

## 14. The user

- A university student building this for the CMM KMUTT Open House booth. They give feedback with screenshots, decide quickly and usually take the recommended option.
- **Performance-sensitive:** they have reported lag and black flashes. Verify fps after visual changes and avoid heavy effects.
- **Wants it sharp,** not blurry: do not lower the resolution to buy speed.
- **Likes:** the gameplay-focused zoomed camera, a slim needle, a clean round bezel, the late-night mood, a polished, non-generic UI.
- **Workflow they like:** discuss and plan first, then build, then verify with screenshots in a real browser. Ask before big or irreversible changes; commit only when asked.

---

## 15. Checklist for the next agent

1. `git status` and `git log`: see what is committed, and ask about the uncommitted edits (§4).
2. Serve the project (§3), press F, play through the menu flow and a run, use debug keys 1 to 7 to see every effect.
3. Read §13 and confirm next steps (booth playtest / balance / commit when requested).
4. After any change: check in a real browser with screenshots, check fps on the dev laptop by comparing builds side by side (§11), and confirm the console is clean.
5. Update this file when you finish.
