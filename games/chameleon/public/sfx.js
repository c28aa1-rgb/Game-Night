(() => {
  'use strict';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let lobbyBus = null;
  let fxBus = null;
  let lobbyTimer = null;
  let lobbyStep = 0;
  let voteStep = 0;
  let lobbyWanted = false;
  let enabled = true;

  function ensure() {
    if (!AudioCtor) return false;
    if (ctx) return true;
    ctx = new AudioCtor();
    master = ctx.createGain();
    lobbyBus = ctx.createGain();
    fxBus = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 10;
    limiter.attack.value = .004;
    limiter.release.value = .18;
    master.gain.value = enabled ? 0.78 : 0;
    lobbyBus.gain.value = 0.34;
    fxBus.gain.value = 0.38;
    lobbyBus.connect(master);
    fxBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    return true;
  }

  async function unlock() {
    window.LobbyMusic?.unlock();
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
    if (window.LobbyMusic) {
      window.LobbyMusic.start({ key: 'chameleon' });
      return;
    }
    if (ctx?.state === 'running') beginLobby();
  }

  function stopLobby() {
    lobbyWanted = false;
    window.LobbyMusic?.stop();
    clearInterval(lobbyTimer);
    lobbyTimer = null;
  }

  function cue(kind, detail = {}) {
    if (!ensure() || ctx.state !== 'running' || !enabled) return;
    const at = ctx.currentTime + .015;
    if (kind === 'deal') {
      [0, 4, 7, 12].forEach((step, i) => tone(semitone(220, step), at + i * .085, .48, { type: 'triangle', level: .08, filter: 2600 }));
    } else if (kind === 'player_joined') {
      const step = Math.max(0, Math.min(5, (Number(detail.playerCount) || 1) - 1));
      tone(semitone(261.63, [0, 2, 4, 7, 9, 12][step]), at, .3, { type: 'triangle', level: .055, filter: 2300 });
      tone(semitone(261.63, [7, 9, 11, 14, 16, 19][step]), at + .075, .38, { type: 'sine', level: .038, filter: 2800 });
    } else if (kind === 'clue_open' || kind === 'speaker_changed') {
      tone(520, at, .08, { type: 'triangle', level: .1, filter: 1800 });
      tone(780, at + .065, .12, { type: 'sine', level: .07, filter: 2400 });
    } else if (kind === 'vote_open' || kind === 'vote_cast') {
      const voteFrequency = 285 + (voteStep % 4) * 22;
      tone(kind === 'vote_cast' ? voteFrequency : 180, at, .11, { type: 'square', level: .045, filter: 900 });
      if (kind === 'vote_cast') voteStep += 1;
    } else if (kind === 'vote_tally') {
      tone(300, at, .11, { type: 'square', level: .05, filter: 900 });
      const ticks = Math.max(3, Math.min(12, Number(detail.playerCount) || 6));
      Array.from({ length: ticks }, (_, step) => tone(230 + step * 25, at + .32 + step * .16, .11, { type: 'square', level: .038, filter: 1100 }));
      tone(116, at + .52 + ticks * .16, .72, { type: 'sine', to: 174, level: .11, filter: 620 });
    } else if (kind === 'runoff_open') {
      [180, 170, 155].forEach((frequency, i) => tone(frequency, at + i * .11, .16, { type: 'sawtooth', level: .055, filter: 720 }));
    } else if (kind === 'chameleon_guess') {
      tone(110, at, 1.1, { type: 'sine', to: 220, level: .11, filter: 700 });
      tone(330, at + .25, .7, { type: 'triangle', to: 247, level: .055, filter: 1400 });
    } else if (kind === 'round_reveal' || kind === 'guess_closed') {
      const result = detail.result || {};
      const townStoppedChameleon = result.caught === true && result.guessCorrect === false;
      if (townStoppedChameleon) {
        // Clean major landing: the group found the player and protected the word.
        [0, 4, 7, 12].forEach((step, i) => tone(semitone(174.61, step), at + i * .065, 1.2 - i * .04, { type: i < 2 ? 'sine' : 'triangle', level: .082, filter: 2700 }));
      } else {
        // The tell slipped away: colour drains downward instead of celebrating.
        tone(329.63, at, .34, { type: 'triangle', to: 246.94, level: .075, filter: 1500 });
        tone(164.81, at + .16, .86, { type: 'sine', to: 123.47, level: .1, filter: 720 });
      }
    } else if (kind === 'game_over') {
      const townWon = detail.winner === 'town';
      const steps = townWon ? [0, 4, 7, 12, 16] : [0, 3, 7, 12, 15];
      steps.forEach((step, i) => tone(semitone(174.61, step), at + i * .11, 1.55, { type: 'triangle', level: .085, filter: townWon ? 3000 : 2200 }));
      tone(townWon ? 87.31 : 82.41, at + .34, 1.8, { type: 'sine', level: .12, filter: 600 });
    }
  }

  function setEnabled(next) {
    enabled = !!next;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? .78 : 0, ctx.currentTime, .035);
    if (!enabled) {
      clearInterval(lobbyTimer);
      lobbyTimer = null;
    } else if (lobbyWanted && ctx?.state === 'running') beginLobby();
  }

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.ChameleonAudio = { get enabled() { return enabled; }, unlock, startLobby, stopLobby, cue, setEnabled };
})();
