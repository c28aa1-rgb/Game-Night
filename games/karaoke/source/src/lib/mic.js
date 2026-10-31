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
    this.generation = 0;
  }

  async start(deviceId = "", inputMode = "low-latency") {
    if (this.ctx) return true;
    const generation = ++this.generation;
    const audio = {
      // Speech suppression can mistake sustained singing (or our own monitor
      // output) for noise/echo. Keep vocals intact unless echo reduction is
      // explicitly requested; never apply a speech noise gate or automatic gain.
      echoCancellation: inputMode === "feedback",
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    // Resume during the enable-mic gesture, before the asynchronous permission
    // request. Otherwise some browsers leave a connected mic silently suspended.
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    const resumed = ctx.resume().then(() => null, (error) => error);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if ("contentHint" in track) track.contentHint = "music";
      this.inputDeviceId = track.getSettings?.().deviceId || deviceId || "";
      const src = ctx.createMediaStreamSource(this.stream);
      const inputGain = ctx.createGain();
      inputGain.gain.value = 1;

      // Continuous monitor: dry + optional slapback echo and room reverb.
      // Only the user's mic toggle/volume controls mute this path.
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 90;
      highpass.Q.value = 0.7;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 12000;
      lowpass.Q.value = 0.7;
      const limiter = ctx.createDynamicsCompressor();
      // Catch boosted peaks above full scale. A 0 dB threshold and hard knee
      // also avoid the Web Audio compressor's makeup gain on normal vocals.
      limiter.threshold.value = 0;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.08;
      const master = ctx.createGain();
      master.gain.value = 0;
      const dry = ctx.createGain();
      dry.gain.value = 1;
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
      lowpass.connect(dry).connect(master);
      lowpass.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(master);
      lowpass.connect(verb).connect(verbGain).connect(master);
      // Include volume boost in peak protection.
      master.connect(limiter).connect(ctx.destination);
      this.out = master;
      this.nodes = { inputGain, master, dry, wet, verbGain };
      this.configure(this.settings);
      this.setMonitoring(this.monitoring);
      const resumeError = await resumed;
      if (generation !== this.generation) return false;
      if (resumeError) throw resumeError;
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      throw error;
    }
  }

  configure(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;
    this.nodes.inputGain.gain.setTargetAtTime(this.settings.inputGain, now, 0.03);
    this.nodes.master.gain.setTargetAtTime(this.monitoring ? this.settings.volume : 0, now, 0.03);
    this.nodes.wet.gain.setTargetAtTime(0.24 * this.settings.echo, now, 0.03);
    this.nodes.verbGain.gain.setTargetAtTime(0.24 * this.settings.reverb, now, 0.03);
  }

  setMonitoring(on) {
    this.monitoring = on;
    if (!this.ctx) return;
    this.out?.gain.setTargetAtTime(on ? this.settings.volume : 0, this.ctx.currentTime, 0.03);
  }

  async resume() {
    if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
  }

  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.out = null;
    this.nodes = null;
    this.inputDeviceId = "";
    this.monitoring = false;
  }
}

export const mic = new MicFX();
