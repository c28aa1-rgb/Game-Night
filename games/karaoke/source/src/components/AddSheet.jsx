import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { songCode } from "../lib/youtube.js";
import { rise, springPop, stagger } from "../lib/motion.js";

// Confirm a song and who's singing it, then add it to the room's queue.
export default function AddSheet({ song, defaultName = "", suggestions = [], position, onAdd, onClose }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!defaultName) inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, defaultName]);

  const submit = async (singer) => {
    if (!singer.trim()) {
      setError("Enter who's singing.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAdd(singer.trim());
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <motion.div className="scrim scrim--sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-song-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit(name);
        }}
        initial={{ opacity: 0, y: 60, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98, transition: { duration: 0.16 } }}
        transition={springPop}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => info.offset.y > 110 && onClose()}
      >
        <span className="sheet-grab" aria-hidden="true" />
        <header className="sheet-head">
          <span className="code">No. {songCode(song.key)}</span>
          <h2 id="sheet-song-title" className="sheet-title">
            {song.title}
          </h2>
          <p className="sheet-artist">{song.artist}</p>
        </header>

        <label htmlFor="singer" className="label">
          Who's singing?
        </label>
        <input
          ref={inputRef}
          id="singer"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, or names for a duet"
          maxLength={30}
          autoComplete="off"
          enterKeyHint="done"
        />
        {suggestions.length > 0 && (
          <motion.div className="chips" variants={stagger(0.03)} initial="hidden" animate="show">
            {suggestions.map((s) => (
              <motion.button key={s} type="button" className="chip" variants={rise} whileTap={{ scale: 0.94 }} onClick={() => setName(s)}>
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {error && (
            <motion.p className="form-error" role="alert" initial={{ opacity: 0, x: 0 }} animate={{ opacity: 1, x: [0, -8, 7, -4, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.36 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="sheet-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <motion.button type="submit" className="btn btn--pink" whileTap={{ scale: 0.96 }} disabled={busy}>
            {busy ? "Adding…" : position ? `Add to queue · #${position}` : "Add to queue"}
          </motion.button>
        </div>
      </motion.form>
    </motion.div>
  );
}
