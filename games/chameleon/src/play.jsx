import {
  React, AnimatePresence, motion, useEffect, useMemo, useState,
  Brand, PhaseShell, PlayerChip, ScoreStrip, WordGrid,
  formatClock, playerById, readIdentity, resultCopy, roomFromUrl, saveIdentity,
  SHARED_NAME, useChameleonAudio, useClock, useRoomSocket,
} from './shared.jsx';
import { createRoot } from 'react-dom/client';

function Phone() {
  const [state, setState] = useState(null);
  const [priv, setPriv] = useState(null);
  const [identity, setIdentity] = useState(() => readIdentity());
  const [notice, setNotice] = useState('');
  const [secretOpen, setSecretOpen] = useState(false);
  const [guess, setGuess] = useState(null);
  const [sound, setSound] = useState(() => localStorage.getItem('chameleon.sound.phone') !== 'off');
  const { connected, emit } = useRoomSocket((packet) => {
    if (packet.state) setState(packet.state);
    if (packet.privateState) setPriv(packet.privateState);
    if (packet.seatTaken) {
      localStorage.removeItem('chameleon.player');
      setIdentity(null);
      setState(null);
      setPriv(null);
      setNotice(`Your seat for ${packet.seatTaken.name} moved to another phone.`);
    }
  });
  const clock = useClock(state);
  useChameleonAudio(state, sound, { music: false, cues: false });

  useEffect(() => {
    if (!connected || !identity?.playerId) return;
    const urlRoom = roomFromUrl();
    if (urlRoom && urlRoom !== identity.code) return;
    emit('rejoin', identity).then((result) => {
      if (!result.error) return;
      emit('join_game', { name: identity.name, code: identity.code, colour: identity.colour }).then((retry) => {
        if (retry.error) {
          localStorage.removeItem('chameleon.player');
          setIdentity(null);
          setNotice(retry.error);
        } else {
          const next = { ...identity, playerId: retry.playerId, code: retry.code };
          saveIdentity(next);
          setIdentity(next);
        }
      });
    });
  }, [connected]);

  useEffect(() => {
    setSecretOpen(false);
    setGuess(null);
  }, [state?.roundNo]);

  function act(event, payload = {}) {
    window.ChameleonAudio?.unlock();
    return emit(event, payload).then((result) => {
      if (result.error) setNotice(result.error);
      else {
        setNotice('');
        const cue = event === 'cast_vote' || event === 'cast_runoff_vote' ? 'vote_cast'
          : event === 'clue_ready' ? 'speaker_changed'
            : event === 'submit_chameleon_guess' ? 'round_reveal' : null;
        if (cue) window.ChameleonAudio?.cue(cue);
      }
      return result;
    });
  }

  if (!identity?.playerId || !priv) return <Join connected={connected} notice={notice} onJoin={(next) => {
    setIdentity(next);
    setNotice('');
  }} emit={emit} />;
  if (!state) return <main className="phone phone--loading"><Brand /><p className="utility">Reconnecting to {identity.code}…</p></main>;

  const me = playerById(state, priv.playerId);
  return <main className={`phone phone--${state.phase}`} style={{ '--me': me?.colour?.hex || '#F6D447' }}>
    <div className="phonecamo" aria-hidden="true" />
    <header className="phonebar">
      <PlayerChip player={me} compact />
      <span className="phonebar__code">{state.code}</span>
      <button type="button" className="sounddot" onClick={() => {
        const next = !sound;
        if (next) window.ChameleonAudio?.unlock();
        setSound(next);
        localStorage.setItem('chameleon.sound.phone', next ? 'on' : 'off');
      }} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound}>{sound ? '♪' : '×'}</button>
    </header>

    {state.phase !== 'lobby' && <ScoreStrip state={state} compact />}
    {state.phase !== 'lobby' && state.phase !== 'game_over' && <div className="phonestatus"><span>{state.paused ? 'Paused' : state.phase.replaceAll('_', ' ')}</span><b>{formatClock(clock)}</b></div>}

    <AnimatePresence mode="wait">
      {state.phase === 'lobby' && <PhoneLobby key="lobby" state={state} priv={priv} act={act} />}
      {state.phase === 'deal' && <PhoneDeal key={`deal-${state.roundNo}`} state={state} priv={priv} open={secretOpen} setOpen={setSecretOpen} />}
      {state.phase === 'clue' && <PhoneClue key={`clue-${state.clueRound}-${state.clueAt}`} state={state} priv={priv} act={act} />}
      {state.phase === 'voting' && <PhoneVote key="vote" state={state} priv={priv} act={act} runoff={false} />}
      {state.phase === 'runoff' && <PhoneVote key="runoff" state={state} priv={priv} act={act} runoff />}
      {state.phase === 'chameleon_guess' && <PhoneGuess key="guess" state={state} priv={priv} selected={guess} setSelected={setGuess} act={act} />}
      {state.phase === 'reveal' && <PhoneReveal key={`reveal-${state.roundNo}`} state={state} />}
      {state.phase === 'game_over' && <PhoneOver key="over" state={state} priv={priv} act={act} />}
    </AnimatePresence>

    {notice && <motion.div className="toast" role="status" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{notice}</motion.div>}
    {priv.isHost && !['lobby', 'game_over'].includes(state.phase) && <HostRail state={state} act={act} />}
  </main>;
}

