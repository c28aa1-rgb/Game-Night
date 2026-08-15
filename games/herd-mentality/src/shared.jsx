import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const NAMESPACE = '/herd-mentality';

export function roomFromUrl() {
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
}

export function seatKey(code) {
  return `herd-mentality.seat.${String(code || '').toUpperCase()}`;
}

export function useRoomSocket(handlers = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = window.io(NAMESPACE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      handlersRef.current.connect?.();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (state) => handlersRef.current.state?.(state));
    socket.on('private_state', (state) => handlersRef.current.privateState?.(state));
    socket.on('seat_taken', (payload) => handlersRef.current.seatTaken?.(payload));
    socket.on('room_closed', () => handlersRef.current.roomClosed?.());
    return () => socket.disconnect();
  }, []);

  function emit(event, payload = {}) {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) return resolve({ error: 'Reconnecting. Try again in a moment.' });
      socket.timeout(6000).emit(event, payload, (error, result) => {
        if (error) resolve({ error: 'The room did not answer. Try again.' });
        else resolve(result || { ok: true });
      });
    });
  }

  return { connected, emit };
}

export function useClock(state) {
  const [left, setLeft] = useState(state?.msLeft || 0);
  useEffect(() => {
    setLeft(state?.msLeft || 0);
    if (!state?.msLeft) return undefined;
    const started = Date.now();
    const initial = state.msLeft;
    const timer = window.setInterval(() => setLeft(Math.max(0, initial - (Date.now() - started))), 100);
    return () => window.clearInterval(timer);
  }, [state?.moment?.id, state?.msLeft]);
  return left;
}

export function useHerdAudio(state, enabled, { music = false, cues = false } = {}) {
  const lastMoment = useRef(null);

  useEffect(() => {
    window.HerdAudio?.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!music || !state) return undefined;
    if (state.phase === 'lobby') window.HerdAudio?.startLobby();
    else window.HerdAudio?.stopLobby();
    return undefined;
  }, [music, state?.phase]);

  useEffect(() => {
    const moment = state?.moment;
    if (!moment || !cues) return;
    if (lastMoment.current === null) {
      lastMoment.current = moment.id;
      return;
    }
    if (lastMoment.current === moment.id) return;
    lastMoment.current = moment.id;
    window.HerdAudio?.cue(moment.kind, {
      submissionsIn: state.submissionsIn,
      playerCount: state.players.length,
      hasPinkCow: Boolean(state.roundResult?.oddPlayerId),
      tied: Boolean(state.roundResult?.tied),
    });
  }, [cues, state?.moment?.id]);
}

export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Herd Mentality">
    <span>Herd</span><b>Mentality</b>
  </div>;
}

export function CowToken({ small = false, pulse = false }) {
  return <span className={`cowtoken ${small ? 'cowtoken--small' : ''} ${pulse ? 'cowtoken--pulse' : ''}`} aria-label="Pink Cow">
    <i aria-hidden="true" /><b>MOO</b>
  </span>;
}

export function EarTag({ player, answered = false, compact = false, score = false }) {
  return <motion.div
    layout
    className={`eartag ${answered ? 'is-answered' : ''} ${compact ? 'eartag--compact' : ''} ${!player.connected ? 'is-away' : ''}`}
    style={{ '--tag': player.colour }}
    initial={{ opacity: 0, y: 12, scale: .96 }}
    animate={{ opacity: player.connected ? 1 : .55, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: .96 }}
    transition={{ duration: .28, ease: [0.2, 0.8, 0.2, 1] }}
  >
    <span className="eartag__punch" aria-hidden="true" />
    <b>{player.name}</b>
    {player.isHost && <small>Wrangler</small>}
    {(score || player.hasPinkCow) && <span className="eartag__tail">
      {score && <strong>{player.score}</strong>}
      {player.hasPinkCow && <CowToken small />}
    </span>}
  </motion.div>;
}

export function ScoreRail({ state, compact = false }) {
  const sorted = state.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return <div className={`scorerail ${compact ? 'scorerail--compact' : ''}`} aria-label={`Scores, first to ${state.targetScore}`}>
    <div className="scorerail__label"><span>First to</span><b>{state.targetScore}</b></div>
    <motion.div className="scorerail__players" layout>
      <AnimatePresence mode="popLayout">
        {sorted.map((player) => <EarTag key={player.id} player={player} compact score />)}
      </AnimatePresence>
    </motion.div>
  </div>;
}

export function Phase({ phaseKey, className = '', children }) {
  const reduceMotion = useReducedMotion();
  return <motion.section
    key={phaseKey}
    className={`phase ${className}`}
    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: .985 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: .99 }}
    transition={{ duration: reduceMotion ? .12 : .52, ease: [0.2, 0.8, 0.2, 1] }}
  >{children}</motion.section>;
}

export function PlayerAnswer({ answer, player, canSplit, onSplit }) {
  return <div className="playeranswer" style={{ '--player': player?.colour || '#F6C95D' }}>
    <span>{player?.name || answer.playerName}</span>
    <b>{answer.rawAnswer}</b>
    {answer.reviewIssue && <small className="reviewflag">{answer.reviewIssue === 'ambiguous_phrase' ? 'Compare phrase meaning' : 'Check spelling'}</small>}
    {canSplit && <button className="textbutton" type="button" onClick={() => onSplit(answer.playerId)}>Split</button>}
  </div>;
}

export function playerById(state, id) {
  return state?.players?.find((player) => player.id === id) || null;
}

export function resultHeadline(state) {
  const result = state.roundResult;
  if (!result) return { eyebrow: 'Round complete', title: 'Answers are in.' };
  if (result.tied) return { eyebrow: 'Split pasture', title: 'No herd this round.' };
  if (result.awardedPlayerIds.length === state.players.length) {
    return { eyebrow: 'Perfect herd', title: 'Everyone agreed.' };
  }
  return { eyebrow: 'Majority found', title: 'That is the herd.' };
}

export { React, AnimatePresence, motion, useReducedMotion, useEffect, useRef, useState };
