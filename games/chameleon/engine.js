'use strict';

const PHASES = Object.freeze({
  LOBBY: 'lobby',
  DEAL: 'deal',
  CLUE: 'clue',
  VOTING: 'voting',
  RUNOFF: 'runoff',
  TALLY: 'tally',
  CHAMELEON_GUESS: 'chameleon_guess',
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
});

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const GRID_SIZE = 25;
const TARGET_MIN = 5;
const TARGET_MAX = 20;

function shuffled(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function validateDecks(decks) {
  if (!Array.isArray(decks) || !decks.length) throw new Error('Chameleon needs at least one word pack.');
  const ids = new Set();
  for (const pack of decks) {
    if (!pack || typeof pack.id !== 'string' || !pack.id.trim()) throw new Error('Every pack needs an id.');
    if (ids.has(pack.id)) throw new Error(`Duplicate pack id: ${pack.id}`);
    ids.add(pack.id);
    if (typeof pack.category !== 'string' || !pack.category.trim()) throw new Error(`${pack.id} needs a category.`);
    if (!Array.isArray(pack.words) || pack.words.length !== GRID_SIZE) {
      throw new Error(`${pack.id} must contain exactly ${GRID_SIZE} words.`);
    }
    const words = pack.words.map((word) => String(word || '').trim());
    if (words.some((word) => !word)) throw new Error(`${pack.id} contains an empty word.`);
    const normal = new Set(words.map((word) => word.toLocaleLowerCase('en-US')));
    if (normal.size !== GRID_SIZE) throw new Error(`${pack.id} contains duplicate words.`);
  }
  return true;
}

function defaultConfig() {
  return {
    targetScore: 10,
    clueRounds: 1,
    timers: true,
    clueSeconds: 45,
    voteSeconds: 45,
    guessSeconds: 30,
  };
}

function createGameState(code) {
  return {
    code,
    phase: PHASES.LOBBY,
    players: [],
    hostId: null,
    config: defaultConfig(),
    scores: { town: 0, chameleon: 0 },
    roundNo: 0,
    category: null,
    grid: [],
    targetWord: null,
    chameleonId: null,
    previousChameleonId: null,
    clueOrder: [],
    clueRound: 0,
    clueAt: 0,
    votes: new Map(),
    ballots: [],
    runoffCandidates: [],
    tallyNextPhase: null,
    accusedId: null,
    chameleonGuess: null,
    roundResult: null,
    history: [],
    winner: null,
    usedPackIds: new Set(),
  };
}

function clampConfig(input = {}) {
  const base = defaultConfig();
  return {
    targetScore: Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(Number(input.targetScore) || base.targetScore))),
    clueRounds: Math.min(3, Math.max(1, Math.round(Number(input.clueRounds) || base.clueRounds))),
    timers: typeof input.timers === 'boolean' ? input.timers : base.timers,
    clueSeconds: Math.min(120, Math.max(10, Math.round(Number(input.clueSeconds) || base.clueSeconds))),
    voteSeconds: Math.min(120, Math.max(10, Math.round(Number(input.voteSeconds) || base.voteSeconds))),
    guessSeconds: Math.min(90, Math.max(10, Math.round(Number(input.guessSeconds) || base.guessSeconds))),
  };
}

function activeSpeakerId(room) {
  return room.phase === PHASES.CLUE ? room.clueOrder[room.clueAt] || null : null;
}

function startMatch(room, decks, random = Math.random) {
  validateDecks(decks);
  if (room.players.length < MIN_PLAYERS) throw new Error(`Chameleon needs ${MIN_PLAYERS} players.`);
  if (room.players.length > MAX_PLAYERS) throw new Error(`Chameleon supports at most ${MAX_PLAYERS} players.`);
  room.scores = { town: 0, chameleon: 0 };
  room.roundNo = 0;
  room.history = [];
  room.winner = null;
  room.previousChameleonId = null;
  room.usedPackIds = new Set();
  return startRound(room, decks, random);
}

function choosePack(room, decks, random) {
  let available = decks.filter((pack) => !room.usedPackIds.has(pack.id));
  if (!available.length) {
    room.usedPackIds.clear();
    available = decks.slice();
  }
  const pack = available[Math.floor(random() * available.length)];
  room.usedPackIds.add(pack.id);
  return pack;
}

