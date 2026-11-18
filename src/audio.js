// Synthesized WebAudio sound engine (zero external assets, 100% offline-ready for the booth).
// Sound only starts after the first user gesture, as required by browser autoplay policies.

export function createAudio() {
  let ctx = null;
  let beatAcc = 0, stepIdx = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, type, dur, gainPeak, freqEnd = freq, delay = 0) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  function react(evt, d = {}) {
    switch (evt) {
      case 'start':
        beatAcc = 0; stepIdx = 0;
        tone(440, 'triangle', 0.09, 0.12, 660, 0);
        break;
      case 'title':
        beatAcc = 0; stepIdx = 0;
        break;
      case 'hit': {
        // Pitch climbs with combo for an addictive rising tension
        const step = Math.pow(2, Math.min(d.combo || 0, 16) / 18);
        const base = (d.perfect ? 880 : 660) * step;
        tone(1800, 'triangle', 0.018, 0.08, 420, 0);                 // tactile mechanical lock click
        tone(base, 'square', d.perfect ? 0.11 : 0.075, 0.11, base * 1.02, 0);
        if (d.perfect) {
          tone(base * 1.5, 'triangle', 0.16, 0.12, base * 1.52, 0.015);
        }
        break;
      }
      case 'blue':
        tone(990, 'triangle', 0.11, 0.14, 1320, 0);
        tone(1320, 'sine', 0.14, 0.12, 1480, 0.055);
        break;
      case 'recovery':
        // Heroic two-step "SAVED!" chord
        tone(587.33, 'triangle', 0.10, 0.15, 659.25, 0);
        tone(880, 'triangle', 0.18, 0.16, 1174.66, 0.05);
        break;
      case 'flow':
        // Warm harmonic swell when entering Flow State
        tone(523.25, 'sine', 0.24, 0.11, 523.25, 0);
        tone(659.25, 'triangle', 0.26, 0.11, 659.25, 0.03);
        tone(1046.5, 'sine', 0.30, 0.12, 1046.5, 0.06);
        break;
      case 'graze':
        // Metallic friction spark zip (lighter than a full miss)
        tone(1450, 'sawtooth', 0.06, 0.09, 620, 0);
        tone(240, 'triangle', 0.08, 0.10, 170, 0.01);
        break;
      case 'miss':
        // Mechanical pin jam clank + 140 Hz sawtooth buzz (design doc §9)
        tone(310, 'square', 0.04, 0.12, 120, 0);
        tone(140, 'sawtooth', 0.22, 0.16, 92, 0.015);
        break;
      case 'levelup':
        tone(990, 'triangle', 0.09, 0.13, 990, 0);
        tone(1320, 'triangle', 0.20, 0.16, 1340, 0.06);
        break;
      case 'fatal':
        tone(220, 'sawtooth', 0.28, 0.16, 85, 0);
        break;
      case 'gameover':
        beatAcc = 0; stepIdx = 0;
        // Heavy shackle slam + low falling buzz
        tone(120, 'square', 0.08, 0.20, 38, 0);
        tone(150, 'sawtooth', 0.42, 0.16, 52, 0.04);
        break;
    }
  }

  // Procedural late-night studio pulse + clockwork tick during active play.
  function update(dt, s) {
    if (!ctx || ctx.state !== 'running' || s.mode !== 'play' || s.paused || s.freezeT > 0 || dt <= 0) {
      return;
    }
    const bpm = Math.min(152, 100 + (s.level - 1) * 6) * (s.boost ? 1.22 : 1);
    const stepDur = 30 / bpm;
    beatAcc += dt;
    if (beatAcc < stepDur) return;
    beatAcc %= stepDur;

    const beat = stepIdx & 7;
    stepIdx += 1;

    if (beat % 2 === 0) {
      tone(beat === 0 ? 1350 : 980, 'triangle', 0.022, 0.075, 320, 0);
    } else {
      tone(760, 'triangle', 0.014, 0.04, 280, 0);
    }

    const root = s.flow ? 65.41 : 55.0;
    if (beat === 0 || beat === 4) {
      tone(root, 'triangle', 0.16, 0.13, root * 0.92, 0);
    }
    if (beat % 2 === 0) {
      // Octave mid-bass layer so the pulse remains audible on laptop and booth speakers
      const punch = beat === 0 ? 0.095 : 0.065;
      tone(root * 2, 'triangle', 0.12, punch, root * 1.9, 0);
    }
    if (s.flow && beat % 2 === 1) {
      const notes = [220, 261.63, 329.63, 392.0];
      const f = notes[(beat >> 1) & 3];
      tone(f, 'triangle', 0.11, 0.085, f, 0);
    }
  }

  return { react, update, unlock: ensure };
}
