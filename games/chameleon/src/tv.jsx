import {
  React, AnimatePresence, motion, useEffect, useMemo, useRef, useState,
  Brand, PHASE_LABELS, PhaseShell, PlayerChip, ScoreStrip, WordGrid,
  formatClock, playerById, resultCopy, roomFromUrl, useChameleonAudio, useClock, useRoomSocket,
} from './shared.jsx';
import { createRoot } from 'react-dom/client';

function TV() {
  const [state, setState] = useState(null);
  const [join, setJoin] = useState(null);
  const [notice, setNotice] = useState('Opening a new hiding place…');
  const [sound, setSound] = useState(() => localStorage.getItem('chameleon.sound') !== 'off');
  const registered = useRef(false);
  const { connected, emit } = useRoomSocket(({ state: next }) => next && setState(next));
  const clock = useClock(state);
  useChameleonAudio(state, sound);

  useEffect(() => {
    if (!connected || registered.current) return;
    registered.current = true;
    emit('register_tv', { code: roomFromUrl() }).then((result) => {
      if (result.error) return setNotice(result.error);
      window.history.replaceState({}, '', `/chameleon/tv?room=${result.code}`);
      setNotice('Scan the code and choose a calling card.');
    });
  }, [connected]);

  useEffect(() => {
    if (!state?.code) return;
    fetch(`/chameleon/api/join-info?code=${encodeURIComponent(state.code)}`)
      .then((response) => response.json()).then(setJoin).catch(() => setJoin(null));
  }, [state?.code]);

  function toggleSound() {
    const next = !sound;
    if (next) window.ChameleonAudio?.unlock();
    setSound(next);
    localStorage.setItem('chameleon.sound', next ? 'on' : 'off');
  }

  function newRoom() {
    if (!window.confirm('Open a fresh Chameleon room?')) return;
    emit('new_room').then((result) => {
      if (result.error) return setNotice(result.error);
      window.history.replaceState({}, '', `/chameleon/tv?room=${result.code}`);
      setNotice('Scan the new code and choose a calling card.');
    });
  }

  if (!state) return <main className="tv tv--loading"><Brand /><p className="utility">{notice}</p></main>;
  const activeSpeaker = playerById(state, state.activeSpeakerId);
  const guessingPlayer = playerById(state, state.guessingPlayerId);

  return <main className={`tv tv--${state.phase}`}>
    <div className="camouflage" aria-hidden="true"><span /><span /><span /><span /><span /></div>
    <header className="tvbar">
      <Brand small />
      <div className="tvbar__phase"><span className="utility">Round {Math.max(1, state.roundNo)}</span><strong>{PHASE_LABELS[state.phase]}</strong></div>
      <div className="tvbar__actions">
        {state.phase !== 'lobby' && state.phase !== 'game_over' && <span className={`clock ${clock > 0 && clock < 10000 ? 'is-urgent' : ''}`}>{state.paused ? 'PAUSED' : formatClock(clock)}</span>}
        {state.phase !== 'lobby' && state.phase !== 'game_over' && <button className="newroombtn" type="button" onClick={newRoom}>New room</button>}
        <button className="soundbtn" type="button" onClick={toggleSound} aria-pressed={sound}>{sound ? 'Sound on' : 'Sound off'}</button>
        <span className={`connection ${connected ? 'is-on' : ''}`} aria-label={connected ? 'Connected' : 'Reconnecting'} />
      </div>
    </header>

    {state.phase !== 'lobby' && <ScoreStrip state={state} />}

    <AnimatePresence mode="wait">
      {state.phase === 'lobby' && <Lobby key="lobby" state={state} join={join} notice={notice} />}
      {state.phase === 'deal' && <Deal key="deal" state={state} />}
      {state.phase === 'clue' && <Clue key={`clue-${state.clueRound}-${state.clueAt}`} state={state} speaker={activeSpeaker} />}
      {state.phase === 'voting' && <Vote key="voting" state={state} runoff={false} />}
      {state.phase === 'runoff' && <Vote key="runoff" state={state} runoff />}
      {state.phase === 'chameleon_guess' && <Guess key="guess" state={state} player={guessingPlayer} />}
      {state.phase === 'reveal' && <Reveal key={`reveal-${state.roundNo}`} state={state} />}
      {state.phase === 'game_over' && <GameOver key="game-over" state={state} />}
    </AnimatePresence>
  </main>;
}

function Lobby({ state, join, notice }) {
  return <PhaseShell phase="lobby" className="lobby">
    <div className="lobby__poster" aria-hidden="true"><div className="lobby__eye">?</div></div>
    <div className="lobby__copy">
      <p className="kicker">Blend in. Figure it out. Don’t get caught.</p>
      <h1>One word.<br />One player in the dark.</h1>
      <p className="lede">Everyone sees the same grid. Everyone but the Chameleon knows which word matters.</p>
      <div className="lobby__join">
        <div className="qrframe">{join?.qr ? <img src={join.qr} alt={`Join room ${state.code}`} /> : <span className="qrframe__empty" />}</div>
        <div><span className="utility">Join on your phone</span><strong className="roomcode">{state.code}</strong><small>{join?.url || notice}</small></div>
      </div>
    </div>
    <div className="lobby__roster">
      <div className="rosterhead"><span className="utility">In the room</span><b>{state.players.length}/{state.maxPlayers}</b></div>
      <div className="playerlist">
        <AnimatePresence mode="popLayout">
          {state.players.map((player) => <PlayerChip key={player.id} player={player} />)}
        </AnimatePresence>
        {!state.players.length && <p className="empty">The pattern is empty.</p>}
      </div>
      <p className="lobby__status">{state.players.length < state.minPlayers ? `Waiting for ${state.minPlayers - state.players.length} more` : `Ready when ${state.hostName} is`}</p>
    </div>
  </PhaseShell>;
}

