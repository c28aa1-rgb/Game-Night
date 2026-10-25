import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useMotionValue } from "framer-motion";
import { mic } from "./mic.js";

const Ctx = createContext(null);

export function MicProvider({ children }) {
  const [status, setStatus] = useState("off"); // off | starting | on | denied
  const [monitoring, setMonitoringState] = useState(false);
  const level = useMotionValue(0);

  useEffect(() => {
    if (status !== "on") {
      level.set(0);
      return;
    }
    let raf;
    let smooth = 0;
    const tick = () => {
      const v = mic.level();
      // Fast attack, slow release — reads like a VU meter.
      smooth = v > smooth ? smooth + (v - smooth) * 0.6 : smooth + (v - smooth) * 0.12;
      level.set(smooth);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, level]);

  const toggle = useCallback(async () => {
    if (status === "on") {
      mic.stop();
      setStatus("off");
      setMonitoringState(false);
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
    setMonitoringState(on);
  }, []);

  return <Ctx.Provider value={{ status, toggle, level, monitoring, setMonitoring }}>{children}</Ctx.Provider>;
}

export function useMic() {
  return useContext(Ctx);
}
