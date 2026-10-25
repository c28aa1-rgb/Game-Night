import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { RoomProvider, useRoom } from "../lib/room.jsx";
import { useLocal } from "../lib/local.js";
import { useToast } from "../lib/toast.jsx";
import { spring, springPop, springSoft } from "../lib/motion.js";
import Songbook from "../components/Songbook.jsx";
import AddSheet from "../components/AddSheet.jsx";
import Portal from "../components/Portal.jsx";
import Wipe from "../components/Wipe.jsx";

function YoureUp({ entry, onStart }) {
  const [busy, setBusy] = useState(false);
  return (
    <motion.div className="up-takeover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="up-card" initial={{ scale: 0.85, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={springPop}>
        <span className="eyebrow">You're up</span>
        <h2 className="up-name">
          <Wipe play delay={0.2} duration={0.8}>
            {entry.singer}
          </Wipe>
        </h2>
        <p className="up-song">
          {entry.song.title}
          <span>{entry.song.artist}</span>
        </p>
        <motion.button
          className="up-start"
          onClick={async () => {
            setBusy(true);
            try {
              await onStart();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          whileTap={{ scale: 0.94 }}
          animate={{ boxShadow: ["0 0 0 0 rgba(255,62,165,.55)", "0 0 0 22px rgba(255,62,165,0)"] }}
          transition={{ boxShadow: { duration: 1.4, repeat: Infinity, ease: "easeOut" } }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
          </svg>
          {busy ? "Starting…" : "Start"}
        </motion.button>
        <p className="hint">Walk up to the mic, then press Start. The TV counts you in.</p>
      </motion.div>
    </motion.div>
  );
}

function QueueView({ me }) {
  const { state, send } = useRoom();
  const toast = useToast();
  const mine = (e) => e.deviceId === me;
  const firstMine = state.queue.findIndex(mine);

  return (
    <div className="pq">
      {state.current && (
        <div className={`pq-now ${mine(state.current) ? "is-me" : ""}`}>
          <span className="label">{state.phase === "playing" ? "Singing now" : "Up now"}</span>
          <strong>{state.current.singer}</strong>
          <span>
            {state.current.song.title} · {state.current.song.artist}
          </span>
        </div>
      )}
      {firstMine >= 0 && (
        <p className="pq-wait">
          {firstMine === 0 ? "You're next." : `Your next song is ${firstMine + 1} in line.`}
        </p>
      )}
      {state.queue.length === 0 ? (
        <p className="hint">The queue is empty. Pick a song to get things going.</p>
      ) : (
        <ul className="pq-list">
          <AnimatePresence initial={false}>
            {state.queue.map((e, i) => (
              <motion.li key={e.id} layout className={`pq-item ${mine(e) ? "is-me" : ""}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={spring}>
                <span className="vfd">{String(i + 1).padStart(2, "0")}</span>
                <div className="pq-text">
                  <strong>{e.singer}</strong>
                  <span>
                    {e.song.title} · {e.song.artist}
                  </span>
                </div>
                {mine(e) && (
                  <button className="icon-btn icon-btn--quiet" onClick={() => send("remove", { id: e.id }).catch((err) => toast(err.message))} aria-label={`Remove ${e.song.title}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function Remote({ onLeave }) {
  const { code, state, status, send } = useRoom();
  const { deviceId, name } = useLocal();
  const toast = useToast();
  const [tab, setTab] = useState("songs");
  const [picked, setPicked] = useState(null);

  if (!state) return <div className="boot" aria-label="Connecting" />;
  const myTurn = state.phase === "upnext" && state.current?.deviceId === deviceId;
  const mineCount = state.queue.filter((e) => e.deviceId === deviceId).length;

  return (
    <div className="phone">
      <header className="phone-top">
        <div className="phone-room">
          <span className="wordmark-dots" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="vfd">{code}</span>
          {status !== "live" && <span className="phone-off">{status === "gone" ? "Party ended" : "Reconnecting…"}</span>}
        </div>
        <button className="chip" onClick={onLeave} aria-label={`Leave party${name ? ` as ${name}` : ""}`}>
          &larr; Leave party
        </button>
      </header>

      <nav className="phone-tabs" role="tablist">
        {[
          ["songs", "Pick a song"],
          ["queue", `Queue · ${state.queue.length}`],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`phone-tab ${tab === id ? "is-on" : ""}`} onClick={() => setTab(id)}>
            {tab === id && <motion.span layoutId="phone-tab" className="phone-tab-pill" transition={spring} />}
            <span className="filter-label">
              {label}
              {id === "queue" && mineCount > 0 && <i className="dot-badge" aria-label={`${mineCount} of yours`} />}
            </span>
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} className="phone-body" initial={{ opacity: 0, x: tab === "queue" ? 30 : -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: tab === "queue" ? 30 : -30 }} transition={springSoft}>
          {tab === "songs" ? (
            <Songbook onPick={setPicked} queued={(key) => state.queue.filter((e) => e.song.key === key && e.deviceId === deviceId).length} />
          ) : (
            <QueueView me={deviceId} />
          )}
        </motion.div>
      </AnimatePresence>

      <Portal>
        <AnimatePresence>
          {picked && (
            <AddSheet
              song={picked}
              defaultName={name}
              position={state.queue.length + 1}
              onAdd={(singer) => send("add", { song: picked, singer })}
              onClose={() => setPicked(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>{myTurn && <YoureUp key={state.current.id} entry={state.current} onStart={() => send("go").catch((e) => toast(e.message))} />}</AnimatePresence>
      </Portal>
    </div>
  );
}

export default function PhoneApp({ code, onLeave }) {
  const toast = useToast();
  return (
    <RoomProvider
      code={code}
      onGone={() => {
        toast("That party has ended.");
        onLeave();
      }}
    >
      <Remote onLeave={onLeave} />
    </RoomProvider>
  );
}

