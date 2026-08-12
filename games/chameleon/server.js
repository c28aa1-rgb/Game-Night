'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const { app, io } = require('../../lib/host');
const joinCodes = require('../../lib/join');
const decks = require('./decks.json');
const Engine = require('./engine');

Engine.validateDecks(decks);

const BASE = require('../registry').find((game) => game.id === 'chameleon')?.basePath || '/chameleon';
const PORT = Number(process.env.PORT) || 3000;
const DEAL_MS = Number(process.env.CHAMELEON_DEAL_MS) || 20000;
const TALLY_MS = Number(process.env.CHAMELEON_TALLY_MS) || 6200;

const PALETTE = [
  { id: 'fuchsia', name: 'Fuchsia', hex: '#EF2F70', ink: '#070608' },
  { id: 'mango', name: 'Mango', hex: '#FF8A1E', ink: '#070608' },
  { id: 'pollen', name: 'Pollen', hex: '#F6D447', ink: '#070608' },
  { id: 'leaf', name: 'Leaf', hex: '#98C93C', ink: '#070608' },
  { id: 'lagoon', name: 'Lagoon', hex: '#24B8B4', ink: '#070608' },
  { id: 'sky', name: 'Sky', hex: '#3D9FE6', ink: '#070608' },
  { id: 'violet', name: 'Violet', hex: '#8254C7', ink: '#F5F0D8' },
  { id: 'coral', name: 'Coral', hex: '#FF6257', ink: '#070608' },
  { id: 'mint', name: 'Mint', hex: '#55D6A0', ink: '#070608' },
  { id: 'orchid', name: 'Orchid', hex: '#C65BD7', ink: '#070608' },
  { id: 'bone', name: 'Bone', hex: '#F5F0D8', ink: '#070608' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3564D4', ink: '#F5F0D8' },
];

const CODE_WORDS = [
  'HIDE', 'MIMIC', 'BLEND', 'LEAF', 'SCALE', 'SHIFT', 'SHADE', 'TRACE', 'MASK', 'CLUE',
  'COLOR', 'TAIL', 'TELL', 'SPOT', 'COVER', 'INK', 'PALM', 'FERN', 'LUSH', 'GECKO',
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
    paused: false,
    clock: null,
    createdAt: Date.now(),
    touchedAt: Date.now(),
    moment: { id: 0, kind: 'lobby' },
  });
  rooms.set(code, room);
  joinCodes.claim(code, 'chameleon', `${BASE}/play`);
  return room;
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

function clearClock(room) {
  if (room.clock?.handle) clearTimeout(room.clock.handle);
  room.clock = null;
}

function armClock(room) {
  if (!room.clock || room.clock.handle || room.paused) return;
  room.clock.endsAt = Date.now() + room.clock.remaining;
  room.clock.handle = setTimeout(() => {
    const callback = room.clock?.onEnd;
    room.clock = null;
    callback?.();
  }, room.clock.remaining);
}

function startClock(room, ms, onEnd) {
  clearClock(room);
  room.clock = { total: ms, remaining: ms, endsAt: Date.now() + ms, handle: null, onEnd };
  armClock(room);
}

function msLeft(room) {
  if (!room.clock) return 0;
  if (room.paused || !room.clock.handle) return Math.max(0, room.clock.remaining);
  return Math.max(0, room.clock.endsAt - Date.now());
}

function setPaused(room, paused) {
  if (room.paused === paused) return;
  room.paused = paused;
  if (!room.clock) return;
  if (paused) {
    room.clock.remaining = msLeft(room);
    clearTimeout(room.clock.handle);
    room.clock.handle = null;
  } else {
    armClock(room);
  }
}

function findPlayer(room, id) {
  return room.players.find((player) => player.id === id) || null;
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
  const revealRole = room.phase === Engine.PHASES.REVEAL || room.phase === Engine.PHASES.GAME_OVER;
  const colour = PALETTE.find((entry) => entry.id === player.colour) || PALETTE[0];
  return {
    id: player.id,
    name: player.name,
    colour,
    connected: player.connected,
    isHost: player.id === room.hostId,
    revealedRole: revealRole ? (player.id === room.chameleonId ? 'chameleon' : 'town') : null,
  };
}

function voteTally(room) {
  const visible = [Engine.PHASES.TALLY, Engine.PHASES.REVEAL, Engine.PHASES.GAME_OVER].includes(room.phase);
  if (!visible || !room.ballots.length) return null;
  return {
    accusedId: room.accusedId,
    reason: room.roundResult?.reason || null,
    caught: room.roundResult?.caught ?? null,
    ballots: room.ballots.map((ballot) => ({
      kind: ballot.kind,
      counts: { ...ballot.counts },
    })),
  };
}

