import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GAME_TUTORIALS } from './games.js';

const SLIDE_MS = 16000;
const DEFAULT_BEAT_MS = 4500;
const EASE = [0.2, 0, 0, 1];

function PlayPauseIcon({ playing }) {
  return <span className={`tutorial-play-icon${playing ? ' is-pause' : ' is-play'}`} aria-hidden="true">
    {playing ? <><i /><i /></> : <i />}
  </span>;
}

function ChoiceCard({ title, items, selected = 0 }) {
  return <motion.div className="scene-choice-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease: EASE }}>
    <small>{title}</small>
    {items.map((item, index) => <span className={index === selected ? 'is-selected' : ''} key={item}>{item}</span>)}
  </motion.div>;
}

function SceneEffect({ action, type, phase, reduced }) {
  if (!action) return null;

  if (action === 'hitster-listen' && type === 'tv') {
    return <div className="scene-effect scene-hitster-listen">
      <motion.div animate={reduced ? {} : { scaleX: phase ? 0.82 : 0.28 }} transition={{ duration: 0.7, ease: EASE }} />
      <b>{phase ? 'YEAR STILL HIDDEN' : 'MYSTERY SONG PLAYING'}</b>
    </div>;
  }

  if (action === 'hitster-place' && type === 'phone') {
    return <div className="scene-effect scene-hitster-place">
      <motion.div className="scene-hitster-gap" animate={reduced ? {} : { y: phase === 0 ? -28 : phase === 1 ? 0 : 22, scale: phase === 1 ? 1.04 : 1 }} transition={{ duration: 0.62, ease: EASE }}>
        <small>{phase === 0 ? 'SCROLL' : phase === 1 ? 'CHOSEN GAP' : 'LOCKED'}</small>
        <b>BEFORE 2012</b>
      </motion.div>
      {phase === 2 && <motion.div className="scene-action-button" initial={{ scale: 0.96 }} animate={{ scale: [0.96, 0.92, 1] }} transition={{ duration: 0.42 }}>Place it here</motion.div>}
    </div>;
  }

  if (action === 'hitster-reveal' && type === 'tv') {
    return <div className="scene-effect scene-hitster-reveal">
      {phase > 0 && <motion.div className="scene-year-card" initial={{ opacity: 0, y: -14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.62, ease: EASE }}>
        <small>RELEASE YEAR</small><b>2008</b><span>{phase === 2 ? '✓ CORRECT GAP' : 'CHECKING…'}</span>
      </motion.div>}
    </div>;
  }

  if (action === 'hitster-steal') {
    if (type === 'tv') return <div className="scene-effect scene-tv-banner"><motion.b animate={{ opacity: [0.65, 1, 0.65] }} transition={{ duration: 1.5, repeat: Infinity }}>STEALS OPEN</motion.b></div>;
    if (type === 'phone' && phase > 0) return <ChoiceCard title={phase === 1 ? 'STEAL CLAIMED' : 'QUICK QUIZ'} items={phase === 1 ? ['Name the title', 'Name the artist'] : ['Midnight City', 'M83']} selected={phase === 2 ? 1 : 0} />;
  }

  if (action === 'host-control' && type === 'phone') {
    return <div className="scene-effect scene-host-control">
      {phase > 0 && <motion.button type="button" tabIndex="-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, scale: phase === 1 ? [1, 0.96, 1] : 1 }} transition={{ duration: 0.45 }}> {phase === 1 ? 'Skip song' : 'Continue'} </motion.button>}
    </div>;
  }

  if (action === 'codenames-clue' && type === 'phone' && phase === 1) {
    return <motion.div className="scene-effect scene-spoken-clue" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}><small>SAY ALOUD</small><b>“OCEAN, 2”</b></motion.div>;
  }

  if (action === 'codenames-reveal') {
    if (type === 'phone' && phase === 1) return <motion.div className="scene-effect scene-code-reveal-button" initial={{ opacity: 0 }} animate={{ opacity: 1, scale: [1, 0.96, 1] }} transition={{ duration: 0.5 }} />;
    if (type === 'tv') return <div className="scene-effect scene-code-card-wrap"><motion.div className="scene-code-card" animate={reduced ? {} : { rotateY: phase === 2 ? 180 : 0 }} transition={{ duration: 0.8, ease: EASE }}><span>MATCH</span><b>MATCH</b></motion.div></div>;
  }

  if (action === 'codenames-outcomes' && type === 'tv') {
    const labels = ['CORRECT · KEEP GUESSING', 'WRONG COLOR · TURN ENDS', 'ASSASSIN · GAME OVER'];
    return <motion.div className={`scene-effect scene-outcome scene-outcome--${phase}`} key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>{labels[phase]}</motion.div>;
  }

  if (action === 'mafia-deal' && type === 'phone' && phase === 1) return <ChoiceCard title="YOUR SECRET ROLE" items={['Town', 'Mafia', 'Detective']} selected={1} />;

  if (action === 'mafia-role' && type === 'phone') {
    return <motion.div className="scene-effect scene-role-card" animate={reduced ? {} : { rotateY: phase === 1 ? 180 : 0 }} transition={{ duration: 0.78, ease: EASE }}>
      <span>Tap for your role</span><b>DETECTIVE</b>
    </motion.div>;
  }

  if (action === 'mafia-night') {
    const titles = ['MAFIA CHOOSE', 'DETECTIVE CHECKS', 'DOCTOR PROTECTS'];
    if (type === 'phone') return <ChoiceCard title={titles[phase]} items={['Host', 'Player 2', 'Player 3']} selected={phase % 3} />;
    if (type === 'tv') return <motion.div className="scene-effect scene-tv-banner" key={phase} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><b>{titles[phase]}</b></motion.div>;
  }

  if (action === 'mafia-morning' && type === 'tv') return <motion.div className="scene-effect scene-morning" key={phase} initial={{ clipPath: 'inset(0 50% 0 50%)' }} animate={{ clipPath: 'inset(0 0% 0 0%)' }} transition={{ duration: 0.65, ease: EASE }}>{phase ? 'DISCUSSION OPEN' : 'MORNING REPORT'}</motion.div>;

  if (action === 'mafia-vote') {
    if (type === 'phone') return <ChoiceCard title="YOUR VOTE" items={['Player 2', 'Player 3', 'Player 4']} selected={phase % 3} />;
    if (type === 'tv') return <motion.div className="scene-effect scene-ballot-count" key={phase} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}><b>{phase === 0 ? '1 / 5' : phase === 1 ? '4 / 5' : 'TALLY'}</b><small>BALLOTS</small></motion.div>;
  }

  if (action === 'hues-target' && type === 'phone') return <div className="scene-effect scene-color-choices">{['#bfe8ee', '#ec935b', '#87b95c', '#b89ad6'].map((color, index) => <motion.i key={color} style={{ background: color }} animate={{ scale: phase === 1 && index === 0 ? 1.14 : 1, opacity: phase === 1 && index !== 0 ? 0.42 : 1 }} transition={{ duration: 0.45 }} />)}</div>;

  if (action === 'hues-clue') {
    if (type === 'phone' && phase === 0) return <motion.div className="scene-effect scene-target-chip" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><i /><b>K10</b></motion.div>;
    if (type === 'tv' && phase === 1) return <motion.div className="scene-effect scene-spoken-clue" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}><small>SAY ALOUD</small><b>“SKY”</b></motion.div>;
  }

  if (action === 'hues-pin') {
    if (type === 'phone') return <div className="scene-effect scene-hues-wheels">
      <div className="scene-wheel"><motion.div animate={{ y: phase === 0 ? 0 : phase === 1 ? -35 : -70 }} transition={{ duration: 0.72, ease: EASE }}><span>H</span><b>J</b><span>K</span><span>L</span></motion.div></div>
      <div className="scene-wheel"><motion.div animate={{ y: phase === 0 ? 0 : phase === 1 ? -35 : -70 }} transition={{ duration: 0.72, ease: EASE }}><span>8</span><b>10</b><span>11</span><span>12</span></motion.div></div>
      {phase === 2 && <motion.div className="scene-action-button" initial={{ scale: 0.96 }} animate={{ scale: [0.96, 0.92, 1] }}>Submit</motion.div>}
    </div>;
    if (type === 'tv') return <div className="scene-effect"><motion.div className="scene-grid-selector" animate={{ left: phase === 0 ? '70%' : '36%', top: phase === 0 ? '34%' : '62%', opacity: phase === 0 ? 0.4 : 1 }} transition={{ duration: 0.85, ease: EASE }}><i /><span>{phase === 2 ? 'PIN' : 'J10'}</span></motion.div></div>;
  }

  if (action === 'hues-second' && type === 'tv') return <motion.div className="scene-effect scene-clue-round" key={phase} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}><b>{phase === 0 ? 'FIRST PINS' : phase === 1 ? 'SECOND CLUE' : 'REVERSE ORDER'}</b></motion.div>;

  if (action === 'hues-score' && type === 'tv') return <motion.div className="scene-effect scene-score-rings" animate={{ scale: 1 + phase * 0.22 }} transition={{ duration: 0.65, ease: EASE }}><b>{3 - phase}</b></motion.div>;

  if (action === 'wavelength-target' && type === 'phone') return <motion.div className="scene-effect scene-wavelength-target" animate={{ clipPath: phase === 0 ? 'inset(0 0 0 0)' : phase === 1 ? 'inset(0 0 0 0)' : 'inset(50% 50% 50% 50%)' }} transition={{ duration: 0.6, ease: EASE }}><span>PRIVATE TARGET</span><b>QUIET ←→ LOUD</b></motion.div>;

  if (action === 'wavelength-aim') {
    if (type === 'phone') return <div className="scene-effect scene-arrow-controls"><motion.i className="is-left" animate={{ scale: phase === 2 ? [1, 0.9, 1] : 1 }} /><motion.i className="is-right" animate={{ scale: phase < 2 ? [1, 0.88, 1] : 1, backgroundColor: phase < 2 ? 'rgba(90,213,232,.7)' : 'rgba(255,255,255,.14)' }} transition={{ duration: 0.52 }} /></div>;
    if (type === 'tv') return <div className="scene-effect scene-wavelength-dial"><motion.i animate={{ rotate: phase === 0 ? -18 : phase === 1 ? 14 : 9 }} transition={{ duration: 0.82, ease: EASE }} /></div>;
  }

  if (action === 'wavelength-score' && type === 'tv') return <motion.div className="scene-effect scene-wave-score" key={phase} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: phase ? 1 : 0, scale: 1 }}>{phase === 1 ? 'TARGET REVEALED' : phase === 2 ? '+4' : ''}</motion.div>;

  if (action === 'chameleon-role' && type === 'phone') return <motion.div className="scene-effect scene-chameleon-role" key={phase} initial={{ opacity: 0, rotateX: 45 }} animate={{ opacity: 1, rotateX: 0 }}><small>YOUR ROLE</small><b>{phase === 0 ? 'TOWN · FALSE ALARM' : phase === 1 ? 'CHAMELEON' : 'KEEP IT SECRET'}</b></motion.div>;

  if (action === 'chameleon-clue') {
    if (type === 'phone' && phase === 2) return <motion.div className="scene-effect scene-clue-submit" initial={{ scale: 1 }} animate={{ scale: [1, 0.94, 1] }}>I GAVE MY CLUE</motion.div>;
    if (type === 'tv' && phase === 1) return <motion.div className="scene-effect scene-spoken-clue" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><small>SAY ALOUD</small><b>“SIREN”</b></motion.div>;
  }

  if (action === 'chameleon-vote') {
    if (type === 'phone') return <ChoiceCard title="WHO IS THE CHAMELEON?" items={['Host', 'Player 2', 'Player 3']} selected={phase % 3} />;
    if (type === 'tv') return <motion.div className="scene-effect scene-ballot-count" key={phase} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}><b>{phase + 1} / 4</b><small>VOTES IN</small></motion.div>;
  }

  if (action === 'chameleon-runoff' && type === 'phone') return <ChoiceCard title="RUNOFF" items={['Host', 'Player 3']} selected={phase % 2} />;
  if (action === 'chameleon-guess' && type === 'phone') return <ChoiceCard title="FINAL GUESS" items={['False Alarm', 'Missing Sock', 'Secret Note']} selected={phase % 3} />;

  if (action === 'chameleon-score' && type === 'tv') {
    const points = ['CHAMELEON +2', 'TOWN +2', 'CHAMELEON +3'];
    return <motion.div className="scene-effect scene-result-score" key={phase} initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{points[phase]}</motion.div>;
  }

  if (action === 'score-win' && type === 'tv') return <motion.div className="scene-effect scene-result-score" key={phase} initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{phase === 0 ? 'SCORE UPDATES' : phase === 1 ? 'WINNER' : 'SUDDEN DEATH'}</motion.div>;

  return null;
}

