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
| **Pick** | Space or Enter | Click or tap the dial, or the PICK button | A |
| **Boost (hold)** | Shift | Hold the BOOST button | RB or RT |
| **Start / Retry** | Same as Pick | Same as Pick | A |

A browser only detects a gamepad after one of its buttons has been pressed.

---

## 4. Game Elements

### 4.1 Needle
- A tapered magenta stylus arm that pivots from the edge of the center hub, with a sharp tip just past the ring. In 3D, the dial is a vinyl record set into the face of a padlock.
- It has a glow and a sweep trail along the groove band, and it turns cyan while Boost is held (with a longer trail).
- Hit detection uses the needle's angle where it crosses the ring.

### 4.2 Zones

| Zone | Color | Reward |
|---|---|---|
| **Gold** | Gold | Score |
| **Blue (time)** | Blue, labeled "+2s" | Score + 2 s time. At most one on the ring at a time. Lives 30% shorter than gold |
| **Perfect core** | White center strip, the middle 30% of any zone | Score ×2, "PERFECT" text, bigger burst |

**Zone behavior**
- **Pop-in:** a zone grows in over 0.15 s when it appears.
- **Shrinking (from level 4):**
  - A zone shrinks steadily over its lifetime, then disappears.
  - A faint outline shows its original size, so the shrinking is easy to read.
  - The zone blinks in its last 0.8 s.
  - A zone that expires costs nothing and is replaced right away.
- **Placement:** new zones never appear within 0.7 rad (about 40°) of the needle, and never overlap other zones.
- **Count:** the number of zones on the ring is set by the level (1 → 5).

### 4.3 Clock (time as health)
The clock is the player's health bar. It drains at 1 second per second, and these change it:

| Event | Time |
|---|---|
| Start | 12 s |
| Any hit | +0.3 s |
| Blue zone hit | +2 s (on top of the hit bonus) |
| Level up | +2 s |
| Miss | −1.5 s |

**Design intent:** a player who rarely misses can roughly hold the clock steady. Runs end because mistakes pile up at higher levels, not because the clock drains on its own. That makes losing feel fair: "I missed", not "the timer was too short".

### 4.4 Boost (risk and reward)
- **While held:** the needle moves ×1.8 faster and every hit scores ×2.
- **Trade-off:** it shortens the reaction window by the same factor, so misses become more likely.
- **Balance:** the level curve assumes no boost. Boost is an optional choice for players chasing a high score.

---

## 5. Scoring

```
points = 100 × (1 + 0.1 × combo) × (Perfect ? 2 : 1) × (Boost ? 2 : 1)
```

- **Combo:** goes up by 1 on every hit and resets to 0 on a miss.
- **Display:** score, combo and level are shown in the hub. A floating text shows each hit's points.
- **Best score:** saved in that browser (localStorage) and shown on the title and end screens.
- **End screen:** final score, level reached, total hits, Perfect count and best score.

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
| 1 | Basics: one zone, needle reverses | 4 | 0 | 2.0 | 30° | 262 ms | 1 | No shrink | 0% |
| 2 | Second zone: pick a target | 4 | 4 | 2.2 | 28° | 222 ms | 2 | No shrink | 0% |
| 3 | Blue time zones appear | 5 | 8 | 2.4 | 26° | 189 ms | 2 | No shrink | 15% |
| 4 | Zones start shrinking | 5 | 13 | 2.6 | 25° | 168 ms | 3 | 5.0 s | 15% |
| 5 | Faster and narrower | 6 | 18 | 2.9 | 24° | 144 ms | 3 | 4.2 s | 18% |
| 6 | Four zones on the ring | 6 | 24 | 3.2 | 23° | 125 ms | 4 | 3.6 s | 20% |
| 7 | Zones live shorter | 8 | 30 | 3.5 | 22° | 110 ms | 4 | 3.2 s | 20% |
| 8 | Five zones, then endless | 8 | 38 | 3.8 | 22° | 101 ms | 5 | 2.8 s | 22% |

### 6.3 Endless mode (after level 8)
- **What repeats:** level 8's settings, with zones that are 8 hits long.
- **Speed:** goes up by 0.1 rad/s every level.
- **Window floor:** zone width grows if needed so the window never drops below **90 ms**. The game keeps getting harder without becoming impossible.

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

