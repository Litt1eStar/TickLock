# Tick Lock — Game Design Document

*One-button timing game for the Game Design booth at Open House. Inspired by skill-check mechanics such as the generator repair in Dead by Daylight, built as a game of its own.*

---

## 1. Overview

| | |
|---|---|
| **Genre** | One-button timing / skill check, score attack |
| **Players** | 1 |
| **Platform** | Web browser, 3D with Three.js (small folder: `index.html`, `src/`, `assets/studio.glb`, local `vendor/three/`). Look and assets: [3D visual spec](docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md) |
| **Input** | Keyboard, mouse, touch or gamepad |
| **Target run length** | About 30 s for an average player (about 20 s new, about 50 s skilled) |
| **Structure** | 8 tutorial-style levels, then endless |
| **Audience** | Students visiting the booth. They should learn it within seconds and want to try "one more time" |

**Pitch:** A needle sweeps around a lock dial. Press when the needle is inside a zone. Every hit reverses the needle. Keep the clock alive as long as you can while the dial gets faster, tighter and busier.

---

## 2. Core Loop

1. The needle sweeps around the dial.
2. Zones appear on the ring.
3. The player presses **Pick** while the needle is inside a zone.
4. **Hit:**
   - The needle reverses direction.
   - The zone disappears and you earn score and time.
   - A new zone appears.
5. **Miss:** pressing with the needle outside every zone costs time and resets the combo.
6. The clock drains continuously. At 0 the run ends ("LOCKED OUT").

The direction reversal is the heart of the game. The player can't settle into a fixed rhythm, so each hit is a fresh read of where the needle goes next. That keeps players in a state of "flow".

---

## 3. Controls

| Action | Keyboard | Mouse / Touch | Gamepad |
|---|---|---|---|
| **Pick** | Space or Enter | Click or tap the dial, or the Pick button | A |
| **Boost (hold)** | Shift | Hold the Boost button | RB or RT |
| **Pause** | P or Esc | Pause button | — |
| **Start / Retry** | Same as Pick | Same as Pick | A |

A browser only detects a gamepad after one of its buttons has been pressed.

---

## 4. Game Elements

### 4.1 Needle
- A razor-slim violet stylus light beam (`0x7b8cff`) that pivots from the edge of the center hub (`HUB_R = 0.455`), with a sharp tip just past the vinyl groove ring (`TIP_R = 1.0`).
- It leaves a subtle sweep trail and sparkles along the groove band, and turns cyan (`0x39d5ff`) while Boost is held (with a longer trail).
- Hit detection uses the needle's angle where it crosses the ring.

### 4.2 Zones

| Zone | Color | Reward |
|---|---|---|
| **Gold** | Amber gold | Score |
| **Blue (time)** | Cyan blue | Score + 2 s time. At most one on the ring at a time. Lives 30% shorter than gold |
| **Recovery (unjam)** | Mint emerald | Restores half of the combo lost on the preceding miss + refunds 1.2 s (`HIT_TIME + MISS_TIME`). Appears ahead of the needle for 2.8 s after a full miss (`1.15×` width) |
| **Perfect core** | Warm white center strip, the middle 30% of any zone | Score ×2, "PERFECT" text, white burst & camera punch |

**Zone behavior**
- **Pop-in:** a zone grows in over 0.15 s when it appears.
- **Shrinking (from level 4):**
  - Gold and blue zones shrink steadily down to **45%** of their original width (`1 − k × 0.55`) over their lifetime (recovery zones shrink to 60%).
  - A faint outline shows the original size once shrinking begins, so the remaining tolerance stays readable.
  - Zones blink in their last 0.8 s (recovery zones pulse rapidly).
  - A zone that expires costs nothing and is replaced right away (recovery zones simply clear if missed).
- **Placement & motion:** new zones never appear within 0.7 rad (about 40°) of the needle, and never overlap other zones. From **level 6**, newly spawned regular zones have a chance (`35%` at L6–7, `50%` at L8+) to **drift smoothly** along the groove band (`0.26–0.48 rad/s`), bouncing off neighboring zones so they never collide.
- **Count:** the number of active regular zones on the ring is set by the level (1 → 5).

### 4.3 Clock (time as health)
The clock waits for the player's **first hit** before counting down (**First-Hit Clock Freeze**; misses before Hit #1 give a small 0.08 s needle recoil without draining time). Once running, it drains at 1 second per second, and these change it:

