import { motion } from "framer-motion";
import { useMic } from "../lib/useMic.jsx";
import { spring } from "../lib/motion.js";

export default function MicButton({ compact = false, active = false }) {
  const { status, toggle } = useMic();
  const on = status === "on";
  const label = status === "starting" ? "Connecting…" : on ? (active ? "Mic live" : "Mic ready") : status === "denied" ? "Mic blocked" : "Enable mic";

  return (
    <div className="mic">
      <motion.button
        className={`chip mic-btn ${on ? "is-on" : ""}`}
        onClick={toggle}
        whileTap={{ scale: 0.94 }}
        transition={spring}
        aria-pressed={on}
        aria-label={compact ? `${label}. ${on ? "Turn microphone off" : "Turn microphone on"}` : undefined}
      >
        <MicIcon />
        {!compact && <span>{label}</span>}
      </motion.button>
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