All values sit in one block at the top of the game script (`LEVELS` and the constants after it), and they match the **Tick Lock Balance Sheet**.

| Constant | Value | Effect |
|---|---|---|
| `START_TIME` | 12 s | Clock at start |
| `HIT_TIME` | 0.3 s | Time added on every hit |
| `BLUE_TIME` | 2 s | Extra time from a blue zone |
| `LEVEL_TIME` | 2 s | Time added on level up |
| `MISS_TIME` | 1.5 s | Time lost on a miss |
| `ENDLESS_SPEED` | 0.1 rad/s | Speed added per level after L8 |
| `MIN_WINDOW` | 0.09 s | Reaction window floor |
| Boost | ×1.8 speed, ×2 score | Risk and reward |
| Perfect core | 30% of zone | ×2 score |
| Spawn gap | 0.7 rad | Minimum distance from the needle for a new zone |
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
| Hit | Burst of particles at the needle tip, ring flash in the zone color, floating points | Short square-wave blip (660 Hz) |
| Perfect | Bigger white burst, "PERFECT" text | Higher blip (880 Hz) |
| Blue zone | Blue flash, "+2s" text | Triangle chime (990 Hz) |
| Miss | Screen shake, red ring flash, "−1.5s" | Low sawtooth buzz (140 Hz) |
| Level up | "LEVEL n +2s" floating text | Bright chime (1320 Hz) |
| Low time | Timer turns red under 5 s | — |
| Game over | "LOCKED OUT" screen | Low falling buzz |

Sound starts only after the first input, as browsers require.

In 3D, the studio around the lock also reacts to these moments. Softboxes flash, the speaker cone pumps, the monitor waveform spikes, the REC LED blinks, and a miss adds an RGB glitch. The full table is in the [3D visual spec §4](docs/superpowers/specs/2026-11-17-tick-lock-3d-visual-design.md).

---

## 10. Screens

1. **Title:** "TICK LOCK", one-line instruction, blinking "PRESS SPACE / TAP", best score. The needle idles around the dial. In 3D, the hub label shows the title and best score, the studio monitor shows the title card, and the camera slowly dollies with mouse parallax.
2. **Play:** dial and needle, with the hub showing time remaining, score, combo and level. In 3D, the monitor shows a REC timecode, a live waveform, the combo and the level.
3. **Game over:** "LOCKED OUT", final score, level, hits, Perfects, best score, blinking "PRESS TO RETRY". Input is ignored for 0.6 s so a panicked press doesn't skip the screen. In 3D, the shackle snaps shut, the studio dims to red, and the results card appears on the monitor.

---

## 11. Booth Notes

- **Easy to learn:** one button is understandable in seconds, and the queue moves fast at about 30 s per run.
- **Setup:** put the game on a screen visitors can see from the queue. The needle and flashes read well from a distance.
- **Input:** a gamepad or a big arcade button is more fun than a keyboard. Map it to A.
- **Best score:** it is saved per browser. Clear localStorage at the start of each day for a fresh "high score of the day".
- **Playtesting:** watch players instead of asking them. Note where they die and whether they smile at level-ups.

---

## 12. Status and Next Steps

**Done**
- Needle, zones, reversal, Perfect core, Boost
- Multiple shrinking zones, blue time zones
- 8-level progression + endless, time economy as health
- Sound, particles and screen feedback
- Keyboard, mouse, touch and gamepad input; local best score

**3D version (2026-11-17)**
- Done: visual direction ("Studio Lock"), Blender studio model (`art/tick-lock-studio.blend` → `assets/studio.glb`, about 37k triangles after the detail pass), and a Three.js visual prototype covering zones, needle, HUD, studio reactions and screens. The prototype runs on a temporary demo driver (`src/demo.js`).
- Next: port the real rules from sections 2–7 (the `LEVELS` table, time economy, scoring) and the sounds from section 9 into the 3D build, replacing the demo driver.

**Next**
- Booth playtest: record run length and level reached, then fill in real miss rates in the balance sheet
- Online leaderboard with player names (Supabase or Firebase)
- Visual theme pass: dial art, background, needle style
- Music track that speeds up with level

**Ideas if time allows**
- **Special zones:** red "trap" zones that cost time if hit, and moving zones that slide along the ring
- **Double-tap zones:** zones that need two hits
- **Daily seed:** everyone gets the same zone layout, for a fair leaderboard
