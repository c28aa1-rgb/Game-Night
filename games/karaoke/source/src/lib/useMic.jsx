import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { mic } from "./mic.js";

const Ctx = createContext(null);

function readSavedDevice() {
  try { return localStorage.getItem("karaoke-mic-device") || ""; } catch { return ""; }
}

export function MicProvider({ children }) {
  const [status, setStatus] = useState("off"); // off | starting | on | denied
  const [settings, setSettings] = useState({ inputGain: 1, volume: 1, echo: 0, reverb: 0 });
  const [latency, setLatency] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(readSavedDevice);
  const [inputMode, setInputMode] = useState("feedback");
  const [error, setError] = useState("");

  useEffect(() => () => mic.stop(), []);

  useEffect(() => {
    mic.configure(settings);
  }, [settings]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === "audioinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const startInput = useCallback(async (deviceId = selectedDeviceId, mode = inputMode) => {
    setStatus("starting");
    setError("");
    try {
      await mic.start(deviceId, mode);
      setStatus("on");
      await refreshDevices();
    } catch (cause) {
      setStatus("denied");
      setError(cause?.name === "OverconstrainedError" || cause?.name === "NotFoundError"
        ? "That microphone isn't available. Choose another input or reconnect it."
        : "Couldn't open that microphone. Check browser permissions and try another input.");
      await refreshDevices();
    }
  }, [inputMode, refreshDevices, selectedDeviceId]);

  useEffect(() => {
    if (status !== "on") {
      setLatency(null);
      return;
    }
    const readLatency = () => {
      const ctx = mic.ctx;
      if (!ctx) return setLatency(null);
      const base = Number(ctx.baseLatency) || 0;
      const output = Number(ctx.outputLatency) || 0;
      setLatency(Math.round((base + output) * 1000));
    };
    readLatency();
    const timer = setInterval(readLatency, 2000);
    return () => clearInterval(timer);
  }, [status]);

  const toggle = useCallback(async () => {
    if (status === "on") {
      mic.stop();
      setStatus("off");
      setError("");
      return;
    }
    await startInput();
  }, [status, startInput]);

  const setMonitoring = useCallback((on) => {
    mic.setMonitoring(on);
  }, []);

  const updateSettings = useCallback((change) => {
    setSettings((current) => ({ ...current, ...change }));
  }, []);

  const chooseDevice = useCallback(async (deviceId) => {
    setSelectedDeviceId(deviceId);
    try { localStorage.setItem("karaoke-mic-device", deviceId); } catch { /* storage is optional */ }
    if (status === "on") {
      mic.stop();
      await startInput(deviceId);
    }
  }, [startInput, status]);

  const chooseInputMode = useCallback(async (mode) => {
    setInputMode(mode);
    if (status === "on") {
      mic.stop();
      await startInput(selectedDeviceId, mode);
    }
  }, [selectedDeviceId, startInput, status]);

  return <Ctx.Provider value={{ status, toggle, setMonitoring, settings, updateSettings, latency, devices, selectedDeviceId, chooseDevice, inputMode, chooseInputMode, error }}>{children}</Ctx.Provider>;
}

export function useMic() {
  return useContext(Ctx);
}