function publicState(room) {
  const reveal = room.phase === Engine.PHASES.REVEAL || room.phase === Engine.PHASES.GAME_OVER;
  return {
    code: room.code,
    phase: room.phase,
    paused: room.paused,
    msLeft: msLeft(room),
    phaseMs: room.clock?.total || 0,
    minPlayers: Engine.MIN_PLAYERS,
    maxPlayers: Engine.MAX_PLAYERS,
    config: { ...room.config },
    scores: { ...room.scores },
    roundNo: room.roundNo,
    category: room.category,
    grid: room.grid.slice(),
    targetWord: reveal ? room.targetWord : null,
    clueRound: room.clueRound,
    clueAt: room.clueAt,
    clueOrder: room.clueOrder.slice(),
    activeSpeakerId: Engine.activeSpeakerId(room),
    votesIn: room.votes.size,
    votedIds: [Engine.PHASES.VOTING, Engine.PHASES.RUNOFF].includes(room.phase)
      ? Array.from(room.votes.keys()) : [],
    runoffCandidates: room.runoffCandidates.slice(),
    accusedId: (reveal || room.phase === Engine.PHASES.TALLY) ? room.accusedId : null,
    guessingPlayerId: room.phase === Engine.PHASES.CHAMELEON_GUESS ? room.chameleonId : null,
    chameleonGuess: reveal ? room.chameleonGuess : null,
    roundResult: (reveal || room.phase === Engine.PHASES.TALLY) ? room.roundResult : null,
    tally: voteTally(room),
    tallyNextPhase: room.phase === Engine.PHASES.TALLY ? room.tallyNextPhase : null,
    winner: room.winner,
    history: room.history.map((entry) => ({ ...entry, scores: { ...entry.scores } })),
    hostId: room.hostId,
    hostName: findPlayer(room, room.hostId)?.name || null,
    players: room.players.map((player) => publicPlayer(player, room)),
    palette: PALETTE.map((colour) => ({
      ...colour,
      takenBy: room.players.find((player) => player.colour === colour.id)?.name || null,
    })),
    moment: room.moment,
  };
}

function privateState(room, player) {
  const isChameleon = player.id === room.chameleonId;
  const secretLive = ![Engine.PHASES.LOBBY, Engine.PHASES.REVEAL, Engine.PHASES.GAME_OVER].includes(room.phase);
  return {
    playerId: player.id,
    role: room.phase === Engine.PHASES.LOBBY ? null : (isChameleon ? 'chameleon' : 'town'),
    targetWord: secretLive && !isChameleon ? room.targetWord : null,
    isHost: player.id === room.hostId,
    isSpeaker: Engine.activeSpeakerId(room) === player.id,
    myVote: room.votes.get(player.id) || null,
    canVote: [Engine.PHASES.VOTING, Engine.PHASES.RUNOFF].includes(room.phase),
    canGuess: room.phase === Engine.PHASES.CHAMELEON_GUESS && isChameleon,
  };
}

function broadcast(room) {
  room.touchedAt = Date.now();
  nsp.to(`room:${room.code}`).emit('state', publicState(room));
  for (const player of room.players) {
    if (player.connected && player.socketId) nsp.to(player.socketId).emit('private_state', privateState(room, player));
  }
}

function armForPhase(room) {
  clearClock(room);
  if (room.phase === Engine.PHASES.DEAL) {
    startClock(room, DEAL_MS, () => {
      Engine.openClues(room);
      setMoment(room, 'clue_open');
      armForPhase(room);
      broadcast(room);
    });
  } else if (room.phase === Engine.PHASES.CLUE && room.config.timers) {
    startClock(room, room.config.clueSeconds * 1000, () => advanceClue(room, true));
  } else if ([Engine.PHASES.VOTING, Engine.PHASES.RUNOFF].includes(room.phase) && room.config.timers) {
    startClock(room, room.config.voteSeconds * 1000, () => closeBallot(room));
  } else if (room.phase === Engine.PHASES.TALLY) {
    startClock(room, TALLY_MS, () => finishTally(room));
  } else if (room.phase === Engine.PHASES.CHAMELEON_GUESS && room.config.timers) {
    startClock(room, room.config.guessSeconds * 1000, () => {
      Engine.closeGuessOnTimer(room);
      setMoment(room, 'guess_closed');
      armForPhase(room);
      broadcast(room);
    });
  }
}

function beginTally(room) {
  room.tallyNextPhase = room.phase;
  room.phase = Engine.PHASES.TALLY;
  setMoment(room, 'vote_tally');
  armForPhase(room);
}

