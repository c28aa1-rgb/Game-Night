'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const { app, io } = require('../../lib/host');
const joinCodes = require('../../lib/join');
const questions = require('./questions.json');
const Engine = require('./engine');
const { isKnownAnswer } = require('./word-confidence');

Engine.validateQuestions(questions);

const BASE = require('../registry').find((game) => game.id === 'herd-mentality')?.basePath || '/herd-mentality';
const QUESTION_OPEN_MS = Number(process.env.HERD_QUESTION_OPEN_MS) || 2600;
const REVEAL_MS = Number(process.env.HERD_REVEAL_MS) || 11500;
const ROOM_TTL_MS = 1000 * 60 * 60 * 6;

const PLAYER_COLOURS = [
  '#F6C95D', '#62B28C', '#5EB8D1', '#F07A5A', '#A889D8', '#E69AB6',
  '#E7E0CB', '#EF9F45', '#7DA2E8', '#95B85B', '#D87D7D', '#A9A17B',
];
const CODE_WORDS = [
  'HERD', 'MOO', 'BARN', 'HAY', 'CALF', 'COW', 'MILK', 'FIELD', 'FENCE', 'BELL',
  'HOOF', 'GRASS', 'PAIL', 'FARM', 'RANCH', 'YOKE', 'UDDER', 'PASTURE', 'STRAW', 'STALL',
];

const rooms = new Map();
const nsp = io.of(BASE);

app.use(BASE, express.static(path.join(__dirname, 'public')));

function freeCode() {
  const available = CODE_WORDS.filter((code) => !rooms.has(code) && joinCodes.isFree(code));
  if (available.length) return available[Math.floor(Math.random() * available.length)];
  let code;
  do {
    code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  } while (rooms.has(code) || !joinCodes.isFree(code));
  return code;
}

function createRoom() {
  const code = freeCode();
  const room = Object.assign(Engine.createGameState(code), {
    tvSockets: new Set(),
    clock: null,
    createdAt: Date.now(),
    touchedAt: Date.now(),
    moment: { id: 0, kind: 'lobby' },
  });
  rooms.set(code, room);
  joinCodes.claim(code, 'herd-mentality', `${BASE}/play`);
  return room;
}

function clearClock(room) {
  if (room.clock?.handle) clearTimeout(room.clock.handle);
  room.clock = null;
}

function startClock(room, ms, onEnd) {
  clearClock(room);
  room.clock = {
    total: ms,
    endsAt: Date.now() + ms,
    handle: setTimeout(() => {
      room.clock = null;
      onEnd();
    }, ms),
  };
}

function msLeft(room) {
  return room.clock ? Math.max(0, room.clock.endsAt - Date.now()) : 0;
}

function dropRoom(code) {
  const room = rooms.get(code);
  if (room) clearClock(room);
  rooms.delete(code);
  joinCodes.release(code);
}

function setMoment(room, kind, payload = {}) {
  room.moment = { id: (room.moment?.id || 0) + 1, kind, ...payload };
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function findBySocket(room, socketId) {
  return room.players.find((player) => player.socketId === socketId) || null;
}

function reassignHost(room) {
  const host = findPlayer(room, room.hostId);
  if (host?.connected) return;
  room.hostId = room.players.find((player) => player.connected)?.id || room.players[0]?.id || null;
}

function publicPlayer(player, room) {
  const index = room.players.findIndex((entry) => entry.id === player.id);
  return {
    id: player.id,
    name: player.name,
    colour: PLAYER_COLOURS[index % PLAYER_COLOURS.length],
    connected: player.connected,
    isHost: player.id === room.hostId,
    score: room.scores[player.id] || 0,
    hasPinkCow: player.id === room.pinkCowHolderId,
    hasSubmitted: room.submissions.has(player.id),
  };
}

function visibleGroups(room) {
  if (![Engine.PHASES.REVEAL, Engine.PHASES.GAME_OVER].includes(room.phase)) return [];
  return room.groups.map((group) => ({
    id: group.id,
    canonical: group.canonical,
    answers: group.answers.map((answer) => ({
      playerId: answer.playerId,
      playerName: findPlayer(room, answer.playerId)?.name || 'Player',
      rawAnswer: answer.rawAnswer,
    })),
  }));
}

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    minPlayers: Engine.MIN_PLAYERS,
    maxPlayers: Engine.MAX_PLAYERS,
    maxAnswerLength: Engine.MAX_ANSWER_LENGTH,
    roundNo: room.roundNo,
    targetScore: room.targetScore,
    currentQuestion: room.phase === Engine.PHASES.LOBBY ? null : room.currentQuestion,
    submissionsIn: room.submissions.size,
    answeredPlayerIds: Array.from(room.submissions.keys()),
    answerGroupCount: room.groups.length,
    reviewIssueCount: room.reviewIssues.length,
    groups: visibleGroups(room),
    roundResult: [Engine.PHASES.REVEAL, Engine.PHASES.GAME_OVER].includes(room.phase)
      ? room.roundResult : null,
    winnerIds: room.winnerIds.slice(),
    pinkCowHolderId: room.pinkCowHolderId,
    hostId: room.hostId,
    hostName: findPlayer(room, room.hostId)?.name || null,
    players: room.players.map((player) => publicPlayer(player, room)),
    historyLength: room.history.length,
    msLeft: msLeft(room),
    phaseMs: room.clock?.total || 0,
    moment: room.moment,
  };
}

