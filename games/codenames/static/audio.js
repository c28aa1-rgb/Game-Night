/**
 * Safelight audio.
 *
 * Every sound here is synthesized at runtime with the Web Audio API. There are
 * no .mp3/.wav files to host, no CDN to wait on, and nothing to license — which
 * also means zero added latency on a slow connection.
 */

let ctx = null;
let master = null;
let noiseBuffer = null;

// The board always starts with sound on. Muting is deliberately not persisted:
// this screen is usually a shared TV, and someone silencing it one evening
// shouldn't leave the next game silent with no obvious reason why.
let muted = false;
const listeners = new Set();

function ensureContext() {
  if (ctx) {
    return ctx;
  }

  const Ctor = window.AudioContext || window.webkitAudioContext;

  if (!Ctor) {
    return null;
  }

  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  // 2 seconds of white noise, reused by every percussive/explosive layer.
  const frames = Math.floor(ctx.sampleRate * 2);
  noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let i = 0; i < frames; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  return ctx;
}

/** Browsers keep the context suspended until a real user gesture. */
export function unlockAudio() {
  const context = ensureContext();

  if (context && context.state === "suspended") {
    context.resume().catch(() => {});
  }
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;

  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  }

  listeners.forEach((fn) => fn(muted));
  return muted;
}

export function onMuteChange(fn) {
  listeners.add(fn);
  fn(muted);
}

function now(delay = 0) {
  return ctx.currentTime + delay;
}

function panner(pan) {
  if (!pan || typeof ctx.createStereoPanner !== "function") {
    return null;
  }

  const node = ctx.createStereoPanner();
  node.pan.value = Math.max(-1, Math.min(1, pan));
  return node;
}

function chain(source, nodes, bus = master) {
  let tail = source;

  for (const node of nodes) {
    if (node) {
      tail.connect(node);
      tail = node;
    }
  }

  tail.connect(bus);
}

let shotBus = null;

/**
 * A limiter reserved for the gunshot alone.
 *
 * Every other sound in the kit stays on the plain `master` gain node — this
 * exists only because the shot is deliberately mixed hot enough to need one.
 * Putting the limiter on `master` instead was tried first and rejected: it
 * measurably quietened sounds that never came near its threshold (the card
 * flip's peak dropped ~30% for no audible reason), because a
 * DynamicsCompressorNode carries its own channel handling and makeup-gain
 * behavior that colors everything routed through it, not just the peaks it
 * actually catches. Scoping it to one bus keeps that side effect contained
 * to the one sound that asked for it.
 */
