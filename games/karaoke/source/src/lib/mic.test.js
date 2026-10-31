import test from "node:test";
import assert from "node:assert/strict";
import { MicFX } from "./mic.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(t, capture) {
  const calls = [];
  const contexts = [];
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = () => ({
    gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(),
    ratio: param(), attack: param(), release: param(), delayTime: param(),
    connect(next) { return next; },
  });
  class AudioContextStub {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.sampleRate = 100;
      this.destination = node();
      contexts.push(this);
    }
    async resume() { calls.push("resume"); this.state = "running"; }
    async close() { this.state = "closed"; }
    createMediaStreamSource() { return node(); }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createDelay() { return node(); }
    createConvolver() { return node(); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  }
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const priorContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    mediaDevices: { getUserMedia(options) { calls.push(options); return capture(options); } },
  } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: AudioContextStub });
  const mic = new MicFX();
  t.after(() => {
    mic.stop();
    if (priorNavigator) Object.defineProperty(globalThis, "navigator", priorNavigator);
    else delete globalThis.navigator;
    if (priorContext) Object.defineProperty(globalThis, "AudioContext", priorContext);
    else delete globalThis.AudioContext;
  });
  return { mic, calls, contexts };
}

function stream(id = "usb-jbl") {
  const track = {
    contentHint: "", stopped: false,
    getSettings: () => ({ deviceId: id }),
    stop() { this.stopped = true; },
  };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

test("default capture preserves singing and resumes audio before requesting microphone permission", async (t) => {
  const input = stream();
  const { mic, calls } = setup(t, async () => input);
  assert.equal(await mic.start("usb-jbl"), true);
  assert.equal(calls[0], "resume");
  assert.deepEqual(calls[1].audio, {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    channelCount: { ideal: 1 }, deviceId: { exact: "usb-jbl" },
  });
  assert.equal(input.track.contentHint, "music");
  assert.equal(mic.inputDeviceId, "usb-jbl");
});

test("optional echo reduction does not enable speech suppression or automatic gain", async (t) => {
  const { mic, calls } = setup(t, async () => stream());
  await mic.start("", "feedback");
  assert.equal(calls[1].audio.echoCancellation, true);
  assert.equal(calls[1].audio.noiseSuppression, false);
  assert.equal(calls[1].audio.autoGainControl, false);
  assert.equal("deviceId" in calls[1].audio, false);
});

test("a permission result arriving after stop cannot reconnect the mic", async (t) => {
  const permission = deferred();
  const input = stream();
  const { mic, contexts } = setup(t, () => permission.promise);
  const opening = mic.start();
  mic.stop();
  permission.resolve(input);
  assert.equal(await opening, false);
  assert.equal(input.track.stopped, true);
  assert.equal(contexts[0].state, "closed");
  assert.equal(mic.stream, null);
});

test("a stale device request cannot replace a newer input", async (t) => {
  const permission = deferred();
  const oldInput = stream("old");
  const newInput = stream("new");
  let count = 0;
  const { mic } = setup(t, () => ++count === 1 ? permission.promise : Promise.resolve(newInput));
  const opening = mic.start("old");
  mic.stop();
  await mic.start("new");
  mic.setMonitoring(true);
  permission.resolve(oldInput);
  assert.equal(await opening, false);
  assert.equal(oldInput.track.stopped, true);
  assert.equal(newInput.track.stopped, false);
  assert.equal(mic.inputDeviceId, "new");
  assert.equal(mic.monitoring, true);
});

test("failed capture cleans up audio resources and allows retry", async (t) => {
  let count = 0;
  const { mic, contexts } = setup(t, async () => {
    if (++count === 1) throw Object.assign(new Error("missing USB mic"), { name: "NotFoundError" });
    return stream();
  });
  await assert.rejects(mic.start("missing"), { name: "NotFoundError" });
  assert.equal(contexts[0].state, "closed");
  assert.equal(mic.ctx, null);
  assert.equal(await mic.start("usb-jbl"), true);
});

test("manual monitoring stays enabled through effect and volume changes", async (t) => {
  const { mic } = setup(t, async () => stream());
  await mic.start();
  mic.setMonitoring(true);
  for (const change of [{ inputGain: 1.2 }, { echo: 0.4 }, { reverb: 0.3 }, { volume: 0.7 }]) {
    mic.configure(change);
    assert.equal(mic.monitoring, true);
    assert.equal(mic.out.gain.value, mic.settings.volume);
  }
  mic.setMonitoring(false);
  mic.configure({ echo: 0 });
  assert.equal(mic.out.gain.value, 0);
  await mic.resume();
  assert.equal(mic.monitoring, false);
});