function Join({ connected, notice, onJoin, emit }) {
  const urlRoom = roomFromUrl();
  const [name, setName] = useState(() => localStorage.getItem(SHARED_NAME) || '');
  const [code, setCode] = useState(urlRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!connected || busy) return;
    setBusy(true);
    window.ChameleonAudio?.unlock();
    const result = await emit('join_game', { name, code });
    setBusy(false);
    if (result.error) return setError(result.error);
    setError('');
    const next = { name: name.trim(), code: result.code, playerId: result.playerId, colour: result.colour };
    saveIdentity(next);
    onJoin(next);
  }

  return <main className="joinpage">
    <div className="joinpage__art"><Brand /><span className="joinpage__question">?</span><p>Blend in. Figure it out.</p></div>
    <form className="joincard" onSubmit={submit}>
      <span className="kicker">Join the pattern</span>
      <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength="16" placeholder="Sam" autoComplete="name" required /></label>
      <label className={urlRoom ? 'is-hidden' : ''}><span>Room code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength="8" placeholder="HIDE" autoCapitalize="characters" required /></label>
      {(error || notice) && <p className="formerror">{error || notice}</p>}
      <button className="primary" disabled={!connected || busy}>{busy ? 'Joining…' : connected ? 'Join game' : 'Connecting…'}</button>
    </form>
  </main>;
}

function PhoneLobby({ state, priv, act }) {
  const [target, setTarget] = useState(state.config.targetScore);
  const [clues, setClues] = useState(state.config.clueRounds);
  const [timers, setTimers] = useState(state.config.timers);
  useEffect(() => { setTarget(state.config.targetScore); setClues(state.config.clueRounds); setTimers(state.config.timers); }, [state.config]);
  const update = (next) => act('set_config', next);
  return <PhaseShell phase="lobby" className="phonepanel lobbyphone">
    <div><span className="kicker">Room {state.code}</span><h1>{state.players.length < state.minPlayers ? 'Building the pattern.' : 'The room is ready.'}</h1><p>{state.players.length}/{state.maxPlayers} players · {state.hostName} is host</p></div>
    <div className="phonerooster">{state.players.map((player) => <PlayerChip key={player.id} player={player} />)}</div>
    {priv.isHost ? <div className="setupcard">
      <div className="setting"><div><b>First to</b><small>5–20 points</small></div><div className="stepper"><button onClick={() => { const value = Math.max(5, target - 1); setTarget(value); update({ targetScore: value }); }}>−</button><strong>{target}</strong><button onClick={() => { const value = Math.min(20, target + 1); setTarget(value); update({ targetScore: value }); }}>+</button></div></div>
      <div className="setting setting--stack"><div><b>Clue rounds</b><small>Each player speaks once per round</small></div><div className="segments">{[1, 2, 3].map((value) => <button key={value} className={clues === value ? 'is-on' : ''} onClick={() => { setClues(value); update({ clueRounds: value }); }}>{value}</button>)}</div></div>
      <div className="setting"><div><b>Bounded timers</b><small>Auto-advance stalled turns</small></div><button className={`toggle ${timers ? 'is-on' : ''}`} onClick={() => { setTimers(!timers); update({ timers: !timers }); }} aria-pressed={timers}><span /></button></div>
      <button className="primary" disabled={state.players.length < state.minPlayers} onClick={() => act('start_game')}>{state.players.length < state.minPlayers ? `Need ${state.minPlayers - state.players.length} more` : 'Deal the roles'}</button>
    </div> : <p className="waitnote">Waiting for {state.hostName} to deal the roles.</p>}
    <a className="home-link" href="/">Back to game night</a>
  </PhaseShell>;
}