function startRound(room, decks, random = Math.random) {
  validateDecks(decks);
  if (room.phase === PHASES.GAME_OVER) throw new Error('The match is over.');
  const pack = choosePack(room, decks, random);
  const grid = shuffled(pack.words, random);
  const eligible = room.players.filter((player) => player.id !== room.previousChameleonId);
  const pool = eligible.length ? eligible : room.players;
  const chameleon = pool[Math.floor(random() * pool.length)];
  if (!chameleon) throw new Error('No player can be the Chameleon.');

  room.roundNo += 1;
  room.phase = PHASES.DEAL;
  room.category = pack.category;
  room.grid = grid;
  room.targetWord = grid[Math.floor(random() * grid.length)];
  room.chameleonId = chameleon.id;
  room.previousChameleonId = chameleon.id;
  room.clueOrder = shuffled(room.players.map((player) => player.id), random);
  room.clueRound = 1;
  room.clueAt = 0;
  room.votes = new Map();
  room.ballots = [];
  room.runoffCandidates = [];
  room.tallyNextPhase = null;
  room.accusedId = null;
  room.chameleonGuess = null;
  room.roundResult = null;
  return room;
}

function openClues(room) {
  if (room.phase !== PHASES.DEAL) throw new Error('Roles are not being dealt.');
  room.phase = PHASES.CLUE;
  return room;
}

function beginVoting(room) {
  room.phase = PHASES.VOTING;
  room.votes = new Map();
  room.runoffCandidates = [];
  return room;
}

function advanceClue(room, playerId, force = false) {
  if (room.phase !== PHASES.CLUE) throw new Error('Clues are not open.');
  if (!force && activeSpeakerId(room) !== playerId) throw new Error('It is not your clue turn.');
  room.clueAt += 1;
  if (room.clueAt < room.clueOrder.length) return { done: false, phase: room.phase };
  if (room.clueRound < room.config.clueRounds) {
    room.clueRound += 1;
    room.clueAt = 0;
    return { done: false, phase: room.phase };
  }
  beginVoting(room);
  return { done: true, phase: room.phase };
}

function validVoter(room, voterId) {
  return room.players.some((player) => player.id === voterId);
}

function countVotes(room, candidates = room.players.map((player) => player.id)) {
  const allowed = new Set(candidates);
  const counts = new Map(candidates.map((id) => [id, 0]));
  for (const targetId of room.votes.values()) {
    if (allowed.has(targetId)) counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }
  return counts;
}

function topIds(counts) {
  const top = Math.max(0, ...counts.values());
  return Array.from(counts).filter(([, count]) => count === top).map(([id]) => id);
}

function runoffPool(counts) {
  const ordered = Array.from(new Set(counts.values())).sort((a, b) => b - a);
  const floor = ordered[Math.min(1, ordered.length - 1)] ?? 0;
  return Array.from(counts).filter(([, count]) => count >= floor).map(([id]) => id);
}

function beginChameleonGuess(room, reason) {
  room.phase = PHASES.CHAMELEON_GUESS;
  room.roundResult = {
    reason,
    accusedId: room.accusedId,
    caught: room.accusedId === room.chameleonId,
    guessCorrect: null,
    townPoints: room.accusedId === room.chameleonId ? 2 : 0,
    chameleonPoints: 0,
  };
  if (room.roundResult.townPoints) room.scores.town += room.roundResult.townPoints;
  return room;
}

function finishWithoutGuess(room, reason) {
  room.phase = PHASES.REVEAL;
  room.roundResult = {
    reason,
    accusedId: room.accusedId,
    caught: false,
    guessCorrect: null,
    townPoints: 0,
    chameleonPoints: 2,
  };
  room.scores.chameleon += 2;
  sealRound(room);
  return room;
}

function accuse(room, accusedId, reason = 'vote') {
  room.accusedId = accusedId;
  if (accusedId === room.chameleonId) return beginChameleonGuess(room, reason);
  return finishWithoutGuess(room, 'wrong_accusation');
}

function resolvePrimaryVote(room) {
  if (room.phase !== PHASES.VOTING) throw new Error('The first ballot is not open.');
  const counts = countVotes(room);
  room.ballots.push({ kind: 'primary', counts: Object.fromEntries(counts), ballots: Array.from(room.votes) });
  const leaders = topIds(counts);
  const topCount = leaders.length ? counts.get(leaders[0]) : 0;
  const majority = Math.floor(room.players.length / 2) + 1;
  if (leaders.length === 1 && topCount >= majority) return accuse(room, leaders[0]);
  room.phase = PHASES.RUNOFF;
  room.runoffCandidates = runoffPool(counts);
  if (room.runoffCandidates.length < 2) room.runoffCandidates = room.players.map((player) => player.id);
  room.votes = new Map();
  return room;
}

