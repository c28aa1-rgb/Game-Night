import { React, AnimatePresence, motion, SpectrumArc, useRoomSocket, readRoomFromUrl, teamName, useEffect, useRef, useState } from './shared.jsx';
import { createRoot } from 'react-dom/client';

function App() {
  const [state, setState] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState('');
  const { connected, emit } = useRoomSocket((update) => {
    if (update.state) setState(update.state);
    if (update.privateState) setPrivateState(update.privateState);
  });
  const codeFromUrl = readRoomFromUrl();

  useEffect(() => {
    if (!connected || !joined) return;
    emit('join_team', { code: joined.code, team: joined.team, role: joined.role, token: joined.token }).then((result) => {
      if (result.error) setError(result.error);
      else if (result.token && result.token !== joined.token) {
        const next = { ...joined, token: result.token };
        setJoined(next); localStorage.setItem(`arcade.wavelength.${next.code}`, JSON.stringify(next));
      }
    });
  }, [connected]);

  async function join(code, team, role) {
    const remembered = (() => { try { return JSON.parse(localStorage.getItem(`arcade.wavelength.${code}`) || 'null'); } catch { return null; } })();
    const sameSeat = remembered?.team === team && remembered?.role === role;
    const result = await emit('join_team', { code, team, role, token: sameSeat ? remembered.token : '' });
    if (result.error) return setError(result.error);
    const next = { code, team, role, token: result.token };
    localStorage.setItem(`arcade.wavelength.${code}`, JSON.stringify(next));
    setJoined(next); setError('');
  }

  if (!joined) return <Join code={codeFromUrl} connected={connected} onJoin={join} error={error} />;
  if (!state || !privateState) return <main className="play play--loading"><p className="readout">SYNCING WITH THE TV...</p></main>;
  return <Controller state={state} privateState={privateState} emit={emit} error={error} setError={setError} />;
}

function Join({ code: initialCode, connected, onJoin, error }) {
  const [code, setCode] = useState(initialCode);
  const [teams, setTeams] = useState(null);
  useEffect(() => {
    const roomCode = code.trim().toUpperCase();
    if (roomCode.length < 4) { setTeams(null); return undefined; }
    let active = true;
    fetch(`/wavelength/api/join-info?code=${encodeURIComponent(roomCode)}`)
      .then((response) => response.json())
      .then((data) => { if (active) setTeams(Array.isArray(data.teams) ? data.teams : []); })
      .catch(() => { if (active) setTeams([]); });
    return () => { active = false; };
  }, [code]);
  const roomCode = code.trim().toUpperCase();
  const remembered = (() => { try { return JSON.parse(localStorage.getItem(`arcade.wavelength.${roomCode}`) || 'null'); } catch { return null; } })();
  function phoneButton(team, role) {
    const phoneState = teams?.[team]?.[role];
    const mine = remembered?.team === team && remembered?.role === role;
    const occupied = Boolean(phoneState?.occupied);
    const unavailable = occupied && !mine;
    const ready = connected && roomCode.length >= 4 && teams !== null && !unavailable;
    const roleName = role === 'clue' ? 'Clue giver' : 'Guessing phone';
    const label = unavailable ? `${roleName} joined` : mine ? `Rejoin ${roleName}` : roleName;
    const sublabel = unavailable ? 'Seat is in use' : phoneState?.connected ? 'This phone can rejoin' : mine ? 'Saved on this phone' : 'Available';
    return <button key={`${team}-${role}`} className={unavailable ? 'team-choice team-choice--taken' : 'team-choice'} disabled={!ready} onClick={() => onJoin(roomCode, team, role)}><b>0{team + 1}</b><span>{teamName(team)} · {label}</span><small>{sublabel}</small></button>;
  }
  return <main className="play join-screen"><a className="back-link" href="/wavelength">&larr; Game night</a><header><span className="readout">FOUR-PHONE CALIBRATION</span><h1>WAVELENGTH</h1><p>Choose this phone’s permanent team role.</p></header>
    <label className="code-field"><span>ROOM CODE</span><input value={code} maxLength="8" onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="WAVE" /></label>
    <p className="join-team-status" aria-live="polite">{roomCode.length < 4 ? 'Enter the room code to see phone availability.' : teams === null ? 'Checking phone availability…' : 'Each seat stays locked to its original phone.'}</p>
    <div className="join-teams">{[0, 1].flatMap((team) => ['clue', 'guess'].map((role) => phoneButton(team, role)))}</div>
    {error && <p className="error">{error}</p>}</main>;
}

