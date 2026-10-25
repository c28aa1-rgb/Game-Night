import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { local } from "./local.js";

export const API = import.meta.env.VITE_KARAOKE_API || "/karaoke-api";

export async function createRoom() {
  const res = await fetch(`${API}/rooms`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't start a party. Is the server running?");
  return body; // { code, hostToken, state }
}

export async function roomExists(code) {
  const res = await fetch(`${API}/rooms/${encodeURIComponent(code)}`);
  return res.ok;
}

export function joinUrl(code) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

const Ctx = createContext(null);

// Live room state over Server-Sent Events. EventSource reconnects by itself after drops.
export function RoomProvider({ code, hostToken = null, children, onGone }) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | live | offline | gone
  const revRef = useRef(-1);
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  const accept = useCallback((next) => {
    if (next && next.rev >= revRef.current) {
      revRef.current = next.rev;
      setState(next);
    }
  }, []);

  useEffect(() => {
    let es;
    let cancelled = false;
    const open = async () => {
      // Check first: EventSource can't see a 404, it would just retry forever.
      const res = await fetch(`${API}/rooms/${code}`).catch(() => null);
      if (cancelled) return;
      if (res && res.status === 404) {
        setStatus("gone");
        goneRef.current?.();
        return;
      }
      es = new EventSource(`${API}/rooms/${code}/events${hostToken ? `?host=${hostToken}` : ""}`);
      es.onopen = () => setStatus("live");
      es.onmessage = (e) => {
        try {
          accept(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        setStatus("offline");
        // If the server restarted, the room is gone; stop retrying.
        fetch(`${API}/rooms/${code}`)
          .then((r) => {
            if (r.status === 404 && !cancelled) {
              es.close();
              setStatus("gone");
              goneRef.current?.();
            }
          })
          .catch(() => {});
      };
    };
    open();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [code, hostToken, accept]);

  const send = useCallback(
    async (action, payload = {}) => {
      const res = await fetch(`${API}/rooms/${code}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, hostToken, deviceId: local.get().deviceId, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work. Try again.");
      accept(body.state);
      return body.state;
    },
    [code, hostToken, accept]
  );

  return <Ctx.Provider value={{ code, state, status, send, isHost: Boolean(hostToken) }}>{children}</Ctx.Provider>;
}

export function useRoom() {
  return useContext(Ctx);
}