function reviewGroups(room) {
  const issues = new Map(room.reviewIssues.map((issue) => [issue.playerId, issue.reason]));
  return room.groups.map((group) => ({
    id: group.id,
    canonical: group.canonical,
    answers: group.answers.map((answer) => ({
      playerId: answer.playerId,
      playerName: findPlayer(room, answer.playerId)?.name || 'Player',
      rawAnswer: answer.rawAnswer,
      reviewIssue: issues.get(answer.playerId) || null,
    })),
  }));
}

function privateState(room, player) {
  return {
    playerId: player.id,
    isHost: player.id === room.hostId,
    myAnswer: room.submissions.get(player.id) || null,
    canAnswer: room.phase === Engine.PHASES.ANSWERING,
    reviewGroups: player.id === room.hostId && room.phase === Engine.PHASES.REVIEW
      ? reviewGroups(room) : [],
  };
}

function broadcast(room) {
  room.touchedAt = Date.now();
  nsp.to(`room:${room.code}`).emit('state', publicState(room));
  for (const player of room.players) {
    if (player.connected && player.socketId) {
      nsp.to(player.socketId).emit('private_state', privateState(room, player));
    }
  }
}

function openQuestion(room) {
  startClock(room, QUESTION_OPEN_MS, () => {
    try {
      Engine.openAnswering(room);
      setMoment(room, 'answers_open');
      broadcast(room);
    } catch {
      // The host may have reset the room while this short reveal was running.
    }
  });
}

function beginRound(room) {
  clearClock(room);
  Engine.startRound(room, questions);
  setMoment(room, 'question_open');
  openQuestion(room);
  broadcast(room);
}

function beginReview(room) {
  clearClock(room);
  Engine.beginReview(room, isKnownAnswer);
  if (!Engine.needsHostReview(room)) {
    revealRound(room);
    return false;
  }
  setMoment(room, 'review_open');
  broadcast(room);
  return true;
}

function revealRound(room) {
  clearClock(room);
  Engine.scoreRound(room);
  setMoment(room, room.phase === Engine.PHASES.GAME_OVER ? 'game_over' : 'round_reveal');
  if (room.phase === Engine.PHASES.REVEAL) {
    startClock(room, REVEAL_MS, () => beginRound(room));
  }
  broadcast(room);
}

function resetToLobby(room) {
  clearClock(room);
  const players = room.players;
  const hostId = room.hostId;
  const fresh = Engine.createGameState(room.code);
  Object.assign(room, fresh, {
    players,
    hostId,
    tvSockets: room.tvSockets,
    clock: null,
    createdAt: room.createdAt,
    touchedAt: Date.now(),
    moment: { id: (room.moment?.id || 0) + 1, kind: 'lobby' },
  });
  reassignHost(room);
  broadcast(room);
}

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));

app.get(BASE, (req, res, next) => {
  const code = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z]{2,8}$/.test(code)) return next();
  return res.redirect(302, `${BASE}/play?room=${encodeURIComponent(code)}`);
});
app.get(BASE, page('start.html'));
app.get(`${BASE}/play`, page('play.html'));
app.get(`${BASE}/tv`, page('tv.html'));

app.get(`${BASE}/api/join-info`, async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  const url = joinCodes.joinUrl(req, code);
  try {
    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 420,
      color: { dark: '#101B2A', light: '#FFF9E7' },
    });
    res.json({ url, qr });
  } catch {
    res.json({ url, qr: null });
  }
});

