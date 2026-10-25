import { motion } from "framer-motion";

// The CD+G lyric wipe: outlined white text with a colour fill sweeping left → right.
// `play` runs the wipe once on mount; `hover` wipes while the parent `.wipe-trigger` is hovered/focused.
export default function Wipe({ children, as = "span", className = "", play = false, delay = 0, duration = 1.1, fill }) {
  const Tag = motion[as];
  return (
    <Tag className={`wipe ${className}`} style={fill ? { "--wipe-fill": fill } : undefined}>
      <span className="wipe-base">{children}</span>
      <motion.span
        className={`wipe-fill ${play ? "" : "wipe-fill--hover"}`}
        aria-hidden="true"
        initial={play ? { clipPath: "inset(-20% 100% -20% 0%)" } : false}
        animate={play ? { clipPath: "inset(-20% 0% -20% 0%)" } : undefined}
        transition={play ? { delay, duration, ease: [0.45, 0.05, 0.55, 0.95] } : undefined}
      >
        {children}
      </motion.span>
    </Tag>
  );
}