function resolveRunoffVote(room) {
  if (room.phase !== PHASES.RUNOFF) throw new Error('The runoff is not open.');
  const counts = countVotes(room, room.runoffCandidates);
  room.ballots.push({ kind: 'runoff', counts: Object.fromEntries(counts), ballots: Array.from(room.votes) });
  const leaders = topIds(counts);
  if (leaders.length === 1) return accuse(room, leaders[0], 'runoff');
  room.accusedId = null;
  return beginChameleonGuess(room, 'runoff_tie');
}

function castVote(room, voterId, targetId) {
  if (room.phase !== PHASES.VOTING && room.phase !== PHASES.RUNOFF) throw new Error('Voting is closed.');
  if (!validVoter(room, voterId)) throw new Error('Unknown voter.');
  if (!validVoter(room, targetId)) throw new Error('Unknown candidate.');
  if (voterId === targetId) throw new Error('Vote for somebody else.');
  if (room.phase === PHASES.RUNOFF && !room.runoffCandidates.includes(targetId)) {
    throw new Error('That player is not in the runoff.');
  }
  room.votes.set(voterId, targetId);
  if (room.votes.size < room.players.length) return { closed: false };
  if (room.phase === PHASES.VOTING) resolvePrimaryVote(room);
  else resolveRunoffVote(room);
  return { closed: true, phase: room.phase };
}

function closeVoteOnTimer(room) {
  if (room.phase === PHASES.VOTING) return resolvePrimaryVote(room);
  if (room.phase === PHASES.RUNOFF) return resolveRunoffVote(room);
  throw new Error('Voting is closed.');
}

function calculateWinner(room) {
  const { town, chameleon } = room.scores;
  const target = room.config.targetScore;
  if (town < target && chameleon < target) return null;
  if (town === chameleon) return null;
  return town > chameleon ? 'town' : 'chameleon';
}

function sealRound(room) {
  const winner = calculateWinner(room);
  const record = {
    round: room.roundNo,
    category: room.category,
    targetWord: room.targetWord,
    chameleonId: room.chameleonId,
    guess: room.chameleonGuess,
    ballots: room.ballots.map((ballot) => ({
      kind: ballot.kind,
      counts: { ...ballot.counts },
      ballots: ballot.ballots.map((entry) => entry.slice()),
    })),
    ...room.roundResult,
    scores: { ...room.scores },
  };
  room.history.push(record);
  room.winner = winner;
  return record;
}

function submitChameleonGuess(room, playerId, word) {
  if (room.phase !== PHASES.CHAMELEON_GUESS) throw new Error('The guess window is closed.');
  if (playerId !== room.chameleonId) throw new Error('Only the Chameleon can guess.');
  const chosen = room.grid.find((entry) => entry === word);
  if (!chosen) throw new Error('Choose a word from the grid.');
  const correct = chosen === room.targetWord;
  room.chameleonGuess = chosen;
  room.roundResult.guessCorrect = correct;
  room.roundResult.chameleonPoints = correct ? 3 : 2;
  room.scores.chameleon += room.roundResult.chameleonPoints;
  room.phase = PHASES.REVEAL;
  sealRound(room);
  return room;
}

function closeGuessOnTimer(room) {
  if (room.phase !== PHASES.CHAMELEON_GUESS) throw new Error('The guess window is closed.');
  room.chameleonGuess = null;
  room.roundResult.guessCorrect = false;
  room.roundResult.chameleonPoints = 2;
  room.scores.chameleon += 2;
  room.phase = PHASES.REVEAL;
  sealRound(room);
  return room;
}

function finishReveal(room, decks, random = Math.random) {
  if (room.phase !== PHASES.REVEAL) throw new Error('There is no result to finish.');
  if (room.winner) {
    room.phase = PHASES.GAME_OVER;
    return room;
  }
  return startRound(room, decks, random);
}

module.exports = {
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  GRID_SIZE,
  TARGET_MIN,
  TARGET_MAX,
  activeSpeakerId,
  advanceClue,
  castVote,
  clampConfig,
  closeGuessOnTimer,
  closeVoteOnTimer,
  countVotes,
  createGameState,
  finishReveal,
  openClues,
  resolvePrimaryVote,
  resolveRunoffVote,
  startMatch,
  startRound,
  submitChameleonGuess,
  validateDecks,
};
