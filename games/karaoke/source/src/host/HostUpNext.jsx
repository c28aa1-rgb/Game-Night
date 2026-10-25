import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRoom } from "../lib/room.jsx";
import { useToast } from "../lib/toast.jsx";
import { songCode } from "../lib/youtube.js";
import { screen, springSoft } from "../lib/motion.js";
import Wipe from "../components/Wipe.jsx";

// Waits for Start — from the TV, or from the singer's phone. Nothing plays on its own.
export default function HostUpNext({ v }) {
  const { state, send } = useRoom();
  const toast = useToast();
  const [link, setLink] = useState("");
  const entry = state.current;
  const after = state.queue[0];
  const ready = Boolean(v.video);

  const run = (action, payload) => send(action, payload).catch((e) => toast(e.message));

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input")) return;
      if ((e.key === "Enter" || e.key === " ") && ready) {
        e.preventDefault();
        run("go");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!entry) return null;

  return (
    <motion.main className="upnext" {...screen}>
      <motion.div
        className="upnext-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${v.video?.thumb || entry.song.art || ""})` }}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1.05, opacity: 0.22 }}
        transition={{ duration: 4, ease: "easeOut" }}
      />
      <div className="upnext-inner">
        <motion.span className="eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, ...springSoft }}>
          Up next
        </motion.span>
        <h1 className="upnext-singer">
          <Wipe play delay={0.3} duration={0.9}>
            {entry.singer}
          </Wipe>
        </h1>
        <motion.p className="upnext-song" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, ...springSoft }}>
          <span className="code">No. {songCode(entry.song.key)}</span>
          {entry.song.title}
          <span className="upnext-artist">{entry.song.artist}</span>
        </motion.p>

        <div className="upnext-video" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            {v.status === "finding" && (
              <motion.p key="finding" className="finder-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <span className="finder-dots" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.i key={i} animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }} />
                  ))}
                </span>
                Finding the karaoke video…
              </motion.p>
            )}
            {v.video && (
              <motion.div key={v.video.id} className="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springSoft}>
                <img src={v.video.thumb} alt="" />
                <span>
                  <strong>Video ready</strong> · {v.video.channel || "YouTube"}
                </span>
                {v.items.length > 1 && (
                  <button className="link" onClick={v.another}>
                    Try another version
                  </button>
                )}
              </motion.div>
            )}
            {v.status === "error" && (
              <motion.div key="error" className="finder-error finder-error--tv" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -8, 7, -4, 0] }} exit={{ opacity: 0 }}>
                <p>{v.error.message}</p>
                <form
                  className="setup-row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!(await v.useLink(link))) toast("That isn't a YouTube link.");
                  }}
                >
                  <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link" aria-label="YouTube link" />
                  <button className="btn btn--ghost" type="submit">
                    Use link
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div className="upnext-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <motion.button className="btn btn--pink btn--big" onClick={() => run("go")} disabled={!ready} whileTap={{ scale: 0.96 }} whileHover={ready ? { y: -2 } : undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
            </svg>
            Start
          </motion.button>
          <button className="btn btn--ghost" onClick={() => run("next", { from: "upnext" })}>
            Skip {entry.singer}
          </button>
          <button className="btn btn--ghost" onClick={() => run("stop")}>
            Back to queue
          </button>
        </motion.div>
        {entry.deviceId && (
          <motion.p className="after" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
            {entry.singer} can also press Start on their phone.
          </motion.p>
        )}
        {after && (
          <motion.p className="after" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
            After this: <strong>{after.singer}</strong> · {after.song.title}
          </motion.p>
        )}
      </div>
    </motion.main>
  );
}