function finishTally(room) {
  if (room.phase !== Engine.PHASES.TALLY || !room.tallyNextPhase) return;
  room.phase = room.tallyNextPhase;
  room.tallyNextPhase = null;
  setMoment(room, room.phase === Engine.PHASES.RUNOFF ? 'runoff_open'
    : room.phase === Engine.PHASES.CHAMELEON_GUESS ? 'chameleon_guess' : 'round_reveal');
  armForPhase(room);
  broadcast(room);
}

function advanceClue(room, forced = false, playerId = null) {
  Engine.advanceClue(room, playerId, forced);
  setMoment(room, room.phase === Engine.PHASES.VOTING ? 'vote_open' : 'speaker_changed');
  armForPhase(room);
  broadcast(room);
}

function closeBallot(room) {
  Engine.closeVoteOnTimer(room);
  beginTally(room);
  broadcast(room);
}

function resetRoom(room) {
  clearClock(room);
  const players = room.players;
  const hostId = room.hostId;
  const config = { ...room.config };
  const fresh = Engine.createGameState(room.code);
  Object.assign(room, fresh, {
    players,
    hostId,
    config,
    tvSockets: room.tvSockets,
    paused: false,
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
      color: { dark: '#070608', light: '#F5F0D8' },
    });
    res.json({ url, qr });
  } catch {
    res.json({ url, qr: null });
  }
});

