/* Wavelength sound: TV-only, synthesised, and deliberately talk-overable. */
window.WavelengthSFX = (() => {
  const KEY = 'wavelength.sound';
  let ctx; let master; let music; let enabled = localStorage.getItem(KEY) !== 'off';
  let lobbyOn = false; let lobbyTimers = []; let lobbyNodes = [];

  function boot() {
    if (ctx) return true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    ctx = new Audio();
    master = ctx.createGain(); master.gain.value = .62;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20; compressor.ratio.value = 7; compressor.attack.value = .006; compressor.release.value = .22;
    master.connect(compressor); compressor.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = .0001; music.connect(master);
    return true;
  }
  function live() { if (!enabled || !boot()) return false; if (ctx.state === 'suspended') ctx.resume(); return true; }
  function at(delay = 0) { return ctx.currentTime + delay; }
  function envelope(destination, peak, delay, length) {
    const gain = ctx.createGain(); const t = at(delay);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(peak, t + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, t + length); gain.connect(destination); return gain;
  }
  function tone(freq, delay = 0, length = .35, peak = .1, shape = 'sine', destination = master) {
    const osc = ctx.createOscillator(); osc.type = shape; osc.frequency.value = freq;
    osc.connect(envelope(destination, peak, delay, length)); osc.start(at(delay)); osc.stop(at(delay) + length + .04); return osc;
  }
  function click(delay = 0, peak = .04, bright = 2600) {
    if (!ctx) return; const size = Math.floor(ctx.sampleRate * .035); const buffer = ctx.createBuffer(1, size, ctx.sampleRate); const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const source = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = bright; filter.Q.value = 4;
    source.buffer = buffer; source.connect(filter); filter.connect(envelope(master, peak, delay, .05)); source.start(at(delay));
  }

  function startLobby() {
    if (lobbyOn || !live()) return; lobbyOn = true;
    music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setValueAtTime(.0001, ctx.currentTime); music.gain.exponentialRampToValueAtTime(.45, ctx.currentTime + 2.3);
    const chords = [[196,246.94,293.66],[174.61,220,261.63],[220,277.18,329.63],[164.81,207.65,246.94]];
    const step = (n) => {
      if (!lobbyOn) return;
      chords[n % chords.length].forEach((frequency, i) => { const node = tone(frequency, i * .035, 5.7, .045, 'triangle', music); lobbyNodes.push(node); });
      const bell = [587.33,659.25,783.99,880][n % 4]; lobbyNodes.push(tone(bell, 2.8, .7, .026, 'sine', music));
      lobbyTimers.push(setTimeout(() => step(n + 1), 6600));
    };
    step(0);
  }
  function stopLobby() {
    if (!lobbyOn) return; lobbyOn = false; lobbyTimers.forEach(clearTimeout); lobbyTimers = [];
    if (ctx) { music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setValueAtTime(Math.max(.0001, music.gain.value), ctx.currentTime); music.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.1); }
    lobbyNodes.forEach((node) => { try { node.stop(at(1.2)); } catch {} }); lobbyNodes = [];
  }

  return {
    get enabled() { return enabled; },
    unlock() { boot(); if (ctx?.state === 'suspended') ctx.resume(); },
    setEnabled(on) { enabled = !!on; localStorage.setItem(KEY, enabled ? 'on' : 'off'); if (!enabled) stopLobby(); },
    lobby(on) { if (on) startLobby(); else stopLobby(); },
    tick() { if (!live()) return; click(0, .026, 2200); tone(1120, 0, .06, .025, 'triangle'); },
    reveal(points) { if (!live()) return; [523.25,659.25,783.99].forEach((freq, i) => tone(freq, i * .11, .7, .09, 'sine')); if (points === 4) tone(1046.5, .38, 1.1, .13, 'triangle'); },
    win() { if (!live()) return; [392,493.88,587.33,783.99].forEach((freq, i) => tone(freq, i * .045, 1.8, .1, 'triangle')); click(.28, .05, 1400); },
  };
})();
