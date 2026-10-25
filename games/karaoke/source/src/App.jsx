import { AnimatePresence, MotionConfig } from "framer-motion";
import { useState } from "react";
import { hostSession, local } from "./lib/local.js";
import { ToastProvider } from "./lib/toast.jsx";
import Landing from "./Landing.jsx";
import HostApp from "./host/HostApp.jsx";
import PhoneApp from "./phone/PhoneApp.jsx";

// ?join=CODE (from the QR) → phone remote. A remembered host session → back to the TV view. Else the landing page.
function initialRoute() {
  const join = new URLSearchParams(location.search).get("join")?.toUpperCase();
  if (join && /^[A-Z]{4}$/.test(join)) return local.get().name ? { type: "phone", code: join } : { type: "landing", code: join };
  const hs = hostSession.get();
  if (hs) return { type: "host", session: hs };
  return { type: "landing", code: "" };
}

function setJoinParam(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set("join", code);
  else url.searchParams.delete("join");
  history.replaceState(null, "", url);
}

export default function App() {
  const [route, setRoute] = useState(initialRoute);

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="ambient" aria-hidden="true" />
        <AnimatePresence mode="wait">
          {route.type === "landing" && (
            <Landing
              key="landing"
              initialCode={route.code}
              onHost={(session) => {
                hostSession.set(session);
                setRoute({ type: "host", session });
              }}
              onJoin={(code) => {
                setJoinParam(code);
                setRoute({ type: "phone", code });
              }}
            />
          )}
          {route.type === "host" && (
            <HostApp
              key={`host-${route.session.code}`}
              session={route.session}
              onEnd={() => {
                hostSession.set(null);
                setRoute({ type: "landing", code: "" });
              }}
            />
          )}
          {route.type === "phone" && (
            <PhoneApp
              key={`phone-${route.code}`}
              code={route.code}
              onLeave={() => {
                setJoinParam(null);
                setRoute({ type: "landing", code: "" });
              }}
            />
          )}
        </AnimatePresence>
      </ToastProvider>
    </MotionConfig>
  );
}