nsp.on('connection', (socket) => {
  let roomCode = null;
  const currentRoom = () => (roomCode ? rooms.get(roomCode) || null : null);

  function attach(room) {
    if (roomCode && roomCode !== room.code) socket.leave(`room:${roomCode}`);
    roomCode = room.code;
    socket.join(`room:${room.code}`);
  }

  function canControl(room, ack) {
    const player = findBySocket(room, socket.id);
    if (player?.id === room.hostId) return true;
    const host = findPlayer(room, room.hostId);
    if (room.tvSockets.has(socket.id) && !host?.connected) return true;
    ack?.({ error: host?.connected ? `${host.name} is running this game.` : 'Only the host can do that.' });
    return false;
  }

  function handleRegisterTv(payload = {}, ack) {
    const requested = String(payload.code || '').toUpperCase();
    const room = (requested && rooms.get(requested)) || createRoom();
    attach(room);
    room.tvSockets.add(socket.id);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  }

  socket.on('create_room', handleRegisterTv);
  socket.on('register_tv', handleRegisterTv);

  socket.on('new_room', (payload, ack) => {
    const oldRoom = currentRoom();
    if (!oldRoom) return ack?.({ error: 'That room is gone.' });
    if (!canControl(oldRoom, ack)) return;
    const room = createRoom();
    oldRoom.tvSockets.delete(socket.id);
    attach(room);
    room.tvSockets.add(socket.id);
    dropRoom(oldRoom.code);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  });

  function handleJoin(payload = {}, ack) {
    const name = String(payload.name || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    const requested = String(payload.code || '').trim().toUpperCase();
    if (!name) return ack?.({ error: 'Enter your name.' });
    const room = rooms.get(requested);
    if (!room) return ack?.({ error: `No Herd Mentality game found with code ${requested || '-'}.` });

    const returning = room.players.find((player) => player.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
    if (returning) {
      if (returning.connected) return ack?.({ error: `${returning.name} is already in the room.` });
      returning.connected = true;
      returning.socketId = socket.id;
      attach(room);
      reassignHost(room);
      ack?.({ ok: true, code: room.code, playerId: returning.id });
      broadcast(room);
      return;
    }

    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'That match is already underway.' });
    if (room.players.length >= Engine.MAX_PLAYERS) return ack?.({ error: `The room is full (${Engine.MAX_PLAYERS} players).` });
    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name,
      connected: true,
    };
    room.players.push(player);
    room.scores[player.id] = 0;
    if (!room.hostId) room.hostId = player.id;
    attach(room);
    ack?.({ ok: true, code: room.code, playerId: player.id });
    broadcast(room);
  }

  socket.on('join_game', handleJoin);
  socket.on('join_room', handleJoin);

  socket.on('rejoin', (payload = {}, ack) => {
    const room = rooms.get(String(payload.code || '').toUpperCase());
    const player = room ? findPlayer(room, payload.playerId) : null;
    if (!room || !player) return ack?.({ error: 'That seat no longer exists.' });
    const displaced = player.socketId;
    player.connected = true;
    player.socketId = socket.id;
    attach(room);
    reassignHost(room);
    if (displaced && displaced !== socket.id) nsp.to(displaced).emit('seat_taken', { name: player.name });
    ack?.({ ok: true, code: room.code, playerId: player.id });
    broadcast(room);
  });

  socket.on('set_name', (payload = {}, ack) => {
    const room = currentRoom();
    const player = room ? findBySocket(room, socket.id) : null;
    if (!room || !player) return ack?.({ error: 'You are not in this game.' });
    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'Names lock when the match starts.' });
    const name = String(payload.name || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!name) return ack?.({ error: 'Enter a name.' });
    if (room.players.some((entry) => entry.id !== player.id && entry.name.toLowerCase() === name.toLowerCase())) {
      return ack?.({ error: 'That name is already in the room.' });
    }
    player.name = name;
    ack?.({ ok: true, name });
    broadcast(room);
  });

  socket.on('start_game', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'The match has already started.' });
    try {
      Engine.startMatch(room, questions);
      setMoment(room, 'question_open');
      openQuestion(room);
      ack?.({ ok: true });
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('submit_answer', (payload = {}, ack) => {
    const room = currentRoom();
    const player = room ? findBySocket(room, socket.id) : null;
    if (!room || !player) return ack?.({ error: 'You are not in this game.' });
    try {
      Engine.submitAnswer(room, player.id, payload.answer);
      setMoment(room, 'answer_submitted', { playerId: player.id });
      ack?.({ ok: true });
      if (room.submissions.size === room.players.length) beginReview(room);
      else broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('close_answers', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    try {
      beginReview(room);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('review_merge_answers', (payload = {}, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    try {
      Engine.mergeGroups(room, payload.groupIds);
      setMoment(room, 'groups_changed');
      ack?.({ ok: true });
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('review_split_answer', (payload = {}, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    try {
      Engine.splitAnswer(room, payload.playerId);
      setMoment(room, 'groups_changed');
      ack?.({ ok: true });
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('review_confirm_groups', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    try {
      revealRound(room);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('next_round', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if (room.phase !== Engine.PHASES.REVEAL) return ack?.({ error: 'The reveal is not running.' });
    try {
      beginRound(room);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('reset_to_lobby', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    resetToLobby(room);
    ack?.({ ok: true });
  });

  socket.on('close_room', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    nsp.to(`room:${room.code}`).emit('room_closed');
    dropRoom(room.code);
    roomCode = null;
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = currentRoom();
    if (!room) return;
    room.tvSockets.delete(socket.id);
    const player = findBySocket(room, socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      reassignHost(room);
    }
    broadcast(room);
  });
});

const sweep = setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.touchedAt < cutoff) dropRoom(code);
  }
}, 1000 * 60 * 10);
sweep.unref?.();

module.exports = {
  rooms,
  createRoom,
  dropRoom,
  publicState,
  privateState,
  resetToLobby,
};
