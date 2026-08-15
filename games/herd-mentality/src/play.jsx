import {
  React, AnimatePresence, motion, useEffect, useRef, useState,
  Brand, CowToken, EarTag, Phase, PlayerAnswer, ScoreRail,
  playerById, resultHeadline, roomFromUrl, seatKey, useClock, useHerdAudio, useRoomSocket,
} from './shared.jsx';
import { createRoot } from 'react-dom/client';

const PLAYER_NAME_KEY = 'herd-mentality.player-name';

function PhoneApp() {
  const initialCode = roomFromUrl();
  const [state, setState] = useState(null);
  const [priv, setPriv] = useState(null);
  const [notice, setNotice] = useState('');
  const [closed, setClosed] = useState(false);
  const [sound, setSound] = useState(() => localStorage.getItem('herd-mentality.sound.phone') !== 'off');
  const rejoinAttempt = useRef(false);
  const { connected, emit } = useRoomSocket({
    state: setState,
    privateState: setPriv,
    seatTaken: ({ name }) => {
      localStorage.removeItem(seatKey(initialCode));
      setPriv(null);
      setNotice(`${name || 'That player'} opened this seat on another device.`);
    },
    roomClosed: () => {
      localStorage.removeItem(seatKey(initialCode));
      setClosed(true);
      setPriv(null);
      setState(null);
    },
  });
  useHerdAudio(state, sound);

  useEffect(() => {
    if (!connected) {
      rejoinAttempt.current = false;
      return;
    }
    if (rejoinAttempt.current || !initialCode) return;
    const playerId = localStorage.getItem(seatKey(initialCode));
    if (!playerId) return;
    rejoinAttempt.current = true;
    emit('rejoin', { code: initialCode, playerId }).then((result) => {
      if (result.error) {
        localStorage.removeItem(seatKey(initialCode));
        setNotice(result.error);
      }
    });
  }, [connected]);

  async function join(name, code) {
    window.HerdAudio?.unlock();
    setNotice('');
    const playerName = name.trim();
    const result = await emit('join_game', { name: playerName, code });
    if (result.error) return setNotice(result.error);
    localStorage.setItem(seatKey(result.code), result.playerId);
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    window.history.replaceState({}, '', `/herd-mentality/play?room=${result.code}`);
  }

  async function act(event, payload = {}) {
    window.HerdAudio?.unlock();
    setNotice('');
    const result = await emit(event, payload);
    if (result.error) {
      setNotice(result.error);
      window.HerdAudio?.cue('error');
    } else {
      const cue = event === 'submit_answer' ? 'answer_locked'
        : ['review_merge_answers', 'review_split_answer'].includes(event) ? 'groups_changed' : 'ui';
      window.HerdAudio?.cue(cue);
    }
    return result;
  }

  if (closed) return <main className="phone phone--center"><Brand /><h1>The barn has closed.</h1><p>Return to game night or scan the next room code.</p><a className="primary" href="/">Game night</a></main>;
  if (!priv?.playerId) return <JoinScreen code={initialCode} connected={connected} notice={notice} onJoin={join} />;
  if (!state) return <main className="phone phone--center"><Brand /><div className="loadingdots"><i /><i /><i /></div><p>Finding the herd...</p></main>;

  return <main className={`phone phone--${state.phase}`}>
    <PhoneHeader state={state} connected={connected} priv={priv} act={act} sound={sound} setSound={setSound} />
    <AnimatePresence>{notice && <motion.div key="notice" className="notice" role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .28 }}>{notice}</motion.div>}</AnimatePresence>
    {state.phase !== 'lobby' && <ScoreRail state={state} compact />}
    <AnimatePresence mode="wait">
      {state.phase === 'lobby' && <Lobby key="lobby" state={state} priv={priv} act={act} />}
      {state.phase === 'question_open' && <QuestionOpening key={`open-${state.roundNo}`} state={state} />}
      {state.phase === 'answering' && <Answering key={`answer-${state.roundNo}`} state={state} priv={priv} act={act} />}
      {state.phase === 'review' && <Review key={`review-${state.roundNo}`} state={state} priv={priv} act={act} />}
      {state.phase === 'reveal' && <Reveal key={`reveal-${state.roundNo}`} state={state} priv={priv} act={act} />}
      {state.phase === 'game_over' && <GameOver key="game-over" state={state} priv={priv} act={act} />}
    </AnimatePresence>
  </main>;
}

