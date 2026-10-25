// Microphone effects. Only ever touches the user's mic — the YouTube audio is never read.

function makeImpulse(ctx, seconds = 1.8, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class MicFX {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.out = null;
    this.monitoring = false;
  }

  async start() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(this.stream);

    // Performance monitor: dry + slapback echo + room reverb. The stage owns
    // the master mute so transitions and paused video never feed the speakers.
    const master = ctx.createGain();
    master.gain.value = 0;
    const dry = ctx.createGain();
    dry.gain.value = 0.9;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.4;

    src.connect(dry).connect(master);
    src.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(master);
    src.connect(verb).connect(verbGain).connect(master);
    master.connect(ctx.destination);
    this.out = master;
  }

  setMonitoring(on) {
    this.monitoring = on;
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.out = null;
    this.monitoring = false;
  }
}

export const mic = new MicFX();
