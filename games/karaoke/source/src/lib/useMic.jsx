import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { mic } from "./mic.js";

const Ctx = createContext(null);

export function MicProvider({ children }) {
  const [status, setStatus] = useState("off"); // off | starting | on | denied

  useEffect(() => () => mic.stop(), []);

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

  return <Ctx.Provider value={{ status, toggle, setMonitoring }}>{children}</Ctx.Provider>;
}

export function useMic() {
  return useContext(Ctx);
}