function ensureShotBus() {
  if (shotBus) {
    return shotBus;
  }

  // Fast attack, and just as important, a fast release: a slow one (a
  // typical mastering-limiter value) let the gain reduction triggered by
  // the initial crack still be in effect when the later body and reverb
  // layers arrived a few tens of ms later, ducking the entire shot instead
  // of just catching its one loud instant.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -0.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.0005;
  limiter.release.value = 0.015;

  // A hard mathematical ceiling behind the limiter, not a second attempt at
  // the same job. A compressor's attack, however fast, still has to react to
  // a transient after it starts — the 12ms crack is short enough to punch
  // partway through before the gain reduction catches up, which is what let
  // pushed-up gains through as real overs during tuning. tanh has no such
  // reaction time: it cannot output past ±1 no matter what arrives, so
  // everything downstream of it is safe by construction. Its slope through
  // the origin (~k) is also what makes the shot louder overall — this is
  // most of where the loudness increase actually comes from, not the raw
  // per-layer gains above. Measured offline against 15+ randomized
  // noise/offset draws, the composite peak lands at a consistent 0.9 (the
  // curve's own ceiling times master's 0.9), a fraction of a dB of headroom
  // under true clipping, while only the last ~0.1% of samples in a shot
  // ever reach that ceiling — the crack's tip, not the whole sound.
  const drive = ctx.createWaveShaper();
  const steps = 4096;
  const k = 3;
  const norm = Math.tanh(k);
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const x = (i / (steps - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  drive.curve = curve;
  // Oversampling is normally good practice on a waveshaper — it filters
  // aliasing from the new harmonics the curve introduces — but Chromium's
  // interpolation filter overshoots past the curve's own bound right at the
  // saturation knee, which is exactly the ceiling this node exists to
  // guarantee. Measured: "4x" let true peaks reach 1.22; "none" held them at
  // exactly 0.9 every time.
  drive.oversample = "none";

  limiter.connect(drive);
  drive.connect(master);

  shotBus = limiter;
  return shotBus;
}

/** Filtered noise burst — the basis of clicks, riffles and explosions. */
function burst({
  duration = 0.1,
  type = "bandpass",
  from = 3000,
  to = 800,
  q = 1,
  gain = 0.3,
  attack = 0.002,
  delay = 0,
  pan = 0,
  curve = "exp",
  bus = null
} = {}) {
  if (!ensureContext()) {
    return;
  }

  try {
  const start = now(delay);
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.playbackRate.value = 1;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);

  if (curve === "exp") {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  } else {
    filter.frequency.linearRampToValueAtTime(Math.max(40, to), start + duration);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  chain(source, [filter, amp, panner(pan)], bus || master);

  const offset = Math.random() * 1.5;
  source.start(start, offset, duration + 0.05);
  source.stop(start + duration + 0.05);
  } catch (error) {
    // Audio is decoration. It must never take a game action down with it.
  }
}

/** Pitched oscillator with an optional glide. */
function tone({
  freq = 440,
  freqEnd = null,
  type = "sine",
  duration = 0.25,
  gain = 0.18,
  attack = 0.006,
  delay = 0,
  pan = 0,
  detune = 0,
  bus = null
} = {}) {
  if (!ensureContext()) {
    return;
  }

  try {
  const start = now(delay);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, start);

  if (freqEnd && freqEnd !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + duration);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  chain(osc, [amp, panner(pan)], bus || master);

  osc.start(start);
  osc.stop(start + duration + 0.02);
  } catch (error) {
    // As above: never let a synth failure surface as a dead button.
  }
}

/* ── The kit ──────────────────────────────────────────────── */

/** Card turning over: a paper riffle plus a shutter click. */
export function playFlip(pan = 0) {
  burst({ duration: 0.085, from: 4200, to: 900, q: 0.9, gain: 0.16, pan });
  burst({ duration: 0.02, type: "highpass", from: 2200, to: 2200, gain: 0.1, delay: 0.055, pan });
}

/**
 * A card resolving to one side's colour. Red sits lower than blue.
 *
 * `streak` is how many of that side's own cards have come up in a row, and it
 * walks the note up a major pentatonic scale — so a run of nine climbs
 * steadily and never lands on a sour note, however far it gets. The layers
 * underneath only exist once a run is going and grow with it: a shimmer an
 * octave up arriving late, a glide underneath reaching for the next one, and
 * a little more brightness on the flip each time.
 *
 * The point is that the third correct card in a row should *sound* like the
 * third, so a table can hear a run building without watching the counter.
 */
export function playRevealTeam(team, pan = 0, streak = 1) {
  const root = team === "red" ? 261.63 : 329.63;

  // Pentatonic degrees in semitones. Nine entries because nine cards is the
  // most a side can ever have, so the ladder can never run out underneath us.
  const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const n = Math.max(1, Math.min(streak, STEPS.length));
  const freq = root * Math.pow(2, STEPS[n - 1] / 12);
  const lift = (n - 1) / (STEPS.length - 1);

  playFlip(pan);
  tone({ freq, type: "triangle", duration: 0.34, gain: 0.15, delay: 0.07, pan });
  tone({ freq: freq * 1.5, type: "sine", duration: 0.42, gain: 0.11, delay: 0.11, pan });

  // A single card is just a card — no run to report yet.
  if (n === 1) {
    return;
  }

  tone({ freq: freq * 2, type: "sine", duration: 0.3 + lift * 0.3, gain: 0.03 + lift * 0.05, delay: 0.17, pan });
  tone({
    freq: freq * 0.5,
    freqEnd: freq * 0.75,
    type: "triangle",
    duration: 0.3,
    gain: 0.05 + lift * 0.06,
    delay: 0.09,
    pan
  });
  burst({
    duration: 0.05,
    type: "highpass",
    from: 4000 + lift * 3000,
    to: 3000,
    gain: 0.02 + lift * 0.05,
    delay: 0.06,
    pan
  });
}

/** A bystander: dull, over immediately, faintly disappointing. */
export function playRevealNeutral(pan = 0) {
  playFlip(pan);
  tone({ freq: 168, freqEnd: 120, type: "sine", duration: 0.2, gain: 0.2, delay: 0.06, pan });
  burst({ duration: 0.11, type: "lowpass", from: 900, to: 200, gain: 0.12, delay: 0.06, pan });
}

/**
 * One shot, unsuppressed.
 *
 * What makes a gunshot read as a gunshot is the crack, not the volume: a
 * near-instant broadband transient, then a bright report that collapses to
 * nothing in a quarter second, then the room throwing it back. Layered in
 * that order — snap, blast, body, slap — because a loud low thump alone is
 * a door slamming, and brightness is what separates the two.
 */
export function playGunshot(shot = 0, pan = 0) {
  if (!ensureContext()) {
    return;
  }

  // Each shot is the same weapon, so they differ only as much as two pulls
  // of the same trigger do.
  const drift = 1 + shot * 0.03;
  const bus = ensureShotBus();

  // The crack, then the report a few milliseconds behind it. The stagger is
  // both truer — the snap does arrive first — and what keeps the layers from
  // stacking into a peak that would otherwise need clipping to tame. Run
  // through the shot's own limited bus, so these can be mixed hot without
  // turning into distortion.
  burst({ duration: 0.012, type: "highpass", from: 7200, to: 6000, gain: 0.72, attack: 0.0004, pan, bus });
  burst({ duration: 0.26, type: "lowpass", from: 11000, to: 380, q: 0.6, gain: 0.75, attack: 0.001, delay: 0.005, pan, bus });
  // Body — the part you feel rather than hear.
  tone({ freq: 188 * drift, freqEnd: 44, type: "sine", duration: 0.24, gain: 0.62, attack: 0.001, delay: 0.008, pan, bus });
  tone({ freq: 94 * drift, freqEnd: 31, type: "triangle", duration: 0.32, gain: 0.27, attack: 0.002, delay: 0.013, pan, bus });
  // The shot coming back off the walls.
  burst({ duration: 0.46, type: "bandpass", from: 1900, to: 300, q: 0.5, gain: 0.22, delay: 0.042, pan, bus });
  burst({ duration: 0.66, type: "lowpass", from: 950, to: 120, q: 0.5, gain: 0.15, delay: 0.105, pan, bus });
  // The action cycling, now barely audible under all of that.
  burst({ duration: 0.05, type: "highpass", from: 3900, to: 2500, gain: 0.1, delay: 0.085, pan, bus });
}

/** After the third shot: the room ringing, then settling. */
export function playExecutionTail(pan = 0) {
  tone({ freq: 74, freqEnd: 31, type: "sine", duration: 2.6, gain: 0.19, delay: 0.06, pan });
  tone({ freq: 110, type: "sawtooth", duration: 2.2, gain: 0.042, delay: 0.1, detune: -13 });
  tone({ freq: 110, type: "sawtooth", duration: 2.2, gain: 0.042, delay: 0.1, detune: 10 });
  burst({ duration: 1.1, type: "bandpass", from: 3200, to: 900, q: 0.6, gain: 0.06, delay: 0.05, pan });
  burst({ duration: 1.5, type: "lowpass", from: 520, to: 60, q: 0.5, gain: 0.085, delay: 0.12 });
}

/** The card giving up its identity — a slow swell, not an impact. */
export function playDevelop(pan = 0) {
  tone({ freq: 57, freqEnd: 40, type: "sine", duration: 1.3, gain: 0.21, attack: 0.09, pan });
  burst({ duration: 0.75, type: "lowpass", from: 850, to: 85, q: 0.6, gain: 0.1, attack: 0.06, pan });
}

/** Counter stepping down. Tightens as a side runs out of agents. */
export function playTick(remaining = 9) {
  const freq = 640 + Math.max(0, 9 - remaining) * 62;
  tone({ freq, type: "square", duration: 0.05, gain: 0.055, attack: 0.001 });
}

/**
 * One agent left.
 *
 * Deliberately not a fanfare — being one card away cuts both ways, since the
 * other side is about to get a turn too. So: a tritone, the least resolved
 * interval there is, low and slow to arrive, hanging rather than landing. It
 * sits an octave under that side's reveal tone so it reads as the same voice
 * gone serious, and it plays once on the way down, never on a loop.
 */
export function playLastAgent(team) {
  const root = team === "red" ? 130.81 : 164.81; // C3 / E3

  tone({ freq: root, type: "triangle", duration: 1.1, gain: 0.13, attack: 0.12 });
  tone({ freq: root * Math.SQRT2, type: "sine", duration: 1, gain: 0.075, attack: 0.16, delay: 0.05 });
  tone({ freq: root / 2, type: "sine", duration: 1.4, gain: 0.1, attack: 0.2 });
  burst({ duration: 0.9, type: "lowpass", from: 700, to: 140, q: 0.7, gain: 0.05, attack: 0.25 });
}

/** Both spymasters seated. A soft two-note rise — the board is ready, and
 *  nobody had to be told. */
export function playReady() {
  // Pitched a little above the other cues: this one has to carry across a
  // room to a board nobody is standing next to.
  tone({ freq: 392, type: "triangle", duration: 0.22, gain: 0.11, attack: 0.012 });
  tone({ freq: 587.33, type: "triangle", duration: 0.34, gain: 0.1, delay: 0.13, attack: 0.012 });
  tone({ freq: 783.99, type: "sine", duration: 0.42, gain: 0.06, delay: 0.13, attack: 0.02 });
}

/**
 * The shuffle, before the deal.
 *
 * Paced as an actual shuffle rather than one quick rustle: the deck tapped
 * square, a beat of nothing, then three riffle passes, then squared again as
 * the first card goes out. The timings here are the same beats the deck
 * animation moves on — DEAL_LEAD_MS in app.js is the shared clock, and the
 * final tap sits just inside it so the deal lands on the square-up.
 *
 * Riffles alternate across the stereo field, which is what stops three passes
 * of the same noise reading as one long undifferentiated rustle.
 */
export function playShuffle() {
  if (!ensureContext()) {
    return;
  }

  // Gathering: two soft taps, then a beat before any work starts.
  burst({ duration: 0.05, type: "lowpass", from: 1800, to: 420, q: 0.8, gain: 0.05, delay: 0.06 });
  burst({ duration: 0.05, type: "lowpass", from: 1600, to: 380, q: 0.8, gain: 0.045, delay: 0.21 });

  [0.52, 1.12, 1.7].forEach((at, pass) => {
    const edges = 18;
    const side = pass % 2 ? 1 : -1;

    for (let i = 0; i < edges; i += 1) {
      burst({
        duration: 0.022,
        type: "bandpass",
        from: 2300 + Math.random() * 1900,
        to: 820,
        q: 1.8,
        gain: 0.038,
        delay: at + i * 0.0155 + Math.random() * 0.005,
        pan: side * (0.1 + Math.random() * 0.2)
      });
    }

    // The two halves pushed back together at the end of the pass.
    burst({
      duration: 0.07,
      type: "lowpass",
      from: 1400,
      to: 340,
      q: 0.9,
      gain: 0.05,
      delay: at + edges * 0.0155 + 0.02
    });
  });

  // Squared on the table, right before the first card is dealt.
  burst({ duration: 0.11, type: "lowpass", from: 1500, to: 300, q: 0.9, gain: 0.075, delay: 2.24 });
}

/** The board dealing in: 25 short riffles, panned across the grid. `lead`
 *  offsets the whole run so it can sit behind playShuffle(). */
export function playDeal(count = 25, columns = 5, lead = 0) {
  if (!ensureContext()) {
    return;
  }

  for (let i = 0; i < count; i += 1) {
    const column = i % columns;
    const pan = (column / Math.max(1, columns - 1)) * 1.4 - 0.7;
    burst({
      duration: 0.045,
      from: 3600,
      to: 1100,
      q: 1.1,
      gain: 0.07,
      delay: lead + i * 0.032,
      pan
    });
  }

  tone({ freq: 130, freqEnd: 320, type: "triangle", duration: 0.9, gain: 0.08, delay: lead + 0.05 });
}

/** Every remaining card turning at once, at the end of a round. */
export function playCascade(count = 12) {
  for (let i = 0; i < count; i += 1) {
    burst({ duration: 0.05, from: 3200, to: 950, gain: 0.055, delay: i * 0.045, pan: Math.random() * 1.2 - 0.6 });
  }
}

/**
 * A team wins outright — the whole point of the game, so it gets the loudest
 * moment in the mix. A rising swell, a full chord landing together (not
 * arpeggiated like the old version), a brass-like stab on top, and a
 * scattering of confetti-pop transients timed under the visual burst.
 */
export function playVictory(team) {
  const root = team === "red" ? 261.63 : 293.66; // C4 for red, D4 for blue
  const landAt = 0.42;

  // The anticipation swell: filtered noise sweeping upward into the chord hit.
  burst({ duration: landAt + 0.06, type: "bandpass", from: 300, to: 4200, q: 0.7, gain: 0.22, attack: 0.05 });
  tone({ freq: root / 2, freqEnd: root, type: "sine", duration: landAt + 0.05, gain: 0.14, attack: 0.05 });

  // The chord itself: root, major third, fifth, octave, all landing together.
  [1, 1.25, 1.5, 2].forEach((ratio) => {
    tone({ freq: root * ratio, type: "triangle", duration: 1.3, gain: 0.17, delay: landAt, attack: 0.015 });
    tone({ freq: root * ratio * 2, type: "sine", duration: 1.1, gain: 0.07, delay: landAt, attack: 0.015 });
  });

  // A pair of detuned brass-like stabs for weight on the downbeat.
  [-7, 7].forEach((detune) => {
    tone({ freq: root * 2, type: "sawtooth", duration: 0.55, gain: 0.045, delay: landAt, detune, attack: 0.01 });
  });

  // A second, higher chord echoing the first — the "and stays won" beat.
  [1, 1.5, 2].forEach((ratio) => {
    tone({ freq: root * ratio * 2, type: "triangle", duration: 0.7, gain: 0.09, delay: landAt + 0.55, attack: 0.02 });
  });

  // Confetti pops, scattered across the stereo field under the chord.
  for (let i = 0; i < 14; i += 1) {
    burst({
      duration: 0.045,
      type: "bandpass",
      from: 5200,
      to: 2200,
      q: 1.2,
      gain: 0.05,
      delay: landAt + 0.1 + i * 0.085 + Math.random() * 0.05,
      pan: Math.random() * 1.7 - 0.85
    });
  }
}

export function playUi() {
  tone({ freq: 1180, type: "triangle", duration: 0.035, gain: 0.035, attack: 0.001 });
}

export function playJoin() {
  tone({ freq: 523.25, type: "triangle", duration: 0.16, gain: 0.09 });
  tone({ freq: 783.99, type: "sine", duration: 0.24, gain: 0.07, delay: 0.08 });
}

export function playError() {
  tone({ freq: 200, freqEnd: 150, type: "square", duration: 0.16, gain: 0.07 });
}
