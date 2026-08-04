/* ═══════════════════════════════════════════════════════════
   DRAFT NIGHT — sound
   Theme spec: theme/draft-night.md

   Everything is synthesised on the fly. No audio files, so the game
   stays a three-file static bundle and nothing has to load before the
   first spin.

   Two rules govern this file:
     · Browsers refuse to start audio until the user has interacted, so
       the context is built lazily on the first real gesture — never at
       load.
     · The wheel is the loudest thing here. Every other sound is mixed
       under it so a whole draft does not become fatiguing.
   ═══════════════════════════════════════════════════════════ */

window.SFX = (() => {
  const KEY = 'draftnight.sound';

  let ctx = null;
  let bus = null;         // everything lands here, then the compressor
  let noise = null;       // one second of white noise, reused everywhere
  let enabled = localStorage.getItem(KEY) !== 'off';

  /* ── plumbing ───────────────────────────────────────────── */

  function build() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();

    // Keeps a fast run of wheel ticks from stacking into a wall of noise.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;

    bus = ctx.createGain();
    bus.gain.value = 0.85;
    bus.connect(comp);
    comp.connect(ctx.destination);

    const frames = ctx.sampleRate;
    noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  /** Returns the context if sound is on and usable, otherwise null. */
  function live() {
    if (!enabled) return null;
    if (!ctx && !build()) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const now = (at) => ctx.currentTime + (at || 0);

  /**
   * Wheel ticks are scheduled ahead of time, so they need their own channel
   * that can be cut if the spin is abandoned. Everything else goes to the bus.
   */
  let ticks = null;
  function tickChannel() {
    if (!ticks) {
      ticks = ctx.createGain();
      ticks.gain.value = 1;
      ticks.connect(bus);
    }
    return ticks;
  }

  /** A gain node shaped like a struck object: instant on, ringing down. */
  function env(peak, at, attack, decay, dest) {
    const g = ctx.createGain();
    const t = now(at);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest || bus);
    return { g, t, end: t + attack + decay };
  }

  function tone(type, freq, peak, at, attack, decay, detune, dest) {
    const { g, t, end } = env(peak, at, attack, decay, dest);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(g);
    o.start(t);
    o.stop(end + 0.02);
    return o;
  }

  /** Noise through a filter — the basis of every tick, thud and whoosh. */
  function hiss(peak, at, attack, decay, filter, dest) {
    const { g, t, end } = env(peak, at, attack, decay, dest);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'bandpass';
    f.frequency.setValueAtTime(filter.from, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, end);
    f.Q.value = filter.q == null ? 1 : filter.q;
    src.connect(f);
    f.connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(end + 0.02);
  }

  /* ── the wheel ──────────────────────────────────────────── */

  /**
   * One ratchet click, as a segment edge passes the pointer.
   * `speed` (0–1) is how fast the wheel is going: quick clicks are
   * brighter and quieter, the slow ones at the end are fat and loud so
   * the wheel audibly runs out of steam.
   */
  function tick(speed = 0.5, at = 0) {
    if (!live()) return;
    const s = Math.min(1, Math.max(0, speed));
    const bright = 1400 + s * 2300;
    const dest = tickChannel();
    // A narrow bandpass throws most of the noise away, so these peaks are much
    // higher than the numbers elsewhere in this file — measured, not guessed.
    hiss(0.62 - s * 0.22, at, 0.001, 0.028 + (1 - s) * 0.05, { from: bright, q: 3.2 }, dest);
    tone('triangle', 190 + (1 - s) * 60, 0.14 + (1 - s) * 0.08, at, 0.001, 0.05, 0, dest);
  }

  /** Drops every tick still queued — the spin was abandoned. */
  function stopTicks() {
    if (!ticks) return;
    ticks.disconnect();
    ticks = null;
  }

  /** The pointer dropping into the winning segment. */
  function clunk() {
    if (!live()) return;
    tone('sine', 96, 0.5, 0, 0.002, 0.28);
    tone('triangle', 300, 0.16, 0.01, 0.002, 0.16);
    hiss(0.2, 0, 0.001, 0.1, { type: 'lowpass', from: 1800, to: 400, q: 1 });
  }

  /* ── broadcast ──────────────────────────────────────────── */

  /** Root notes per team, so each team's stings sit in its own register. */
  const TEAM_ROOT = [174.61, 220, 261.63, 329.63];   // F3, A3, C4, E4

  function chord(root, peak, at, decay, type = 'sawtooth') {
    const { g, t, end } = env(peak, at, 0.012, decay);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.09);
    f.Q.value = 0.7;
    f.connect(g);
    for (const [mult, cents] of [[1, -6], [1.5, 0], [2, 7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(root * mult, t);
      o.detune.setValueAtTime(cents, t);
      o.connect(f);
      o.start(t);
      o.stop(end + 0.02);
    }
  }

  /** Air moving — used under page changes and the reveal card. */
  function whoosh(rising = true, peak = 0.5) {
    if (!live()) return;
    hiss(peak, 0, 0.05, 0.3,
      rising ? { from: 320, to: 2200, q: 0.9 } : { from: 2200, to: 320, q: 0.9 });
  }

  /* ── the public set ─────────────────────────────────────── */

  const api = {
    get enabled() { return enabled; },

    /** Called from the first gesture so the context is warm before the draft. */
    prime() { live(); },

    toggle() {
      enabled = !enabled;
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
      if (enabled) { live(); api.click(); }
      return enabled;
    },

    tick,
    stopTicks,
    clunk,
    whoosh,

    /** Generic button press. */
    click() {
      if (!live()) return;
      hiss(0.1, 0, 0.001, 0.03, { from: 2600, q: 2 });
      tone('square', 520, 0.05, 0, 0.001, 0.04);
    },

    /** A name lands on the sheet — a typewriter strike. */
    add() {
      if (!live()) return;
      hiss(0.12, 0, 0.001, 0.035, { from: 3000, q: 2.4 });
      tone('square', 880, 0.06, 0, 0.001, 0.05);
    },

    /** A name comes off the sheet. */
    remove() {
      if (!live()) return;
      const { g, t, end } = env(0.14, 0, 0.002, 0.16);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(110, end);
      o.connect(g);
      o.start(t);
      o.stop(end + 0.02);
    },

    /** Team count changes — a detented switch. */
    detent() {
      if (!live()) return;
      hiss(0.13, 0, 0.001, 0.026, { from: 2000, q: 3 });
      tone('triangle', 660, 0.08, 0, 0.001, 0.05);
    },

    /** The draft opens. The page change supplies the whoosh under this. */
    start() {
      if (!live()) return;
      chord(130.81, 0.16, 0.05, 0.5);
      chord(196, 0.14, 0.22, 0.65);
    },

    /** A team is put on the clock. */
    onClock(team) {
      if (!live()) return;
      tone('triangle', TEAM_ROOT[team % 4] * 2, 0.09, 0, 0.004, 0.18);
    },

    /** The lower-third arrives with the drafted name. */
    reveal(team) {
      if (!live()) return;
      whoosh(true, 0.42);
      chord(TEAM_ROOT[team % 4], 0.17, 0.04, 0.55);
    },

    /** The card lands in its slot. */
    lock(team) {
      if (!live()) return;
      tone('sine', 120, 0.34, 0, 0.002, 0.18);
      tone('square', TEAM_ROOT[team % 4] * 3, 0.07, 0.01, 0.001, 0.09);
      hiss(0.12, 0, 0.001, 0.06, { type: 'lowpass', from: 1400, to: 500, q: 1 });
    },

    /** Every slot is full. */
    complete() {
      if (!live()) return;
      chord(130.81, 0.15, 0.06, 0.42);
      chord(174.61, 0.15, 0.28, 0.42);
      chord(196, 0.18, 0.5, 1.0);
      hiss(0.34, 0.5, 0.02, 0.9, { from: 4200, to: 1200, q: 0.8 });
    },

    /** Small confirmation, e.g. teams copied. */
    blip() {
      if (!live()) return;
      tone('sine', 880, 0.08, 0, 0.002, 0.07);
      tone('sine', 1320, 0.07, 0.06, 0.002, 0.1);
    },

    /** Something was refused. */
    nope() {
      if (!live()) return;
      tone('square', 160, 0.1, 0, 0.002, 0.1);
      tone('square', 120, 0.1, 0.07, 0.002, 0.14);
    },
  };

  return api;
})();
