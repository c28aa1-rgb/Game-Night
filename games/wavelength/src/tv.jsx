import { React, AnimatePresence, motion, SpectrumArc, useRoomSocket, readRoomFromUrl, scoreWords, teamName, useEffect, useRef, useState } from './shared.jsx';
import { createRoot } from 'react-dom/client';

const CONFETTI = Array.from({ length: 72 }, (_, index) => ({
  id: index,
  left: (index * 37) % 100,
  delay: -((index * 83) % 2400),
  duration: 2200 + ((index * 97) % 1900),
  drift: ((index % 9) - 4) * 18,
  colour: ['#e97257', '#f4c85a', '#6cc0d4', '#47799e', '#fffaf1'][index % 5],
}));

function App() {
  const [state, setState] = useState(null);
  const [notice, setNotice] = useState('Creating a calibration room...');
  const [soundOn, setSoundOn] = useState(() => window.WavelengthSFX?.enabled ?? true);
  const [result, setResult] = useState(null);
  const last = useRef({ phase: null, marker: null, prompt: null, seats: null });
  const { connected, emit } = useRoomSocket(({ state: next }) => next && setState(next));

  useEffect(() => {
    if (!connected) return;
    const code = readRoomFromUrl();
    (async () => {
      const response = code ? await emit('watch_room', { code }) : await emit('create_room');
      if (response.error) setNotice(response.error);
      if (response.code) {
        window.history.replaceState({}, '', `/wavelength/tv?room=${response.code}`);
        setNotice('Room ready. Scan the code with all four phones.');
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
    if (!revealedResult || !resultSignature) { setResult(null); return undefined; }
    setResult({ ...revealedResult, key: resultSignature });
    return undefined;
  }, [resultSignature]);

  useEffect(() => {
    if (!state || !soundOn || !window.WavelengthSFX) return;
    const sound = window.WavelengthSFX;
    const prompt = `${state.prompt?.low || ''}|${state.prompt?.high || ''}`;
    const seats = state.teams.reduce((total, team) => total + Number(team.clueConnected) + Number(team.guessConnected), 0);
    sound.lobby(state.phase === 'lobby');
    if (state.phase === 'lobby' && last.current.seats !== null && seats > last.current.seats) sound.seatReady(seats);
    if (last.current.phase !== state.phase && state.phase === 'clue') sound.roundStart();
    if (last.current.phase !== state.phase && state.phase === 'guess') sound.guessOpen();
    if (last.current.phase === 'clue' && state.phase === 'clue' && last.current.prompt && last.current.prompt !== prompt) sound.skip();
    if (last.current.marker !== null && last.current.marker !== state.markerIndex && state.phase === 'guess') sound.tick();
    if (last.current.phase !== state.phase && state.phase === 'reveal') sound.reveal(state.reveal?.points || 0);
    if (last.current.phase !== state.phase && state.phase === 'game_over') sound.win();
    last.current = { phase: state.phase, marker: state.markerIndex, prompt, seats };
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
  const roundLabel = state.tiebreaker ? 'SUDDEN DEATH' : `ROUND ${Math.min(state.turn + (state.phase !== 'reveal' ? 1 : 0), state.roundCount)} OF ${state.roundCount}`;
  const turnMessage = state.phase === 'clue' ? `${teamName(state.activeTeam)} CLUE GIVER IS READING THE SIGNAL` : state.phase === 'guess' ? `${teamName(state.activeTeam)} GUESSING PHONE IS CALIBRATING` : state.phase === 'reveal' ? 'THE SIGNAL IS REVEALED' : roundLabel;
  return <main className="tv">
    <header className="tv__bar">
      <a className="wordmark" href="/wavelength">WAVELENGTH</a>
      <div className="tv__status"><span className={`lamp ${connected ? 'lamp--on' : ''}`} /><span className="readout">{state.code}</span></div>
      <button className={`sound-toggle ${soundOn ? 'sound-toggle--on' : ''}`} onClick={toggleSound} aria-pressed={soundOn}>{soundOn ? 'Sound on' : 'Enable sound'}</button>
    </header>

    <section className="tv__main">
      <AnimatePresence>
        {state.phase !== 'lobby' && state.phase !== 'game_over' && <motion.aside key={`rounds-${state.turn}`} className="rounds-card" initial={{ opacity: 0, x: -28, scale: 0.94 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.34, ease: [0.18, 0.78, 0.18, 1] }}>
          <strong>{state.tiebreaker ? '∞' : state.roundsRemaining}</strong><span className="readout">{state.tiebreaker ? 'SUDDEN DEATH' : `ROUND${state.roundsRemaining === 1 ? '' : 'S'} REMAIN`}</span>
        </motion.aside>}
        {result && <motion.aside key={result.key} className="reveal-card" initial={{ opacity: 0, x: 28, scale: 0.94 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 16, scale: 0.98 }} transition={{ duration: 0.34, ease: [0.18, 0.78, 0.18, 1] }}>
          <span className="readout">{teamName(result.team)} · {scoreWords(result.points)}</span><strong>+{result.points}</strong>
        </motion.aside>}
      </AnimatePresence>
      {state.phase === 'lobby' ? <Lobby state={state} join={join} notice={notice} /> : <div className="tv-round">
        <div className="prompt"><span>{state.prompt?.low}</span><i>&harr;</i><span>{state.prompt?.high}</span></div>
        <div className="round-meta"><div className="round-scoreboard" aria-label="Scores and turn status"><div className="score score--1"><span>{teamName(0)}</span><b>{state.scores[0]}</b></div><p className="readout turn-label">{turnMessage}</p><div className="score score--2"><span>{teamName(1)}</span><b>{state.scores[1]}</b></div></div></div>
        <div className="tv-dial"><SpectrumArc markerIndex={state.markerIndex} targetIndex={reveal?.targetIndex ?? null} lowLabel={state.prompt?.low} highLabel={state.prompt?.high} /></div>
      </div>}
    </section>

    <AnimatePresence>
      {state.phase === 'game_over' && <Winner state={state} />}
    </AnimatePresence>
  </main>;
}

function Winner({ state }) {
  return <motion.aside className="winner-card" role="dialog" aria-label={`${teamName(state.winner)} wins`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.42, ease: [0.2, 0, 0, 1] }}>
    <div className="confetti-field" aria-hidden="true">{CONFETTI.map((piece) => <i key={piece.id} style={{ '--left': `${piece.left}%`, '--delay': `${piece.delay}ms`, '--duration': `${piece.duration}ms`, '--drift': `${piece.drift}px`, '--confetti': piece.colour }} />)}</div>
    <motion.div className="winner-card__copy" initial={{ y: 34, scale: 0.86 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.82, delay: 0.12, ease: [0.175, 0.885, 0.32, 1.18] }}>
      <span className="readout">FINAL CALIBRATION</span><strong>{teamName(state.winner)}</strong><b>WINS</b><span>{state.scores[0]} — {state.scores[1]}</span>
    </motion.div>
  </motion.aside>;
}

function Lobby({ state, join, notice }) {
  return <div className="tv-lobby">
    <div className="tv-lobby__copy"><span className="readout">CALIBRATION ROOM</span><h1>Find the point where two minds meet.</h1><p>Four phones. Two clue givers. Two guessing controls. One shared spectrum.</p>
      <div className="team-lights">{state.teams.flatMap((team, index) => [<span key={`${index}-clue`} className={team.clueConnected ? 'ready' : ''}>{teamName(index)} CLUE {team.clueConnected ? 'READY' : 'WAITING'}</span>, <span key={`${index}-guess`} className={team.guessConnected ? 'ready' : ''}>{teamName(index)} GUESS {team.guessConnected ? 'READY' : 'WAITING'}</span>])}</div>
    </div>
    <div className="qr-panel">{join?.qr ? <img src={join.qr} alt={`QR code to join room ${state.code}`} /> : <div className="qr-placeholder" />}
      <strong>{state.code}</strong><span>Scan or visit <em>/j/{state.code}</em></span><small>{notice}</small></div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
