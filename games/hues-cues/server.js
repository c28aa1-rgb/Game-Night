/**
 * Hues & Cues — game server.
 *
 * A colour-association party game for 2–10. The TV shows the 480-cell board;
 * every player holds a phone. Each turn one player is handed four secret
 * coordinates, keeps one, and says a single word out loud. Everybody else
 * pins a cell. Then a second word, and a second pin. Then the board tells
 * everyone how close they were.
 *
 * One rule keeps the game honest:
 *   · publicState() carries every pin the moment it is submitted — that part
 *     is meant to be seen — but never the target. The target lives in
 *     privateState() for exactly one player until the reveal, at which point
 *     it moves into room.reveal and becomes everybody's.
 *
 * The clue itself is never typed anywhere. It is said aloud in the room, which
 * is the whole game; the server only ever knows that a clue was given, not
 * what it was.
 *
 * Sockets live on their own `/hues-cues` namespace rather than the shared
 * root, so this game's events can never be picked up by another game's
 * handlers.
 */

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const { app, io } = require('../../lib/host');
const GRID = require('./public/grid-data.js');

/** Where this game's pages live on the site. */
const BASE = require('../registry').find((game) => game.id === 'hues-cues').basePath;

/**
 * `Number(x) || fallback` silently discards an explicit 0, which would make
 * HUES_TALLY_AT_MS=0 mean "eleven seconds" instead of "straight away". This
 * only falls back when the variable is genuinely unset or unparseable.
 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const PORT = envInt('PORT', 3000);

/**
 * How long the reveal holds the screen. The only clock in the game — every
 * other phase waits on a person, because a party game that hurries the person
 * holding the clue is a party game nobody enjoys. The host can cut this short
 * from their phone.
 *
 * It is derived rather than chosen. The TV plays a fixed timeline — the rings,
 * then a long beat holding the board so the room can see how close everybody
 * got, then the turn counted up one player at a time — and the hold has to
 * outlast it, or the phase changes out from under the animation and the tally
 * disappears mid-count. Since the count is per player, so is the hold.
 *
 * `tallyAt` rides along in the reveal payload so the TV takes its cue from
 * here rather than keeping a second copy of the number.
 */
const TALLY_AT_MS = envInt('HUES_TALLY_AT_MS', 11200);
/** From the tally appearing to its first row landing. */
const TALLY_LEAD_MS = 260;
const TALLY_ROW_MS = 620;
/** A beat on the last row before anything replaces it. */
const TALLY_REST_MS = 700;

/** After the tally: the handoff card naming the next clue-giver, and its countdown. */
const HANDOFF_MS = envInt('HUES_HANDOFF_MS', 5400);

/**
 * The last reveal of the game gets out of the way fast. Nobody wants a
 * countdown to a turn that is never coming — the winner is the thing to look
 * at, so the final turn's tally is followed by nothing at all.
 */
const WIN_TAIL_MS = envInt('HUES_WIN_TAIL_MS', 1500);

function revealHoldMs(rows, final) {
  const tallyEnd = TALLY_AT_MS + TALLY_LEAD_MS
    + Math.max(0, rows - 1) * TALLY_ROW_MS + TALLY_REST_MS;
  return tallyEnd + (final ? WIN_TAIL_MS : HANDOFF_MS);
}

const MIN_PLAYERS = 2;
/** Ten, because there are ten player colours and no two players may share. */
const MAX_PLAYERS = 10;

/** How many secret coordinates the clue-giver chooses between. */
const CANDIDATES = 4;

const DEFAULT_TARGET_SCORE = 20;
const MIN_TARGET_SCORE = 5;
const MAX_TARGET_SCORE = 60;

