/**
 * Wavelength -- a two-team game of social calibration.
 *
 * The TV only sees what the room should see. The target travels in a private
 * payload to the active clue-giver's team phone and is erased as soon as that
 * phone enters the handoff/guess phase.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const { app, io } = require('../../lib/host');
const joinCodes = require('../../lib/join');
const BASE = '/wavelength';

const nsp = io.of(BASE);
const rooms = new Map();
const POSITIONS = 61;
const MIDPOINT = 30;
const MIN_ROUNDS = 3;
const MAX_ROUNDS = 10;
const PHONE_ROLES = ['clue', 'guess'];
const CODE_WORDS = [
  'WAVE', 'TONE', 'PULSE', 'ECHO', 'VIBE', 'SYNC', 'BAND', 'BEAM', 'HERTZ', 'LENS',
  'DIAL', 'NODE', 'SIGN', 'RING', 'GLOW', 'PHASE', 'METER', 'CHORD', 'AMPX', 'FREQ',
];

const PROMPTS = [
  ['Overrated', 'Underrated'], ['Quiet', 'Loud'], ['Ordinary', 'Bizarre'],
  ['Cheap', 'Expensive'], ['Useless superpower', 'Great superpower'],
  ['Bad party guest', 'Great party guest'], ['Trashy', 'Classy'], ['Not scary', 'Terrifying'],
  ['Forgettable', 'Iconic'], ['Worst road trip snack', 'Best road trip snack'],
  ['Hardly a sport', 'Definitely a sport'], ['Bad advice', 'Great advice'],
  ['Not romantic', 'Very romantic'], ['Boring job', 'Dream job'], ['Awful pet', 'Perfect pet'],
  ['Worst movie night pick', 'Best movie night pick'], ['Not a flex', 'Major flex'],
  ['Bad supervillain name', 'Excellent supervillain name'], ['Not chaotic', 'Pure chaos'],
  ['Bad first date', 'Perfect first date'], ['Not a risk', 'Huge risk'], ['Cursed food combo', 'Genius food combo'],
  ['Worst travel souvenir', 'Best travel souvenir'], ['Not nostalgic', 'Instant nostalgia'],
  ['Terrible band name', 'Great band name'], ['Not worth the wait', 'Worth every minute'],
  ['Mild opinion', 'Hot take'], ['Not impressive', 'Absurdly impressive'],
  ['Bad secret', 'Great secret'], ['Not a guilty pleasure', 'Ultimate guilty pleasure'],
  ['Worst roommate habit', 'Best roommate habit'], ['Not a hill to die on', 'The hill to die on'],
  ['Barely a treat', 'The perfect treat'], ['Not a vibe', 'Immaculate vibe'],
  ['Bad fictional world', 'Live there forever'], ['Not a comeback', 'Legendary comeback'],
];

function randomId(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }
function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
function isCode(value) { return /^[A-Z]{4,8}$/.test(String(value || '')); }
function normalCode(value) { return String(value || '').trim().toUpperCase(); }

function freeCode() {
  const available = CODE_WORDS.filter((code) => !rooms.has(code) && joinCodes.isFree(code));
  if (available.length) return randomItem(available);
  for (let tries = 0; tries < 100; tries++) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    if (!rooms.has(code) && joinCodes.isFree(code)) return code;
  }
  throw new Error('Could not create a free room code.');
}

function newRoom() {
  const code = freeCode();
  const room = {
    code,
    phase: 'lobby',
    teams: [
      { clue: null, guess: null },
      { clue: null, guess: null },
    ],
    tvSockets: new Set(),
    roundCount: 6,
    turn: 0,
    activeTeam: Math.random() < 0.5 ? 0 : 1,
    prompt: null,
    targetIndex: null,
    markerIndex: MIDPOINT,
    scores: [0, 0],
    lastScore: null,
    usedPrompts: new Set(),
    tiebreaker: false,
    tiebreakTurnsRemaining: 0,
    lastTouched: Date.now(),
  };
  rooms.set(code, room);
  joinCodes.claim(code, 'wavelength', `${BASE}/play`);
  return room;
}

function activeSession(room, socketId) {
  for (let team = 0; team < room.teams.length; team += 1) {
    for (const role of PHONE_ROLES) {
      const session = room.teams[team][role];
      if (session?.socketId === socketId) return session;
    }
  }
  return null;
}

function publicState(room) {
  const targetVisible = room.phase === 'reveal' || room.phase === 'game_over';
  return {
    code: room.code,
    phase: room.phase,
    teams: room.teams.map((team, index) => ({
      id: index,
      connected: PHONE_ROLES.every((role) => !!team[role]?.socketId),
      clueConnected: !!team.clue?.socketId,
      guessConnected: !!team.guess?.socketId,
    })),
    roundCount: room.roundCount,
    turn: room.turn,
    roundsRemaining: room.tiebreaker ? null : Math.max(0, room.roundCount - room.turn),
    activeTeam: room.activeTeam,
    prompt: room.prompt ? { low: room.prompt[0], high: room.prompt[1] } : null,
    markerIndex: room.markerIndex,
    positions: POSITIONS,
    scores: room.scores,
    reveal: targetVisible && room.targetIndex !== null ? {
      targetIndex: room.targetIndex,
      points: room.lastScore?.points || 0,
      band: room.lastScore?.band || 'miss',
      team: room.lastScore?.team,
    } : null,
    tiebreaker: room.tiebreaker,
    tiebreakTurnsRemaining: room.tiebreakTurnsRemaining,
    winner: room.phase === 'game_over' && room.scores[0] !== room.scores[1]
      ? (room.scores[0] > room.scores[1] ? 0 : 1) : null,
  };
}

function privateState(room, session) {
  const { team, role } = session;
  const isActive = team === room.activeTeam;
  return {
    team,
    role,
    roleLabel: role === 'clue' ? 'CLUE GIVER' : 'GUESSING PHONE',
    isActive,
    canHost: true,
    canShowTarget: room.phase === 'clue' && isActive && role === 'clue',
    targetIndex: room.phase === 'clue' && isActive && role === 'clue' ? room.targetIndex : null,
    canMove: room.phase === 'guess' && isActive && role === 'guess',
    canLock: room.phase === 'guess' && isActive && role === 'guess',
    canSkip: room.phase === 'clue' && isActive && role === 'clue',
  };
}

function broadcast(room) {
  room.lastTouched = Date.now();
  nsp.to(`room:${room.code}`).emit('state', publicState(room));
  room.teams.forEach((team) => {
    PHONE_ROLES.forEach((role) => {
      const session = team[role];
      if (session?.socketId) nsp.to(session.socketId).emit('private_state', privateState(room, session));
    });
  });
}

function drawPrompt(room) {
  if (room.usedPrompts.size >= PROMPTS.length) room.usedPrompts.clear();
  const choices = PROMPTS.map((prompt, id) => ({ prompt, id })).filter(({ id }) => !room.usedPrompts.has(id));
  const picked = randomItem(choices);
  room.usedPrompts.add(picked.id);
  room.prompt = picked.prompt;
  // The physical board wraps across its two bottom corners: a target at the
  // far left continues at the far right, and vice versa.
  room.targetIndex = Math.floor(Math.random() * POSITIONS);
  room.markerIndex = MIDPOINT;
  room.lastScore = null;
}

function beginTurn(room) {
  drawPrompt(room);
  room.phase = 'clue';
}

function pointsFor(marker, target) {
  const direct = Math.abs(marker - target);
  const distance = Math.min(direct, (POSITIONS - 1) - direct);
  if (distance <= 1) return { points: 4, band: 'center' };
  if (distance <= 4) return { points: 3, band: 'inner' };
  if (distance <= 7) return { points: 2, band: 'outer' };
  return { points: 0, band: 'miss' };
}

function startGame(room) {
  room.scores = [0, 0];
  room.turn = 0;
  room.tiebreaker = false;
  room.tiebreakTurnsRemaining = 0;
  room.usedPrompts.clear();
  room.activeTeam = Math.random() < 0.5 ? 0 : 1;
  beginTurn(room);
}

function resetRoom(room) {
  room.phase = 'lobby';
  room.turn = 0;
  room.activeTeam = Math.random() < 0.5 ? 0 : 1;
  room.prompt = null;
  room.targetIndex = null;
  room.markerIndex = MIDPOINT;
  room.scores = [0, 0];
  room.lastScore = null;
  room.usedPrompts.clear();
  room.tiebreaker = false;
  room.tiebreakTurnsRemaining = 0;
}

function advance(room) {
  if (room.phase !== 'reveal') return false;
  if (!room.tiebreaker && room.turn < room.roundCount) {
    room.activeTeam = room.activeTeam === 0 ? 1 : 0;
    beginTurn(room);
    return true;
  }
  if (!room.tiebreaker && room.scores[0] === room.scores[1]) {
    room.tiebreaker = true;
    room.tiebreakTurnsRemaining = 2;
    room.activeTeam = room.activeTeam === 0 ? 1 : 0;
    beginTurn(room);
    return true;
  }
  if (!room.tiebreaker) {
    room.phase = 'game_over';
    return true;
  }

  room.tiebreakTurnsRemaining -= 1;
  if (room.tiebreakTurnsRemaining > 0) {
    room.activeTeam = room.activeTeam === 0 ? 1 : 0;
    beginTurn(room);
    return true;
  }
  if (room.scores[0] !== room.scores[1]) {
    room.phase = 'game_over';
    return true;
  }
  room.tiebreakTurnsRemaining = 2;
  room.activeTeam = room.activeTeam === 0 ? 1 : 0;
  beginTurn(room);
  return true;
}

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));
app.use(BASE, express.static(path.join(__dirname, 'public')));
app.get(BASE, (req, res, next) => {
  const code = normalCode(req.query.room);
  if (isCode(code)) return res.redirect(302, `${BASE}/play?room=${encodeURIComponent(code)}`);
  return next();
});
app.get(BASE, page('start.html'));
app.get(`${BASE}/tv`, page('tv.html'));
app.get(`${BASE}/play`, page('play.html'));
app.get(`${BASE}/api/join-info`, async (req, res) => {
  const code = normalCode(req.query.code);
  const url = joinCodes.joinUrl(req, code);
  const room = rooms.get(code);
  const teams = room ? room.teams.map((team) => ({
    clue: { occupied: !!team.clue, connected: !!team.clue?.socketId },
    guess: { occupied: !!team.guess, connected: !!team.guess?.socketId },
  })) : [];
  try {
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: '#06111E', light: '#FFFFFF' } });
    res.json({ url, qr, teams });
  } catch { res.json({ url, qr: null, teams }); }
});

nsp.on('connection', (socket) => {
  let roomCode = null;
  function room() { return roomCode ? rooms.get(roomCode) || null : null; }
  function attach(target) {
    if (roomCode && roomCode !== target.code) socket.leave(`room:${roomCode}`);
    roomCode = target.code;
    socket.join(`room:${target.code}`);
  }
  function phone(target, ack) {
    const session = activeSession(target, socket.id);
    if (!session) { ack?.({ error: 'Join a team first.' }); return null; }
    return session;
  }

  socket.on('create_room', (payload = {}, ack) => {
    const target = newRoom();
    target.tvSockets.add(socket.id);
    attach(target);
    broadcast(target);
    ack?.({ code: target.code });
  });

  socket.on('watch_room', (payload = {}, ack) => {
    const target = rooms.get(normalCode(payload.code));
    if (!target) return ack?.({ error: 'That Wavelength room has ended.' });
    target.tvSockets.add(socket.id);
    attach(target);
    broadcast(target);
    ack?.({ ok: true });
  });

  socket.on('join_team', (payload = {}, ack) => {
    const target = rooms.get(normalCode(payload.code));
    const team = Number(payload.team);
    const role = String(payload.role || '');
    if (!target) return ack?.({ error: 'That room has ended.' });
    if (!Number.isInteger(team) || team < 0 || team > 1) return ack?.({ error: 'Choose Team 1 or Team 2.' });
    if (!PHONE_ROLES.includes(role)) return ack?.({ error: 'Choose a clue-giver or guessing phone.' });
    const existing = target.teams[team][role];
    const token = String(payload.token || '');
    if (existing && existing.token !== token && existing.socketId) return ack?.({ error: `That ${role} phone is already connected.` });
    if (existing && existing.token !== token && !existing.socketId) return ack?.({ error: `That ${role} phone is reserved. Rejoin from its original device.` });
    const session = existing || { token: randomId(), team, role };
    session.socketId = socket.id;
    target.teams[team][role] = session;
    attach(target);
    broadcast(target);
    ack?.({ ok: true, team, role, token: session.token });
  });

  socket.on('set_rounds', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'lobby') return;
    const rounds = Number(payload.rounds);
    if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) return ack?.({ error: 'Choose 3 to 10 rounds.' });
    target.roundCount = rounds;
    broadcast(target); ack?.({ ok: true });
  });

  socket.on('start_game', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'lobby') return;
    const ready = target.teams.every((team) => PHONE_ROLES.every((role) => !!team[role]?.socketId));
    if (!ready) return ack?.({ error: 'All four team phones need to join.' });
    startGame(target); broadcast(target); ack?.({ ok: true });
  });

  socket.on('clue_given', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'clue' || session.team !== target.activeTeam || session.role !== 'clue') return ack?.({ error: 'Only the active clue-giver phone can finish the clue.' });
    target.phase = 'guess'; broadcast(target); ack?.({ ok: true });
  });

  socket.on('skip_prompt', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'clue' || session.team !== target.activeTeam || session.role !== 'clue') {
      return ack?.({ error: 'Only the active clue-giver phone can skip this prompt.' });
    }
    drawPrompt(target);
    broadcast(target);
    ack?.({ ok: true });
  });

  socket.on('move_marker', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'guess' || session.team !== target.activeTeam || session.role !== 'guess') return ack?.({ error: 'Only the active guessing phone can move the marker.' });
    const delta = Number(payload.delta);
    if (delta !== -1 && delta !== 1) return ack?.({ error: 'Move one notch at a time.' });
    target.markerIndex = Math.max(0, Math.min(POSITIONS - 1, target.markerIndex + delta));
    broadcast(target); ack?.({ ok: true, markerIndex: target.markerIndex });
  });

  socket.on('lock_guess', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session || target.phase !== 'guess' || session.team !== target.activeTeam || session.role !== 'guess') return ack?.({ error: 'Only the active guessing phone can lock the marker.' });
    const result = pointsFor(target.markerIndex, target.targetIndex);
    target.scores[target.activeTeam] += result.points;
    target.lastScore = { ...result, team: target.activeTeam };
    target.turn += 1;
    target.phase = 'reveal';
    broadcast(target); ack?.({ ok: true });
  });

  socket.on('advance', (payload = {}, ack) => {
    const target = room(); const session = target && phone(target, ack);
    if (!session) return;
    if (!advance(target)) return ack?.({ error: 'Nothing is ready to advance.' });
    broadcast(target); ack?.({ ok: true });
  });

  function returnToLobby(payload = {}, ack) {
    const target = room();
    if (!target) return ack?.({ error: 'That Wavelength room has ended.' });
    if (!target.tvSockets.has(socket.id) && !phone(target, ack)) return;
    resetRoom(target); broadcast(target); ack?.({ ok: true });
  }

  socket.on('reset_room', returnToLobby);
  socket.on('return_to_lobby', returnToLobby);

  socket.on('disconnect', () => {
    const target = room();
    if (!target) return;
    target.tvSockets.delete(socket.id);
    target.teams.forEach((team) => PHONE_ROLES.forEach((role) => {
      if (team[role]?.socketId === socket.id) team[role].socketId = null;
    }));
    broadcast(target);
  });
});

setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 90;
  for (const room of rooms.values()) {
    const hasPhone = room.teams.some((team) => PHONE_ROLES.some((role) => team[role]?.socketId));
    if (room.lastTouched < cutoff && !hasPhone && !room.tvSockets.size) {
      rooms.delete(room.code); joinCodes.release(room.code);
    }
  }
}, 1000 * 60 * 15).unref();

module.exports = {
  onListen() { console.log(`  \u00b7 Wavelength   ${BASE}`); },
  _test: { activeSession, newRoom, pointsFor, privateState, publicState, resetRoom },
};
