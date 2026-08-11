'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { io } = require('socket.io-client');

const Engine = require('./engine');
const decks = require('./decks.json');

function roomWithPlayers(count = 4) {
  const room = Engine.createGameState('TEST');
  room.players = Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}` }));
  room.hostId = room.players[0].id;
  return room;
}

function start(room, options = {}) {
  room.config = Engine.clampConfig({ ...room.config, ...options });
  Engine.startMatch(room, decks, () => 0);
  return room;
}

test('all bundled decks are valid, unique 5×5 grids', () => {
  assert.equal(Engine.validateDecks(decks), true);
  for (const pack of decks) {
    assert.equal(pack.words.length, 25);
    assert.equal(new Set(pack.words.map((word) => word.toLowerCase())).size, 25);
  }
});

test('deck validation rejects duplicate and incomplete content', () => {
  assert.throws(() => Engine.validateDecks([{ id: 'bad', category: 'Bad', words: Array(25).fill('Same') }]), /duplicate/i);
  assert.throws(() => Engine.validateDecks([{ id: 'short', category: 'Short', words: ['One'] }]), /exactly 25/i);
});

test('deal selects one target exactly once and rotates the Chameleon', () => {
  const room = start(roomWithPlayers());
  const first = room.chameleonId;
  assert.equal(room.grid.length, 25);
  assert.equal(room.grid.filter((word) => word === room.targetWord).length, 1);
  room.phase = Engine.PHASES.REVEAL;
  Engine.startRound(room, decks, () => 0);
  assert.notEqual(room.chameleonId, first);
});

test('one to three clue rounds advance every player exactly once per round', () => {
  const room = start(roomWithPlayers(), { clueRounds: 3 });
  Engine.openClues(room);
  let advances = 0;
  while (room.phase === Engine.PHASES.CLUE) {
    const active = Engine.activeSpeakerId(room);
    Engine.advanceClue(room, active);
    advances += 1;
  }
  assert.equal(advances, 12);
  assert.equal(room.phase, Engine.PHASES.VOTING);
});

test('clue advancement rejects a player speaking out of order', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  const wrong = room.players.find((player) => player.id !== Engine.activeSpeakerId(room));
  assert.throws(() => Engine.advanceClue(room, wrong.id), /not your clue turn/i);
});

test('majority catch opens the Chameleon guess and awards both outcome scores', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  while (room.phase === Engine.PHASES.CLUE) Engine.advanceClue(room, Engine.activeSpeakerId(room));
  const cham = room.chameleonId;
  const town = room.players.filter((player) => player.id !== cham);
  Engine.castVote(room, town[0].id, cham);
  Engine.castVote(room, town[1].id, cham);
  Engine.castVote(room, town[2].id, cham);
  Engine.castVote(room, cham, town[0].id);
  assert.equal(room.phase, Engine.PHASES.CHAMELEON_GUESS);
  assert.equal(room.scores.town, 2);
  Engine.submitChameleonGuess(room, cham, room.targetWord);
  assert.equal(room.phase, Engine.PHASES.REVEAL);
  assert.deepEqual(room.scores, { town: 2, chameleon: 3 });
  assert.equal(room.roundResult.guessCorrect, true);
  assert.equal(room.history.at(-1).ballots.length, 1);
  assert.equal(room.history.at(-1).ballots[0].counts[cham], 3);
});

test('failed Chameleon guess awards two points', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  while (room.phase === Engine.PHASES.CLUE) Engine.advanceClue(room, Engine.activeSpeakerId(room));
  const cham = room.chameleonId;
  const town = room.players.filter((player) => player.id !== cham);
  town.forEach((player) => Engine.castVote(room, player.id, cham));
  Engine.castVote(room, cham, town[0].id);
  const wrong = room.grid.find((word) => word !== room.targetWord);
  Engine.submitChameleonGuess(room, cham, wrong);
  assert.deepEqual(room.scores, { town: 2, chameleon: 2 });
  assert.equal(room.roundResult.guessCorrect, false);
});

test('plurality without a majority enters a runoff; a wrong runoff accusation resolves immediately', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  while (room.phase === Engine.PHASES.CLUE) Engine.advanceClue(room, Engine.activeSpeakerId(room));
  const [a, b, c, d] = room.players.map((player) => player.id);
  Engine.castVote(room, a, b);
  Engine.castVote(room, b, a);
  Engine.castVote(room, c, a);
  Engine.castVote(room, d, c);
  assert.equal(room.phase, Engine.PHASES.RUNOFF);
  const wrong = room.runoffCandidates.find((id) => id !== room.chameleonId);
  const other = room.runoffCandidates.find((id) => id !== wrong);
  for (const voter of room.players) {
    const target = voter.id === wrong ? other : wrong;
    Engine.castVote(room, voter.id, target);
  }
  assert.equal(room.phase, Engine.PHASES.REVEAL);
  assert.equal(room.roundResult.reason, 'wrong_accusation');
  assert.equal(room.scores.chameleon, 2);
});

test('a tied runoff gives the Chameleon a final guess', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  while (room.phase === Engine.PHASES.CLUE) Engine.advanceClue(room, Engine.activeSpeakerId(room));
  const [a, b, c, d] = room.players.map((player) => player.id);
  Engine.castVote(room, a, b); Engine.castVote(room, b, a); Engine.castVote(room, c, d); Engine.castVote(room, d, c);
  assert.equal(room.phase, Engine.PHASES.RUNOFF);
  const [x, y] = room.runoffCandidates;
  const remaining = [a, b, c, d].filter((id) => id !== x && id !== y);
  Engine.castVote(room, x, y);
  Engine.castVote(room, y, x);
  Engine.castVote(room, remaining[0], x);
  Engine.castVote(room, remaining[1], y);
  assert.equal(room.phase, Engine.PHASES.CHAMELEON_GUESS);
  assert.equal(room.roundResult.reason, 'runoff_tie');
});

test('self-votes and out-of-grid guesses are rejected', () => {
  const room = start(roomWithPlayers());
  Engine.openClues(room);
  while (room.phase === Engine.PHASES.CLUE) Engine.advanceClue(room, Engine.activeSpeakerId(room));
  assert.throws(() => Engine.castVote(room, 'p1', 'p1'), /somebody else/i);
  room.phase = Engine.PHASES.CHAMELEON_GUESS;
  room.roundResult = { townPoints: 0, chameleonPoints: 0 };
  assert.throws(() => Engine.submitChameleonGuess(room, room.chameleonId, 'Not on the grid'), /from the grid/i);
});

test('equal scores at the target continue into sudden death', () => {
  const room = start(roomWithPlayers(), { targetScore: 5 });
  room.scores = { town: 5, chameleon: 2 };
  room.phase = Engine.PHASES.CHAMELEON_GUESS;
  room.roundResult = { reason: 'vote', accusedId: room.chameleonId, caught: true, guessCorrect: null, townPoints: 0, chameleonPoints: 0 };
  Engine.submitChameleonGuess(room, room.chameleonId, room.targetWord);
  assert.deepEqual(room.scores, { town: 5, chameleon: 5 });
  assert.equal(room.winner, null);
  Engine.finishReveal(room, decks, () => 0.5);
  assert.equal(room.phase, Engine.PHASES.DEAL);
});

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} timed out`)), 3000);
    socket.emit(event, payload, (result = {}) => { clearTimeout(timeout); resolve(result); });
  });
}

