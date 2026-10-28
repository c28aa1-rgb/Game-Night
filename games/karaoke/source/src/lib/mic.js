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
    this.settings = { volume: 1, echo: 0, reverb: 0 };
    this.nodes = null;
  }

  async start() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Ask the browser/device DSP to remove sound coming from the TV.
        // These are preferences, so older browsers can still provide a mic.
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        // AGC can turn itself up during quiet moments and start a feedback loop.
        autoGainControl: { ideal: false },
        channelCount: { ideal: 1 },
      },
    });
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(this.stream);

    // Performance monitor: dry + slapback echo + room reverb. The stage owns
    // the master mute so transitions and paused video never feed the speakers.
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 90;
    highpass.Q.value = 0.7;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 12000;
    lowpass.Q.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 6;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = 0;
    const dry = ctx.createGain();
    dry.gain.value = 0.78;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.2;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0;

    src.connect(highpass).connect(lowpass);
    lowpass.connect(dry).connect(limiter);
    lowpass.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(limiter);
    lowpass.connect(verb).connect(verbGain).connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);
    this.out = master;
    this.nodes = { master, dry, wet, verbGain };
    this.configure(this.settings);
    this.setMonitoring(this.monitoring);
  }

  configure(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;
    this.nodes.master.gain.setTargetAtTime(this.monitoring ? 0.82 * this.settings.volume : 0, now, 0.03);
    this.nodes.wet.gain.setTargetAtTime(0.24 * this.settings.echo, now, 0.03);
    this.nodes.verbGain.gain.setTargetAtTime(0.24 * this.settings.reverb, now, 0.03);
  }

  setMonitoring(on) {
    this.monitoring = on;
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(on ? 0.82 * this.settings.volume : 0, this.ctx.currentTime, 0.03);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.out = null;
    this.nodes = null;
    this.monitoring = false;
  }
}

export const mic = new MicFX();
