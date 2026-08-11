import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export { React, AnimatePresence, motion, useEffect, useMemo, useRef, useState };

export const STORE_KEY = 'chameleon.player';
export const SHARED_NAME = 'arcade.name';
export const SPECTRUM = ['#EF2F70', '#FF8A1E', '#F6D447', '#98C93C', '#24B8B4', '#3D9FE6', '#8254C7'];

export const PHASE_LABELS = {
  lobby: 'Gathering the room',
  deal: 'Find your cover',
  clue: 'Clues in the open',
  voting: 'Mark the mimic',
  runoff: 'The room is split',
  chameleon_guess: 'One last disguise',
  reveal: 'Pattern exposed',
  game_over: 'Final pattern',
};

export function useRoomSocket(onPacket) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const callbackRef = useRef(onPacket);
  callbackRef.current = onPacket;

  useEffect(() => {
    const socket = window.io('/chameleon');
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (state) => callbackRef.current?.({ state }));
    socket.on('private_state', (privateState) => callbackRef.current?.({ privateState }));
    socket.on('seat_taken', (payload) => callbackRef.current?.({ seatTaken: payload }));
    return () => socket.disconnect();
  }, []);

  function emit(event, payload = {}) {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) return resolve({ error: 'The game is reconnecting.' });
      socket.emit(event, payload, (result = {}) => resolve(result));
    });
  }

  return { connected, emit, socketRef };
}

export function roomFromUrl() {
  return (new URLSearchParams(window.location.search).get('room') || '').trim().toUpperCase();
}

export function readIdentity() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

export function saveIdentity(identity) {
  localStorage.setItem(STORE_KEY, JSON.stringify(identity));
  if (identity?.name) localStorage.setItem(SHARED_NAME, identity.name);
}

export function playerById(state, id) {
  return state?.players?.find((player) => player.id === id) || null;
}

export function coordinate(index) {
  return `${'ABCDE'[Math.floor(index / 5)]}${(index % 5) + 1}`;
}