function makeClient(base) {
  const socket = io(`${base}/chameleon`, { transports: ['websocket'], forceNew: true, reconnection: false });
  const client = { socket, state: null, privateState: null };
  socket.on('state', (state) => { client.state = state; });
  socket.on('private_state', (priv) => { client.privateState = priv; });
  return client;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntil(predicate, message, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

test('full Socket.IO match keeps the secret private and reaches game over', { timeout: 60000 }, async (t) => {
  const root = path.resolve(__dirname, '..', '..');
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), CHAMELEON_DEAL_MS: '40', CHAMELEON_REVEAL_MS: '60' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  await waitUntil(async () => {
    try { return (await fetch(`${base}/chameleon`)).ok; } catch { return false; }
  }, `server did not start:\n${stderr || stdout}`, 30000);

  const tv = makeClient(base);
  const players = Array.from({ length: 4 }, () => makeClient(base));
  t.after(() => [tv, ...players].forEach((client) => client.socket.close()));
  await Promise.all([tv, ...players].map((client) => new Promise((resolve) => client.socket.on('connect', resolve))));
  const room = await emitAck(tv.socket, 'register_tv');
  assert.equal(room.ok, true);

  for (let index = 0; index < players.length; index += 1) {
    const joined = await emitAck(players[index].socket, 'join_game', { name: `Guest ${index + 1}`, code: room.code });
    assert.equal(joined.ok, true);
    assert.match(joined.colour, /^[a-z]+$/);
  }
  await waitUntil(() => new Set(tv.state?.players.map((player) => player.colour.id)).size === players.length, 'players did not receive unique colours');
  await waitUntil(() => players.every((client) => client.privateState?.playerId), 'private identities were not delivered');
  await emitAck(players[0].socket, 'set_config', { targetScore: 5, clueRounds: 1, timers: false });
  assert.equal((await emitAck(players[0].socket, 'start_game')).ok, true);
  await waitUntil(() => players.every((client) => client.privateState?.role), 'roles were not dealt');
  const chameleons = players.filter((client) => client.privateState.role === 'chameleon');
  assert.equal(chameleons.length, 1);
  assert.equal(chameleons[0].privateState.targetWord, null);
  const knownWords = new Set(players.filter((client) => client.privateState.role === 'town').map((client) => client.privateState.targetWord));
  assert.equal(knownWords.size, 1);
  assert.equal(tv.state.targetWord, null);

  await emitAck(players[0].socket, 'force_advance');
  await waitUntil(() => tv.state?.phase === 'clue', 'clue phase did not open');
  assert.equal((await emitAck(players[0].socket, 'set_paused', { paused: true })).ok, true);
  const pausedSpeaker = players.find((client) => client.privateState.playerId === tv.state.activeSpeakerId);
  assert.match((await emitAck(pausedSpeaker.socket, 'clue_ready')).error, /paused/i);
  assert.equal((await emitAck(players[0].socket, 'set_paused', { paused: false })).ok, true);
  while (tv.state.phase === 'clue') {
    const active = players.find((client) => client.privateState.playerId === tv.state.activeSpeakerId);
    assert.ok(active);
    await emitAck(active.socket, 'clue_ready');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.equal(tv.state.phase, 'voting');

  const cham = players.find((client) => client.privateState.role === 'chameleon');
  const town = players.filter((client) => client !== cham);
  for (const voter of town) await emitAck(voter.socket, 'cast_vote', { targetId: cham.privateState.playerId });
  await emitAck(cham.socket, 'cast_vote', { targetId: town[0].privateState.playerId });
  await waitUntil(() => tv.state.phase === 'chameleon_guess', 'Chameleon guess did not open');
  const target = Array.from(knownWords)[0];
  assert.equal((await emitAck(cham.socket, 'submit_chameleon_guess', { word: target })).ok, true);
  await waitUntil(() => tv.state.phase === 'reveal', 'round did not reveal');
  assert.equal(tv.state.targetWord, target);
  assert.deepEqual(tv.state.scores, { town: 2, chameleon: 3 });
  assert.equal(tv.state.tally.ballots.at(-1).counts[cham.privateState.playerId], 3);

  await emitAck(players[0].socket, 'force_advance');
  await waitUntil(() => tv.state.phase === 'deal', 'second deal did not start');
  await emitAck(players[0].socket, 'force_advance');
  await waitUntil(() => tv.state.phase === 'clue', 'second clue phase did not open');
  while (tv.state.phase === 'clue') {
    const active = players.find((client) => client.privateState.playerId === tv.state.activeSpeakerId);
    await emitAck(active.socket, 'clue_ready');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  const secondCham = players.find((client) => client.privateState.role === 'chameleon');
  const wrong = players.find((client) => client !== secondCham);
  const voters = players.filter((client) => client !== wrong);
  for (const voter of voters) await emitAck(voter.socket, 'cast_vote', { targetId: wrong.privateState.playerId });
  await emitAck(wrong.socket, 'cast_vote', { targetId: voters[0].privateState.playerId });
  await waitUntil(() => tv.state.phase === 'reveal', 'wrong accusation did not resolve');
  assert.deepEqual(tv.state.scores, { town: 2, chameleon: 5 });
  await emitAck(players[0].socket, 'force_advance');
  await waitUntil(() => tv.state.phase === 'game_over', 'target score did not end the match');
  assert.equal(tv.state.winner, 'chameleon');
  assert.equal((await emitAck(tv.socket, 'end_game')).ok, true);
  await waitUntil(() => tv.state.phase === 'lobby', 'TV end-game control did not return to lobby');
  assert.deepEqual(tv.state.scores, { town: 0, chameleon: 0 });
});