function Device({ type, image, game, action, phase, layout, reduced }) {
  const label = type === 'tv' ? 'Shared TV' : 'Player phone';
  const channel = layout === type ? 'Main action' : type === 'phone' ? 'Player action' : 'Room update';
  return <figure className={`tutorial-device tutorial-device--${type}`}>
    <div className="tutorial-device__bezel">
      <div className="tutorial-device__screen">
        <AnimatePresence mode="sync" initial={false}>
          <motion.img
            key={`${type}-${image}-${phase}`}
            src={image}
            alt={`${game} ${label.toLowerCase()} during gameplay`}
            draggable="false"
            initial={reduced ? false : { opacity: 0.25, scale: 1.018 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.46, ease: EASE }}
            onError={(event) => event.currentTarget.closest('.tutorial-device__screen')?.classList.add('is-missing')}
          />
        </AnimatePresence>
        <span className="tutorial-device__fallback">Gameplay capture loading</span>
        <SceneEffect action={action} type={type} phase={phase} reduced={reduced} />
      </div>
      {type === 'phone' && <span className="tutorial-device__speaker" aria-hidden="true" />}
    </div>
    <figcaption><span>{label}</span><b>{channel}</b></figcaption>
  </figure>;
}

function GameplayScene({ config, slide, run, autoPlay, onReplay, onPrevious, onNext }) {
  const reduced = useReducedMotion();
  const scene = slide.scene || {};
  const phases = scene.phases?.length ? scene.phases : [{ label: 'Gameplay' }];
  const [phase, setPhase] = useState(0);
  const current = phases[phase];
  const layout = scene.layout || 'pair';
  const order = layout === 'phone' ? ['phone', 'tv'] : ['tv', 'phone'];

  useEffect(() => {
    if (!autoPlay || phases.length < 2) return undefined;
    const timer = window.setTimeout(() => setPhase((value) => (value + 1) % phases.length), scene.stepMs || DEFAULT_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [autoPlay, phase, phases.length, scene.stepMs, run, slide.title]);

  const imageFor = (type) => current[type] || (type === 'tv' ? config.tvShot : config.phoneShot);

  return <motion.div
    className={`tutorial-stage tutorial-stage--${layout}`}
    drag={reduced ? false : 'x'}
    dragConstraints={{ left: 0, right: 0 }}
    dragElastic={0.1}
    onDragEnd={(_, info) => { if (info.offset.x < -90) onNext(); if (info.offset.x > 90) onPrevious(); }}
  >
    <div className="tutorial-stage__topline">
      <span><i /> Gameplay demo</span>
      <button type="button" onClick={onReplay} aria-label="Replay this gameplay demonstration">↻ Replay demo</button>
    </div>
    <div className="tutorial-devices">
      {order.map((type) => <Device key={type} type={type} image={imageFor(type)} game={config.name} action={scene.action} phase={phase} layout={layout} reduced={reduced} />)}
    </div>
    <div className="tutorial-beat" aria-live="polite">
      <span>{phase + 1} / {phases.length}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.b key={`${slide.title}-${phase}`} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -4 }} transition={{ duration: reduced ? 0.01 : 0.24 }}>{current.label}</motion.b>
      </AnimatePresence>
      <div className="tutorial-beat__dots" aria-label="Gameplay demonstration steps">
        {phases.map((item, index) => <button type="button" key={item.label} className={index === phase ? 'is-current' : ''} onClick={() => setPhase(index)} aria-label={`Show demo step ${index + 1}: ${item.label}`} aria-current={index === phase ? 'step' : undefined} />)}
      </div>
    </div>
  </motion.div>;
}

