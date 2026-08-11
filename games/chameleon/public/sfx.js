(() => {
  'use strict';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let lobbyBus = null;
  let fxBus = null;
  let lobbyTimer = null;
  let lobbyStep = 0;
  let lobbyWanted = false;
  let enabled = true;

  function ensure() {
    if (!AudioCtor) return false;
    if (ctx) return true;
    ctx = new AudioCtor();
    master = ctx.createGain();
    lobbyBus = ctx.createGain();
    fxBus = ctx.createGain();
    master.gain.value = enabled ? 0.86 : 0;
    lobbyBus.gain.value = 0.34;
    fxBus.gain.value = 0.38;
    lobbyBus.connect(master);
    fxBus.connect(master);
    master.connect(ctx.destination);
    return true;
  }

  async function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    if (lobbyWanted && !lobbyTimer) beginLobby();
  }

  function tone(frequency, at, duration, options = {}) {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, at + duration);
    filter.type = 'lowpass';
    filter.frequency.value = options.filter || 2100;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.level || 0.12, at + Math.min(.04, duration * .15));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(options.bus || fxBus);
    osc.start(at); osc.stop(at + duration + .03);
  }

  const semitone = (root, step) => root * Math.pow(2, step / 12);
  const CHORDS = [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 18]];

  function lobbyChord() {
    if (!ctx || !enabled || !lobbyWanted) return;
    const at = ctx.currentTime + .03;
    const chord = CHORDS[lobbyStep % CHORDS.length];
    chord.forEach((step, index) => tone(semitone(87.31, step), at + index * .035, 3.5, {
      type: index % 2 ? 'triangle' : 'sine', level: .06, filter: 850 + index * 220, bus: lobbyBus,
    }));
    [0, 7, 9, 4].forEach((step, index) => tone(semitone(174.61, step + (lobbyStep % 2 ? 5 : 0)), at + .45 + index * .62, .34, {
      type: 'triangle', level: .04, filter: 2800, bus: lobbyBus,
    }));
    lobbyStep += 1;
  }

  function beginLobby() {
    if (!ensure() || ctx.state !== 'running' || lobbyTimer || !enabled) return;
    lobbyChord();
    lobbyTimer = setInterval(lobbyChord, 3600);
  }

  function startLobby() {
    lobbyWanted = true;
    if (ctx?.state === 'running') beginLobby();
  }

  function stopLobby() {
    lobbyWanted = false;
    clearInterval(lobbyTimer);
    lobbyTimer = null;
  }

  function cue(kind) {
    if (!ensure() || ctx.state !== 'running' || !enabled) return;
    const at = ctx.currentTime + .015;
    if (kind === 'deal') {
      [0, 4, 7, 12].forEach((step, i) => tone(semitone(220, step), at + i * .085, .48, { type: 'triangle', level: .08, filter: 2600 }));
    } else if (kind === 'clue_open' || kind === 'speaker_changed') {
      tone(520, at, .08, { type: 'triangle', level: .1, filter: 1800 });
      tone(780, at + .065, .12, { type: 'sine', level: .07, filter: 2400 });
    } else if (kind === 'vote_open' || kind === 'vote_cast') {
      tone(kind === 'vote_cast' ? 300 : 180, at, .11, { type: 'square', level: .045, filter: 900 });
    } else if (kind === 'runoff_open') {
      [180, 170, 155].forEach((frequency, i) => tone(frequency, at + i * .11, .16, { type: 'sawtooth', level: .055, filter: 720 }));
    } else if (kind === 'chameleon_guess') {
      tone(110, at, 1.1, { type: 'sine', to: 220, level: .11, filter: 700 });
      tone(330, at + .25, .7, { type: 'triangle', to: 247, level: .055, filter: 1400 });
    } else if (kind === 'round_reveal' || kind === 'guess_closed') {
      [0, 3, 7, 11, 14].forEach((step, i) => tone(semitone(164.81, step), at + i * .055, 1.25 - i * .05, { type: i < 2 ? 'sine' : 'triangle', level: .075, filter: 2500 }));
    } else if (kind === 'game_over') {
      [0, 4, 7, 12, 16].forEach((step, i) => tone(semitone(174.61, step), at + i * .12, 1.5, { type: 'triangle', level: .09, filter: 3000 }));
    }
  }

  function setEnabled(next) {
    enabled = !!next;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? .86 : 0, ctx.currentTime, .035);
    if (!enabled) {
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    } else if (lobbyWanted && ctx?.state === 'running') beginLobby();
  }

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.ChameleonAudio = { unlock, startLobby, stopLobby, cue, setEnabled };
})();