app.use(BASE, express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Player colours
// ---------------------------------------------------------------------------

/**
 * Ten colours, and the constraint that shaped them is unusual: a pin has to
 * stay findable sitting on top of any of the board's 480 swatches, including
 * the swatch that is nearest to the pin's own colour. Hue separation alone
 * cannot do that — the board contains every hue — so each of these is also
 * pushed away from its neighbours in lightness, and every pin is drawn with a
 * dark ring, a chalk rim and the player's initial on top.
 *
 * `ink` is what to print the initial in, picked per colour rather than
 * computed, because the automatic answer gets the mid-tones wrong.
 *
 * Named as well as coloured, everywhere they appear — nobody should have to
 * tell two players apart by hue alone.
 */
const PALETTE = [
  { id: 'ruby', name: 'Ruby', hex: '#FF2D55', ink: '#1A0208' },
  { id: 'ember', name: 'Ember', hex: '#FF7A00', ink: '#1A0C00' },
  { id: 'gold', name: 'Gold', hex: '#FFD11A', ink: '#1A1400' },
  { id: 'lime', name: 'Lime', hex: '#A3E635', ink: '#0F1A02' },
  { id: 'jade', name: 'Jade', hex: '#16C464', ink: '#02160A' },
  { id: 'teal', name: 'Teal', hex: '#00D5D0', ink: '#001615' },
  { id: 'sky', name: 'Sky', hex: '#33A1FF', ink: '#00101F' },
  { id: 'indigo', name: 'Indigo', hex: '#7A5CFF', ink: '#F2EFFF' },
  { id: 'orchid', name: 'Orchid', hex: '#D24BFF', ink: '#1A0220' },
  { id: 'bone', name: 'Bone', hex: '#F0F2F5', ink: '#0C0E11' },
];

const colourById = (id) => PALETTE.find((c) => c.id === id) || null;

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

const ROWS = GRID.ROWS;
const COLS = GRID.COLS;
const ALL_CELLS = GRID.cells();

const rowIndex = (row) => ROWS.indexOf(row);

/**
 * How far a guess missed by, in rings.
 *
 * Chebyshev distance — the number of steps a king takes — because the scoring
 * zones are square rings around the target, not circles. 0 is the square
 * itself, 1 is the eight squares touching it, 2 is the sixteen around those.
 *
 * Nothing here wraps at the edges. A target at A1 simply has fewer cells in
 * its rings than one in the middle, which is the board's own geometry rather
 * than a rule that needs applying.
 */
function ringDistance(cell, target) {
  const dr = Math.abs(rowIndex(cell.row) - rowIndex(target.row));
  const dc = Math.abs(cell.col - target.col);
  return Math.max(dr, dc);
}

/**
 * What a guess is worth.
 *
 * Only the exact square pays three. The eight touching it pay two, the sixteen
 * around those pay one, and anything outside that 5×5 pays nothing — so being
 * close is worth real points, but being right is worth more.
 */
function pointsFor(distance) {
  if (distance === 0) return 3;
  if (distance === 1) return 2;
  if (distance === 2) return 1;
  return 0;
}

/**
 * What the clue-giver is paid for: any pin on the target or touching it.
 *
 * Deliberately a wider net than the three-pointer. They are rewarded for
 * getting the room close, not for one player happening to nail the square.
 */
const isBullseye = (distance) => distance <= 1;

function validCell(row, col) {
  return ROWS.includes(row) && Number.isInteger(col) && col >= 1 && col <= COLS;
}

/**
 * The pool targets are drawn from: everything except the outermost ring.
 *
 * A target on the very edge has its scoring rings cut off by the board, so the
 * same two-square miss pays two points on one side and nothing on the other,
 * depending only on which way you happened to be wrong. Guessers can still pin
 * the edge — it is only ever ruled out as an answer.
 */
const INNER_CELLS = ALL_CELLS.filter((cell) => {
  const r = rowIndex(cell.row);
  return r > 0 && r < ROWS.length - 1 && cell.col > 1 && cell.col < COLS;
});

/**
 * Four fresh coordinates for a clue-giver to choose between.
 *
 * Nothing already used this game, and no two of the four sharing a colour —
 * the board has a handful of hexes that appear at more than one coordinate,
 * and offering the same colour twice reads as a bug.
 */
function drawCandidates(room) {
  const draw = (pool) => {
    const picked = [];
    const seen = new Set();
    for (const cell of shuffle(pool)) {
      if (seen.has(cell.hex)) continue;
      seen.add(cell.hex);
      picked.push(cell);
      if (picked.length === CANDIDATES) break;
    }
    return picked;
  };

  const fresh = INNER_CELLS.filter((cell) =>
    !room.usedTargets.has(`${cell.row}${cell.col}`) && !room.usedHexes.has(cell.hex));

  const picked = draw(fresh);
  if (picked.length === CANDIDATES) return picked;

  // Nearly four hundred turns in. Wipe the history rather than deal short.
  room.usedTargets = new Set();
  room.usedHexes = new Set();
  return draw(INNER_CELLS);
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Four-letter codes from the game's own vocabulary, easy to shout across a room. */
const CODE_WORDS = [
  'HUES', 'CUES', 'TINT', 'WASH', 'GLOW', 'NEON', 'RUST', 'MOSS', 'SAGE', 'CLAY',
  'PLUM', 'MINT', 'TEAL', 'GOLD', 'JADE', 'LIME', 'SAND', 'ROSE', 'IRIS', 'FERN',
  'DUSK', 'HAZE', 'PALE', 'DEEP', 'CHIP', 'HUEX', 'BLUR', 'TONE', 'DYED', 'INKY',
];

/** code -> room */
const rooms = new Map();

const PHASES = {
  LOBBY: 'lobby',
  /** The clue-giver is looking at four secret coordinates, choosing one. */
  PICK_TARGET: 'pick_target',
  /** The clue-giver has a target and is about to say a word out loud. */
  CLUE: 'clue',
  /** Phones are open. Everybody but the clue-giver is placing a pin. */
  GUESS: 'guess',
  /** The board is showing where the target actually was. */
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
};

function newCode() {
  const free = CODE_WORDS.filter((word) => !rooms.has(word));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  let code;
  do {
    code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = newCode();
  const room = {
    code,
    players: [],
    tvSockets: new Set(),
    /** The first player to join. Every game control lives on their phone. */
    hostId: null,
    phase: PHASES.LOBBY,
    config: { targetScore: DEFAULT_TARGET_SCORE },
    /** Whose turn it is to give clues — an index into players, in join order. */
    turnIndex: 0,
    /** 1-based, shown as "Turn 7". Counts turns actually played. */
    turnNo: 0,
    /** The four coordinates offered this turn. Clue-giver's eyes only. */
    candidates: [],
    /** The one they kept. Clue-giver's eyes only, until the reveal. */
    target: null,
    /** 0 before the first clue, then 1 or 2. */
    cycle: 0,
    /**
     * Submitted pins, one map per cycle: playerId -> { row, col }. Public the
     * instant they land — watching the board fill up is most of the fun.
     */
    guesses: [new Map(), new Map()],
    /**
     * Where each phone's wheels are pointing right now, before anybody has
     * committed: playerId -> { row, col } with either half possibly null.
     * Also public, and also the point — a room full of people watching each
     * other's crosshairs slide around is the game working.
     */
    drafts: new Map(),
    /**
     * Whose turn it is to pin, in order, for the cycle currently open — and how
     * far down that list we are. Guessing is one player at a time.
     */
    guessQueue: [],
    guessAt: 0,
    /**
     * Who the queue is parked on and since when, so the TV can say how long
     * the room has been waiting on one phone.
     */
    guessOn: null,
    guessSince: 0,
    /**
     * Targets already used this game, by coordinate and by colour, so the same
     * square — or the same colour wearing a different coordinate — is never
     * clued twice.
     */
    usedTargets: new Set(),
    usedHexes: new Set(),
    /** Filled at the end of a turn, and the only place the target goes public. */
    reveal: null,
    /**
     * Somebody crossed the line but nobody had it outright, so the game is
     * playing one more turn to settle it.
     */
    suddenDeath: false,
    winnerId: null,
    revealTimer: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

const findPlayer = (room, id) => room.players.find((p) => p.id === id) || null;
const findBySocket = (room, socketId) => room.players.find((p) => p.socketId === socketId) || null;
const connected = (room) => room.players.filter((p) => p.connected);

/**
 * Keep the controls in somebody's hands. The host is whoever joined first, and
 * if they drop out the next connected player inherits it — otherwise a room
 * whose host went to answer the door could never start another game.
 */
function reassignHost(room) {
  const host = findPlayer(room, room.hostId);
  if (host && host.connected) return;
  const next = room.players.find((p) => p.connected);
  if (next) room.hostId = next.id;
}

const clueGiver = (room) => room.players[room.turnIndex] || null;

/** Everybody who is expected to pin something this cycle. */
function guessers(room) {
  const giver = clueGiver(room);
  return room.players.filter((p) => p.connected && (!giver || p.id !== giver.id));
}

/**
 * The order guessers pin in for a cycle.
 *
 * Join order after the first clue, reversed after the second. Going last is an
 * advantage — you have watched everybody else commit — so the second cycle
 * hands that advantage to whoever had to guess first with nothing to go on.
 */
function buildGuessQueue(room, cycle) {
  const order = guessers(room).map((p) => p.id);
  return cycle === 2 ? order.reverse() : order;
}

/**
 * Who already has a pin on this square this turn, across both cycles.
 *
 * A square is spoken for once somebody is on it: two pins stacked on one cell
 * cannot be told apart on the TV, and letting a late guesser copy an earlier
 * one exactly is most of the reason turn order matters.
 */
function pinnedBy(room, row, col) {
  for (const cycleGuesses of room.guesses) {
    for (const [playerId, at] of cycleGuesses) {
      if (at.row === row && at.col === col) return playerId;
    }
  }
  return null;
}

/** Whose phone is open right now. Exactly one, or nobody. */
function activeGuesserId(room) {
  if (room.phase !== PHASES.GUESS) return null;
  return room.guessQueue[room.guessAt] || null;
}

/**
 * Park the queue on the next player who still owes a pin. Returns false when
 * the queue is spent, which is what closes the cycle.
 *
 * A player whose phone has dropped is *not* skipped. Sliding silently past
 * them looks identical to a bug from the sofa — the board just moves on and
 * whoever it was never finds out they missed a clue. So the queue stops on
 * them and the TV says so, which turns it into something the room can answer:
 * wait while they reload, or have the host skip or remove them. Only a player
 * who has actually been removed from the game is stepped over here.
 */
function advanceGuess(room) {
  const submitted = room.guesses[room.cycle - 1];
  while (room.guessAt < room.guessQueue.length) {
    const id = room.guessQueue[room.guessAt];
    if (findPlayer(room, id) && !submitted.has(id)) {
      // Stamped on arrival, not on every call, or "how long have we been
      // waiting" would reset with each broadcast.
      if (room.guessOn !== id) {
        room.guessOn = id;
        room.guessSince = Date.now();
      }
      return true;
    }
    room.guessAt += 1;
  }
  room.guessOn = null;
  room.guessSince = 0;
  return false;
}

function clearRevealTimer(room) {
  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.revealTimer = null;
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Everything the whole room may see. The target is not in here — not while a
 * turn is running. It appears exactly once, inside `reveal`, at the moment it
 * becomes public to everybody at the same time.
 */
function publicState(room) {
  const giver = clueGiver(room);
  const submitted = room.cycle ? room.guesses[room.cycle - 1] : new Map();

  return {
    code: room.code,
    phase: room.phase,
    config: { ...room.config },
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    turnNo: room.turnNo,
    cycle: room.cycle,
    suddenDeath: room.suddenDeath,
    // The host is a player, not the TV: whoever joined first runs the game
    // from their own phone.
    hostId: room.hostId,
    hostName: findPlayer(room, room.hostId)?.name || null,
    clueGiverId: giver?.id || null,
    clueGiverName: giver?.name || null,
    /** Whose turn it is to pin. One player, or nobody. */
    activeGuesserId: activeGuesserId(room),
    /**
     * How long the room has been waiting on them, in milliseconds. Sent as a
     * duration rather than a timestamp so a TV whose clock is minutes off
     * still counts the same wait as everybody else.
     */
    activeWaitMs: room.guessSince ? Date.now() - room.guessSince : 0,
    /** The whole running order for this cycle, so screens can show what's coming. */
    guessQueue: room.guessQueue.slice(),
    /**
     * Who is still to come this cycle, in the order they will go — the first
     * entry is whoever is up. Screens read this as both "waiting on" and
     * "then".
     */
    waitingOn: room.phase === PHASES.GUESS
      ? room.guessQueue.slice(room.guessAt).filter((id) => !submitted.has(id))
      : [],
    /**
     * Squares already holding a pin this turn, as "K14" -> whose it is. Phones
     * read this to grey out somebody else's square before it can be submitted,
     * so the rule is visible rather than a rejection after the fact.
     */
    takenCells: Object.fromEntries(room.guesses.flatMap((cycleGuesses) =>
      Array.from(cycleGuesses, ([playerId, at]) => [`${at.row}${at.col}`, playerId]))),
    /** Both cycles at once: cycle 1's pins stay on the board through cycle 2. */
    guesses: room.guesses.map((cycleGuesses, index) =>
      Array.from(cycleGuesses, ([playerId, at]) => ({ playerId, cycle: index + 1, ...at }))),
    /** Live, uncommitted crosshairs. Carried here too so a TV that reloads catches up. */
    drafts: Array.from(room.drafts, ([playerId, at]) => ({ playerId, ...at })),
    reveal: room.reveal,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      colour: colourById(p.colour),
      connected: p.connected,
      score: p.score,
      /** Their own answer to "close in on the board while I pin?". */
      zoom: p.zoom !== false,
    })),
  };
}

/** What one player, and only that player, is allowed to know. */
function privateState(room, player) {
  const giver = clueGiver(room);
  const isGiver = !!giver && giver.id === player.id;
  const live = room.phase === PHASES.PICK_TARGET || room.phase === PHASES.CLUE
    || room.phase === PHASES.GUESS;

  return {
    playerId: player.id,
    isHost: player.id === room.hostId,
    isClueGiver: isGiver,
    /** Your phone is open. Only one guesser's is, at a time. */
    myTurn: activeGuesserId(room) === player.id,
    /** The four coordinates on offer. Only while they are still choosing. */
    candidates: isGiver && room.phase === PHASES.PICK_TARGET ? room.candidates : [],
    /**
     * Their own target, held for the whole turn. Re-sent with every broadcast
     * rather than pushed once, which is what makes reconnecting free: a phone
     * that locks itself mid-turn comes back knowing what it was clueing.
     */
    target: isGiver && live ? room.target : null,
    /** Where this phone's wheels are, so a reload does not lose a half-made guess. */
    draft: room.drafts.get(player.id) || null,
    submitted: room.cycle ? room.guesses[room.cycle - 1].get(player.id) || null : null,
  };
}

const nsp = io.of('/hues-cues');

function broadcast(room) {
  nsp.to(`room:${room.code}`).emit('game_state', publicState(room));
  // Private payloads ride alongside every broadcast rather than being pushed
  // once when the turn starts, for the reconnect reason above.
  for (const player of room.players) {
    if (player.connected && player.socketId) {
      nsp.to(player.socketId).emit('private_state', privateState(room, player));
    }
  }
}

/**
 * Crosshairs move on every flick of a wheel, and a room of ten phones scrolling
 * at once would otherwise mean ten full state broadcasts a second. This is the
 * one thing that goes out on its own channel: a single pin's worth of data,
 * with no player list attached.
 */
function broadcastDrafts(room) {
  const drafts = Array.from(room.drafts, ([playerId, at]) => ({ playerId, ...at }));
  nsp.to(`room:${room.code}`).emit('drafts', drafts);
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

/** Deal a fresh set of secret coordinates and hand the turn to its clue-giver. */
function beginTurn(room) {
  clearRevealTimer(room);
  room.phase = PHASES.PICK_TARGET;
  room.turnNo += 1;
  room.cycle = 0;
  room.candidates = drawCandidates(room);
  room.target = null;
  room.guesses = [new Map(), new Map()];
  room.drafts = new Map();
  room.guessQueue = [];
  room.guessAt = 0;
  room.guessOn = null;
  room.guessSince = 0;
  room.reveal = null;
  broadcast(room);
}

/**
 * Who gets the clue next, without handing it to them yet.
 *
 * Split out from rotate() because the reveal needs to name them while the
 * current turn is still the current turn — the TV counts down to "Bo is up"
 * before Bo is actually up.
 */
function peekNextClueGiver(room) {
  for (let step = 1; step <= room.players.length; step++) {
    const next = (room.turnIndex + step) % room.players.length;
    if (room.players[next]?.connected) return room.players[next];
  }
  // Nobody else is here.
  return null;
}

/** Hand the turn to the next connected player, wrapping round the table. */
function rotate(room) {
  const next = peekNextClueGiver(room);
  // No one else available: leave the turn where it is rather than picking a
  // player who cannot act.
  if (next) room.turnIndex = room.players.indexOf(next);
}

/**
 * Close the cycle and work out what everything was worth.
 *
 * Both cycles score independently and add up, so a player who was vague after
 * the first clue and right after the second still banks the second. The
 * clue-giver earns from the room rather than from the board: one point for
 * every guesser who landed inside the 3×3, each cycle.
 */
function scoreTurn(room) {
  const giver = clueGiver(room);
  const target = room.target;

  const perPlayer = new Map();
  let clueGiverPoints = 0;
  const cycleBullseyes = [0, 0];

  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [playerId, at] of room.guesses[cycle]) {
      const distance = ringDistance(at, target);
      const points = pointsFor(distance);

      if (!perPlayer.has(playerId)) perPlayer.set(playerId, { playerId, points: 0, hits: [null, null] });
      const entry = perPlayer.get(playerId);
      entry.points += points;
      entry.hits[cycle] = { ...at, distance, points };

      if (isBullseye(distance)) {
        clueGiverPoints += 1;
        cycleBullseyes[cycle] += 1;
      }
    }
  }

  for (const entry of perPlayer.values()) {
    const player = findPlayer(room, entry.playerId);
    if (player) player.score += entry.points;
  }
  if (giver) giver.score += clueGiverPoints;

  room.reveal = {
    target,
    clueGiverId: giver?.id || null,
    clueGiverPoints,
    cycleBullseyes,
    /** Ordered best-first, which is the order the TV counts them up in. */
    deltas: Array.from(perPlayer.values()).sort((a, b) => b.points - a.points),
  };
}

/**
 * Has anybody actually won?
 *
 * Crossing the threshold is necessary but not sufficient: the winner has to be
 * alone at the top. Two players tied on 21 have not settled anything, so the
 * game plays one more turn and asks again — as many times as it takes.
 */
function decideOutcome(room) {
  const best = Math.max(...room.players.map((p) => p.score));
  if (best < room.config.targetScore) return null;

  const leaders = room.players.filter((p) => p.score === best);
  if (leaders.length === 1) return leaders[0];
  return 'tie';
}

/** The reveal is over. Either the game is, or somebody else gets the clue. */
function advanceFromReveal(room) {
  clearRevealTimer(room);
  if (room.phase !== PHASES.REVEAL) return;

  const outcome = decideOutcome(room);
  if (outcome && outcome !== 'tie') {
    room.phase = PHASES.GAME_OVER;
    room.winnerId = outcome.id;
    room.cycle = 0;
    broadcast(room);
    return;
  }

  room.suddenDeath = outcome === 'tie';
  rotate(room);
  beginTurn(room);
}

function armReveal(room, ms) {
  clearRevealTimer(room);
  room.revealTimer = setTimeout(() => advanceFromReveal(room), ms);
}

/** Every pin is in (or the host got bored). Move the turn along. */
function closeCycle(room) {
  room.drafts = new Map();

  if (room.cycle === 1) {
    room.phase = PHASES.CLUE;
    broadcast(room);
    return;
  }

  scoreTurn(room);

  /*
   * Work out here whether this turn ended the game, rather than leaving it to
   * advanceFromReveal. The screens need to know now: a reveal that leads into
   * another turn ends with a countdown naming the next clue-giver, and one
   * that ends the game must not promise a turn that is never coming.
   */
  const outcome = decideOutcome(room);
  const won = outcome && outcome !== 'tie';
  const next = won ? null : peekNextClueGiver(room);

  room.reveal.final = !!won;
  room.reveal.nextClueGiverId = next?.id || null;
  room.reveal.nextClueGiverName = next?.name || null;

  /*
   * The tally shows a row per player in the turn — everybody who scored, plus
   * the clue-giver even on a turn that earned them nothing. Count them the
   * same way the TV does, since the hold is only correct if both agree.
   */
  const counted = new Set(room.reveal.deltas.map((delta) => delta.playerId));
  if (room.reveal.clueGiverId) counted.add(room.reveal.clueGiverId);
  const rows = room.players.filter((p) => counted.has(p.id)).length;

  room.reveal.tallyAt = TALLY_AT_MS;
  room.reveal.holdMs = revealHoldMs(rows, won);

  room.phase = PHASES.REVEAL;
  armReveal(room, room.reveal.holdMs);
  broadcast(room);
}

function startGame(room) {
  for (const player of room.players) player.score = 0;
  room.turnIndex = 0;
  room.turnNo = 0;
  room.suddenDeath = false;
  room.winnerId = null;
  // A fresh game gets the whole board back.
  room.usedTargets = new Set();
  room.usedHexes = new Set();
  // Whoever is first in join order might have wandered off between joining and
  // the host pressing start.
  if (!room.players[0]?.connected) rotate(room);
  beginTurn(room);
}

function resetToLobby(room) {
  clearRevealTimer(room);
  room.phase = PHASES.LOBBY;
  room.turnIndex = 0;
  room.turnNo = 0;
  room.cycle = 0;
  room.candidates = [];
  room.target = null;
  room.guesses = [new Map(), new Map()];
  room.drafts = new Map();
  room.guessQueue = [];
  room.guessAt = 0;
  room.guessOn = null;
  room.guessSince = 0;
  room.reveal = null;
  room.suddenDeath = false;
  room.winnerId = null;
  room.usedTargets = new Set();
  room.usedHexes = new Set();
  for (const player of room.players) player.score = 0;
  reassignHost(room);
  broadcast(room);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));

// A room code in the URL is somebody scanning the TV's QR — send them straight
// to the phone view instead of asking which screen they are.
app.get(BASE, (req, res, next) => {
  const code = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z]{2,8}$/.test(code)) return next();
  res.redirect(302, `${BASE}/play?room=${encodeURIComponent(code)}`);
});

