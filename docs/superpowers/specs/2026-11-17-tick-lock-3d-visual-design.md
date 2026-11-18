# Tick Lock 3D: Visual Design Spec

*Companion to [tick-lock-game-design.md](../../../tick-lock-game-design.md). The game rules, balance and controls stay as in that doc. This spec covers only how the 3D version looks and how its assets are built.*

---

## 1. Direction

| Topic | Decision |
|---|---|
| Theme | **Studio Lock**: a padlock whose dial is a vinyl record, sitting in a creative multimedia studio (CMM KMUTT Open House) |
| Art style | **Late-night studio, aged** (updated 2026-11-18): chunky rounded shapes kept, but low-key lighting and worn, baked materials. The mood follows the user's reference (warm pools of light, darkness, vignette, sparkles); the art is our own |
| Palette | Near-black room `#0B0A12` · burnt-orange worn lock `#B8652E` · aged-brass hub ring · ember zones `#FFB347` · cyan time zones · warm-white Perfect core `#FFF1D6` · **violet needle beam `#8B7CFF`** · warm red for misses |
| Display | Landscape 16:9 booth screen first; phones get a tighter crop |
| Scene life | **Reactive studio**: props react briefly to game events at the screen edges |
| Tech | Three.js. Lock and props are modeled in Blender and exported to one `assets/studio.glb`. Zones, needle, HUD text and effects are built in Three.js |

The reference screenshot (a lock-picking minigame from another game) is used **for layout only**: a dial inside a lock body, numbers in the hub, control labels at the bottom right. None of its art, setting or style is copied.

---

## 2. Scene

**Camera:** Fixed and gameplay-focused, centered on the dial. Position (0, 0.15, 10), looking at (0, 0, 0), 23° vertical FOV at 16:9, so the dial fills about 55% of the screen height and the top of the shackle is cropped. The monitor is moved in and scaled to 80% at runtime so its cards stay on screen. On narrower screens the FOV widens so the whole lock body stays in frame. On the title screen only, the camera slowly dollies and drifts with the mouse. It does not move during play.

**Hero: the padlock**
- A rounded cream-orange body, a dark metal shackle and an embossed "CMM" badge.
- A vinyl record is set into the face. Its groove band is the zone ring.
- The center label is the hub screen.
- The needle is a glowing magenta stylus arm pivoting from the edge of the hub.

**Studio, left to right**
- Softbox L, a studio speaker, a camera on a small tripod aimed at the lock (with a REC LED), the lock, the monitor (angled toward the center), headphones at the front, softbox R.
- Everything stands on a warm wooden desk. The back wall is navy, with three clusters of acoustic foam.

**Lighting and rendering**
- Neutral tone mapping, which keeps the gold, cyan and magenta saturated (ACES pushed them toward white).
- A hemisphere light, a warm key, a cool fill, a magenta rim, and a point light inside each softbox. A soft room environment gives the metal something to reflect.
- Bloom: strength 0.5, radius 0.3, threshold 0.9. Zones, needle, softbox panels and the REC LED glow; lit surfaces don't.

**Built in Three.js**
- Zones are raised glowing arc strips on the groove band.
- A faint outline shows a shrinking zone's original size.
- Zones pop in, and blink in their last 0.8 s.
- The needle has a motion trail and turns cyan while Boost is held.
- Hits throw particle bursts, and a ring flash shows the zone color.
- Bloom applies only to emissive parts: zones, needle, softbox panels, REC LED and screens.

---

### 2.1 Late-night mood pass (2026-11-18)

This supersedes the lighting, materials, needle and UI details above wherever they conflict.

