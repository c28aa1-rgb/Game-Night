/**
 * HUES & CUES — sound.
 *
 * Synthesised on the fly, like Mafia's and Draft Night's: no audio files,
 * nothing to load before the first pin lands.
 *
 * The brief for this one is restraint. Nothing here is a stinger. A pin makes
 * a plink, the reveal climbs a small figure, a bullseye gets one warm chord —
 * and that is the entire vocabulary. The board is doing the shouting.
 *
 * Two details worth keeping:
 *   · plink() takes an index, so ten pins arriving at once walk up a
 *     pentatonic scale instead of firing the same note ten times. A room of
 *     phones submitting together should sound like a chord being built.
 *   · everything sends a little signal to a small convolver. The difference
 *     between "synthesised beeps" and something that sounds like it happened
 *     in a room is reverb, and an impulse response is only noise with an
 *     exponential decay — no file needed.
 *
 * TV only. Phones stay silent and use the vibrator instead, because a phone in
 * a pocket at a party is either muted or annoying.
 */

window.HuesSFX = (() => {
  const KEY = 'hues.sound';

  let ctx = null;
  let master = null;
  let reverbSend = null;
  let noise = null;
  let enabled = localStorage.getItem(KEY) !== 'off';

  /** A pentatonic run, so any subset of it played together stays consonant. */
  const SCALE = [523.25, 587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91, 1567.98, 1760.0];

  function build() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    comp.connect(ctx.destination);

    const frames = ctx.sampleRate;
    noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    // A small, soft room — a lounge, not a hangar.
    const seconds = 1.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const tail = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const gate = i < ctx.sampleRate * 0.008 ? 0 : 1;
        tail[i] = gate * (Math.random() * 2 - 1) * (1 - t) ** 3.2;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.5;
    reverbSend.connect(convolver);
    convolver.connect(master);

    return true;
  }

  function live() {
    if (!enabled) return null;
    if (!ctx && !build()) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const now = (at) => ctx.currentTime + (at || 0);

  /** A gain shaped like a struck object: near-instant on, ringing down. */
  function struck(peak, at, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now(at));
    gain.gain.exponentialRampToValueAtTime(peak, now(at) + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now(at) + decay);
    return gain;
  }

  function tone(freq, at, decay, peak, type, send) {
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = struck(peak, at, decay);
    osc.connect(gain);
    gain.connect(master);
    if (send) {
      const wet = ctx.createGain();
      wet.gain.value = send;
      gain.connect(wet);
      wet.connect(reverbSend);
    }
    osc.start(now(at));
    osc.stop(now(at) + decay + 0.05);
    return osc;
  }

  /** Filtered noise — the physical part of a click or a tap. */
  function transient(at, peak, freq, q, decay) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const gain = struck(peak, at, decay);
    src.connect(band);
    band.connect(gain);
    gain.connect(master);
    src.start(now(at));
    src.stop(now(at) + decay + 0.05);
  }

  // -------------------------------------------------------------------------
  // The lobby bed
  //
  // Something for the room to arrive to. A drone a long way down, a chord
  // moving slowly above it, and single notes falling into the reverb — quiet
  // enough to talk over, which is the entire specification for music playing
  // while people are finding a seat and typing their name in.
  // -------------------------------------------------------------------------

  let bedNodes = [];
  let bedTimers = [];
  let bedGain = null;
  let bedOn = false;

  /** A2 minor-pentatonic. Nothing here can land on a sour interval. */
  const BED_NOTES = [220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
  const BED_CHORDS = [[110, 164.81, 220], [98, 146.83, 196], [123.47, 164.81, 246.94], [87.31, 130.81, 174.61]];

  function bedVoice(freq, at, hold, peak, type) {
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now(at));
    gain.gain.exponentialRampToValueAtTime(peak, now(at) + 1.6);
    gain.gain.setValueAtTime(peak, now(at) + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, now(at) + hold + 2.4);
    osc.connect(gain);
    gain.connect(bedGain);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    gain.connect(wet);
    wet.connect(reverbSend);
    osc.start(now(at));
    osc.stop(now(at) + hold + 2.6);
    bedNodes.push(osc);
    return osc;
  }

  function bedStep(index) {
    if (!bedOn || !ctx) return;
    const chord = BED_CHORDS[index % BED_CHORDS.length];
    for (const freq of chord) bedVoice(freq, 0, 6, 0.035, 'triangle');
    // One note on top, landing somewhere different each time.
    const note = BED_NOTES[Math.floor(Math.random() * BED_NOTES.length)];
    bedVoice(note, 1.2 + Math.random() * 2, 0.4, 0.028, 'sine');
    bedTimers.push(setTimeout(() => bedStep(index + 1), 8200));
  }

  function stopBed() {
    bedOn = false;
    bedTimers.forEach(clearTimeout);
    bedTimers = [];
    if (bedGain && ctx) {
      bedGain.gain.cancelScheduledValues(ctx.currentTime);
      bedGain.gain.setValueAtTime(bedGain.gain.value, ctx.currentTime);
      bedGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    }
    const going = bedNodes;
    bedNodes = [];
    setTimeout(() => going.forEach((n) => { try { n.stop(); } catch { /* already done */ } }), 1400);
  }

  return {
    get enabled() { return enabled; },

    setEnabled(on) {
      enabled = !!on;
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
      if (enabled) live();
      else stopBed();
    },

    /**
     * Music while the room fills up. Idempotent — the TV calls this on every
     * state update and it only acts on a change.
     */
    lobby(on) {
      if (on) {
        if (bedOn || !live()) return;
        bedOn = true;
        bedGain = ctx.createGain();
        bedGain.gain.value = 0.0001;
        bedGain.connect(master);
        bedGain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2.5);
        bedStep(0);
      } else if (bedOn) {
        stopBed();
      }
    },

    /** Called from a real gesture, to get past the autoplay policy. */
    unlock() { live(); },

    /** Anything advancing on screen. Barely there on purpose. */
    click() {
      if (!live()) return;
      transient(0, 0.09, 2400, 3, 0.035);
    },

    /** A wheel passing a detent. Quieter still — this can fire many times a second. */
    tick(urgency = 0) {
      if (!live()) return;
      const level = Math.max(0, Math.min(1, urgency));
      transient(0, 0.035 + level * 0.075, 3600 + level * 900, 6, 0.018 + level * 0.025);
    },

    /** The final-ten-seconds clock: a real, room-readable beat rather than a UI detent. */
    countdownTick(seconds) {
      if (!live()) return;
      const urgency = Math.max(0, Math.min(1, (10 - seconds) / 9));
      transient(0, 0.095 + urgency * 0.045, 1550 + urgency * 260, 3.2, 0.055);
      tone(740 + urgency * 90, 0, 0.12, 0.035 + urgency * 0.02, 'square', 0.12);
      if (seconds <= 3) tone(1180, 0.035, 0.13, 0.03, 'sine', 0.22);
    },

    /**
     * A pin landing. `index` walks the scale so a room submitting together
     * builds a chord rather than a stutter.
     */
    plink(index) {
      if (!live()) return;
      const freq = SCALE[(index || 0) % SCALE.length];
      transient(0, 0.05, freq * 2, 4, 0.02);
      tone(freq, 0, 0.42, 0.16, 'triangle', 0.5);
      tone(freq * 2.01, 0, 0.2, 0.05, 'sine', 0.3);
    },

    /** Phones are open. A soft two-note lift, the room's cue to look down. */
    open() {
      if (!live()) return;
      tone(523.25, 0, 0.3, 0.1, 'sine', 0.4);
      tone(783.99, 0.09, 0.42, 0.1, 'sine', 0.5);
    },

    /**
     * The reveal, one step at a time — the 3×3, then each ring. Called with
     * step 0,1,2,3 as the TV walks outward, so the figure rises with the
     * animation instead of playing over it.
     */
    chime(step) {
      if (!live()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const freq = notes[Math.min(step || 0, notes.length - 1)];
      tone(freq, 0, 0.9, 0.13, 'sine', 0.85);
      tone(freq * 1.5, 0.02, 0.6, 0.045, 'sine', 0.6);
    },

    /**
     * A player's points landing on the tally. Walks up the scale as the board
     * counts down the standings, so a long tally builds instead of repeating.
     */
    tally(index, points) {
      if (!live()) return;
      const step = SCALE[Math.min(index || 0, SCALE.length - 1)];
      transient(0, 0.05, step * 1.5, 5, 0.03);
      tone(step, 0, 0.5, 0.13, 'triangle', 0.55);
      // More points, more of the chord.
      if (points >= 2) tone(step * 1.26, 0.05, 0.45, 0.07, 'sine', 0.5);
      if (points >= 3) tone(step * 1.5, 0.1, 0.55, 0.07, 'sine', 0.6);
    },

    /** Somebody was inside the 3×3. One warm chord, no fanfare. */
    bullseye() {
      if (!live()) return;
      [392.0, 493.88, 587.33, 783.99].forEach((freq, i) => {
        tone(freq, i * 0.035, 1.3, 0.1, 'triangle', 0.9);
      });
    },

    /**
     * The game is over.
     *
     * The one place this game stops whispering. A run up the scale, the chord
     * it was climbing toward held underneath, a low swell so it lands rather
     * than merely sparkles, and a scatter of high partials on top — timed to
     * arrive with the wave crossing the board.
     */
    win() {
      if (!live()) return;

      // The climb.
      [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((freq, i) => {
        tone(freq, i * 0.07, 0.85, 0.1, 'triangle', 0.8);
      });

      // The chord it was climbing to, held.
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(freq, 0.46 + i * 0.014, 2.8, 0.105, 'sine', 1);
      });

      // Weight underneath.
      tone(130.81, 0.42, 2.6, 0.13, 'triangle', 0.45);
      tone(196.0, 0.42, 2.6, 0.085, 'sine', 0.45);

      // Air above.
      for (let i = 0; i < 8; i++) {
        tone(2093 + Math.random() * 1100, 0.48 + i * 0.085, 0.75, 0.028, 'sine', 1);
      }

      transient(0.42, 0.075, 1500, 1.1, 0.8);
    },
  };
})();
