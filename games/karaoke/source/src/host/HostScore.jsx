import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { useRoom } from "../lib/room.jsx";
import { useToast } from "../lib/toast.jsx";
import { screen, springPop, springSoft } from "../lib/motion.js";
import Wipe from "../components/Wipe.jsx";

const AUTO = 10; // seconds before the next singer is called up (they still have to press Start)

function verdict(h) {
  if (h >= 85) return "Standing ovation";
  if (h >= 65) return "The room was with you";
  if (h >= 40) return "Solid set";
  return "Warm-up round";
}

export default function HostScore() {
  const { state, send } = useRoom();
  const toast = useToast();
  const score = state.lastScore;
  const next = state.queue[0];
  const n = useMotionValue(0);
  const shown = useTransform(n, (v) => String(Math.round(v)).padStart(2, "0"));
  const [paused, setPaused] = useState(false);
  const next_ = () => send("next", { from: "score" }).catch((e) => toast(e.message));

  useEffect(() => {
    if (score?.hype == null) return;
    const c = animate(n, score.hype, { duration: 1.6, ease: [0.05, 0.7, 0.1, 1], delay: 0.5 });
    return () => c.stop();
  }, [score, n]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(next_, AUTO * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  if (!score) return null;
  const hype = score.hype;

  return (
    <motion.main className="score" {...screen}>
      <div className="score-inner">
        <span className="eyebrow">That was</span>
        <h1 className="score-singer">
          <Wipe play delay={0.2} duration={0.8}>
            {score.singer}
          </Wipe>
        </h1>
        <p className="score-song">
          {score.song.title}
          <span className="upnext-artist">{score.song.artist}</span>
        </p>

        {hype != null ? (
          <motion.div className="hype" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, ...springPop }}>
            <span className="label">Hype</span>
            <motion.span className="hype-num vfd">{shown}</motion.span>
            <div className="hype-bar">
              <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: hype / 100 }} transition={{ duration: 1.6, delay: 0.5, ease: [0.05, 0.7, 0.1, 1] }} />
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1 }}>
              {verdict(hype)}
            </motion.p>
          </motion.div>
        ) : (
          <motion.p className="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            Turn the mic on to get a hype score.
          </motion.p>
        )}

        <motion.div className="score-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, ...springSoft }}>
          <motion.button className="btn btn--pink btn--timer" onClick={next_} whileTap={{ scale: 0.96 }}>
            <span>{next ? `Next: ${next.singer}` : "Back to the queue"}</span>
            {!paused && <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: AUTO, ease: "linear" }} aria-hidden="true" />}
          </motion.button>
          <button className="btn btn--ghost" onClick={() => setPaused(true)} disabled={paused}>
            {paused ? "Waiting for you" : "Wait"}
          </button>
        </motion.div>
      </div>
    </motion.main>
  );
}