function PhoneDeal({ state, priv, open, setOpen }) {
  const chameleon = priv.role === 'chameleon';
  return <PhaseShell phase="deal" className="phonepanel secretpanel">
    <span className="kicker">Round {state.roundNo} · {state.category}</span>
    <h1>Your cover is ready.</h1>
    <button className={`secretcard ${open ? 'is-open' : ''} ${chameleon ? 'is-chameleon' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      {open
        ? <span className="secretcard__open">{chameleon ? <><small>You are the</small><strong>Chameleon</strong><em>Listen closely. Blend in.</em></> : <><small>The secret word is</small><strong>{priv.targetWord}</strong><em>Give a clue. Don’t say the word.</em></>}</span>
        : <span className="secretcard__closed"><b>Tap to reveal</b><small>Shield your screen</small></span>}
    </button>
    <p>Everyone sees the same 25 words. Only one matters.</p>
  </PhaseShell>;
}

function SecretBadge({ state, priv }) {
  return <div className={`secretbadge ${priv.role === 'chameleon' ? 'is-chameleon' : ''}`}><span>{priv.role === 'chameleon' ? 'Your role' : 'Secret word'}</span><strong>{priv.role === 'chameleon' ? 'Chameleon' : priv.targetWord}</strong></div>;
}

function PhoneClue({ state, priv, act }) {
  const speaker = playerById(state, state.activeSpeakerId);
  const ownIndex = state.clueOrder.indexOf(priv.playerId);
  const alreadySpoke = ownIndex < state.clueAt;
  const finished = alreadySpoke && state.clueRound === state.config.clueRounds;
  const placesAway = alreadySpoke ? state.clueOrder.length - state.clueAt + ownIndex : ownIndex - state.clueAt;
  return <PhaseShell phase={`clue-${state.clueRound}-${state.clueAt}`} className="phonepanel cluephone">
    <SecretBadge state={state} priv={priv} />
    <span className="kicker">Clue round {state.clueRound} of {state.config.clueRounds}</span>
    {priv.isSpeaker ? <><h1>You’re up.</h1><p>Say one clue connected to the secret word. Keep a straight face.</p><button className="primary" onClick={() => act('clue_ready')}>I gave my clue</button></> : <><h1>{speaker?.name} is speaking.</h1><p>{finished ? 'Your clues are complete. Listen for the tell.' : `Your turn is ${Math.max(1, placesAway)} place${placesAway === 1 ? '' : 's'} away.`}</p><div className="listening"><span /><span /><span /></div></>}
  </PhaseShell>;
}

function PhoneVote({ state, priv, act, runoff }) {
  const candidates = state.players.filter((player) => player.id !== priv.playerId && (!runoff || state.runoffCandidates.includes(player.id)));
  return <PhaseShell phase={runoff ? 'runoff' : 'voting'} className="phonepanel votephone">
    <SecretBadge state={state} priv={priv} />
    <span className="kicker">{runoff ? 'Runoff ballot' : 'Secret ballot'}</span>
    <h1>{priv.myVote ? 'Vote locked.' : 'Who was blending in?'}</h1>
    <p>{runoff ? 'Choose between the tied players.' : 'Pick the person whose clues never quite fit.'}</p>
    <div className="votelist">{candidates.map((player) => <button key={player.id} disabled={!!priv.myVote} className={priv.myVote === player.id ? 'is-selected' : ''}
      style={{ '--candidate': player.colour.hex }} onClick={() => act(runoff ? 'cast_runoff_vote' : 'cast_vote', { targetId: player.id })}>
      <span>{player.name.slice(0, 1)}</span><b>{player.name}</b><small>{priv.myVote === player.id ? 'Your vote' : 'Choose'}</small>
    </button>)}</div>
    <small className="votehint">{state.votesIn}/{state.players.length} votes received</small>
  </PhaseShell>;
}

function PhoneGuess({ state, priv, selected, setSelected, act }) {
  if (!priv.canGuess) return <PhaseShell phase="guess-wait" className="phonepanel waitpanel"><span className="questionmark">?</span><h1>The Chameleon has one guess.</h1><p>The word is still hidden until they choose.</p></PhaseShell>;
  return <PhaseShell phase="guess" className="phonepanel guessphone"><span className="kicker">Last chance</span><h1>Find the secret word.</h1><p>You heard every clue. Choose one cell from the pattern.</p><WordGrid words={state.grid} interactive selected={selected} onSelect={setSelected} compact phaseKey={`phone-guess-${state.roundNo}`} /><button className="primary" disabled={!selected} onClick={() => act('submit_chameleon_guess', { word: selected })}>Guess {selected || 'a word'}</button></PhaseShell>;
}

function PhoneReveal({ state }) {
  const copy = resultCopy(state);
  const chameleon = state.players.find((player) => player.revealedRole === 'chameleon');
  return <PhaseShell phase="reveal" className="phonepanel revealphone"><span className="kicker">{copy.eyebrow}</span><h1>{copy.title}</h1><div className="targetcard"><small>The secret word was</small><strong>{state.targetWord}</strong><span>{state.category}</span></div><p><b>{chameleon?.name}</b> was the Chameleon.</p><div className="pointsaward">{copy.detail}</div><p className="waitnote">Next pattern incoming…</p></PhaseShell>;
}

function PhoneOver({ state, priv, act }) {
  const won = state.winner === 'town';
  return <PhaseShell phase="game-over" className="phonepanel overphone"><span className="kicker">Match complete</span><h1>{won ? 'The Town saw through it.' : 'The Chameleon disappeared.'}</h1><ScoreStrip state={state} /><p>{state.history.length} rounds played.</p>{priv.isHost ? <button className="primary" onClick={() => act('reset_game')}>Play again</button> : <p className="waitnote">Waiting for {state.hostName}.</p>}</PhaseShell>;
}

function HostRail({ state, act }) {
  return <div className="hostrail"><button onClick={() => act('set_paused', { paused: !state.paused })}>{state.paused ? 'Resume' : 'Pause'}</button><button onClick={() => act('force_advance')}>Advance</button></div>;
}

createRoot(document.getElementById('root')).render(<Phone />);
