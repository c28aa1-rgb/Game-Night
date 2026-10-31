import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { defaultTVMethod, detectTVPlatform, getTVGuide, platforms, tvMethods } from "../lib/tvGuide.js";
import Portal from "./Portal.jsx";
import "./tv-guide.css";

export function TVIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 21h8M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="m9 8 6 3-6 3V8Z" fill="currentColor" /></svg>;
}

function WindowsKeys() {
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState(0);
  const press = reduced ? {} : { y: [0, 0, 7, 7, 0], backgroundColor: ["#f6f4ff", "#f6f4ff", "#ffe24a", "#ffe24a", "#f6f4ff"] };
  const timing = { duration: 2.8, times: [0, 0.15, 0.25, 0.8, 1], ease: [0.2, 0, 0, 1] };
  const tap = reduced ? {} : { y: [0, 0, 7, 7, 0, 0], backgroundColor: ["#f6f4ff", "#f6f4ff", "#ffe24a", "#ffe24a", "#f6f4ff", "#f6f4ff"] };
  const tapTiming = { ...timing, times: [0, 0.42, 0.5, 0.62, 0.74, 1] };
  return (
    <div className="tvg-keyboard">
      <div className="tvg-keyboard-context" aria-hidden="true">
        <span>ctrl</span><span>fn</span><span className="is-key">⊞</span><span>alt</span><span className="tvg-spacebar" />
      </div>
      <div className="tvg-key-combo" key={replay} role="img" aria-label="Hold down the Windows logo key and press K once.">
        <motion.div className="tvg-key" animate={press} transition={timing}>
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><path d="M4 4h18v18H4zM26 4h18v18H26zM4 26h18v18H4zM26 26h18v18H26z" fill="currentColor" /></svg>
          <span>Windows</span>
        </motion.div>
        <span className="tvg-key-plus" aria-hidden="true">+</span>
        <motion.div className="tvg-key tvg-key--letter" animate={tap} transition={tapTiming}>K</motion.div>
      </div>
      <div className="tvg-key-help"><span>Hold</span><span>Tap once</span></div>
      <button type="button" className="tvg-replay" onClick={() => setReplay((n) => n + 1)} disabled={reduced}>↻ Replay key press</button>
    </div>
  );
}

function TVGuideDialog({ onClose, returnFocus }) {
  const id = useId();
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const reduced = useReducedMotion();
  const [platform, setPlatform] = useState(detectTVPlatform);
  const [method, setMethod] = useState(() => defaultTVMethod(detectTVPlatform()));
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const guide = getTVGuide(platform, method);
  const current = guide.steps[index];

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  const go = (next) => {
    setDirection(next >= index ? 1 : -1);
    setIndex(Math.max(0, Math.min(guide.steps.length - 1, next)));
  };
  const choosePlatform = (next) => {
    setPlatform(next);
    setMethod(defaultTVMethod(next));
    setIndex(0);
    setDirection(1);
  };
  const chooseMethod = (next) => {
    setMethod(next);
    setIndex(0);
    setDirection(1);
  };

  return (
    <dialog ref={dialog} className="tvg-dialog" aria-labelledby={id + "-title"} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialog.current) onClose(); }} onKeyDown={(event) => {
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled),select:not(:disabled),a[href]")).filter((element) => element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.target.closest("select,input")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
    }}>
      <motion.div className="tvg-shell" initial={{ opacity: 0, y: reduced ? 0 : 22, scale: reduced ? 1 : 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : 0.99 }} transition={{ duration: reduced ? 0.01 : 0.32, ease: [0.2, 0, 0, 1] }}>
        <header className="tvg-header">
          <div className="tvg-heading"><span className="tvg-heading-icon"><TVIcon size={28} /></span><div><p className="tvg-eyebrow">A bigger screen for everyone</p><h2 id={id + "-title"}>Show Karaoke on your TV</h2></div></div>
          <button ref={closeButton} type="button" className="tvg-close" aria-label="Close TV setup guide" onClick={onClose}>×</button>
        </header>
        <div className="tvg-settings">
          <label className="tvg-platform" htmlFor={id + "-platform"}><span>Your device</span><select id={id + "-platform"} aria-label="Your device" value={platform} onChange={(event) => choosePlatform(event.target.value)}>{platforms.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <div className="tvg-methods" role="group" aria-label="Connection method">
            {tvMethods(platform).map(([value, label]) => <button type="button" key={value} aria-pressed={method === value} className={method === value ? "is-selected" : ""} onClick={() => chooseMethod(value)}>{method === value && <motion.span className="tvg-method-highlight" layoutId={id + "-method"} transition={{ duration: reduced ? 0 : 0.2 }} />}<span>{label}</span></button>)}
          </div>
        </div>
        <p className="tvg-requirement">{guide.requirement}</p>
        <nav className="tvg-progress" aria-label="TV setup steps">
          {guide.steps.map((item, i) => <button type="button" key={i} className={index === i ? "is-current" : index > i ? "is-complete" : ""} aria-current={index === i ? "step" : undefined} aria-label={"Step " + (i + 1) + ": " + item.title} onClick={() => go(i)}><span>{index > i ? "✓" : i + 1}</span><span>{guide.labels[i]}</span></button>)}
        </nav>
        <div className="tvg-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={platform + "-" + method + "-" + index} className="tvg-step" initial={{ opacity: 0, x: reduced ? 0 : direction * 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : direction * -10 }} transition={{ duration: reduced ? 0.01 : 0.22, ease: [0.2, 0, 0, 1] }}>
              <figure className="tvg-visual">
                {current.visual === "keys" ? <WindowsKeys /> : <img src={"./tv-guide/" + current.image + ".png"} alt={current.alt} width="1000" height="620" />}
                <figcaption>{current.visual === "keys" ? "On your keyboard • no need to type anything here" : "Illustrated example • menus and TV names may differ"}</figcaption>
              </figure>
              <div className="tvg-instruction" aria-live="polite" aria-atomic="true">
                <span className="tvg-step-count">STEP {index + 1} OF {guide.steps.length}</span>
                <h3>{current.title}</h3>
                <p>{current.text}</p>
                {index === guide.steps.length - 1 && method !== "hdmi" && <span className="tvg-connected-note"><TVIcon size={18} />Once connected, keep the game open on this device.</span>}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="tvg-footer">
          <p>{guide.tip}</p>
          <div className="tvg-navigation"><button type="button" className="tvg-back" disabled={index === 0} onClick={() => go(index - 1)}>← Back</button><button type="button" className="tvg-next" onClick={() => index === guide.steps.length - 1 ? onClose() : go(index + 1)}>{index === guide.steps.length - 1 ? "Done" : "Next step →"}</button></div>
        </footer>
        <div className="tvg-source"><span>Keyboard arrows move between steps.</span><a href={guide.source} target="_blank" rel="noreferrer">Official instructions ↗</a></div>
      </motion.div>
    </dialog>
  );
}

export default function TVGuideButton({ compact = false }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return (
    <>
      <motion.button type="button" ref={trigger} className={compact ? "chip tvg-trigger tvg-trigger--compact" : "tvg-trigger"} aria-haspopup="dialog" onClick={() => setOpen(true)} whileTap={{ scale: 0.98 }}>
        <TVIcon /><span>{compact ? "Show on TV" : "Show this game on a TV"}</span><span className="tvg-trigger-arrow" aria-hidden="true">↗</span>
      </motion.button>
      <Portal><AnimatePresence>{open && <TVGuideDialog key="tv-guide" onClose={() => setOpen(false)} returnFocus={trigger} />}</AnimatePresence></Portal>
    </>
  );
}
