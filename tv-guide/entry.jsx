import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence } from "motion/react";
import { TVGuideDialog } from "./Guide.jsx";

let activeRoot = null;

export function openTVGuide(trigger) {
  if (activeRoot) return;
  const mount = document.createElement("div");
  mount.className = "gn-tv-guide-root";
  document.body.append(mount);
  const root = createRoot(mount);
  activeRoot = root;
  function cleanup() {
    queueMicrotask(() => {
      root.unmount();
      mount.remove();
      activeRoot = null;
    });
  }
  function Guide() {
    const [open, setOpen] = useState(true);
    return <AnimatePresence onExitComplete={cleanup}>{open && <TVGuideDialog key="tv-guide" onClose={() => setOpen(false)} returnFocus={{ current: trigger }} />}</AnimatePresence>;
  }
  root.render(<Guide />);
}