app.get(`${BASE}/api/palette`, (req, res) => {
  const room = rooms.get(String(req.query.code || '').toUpperCase());
  res.json({
    palette: PALETTE.map((colour) => ({
      ...colour,
      takenBy: room?.players.find((player) => player.colour === colour.id)?.name || null,
    })),
  });
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

  function canEndGame(room, ack) {
    const player = findBySocket(room, socket.id);
    if (player?.id === room.hostId || room.tvSockets.has(socket.id)) return true;
    ack?.({ error: 'Only the host screen can return the room to the lobby.' });
    return false;
  }

  socket.on('create_room', (payload = {}, ack) => {
    const requested = String(payload.code || '').toUpperCase();
    const room = (requested && rooms.get(requested)) || createRoom();
    attach(room);
    room.tvSockets.add(socket.id);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('register_tv', (payload = {}, ack) => {
    const requested = String(payload.code || '').toUpperCase();
    const room = (requested && rooms.get(requested)) || createRoom();
    attach(room);
    room.tvSockets.add(socket.id);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('new_room', (payload, ack) => {
    const oldRoom = currentRoom();
    if (!oldRoom) return ack?.({ error: 'That room is gone.' });
    if (!canEndGame(oldRoom, ack)) return;
    const room = createRoom();
    oldRoom.tvSockets.delete(socket.id);
    attach(room);
    room.tvSockets.add(socket.id);
    dropRoom(oldRoom.code);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('join_game', (payload = {}, ack) => {
    const name = String(payload.name || '').trim().slice(0, 16);
    const requested = String(payload.code || '').trim().toUpperCase();
    if (!name) return ack?.({ error: 'Enter your name.' });
    const room = rooms.get(requested);
    if (!room) return ack?.({ error: `No Chameleon game found with code ${requested || '—'}.` });

    const returning = room.players.find((player) => player.name.toLowerCase() === name.toLowerCase());
    if (returning) {
      if (returning.connected) return ack?.({ error: `${returning.name} is already in the room.` });
      returning.connected = true;
      returning.socketId = socket.id;
      attach(room);
      reassignHost(room);
      ack?.({ ok: true, code: room.code, playerId: returning.id, colour: returning.colour });
      broadcast(room);
      return;
    }

    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'That match is already underway.' });
    if (room.players.length >= Engine.MAX_PLAYERS) return ack?.({ error: `The room is full (${Engine.MAX_PLAYERS} players).` });
    const free = PALETTE.filter((colour) => !room.players.some((player) => player.colour === colour.id));
    const colour = free[Math.floor(Math.random() * free.length)] || PALETTE[0];
    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name,
      colour: colour.id,
      connected: true,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    attach(room);
    ack?.({ ok: true, code: room.code, playerId: player.id, colour: player.colour });
    broadcast(room);
  });

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

  socket.on('set_config', (payload = {}, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'Settings lock when the match starts.' });
    room.config = Engine.clampConfig({ ...room.config, ...payload });
    ack?.({ ok: true, config: room.config });
    broadcast(room);
  });

  socket.on('start_game', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if (room.phase !== Engine.PHASES.LOBBY) return ack?.({ error: 'The match has already started.' });
    try {
      Engine.startMatch(room, decks);
    } catch (error) {
      return ack?.({ error: error.message });
    }
    setMoment(room, 'deal');
    armForPhase(room);
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('clue_ready', (payload, ack) => {
    const room = currentRoom();
    const player = room ? findBySocket(room, socket.id) : null;
    if (!room || !player) return ack?.({ error: 'You are not in this game.' });
    if (room.paused) return ack?.({ error: 'The match is paused.' });
    try {
      advanceClue(room, false, player.id);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  function handleVote(payload = {}, ack) {
    const room = currentRoom();
    const player = room ? findBySocket(room, socket.id) : null;
    if (!room || !player) return ack?.({ error: 'You are not in this game.' });
    if (room.paused) return ack?.({ error: 'The match is paused.' });
    try {
      const before = room.phase;
      const result = Engine.castVote(room, player.id, payload.targetId);
      ack?.({ ok: true });
      if (result.closed) {
        beginTally(room);
      } else if (before === room.phase) {
        setMoment(room, 'vote_cast', { voterId: player.id });
      }
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  }

  socket.on('cast_vote', handleVote);
  socket.on('cast_runoff_vote', handleVote);

  socket.on('submit_chameleon_guess', (payload = {}, ack) => {
    const room = currentRoom();
    const player = room ? findBySocket(room, socket.id) : null;
    if (!room || !player) return ack?.({ error: 'You are not in this game.' });
    if (room.paused) return ack?.({ error: 'The match is paused.' });
    try {
      Engine.submitChameleonGuess(room, player.id, String(payload.word || ''));
      setMoment(room, 'round_reveal');
      armForPhase(room);
      ack?.({ ok: true });
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  socket.on('set_paused', (payload = {}, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if ([Engine.PHASES.LOBBY, Engine.PHASES.GAME_OVER].includes(room.phase)) return ack?.({ error: 'Nothing is running.' });
    setPaused(room, !!payload.paused);
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('force_advance', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    try {
      if (room.phase === Engine.PHASES.DEAL) {
        clearClock(room);
        Engine.openClues(room);
        setMoment(room, 'clue_open');
      } else if (room.phase === Engine.PHASES.CLUE) {
        return advanceClue(room, true), ack?.({ ok: true });
      } else if ([Engine.PHASES.VOTING, Engine.PHASES.RUNOFF].includes(room.phase)) {
        clearBallot(room);
        return ack?.({ ok: true });
      } else if (room.phase === Engine.PHASES.TALLY) {
        clearClock(room);
        finishTally(room);
        return ack?.({ ok: true });
      } else if (room.phase === Engine.PHASES.CHAMELEON_GUESS) {
        Engine.closeGuessOnTimer(room);
        setMoment(room, 'round_reveal');
      } else if (room.phase === Engine.PHASES.REVEAL) {
        Engine.finishReveal(room, decks);
        setMoment(room, room.phase === Engine.PHASES.GAME_OVER ? 'game_over' : 'deal');
      } else {
        return ack?.({ error: 'Nothing to advance.' });
      }
      armForPhase(room);
      ack?.({ ok: true });
      broadcast(room);
    } catch (error) {
      ack?.({ error: error.message });
    }
  });

  function clearBallot(room) {
    closeBallot(room);
  }

  socket.on('reset_game', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    resetRoom(room);
    ack?.({ ok: true });
  });

  socket.on('continue_round', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canControl(room, ack)) return;
    if (room.phase !== Engine.PHASES.REVEAL) return ack?.({ error: 'There is no completed round to continue.' });
    Engine.finishReveal(room, decks);
    setMoment(room, room.phase === Engine.PHASES.GAME_OVER ? 'game_over' : 'deal');
    armForPhase(room);
    broadcast(room);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = currentRoom();
    if (!room) return;
    room.tvSockets.delete(socket.id);
    const player = findBySocket(room, socket.id);
    if (player) {
      player.connected = false;
      reassignHost(room);
    }
    if (!room.tvSockets.size && !room.players.some((entry) => entry.connected) && room.phase === Engine.PHASES.LOBBY) {
      dropRoom(room.code);
      return;
    }
    broadcast(room);
  });

  socket.on('end_game', (payload, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ error: 'That room is gone.' });
    if (!canEndGame(room, ack)) return;
    if (room.phase === Engine.PHASES.LOBBY) {
      return ack?.({ error: 'The room is already in the lobby.' });
    }
    resetRoom(room);
    ack?.({ ok: true });
  });
});

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (!room.tvSockets.size && !room.players.some((player) => player.connected) && room.touchedAt < cutoff) dropRoom(code);
  }
}, 10 * 60 * 1000).unref();

module.exports = {
  onListen() {
    const lan = joinCodes.lanAddress();
    console.log('');
    console.log('  CHAMELEON');
    console.log(`  TV screen     http://127.0.0.1:${PORT}${BASE}/tv`);
    console.log(`  Phones        ${lan ? `http://${lan}:${PORT}${BASE}` : `http://127.0.0.1:${PORT}${BASE}`}`);
    console.log('');
  },
  _test: { rooms, createRoom, publicState, privateState, clearClock },
};