function JoinScreen({ code: initialCode, connected, notice, onJoin }) {
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || !code.trim() || busy) return;
    setBusy(true);
    await onJoin(name, code);
    setBusy(false);
  }

  return <main className="phone joinphone">
    <div className="papergrain" aria-hidden="true" />
    <Brand />
    <div className="joinphone__tag"><span>Admit one</span><b>Join the herd</b></div>
    <form onSubmit={submit}>
      <label>Your name<input autoComplete="name" maxLength="18" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" /></label>
      <label>Room code<input className="codeinput" autoCapitalize="characters" maxLength="8" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="HERD" /></label>
      {notice && <p className="formerror" role="alert">{notice}</p>}
      <button className="primary" disabled={!connected || !name.trim() || !code.trim() || busy}>{busy ? 'Opening the gate...' : connected ? 'Join the herd' : 'Connecting...'}</button>
    </form>
    <p className="joinphone__note">Keep your answer secret until the TV reveals the herd.</p>
  </main>;
}

function PhoneHeader({ state, connected, priv, act, sound, setSound }) {
  const [confirming, setConfirming] = useState(false);
  return <header className="phonebar">
    <Brand compact />
    <div className="phonebar__room"><small>Room</small><b>{state.code}</b></div>
    <button type="button" className="soundtoggle" onClick={() => {
      const next = !sound;
      if (next) window.HerdAudio?.unlock();
      setSound(next);
      localStorage.setItem('herd-mentality.sound.phone', next ? 'on' : 'off');
    }} aria-label={sound ? 'Mute sound effects' : 'Enable sound effects'} aria-pressed={sound}>{sound ? 'SFX on' : 'SFX off'}</button>
    <span className={`connection ${connected ? 'is-on' : ''}`} aria-label={connected ? 'Connected' : 'Reconnecting'} />
    {priv.isHost && <details className="hostmenu">
      <summary>Menu</summary>
      <div>
        <span>You are the Question Wrangler.</span>
        <button type="button" onClick={() => {
          if (!confirming) return setConfirming(true);
          setConfirming(false);
          act('reset_to_lobby');
        }}>{confirming ? 'Tap again to reset' : 'Return to lobby'}</button>
      </div>
    </details>}
  </header>;
}

function Lobby({ state, priv, act }) {
  const missing = Math.max(0, state.minPlayers - state.players.length);
  return <Phase phaseKey="lobby" className="phonephase lobbyphone">
    <div className="roundstamp"><span>Room {state.code}</span><b>{state.players.length}/{state.maxPlayers}</b></div>
    <span className="kicker">Think like the crowd</span>
    <h1>{missing ? 'The pasture is still open.' : 'The herd is ready.'}</h1>
    <p>{missing ? `${missing} more ${missing === 1 ? 'player' : 'players'} needed to begin.` : `${state.hostName} can start when everyone is settled.`}</p>
    <div className="roster phone-roster">
      <AnimatePresence mode="popLayout">
        {state.players.map((player) => <EarTag key={player.id} player={player} />)}
      </AnimatePresence>
    </div>
    <div className="rulestrip">
      <span><b>1</b>Answer secretly</span><span><b>2</b>Match the herd</span><span><b>3</b>Avoid the Pink Cow</span>
    </div>
    {priv.isHost ? <button className="primary" disabled={state.players.length < state.minPlayers} onClick={() => act('start_game')}>{missing ? `Need ${missing} more` : 'Start the game'}</button> : <p className="waitnote">{missing ? 'Invite more players from the TV.' : `Waiting for ${state.hostName} to start.`}</p>}
  </Phase>;
}