function Controller({ state, privateState, emit, error, setError }) {
  const active = privateState.isActive;
  async function act(event, payload) { const result = await emit(event, payload); if (result.error) setError(result.error); else setError(''); }
  let panel;
  if (state.phase === 'lobby') panel = <Setup state={state} act={act} />;
  else if (state.phase === 'clue' && privateState.canShowTarget) panel = <Clue state={state} privateState={privateState} act={act} />;
  else if (state.phase === 'guess' && privateState.canMove) panel = <Guess state={state} privateState={privateState} act={act} />;
  else if (state.phase === 'reveal') panel = <Wait state={state} act={act} text="The room can see the target now." button="Next signal" />;
  else if (state.phase === 'game_over') panel = <Wait state={state} act={act} text={`${teamName(state.winner)} has the clearest signal.`} button="New session" event="reset_room" />;
  else panel = <Wait state={state} act={act} text={state.phase === 'clue' ? `${teamName(state.activeTeam)}’s clue giver is reading the target.` : `${teamName(state.activeTeam)}’s guessing phone is moving the marker.`} />;
  return <main className="play"><header className="play__bar"><a href="/wavelength" className="wordmark">WAVELENGTH</a><span className="phone-role"><b>{teamName(privateState.team)}</b><em>{privateState.roleLabel}</em><small>{state.code}</small></span></header>
    <div className="phone-score"><span>TEAM 1 <b>{state.scores[0]}</b></span><span>TEAM 2 <b>{state.scores[1]}</b></span></div>
    <AnimatePresence mode="wait"><motion.section key={`${state.phase}-${active}-${state.turn}-${privateState.team}-${privateState.role}`} className="phone-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}>{panel}</motion.section></AnimatePresence>
    {error && <p className="error error--fixed">{error}</p>}
  </main>;
}

function Setup({ state, act }) {
  return <><span className="readout">ROOM SETUP</span><h1>Calibrate the night.</h1><p>All four phones stay in one role for the full game.</p><div className="round-stepper"><button onClick={() => act('set_rounds', { rounds: state.roundCount - 1 })} disabled={state.roundCount <= 3}>&minus;</button><div><b>{state.roundCount}</b><span>ROUNDS</span></div><button onClick={() => act('set_rounds', { rounds: state.roundCount + 1 })} disabled={state.roundCount >= 10}>+</button></div>
    <div className="ready-row ready-row--phones">{state.teams.flatMap((team, index) => [<span key={`${index}-clue`} className={team.clueConnected ? 'ready' : ''}>{teamName(index)} CLUE {team.clueConnected ? 'READY' : 'WAITING'}</span>, <span key={`${index}-guess`} className={team.guessConnected ? 'ready' : ''}>{teamName(index)} GUESS {team.guessConnected ? 'READY' : 'WAITING'}</span>])}</div><button className="primary" disabled={!state.teams.every((team) => team.connected)} onClick={() => act('start_game')}>Start calibration</button></>;
}

function Clue({ state, privateState, act }) {
  const [confirmSkip, setConfirmSkip] = useState(false);
  return <><span className="readout">EYES ONLY · CLUE-GIVER PHONE</span><h1>Read the signal.</h1><p>Give one clue aloud. Keep this target hidden from both guessing phones.</p><div className="private-spectrum"><SpectrumArc markerIndex={privateState.targetIndex} targetIndex={privateState.targetIndex} privateView lowLabel={state.prompt.low} highLabel={state.prompt.high} /></div><button className="primary" onClick={() => act('clue_given')}>I gave the clue</button>{confirmSkip ? <div className="skip-confirm" role="group" aria-label="Confirm prompt skip"><p>Skip this target and draw a new one?</p><button onClick={() => setConfirmSkip(false)}>Keep it</button><button className="skip-confirm__yes" onClick={() => { act('skip_prompt'); setConfirmSkip(false); }}>Yes, skip</button></div> : <button className="secondary skip-button" onClick={() => setConfirmSkip(true)}>Skip this prompt</button>}</>;
}

function Guess({ state, privateState, act }) {
  const hold = useRef(null);
  function stop(event) {
    const current = hold.current;
    if (!current || (event?.pointerId !== undefined && current.pointerId !== event.pointerId)) return;
    clearTimeout(current.delay); clearInterval(current.repeat); hold.current = null;
  }
  function nudge(delta) { act('move_marker', { delta }); }
  function start(delta, event) {
    if (!privateState.canMove) return;
    stop();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const current = { pointerId: event.pointerId, delay: null, repeat: null };
    hold.current = current;
    nudge(delta);
    current.delay = setTimeout(() => {
      if (hold.current !== current) return;
      current.repeat = setInterval(() => nudge(delta), 82);
    }, 320);
  }
  useEffect(() => {
    const cancel = () => stop();
    window.addEventListener('pointerup', cancel); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', cancel);
    return () => { cancel(); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, []);
  return <><span className="readout">TEAM {privateState.team + 1} · GUESSING PHONE</span><h1>Where does the clue land?</h1><p>The TV marker moves with every press. Talk it through, then lock it.</p><div className="controller"><button className="arrow" aria-label="Move marker left" onPointerDown={(event) => start(-1, event)} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>&larr;</button><div className="position"><b>{state.markerIndex + 1}</b><span>OF 61</span></div><button className="arrow" aria-label="Move marker right" onPointerDown={(event) => start(1, event)} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>&rarr;</button></div><button className="primary primary--lock" onClick={() => act('lock_guess')}>Lock this signal</button></>;
}

function Wait({ state, act, text, button, event = 'advance' }) { return <><span className="readout">{state.tiebreaker ? 'SUDDEN DEATH' : 'STANDBY'}</span><h1>{text}</h1><p>{button ? 'Any phone can continue when the room is ready.' : 'Your role stays fixed. Watch the shared screen for the handoff.'}</p>{button && <button className="primary" onClick={() => act(event)}>{button}</button>}</>; }

createRoot(document.getElementById('root')).render(<App />);
