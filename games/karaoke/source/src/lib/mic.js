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
    this.settings = { inputGain: 1, volume: 1, echo: 0, reverb: 0 };
    this.nodes = null;
  }

  async start(deviceId = "", inputMode = "feedback") {
    if (this.ctx) return;
    const audio = {
      // Feedback mode lets browser DSP reduce speaker bleed. Low-latency mode
      // bypasses that processing for live monitoring; use headphones or keep
      // the mic well away from the speakers to avoid acoustic feedback.
      echoCancellation: inputMode !== "low-latency",
      noiseSuppression: inputMode !== "low-latency",
      autoGainControl: false,
      channelCount: { ideal: 1 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.inputDeviceId = this.stream.getAudioTracks()[0]?.getSettings?.().deviceId || deviceId || "";
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(this.stream);
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;

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

    src.connect(inputGain).connect(highpass).connect(lowpass);
    lowpass.connect(dry).connect(limiter);
    lowpass.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(limiter);
    lowpass.connect(verb).connect(verbGain).connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);
    this.out = master;
    this.nodes = { inputGain, master, dry, wet, verbGain };
    this.configure(this.settings);
    this.setMonitoring(this.monitoring);
  }

  configure(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;
    this.nodes.inputGain.gain.setTargetAtTime(this.settings.inputGain, now, 0.03);
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
    this.inputDeviceId = "";
    this.monitoring = false;
  }
}

export const mic = new MicFX();