function QuestionOpening({ state }) {
  return <Phase phaseKey={`question-${state.roundNo}`} className="phonephase openingphone">
    <span className="kicker">Round {state.roundNo}</span>
    <div className="openingphone__mark">?</div>
    <h1>Read the room.</h1>
    <p>The next question is landing on the TV.</p>
    <div className="loadingdots"><i /><i /><i /></div>
  </Phase>;
}

function Answering({ state, priv, act }) {
  const [answer, setAnswer] = useState(priv.myAnswer || '');
  const [editing, setEditing] = useState(!priv.myAnswer);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (priv.myAnswer && !editing) setAnswer(priv.myAnswer);
  }, [priv.myAnswer, editing]);

  async function submit(event) {
    event.preventDefault();
    if (!answer.trim() || busy) return;
    setBusy(true);
    const result = await act('submit_answer', { answer });
    if (!result.error) setEditing(false);
    setBusy(false);
  }

  if (priv.myAnswer && !editing) return <Phase phaseKey={`locked-${state.roundNo}`} className="phonephase lockedphone">
    <span className="kicker">Answer locked</span>
    <h1>{priv.myAnswer}</h1>
    <p>{state.submissionsIn} of {state.players.length} answers are in.</p>
    <div className="herdprogress"><span style={{ transform: `scaleX(${state.submissionsIn / state.players.length})` }} /></div>
    <button className="secondary" type="button" onClick={() => setEditing(true)}>Change my answer</button>
    {priv.isHost && state.submissionsIn >= 2 && state.submissionsIn < state.players.length && <button className="textbutton recovery" type="button" onClick={() => act('close_answers')}>Someone cannot answer? Review now</button>}
  </Phase>;

  return <Phase phaseKey={`write-${state.roundNo}`} className="phonephase answerphone">
    <span className="kicker">Round {state.roundNo} - answer secretly</span>
    <h1>{state.currentQuestion.text}</h1>
    <form onSubmit={submit}>
      <label className="answerfield"><span>Your answer</span><textarea autoFocus rows="2" maxLength={state.maxAnswerLength} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="What will everyone else say?" /><small>{answer.length}/{state.maxAnswerLength}</small></label>
      <button className="primary" disabled={!answer.trim() || busy}>{busy ? 'Locking...' : priv.myAnswer ? 'Update answer' : 'Lock answer'}</button>
      {priv.myAnswer && <button className="textbutton" type="button" onClick={() => setEditing(false)}>Keep previous answer</button>}
    </form>
    <p className="privacy"><i />Only the Question Wrangler can see answers before reveal.</p>
  </Phase>;
}

function Review({ state, priv, act }) {
  if (!priv.isHost) return <Phase phaseKey={`wait-review-${state.roundNo}`} className="phonephase reviewwait">
    <CowToken pulse />
    <span className="kicker">Answers are with the Wrangler</span>
    <h1>Hold your horses. Or cows.</h1>
    <p>{state.reviewIssueCount} {state.reviewIssueCount === 1 ? 'answer needs' : 'answers need'} a quick phrase or spelling check before the reveal.</p>
  </Phase>;
  return <HostReview groups={priv.reviewGroups} state={state} act={act} />;
}

