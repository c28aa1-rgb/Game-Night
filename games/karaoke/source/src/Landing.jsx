import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createRoom, roomExists } from "./lib/room.jsx";
import { local, useLocal } from "./lib/local.js";
import { rise, screen, springSoft, stagger } from "./lib/motion.js";
import Wipe from "./components/Wipe.jsx";

export default function Landing({ initialCode = "", onHost, onJoin }) {
  const { name: savedName } = useLocal();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(null); // "host" | "join"
  const [error, setError] = useState("");
  const joining = Boolean(initialCode);

  const host = async () => {
    setBusy("host");
    setError("");
    try {
      const { code: c, hostToken } = await createRoom();
      onHost({ code: c, hostToken });
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return setError("Enter the 4-letter code on the TV.");
    if (!name.trim()) return setError("Enter your name so the TV knows who's singing.");
    setBusy("join");
    setError("");
    try {
      if (!(await roomExists(c))) throw new Error("That party code doesn't exist. Check the code on the TV.");
      local.setName(name);
      onJoin(c);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  return (
    <motion.main className="landing" {...screen}>
      <header className="landing-head">
        <span className="wordmark">
          <span className="wordmark-dots" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Karaoke
        </span>
      </header>

      <h1 className="hero-title landing-title">
        <Wipe play delay={0.3} duration={1}>
          {joining ? "You're invited." : "Pick a song."}
        </Wipe>
        <Wipe play delay={1.35} duration={1}>
          Grab the mic.
        </Wipe>
      </h1>

      <motion.div className={`landing-cards ${joining ? "landing-cards--join" : ""}`} variants={stagger(0.08, 0.5)} initial="hidden" animate="show">
        <motion.form className="land-card land-card--join" variants={rise} onSubmit={join}>
          <h2>Join a party</h2>
          <p>Enter the code on the TV, then pick songs from your phone.</p>
          <label className="label" htmlFor="code">
            Party code
          </label>
          <input
            id="code"
            className="field field--code vfd"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            maxLength={4}
          />
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={30} autoComplete="given-name" autoFocus={joining} />
          <motion.button className="btn btn--pink btn--wide" type="submit" disabled={busy === "join"} whileTap={{ scale: 0.97 }}>
            {busy === "join" ? "Joining…" : "Join"}
          </motion.button>
        </motion.form>

        {!joining && (
          <motion.section className="land-card" variants={rise}>
            <h2>Host on this screen</h2>
            <p>Put this on the TV. Everyone scans the code with their phone and adds songs to one queue.</p>
            <motion.button className="btn btn--wide" onClick={host} disabled={busy === "host"} whileTap={{ scale: 0.97 }}>
              {busy === "host" ? "Starting…" : "Start a party"}
            </motion.button>
          </motion.section>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p className="form-error landing-error" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, x: [0, -8, 7, -4, 0] }} exit={{ opacity: 0 }} transition={springSoft}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {!joining && (
        <motion.figure className="landing-poster" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, ...springSoft }}>
          <img src="./poster.png" alt="" />
        </motion.figure>
      )}
    </motion.main>
  );
}