function Deal({ state }) {
  return <PhaseShell phase="deal" className="boardphase boardphase--deal">
    <div className="phasecopy"><span className="kicker">Category · {state.category}</span><h1>Check your cover.</h1><p>Your phone knows which side you’re on.</p></div>
    <WordGrid words={state.grid} muted phaseKey={`deal-${state.roundNo}`} />
    <div className="dealpulse"><span />Roles landing on phones</div>
  </PhaseShell>;
}

function Clue({ state, speaker }) {
  return <PhaseShell phase={`clue-${state.clueRound}-${state.clueAt}`} className="boardphase">
    <div className="phasecopy phasecopy--row">
      <div><span className="kicker">{state.category} · clue round {state.clueRound} of {state.config.clueRounds}</span><h1><i style={{ '--speaker': speaker?.colour?.hex }}>{speaker?.name || 'Someone'}</i>, give one clue.</h1></div>
      <div className="speakerbadge" style={{ '--speaker': speaker?.colour?.hex }}><span>{speaker?.name?.slice(0, 1)}</span><small>{state.clueAt + 1} of {state.clueOrder.length}</small></div>
    </div>
    <WordGrid words={state.grid} phaseKey={`clue-${state.roundNo}`} />
    <p className="instruction">Say something connected to the secret word—specific enough to help, vague enough to survive.</p>
  </PhaseShell>;
}

function Vote({ state, runoff }) {
  const eligible = runoff ? state.players.filter((player) => state.runoffCandidates.includes(player.id)) : state.players;
  return <PhaseShell phase={runoff ? 'runoff' : 'voting'} className="votescene">
    <div className="phasecopy">
      <span className="kicker">{runoff ? 'Second ballot' : 'Secret ballot'}</span>
      <h1>{runoff ? 'The pattern is still split.' : 'Who didn’t know the word?'}</h1>
      <p>{runoff ? 'Choose between the tied names. Another tie lets the Chameleon slip away.' : 'Votes stay hidden until the room commits.'}</p>
    </div>
    <div className="suspects">
      {eligible.map((player) => <PlayerChip key={player.id} player={player} compact voted={state.votedIds.includes(player.id)} />)}
    </div>
    <div className="voteprogress"><span style={{ width: `${(state.votesIn / Math.max(1, state.players.length)) * 100}%` }} /><b>{state.votesIn} / {state.players.length} votes</b></div>
  </PhaseShell>;
}

function Guess({ state, player }) {
  return <PhaseShell phase="chameleon_guess" className="guessscene">
    <div className="guessscene__mark">?</div>
    <span className="kicker">One last disguise</span>
    <h1>{player?.name || 'The Chameleon'} is choosing.</h1>
    <p>Find the secret word in the grid and the pattern may still break your way.</p>
    <WordGrid words={state.grid} muted compact phaseKey={`guess-${state.roundNo}`} />
  </PhaseShell>;
}

function Reveal({ state }) {
  const copy = resultCopy(state);
  const chameleon = state.players.find((player) => player.revealedRole === 'chameleon');
  const ballot = state.tally?.ballots?.at(-1);
  const voteRows = ballot ? state.players
    .map((player) => ({ player, count: ballot.counts[player.id] || 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count) : [];
  return <PhaseShell phase={`reveal-${state.roundNo}`} className="boardphase boardphase--reveal">
    <div className="phasecopy phasecopy--row">
      <div><span className="kicker">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.detail}</p></div>
      <div className="revealrole" style={{ '--player': chameleon?.colour?.hex }}><span>{chameleon?.name || '—'}</span><b>was the Chameleon</b></div>
    </div>
    <WordGrid words={state.grid} targetWord={state.targetWord} phaseKey={`reveal-${state.roundNo}`} />
    <div className="revealfoot"><span>Secret word <strong>{state.targetWord}</strong></span><span>Final guess <strong>{state.chameleonGuess || 'No guess'}</strong></span></div>
    {voteRows.length > 0 && <div className="revealtally" aria-label={`${ballot.kind} vote tally`}>
      {voteRows.map(({ player, count }) => <span key={player.id} style={{ '--player': player.colour.hex }}><b>{player.name}</b><strong>{count}</strong></span>)}
    </div>}
  </PhaseShell>;
}

function GameOver({ state }) {
  const townWon = state.winner === 'town';
  return <PhaseShell phase="game_over" className={`overscene ${townWon ? 'is-town' : 'is-chameleon'}`}>
    <span className="kicker">Final pattern · {state.history.length} rounds</span>
    <h1>{townWon ? 'The Town saw through it.' : 'The Chameleon disappeared.'}</h1>
    <ScoreStrip state={state} />
    <div className="finalroster">{state.players.map((player) => <PlayerChip key={player.id} player={player} />)}</div>
    <p>Use <b>New room</b> above to start a fresh table.</p>
  </PhaseShell>;
}

createRoot(document.getElementById('root')).render(<TV />);
