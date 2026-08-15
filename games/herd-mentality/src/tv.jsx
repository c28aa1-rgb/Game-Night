import {
  React, AnimatePresence, motion, useEffect, useRef, useState,
  Brand, CowToken, EarTag, Phase, ScoreRail,
  playerById, resultHeadline, roomFromUrl, useClock, useHerdAudio, useReducedMotion, useRoomSocket,
} from './shared.jsx';
import { createRoot } from 'react-dom/client';

function TVApp() {
  const [state, setState] = useState(null);
  const [join, setJoin] = useState(null);
  const [notice, setNotice] = useState('Opening the pasture...');
  const [menuOpen, setMenuOpen] = useState(false);
  const [armed, setArmed] = useState(null);
  const [sound, setSound] = useState(() => localStorage.getItem('herd-mentality.sound.tv') !== 'off');
  const registered = useRef(false);
  const { connected, emit } = useRoomSocket({ state: setState });
  useHerdAudio(state, sound, { music: true, cues: true });

  useEffect(() => {
    if (!connected) {
      registered.current = false;
      return;
    }
    if (registered.current) return;
    registered.current = true;
    emit('register_tv', { code: roomFromUrl() }).then((result) => {
      if (result.error) return setNotice(result.error);
      window.history.replaceState({}, '', `/herd-mentality/tv?room=${result.code}`);
      setNotice('Scan the code to join the herd.');
    });
  }, [connected]);

  useEffect(() => {
    if (!state?.code) return;
    fetch(`/herd-mentality/api/join-info?code=${encodeURIComponent(state.code)}`)
      .then((response) => response.json()).then(setJoin).catch(() => setJoin(null));
  }, [state?.code]);

  async function menuAction(action) {
    if (armed !== action) {
      setArmed(action);
      window.setTimeout(() => setArmed((current) => current === action ? null : current), 2600);
      return;
    }
    setArmed(null);
    setMenuOpen(false);
    if (action === 'home') return window.location.assign('/');
    const result = await emit(action === 'new' ? 'new_room' : 'reset_to_lobby');
    if (result.error) return setNotice(result.error);
    if (action === 'new') window.history.replaceState({}, '', `/herd-mentality/tv?room=${result.code}`);
  }

  if (!state) return <main className="tv tv--loading"><div className="papergrain" /><Brand /><div className="loadingdots"><i /><i /><i /></div><p>{notice}</p></main>;

  return <main className={`tv tv--${state.phase}`}>
    <div className="pasturelines" aria-hidden="true"><i /><i /><i /><i /></div>
    <header className="tvbar">
      <Brand compact />
      <div className="tvbar__round"><small>{state.phase === 'lobby' ? 'Room' : 'Round'}</small><b>{state.phase === 'lobby' ? state.code : state.roundNo}</b></div>
      <div className="tvbar__status"><span>{phaseLabel(state.phase)}</span><i aria-hidden="true" className={`connection ${connected ? 'is-on' : ''}`} /></div>
      <button className="soundbtn" type="button" onClick={() => {
        const next = !sound;
        if (next) window.HerdAudio?.unlock();
        setSound(next);
        localStorage.setItem('herd-mentality.sound.tv', next ? 'on' : 'off');
      }} aria-pressed={sound}>{sound ? 'Sound on' : 'Sound off'}</button>
      <div className="tvmenu">
        <button type="button" onClick={() => { setMenuOpen(!menuOpen); setArmed(null); }} aria-expanded={menuOpen}>Game menu</button>
        <AnimatePresence>{menuOpen && <motion.div key="tv-menu" className="tvmenu__panel" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: .985 }} transition={{ duration: .28 }}>
          <button onClick={() => menuAction('new')}>{armed === 'new' ? 'Tap again: new room' : 'New room'}</button>
          <button onClick={() => menuAction('lobby')}>{armed === 'lobby' ? 'Tap again: reset game' : 'Return to lobby'}</button>
          <button onClick={() => menuAction('home')}>{armed === 'home' ? 'Tap again: game night' : 'Return to game night'}</button>
        </motion.div>}</AnimatePresence>
      </div>
    </header>
    {state.phase !== 'lobby' && <ScoreRail state={state} compact />}
    <AnimatePresence mode="wait">
      {state.phase === 'lobby' && <Lobby key="lobby" state={state} join={join} notice={notice} />}
      {state.phase === 'question_open' && <QuestionOpening key={`open-${state.roundNo}`} state={state} />}
      {state.phase === 'answering' && <Answering key={`answer-${state.roundNo}`} state={state} />}
      {state.phase === 'review' && <Review key={`review-${state.roundNo}`} state={state} />}
      {state.phase === 'reveal' && <Reveal key={`reveal-${state.roundNo}`} state={state} />}
      {state.phase === 'game_over' && <GameOver key="game-over" state={state} />}
    </AnimatePresence>
  </main>;
}