export function useClock(state) {
  const [left, setLeft] = useState(state?.msLeft || 0);
  const snapshot = useRef({ at: Date.now(), left: state?.msLeft || 0, paused: !!state?.paused });

  useEffect(() => {
    snapshot.current = { at: Date.now(), left: state?.msLeft || 0, paused: !!state?.paused };
    setLeft(state?.msLeft || 0);
  }, [state?.msLeft, state?.paused, state?.phase, state?.activeSpeakerId]);

  useEffect(() => {
    const id = setInterval(() => {
      const snap = snapshot.current;
      setLeft(snap.paused ? snap.left : Math.max(0, snap.left - (Date.now() - snap.at)));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return left;
}

export function formatClock(ms) {
  if (!ms) return '—';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function Brand({ small = false }) {
  return <div className={`brand ${small ? 'brand--small' : ''}`} aria-label="Chameleon">
    {'CHAMELEON'.split('').map((letter, index) => (
      <span key={`${letter}-${index}`} style={{ '--brand-color': SPECTRUM[index % SPECTRUM.length] }}>{letter}</span>
    ))}
  </div>;
}

export function ScoreStrip({ state, compact = false }) {
  return <div className={`scorestrip ${compact ? 'scorestrip--compact' : ''}`} aria-label="Match score">
    <div className="scorestrip__side scorestrip__side--town"><span>Town</span><strong>{state?.scores?.town ?? 0}</strong></div>
    <div className="scorestrip__target"><span>First to</span><b>{state?.config?.targetScore ?? 10}</b></div>
    <div className="scorestrip__side scorestrip__side--chameleon"><strong>{state?.scores?.chameleon ?? 0}</strong><span>Chameleon</span></div>
  </div>;
}

export function PlayerChip({ player, active = false, voted = false, compact = false }) {
  if (!player) return null;
  return <motion.div layout className={`playerchip ${active ? 'is-active' : ''} ${voted ? 'is-voted' : ''} ${!player.connected ? 'is-away' : ''} ${compact ? 'is-compact' : ''}`}
    style={{ '--player': player.colour.hex, '--player-ink': player.colour.ink }}>
    <span className="playerchip__dot" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>
    <span className="playerchip__name">{player.name}</span>
    {player.isHost && <span className="playerchip__host">host</span>}
    {voted && <span className="playerchip__check" aria-label="Vote received">✓</span>}
  </motion.div>;
}

export function WordGrid({ words = [], targetWord = null, interactive = false, selected = null, onSelect, muted = false, compact = false, phaseKey = '' }) {
  return <motion.div className={`wordgrid ${interactive ? 'wordgrid--interactive' : ''} ${muted ? 'wordgrid--muted' : ''} ${compact ? 'wordgrid--compact' : ''}`}
    key={`${phaseKey}:${words.join('|')}`} initial="hidden" animate="show"
    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.014, delayChildren: 0.05 } } }}>
    {words.map((word, index) => {
      const isTarget = targetWord && word === targetWord;
      const isSelected = selected === word;
      const Cell = interactive ? motion.button : motion.div;
      return <Cell key={`${word}-${index}`} type={interactive ? 'button' : undefined}
        className={`wordcell ${isTarget ? 'is-target' : ''} ${isSelected ? 'is-selected' : ''}`}
        style={{ '--cell-color': SPECTRUM[index % SPECTRUM.length], '--wave-delay': `${index * 18}ms` }}
        onClick={interactive ? () => onSelect?.(word) : undefined}
        aria-pressed={interactive ? isSelected : undefined}
        variants={{ hidden: { opacity: 0, y: 10, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
        transition={{ duration: 0.28, ease: [0.05, 0.7, 0.1, 1] }}>
        <span className="wordcell__coord">{coordinate(index)}</span>
        <span className="wordcell__word">{word}</span>
        {isTarget && <span className="wordcell__target">target</span>}
      </Cell>;
    })}
  </motion.div>;
}

export function PhaseShell({ phase, children, className = '' }) {
  return <motion.section key={phase} className={`phase ${className}`}
    initial={{ opacity: 0, y: 14, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.995 }}
    transition={{ duration: 0.36, ease: [0.05, 0.7, 0.1, 1] }}>
    {children}
  </motion.section>;
}

export function useChameleonAudio(state, enabled, options = {}) {
  const music = options.music !== false;
  const cues = options.cues !== false;
  const previous = useRef({ phase: null, moment: null });
  useEffect(() => {
    const audio = window.ChameleonAudio;
    if (!audio) return;
    audio.setEnabled(enabled);
    if (!enabled || !state) return;
    if (music && state.phase === 'lobby') audio.startLobby();
    else audio.stopLobby();
    if (cues && state.moment?.id !== previous.current.moment) audio.cue(state.moment?.kind || state.phase);
    previous.current = { phase: state.phase, moment: state.moment?.id };
  }, [state?.phase, state?.moment?.id, enabled, music, cues]);
}

export function resultCopy(state) {
  const result = state?.roundResult;
  if (!result) return { eyebrow: 'Round complete', title: 'Pattern exposed', detail: '' };
  if (result.reason === 'wrong_accusation') return {
    eyebrow: 'The room chose wrong',
    title: 'The Chameleon blended in',
    detail: `Chameleon +${result.chameleonPoints}`,
  };
  if (result.reason === 'runoff_tie') return {
    eyebrow: 'The runoff tied',
    title: result.guessCorrect ? 'The Chameleon found the word' : 'The room never found one voice',
    detail: `Chameleon +${result.chameleonPoints}`,
  };
  return {
    eyebrow: result.caught ? 'Caught in the pattern' : 'Still hidden',
    title: result.guessCorrect ? 'The Chameleon guessed it' : 'The disguise failed',
    detail: `Town +${result.townPoints} · Chameleon +${result.chameleonPoints}`,
  };
}
