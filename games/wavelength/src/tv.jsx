import { React, AnimatePresence, motion, SpectrumArc, useRoomSocket, readRoomFromUrl, scoreWords, teamName, useEffect, useRef, useState } from './shared.jsx';
import { createRoot } from 'react-dom/client';

function App() {
  const [state, setState] = useState(null);
  const [notice, setNotice] = useState('Creating a calibration room...');
  const [soundOn, setSoundOn] = useState(() => window.WavelengthSFX?.enabled ?? true);
  const [result, setResult] = useState(null);
  const last = useRef({ phase: null, marker: null });
  const { connected, emit } = useRoomSocket(({ state: next }) => next && setState(next));

  useEffect(() => {
    if (!connected) return;
    const code = readRoomFromUrl();
    (async () => {
      const result = code ? await emit('watch_room', { code }) : await emit('create_room');
      if (result.error) setNotice(result.error);
      if (result.code) {
        window.history.replaceState({}, '', `/wavelength/tv?room=${result.code}`);
        setNotice('Room ready. Scan the code with each team phone.');
      }
    })();
  }, [connected]);

  const [join, setJoin] = useState(null);
  useEffect(() => {
    if (!state?.code) return;
    fetch(`/wavelength/api/join-info?code=${encodeURIComponent(state.code)}`)
      .then((response) => response.json()).then(setJoin).catch(() => setJoin(null));
  }, [state?.code]);

  const revealedResult = state?.phase === 'reveal' ? state.reveal : null;
  const resultSignature = revealedResult
    ? `${state.code}:${state.turn}:${revealedResult.team}:${revealedResult.targetIndex}:${revealedResult.points}`
    : null;
  useEffect(() => {
    if (!revealedResult || !resultSignature) {
      setResult(null);
      return undefined;
    }
    setResult({ ...revealedResult, key: resultSignature });
    return undefined;
  }, [resultSignature]);

  useEffect(() => {
    if (!state || !soundOn || !window.WavelengthSFX) return;
    const sound = window.WavelengthSFX;
    sound.lobby(state.phase === 'lobby');
    if (last.current.marker !== null && last.current.marker !== state.markerIndex && state.phase === 'guess') sound.tick();
    if (last.current.phase !== state.phase && state.phase === 'reveal') sound.reveal(state.reveal?.points || 0);
    if (last.current.phase !== state.phase && state.phase === 'game_over') sound.win();
    last.current = { phase: state.phase, marker: state.markerIndex };
  }, [state, soundOn]);

  useEffect(() => {
    if (!soundOn || !window.WavelengthSFX) return undefined;
    const unlock = () => window.WavelengthSFX.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [soundOn]);

  function toggleSound() {
    const sound = window.WavelengthSFX;
    if (!sound) return;
    if (!soundOn) { sound.unlock(); sound.setEnabled(true); setSoundOn(true); }
    else { sound.setEnabled(false); setSoundOn(false); }
  }

  if (!state) return <main className="tv tv--loading"><p className="readout">{notice}</p></main>;
  const reveal = state.reveal;
  const roundLabel = state.tiebreaker ? 'SUDDEN DEATH' : `TURN ${Math.min(state.turn + (state.phase !== 'reveal' ? 1 : 0), state.roundCount)} OF ${state.roundCount}`;
  const turnMessage = state.phase === 'clue' ? `${teamName(state.activeTeam)} IS FINDING THE SIGNAL` : state.phase === 'guess' ? `${teamName(state.activeTeam)} IS CALIBRATING` : state.phase === 'reveal' ? 'THE SIGNAL IS REVEALED' : roundLabel;
  return <main className="tv">
    <header className="tv__bar">
      <a className="wordmark" href="/wavelength">WAVELENGTH</a>
      <div className="tv__status"><span className={`lamp ${connected ? 'lamp--on' : ''}`} /><span className="readout">{state.code}</span></div>
      <button className={`sound-toggle ${soundOn ? 'sound-toggle--on' : ''}`} onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? 'Sound on' : 'Enable sound'}</button>
    </header>

    <section className="tv__main">
      <AnimatePresence>
        {result && <motion.aside key={result.key} className="reveal-card" initial={{ opacity: 0, x: 28, scale: 0.94 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 16, scale: 0.98 }} transition={{ duration: 0.34, ease: [0.18, 0.78, 0.18, 1] }}>
          <span className="readout">{teamName(result.team)} · {scoreWords(result.points)}</span><strong>+{result.points}</strong>
        </motion.aside>}
      </AnimatePresence>
      {state.phase === 'lobby' ? <Lobby state={state} join={join} notice={notice} /> : <div className="tv-round">
        <div className="prompt"><span>{state.prompt?.low}</span><i>&harr;</i><span>{state.prompt?.high}</span></div>
        <div className="round-meta"><div className="round-scoreboard" aria-label="Scores and turn status"><div className="score score--1"><span>{teamName(0)}</span><b>{state.scores[0]}</b></div><p className="readout turn-label">{turnMessage}</p><div className="score score--2"><span>{teamName(1)}</span><b>{state.scores[1]}</b></div></div>
          <AnimatePresence>{reveal && <motion.aside className="reveal-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}><span className="readout">{teamName(reveal.team)} · {scoreWords(reveal.points)}</span><strong>+{reveal.points}</strong></motion.aside>}</AnimatePresence>
        </div>
        <div className="tv-dial"><SpectrumArc markerIndex={state.markerIndex} targetIndex={reveal?.targetIndex ?? null} lowLabel={state.prompt?.low} highLabel={state.prompt?.high} /></div>
      </div>}
    </section>

    <AnimatePresence>
      {reveal && <motion.aside className="legacy-reveal-card" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
        <span className="readout">{teamName(reveal.team)} · {scoreWords(reveal.points)}</span><strong>+{reveal.points}</strong><span>{reveal.points === 4 ? 'Dead center.' : reveal.points ? 'The room was close.' : 'The signal was somewhere else.'}</span>
      </motion.aside>}
      {state.phase === 'game_over' && <motion.aside className="winner-card" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.48, ease: [0.05, 0.7, 0.1, 1] }}>
        <span className="readout">FINAL CALIBRATION</span><strong>{teamName(state.winner)} WINS</strong><span>{state.scores[0]} — {state.scores[1]}</span>
      </motion.aside>}
    </AnimatePresence>
  </main>;
}

function Lobby({ state, join, notice }) {
  return <div className="tv-lobby">
    <div className="tv-lobby__copy"><span className="readout">CALIBRATION ROOM</span><h1>Find the point where two minds meet.</h1><p>Two team phones. One shared spectrum. The clue lives in the room.</p>
      <div className="team-lights">{[0, 1].map((team) => <span key={team} className={state.teams[team].connected ? 'ready' : ''}>{teamName(team)} {state.teams[team].connected ? 'READY' : 'WAITING'}</span>)}</div>
    </div>
    <div className="qr-panel">{join?.qr ? <img src={join.qr} alt={`QR code to join room ${state.code}`} /> : <div className="qr-placeholder" />}
      <strong>{state.code}</strong><span>Scan or visit <em>/j/{state.code}</em></span><small>{notice}</small></div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