function phaseLabel(phase) {
  return ({
    lobby: 'Gather the herd', question_open: 'New question', answering: 'Answers open',
    review: 'Wrangler review', reveal: 'The reveal', game_over: 'Final result',
  })[phase] || phase;
}

function Lobby({ state, join, notice }) {
  const missing = Math.max(0, state.minPlayers - state.players.length);
  return <Phase phaseKey="tv-lobby" className="tvlobby">
    <div className="tvlobby__pitch">
      <span className="kicker">The answer is always right - as long as you agree</span>
      <h1>Find your<br /><em>people.</em></h1>
      <p>Answer in secret. Match the most popular answer to build your herd. Stand alone and the Pink Cow is yours.</p>
      <div className="joinblock">
        <div className="qrframe">{join?.qr ? <img src={join.qr} alt={`Join room ${state.code}`} /> : <span />}</div>
        <div><small>Scan to join</small><b>{state.code}</b><p>{join?.url || notice}</p></div>
      </div>
    </div>
    <div className="tvlobby__pen">
      <header><span>In the pasture</span><b>{state.players.length}/{state.maxPlayers}</b></header>
      <div className="tvroster">
        <AnimatePresence mode="popLayout">
          {state.players.map((player) => <EarTag key={player.id} player={player} />)}
        </AnimatePresence>
        {!state.players.length && <div className="emptytag">The first player becomes the Question Wrangler.</div>}
      </div>
      <div className={`readystamp ${missing ? '' : 'is-ready'}`}>{missing ? `Waiting for ${missing} more` : `Ready when ${state.hostName} is`}</div>
    </div>
  </Phase>;
}

