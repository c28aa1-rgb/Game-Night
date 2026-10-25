import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "../lib/room.jsx";
import { useToast } from "../lib/toast.jsx";
import { screen, spring, springSoft } from "../lib/motion.js";
import Wipe from "../components/Wipe.jsx";
import Songbook from "../components/Songbook.jsx";
import AddSheet from "../components/AddSheet.jsx";
import MicButton from "../components/MicButton.jsx";
import Portal from "../components/Portal.jsx";

function QueueItem({ entry, index, onRemove }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={controls}
      className="lq-item"
      initial={{ opacity: 0, x: 60, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, scale: 0.94, transition: { duration: 0.18 } }}
      transition={spring}
      whileDrag={{ scale: 1.03, boxShadow: "0 22px 50px -16px rgba(5,8,50,.8)", zIndex: 5 }}
    >
      <button className="lq-grip" onPointerDown={(e) => controls.start(e)} aria-label={`Drag to move ${entry.singer}`}>
        <span className="vfd">{String(index + 1).padStart(2, "0")}</span>
      </button>
      {entry.song.art && <img src={entry.song.art} alt="" />}
      <div className="lq-text">
        <strong>{entry.singer}</strong>
        <span>
          {entry.song.title} · {entry.song.artist}
        </span>
      </div>
      <button className="icon-btn icon-btn--quiet" onClick={() => onRemove(entry.id)} aria-label={`Remove ${entry.song.title} for ${entry.singer}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </Reorder.Item>
  );
}

export default function Lobby() {
  const { state, send } = useRoom();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState(null);
  const [order, setOrder] = useState(state.queue);
  const [shuffling, setShuffling] = useState(false);
  const dragging = useRef(false);

  // Follow the server's order, except mid-drag.
  useEffect(() => {
    if (!dragging.current) setOrder(state.queue);
  }, [state.queue]);

  const run = (action, payload) => send(action, payload).catch((e) => toast(e.message));
  const queue = order;
  const singers = [...new Set([...state.queue.map((e) => e.singer), ...state.history.map((h) => h.singer)])].slice(0, 8);

  const shuffle = async () => {
    setShuffling(true);
    await run("shuffle");
    setTimeout(() => setShuffling(false), 500);
  };

  return (
    <motion.main className="lobby" {...screen}>
      <div className="lobby-top">
        <h1 className="lobby-title">
          <Wipe play delay={0.3} duration={0.9}>
            Scan to pick
          </Wipe>
          <Wipe play delay={1.2} duration={0.8}>
            a song.
          </Wipe>
        </h1>
        <div className="lobby-actions">
          <a className="chip nav-back" href="/">
            &larr; Game night
          </a>
          <MicButton />
        </div>
      </div>

      <section className="lq" aria-labelledby="lq-title">
        <header className="lq-head">
          <h2 id="lq-title">
            Queue <span className="vfd vfd--count">{String(queue.length).padStart(2, "0")}</span>
          </h2>
          <div className="lq-actions">
            <motion.button className="btn btn--ghost" onClick={shuffle} disabled={queue.length < 2} whileTap={{ scale: 0.95 }}>
              <motion.svg width="18" height="18" viewBox="0 0 24 24" animate={{ rotate: shuffling ? 360 : 0 }} transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }} aria-hidden="true">
                <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
              Randomize order
            </motion.button>
            <motion.button className="btn btn--pink btn--big" onClick={() => run("startShow")} disabled={!queue.length} whileTap={{ scale: 0.96 }} whileHover={{ y: -2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
              </svg>
              Start
            </motion.button>
          </div>
        </header>

        {queue.length === 0 ? (
          <motion.div className="lq-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="dots dots--idle" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <motion.span key={i} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }} />
              ))}
            </div>
            <p>Waiting for songs. Point a phone camera at the code to join.</p>
          </motion.div>
        ) : (
          <Reorder.Group
            axis="y"
            values={queue}
            onReorder={(q) => {
              dragging.current = true;
              setOrder(q);
            }}
            onPointerUp={() => {
              if (!dragging.current) return;
              dragging.current = false;
              run("reorder", { ids: order.map((e) => e.id) });
            }}
            className="lq-list"
          >
            <AnimatePresence initial={false}>
              {queue.map((entry, i) => (
                <QueueItem key={entry.id} entry={entry} index={i} onRemove={(id) => run("remove", { id })} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}

        <div className="lq-foot">
          <button className="link" onClick={() => setAdding(true)}>
            Add a song from this screen
          </button>
          {queue.length > 0 && (
            <button className="link" onClick={() => run("clear")}>
              Clear queue
            </button>
          )}
        </div>
      </section>

      {state.history.length > 0 && (
        <section className="history">
          <span className="eyebrow">Tonight's set</span>
          <ul>
            {state.history.slice(0, 6).map((h) => (
              <li key={h.at}>
                <span>
                  <strong>{h.singer}</strong> {h.song.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Portal>
        <AnimatePresence>
          {adding && (
            <motion.div className="tv-book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="tv-book-panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={springSoft}>
                <header className="tv-book-head">
                  <h2>Add a song</h2>
                  <motion.button className="btn btn--ghost" onClick={() => setAdding(false)} whileTap={{ scale: 0.95 }}>
                    Done
                  </motion.button>
                </header>
                <Songbook autoFocus onPick={setPicked} queued={(key) => state.queue.filter((e) => e.song.key === key).length} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {picked && (
            <AddSheet
              song={picked}
              suggestions={singers}
              position={state.queue.length + 1}
              onAdd={(singer) => send("add", { song: picked, singer })}
              onClose={() => setPicked(null)}
            />
          )}
        </AnimatePresence>
      </Portal>
    </motion.main>
  );
}