function HostReview({ groups, state, act }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const groupSignature = groups.map((group) => group.id).join('|');
  useEffect(() => setSelected([]), [groupSignature]);

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  async function merge() {
    if (selected.length < 2) return;
    setBusy(true);
    await act('review_merge_answers', { groupIds: selected });
    setBusy(false);
  }

  async function split(playerId) {
    setBusy(true);
    await act('review_split_answer', { playerId });
    setBusy(false);
  }

  return <Phase phaseKey={`host-review-${state.roundNo}`} className="phonephase hostreview">
    <span className="kicker">Question Wrangler review</span>
    <h1>A few answers need your call.</h1>
    <p>Highlighted answers may be phrases or typos. Merge only when they mean the same thing; everything else is already grouped.</p>
    <div className="reviewgroups">
      {groups.map((group) => <motion.article layout key={group.id} className={`reviewgroup ${group.answers.some((answer) => answer.reviewIssue) ? 'needs-review' : ''} ${selected.includes(group.id) ? 'is-selected' : ''}`}>
        <button className="reviewgroup__select" type="button" onClick={() => toggle(group.id)} aria-pressed={selected.includes(group.id)}><span>{selected.includes(group.id) ? 'Selected' : 'Select group'}</span><b>{group.answers.length}</b></button>
        {group.answers.map((answer) => <PlayerAnswer key={answer.playerId} answer={answer} player={playerById(state, answer.playerId)} canSplit={group.answers.length > 1} onSplit={split} />)}
      </motion.article>)}
    </div>
    <div className="reviewactions">
      <button className="secondary" disabled={selected.length < 2 || busy} onClick={merge}>Merge selected ({selected.length})</button>
      <button className="primary" disabled={busy} onClick={() => act('review_confirm_groups')}>Confirm and reveal</button>
    </div>
  </Phase>;
}

function Reveal({ state, priv, act }) {
  const headline = resultHeadline(state);
  const clock = useClock(state);
  const groups = state.groups.slice().sort((a, b) => b.answers.length - a.answers.length);
  const oddPlayer = playerById(state, state.roundResult?.oddPlayerId);
  return <Phase phaseKey={`reveal-${state.roundNo}`} className="phonephase revealphone">
    <span className="kicker">{headline.eyebrow}</span>
    <h1>{headline.title}</h1>
    <div className="answerherds">
      {groups.map((group) => <article key={group.id} className={`answerherd ${state.roundResult.majorityGroupId === group.id ? 'is-majority' : ''} ${group.answers.some((answer) => answer.playerId === state.roundResult.oddPlayerId) ? 'is-odd' : ''}`}>
        <header><b>{group.answers[0]?.rawAnswer}</b><span>{group.answers.length}</span></header>
        <p>{group.answers.map((answer) => answer.playerName).join(', ')}</p>
      </article>)}
    </div>
    {state.roundResult.tied && <p className="verdict">The top answers tied. Nobody scores and the Pink Cow stays put.</p>}
    {!state.roundResult.tied && oddPlayer && <div className="pinkverdict"><CowToken /><p><b>{oddPlayer.name}</b> was the sole odd one out and takes the Pink Cow.</p></div>}
    {!state.roundResult.tied && !oddPlayer && <p className="verdict">{state.roundResult.awardedPlayerIds.length} players add one cow. The Pink Cow does not move.</p>}
    {priv.isHost ? <button className="secondary" onClick={() => act('next_round')}>Next question now <small>{Math.ceil(clock / 1000)}s</small></button> : <p className="waitnote">Next question in {Math.ceil(clock / 1000)} seconds.</p>}
  </Phase>;
}

function GameOver({ state, priv, act }) {
  const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
  return <Phase phaseKey="game-over" className="phonephase gameoverphone">
    <div className="winnerseal"><span>The herd has spoken</span><CowToken /></div>
    <span className="kicker">Final result</span>
    <h1>{winners.map((player) => player.name).join(' & ')} {winners.length === 1 ? 'wins' : 'win'}!</h1>
    <p>{winners.length === 1 ? `${winners[0].name} reached ${winners[0].score} cows without holding the Pink Cow.` : 'The winning herd broke the tie.'}</p>
    <ScoreRail state={state} />
    {priv.isHost ? <button className="primary" onClick={() => act('reset_to_lobby')}>Play again with this herd</button> : <p className="waitnote">Waiting for {state.hostName} to choose what is next.</p>}
  </Phase>;
}

createRoot(document.getElementById('root')).render(<PhoneApp />);
