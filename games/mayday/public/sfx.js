/**
 * MAYDAY — sound.
 *
 * Synthesised on the fly, like Draft Night's: no audio files, nothing to load
 * before the first alarm.
 *
 * Three layers, mixed deliberately:
 *
 *   bed     the ship itself — a drone under the night, a pulse under the day.
 *           Always the quietest thing playing, and it ducks under the narrator
 *           rather than stopping, because a room that goes completely silent
 *           between lines feels broken rather than tense.
 *   one-shots
 *           doors, gunshots, ballots, decompression. These carry the events.
 *   klaxon  the alarm, which is the loudest thing here and is killed outright
 *           the instant the narrator opens their mouth.
 *
 * TV only. Phones make no noise.
 */

window.MaydaySFX = (() => {
  const KEY = 'mayday.sound';

  let ctx = null;
  let master = null;
  let bedBus = null;
  let noise = null;
  let enabled = localStorage.getItem(KEY) !== 'off';
  /** One-shots currently sounding, so cut() can stop all of them. */
  let voices = [];

  // Ambience state.
  let bedKind = null;
  let bedNodes = [];
  let bedTimers = [];
  let bedSwap = null;
  let bedLevel = 0.6;
  let ducked = false;
  let intensity = 0;

  let musicBus = null;
  let reverbSend = null;
  /** True while the opening's score is running, which changes how cut() behaves. */
  let scoring = false;

  function build() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    comp.connect(ctx.destination);

    bedBus = ctx.createGain();
    bedBus.gain.value = 0.0001;
    bedBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0001;
    musicBus.connect(master);

    const frames = ctx.sampleRate;
    noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    /*
     * A room for all this to happen in.
     *
     * The single biggest difference between "synthesised beeps" and something
     * that sounds like it was recorded somewhere is reverb, and a convolver
     * needs no audio file — an impulse response is just noise with an
     * exponential decay, which is exactly what a big metal room does to a
     * sound. Everything cinematic sends a little signal here in parallel.
     */
    const seconds = 2.8;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const tail = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // A little pre-delay, then a long metallic decay.
        const gate = i < ctx.sampleRate * 0.012 ? 0 : 1;
        tail[i] = gate * (Math.random() * 2 - 1) * (1 - t) ** 2.6;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
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

  function track(node, end) {
    voices.push({ node, end });
    if (voices.length > 80) voices = voices.filter((v) => v.end > ctx.currentTime);
  }

  /** A gain shaped like a struck object: instant on, ringing down. */
  function env(peak, at, attack, decay, dest, wet = 0) {
    const g = ctx.createGain();
    const t = now(at);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest || master);
    if (wet > 0 && reverbSend) {
      const send = ctx.createGain();
      send.gain.value = wet;
      g.connect(send);
      send.connect(reverbSend);
    }
    return { g, t, end: t + attack + decay };
  }

  function tone(type, freq, peak, at, attack, decay, glideTo, dest, wet) {
    const { g, t, end } = env(peak, at, attack, decay, dest, wet);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, end);
    o.connect(g);
    o.start(t);
    o.stop(end + 0.02);
    track(o, end);
    return o;
  }

  function hiss(peak, at, attack, decay, filter, dest, wet) {
    const { g, t, end } = env(peak, at, attack, decay, dest, wet);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    if (filter.rate) src.playbackRate.value = filter.rate;
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'bandpass';
    f.frequency.setValueAtTime(filter.from, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, end);
    f.Q.value = filter.q == null ? 1 : filter.q;
    src.connect(f);
    f.connect(g);
    src.start(t, Math.random() * 0.4);
    src.stop(end + 0.02);
    track(src, end);
  }

  // ---------------------------------------------------------------------------
  // Ambience
  // ---------------------------------------------------------------------------

  function stopBed() {
    for (const node of bedNodes) {
      try { node.stop ? node.stop() : node.disconnect(); } catch { /* already gone */ }
    }
    bedNodes = [];
    for (const id of bedTimers) clearTimeout(id);
    bedTimers = [];
  }

  /** Schedule a repeating ambient event whose spacing can drift with intensity. */
  function every(minMs, maxMs, fire) {
    const run = () => {
      fire();
      const span = maxMs - minMs;
      const wait = minMs + Math.random() * span * (1 - intensity * 0.5);
      bedTimers.push(setTimeout(run, wait));
    };
    bedTimers.push(setTimeout(run, minMs * (0.4 + Math.random() * 0.6)));
  }

  /** A continuous oscillator that belongs to the bed rather than to an event. */
  function drone(type, freq, gain, dest, detune = 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.value = gain;
    o.connect(g);
    g.connect(dest || bedBus);
    o.start();
    bedNodes.push(o);
    return { o, g };
  }

  function droneNoise(gain, filterType, freq, q, dest) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(dest || bedBus);
    src.start();
    bedNodes.push(src);
    return { src, f, g };
  }

  function buildBed(kind) {
    if (!live()) return;

    if (kind === 'night') {
      bedLevel = 0.7;
      drone('sine', 44, 0.5);
      drone('sawtooth', 88, 0.05);
      const air = droneNoise(0.05, 'lowpass', 320, 0.7);
      // The hull, breathing.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.08;
      depth.gain.value = 120;
      lfo.connect(depth);
      depth.connect(air.f.frequency);
      lfo.start();
      bedNodes.push(lfo);
      // Something scanning, somewhere else on the ship.
      every(5200, 9000, () => {
        tone('sine', 1180, 0.05, 0, 0.005, 0.5, null, bedBus);
        tone('sine', 1180, 0.03, 0.34, 0.005, 0.7, null, bedBus);
      });
      every(9000, 17000, () => {
        hiss(0.05, 0, 0.3, 1.4, { type: 'bandpass', from: 180, to: 90, q: 4 }, bedBus);
      });
      return;
    }

    if (kind === 'day') {
      bedLevel = 0.55;
      drone('sine', 62, 0.24);
      droneNoise(0.035, 'lowpass', 900, 0.6);
      // A clock the room can feel but not quite hear.
      every(1500, 1900, () => {
        tone('sine', 88, 0.22, 0, 0.004, 0.16, null, bedBus);
        hiss(0.03, 0, 0.002, 0.05, { from: 2400, q: 3 }, bedBus);
      });
      return;
    }

    if (kind === 'vote') {
      bedLevel = 0.75;
      drone('sine', 58, 0.28);
      const tension = drone('sawtooth', 116, 0.035);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      tension.g.disconnect();
      tension.g.connect(filter);
      filter.connect(bedBus);
      bedNodes.push(filter);
      // A ballot clock, faster than the day's.
      every(820, 980, () => {
        tone('square', 1450, 0.035, 0, 0.001, 0.03, null, bedBus);
        tone('sine', 120, 0.14, 0, 0.003, 0.09, null, bedBus);
      });
      return;
    }

    if (kind === 'lobby') {
      bedLevel = 0.45;
      drone('sine', 68, 0.16);
      droneNoise(0.03, 'lowpass', 700, 0.6);
      every(4200, 9000, () => {
        tone('sine', 660 + Math.random() * 500, 0.03, 0, 0.004, 0.18, null, bedBus);
      });
      return;
    }

    if (kind === 'intro') {
      // Engines, from inside the hull.
      bedLevel = 1;
      drone('sine', 36, 0.6);
      drone('sawtooth', 72, 0.07);
      droneNoise(0.12, 'lowpass', 220, 0.5);
      return;
    }
  }

  function applyBedGain() {
    if (!bedBus) return;
    const target = bedKind ? bedLevel * (ducked ? 0.3 : 1) * 0.22 : 0.0001;
    const t = ctx.currentTime;
    bedBus.gain.cancelScheduledValues(t);
    bedBus.gain.setValueAtTime(Math.max(bedBus.gain.value, 0.0001), t);
    bedBus.gain.linearRampToValueAtTime(Math.max(target, 0.0001), t + (ducked ? 0.25 : 0.9));
  }

  // ---------------------------------------------------------------------------
  // The opening's score
  // ---------------------------------------------------------------------------

  /**
   * One continuous piece of music, in D minor, that moves with the story rather
   * than looping under it. A sub drone holds the whole thing together from the
   * first frame to the last; the pad, the pulse and the beacon are layered in
   * and out as the narrator reaches each part of the story, so the music
   * arrives where the words do even though the words take a different length of
   * time on every device.
   */
  const D1 = 36.71;
  const D2 = 73.42;
  const CHORD = [146.83, 174.61, 220];      // D3 F3 A3 — the ship, minor
  const TENSION = 155.56;                    // Eb3, a semitone up from D. Wrong on purpose.

  let scoreNodes = [];
  let scoreTimers = [];
  let pad = null;
  let padFilter = null;
  let tension = null;
  let pulseTimer = null;
  let pulseGap = 0;

  function scoreOsc(type, freq, gain, dest, detune = 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.value = gain;
    o.connect(g);
    g.connect(dest || musicBus);
    o.start();
    scoreNodes.push(o);
    return { o, g };
  }

  function ramp(param, value, seconds) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + seconds);
  }

  /** A slow heartbeat under the picture. Re-arms itself so the gap can change. */
  function beat() {
    if (!pulseGap) return;
    tone('sine', 58, 0.5, 0, 0.004, 0.42, 34, musicBus, 0.25);
    hiss(0.05, 0, 0.002, 0.09, { type: 'lowpass', from: 700, to: 200, q: 1 }, musicBus, 0.2);
    pulseTimer = setTimeout(beat, pulseGap);
    scoreTimers.push(pulseTimer);
  }

  const intro = {
    start() {
      if (!live()) return;
      intro.stop();
      scoring = true;

      // The ship's own note, which never leaves.
      scoreOsc('sine', D1, 0.55);
      const low = scoreOsc('sawtooth', D2, 0.05);
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 150;
      low.g.disconnect();
      low.g.connect(lowFilter);
      lowFilter.connect(musicBus);
      scoreNodes.push(lowFilter);

      // The pad: three detuned strings, filtered almost shut to begin with.
      padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 220;
      padFilter.Q.value = 1.4;
      pad = ctx.createGain();
      pad.gain.value = 0.0001;
      padFilter.connect(pad);
      pad.connect(musicBus);
      const padSend = ctx.createGain();
      padSend.gain.value = 0.5;
      pad.connect(padSend);
      padSend.connect(reverbSend);
      for (const freq of CHORD) {
        scoreOsc('sawtooth', freq, 0.06, padFilter, -7);
        scoreOsc('sawtooth', freq, 0.06, padFilter, 8);
      }

      // The note that does not belong, held back until it is earned.
      tension = ctx.createGain();
      tension.gain.value = 0.0001;
      tension.connect(musicBus);
      scoreOsc('sawtooth', TENSION, 0.05, tension, 5);
      scoreOsc('sawtooth', TENSION * 2, 0.02, tension, -6);

      ramp(musicBus.gain, 0.34, 2.4);
    },

    /** Move the music to where the story has got to. */
    scene(index) {
      if (!live() || !scoring) return;

      if (index === 0) {
        // A distress beacon, alone, with a long tail on it.
        api.beacon();
        const ping = () => {
          api.beacon();
          const id = setTimeout(ping, 2600);
          scoreTimers.push(id);
        };
        const id = setTimeout(ping, 2600);
        scoreTimers.push(id);
        api.staticBurst();
      }

      if (index === 1) {
        // Whatever happened, happened here.
        api.explosion();
        ramp(padFilter.frequency, 420, 3);
        ramp(pad.gain, 0.5, 3.5);
        ramp(tension.gain, 0.18, 6);
      }

      if (index === 2) {
        ramp(padFilter.frequency, 700, 4);
        pulseGap = 1700;
        beat();
      }

      if (index === 3) {
        ramp(padFilter.frequency, 1100, 5);
        ramp(pad.gain, 0.75, 4);
        ramp(tension.gain, 0.34, 4);
        pulseGap = 1150;
      }

      if (index === 4) {
        // The title. Everything stops, and then lands.
        pulseGap = 0;
        clearTimeout(pulseTimer);
        api.riser(1.5);
        const id = setTimeout(() => {
          api.titleHit();
          ramp(pad.gain, 1, 0.6);
          ramp(padFilter.frequency, 1800, 0.6);
          ramp(tension.gain, 0.0001, 1.2);
        }, 1500);
        scoreTimers.push(id);
      }
    },

    stop() {
      pulseGap = 0;
      for (const id of scoreTimers) clearTimeout(id);
      scoreTimers = [];
      if (!ctx) { scoreNodes = []; scoring = false; return; }
      if (musicBus) ramp(musicBus.gain, 0.0001, 1.1);
      const dying = scoreNodes;
      scoreNodes = [];
      scoring = false;
      setTimeout(() => {
        for (const node of dying) {
          try { node.stop ? node.stop() : node.disconnect(); } catch { /* already gone */ }
        }
      }, 1300);
    },
  };

  const api = {
    get enabled() { return enabled; },
    intro,

    /** Called from the first gesture so the context is warm before the first night. */
    prime() {
      live();
      if (bedKind) { stopBed(); buildBed(bedKind); applyBedGain(); }
    },

    toggle() {
      enabled = !enabled;
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
      if (enabled) {
        live();
        if (bedKind) { stopBed(); buildBed(bedKind); applyBedGain(); }
        api.blip();
      } else {
        stopBed();
        api.cut();
      }
      return enabled;
    },

    /**
     * Swap the ship's ambience. Crossfades rather than cutting, so a phase
     * change does not sound like the sound broke.
     */
    ambience(kind) {
      if (kind === bedKind) return;
      bedKind = kind || null;
      if (!live()) return;
      const t = ctx.currentTime;
      bedBus.gain.cancelScheduledValues(t);
      bedBus.gain.setValueAtTime(Math.max(bedBus.gain.value, 0.0001), t);
      bedBus.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      clearTimeout(bedSwap);
      bedSwap = setTimeout(() => {
        stopBed();
        if (bedKind) { buildBed(bedKind); applyBedGain(); }
      }, 340);
    },

    /** 0–1. Nudges the ambient pulse as a phase's clock runs down. */
    setIntensity(value) {
      intensity = Math.min(1, Math.max(0, value || 0));
    },

    /** Pull the bed down under the narrator, and let it back up afterwards. */
    duck(on) {
      if (ducked === !!on) return;
      ducked = !!on;
      if (!ctx) return;
      applyBedGain();
      // The score ducks too, but less — it is meant to be heard under the
      // voice rather than got out of the way of.
      if (scoring && musicBus) ramp(musicBus.gain, ducked ? 0.16 : 0.34, 0.4);
    },

    /**
     * Every one-shot stops. Now. This is what the narrator's first syllable
     * does to the alarm — a 12ms duck rather than an instant zero, because an
     * instant zero on a loud sawtooth is a click you can hear across a room.
     */
    cut() {
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      for (const { node } of voices) {
        try { node.stop(t + 0.02); } catch { /* already stopped */ }
      }
      voices = [];
      // The hard duck exists to kill the klaxon dead. During the opening there
      // is no klaxon and there *is* continuous music, and dipping the master on
      // every narrated line would put a click in the middle of the score.
      if (scoring) return;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + 0.012);
      master.gain.setValueAtTime(0.0001, t + 0.03);
      master.gain.linearRampToValueAtTime(0.85, t + 0.06);
    },

    // --- Alarms ------------------------------------------------------------

    /** The signature: a two-tone alarm climbing towards something. */
    klaxon(duration = 0.62) {
      if (!live()) return;
      const steps = Math.max(2, Math.round(duration / 0.16));
      for (let i = 0; i < steps; i++) {
        const at = i * 0.16;
        const base = 210 * (1 + i * 0.14);
        tone('sawtooth', base, 0.16, at, 0.008, 0.1);
        tone('square', base * 1.5, 0.06, at + 0.02, 0.006, 0.08);
      }
      hiss(0.18, 0, 0.02, duration, { type: 'lowpass', from: 900, to: 2600, q: 0.8 });
    },

    // --- The opening's stingers --------------------------------------------

    /**
     * An automated distress beacon: two tones, and then the same two tones
     * again from much further away. The echo is the whole point — it is the
     * sound of nobody answering.
     */
    beacon() {
      if (!live()) return;
      tone('sine', 880, 0.16, 0, 0.005, 0.36, null, master, 0.9);
      tone('sine', 1320, 0.1, 0.22, 0.005, 0.42, null, master, 0.9);
      tone('sine', 880, 0.05, 0.62, 0.01, 0.5, null, master, 1);
      tone('sine', 1320, 0.03, 0.84, 0.01, 0.6, null, master, 1);
    },

    /** Radio noise, of the kind nobody is listening to. */
    staticBurst() {
      if (!live()) return;
      hiss(0.1, 0, 0.1, 0.9, { type: 'bandpass', from: 1400, to: 900, q: 1.2 }, master, 0.4);
      for (let i = 0; i < 5; i++) {
        hiss(0.06, 0.2 + Math.random() * 0.8, 0.002, 0.05,
          { type: 'bandpass', from: 900 + Math.random() * 2600, q: 6 }, master, 0.3);
      }
    },

    /**
     * The thing that opened the reactor shielding. Heard from inside the hull:
     * a crack, a shove of air, and a long structural groan afterwards.
     */
    explosion() {
      if (!live()) return;
      hiss(0.85, 0, 0.002, 0.16, { type: 'highpass', from: 1200, to: 4200, q: 0.4 }, master, 0.7);
      tone('sine', 120, 0.9, 0, 0.002, 1.1, 26, master, 0.6);
      tone('sine', 62, 0.7, 0.02, 0.01, 1.6, 22, master, 0.5);
      hiss(0.55, 0.03, 0.05, 1.9, { type: 'lowpass', from: 2200, to: 110, q: 0.7 }, master, 0.8);
      // Debris, arriving after the event the way debris does.
      for (let i = 0; i < 9; i++) {
        hiss(0.09, 0.35 + Math.random() * 1.6, 0.001, 0.09,
          { type: 'bandpass', from: 1200 + Math.random() * 3200, q: 5 }, master, 0.6);
      }
      // The hull, complaining.
      tone('sawtooth', 92, 0.09, 0.5, 0.4, 2.4, 74, master, 0.7);
    },

    /** The long climb into a title card. */
    riser(seconds = 1.5) {
      if (!live()) return;
      hiss(0.3, 0, seconds * 0.9, seconds * 0.25, { type: 'bandpass', from: 300, to: 5200, q: 0.8 }, master, 0.5);
      tone('sawtooth', 110, 0.1, 0, seconds * 0.92, seconds * 0.2, 880, master, 0.4);
      tone('sawtooth', 165, 0.07, 0.1, seconds * 0.8, seconds * 0.2, 1320, master, 0.4);
    },

    /** MAYDAY. */
    titleHit() {
      if (!live()) return;
      tone('sine', 180, 1, 0, 0.002, 2.2, 28, master, 0.7);
      tone('triangle', 90, 0.5, 0, 0.002, 1.4, 30, master, 0.5);
      hiss(0.7, 0, 0.001, 0.5, { type: 'lowpass', from: 5200, to: 300, q: 0.6 }, master, 0.9);
      hiss(0.22, 0.02, 0.004, 2.6, { type: 'bandpass', from: 3600, q: 2.2 }, master, 1);
    },

    /** The amber cousin: something is wrong but nobody has died. */
    caution() {
      if (!live()) return;
      for (let i = 0; i < 3; i++) tone('triangle', 420, 0.11, i * 0.18, 0.006, 0.1);
      hiss(0.08, 0, 0.02, 0.5, { from: 1200, q: 1.4 });
    },

    // --- Rooms and doors ----------------------------------------------------

    lightsOut() {
      if (!live()) return;
      tone('sine', 130, 0.3, 0, 0.03, 1.1, 42);
      hiss(0.14, 0, 0.05, 0.9, { type: 'lowpass', from: 1400, to: 180, q: 0.7 });
    },

    dayBreak() {
      if (!live()) return;
      tone('sine', 180, 0.16, 0, 0.06, 0.6, 320);
      tone('sine', 270, 0.1, 0.12, 0.05, 0.5);
    },

    /** Pumps, then the hard release of an airlock cycling. */
    airlock() {
      if (!live()) return;
      hiss(0.2, 0, 0.14, 0.5, { from: 300, to: 1500, q: 0.9 });
      tone('sine', 70, 0.3, 0.42, 0.004, 0.3);
      hiss(0.42, 0.46, 0.006, 0.65, { type: 'highpass', from: 400, to: 3600, q: 0.6 });
    },

    /**
     * Decompression. The sound of a room becoming outside: a hard crack, then
     * everything loose leaving at once, then nothing at all.
     */
    decompress() {
      if (!live()) return;
      hiss(0.5, 0, 0.004, 0.12, { type: 'highpass', from: 900, to: 5200, q: 0.5 });
      tone('sine', 90, 0.42, 0, 0.002, 0.5, 34);
      hiss(0.55, 0.05, 0.05, 1.5, { type: 'bandpass', from: 2600, to: 260, q: 0.55 });
      hiss(0.22, 0.3, 0.1, 1.4, { type: 'lowpass', from: 1400, to: 90, q: 0.7 });
    },

    /** A body leaving the ship. Space is not loud. */
    intoVacuum() {
      if (!live()) return;
      hiss(0.3, 0, 0.02, 0.9, { type: 'lowpass', from: 3000, to: 120, q: 0.7 });
      tone('sine', 60, 0.2, 0.05, 0.02, 0.8, 28);
    },

    /** Hull plating giving up. */
    tear() {
      if (!live()) return;
      hiss(0.4, 0, 0.004, 0.35, { type: 'bandpass', from: 3400, to: 700, q: 1.2, rate: 0.7 });
      tone('sawtooth', 180, 0.16, 0, 0.003, 0.3, 60);
      tone('square', 420, 0.08, 0.04, 0.002, 0.22, 130);
    },

    /** A heavy door, a floor plate, a grate. Anything that shuts hard. */
    slam() {
      if (!live()) return;
      tone('sine', 74, 0.45, 0, 0.002, 0.28);
      hiss(0.3, 0, 0.002, 0.12, { type: 'lowpass', from: 2600, to: 300, q: 1 });
      tone('triangle', 240, 0.1, 0.01, 0.002, 0.16);
    },

    /** Metal grating sliding back on runners. */
    grate() {
      if (!live()) return;
      hiss(0.22, 0, 0.02, 0.42, { type: 'bandpass', from: 1400, to: 2600, q: 2.4, rate: 0.5 });
      tone('triangle', 150, 0.12, 0, 0.01, 0.4);
    },

    seal() {
      if (!live()) return;
      hiss(0.22, 0, 0.01, 0.28, { type: 'lowpass', from: 2200, to: 320, q: 1 });
      tone('sine', 92, 0.36, 0.16, 0.003, 0.24);
    },

    /** Somebody hitting a deck plate. */
    thud() {
      if (!live()) return;
      tone('sine', 66, 0.4, 0, 0.002, 0.24);
      hiss(0.18, 0, 0.002, 0.14, { type: 'lowpass', from: 900, to: 180, q: 0.9 });
    },

    // --- Security -----------------------------------------------------------

    /**
     * The Security Officer's sidearm. Loud, short, and over before the room has
     * finished flinching.
     */
    gunshot() {
      if (!live()) return;
      hiss(0.9, 0, 0.001, 0.09, { type: 'highpass', from: 1800, to: 5600, q: 0.4 });
      hiss(0.55, 0, 0.001, 0.34, { type: 'lowpass', from: 2600, to: 220, q: 0.8 });
      tone('sine', 120, 0.5, 0, 0.001, 0.3, 44);
      tone('square', 320, 0.12, 0, 0.001, 0.08, 90);
      // The room, briefly, ringing.
      hiss(0.09, 0.12, 0.02, 0.9, { type: 'bandpass', from: 3200, q: 6 });
    },

    /** Brass on deck plating. */
    shell() {
      if (!live()) return;
      for (let i = 0; i < 3; i++) {
        tone('triangle', 2400 + Math.random() * 900, 0.05, 0.18 + i * 0.12, 0.001, 0.09);
      }
    },

    // --- Instruments --------------------------------------------------------

    ping(good = true) {
      if (!live()) return;
      tone('sine', good ? 1180 : 300, 0.14, 0, 0.004, 0.22);
      tone('sine', good ? 1760 : 200, 0.09, 0.09, 0.004, 0.3);
    },

    /** One vote landing on the tally. Called once per counted ballot. */
    tallyTick(index = 0) {
      if (!live()) return;
      tone('square', 900 + index * 60, 0.06, 0, 0.001, 0.05);
      hiss(0.08, 0, 0.001, 0.04, { from: 3000, q: 3 });
    },

    /** The count settling on a name. */
    tallyLand() {
      if (!live()) return;
      tone('sine', 160, 0.34, 0, 0.003, 0.3);
      tone('triangle', 320, 0.14, 0.02, 0.003, 0.24);
      hiss(0.16, 0, 0.002, 0.14, { type: 'lowpass', from: 2000, to: 400, q: 1 });
    },

    /** A system giving up during the opening. */
    systemFail() {
      if (!live()) return;
      tone('sawtooth', 300, 0.12, 0, 0.004, 0.34, 90);
      hiss(0.1, 0, 0.002, 0.2, { from: 1800, to: 400, q: 2 });
    },

    reveal(hostile = false) {
      if (!live()) return;
      if (hostile) {
        tone('sawtooth', 150, 0.18, 0, 0.01, 0.5);
        tone('sawtooth', 226, 0.12, 0.06, 0.01, 0.45);
      } else {
        tone('triangle', 392, 0.13, 0, 0.01, 0.35);
        tone('triangle', 587, 0.1, 0.09, 0.01, 0.4);
      }
      hiss(0.1, 0, 0.01, 0.3, { from: 3200, to: 900, q: 1.2 });
    },

    /** The Mimic's tell: the suit stuttering before it gives up the lie. */
    glitch() {
      if (!live()) return;
      for (let i = 0; i < 6; i++) {
        hiss(0.16, i * 0.055, 0.001, 0.035, { from: 800 + Math.random() * 3400, q: 5 });
        tone('square', 120 + Math.random() * 900, 0.05, i * 0.055, 0.001, 0.03);
      }
    },

    ballot() {
      if (!live()) return;
      tone('square', 660, 0.06, 0, 0.002, 0.05);
      hiss(0.1, 0.02, 0.001, 0.05, { from: 2800, q: 2.6 });
    },

    lock() {
      if (!live()) return;
      tone('sine', 140, 0.3, 0, 0.003, 0.2);
      hiss(0.14, 0, 0.002, 0.09, { type: 'lowpass', from: 1600, to: 400, q: 1 });
    },

    flicker() {
      if (!live()) return;
      for (let i = 0; i < 4; i++) {
        hiss(0.12, i * 0.12, 0.004, 0.06, { from: 1800 + i * 400, q: 2 });
        tone('triangle', 300 + i * 40, 0.06, i * 0.12, 0.004, 0.07);
      }
    },

    win(crew) {
      if (!live()) return;
      if (crew) {
        tone('triangle', 261.63, 0.16, 0, 0.02, 0.7);
        tone('triangle', 392, 0.15, 0.18, 0.02, 0.7);
        tone('triangle', 523.25, 0.17, 0.36, 0.02, 1.1);
      } else {
        tone('sawtooth', 110, 0.18, 0, 0.02, 0.9);
        tone('sawtooth', 146.83, 0.16, 0.22, 0.02, 0.9);
        tone('sawtooth', 98, 0.2, 0.5, 0.03, 1.4);
        hiss(0.16, 0.5, 0.05, 1.2, { type: 'lowpass', from: 2000, to: 160, q: 0.8 });
      }
    },

    blip() {
      if (!live()) return;
      tone('sine', 880, 0.08, 0, 0.002, 0.07);
      tone('sine', 1320, 0.06, 0.05, 0.002, 0.09);
    },

    nope() {
      if (!live()) return;
      tone('square', 150, 0.1, 0, 0.002, 0.1);
      tone('square', 110, 0.1, 0.07, 0.002, 0.14);
    },
  };

  return api;
})();