app.get(BASE, page('start.html'));
app.get(`${BASE}/play`, page('play.html'));
app.get(`${BASE}/tv`, page('tv.html'));

/** LAN address, so the QR code points somewhere a phone can actually reach. */
function lanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

function joinUrlFor(req, code) {
  const host = req.get('host') || `localhost:${PORT}`;
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const lan = lanAddress();
  const target = isLoopback && lan ? `${lan}:${PORT}` : host;
  const protocol = isLoopback ? 'http' : req.protocol;
  return `${protocol}://${target}${BASE}/play?room=${code}`;
}

/**
 * The ten colours, and which of them are gone.
 *
 * The join form needs this before the player is in a room, and socket state
 * only reaches people who have already joined — so it comes over HTTP. With no
 * code, or a code nobody is using, everything is still free.
 */
app.get(`${BASE}/api/palette`, (req, res) => {
  const target = rooms.get(String(req.query.code || '').toUpperCase());
  res.json({
    palette: PALETTE.map((colour) => ({
      ...colour,
      takenBy: target?.players.find((p) => p.colour === colour.id)?.name || null,
    })),
  });
});

app.get(`${BASE}/api/join-info`, async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  const url = joinUrlFor(req, code);
  try {
    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 420,
      color: { dark: '#08090B', light: '#E9ECEF' },
    });
    res.json({ url, qr });
  } catch {
    res.json({ url, qr: null });
  }
});

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

