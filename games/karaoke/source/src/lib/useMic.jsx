import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { mic } from "./mic.js";

const Ctx = createContext(null);

export function MicProvider({ children }) {
  const [status, setStatus] = useState("off"); // off | starting | on | denied
  const [settings, setSettings] = useState({ volume: 1, echo: 0, reverb: 0 });
  const [latency, setLatency] = useState(null);

  useEffect(() => () => mic.stop(), []);

  useEffect(() => {
    mic.configure(settings);
  }, [settings]);

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
      return;
    }
    setStatus("starting");
    try {
      await mic.start();
      setStatus("on");
    } catch {
      setStatus("denied");
    }
  }, [status]);

  const setMonitoring = useCallback((on) => {
    mic.setMonitoring(on);
  }, []);

  const updateSettings = useCallback((change) => {
    setSettings((current) => ({ ...current, ...change }));
  }, []);

  return <Ctx.Provider value={{ status, toggle, setMonitoring, settings, updateSettings, latency }}>{children}</Ctx.Provider>;
}

export function useMic() {
  return useContext(Ctx);
}
