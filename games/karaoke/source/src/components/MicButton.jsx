import { AnimatePresence, motion, useTransform } from "framer-motion";
import { useState } from "react";
import { useMic } from "../lib/useMic.jsx";
import { spring, springPop } from "../lib/motion.js";

const SEGMENTS = 10;

function Segment({ level, i }) {
  const threshold = (i + 0.5) / SEGMENTS;
  const opacity = useTransform(level, (v) => (v >= threshold ? 1 : 0.18));
  const hot = i >= SEGMENTS - 2;
  return <motion.span className={`seg ${hot ? "seg--hot" : ""}`} style={{ opacity }} />;
}

export function MicMeter({ vertical = false }) {
  const { level } = useMic();
  return (
    <span className={`meter ${vertical ? "meter--v" : ""}`} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <Segment key={i} level={level} i={i} />
      ))}
    </span>
  );
}

export default function MicButton({ compact = false }) {
  const { status, toggle, monitoring, setMonitoring } = useMic();
  const [open, setOpen] = useState(false);
  const on = status === "on";

  return (
    <div className="mic">
      <motion.button
        className={`chip mic-btn ${on ? "is-on" : ""}`}
        onClick={() => (on ? setOpen((o) => !o) : toggle())}
        whileTap={{ scale: 0.94 }}
        transition={spring}
        aria-expanded={on ? open : undefined}
      >
        <MicIcon />
        {!compact && <span>{status === "starting" ? "Connecting…" : on ? "Mic on" : status === "denied" ? "Mic blocked" : "Use mic"}</span>}
        {on && <MicMeter />}
      </motion.button>
      <AnimatePresence>
        {open && on && (
          <motion.div
            className="popover"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={springPop}
          >
            <label className="toggle">
              <input type="checkbox" checked={monitoring} onChange={(e) => setMonitoring(e.target.checked)} />
              <span className="toggle-track">
                <motion.span className="toggle-knob" layout transition={spring} />
              </span>
              <span>
                <strong>Echo through speakers</strong>
                <small>Use headphones or keep the mic away from speakers to avoid feedback.</small>
              </span>
            </label>
            <button
              className="link"
              onClick={() => {
                toggle();
                setOpen(false);
              }}
            >
              Turn mic off
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {status === "denied" && !compact && <span className="sr-only">Allow microphone access in your browser's site settings, then try again.</span>}
    </div>
  );
}

export function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