| Event | Time |
|---|---|
| Start | 30 s |
| Any hit (after Hit #1) | +0.45 s |
| Blue zone hit | +2 s (on top of the hit bonus) |
| Recovery zone hit | +1.2 s refund (on top of the hit bonus) |
| Level up | +2 s |
| Near-miss graze (within 6.0° of zone edge) | −0.4 s (combo halved) |
| Full miss | −1.2 s (0.10 s jam recoil, 0.45 s breather at `0.62×` speed, 0.22 s input lock) |

**Design intent:** a player who hits consistently can hold the clock steady well past 30 s. Runs end because misses compound at higher levels, while near-miss grazes and post-miss recovery zones make mistakes dramatic and salvageable rather than abrupt.

### 4.4 Boost (risk and reward)
- **While held:** the needle moves ×1.8 faster and every hit scores ×2.
- **Trade-off:** it shortens the reaction window by the same factor, so misses become more likely.
- **Balance:** the level curve assumes no boost. Boost is an optional choice for players chasing a high score.

---

## 5. Scoring

```
points = 100 × (1 + 0.1 × combo) × (Perfect ? 2 : 1) × (Boost ? 2 : 1) × (Flow ? 1.25 : 1)
```

- **Combo:** goes up by 1 on every hit, is halved on a near-miss graze, and resets to 0 on a full miss (with half of combos `>= 2` restorable via the clutch Recovery zone).
- **Flow State:** begins at `10×` combo, adding a gold inner-rim aura and a `×1.25` score multiplier.
- **Display:** score, combo, level and lock-pin progress dots are shown in the hub. Floating text shows each hit's points.
- **Leaderboard & run log:** Top 10 daily scores (with callsign, studio avatar, level, and survival time) are saved in `localStorage` (`ticklock_leaderboard`, plus full CSV-exportable run history in `ticklock_history`), and the top five appear on the 3D studio monitor on the menu.
- **End screen:** final score, level reached, best combo, hits, Perfect count, callsign/avatar entry, and Leaderboard / Play again / Main menu actions.

---

## 6. Difficulty Progression

### 6.1 The key number: reaction window
Difficulty is measured by the **reaction window**: how long the needle spends inside a zone.

```
reaction window (ms) = zone width (rad) ÷ needle speed (rad/s) × 1000
```

Speed and zone width are always balanced as a pair. Changing one without the other makes the game harder or easier than intended.

| Window | Feels |
|---|---|
| 250 ms+ | Relaxed, for learning |
| 150–250 ms | Focused |
| 100–150 ms | Hard, flow zone |
| Under 100 ms | Feels unfair to most players |

### 6.2 Level table

Each level adds **one** new idea, so players learn one thing at a time.

| Level | New idea | Hits | Starts at hit # | Speed (rad/s) | Zone width | Window | Zones | Zone lifetime | Blue chance |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Basics: one zone, needle reverses | 4 | 0 | 2.00 | 34° | 297 ms | 1 | No shrink | 0% |
| 2 | Second zone: pick a target | 4 | 4 | 2.15 | 32° | 260 ms | 2 | No shrink | 0% |
| 3 | Blue time zones appear | 5 | 8 | 2.35 | 30° | 223 ms | 2 | No shrink | 18% |
| 4 | Zones start shrinking (45% floor) | 5 | 13 | 2.50 | 29° | 202 ms | 3 | 6.5 s | 18% |
| 5 | Faster and slightly narrower | 6 | 18 | 2.70 | 28° | 181 ms | 3 | 5.8 s | 20% |
| 6 | Four zones on the ring; drifting zones begin | 6 | 24 | 2.95 | 27° | 160 ms | 4 | 5.2 s | 22% |
| 7 | Faster sweep | 8 | 30 | 3.20 | 25° | 136 ms | 4 | 4.6 s | 22% |
| 8 | Five zones, frequent drift, then endless | 8 | 38 | 3.45 | 24° | 121 ms | 5 | 4.2 s | 24% |

### 6.3 Endless mode (after level 8)
- **What repeats:** level 8's settings, 8 hits per level.
- **Speed:** goes up by 0.1 rad/s every level.
- **Window floor:** zone width grows if needed so the reaction window never drops below **100 ms**. The game keeps getting harder without becoming impossible.

### 6.4 Level up
- **Reward:** +2 s and a floating "LEVEL n +2s" with a chime.
- **No pause:** play continues immediately, so the flow isn't broken.
- **Needle speed:** changes to the new level's speed at the moment of level up.

### 6.5 Expected pacing (average player)

From the balance sheet model. The "estimated misses" figures are assumptions until booth playtesting.

| Level | Est. misses | Level duration | Clock time when level ends | Time left at level end |
|---|---|---|---|---|
| 1 | 0.3 | 6.3 s | 6.3 s | 8.5 s |
| 2 | 0.6 | 4.2 s | 10.5 s | 6.5 s |
| 3 | 1.0 | 4.8 s | 15.4 s | 5.2 s |
| 4 | 1.3 | 3.7 s | 19.1 s | 4.5 s |
| 5 | 1.8 | 4.0 s | 23.0 s | 3.8 s |
| 6 | 2.2 | 3.1 s | 26.2 s | 3.6 s |
| 7 | 3.0 | 3.8 s | 30.0 s | 2.9 s |
| 8 | 3.8 | 3.2 s | 33.2 s | 1.9 s |

An average player reaches level 8 around 30 s and runs out of time shortly after. This model doesn't include the time lost walking up to the booth, reading the screen or fumbling the first press.

---

## 7. Balance Constants

All values sit in one block at the top of `src/game.js` (`LEVELS` and the constants after it).

| Constant | Value | Effect |
|---|---|---|
| `START_TIME` | 30 s | Clock at start (paused until Hit #1) |
| `HIT_TIME` | 0.45 s | Time added on every hit (after Hit #1) |
| `BLUE_TIME` | 2 s | Extra time from a blue zone |
| `LEVEL_TIME` | 2 s | Time added on level up |
| `MISS_TIME` | 1.2 s | Time lost on a full miss (refunded by recovery hit) |
| `GRAZE_RAD` / `GRAZE_TIME` | 6.0° / 0.4 s | Near-miss window and reduced penalty (combo halved) |
| `RECOVERY_LIFE` | 2.8 s | Lifetime of green recovery zone spawned after a full miss |
| `FLOW_COMBO` / `FLOW_BONUS` | 10 / ×1.25 | Combo threshold and score multiplier for Flow State |
| `FREEZE_DUR` | 0.45 s | Fatal freeze-frame hold before Game Over |
| `ENDLESS_SPEED` | 0.1 rad/s | Speed added per level after L8 |
| `MIN_WINDOW` | 0.10 s | Reaction window floor (100 ms) |
| Boost | ×1.8 speed, ×2 score | Risk and reward |
| Perfect core | 30% of zone | ×2 score |
| Spawn gap | 0.7 rad | Minimum distance from the needle for a new zone |
| Zone shrink floor | 45% of original (60% recovery) | Minimum width a shrinking zone reaches before expiring |
| Zone fade blink | last 0.8 s | Warning before a zone expires |
| Blue lifetime | ×0.7 of gold | Blue zones expire faster |

`LEVELS` row format: `[hits in level, speed rad/s, width degrees, zones, lifetime s (0 = no shrink), blue chance]`.

---

## 8. Tuning Guide

| If playtesting shows… | Adjust first | Then |
|---|---|---|
| Runs end too fast for new players | `START_TIME` up (12 → 15) | L1 width up |
| Runs last too long | `HIT_TIME` down (0.3 → 0.2) | Level-up bonus down |
| Level 1 is boring | L1 speed up (2.0 → 2.2) | L1 hits down (4 → 3) |
| A jump between two levels feels like a wall | Compare their windows. Keep each step at about 25–40 ms | Move one variable at a time |
| Shrinking zones feel unfair | Zone lifetime up | Delay shrinking to L5 |
| Nobody uses Boost | Boost score ×2 → ×3 | |
| Everyone uses Boost | Boost speed ×1.8 → ×2 | |
| Skilled players never die | Raise `ENDLESS_SPEED` | Lower `MIN_WINDOW` slightly |

**Rule of thumb:** change one number at a time, and record the run length and the level reached for 5–10 players before changing again.

---

## 9. Feedback and Juice

| Moment | Visual | Audio |
|---|---|---|
| Active clock (beat) | Speaker cone & waveform pulse with hits/boost | Clockwork eighth-note tick + sub-bass pulse scaling with level & Boost, plus harmonic shimmer in Flow State |
| Hit | Burst of particles at the needle tip, ring flash in the zone color, floating points | Tactile lock click + rising square-wave blip (660 Hz+) |
| Perfect | Bigger white burst, "Perfect" text | Higher blip (880 Hz+) + crystal harmonic |
| Blue zone | Blue flash, "+2s" text | Two-note triangle/sine chime (990 → 1480 Hz) |
| Near-miss graze | Orange spark burst, ghost tick, "So close!" | Metallic friction spark zip |
| Miss | Screen shake, red ring flash, "−1.2s", recovery zone spawns | Pin jam clank + low sawtooth buzz (140 Hz) |
| Level up | "Level n +2s" floating text | Bright chime (990 → 1320 Hz) |
| Low time | Timer turns red and pulses under 5 s | — |
| Game over | "Locked out" screen, shackle slams shut | Heavy slam + low falling buzz |

Sound starts only after the first input, as browsers require.

In 3D, the studio around the lock also reacts to these moments. Softboxes flash, the speaker cone pumps, the monitor waveform spikes and glitches on miss, and the REC LED blinks. The full table is in the [3D visual spec §4](docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md).

---

## 10. Screens

1. **Title:** "Muasoom Studio / TICK LOCK" left-aligned typographic menu (`Play`, `Leaderboard`, `Settings`), bottom corner hints and credit, slow camera dolly with mouse parallax. The record hub displays `Best score` and the 3D studio monitor displays today's top five.
2. **Briefing & Start Cue:** choosing **Play** opens the **How to play** modal; closing it leads to `"Press Space to start"`, which the violet needle wipes away as the run starts and the ON AIR sign flickers lit.
3. **Play:** dial and needle, hub showing time remaining, score, combo, level and lock-pin progress dots; monitor showing REC timecode, waveform, event cards and miss glitch. Pressing **P** or **Esc** pans the camera right to the 3D world-space Pause Menu (`src/pause3d.js`).
4. **Game over:** "LOCKED OUT", 0.45 s fatal freeze-frame, shackle snaps shut, studio dims to red, monitor shows results, and `#gameover-panel` shows breakdown, avatar/name entry for today's leaderboard, and Play again / Leaderboard / Main menu. Input is ignored for 0.6 s so a panicked press doesn't skip the screen.

---

## 11. Booth Notes

- **Easy to learn:** one button is understandable in seconds, and the queue moves fast at about 30–60 s per run.
- **Setup:** put the game on a screen visitors can see from the queue. The needle, 3D monitor top-5, and flashes read well from a distance.
- **Input:** keyboard, gamepad (A / RB / RT), mouse, or touch. Press **F** to toggle the performance overlay (`fps · ms · px`).
- **Best score & Daily Board:** Top 10 and full run history live in localStorage (`ticklock_lb_date` automatically resets the daily board at midnight while preserving multi-day history in `ticklock_history` for CSV export; `Clear today's scores` resets manually after a second confirmation press). Clear sample scores (`SEED_BOARD`) before the booth opens.
- **Playtesting:** watch players instead of asking them. Note where they die and whether they smile at level-ups.

---

## 12. Status and Next Steps

**Done**
- Gameplay engine (`src/game.js`): 8-level progression + endless mode, reversal, Perfect core, Boost, Flow State (`10×+`), First-Hit Clock Freeze, Near-Miss Graze, Clutch Recovery zones, Level 6+ Drifting zones, and Fatal Freeze-Frame.
- 3D Studio Lock scene (`src/scene.js`, `src/dial.js`, `src/hud.js`, `src/fx.js`, `assets/studio.glb`): vinyl dial shader, razor-slim violet needle, single-pass hardware optimization (~83–164 fps), diegetic monitor leaderboard, unified sentence-case 3D HUD & floating callouts, ON AIR ignition flicker.
- UI & 3D Pause (`index.html`, `src/style.css`, `src/pause3d.js`, `src/avatars.js`): Boot shader pre-compile screen, Hallmark-styled menu and panels/modals, How to play briefing, Start cue needle wipe, Open House Top-10 daily-rollover leaderboard + CSV export, and 3D world-space pause menu.
- Audio (`src/audio.js`): WebAudio synthesized feedback for all gameplay events plus procedural late-night studio pulse that scales with level, Boost, and Flow State.

**Next**
- Booth playtest: record live run lengths and levels reached in `ticklock_history` CSV, clear sample `SEED_BOARD` entries before booth opening, and fine-tune `LEVELS` if needed.
- Optional online backend sync if Wi-Fi is available.

**Ideas if time allows**
- **Special zones:** red "trap" zones that cost time if hit, and double-tap zones
- **Daily seed:** everyone gets the same zone layout, for a fair leaderboard