function QuestionOpening({ state }) {
  return <Phase phaseKey={`tv-question-open-${state.roundNo}`} className="tvquestion tvquestion--opening">
    <div className="questioncard">
      <span>Round {state.roundNo}</span>
      <motion.b aria-hidden="true" initial={{ rotate: -8, scale: .4 }} animate={{ rotate: 0, scale: 1 }} exit={{ opacity: 0, scale: .8 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>?</motion.b>
      <h1>{state.currentQuestion.text}</h1>
    </div>
    <p>Phones down until the gate opens.</p>
  </Phase>;
}

function HerdRail({ state }) {
  return <div className="herdrail">
    <div className="herdrail__track"><span style={{ transform: `scaleX(${state.submissionsIn / Math.max(1, state.players.length)})` }} /></div>
    <motion.div className="herdrail__tags" layout>
      {state.players.map((player) => <EarTag key={player.id} player={player} compact answered={state.answeredPlayerIds.includes(player.id)} />)}
    </motion.div>
    <strong>{state.submissionsIn} / {state.players.length} in the pen</strong>
  </div>;
}

function Answering({ state }) {
  return <Phase phaseKey={`tv-answering-${state.roundNo}`} className="tvquestion">
    <div className="questioncard questioncard--live">
      <span>Answer on your phone</span>
      <h1>{state.currentQuestion.text}</h1>
    </div>
    <HerdRail state={state} />
    <p className="moohint">Taking too long? The official response is a gentle "mooooo."</p>
  </Phase>;
}

function Review({ state }) {
  return <Phase phaseKey={`tv-review-${state.roundNo}`} className="tvreview">
    <div className="reviewseal"><CowToken pulse /><span>Wrangler at work</span></div>
    <span className="kicker">One quick confidence check</span>
    <h1>Checking a phrase or spelling.</h1>
    <p>{state.hostName} only steps in when automatic grouping is unsure.</p>
    <div className="closedgates" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    <b>{state.reviewIssueCount} {state.reviewIssueCount === 1 ? 'answer needs' : 'answers need'} a call</b>
  </Phase>;
}

function Reveal({ state }) {
  const reduceMotion = useReducedMotion();
  const headline = resultHeadline(state);
  const clock = useClock(state);
  const groups = state.groups.slice().sort((a, b) => b.answers.length - a.answers.length);
  const oddPlayer = playerById(state, state.roundResult?.oddPlayerId);
  return <Phase phaseKey={`tv-reveal-${state.roundNo}`} className="tvreveal">
    <div className="tvreveal__headline"><div><span className="kicker">{headline.eyebrow}</span><h1>{headline.title}</h1></div><small>Next round {Math.ceil(clock / 1000)}s</small></div>
    <motion.div className={`revealherds revealherds--${Math.min(groups.length, 6)}`} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: reduceMotion ? 0 : .09, delayChildren: .12 } } }}>
      {groups.map((group) => {
        const majority = state.roundResult.majorityGroupId === group.id;
        const odd = group.answers.some((answer) => answer.playerId === state.roundResult.oddPlayerId);
        return <motion.article layout key={group.id} className={`revealherd ${majority ? 'is-majority' : ''} ${odd ? 'is-odd' : ''}`} variants={{ hidden: { opacity: 0, y: 28, scale: .95 }, show: { opacity: 1, y: 0, scale: 1 } }} transition={{ duration: .45, ease: [0.2, .8, .2, 1] }}>
          <header><span>{majority ? '+1 cow each' : odd ? 'Sole odd one out' : 'Answer group'}</span><b>{group.answers.length}</b></header>
          <h2>{group.answers[0]?.rawAnswer}</h2>
          <div>{group.answers.map((answer) => <span key={answer.playerId} style={{ '--player': playerById(state, answer.playerId)?.colour }}>{answer.playerName}</span>)}</div>
          {odd && <CowToken />}
        </motion.article>;
      })}
    </motion.div>
    <div className={`tvverdict ${state.roundResult.tied ? 'is-tied' : oddPlayer ? 'has-pink' : ''}`}>
      {state.roundResult.tied ? <><b>Even split.</b><span>No cows scored. The Pink Cow stays where it is.</span></> : oddPlayer ? <><CowToken small /><b>{oddPlayer.name} takes the Pink Cow.</b><span>It blocks the win until someone else stands alone.</span></> : <><b>No sole odd answer.</b><span>The Pink Cow does not move.</span></>}
    </div>
  </Phase>;
}

function GameOver({ state }) {
  const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
  return <Phase phaseKey="tv-game-over" className="tvgameover">
    <motion.div className="winnerburst" initial={{ scale: .5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: .94 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }}><span>The herd has spoken</span><CowToken /></motion.div>
    <span className="kicker">{state.historyLength} rounds - final score</span>
    <h1>{winners.map((player) => player.name).join(' & ')}<br /><em>{winners.length === 1 ? 'wins!' : 'win!'}</em></h1>
    <ScoreRail state={state} />
    <p>{state.hostName} can start another game from their phone.</p>
  </Phase>;
}

createRoot(document.getElementById('root')).render(<TVApp />);
