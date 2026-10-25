import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRoom } from "../lib/room.jsx";
import { useToast } from "../lib/toast.jsx";
import { screen, springSoft } from "../lib/motion.js";
import Wipe from "../components/Wipe.jsx";

const AUTO = 10; // seconds before the next singer is called up (they still have to press Start)

export default function HostScore() {
  const { state, send } = useRoom();
  const toast = useToast();
  const score = state.lastScore;
  const next = state.queue[0];
  const [paused, setPaused] = useState(false);
  const next_ = () => send("next", { from: "score" }).catch((e) => toast(e.message));

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(next_, AUTO * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  if (!score) return null;
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
