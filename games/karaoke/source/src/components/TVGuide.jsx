import { motion } from "framer-motion";
import "./tv-guide.css";

export default function TVGuideButton({ compact = false }) {
  return <motion.button type="button" data-tv-guide aria-haspopup="dialog" className={compact ? "tvg-trigger tvg-trigger--compact" : "tvg-trigger"} whileTap={{ scale: 0.98 }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 21h8M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    <span>{compact ? "Show on TV" : "Show this game on a TV"}</span><span className="tvg-trigger-arrow" aria-hidden="true">↗</span>
  </motion.button>;
}