function Tutorial({ config, onClose }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sceneRun, setSceneRun] = useState(0);
  const reduced = useReducedMotion();
  const dialogRef = useRef(null);
  const slide = config.slides[index];
  const last = index === config.slides.length - 1;

  const go = (next) => {
    const bounded = Math.max(0, Math.min(config.slides.length - 1, next));
    setIndex(bounded);
    setSceneRun((value) => value + 1);
    if (bounded === config.slides.length - 1 && next > bounded) setPlaying(false);
  };

  useEffect(() => {
    document.body.classList.add('tutorial-is-open');
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const node = dialogRef.current;
    node?.querySelector('button')?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') { setIndex((current) => Math.min(config.slides.length - 1, current + 1)); setSceneRun((value) => value + 1); }
      if (event.key === 'ArrowLeft') { setIndex((current) => Math.max(0, current - 1)); setSceneRun((value) => value + 1); }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll('button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const final = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); final.focus(); }
      else if (!event.shiftKey && document.activeElement === final) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('tutorial-is-open');
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setTimeout(() => {
      if (last) setPlaying(false);
      else { setIndex((current) => current + 1); setSceneRun((value) => value + 1); }
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, playing, last]);

  return <motion.div className="tutorial-overlay" style={{ '--tutorial-accent': config.accent, '--tutorial-accent-2': config.accent2 }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="tutorial-dialog" role="dialog" aria-modal="true" aria-label={`${config.name} how to play`} ref={dialogRef}>
      <header className="tutorial-topbar">
        <div className="tutorial-brand"><span className="tutorial-brand__signal" aria-hidden="true" /><div><small>How to play</small><strong>{config.name}</strong></div></div>
        <p>{config.eyebrow}</p>
        <div className="tutorial-topbar__actions"><button type="button" className="tutorial-icon-button tutorial-close" onClick={onClose} aria-label="Close how to play"><span aria-hidden="true">×</span><b>Close</b></button></div>
      </header>

      <div className="tutorial-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / config.slides.length) * 100}%` }} />
        {playing && <motion.i key={`${index}-timer`} initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: SLIDE_MS / 1000, ease: 'linear' }} />}
      </div>

      <main className="tutorial-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={`${config.name}-${index}`} className="tutorial-slide" aria-live="polite" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: reduced ? 0.08 : 0.25, ease: EASE }}>
            <GameplayScene key={`${slide.title}-${sceneRun}`} config={config} slide={slide} run={sceneRun} autoPlay={playing} onReplay={() => setSceneRun((value) => value + 1)} onPrevious={() => go(index - 1)} onNext={() => go(index + 1)} />
            <aside className="tutorial-copy">
              <span className="tutorial-step">Step {String(index + 1).padStart(2, '0')} / {String(config.slides.length).padStart(2, '0')}</span>
              <h2>{slide.title}</h2>
              <p>{slide.body}</p>
              <ul>{slide.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            </aside>
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="tutorial-controls">
        <button type="button" className="tutorial-play" onClick={() => setPlaying(!playing)} aria-pressed={playing} aria-label={playing ? 'Pause tutorial' : 'Play tutorial'}>
          <PlayPauseIcon playing={playing} /><span className="tutorial-play__label">{playing ? 'Pause tour' : 'Play tour'}</span>
        </button>
        <div className="tutorial-dots" aria-label="Tutorial steps">{config.slides.map((item, dot) => <button type="button" key={item.title} className={dot === index ? 'is-current' : ''} onClick={() => { setIndex(dot); setSceneRun((value) => value + 1); }} aria-label={`Step ${dot + 1}: ${item.title}`} aria-current={dot === index ? 'step' : undefined}><span /></button>)}</div>
        <div className="tutorial-arrows">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0}><span aria-hidden="true">←</span> Back</button>
          {last ? <button type="button" className="is-primary" onClick={onClose}>Ready to play <span aria-hidden="true">✓</span></button> : <button type="button" className="is-primary" onClick={() => go(index + 1)}>Next <span aria-hidden="true">→</span></button>}
        </div>
      </footer>
    </div>
  </motion.div>;
}

let activeRoot = null;
let activeNode = null;
let activeTrigger = null;

function closeTutorial() {
  const trigger = activeTrigger;
  queueMicrotask(() => {
    activeRoot?.unmount();
    activeNode?.remove();
    activeRoot = null;
    activeNode = null;
    activeTrigger = null;
    trigger?.focus();
  });
}

function openTutorial(game, trigger) {
  const config = GAME_TUTORIALS[game];
  if (!config || activeRoot) return;
  activeTrigger = trigger;
  activeNode = document.createElement('div');
  activeNode.id = 'game-tutorial-root';
  document.body.append(activeNode);
  activeRoot = createRoot(activeNode);
  activeRoot.render(<Tutorial config={config} onClose={closeTutorial} />);
}

for (const button of document.querySelectorAll('[data-game-tutorial]')) {
  button.addEventListener('click', () => openTutorial(button.dataset.gameTutorial, button));
}
