/* Wavelength sound: TV-only, synthesised, and deliberately talk-overable. */
window.WavelengthSFX = (() => {
  const KEY = 'wavelength.sound';
  let ctx; let master; let music;
  let enabled = localStorage.getItem(KEY) !== 'off';
  let lobbyOn = false; let lobbyTimers = []; let lobbyNodes = []; let lastTickAt = 0;

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
    if (window.LobbyMusic) {
      if (!enabled) return;
      window.LobbyMusic.start({ key: 'wavelength' });
      return;
    }
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
    window.LobbyMusic?.stop();
    if (!lobbyOn) return; lobbyOn = false; lobbyTimers.forEach(clearTimeout); lobbyTimers = [];
    if (ctx) { music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setValueAtTime(Math.max(.0001, music.gain.value), ctx.currentTime); music.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.1); }
    lobbyNodes.forEach((node) => { try { node.stop(at(1.2)); } catch {} }); lobbyNodes = [];
  }

  return {
    get enabled() { return enabled; },
    unlock() { window.LobbyMusic?.unlock(); boot(); if (ctx?.state === 'suspended') ctx.resume(); },
    setEnabled(on) {
      enabled = !!on;
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
      if (!enabled) stopLobby();
    },
    lobby(on) { if (on) startLobby(); else stopLobby(); },
    roundStart() {
      if (!live()) return;
      // A radio signal resolving out of static: the clue giver should look up.
      click(0, .025, 1500);
      tone(233.08, .04, .46, .055, 'sine');
      tone(349.23, .16, .58, .065, 'triangle');
    },
    guessOpen() {
      if (!live()) return;
      // Two clean locator pings hand control from the clue phone to the dial.
      tone(698.46, 0, .18, .055, 'sine');
      tone(932.33, .13, .32, .06, 'sine');
    },
    skip() {
      if (!live()) return;
      click(0, .025, 1900);
      tone(420, 0, .18, .045, 'triangle');
      tone(630, .09, .24, .05, 'triangle');
    },
    seatReady(count = 1) {
      if (!live()) return;
      const step = Math.max(0, Math.min(3, Number(count) - 1));
      const notes = [466.16, 523.25, 698.46, 932.33];
      tone(notes[step], 0, .3, .05, 'triangle');
      tone(notes[step] * 1.5, .075, .38, .035, 'sine');
    },
    tick() {
      if (!live()) return;
      const now = ctx.currentTime;
      if (now - lastTickAt < .045) return;
      lastTickAt = now;
      click(0, .021, 2100);
      tone(1046.5, 0, .055, .019, 'triangle');
    },
    reveal(points) {
      if (!live()) return;
      const score = Math.max(0, Math.min(4, Number(points) || 0));
      click(0, .035, 1300);
      if (score === 0) {
        // No reward: short, low, and conclusive without sounding punitive.
        tone(233.08, .04, .32, .075, 'triangle');
        tone(174.61, .18, .52, .085, 'sine');
        return;
      }
      const notes = [466.16, 587.33, 698.46, 932.33];
      notes.slice(0, score).forEach((freq, i) => tone(freq, .04 + i * .1, .72 + i * .09, .065 + score * .009, i < 2 ? 'triangle' : 'sine'));
      if (score >= 3) tone(233.08, .14, 1.05, .08, 'sine');
      if (score === 4) {
        tone(1174.66, .48, 1.15, .105, 'triangle');
        Array.from({ length: 5 }, (_, i) => click(.42 + i * .065, .018, 2700 + i * 240));
      }
    },
    win() {
      if (!live()) return;
      tone(98, 0, 1.4, .16, 'sine');
      [392,493.88,587.33,783.99,987.77].forEach((freq, i) => tone(freq, i * .07, 2.05, .105, 'triangle'));
      // A short paper-crackle cascade lands with the visual confetti burst.
      Array.from({ length: 14 }, (_, i) => click(.22 + i * .055, .025 + (i % 3) * .008, 1200 + i * 105));
      tone(1174.66, .82, 1.35, .09, 'sine');
    },
  };
})();
