(() => {
  'use strict';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const db = (value) => Math.pow(10, value / 20);
  const semitone = (root, step) => root * Math.pow(2, step / 12);
  let ctx = null;
  let master = null;
  let fxBus = null;
  let enabled = true;
  let lobbyWanted = false;

  function ensure() {
    if (!AudioCtor) return false;
    if (ctx) return true;
    ctx = new AudioCtor();
    master = ctx.createGain();
    fxBus = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = .003;
    limiter.release.value = .16;
    master.gain.value = enabled ? db(-3) : 0;
    fxBus.gain.value = db(-9);
    fxBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    return true;
  }

  async function unlock() {
    window.LobbyMusic?.unlock();
    if (!ensure()) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  }

  function tone(frequency, at, duration, options = {}) {
    if (!ctx || !enabled) return;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.type = options.type || 'triangle';
    oscillator.frequency.setValueAtTime(frequency, at);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, at + duration);
    filter.type = options.filterType || 'lowpass';
    filter.frequency.value = options.filter || 2400;
    filter.Q.value = options.q || .8;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.level || .1, at + Math.min(.025, duration * .2));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(fxBus);
    oscillator.start(at);
    oscillator.stop(at + duration + .03);
  }

  function noise(at, duration, options = {}) {
    if (!ctx || !enabled) return;
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) data[index] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = options.filterType || 'bandpass';
    filter.frequency.value = options.filter || 760;
    filter.Q.value = options.q || 1.4;
    gain.gain.setValueAtTime(options.level || .08, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(fxBus);
    source.start(at);
  }

  function cue(kind, detail = {}) {
    if (!ensure() || ctx.state !== 'running' || !enabled) return;
    const at = ctx.currentTime + .012;
    if (kind === 'ui') {
      noise(at, .07, { level: .055, filter: 820, q: 1.8 });
      tone(132, at, .09, { level: .055, filter: 540 });
    } else if (kind === 'error') {
      tone(196, at, .13, { type: 'square', level: .06, filter: 920 });
      tone(155.56, at + .11, .2, { type: 'triangle', level: .07, filter: 760 });
    } else if (kind === 'answer_locked') {
      noise(at, .09, { level: .09, filter: 680, q: 1.9 });
      tone(392, at + .035, .26, { level: .07, filter: 1900 });
      tone(587.33, at + .1, .3, { type: 'sine', level: .045, filter: 2600 });
    } else if (kind === 'answer_submitted') {
      const step = Math.min(7, Math.max(0, Number(detail.submissionsIn || 1) - 1));
      noise(at, .055, { level: .038, filter: 720 + step * 35 });
      tone(semitone(220, step), at, .16, { level: .034, filter: 1300 });
    } else if (kind === 'answer_tick') {
      tone(880, at, .055, { type: 'square', level: .022, filter: 2200 });
    } else if (kind === 'question_open') {
      tone(98, at, .28, { type: 'sine', to: 123.47, level: .11, filter: 520 });
      noise(at + .04, .14, { level: .1, filter: 540, q: 1.2 });
      tone(293.66, at + .1, .28, { level: .055, filter: 1700 });
    } else if (kind === 'answers_open') {
      noise(at, .11, { level: .07, filter: 940, q: 1.7 });
      [0, 4, 7].forEach((step, index) => tone(semitone(220, step), at + .04 + index * .055, .36, { level: .06, filter: 2300 }));
    } else if (kind === 'review_open') {
      noise(at, .12, { level: .075, filter: 580, q: 1.2 });
      tone(146.83, at, .38, { type: 'sine', to: 174.61, level: .085, filter: 680 });
      tone(293.66, at + .18, .24, { level: .04, filter: 1400 });
    } else if (kind === 'groups_changed') {
      noise(at, .06, { level: .045, filter: 1050 });
      tone(440, at + .02, .18, { level: .04, filter: 1800 });
    } else if (kind === 'round_reveal') {
      [0, 4, 7, 12].forEach((step, index) => tone(semitone(196, step), at + index * .065, .62 - index * .03, { type: index > 1 ? 'sine' : 'triangle', level: .073, filter: 2700 }));
      if (detail.hasPinkCow) {
        const pinkAt = at + .44;
        tone(174.61, pinkAt, .72, { type: 'sawtooth', to: 103.83, level: .075, filter: 720, q: 1.5 });
        tone(261.63, pinkAt + .07, .58, { type: 'sine', to: 146.83, level: .09, filter: 620 });
      }
    } else if (kind === 'game_over') {
      [0, 4, 7, 12, 16].forEach((step, index) => tone(semitone(174.61, step), at + index * .09, 1.25 - index * .05, { type: index % 2 ? 'triangle' : 'sine', level: .085, filter: 2900 }));
      tone(87.31, at + .17, 1.6, { type: 'sine', to: 110, level: .12, filter: 560 });
      noise(at + .38, .24, { level: .055, filter: 1250, q: .8 });
    }
  }

  function startLobby() {
    lobbyWanted = true;
    if (enabled) window.LobbyMusic?.start({ key: 'herd-mentality' });
  }

  function stopLobby() {
    lobbyWanted = false;
    window.LobbyMusic?.stop();
  }

  function setEnabled(next) {
    enabled = !!next;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? db(-3) : 0, ctx.currentTime, .045);
    window.LobbyMusic?.setEnabled(enabled);
    if (enabled && lobbyWanted) window.LobbyMusic?.start({ key: 'herd-mentality' });
  }

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.HerdAudio = { unlock, cue, startLobby, stopLobby, setEnabled, get enabled() { return enabled; } };
})();