nsp.on('connection', (socket) => {
  let roomCode = null;
  const room = () => (roomCode ? rooms.get(roomCode) || null : null);

  function attach(target) {
    // A TV that has just been handed a fresh room should stop listening to the
    // old one, or it keeps a channel open to a room nobody is in.
    if (roomCode && roomCode !== target.code) socket.leave(`room:${roomCode}`);
    roomCode = target.code;
    socket.join(`room:${target.code}`);
  }

  /**
   * Every game control — the winning score, starting, force-advancing,
   * skipping the reveal — lives on the host's phone. The host is the first
   * player who joined.
   *
   * The TV is allowed to step in only when no host is connected, so a room
   * whose host walked off with their phone can still be unstuck rather than
   * being frozen by whoever happened to arrive first.
   */
  function canControl(target, ack) {
    const player = findBySocket(target, socket.id);
    if (player && player.id === target.hostId) return true;

    const host = findPlayer(target, target.hostId);
    if (target.tvSockets.has(socket.id) && (!host || !host.connected)) return true;

    ack?.({ error: host?.connected ? `${host.name} is running this game.` : 'Only the host can do that.' });
    return false;
  }

  /**
   * Starting a fresh game is the exception to control living on the host's
   * phone. The TV is the device physically in the room, and "we are done with
   * this one" has to be answerable from there — without hunting for whichever
   * phone happens to be the host, or waiting out a phase to reach a button.
   * Nothing here can decide a game; it can only end one.
   */
  function canAbandon(target, ack) {
    if (target.tvSockets.has(socket.id)) return true;
    const player = findBySocket(target, socket.id);
    if (player && player.id === target.hostId) return true;
    ack?.({ error: 'Only the host or the TV can do that.' });
    return false;
  }

  // --- TV -------------------------------------------------------------------

  socket.on('register_tv', (payload = {}, ack) => {
    const requested = String(payload.code || '').toUpperCase();
    const target = (requested && rooms.get(requested)) || createRoom();
    attach(target);
    target.tvSockets.add(socket.id);
    ack?.({ ok: true, code: target.code });
    broadcast(target);
  });

  // --- Joining --------------------------------------------------------------

  socket.on('join_game', (payload = {}, ack) => {
    const name = String(payload.name || '').trim().slice(0, 14);
    if (!name) return ack?.({ error: 'Enter a name to join.' });

    const requested = String(payload.code || '').toUpperCase();
    let target = requested ? rooms.get(requested) : null;
    if (!target && !requested) {
      const open = Array.from(rooms.values());
      if (open.length === 1) target = open[0];
    }
    if (!target) {
      return ack?.({
        error: requested ? `No game found with code ${requested}.` : 'No game running. Open the TV screen first.',
      });
    }

    /*
     * Reconnect by name. A phone that died, locked or reloaded rejoins with the
     * same name and gets its seat back — score, colour, and whichever half of a
     * guess it had made, since the next broadcast carries all of it.
     */
    const returning = target.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (returning) {
      if (returning.connected) return ack?.({ error: `${name} is already playing. Pick another name.` });
      returning.connected = true;
      returning.socketId = socket.id;
      attach(target);
      reassignHost(target);
      ack?.({ ok: true, code: target.code, playerId: returning.id });
      broadcast(target);
      return;
    }

    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'That game is already underway.' });
    if (target.players.length >= MAX_PLAYERS) return ack?.({ error: `This game is full (${MAX_PLAYERS} players).` });

    const free = PALETTE.filter((colour) => !target.players.some((p) => p.colour === colour.id));
    // A colour asked for on the join form, if it is still going; otherwise the
    // first one nobody has taken, so scanning the QR and typing a name is
    // enough on its own.
    const wanted = colourById(String(payload.colour || ''));
    const colour = (wanted && free.includes(wanted)) ? wanted : free[0];

    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name,
      colour: colour.id,
      connected: true,
      score: 0,
      /** Whether the TV closes in on this player's crosshair while they pin. */
      zoom: true,
    };
    target.players.push(player);
    // First one in runs the game.
    if (!target.hostId) target.hostId = player.id;

    attach(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    broadcast(target);
  });

  socket.on('rejoin', (payload = {}, ack) => {
    const target = rooms.get(String(payload.code || '').toUpperCase());
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayer(target, payload.playerId);
    if (!player) return ack?.({ error: 'You are not in this game.' });

    /*
     * The seat may still be held by a socket the server thinks is alive.
     *
     * Refusing that case is tempting and wrong: a phone that reloads is the
     * common way to get here, and on a polling transport the old connection
     * can go unnoticed for tens of seconds — long enough that a player who
     * locked their phone would be told they are already playing and lose
     * their seat mid-turn. So the rejoin always wins.
     *
     * What we do not do is let it happen silently. Whoever was holding the
     * seat is told it has moved, so a second device carrying a stale session
     * takes the game over in the open rather than leaving the first phone
     * showing a game it can no longer affect.
     */
    const displaced = player.socketId;

    player.connected = true;
    player.socketId = socket.id;
    attach(target);
    reassignHost(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    if (displaced && displaced !== socket.id) {
      nsp.to(displaced).emit('seat_taken', { name: player.name });
    }
    broadcast(target);
  });

  /*
   * There is deliberately no colour-change event. Your colour is settled on
   * the join form and never moves after that: it is the only thing naming a
   * pin from across the room, so a swap mid-lobby would repaint pins people
   * have already learned to read.
   */

  // --- Host controls --------------------------------------------------------

  socket.on('set_config', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'Settings are locked once the game starts.' });
    if (!canControl(target, ack)) return;

    const score = Math.round(Number(payload.targetScore));
    if (!Number.isFinite(score) || score < MIN_TARGET_SCORE || score > MAX_TARGET_SCORE) {
      return ack?.({ error: `Pick a target between ${MIN_TARGET_SCORE} and ${MAX_TARGET_SCORE}.` });
    }

    target.config.targetScore = score;
    ack?.({ ok: true });
    broadcast(target);
  });

  socket.on('start_game', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'Already playing.' });
    if (!canControl(target, ack)) return;
    if (connected(target).length < MIN_PLAYERS) {
      return ack?.({ error: `Needs ${MIN_PLAYERS} players to start.` });
    }

    startGame(target);
    ack?.({ ok: true });
  });

  /** Somebody has wandered off mid-cycle and the room does not want to wait. */
  socket.on('force_advance', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;

    /*
     * Skip whoever is up rather than closing the whole cycle. With one guesser
     * at a time, "we are waiting too long" almost always means one person, and
     * ending everybody else's turn to unstick them would be the wrong trade.
     * Skipping the last of them closes the cycle anyway.
     */
    if (target.phase === PHASES.GUESS) {
      target.drafts.delete(activeGuesserId(target));
      target.guessAt += 1;
      if (advanceGuess(target)) broadcast(target);
      else closeCycle(target);
      return ack?.({ ok: true });
    }
    if (target.phase === PHASES.REVEAL) {
      advanceFromReveal(target);
      return ack?.({ ok: true });
    }
    /*
     * The clue-giver has stopped responding — their phone died, or they left
     * the room holding it. Nobody else can act while a turn is waiting on
     * them, so the host hands the turn to the next player and re-deals.
     */
    if (target.phase === PHASES.PICK_TARGET || target.phase === PHASES.CLUE) {
      rotate(target);
      beginTurn(target);
      return ack?.({ ok: true });
    }
    ack?.({ error: 'Nothing to skip right now.' });
  });

  /**
   * Take somebody out of the game.
   *
   * Only two people are ever removable, and both are cases where leaving them
   * in means the game cannot continue: a player whose phone has gone, and the
   * player the guess queue is currently parked on. Anyone else — sitting on a
   * score, waiting their turn — is off limits, because "the host can remove
   * whoever they like" is a different game to the one being played.
   */
  socket.on('kick_player', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;

    const player = findPlayer(target, String(payload.playerId || ''));
    if (!player) return ack?.({ error: 'They have already left.' });
    if (player.id === target.hostId) return ack?.({ error: 'You cannot remove yourself.' });

    const holdingUp = target.phase === PHASES.GUESS && activeGuesserId(target) === player.id;
    if (player.connected && !holdingUp) {
      return ack?.({ error: `${player.name} is still playing.` });
    }

    /*
     * Hold the clue-giver by identity before the list changes under us.
     * turnIndex is a position, and removing anybody sitting ahead of it in
     * join order shifts every position after them by one — so reading the
     * index afterwards would quietly hand the turn to the wrong player.
     */
    const giver = clueGiver(target);
    const wasClueGiver = giver?.id === player.id;

    /*
     * Everything they left on the board goes with them. A pin whose owner is
     * no longer in the player list has no colour and no name, so it would sit
     * there for the rest of the turn as an anonymous marker nobody can score.
     */
    for (const cycleGuesses of target.guesses) cycleGuesses.delete(player.id);
    target.drafts.delete(player.id);
    target.players = target.players.filter((p) => p.id !== player.id);

    const stillThere = wasClueGiver ? -1 : target.players.indexOf(giver);
    target.turnIndex = stillThere >= 0
      ? stillThere
      : target.turnIndex % Math.max(1, target.players.length);
    reassignHost(target);
    ack?.({ ok: true });

    if (!target.players.length || target.phase === PHASES.LOBBY) return broadcast(target);

    /*
     * The turn cannot survive losing the person whose colour it was — nobody
     * else knows what the clue was for — so it is re-dealt to the next player.
     */
    if (wasClueGiver) {
      rotate(target);
      beginTurn(target);
      return;
    }
    if (target.phase === PHASES.GUESS) {
      if (!advanceGuess(target)) return closeCycle(target);
    }
    broadcast(target);
  });

  socket.on('reset_game', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canAbandon(target, ack)) return;
    resetToLobby(target);
    ack?.({ ok: true });
  });

  // --- The clue-giver -------------------------------------------------------

  socket.on('pick_target', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.PICK_TARGET) return ack?.({ error: 'Not right now.' });

    const player = findBySocket(target, socket.id);
    if (!player || player.id !== clueGiver(target)?.id) return ack?.({ error: 'Not your turn.' });

    const chosen = target.candidates.find(
      (cell) => cell.row === payload.row && cell.col === Number(payload.col)
    );
    if (!chosen) return ack?.({ error: 'That is not one of your four.' });

    target.target = chosen;
    // Spent, for the rest of the game — by square and by colour.
    target.usedTargets.add(`${chosen.row}${chosen.col}`);
    target.usedHexes.add(chosen.hex);
    target.phase = PHASES.CLUE;
    target.cycle = 0;
    ack?.({ ok: true });
    broadcast(target);
  });

  /** The clue has been said out loud. Open the first guesser's phone. */
  socket.on('open_guessing', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.CLUE) return ack?.({ error: 'Not right now.' });

    const player = findBySocket(target, socket.id);
    if (!player || player.id !== clueGiver(target)?.id) return ack?.({ error: 'Not your turn.' });

    target.cycle = target.cycle === 0 ? 1 : 2;
    target.phase = PHASES.GUESS;
    target.drafts = new Map();
    target.guessQueue = buildGuessQueue(target, target.cycle);
    target.guessAt = 0;
    target.guessOn = null;
    // If nobody can guess the cycle stays open rather than racing to a reveal
    // nobody saw; the host unsticks it.
    advanceGuess(target);
    ack?.({ ok: true });
    broadcast(target);
  });

  // --- Guessing -------------------------------------------------------------

  /**
   * A wheel moved. Not a guess yet — the room gets to watch you think, which
   * is deliberate, but nothing is committed until submit_guess.
   */
  socket.on('set_draft', (payload = {}) => {
    const target = room();
    if (!target || target.phase !== PHASES.GUESS) return;

    const player = findBySocket(target, socket.id);
    // Only the player actually up can move a crosshair. Everyone else's phone
    // is closed, and the board must show one person thinking, not several.
    if (!player || activeGuesserId(target) !== player.id) return;
    if (target.guesses[target.cycle - 1].has(player.id)) return;

    const row = ROWS.includes(payload.row) ? payload.row : null;
    const rawCol = Number(payload.col);
    const col = Number.isInteger(rawCol) && rawCol >= 1 && rawCol <= COLS ? rawCol : null;

    if (row === null && col === null) target.drafts.delete(player.id);
    else target.drafts.set(player.id, { row, col });

    broadcastDrafts(target);
  });

  /**
   * Whether the TV closes in while you pin.
   *
   * A preference rather than a setting: it is yours, it lasts the game, and it
   * only does anything on the turns you are actually pinning. Some people want
   * the neighbourhood magnified to choose within; some are still reading the
   * whole board and want it left alone.
   */
  socket.on('set_zoom', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });

    const player = findBySocket(target, socket.id);
    if (!player) return ack?.({ error: 'You are not in this game.' });

    player.zoom = !!payload.zoom;
    ack?.({ ok: true });
    broadcast(target);
  });

  socket.on('submit_guess', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.GUESS) return ack?.({ error: 'Guessing is closed.' });

    const player = findBySocket(target, socket.id);
    if (!player) return ack?.({ error: 'You are not in this game.' });
    if (player.id === clueGiver(target)?.id) return ack?.({ error: 'You gave the clue.' });
    // Submitting locks the pin. Letting a second submit through would also let
    // a player move after watching where everybody else landed.
    if (target.guesses[target.cycle - 1].has(player.id)) return ack?.({ error: 'Your pin is already in.' });
    if (activeGuesserId(target) !== player.id) return ack?.({ error: 'Not your turn yet.' });

    const row = String(payload.row || '');
    const col = Number(payload.col);
    if (!validCell(row, col)) return ack?.({ error: 'Pick a row and a column first.' });

    /*
     * One pin per square for the whole turn — your own first-clue pin included.
     * An occupied square is occupied: two markers stacked on one cell cannot be
     * told apart from across the room, so the board would be lying about where
     * everybody is.
     */
    const holder = pinnedBy(target, row, col);
    if (holder) {
      const whose = holder === player.id
        ? 'Your first pin is'
        : `${findPlayer(target, holder)?.name || 'Someone'} is`;
      return ack?.({ error: `${whose} on ${row}${col}.` });
    }

    target.guesses[target.cycle - 1].set(player.id, { row, col });
    target.drafts.delete(player.id);
    ack?.({ ok: true });

    // Hand the board to the next player, or close the cycle if that was the
    // last of them. Nobody has to press anything either way.
    target.guessAt += 1;
    if (advanceGuess(target)) broadcast(target);
    else closeCycle(target);
  });

  // --- Teardown -------------------------------------------------------------

  socket.on('disconnect', () => {
    const target = room();
    if (!target) return;

    target.tvSockets.delete(socket.id);

    const player = findBySocket(target, socket.id);
    if (!player) return;

    player.connected = false;
    target.drafts.delete(player.id);
    reassignHost(target);

    // A lobby that empties out entirely takes the room with it.
    if (target.phase === PHASES.LOBBY && !target.players.some((p) => p.connected) && !target.tvSockets.size) {
      clearRevealTimer(target);
      rooms.delete(target.code);
      return;
    }

    /*
     * Note what is deliberately missing: the queue is not moved along. A phone
     * that drops out mid-turn is usually a phone that is about to come back —
     * a lock screen, a reload, a walk past the router — and skipping the owner
     * the instant the socket closes means they lose a clue for standing up.
     * The queue holds its place, the TV says who it is holding for, and the
     * host has a button if they are really gone. See advanceGuess.
     */
    broadcast(target);
  });
});

// Sweep rooms abandoned for an hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [code, target] of rooms) {
    const empty = !target.tvSockets.size && !target.players.some((p) => p.connected);
    if (empty && target.createdAt < cutoff) {
      clearRevealTimer(target);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

module.exports.onListen = () => {
  const lan = lanAddress();
  console.log('');
  console.log('  HUES & CUES');
  console.log(`  TV screen     http://127.0.0.1:${PORT}${BASE}/tv`);
  console.log(`  Phones        ${lan ? `http://${lan}:${PORT}${BASE}` : `http://127.0.0.1:${PORT}${BASE}`}`);
  console.log('');
};