| Area | Now |
|---|---|
| Lights | Hemisphere 0.25 · warm key `SpotLight` (#FFB36B, 85, cone 0.32, penumbra 0.7) pooling on the lock · violet rim · desk-lamp `PointLight` on `Lamp_Bulb` (tungsten flicker) · ON AIR `PointLight` on `Sign_OnAir` (slow hum). The softboxes are "off" and only pulse faintly on hits |
| New props | `Prop_DeskLamp` (with `Lamp_Bulb`) and `Sign_OnAir` (with `Sign_OnAir_Glow`). Both are optional: the game warns if one is missing but doesn't fail |
| Materials | Base Color baked in Cycles (AO contact shadows, edge wear, noise grime) for Lock_Body (2K), Dial_Bezel, Lock_Shackle, Prop_Desk, Prop_Speaker and Prop_Monitor (1K), exported as JPEG. `studio.glb` is about 1.7 MB and 39k triangles |
| Rendering | ACES tone mapping (exposure 0.95), `FogExp2` (#0B0A12, 0.07), bloom 0.7 / 0.6 / 0.8, then one **grade pass** after OutputPass: oval vignette 0.55, saturation 0.85, soft S-curve, navy shadows / amber highlights, film grain 0.035. `uRed` and `uVignette` are driven by misses and game over |
| Needle | An additive light-beam quad (violet core plus soft glow, comet-bright tip; cyan on boost) and a small dark collar. A sparkle trail of about 60 per second leaves the tip; about 70 warm dust motes drift in the key light |
| Zones | Ember amber, warm-white core, cyan time zones, plus a soft glow just past each zone's ends |
| HUD | Vendored **Barlow Condensed** (OFL, `vendor/fonts/`). The hub is a slate disc with letter-spaced "TIME REMAINING / SCORE" small caps in warm cream. The monitor sits at 55% brightness during play and brightens for title and results |
| Controls | Plain right-aligned letter-spaced labels (PICK / SPEED BOOST (HOLD) / PAUSE); key hints appear on hover |
| Robustness | When the WebGL context is lost, the page reloads itself |

### 2.2 Single-Pass Performance & Hallmark UI Pass (2026-11-18)

This captures the subsequent hardware optimization and Hallmark UI redesign in code:

- **Single-pass rendering (`src/scene.js`):** `EffectComposer` / `UnrealBloomPass` was removed in favor of direct single-pass `WebGLRenderer` rendering (~83–164 fps on Intel UHD at 165 Hz). Glow comes from additive `Sprite` halos on the desk lamp and ON AIR sign plus additive shaders on the dial and needle (`dial.js`, `fx.js`).
- **Shader-integrated grade & material conversion:** Contrast and saturation grading runs via `THREE.CustomToneMapping` using the shared `uGrade` uniform injected into materials, while `cheapMaterial()` converts static glTF PBR materials to `MeshLambertMaterial` (dielectrics) or `MeshPhongMaterial` (metals), keeping hand-tuned `MeshPhongMaterial` + micro-normal maps on hero lock parts (`Lock_Body`, `Lock_Shackle`, `Lock_Badge`, `Dial_Bezel`, `Dial_Vinyl`).
- **Opacity-only CSS atmospheric layers:** Vignette (`--vig`) and miss-red tint (`--red-tint`) render via fixed `#stage::before` / `#stage::after` CSS radial-gradient layers so misses never repaint the canvas or screen.
- **Slimmer needle (`src/dial.js`):** Narrowed to `BEAM_W = 0.082` with `mix(0.22, 0.10, along)` taper and a contact hotspot where the beam crosses the groove band.
- **Hallmark UI & 3D Diegetic Surfaces (`index.html`, `src/style.css`, `src/hud.js`, `src/pause3d.js`):**
  - Boot progress overlay (`#boot`) with real progress for fonts, `studio.glb`, and `renderer.compileAsync`.
  - Clean left-aligned typographic Main Menu (`Play`, `Leaderboard`, `Settings`) with a needle-violet active bar, **How to play** briefing modal, and letter-wiped `"Press Space to start"` cue (`#ready-cue`), plus ON AIR neon-ignition flicker on run start.
  - Top-5 daily leaderboard lives on the 3D studio monitor (`hud.setBoard(board)`); full Top-10 podium, avatar picker (`src/avatars.js`), Game Over debrief (`#gameover-panel`), and Settings (`#settings-panel`) follow the CSS token system (`:root`), sentence-case typography, hairline brass rules, and 3D world-space Pause Menu (`src/pause3d.js`).

## 3. HUD and screens

**Hub label** (a canvas texture on `Dial_Label`): time remaining (big; red and pulsing under 5 s), score, combo ×n and LV n.

**HTML overlay** (bottom right): PICK · BOOST (hold) · PAUSE. These double as touch buttons on phones.

**Screens**
- **Title:** a slow camera push-in. The monitor shows "TICK LOCK"; the hub shows the best score and a blinking "PRESS SPACE / TAP"; the needle idles around the dial.
- **Play:** as above.
- **Game over ("LOCKED OUT"):** the shackle snaps shut, the studio lights dim to red, and the monitor shows the results card (score, level, hits, Perfects, best). "PRESS TO RETRY" blinks, and input is ignored for 0.6 s.

---

## 4. Reactions

All studio reactions last 0.3 s or less and never cover the dial.

| Event | Lock | Studio |
|---|---|---|
| Hit | Burst at the needle tip, zone pop, floating points | Softboxes flash the zone color, the speaker cone pumps, the monitor waveform spikes |
| Perfect | Big white burst, "PERFECT" | Both softboxes flash white, a camera-flash pop |
| Blue zone | Cyan flash, "+2s" | The monitor shows "+2s" |
| Miss | Red ring flash, "−1.5s" | Small screen shake, a short RGB-split glitch, the REC LED goes red |
| Level up | "LEVEL n +2s" | Monitor title card "LEVEL n", slight softbox hue shift |
| Boost held | The needle turns cyan with a longer trail | Faster waveform and speaker pump |
| Idle | — | The REC LED blinks, dust drifts in the light beams |

Audio stays as in the game design doc (§9).

---

## 5. Asset contract (Blender ↔ Three.js)

**Units and orientation**
- 1 Blender unit equals 1 Three.js unit.
- The dial center sits at the world origin. Its face points toward Blender −Y, which becomes glTF/Three.js +Z, toward the camera.

| Measure | Value |
|---|---|
| Vinyl outer radius | 1.00 |
| Zone groove band | 0.62–0.92 |
| Hub label radius | 0.40 (cream hub ring out to 0.455; the needle base sits there) |
| Vinyl face plane | z = +0.08 in Three.js (zones are drawn at 0.084, the needle at 0.118) |
| Lock body | 3.0 wide × 3.5 tall, bottom at y = −2.0 (the desk top) |
| Shackle | Closed in the .glb. Three.js lifts it +0.38 while playing and drops it on game over |

**Angle convention (Three.js):** 0 = 12 o'clock, increasing clockwise as the player sees it. A point on the dial is `(r·sin θ, r·cos θ)`.

**Pivots:** The pivot of `Lock_Shackle` sits at its hinge, for the snap-shut animation. The origin of `Speaker_Cone` is at its center, for scale pulses.

**Object names**

| Group | Names |
|---|---|
| Lock | `Lock_Body`, `Lock_Shackle`, `Lock_Badge` |
| Dial | `Dial_Vinyl`, `Dial_Label` (UV 0–1 square, material `HubScreen`) |
| Softboxes | `Prop_Softbox_L`, `Prop_Softbox_R`, with emissive panels `Softbox_L_Panel`, `Softbox_R_Panel` |
| Camera | `Prop_Camera`, `Camera_REC` |
| Monitor | `Prop_Monitor`, `Monitor_Screen` (UV 0–1 at 16:9, material `MonitorScreen`) |
| Other props | `Prop_Headphones`, `Prop_Speaker`, `Speaker_Cone`, `Prop_Desk` |
| Room | `Room_Wall`, `Room_Foam` |

**Materials:** Principled BSDF with flat palette base colors, roughness 0.5–0.7 and almost no metal (the shackle is the exception). No image textures.

**Budget:** Under 150k triangles in total. `studio.glb` under 5 MB. No Draco compression.

**Source files:** `art/tick-lock-studio.blend` is exported to `assets/studio.glb`.

---

## 6. Code layout

| File | Role |
|---|---|
| `index.html` | Canvas stage, HTML UI (boot, menu, start cue, briefing, leaderboard, game over, settings), import map pointing to `vendor/three/` |
| `vendor/three/` | Local Three.js r187 and add-ons, so the booth needs no Wi-Fi |
| `src/main.js` | Boot sequence, event bus, menu phase machine, leaderboard & run history, settings, input, frame loop |
| `src/game.js` | Gameplay state machine, 8-level + endless progression, graze/recovery/flow rules |
| `src/scene.js` | Single-pass renderer, camera framing, lights, `.glb` loading, `cheapMaterial()`, custom tone-mapped `uGrade`, halos, visual settings |
| `src/dial.js` | Zones, needle light beam, trail, ring flash |
| `src/hud.js` | Hub and monitor canvas textures (including idle Top-5 leaderboard on monitor) |
| `src/fx.js` | Particles, needle sparkles, dust motes, floating text, shake, ON AIR ignition, studio reactions |
| `src/pause3d.js` | True 3D world-space pause menu (`CanvasTexture` plane + raycast interaction) |
| `src/audio.js` | WebAudio synthesized tones and feedback per event |
| `src/avatars.js` | Offline vector SVG avatar library for leaderboard entries |
| `src/style.css` | Hallmark-compliant tokens (`:root`) and 2D overlay styles |

The game must be served over HTTP (for example `python -m http.server 8642 --bind 127.0.0.1` or `npx serve .`), because browsers block loading the `.glb` and ES modules from `file://`.

---

## 7. Performance notes

Measured on an Intel UHD integrated GPU at 1920×1080. In this setup a bare one-cube Three.js page already takes 18 ms per frame.

| Change | Effect |
|---|---|
| Hub and monitor canvases made CPU-backed (`willReadFrequently`) and redrawn only when changed (monitor at 30 Hz) | About 52 → 27 ms per frame |
| Camera-flash point light removed; no MSAA on the default framebuffer | Included above |
| Adaptive pixel ratio: steps down 0.15 when frames average over 20 ms, back up under 11 ms, floor 0.6, ceiling 1.5 | 17 ms per frame on this GPU (matches the bare-page baseline) |

**Late-night optimization pass (2026-11-18).** Measured as GPU time with a forced finish per frame, at a 1631×918 buffer on Intel UHD:

| Change | Effect |
|---|---|
| OutputPass, grade and FXAA merged into **one final pass** (ACES, sRGB and grade in a single shader; FXAA dropped because the grain hides aliasing) | Post-processing went from roughly doubling the frame to about +3.7 ms |
| Bloom at quarter resolution | Bloom costs about 2.8 ms |
| 3D render scale 0.85 × min(DPR, 1.25) | Fewer pixels; the HTML UI stays native |
| Wall, foam, floor, desk and poles switched to `MeshLambertMaterial` | Cheaper shading on the largest screen areas |
| Hub canvas at 1.5× (was 2×); monitor canvas at 1× and 20 Hz (was 1.5× at 30 Hz); anisotropy 4 | About 4× less canvas upload |
| Particles: pool 400, sparkles 45/s, dust 45 | Smaller particle cost |
| Adaptive tiers (one-way): resolution −0.15, resolution −0.15, then bloom off | Safety net, with no repeated resizes |

The result is **about 11.8 ms per full frame** (8.1 ms for the bare scene), which fits a 60 fps budget.

**Booth check:** Press **F** in the game to show fps, frame time and the current pixel ratio. If the booth machine settles at 0.6, it is GPU-limited. Lower the bloom first, then consider fewer softbox point lights.
