# Tick Lock 3D — Project Handoff

> Written 2026-11-18 for the next AI agent (or developer) continuing this project.
> Read this file first, then `tick-lock-game-design.md` (game rules) and
> `docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md` (visual spec).

---

## 1. What this is

**Tick Lock** is a one-button timing game for the **CMM (multimedia program) booth at KMUTT Open House 2026**.
- A glowing needle sweeps around a lock dial. The player presses **Pick** while the needle is inside a zone.
- Every hit **reverses the needle**, so the player can't settle into a rhythm.
- The clock is the player's health. A run should last about 30 seconds so the booth queue keeps moving.

The project is a **3D web version** built with **Three.js**. The lock and studio models are made in **Blender**, driven by the Blender MCP through Python scripts.

**Theme: "Studio Lock" in a late-night studio.**
- A chunky padlock whose dial is a **vinyl record**, on a desk in a creative or multimedia studio at night.
- Props: a speaker, a camera on a tripod, a monitor, headphones, two softboxes, a desk lamp and an ON AIR sign.
- The mood follows a reference screenshot the user supplied (Dota 2's lock-picking minigame): low-key warm light, darkness, vignette, a violet beam needle with sparkles, and calm cream small-caps UI.
- **Only the mood and layout were borrowed. The art and setting are original.** Do not copy that game's dungeon, candles or art.

---

## 2. Current status (2026-11-18)

| Area | Status |
|---|---|
| Game design doc (rules, balance, levels) | ✅ Complete: `tick-lock-game-design.md` |
| Visual direction and spec | ✅ Complete: `docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md` (§2.1 is the current look) |
| Blender studio model | ✅ About 39k triangles, worn textures baked, exported to `assets/studio.glb` (about 1.7 MB) |
| Three.js visual prototype | ✅ Scene, lighting, dial, needle, HUD, effects, studio reactions and screens all work |
| Performance | ✅ About 11.8 ms GPU per frame at 1631×918 on Intel UHD (60 fps budget), plus adaptive fallback |
| **Real gameplay rules** | ❌ **Not done.** `src/demo.js` is a temporary stand-in loop. **This is the next big task** (see §10) |
| Audio | ❌ Not done (spec in design doc §9) |
| Leaderboard, music, extra zone types | ❌ Future ideas (design doc §12) |

---

## 3. How to run

```bash
# from the project root (TickLock/)
npx serve .            # any static server works; prints the URL/port
```
- Open the printed URL, for example `http://localhost:57443`. Port 5173 on this machine belongs to another of the user's projects, so `serve` may choose a random port.
- **It must be served over HTTP.** Browsers block `assets/studio.glb` when the page is opened from `file://`.
- Everything is local and offline: Three.js, the add-ons and the fonts are vendored, so no CDN is needed (the booth may have no Wi-Fi).
- `?fast` in the URL starts at a lower render scale, for weak GPUs.

**Demo controls** (temporary, defined in `src/demo.js` and `src/main.js`)

| Input | Action |
|---|---|
| Space / Enter / click on the canvas / PICK button / gamepad A | Start, pick, retry |
| Shift / hold BOOST button / gamepad RB or RT | Boost (needle ×1.8 speed, score ×2) |
| P / Esc / PAUSE button | Pause |
| 1 · 2 · 3 · 4 · 5 · 6 · 7 · 0 | Force hit · perfect · blue · miss · level up · toggle boost · game over · back to title |
| F | Show fps, frame time and pixel ratio overlay |

**Debug hook:** `window.__ticklock = { state, perf, stage, noAdapt }`.
- `state` is the demo state.
- `perf` holds `avgMs`, `pixelRatio` and `tier`.
- `stage` is the object returned by `createStage()`.
- Set `window.__ticklock.noAdapt = true` to freeze the adaptive quality while you benchmark.

---

## 4. File map

```
TickLock/
├── HANDOFF.md                     ← this file
├── tick-lock-game-design.md       ← GAME RULES (source of truth for gameplay/balance)
├── docs/superpowers/specs/
│   └── 2026-11-17-tick-lock-3d-visual-design.md   ← VISUAL SPEC (§2.1 = current late-night look, §5 = asset contract, §7 = perf)
├── index.html                     ← canvas container, HTML overlay (controls, floats, flash, pause), import map
├── src/
│   ├── main.js    ← entry: font preload, builds stage/dial/hud/fx/demo, event bus, input, loop, adaptive quality
│   ├── scene.js   ← renderer, camera, lights, fog, glb loading + part lookup, post-processing (bloom, glitch, final grade)
│   ├── dial.js    ← zone band (one shader), violet beam needle, sweep trail, ring flash
│   ├── hud.js     ← canvas textures: hub label (on the vinyl) + studio monitor
│   ├── fx.js      ← particles (sparkles/bursts/dust), floating text, shake, glitch, light/prop reactions, shackle anim, camera rig
│   ├── demo.js    ← TEMPORARY simplified game loop + debug keys (replace with real rules)
│   └── style.css  ← overlay UI styles (Barlow Condensed font-face, controls, floating text, flash)
├── assets/studio.glb              ← exported Blender scene (all studio parts, baked textures as JPEG)
├── art/tick-lock-studio.blend     ← Blender source (+ .blend1 backup). Contains text block `tl_helpers.py`
├── vendor/three/                  ← three.js r0.187.0 (build + examples/jsm: loaders, postprocessing, shaders, utils, environments)
├── vendor/fonts/                  ← Barlow Condensed 500/600/700 woff2 (OFL license included)
└── graft/                         ← code-graph index used by a tooling plugin (not part of the game)
```
No build step and no bundler. The code uses plain ES modules through the import map in `index.html` (`three` maps to `./vendor/three/build/three.module.js`, and `three/addons/` maps to `./vendor/three/examples/jsm/`).

---

## 5. Architecture and data flow

```
main.js
  ├─ await fonts → createStage(container)  (scene.js)  → stage {renderer, scene, camera, composer, bloom, glitch, grade, lights, parts, rig, render(), resize(), setPixelRatio(), maxPixelRatio}
  ├─ createDial(stage)            (dial.js) → dial {update(dt, view), ringFlash(hex, k), group, needle}   ; stage.dial = dial
  ├─ createHud(parts, maxAniso)   (hud.js)  → hud  {update(dt, state), react(evt, data)}
  ├─ createFx(stage, dom)         (fx.js)   → fx   {update(dt, state), react(evt, data), setParallax(nx, ny)}
  ├─ emit = (evt, data) => { fx.react(evt, data); hud.react(evt, data); }
  └─ createDemo(emit)             (demo.js) → demo {state, update(dt, input), pick(), debugKey(k), togglePause()}

per frame (requestAnimationFrame):
  pollPad() → demo.update(dt, input) → dial.update(dt, view) → hud.update(dt, state) → fx.update(dt, state) → stage.render()
  every ~1 s: perf.avgMs → adaptQuality()
```

### 5.1 The state object, which `hud` and `fx` read every frame
The game logic must provide this shape. The demo provides it now.
```js
{
  mode: 'title' | 'play' | 'over',
  paused: boolean,
  needleAngle: number,   // radians, 0 = 12 o'clock, + = clockwise (as seen by player)
  dir: 1 | -1,           // +1 clockwise
  boost: boolean,
  time: number,          // seconds remaining (clock = health)
  score: number, combo: number, level: number, hits: number, perfects: number,
  best: number,          // localStorage 'ticklock_best'
  runTime: number,       // seconds since start (monitor timecode)
  retryReady: boolean,   // game over input lock (0.6 s) elapsed
  zones: [ { angle, half, baseHalf, kind: 'gold'|'blue', pop: 0..1, alpha: 0..1, age, life } ]
}
```
`dial.update` receives `{ needleAngle, dir, boost, zones }`. Each zone uses `half` (current half-width in radians), `baseHalf` (half-width at spawn, drawn as the shrink outline), `pop` (scale for the pop-in) and `alpha` (for the blink).

### 5.2 Events (the `emit(evt, data)` contract)

| Event | Data | Who reacts |
|---|---|---|
| `start` | — | fx: shackle opens, lights normal. hud: clears cards |
| `title` | — | fx: shackle opens. hud: clears |
| `hit` | `{ angle, kind, perfect, points }` | fx: burst, ring flash, floating "+points", "PERFECT" plus screen flash, light swell, speaker pump. hud: waveform spike |
| `blue` | `{ angle }` (sent in addition to `hit`) | fx: "+2s" text. hud: "+2s TIME BONUS" card |
| `miss` | `{ angle }` | fx: red ring, "−1.5s", shake, RGB glitch, red grade tint, lamp buzz, ON AIR stutter. hud: monitor glitch |
| `levelup` | `{ level }` | fx: "LEVEL n +2s", ON AIR flare, light swell. hud: "LEVEL n" card |
| `gameover` | state copy | fx: shackle snaps shut, lights dim to red, vignette closes. hud: results card |

### 5.3 Coordinate and angle conventions (important)
- Three.js uses **Y-up**. Blender is Z-up, and the glTF exporter converts, so Blender `(x, y, z)` becomes Three.js `(x, z, −y)`.
- The **dial center is at the world origin.** The dial faces **+Z**, toward the camera.
- A point on the dial is `dialPoint(angle, r, z)` from `scene.js`, which returns `(r·sin θ, r·cos θ, z)`. Angle 0 is up, and angles increase clockwise.
- The needle pivot uses `rotation.z = −needleAngle`.
- The zone shader uses `atan(x, y)`, the same convention.

| Measure | Value |
|---|---|
| Vinyl face plane | z = 0.08 |
| Zone band drawn at | z = 0.084 |
| Needle beam at | z = 0.118 |
| Hub label front | z ≈ 0.095 |
| Zone band radius | 0.62 to 0.92 |
| Hub radius (label) | 0.40 |
| Hub ring | to 0.455; the needle base sits here (`DIAL.HUB_R`) |
| Needle tip | 1.0 |
| Lock body | 3.0 wide × 3.5 tall, bottom at y = −2.0 (desk top). The shackle is lifted +0.38 in Three.js while playing |

### 5.4 Camera
- `CAMERA_HOME (0, 0.15, 10)`, looking at `(0, 0, 0)`, 23° vertical FOV at 16:9. This is a gameplay-focused zoom: the dial fills about 55% of the screen height and the top of the shackle is cropped.
- On narrow screens the FOV widens so the whole lock body (half-width 1.85 with margin) stays visible.
- The title screen adds a slow dolly and mouse parallax (in `fx.js`, through `stage.rig.offset`). The camera never moves during play, apart from the miss shake.
- At runtime the monitor is moved and scaled to 0.8 (`Prop_Monitor` at `(2.95, −0.64, −1.2)`) so its cards stay on screen at this zoom.

---

## 6. Rendering pipeline (`scene.js`)

- **Renderer:** `antialias: false` (the composer renders to its own target anyway). `toneMapping = ACESFilmic` is set but only used as a flag; tone mapping actually happens in the final pass.
- **Pixel ratio:** `min(max(devicePixelRatio, 1), 1.25) × RENDER_SCALE`, where `RENDER_SCALE` is 0.85 (0.7 with `?fast`). The floor is 0.6.
- **Scene:** background and fog are `#0B0A12` (`FogExp2` density 0.07). The environment is a PMREM of `RoomEnvironment` at intensity 0.12, just so the metal reads.

**Lights** (5 in total; `fx.js` animates them from `userData.base`)

| Light | Settings |
|---|---|
| `hemi` | `HemisphereLight(0x3a3550, 0x140c08, 0.25)` |
| `key` | `SpotLight(0xffb36b, 85, 0, 0.32 rad, penumbra 0.7, decay 2)` at (0.8, 4.2, 6.5), aimed at the dial. This is the warm pool that makes the lock the focus |
| `rim` | `DirectionalLight(0x8b7cff, 1.1)` from behind |
| `lamp` | `PointLight(0xffa64d, 6, 6, 2)` at `Lamp_Bulb` (tungsten flicker in `fx`) |
| `sign` | `PointLight(0xff4a2a, 3, 5, 2)` at `Sign_OnAir` (slow hum) |

**Material tweaks at load time**
- Accent plastics (`/Accent_(Magenta|Cyan)/`) have their color multiplied by 0.45 so they sink into the dark.
- `Room_*`, `Prop_Desk*` and the softbox poles are converted to `MeshLambertMaterial` for performance.

**Post-processing:** `RenderPass` → `UnrealBloomPass(0.7, 0.6, 0.8)` → `ShaderPass(RGBShift)` → `ShaderPass(GradeShader)`.
- **The bloom runs at quarter resolution.** Its `setSize` is wrapped to receive w/2 and h/2.
- **The RGB-shift glitch pass is only enabled during a miss.**
- **`GradeShader` is the final pass**, replacing OutputPass and FXAA. It does exposure, ACES filmic (functions prefixed `tl…`, because Three.js already injects `RRTAndODTFit` into ShaderMaterials) and linear→sRGB, then the grade:
  - saturation 0.85
  - soft S-curve
  - split-tone: navy shadows, amber highlights
  - `uRed` tint for misses and game over
  - oval vignette, `uVignette` 0.55, rising to 0.8 on game over
  - animated film grain 0.035

  `fx.js` drives `grade.uniforms.uRed` and `uVignette`.
- **Context-loss safety:** on `webglcontextlost` the page reloads itself after 600 ms. The post-processing chain can't be rebuilt in place. The Intel GPU did reset several times during development, especially when a second WebGL page was open or right after a Blender Cycles bake.

---

## 7. The modules in detail

### `dial.js`
- `DIAL = { R_IN 0.62, R_OUT 0.92, FACE_Z 0.08, HUB_R 0.455, TIP_R 1.0, MAX_ZONES 6, PERFECT 0.3 }`.
- **Zone band:** a single `RingGeometry` with a `ShaderMaterial`. Uniform arrays `uZone[6]` (`vec4`: angle, half, baseHalf, kind) and `uZoneFx[6]` (`vec2`: pop, alpha). The shader draws:
  - gold or blue zones with a radial "bevel" brightness
  - the Perfect core (middle 30%, warm white)
  - darker rims at the zone ends
  - a soft ember halo just outside each zone
  - the shrink outline at the original size
  - the sweep trail behind the needle (violet, longer on boost)
  - a whole-band flash (`ringFlash(hex, k)`)
- Colors are `EMBER 0xffb347 ×1.0`, `blue 0x39d5ff ×1.0`, `WARM_WHITE 0xfff1d6 ×0.95`, and trail `VIOLET 0x8b7cff` (exported).
- **Needle:** an additive `ShaderMaterial` quad (`BEAM_W` 0.075) from the hub edge to just past the tip. It has a bright core line, a gaussian glow, a comet-bright tip and faded ends, plus a small dark metal collar. The color lerps to `PALETTE.blue` on boost, and intensity goes from 1.9 to 2.4.

### `hud.js`
- **Two canvas textures**, with `flipY = false` (glTF UV convention), sRGB, anisotropy at most 4, and a CPU-backed context (`willReadFrequently`). That last setting is important: GPU-backed 2D canvases stall when uploaded to WebGL.
- **Hub** (`Dial_Label`): drawn in 512 design units and stored at ×1.5 (768²). It is redrawn **only when its content changes**, tracked with a key string of mode, time, score and so on.
  - Background: a pre-rendered slate disc with stone grain and an inner shadow.
  - Title mode: "TICK LOCK", the best score and a blinking "PRESS SPACE / TAP".
  - Play mode: "TIME REMAINING" (letter-spaced), the big time (warm red and pulsing under 5 s), "SCORE", the score, then ×combo and LV.
  - Over mode: "LOCKED OUT", the score and "PRESS TO RETRY".
- **Monitor** (`Monitor_Screen`): 1024×576 at ×1, redrawn at **20 Hz**.
  - Shows a REC dot with a timecode and "TICK LOCK".
  - Title card; play mode has the waveform (56 bars, spiking on hits, faster on boost) with COMBO and LV.
  - Event cards ("+2s", "LEVEL n") and the results table on game over.
  - On a miss, a glitch (slice offsets, red tint, "−1.5s").
  - Its material color is 0.55 during play (a dim glow) and 0.95 otherwise, so the cards are readable.
- **Font:** Barlow Condensed (vendored). `main.js` awaits `document.fonts.load` before creating anything. `spaced()` uses the canvas `letterSpacing` property for the small caps.

### `fx.js`
- **Particles:** a custom `ShaderMaterial` points system with per-particle size, a twinkle (sin of time and seed), additive soft dots plus a little star cross. The pool is 400.
  - `burst(angle, color, count, speed)` handles hits (amber), Perfect (warm white) and blue zones.
  - **Sparkle trail:** 45 per second from the needle (14 per second on the title screen). Violet, lilac and white; cyan when boosting. They drift outward and behind the motion and live 0.6 to 1.1 s.
  - **Dust:** 45 warm motes drifting up through the key-light pool.
- **Floating text:** DOM elements projected from the dial (`.float`, `.float.big`). They animate with CSS and remove themselves.
- **Reactions:** see the events table in §5.2. Also:
  - tungsten flicker on the lamp and bulb
  - a slow hum on the ON AIR sign
  - softboxes "off", pulsing faintly on hits
  - the speaker cone pumps
  - the REC LED blinks at 1.6 Hz
  - the shackle drops with a bounce on game over and opens on start or title
  - camera shake and the RGB glitch on a miss
- **Studio parts are optional:** the code checks for null on `Lamp_Bulb`, `Sign_OnAir_Glow` and the softbox panels.

### `main.js`
- Event bus, input (keyboard, pointer, buttons, gamepad polling), the loop, the fps overlay, and **adaptive quality**.
- Adaptive quality is **one-way only**. After 3 s, two consecutive slow seconds (average over 25 ms) trigger a step: resolution −0.15, then −0.15 again, then **bloom off**. Each step happens once, at most 3 in total.
- **Never make it adjust both ways.** An earlier version raised and lowered the resolution every second, and each change reallocated the render targets, which caused **black flashes** the user saw.

### `demo.js` (temporary)
- A simplified loop: the needle moves with `dir·speed·(boost ? 1.8 : 1)`.
- Zones spawn at least 0.7 rad plus a half-width away from the needle, with no overlap. They pop in over 0.15 s, shrink when `life > 0`, blink in their last 0.8 s, and are replaced when they expire.
- A pick finds a zone where `|wrap(needle − zone.angle)| ≤ half`. Perfect means the distance is within `0.3·half`.
- A hit reverses `dir`, scores `100·(1 + 0.1·combo)·(perfect ? 2 : 1)·(boost ? 2 : 1)` and adds time.
- The clock drains at only 0.35× in the demo, and it levels up every 6 hits.
- `DEMO_LEVELS` only approximates the real table.

---

## 8. Blender asset pipeline

- **Source file:** `art/tick-lock-studio.blend`.
  - The `TickLock` collection holds everything that gets exported.
  - The `Preview` collection holds a `PreviewCam` and preview lights; it is not exported.
- **Helpers:** the text block **`tl_helpers.py`** inside the .blend. Load it with `exec(bpy.data.texts['tl_helpers.py'].as_string())`. It provides:
  - `lin(hex)`: sRGB hex to linear RGBA
  - `mat(name, hex, rough, metal, emit, strength)`
  - `box`, `cyl`, `lathe(name, [(r, y)...])` (a profile spun around the dial's Y axis), `curve_tube`, `set_origin`
  - `finish(ob, w, segs, angle)`: an angle-limited BEVEL (harden off), a WEIGHTED_NORMAL modifier (keep sharp), smooth shading, and sharp edges above 30°
  - `add_cyl(bm, ...)`: adds a cylinder into a bmesh
  - `biggest_face`, `recess(bm, face, lip, depth)`: an inset trim lip plus a chamfered recess
  - `set_mats(ob, names)`, which **preserves per-face material indices**. `me.materials.clear()` resets them to 0, a bug that was hit and fixed.
- **Required object names:** the game warns if any are missing.
  - `Lock_Body`, `Lock_Shackle`, `Lock_Badge`, `Dial_Vinyl`, `Dial_Label`
  - `Prop_Softbox_L/R`, `Softbox_L/R_Panel`
  - `Prop_Camera`, `Camera_REC`
  - `Prop_Monitor`, `Monitor_Screen`
  - `Prop_Headphones`, `Prop_Speaker`, `Speaker_Cone`, `Prop_Desk`
  - `Room_Wall`, `Room_Foam`
- **Optional object names:** `Prop_DeskLamp`, `Lamp_Bulb`, `Sign_OnAir`, `Sign_OnAir_Glow`.
- **Pivots that matter:**
  - The dial objects sit at the origin.
  - `Lock_Shackle`'s origin is at its left-leg hinge.
  - `Speaker_Cone`'s origin is at the cone center, because it is scaled to pump.
  - Root props keep their placement rotations; rotation was deliberately not applied, because that would shift their children.
- **UVs:**
  - `Dial_Label` has planar UVs: `u = 0.5 + x/0.8`, `v = 0.5 + z/0.8`.
  - `Monitor_Screen` has planar UVs over 0 to 1 at 16:9.
  - **Never smart-project these two.** The canvas textures depend on their UVs.
  - Everything else uses smart-project UVs (margin 0.02).
- **Baked worn textures** (Cycles EMIT bake of base × AO, plus noise grime, plus Bevel-node edge wear): `Lock_Body` (2K), `Dial_Bezel`, `Lock_Shackle`, `Prop_Desk`, `Prop_Speaker`, `Prop_Monitor` (1K).
  - Each baked object has per-object material copies named `<Material>__<Object>`, using the image `T_<Object>_BaseColor` (packed).
  - **If you remodel a baked object, re-bake it.** It needs UVs first: the `Dial_Bezel` bake once failed because rebuilding the bezel had dropped its UVs.
- **Material names** use the `M_` prefix, for example `M_Primary_Body` (burnt orange `#B8652E`), `M_Metal_Trim`, `M_Metal_Bezel`, `M_HubRing` (aged brass), `M_Accent_Dark`, `M_Emissive_*`, `M_Wood_Top` and `M_Vinyl`. The procedural noise and bump nodes only show inside Blender; glTF doesn't export them.
- **Export (exact call):**
  ```python
  # select all objects in collection 'TickLock', then:
  bpy.ops.export_scene.gltf(filepath=r"...\assets\studio.glb", export_format='GLB', use_selection=True,
      export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
      export_image_format='JPEG', export_jpeg_quality=85)
  ```
  The Draco and meshopt compressors are available but deliberately unused, so the game needs no decoder files.
- **Blender MCP note:** the add-on is behind (protocol 13 against an expected 16). `get_scene_info` output is truncated, so use `execute_blender_code` to inspect. The `look` tool works. The user has to run `uvx mcp-for-blender install-addon` themselves and restart Blender.

---

## 9. Visual direction and palette (current)

| Element | Color / value |
|---|---|
| Room, background, fog | `#0B0A12` near-black |
| Lock body | burnt orange `#B8652E`, worn (baked) |
| Hub ring | aged brass `#B08A4E` |
| Bezel and screws | worn iron `#2B2A2E` / `#3A3631` |
| Gold zones | ember `#FFB347` |
| Time (blue) zones | cyan `#39D5FF` |
| Perfect core | warm white `#FFF1D6` |
| Needle beam, trail, sparkles | **violet `#8B7CFF`**, cyan on boost |
| Miss / danger | warm red `#FF5A46` / `#FF6A4D` |
| UI text | cream `#EFE2C8` (55% for labels), font **Barlow Condensed** with letter-spaced small caps |
| Controls overlay | plain right-aligned labels: PICK / SPEED BOOST (HOLD) / PAUSE. No pills; key hints only on hover |

**Design rules agreed with the user**
- Studio reactions last **0.3 s or less** and **never cover the dial**.
- Keep the camera **focused on gameplay**: a big dial and a slim needle. The user asked for both.
- Zones, needle and timer must stay readable from the queue. The check is to shrink a 1080p screenshot to 480 px wide.

---

## 10. NEXT TASK: port the real game rules (replace `demo.js`)

Use `tick-lock-game-design.md` §2–7 as the source of truth. Create `src/game.js` with the **same state shape (§5.1) and the same events (§5.2)**, so `hud` and `fx` keep working. Then switch `main.js` from `createDemo` to it. The debug keys can stay behind a `?debug` flag.

**Constants** (put them in one block at the top, as the design doc requires):
```js
const LEVELS = [ // [hits in level, speed rad/s, width degrees, zones, lifetime s (0 = no shrink), blue chance]
  [4, 2.0, 30, 1, 0,   0.00],
  [4, 2.2, 28, 2, 0,   0.00],
  [5, 2.4, 26, 2, 0,   0.15],
  [5, 2.6, 25, 3, 5.0, 0.15],
  [6, 2.9, 24, 3, 4.2, 0.18],
  [6, 3.2, 23, 4, 3.6, 0.20],
  [8, 3.5, 22, 4, 3.2, 0.20],
  [8, 3.8, 22, 5, 2.8, 0.22],
];
const START_TIME = 12, HIT_TIME = 0.3, BLUE_TIME = 2, LEVEL_TIME = 2, MISS_TIME = 1.5;
const ENDLESS_SPEED = 0.1, MIN_WINDOW = 0.09;          // endless: +0.1 rad/s per level; widen zones so window ≥ 90 ms
const BOOST_SPEED = 1.8, BOOST_SCORE = 2, PERFECT_CORE = 0.3, SPAWN_GAP = 0.7, BLINK = 0.8, BLUE_LIFE = 0.7;
```

**Rules to implement**
- The clock drains 1 s per second; game over at 0.
- A hit adds `HIT_TIME`, plus `BLUE_TIME` for a blue zone. A level up adds `LEVEL_TIME`. A miss costs `MISS_TIME`.
- **At most one blue zone** on the ring at a time. Blue zones live 0.7× as long as gold.
- Zones shrink from level 4. The outline shows the original size, they blink in their last 0.8 s, and an expired zone **costs nothing** and is replaced at once.
- The zone count comes from the level. Spawn at least 0.7 rad from the needle, with no overlaps.
- Score: `100 × (1 + 0.1·combo) × (perfect ? 2 : 1) × (boost ? 2 : 1)`. The combo grows by 1 per hit and resets on a miss.
- Level up is based on hits in the level. Play doesn't pause, and the speed changes immediately.
- After level 8, the game goes endless: level 8 settings, 8 hits per level, +0.1 rad/s per level, and the zone width grows if needed so that `width / speed ≥ 0.09 s`.
- Best score is saved in `localStorage` (the key is `ticklock_best`, already used by the demo).
- The game-over screen ignores input for 0.6 s (`retryReady`).

**Also from the doc**
- **Audio** (§9), using the WebAudio oscillators listed there:
  - hit: 660 Hz square
  - perfect: 880 Hz
  - blue: 990 Hz triangle
  - miss: 140 Hz sawtooth
  - level up: 1320 Hz
  - game over: a low falling buzz

  Sound may only start after the first user input.
- Booth notes (§11): clear localStorage each morning for the "high score of the day".

**Verification after porting**
- Play through levels 1→8→endless.
- Check the time economy: an average run is about 30 s.
- Confirm every event still triggers its visuals (screenshot each).
- Check that there are no console errors and the frame rate is unchanged.

---

## 11. Performance notes and pitfalls (learned the hard way)

- **Dev machine:** Windows 11 laptop with an Intel UHD (0x9A60) integrated GPU, which Blender shares. Absolute fps there varies 3× with heat and power state. **Compare changes within the same run**, and use GPU timing:
  ```js
  // in page: force GPU finish per frame to get real cost
  const gl = stage.renderer.getContext(), px = new Uint8Array(4);
  const t0 = performance.now(); for (let i = 0; i < 30; i++) { stage.render(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); }
  console.log((performance.now() - t0) / 30, 'ms/frame');
  ```
  `gl.finish()` does **not** block on ANGLE/D3D11, so use `readPixels`.
- **Playwright's Chrome window throttles to 1 fps when it's covered or minimized** (frame gaps of exactly 1000 ms). The rAF-based fps numbers are meaningless then.
- **Don't open a second WebGL page** for baseline tests while the game is running. It caused GPU context loss on this machine.
- **Current cost:** about 11.8 ms per full frame and about 8.1 ms for the bare 3D scene, at a 1631×918 buffer.
- **Things that were tried and are slow:** 4× MSAA on the composer target (much too heavy), multiple full-screen passes (OutputPass, grade and FXAA as separate passes doubled the frame), the bloom chain at half resolution, 2× canvas textures uploaded at 30 Hz, and GPU-backed 2D canvases.
- **Keep:** one final combined pass, quarter-resolution bloom, CPU-backed canvases, redrawing the hub only when it changes, Lambert materials for the background, and one-way adaptive quality.
- **Tone mapping:** ACES washed out the zone colors in the earlier bright scene. The colors are now tuned for ACES in a dark scene. If zones turn white again, lower the zone multipliers in `dial.js`, not the exposure.

---

## 12. User preferences and decisions so far

- The user is a university student building this for the CMM KMUTT Open House booth. They pick options quickly and often choose the recommended one, and they give visual feedback through screenshots.
- **They are performance-sensitive.** They reported lag and black flashes. Always verify fps and avoid heavy effects.
- **They want it sharp.** Avoid visibly blurry output; the render scale floor is 0.6, and normal play runs at 0.85 or more.
- **They prefer a gameplay-focused, zoomed camera**, a **slim needle**, a **clean, perfectly round dial bezel** (the knurl is cut *into* the rim, not sticking out) and the **late-night moody look**.
- **Decision history:**
  1. Studio Lock theme, toy style.
  2. Remodel detail pass.
  3. Sharpness fixes.
  4. Black flash and lag fixes.
  5. Zoom and slim needle.
  6. Round bezel.
  7. Late-night mood (the reference-inspired look).
  8. Optimization.
- **Workflow they like:** plan first (they use plan mode), then implement, then verify with screenshots.
- **Not a git repo yet.** Don't commit unless asked; suggest `git init` if version control becomes useful.

---

## 13. Quick checklist for the next agent

1. Run `npx serve .`, open the URL, press F, and play with keys 1–7 to see every visual.
2. Read `tick-lock-game-design.md` (rules) and the visual spec §2.1, §5 and §7.
3. Implement `src/game.js` from §10 above, keeping the state shape and events.
4. Add audio (§10).
5. Verify with screenshots, readability at 480 px, fps, and no console errors.
6. Update `tick-lock-game-design.md` §12, the visual spec, and this file when done.
