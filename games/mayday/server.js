/**
 * Mayday — game server.
 *
 * Social deduction for 5–12 players, with the ship's AI as the only moderator.
 * This process is that AI: it deals the roles, runs every clock, collects the
 * night actions and the day's votes, and decides what each screen is allowed to
 * know. The TV speaks the lines and plays the cutscenes, but it is told what
 * happened — it never works anything out for itself.
 *
 * Two rules keep the secret safe:
 *   · publicState() is the only payload that reaches the whole room, and it
 *     carries no living player's role. A role appears there exactly once, at
 *     the moment that player dies and is revealed to everybody at once.
 *   · Everything private (your role, your teammates, what your scan found)
 *     goes to one socket at a time through privateState().
 *
 * Sockets live on their own `/mayday` namespace rather than the shared root,
 * so this game's events can never be picked up by Hitster's handlers.
 */

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const { app, io } = require('../../lib/host');

/** Where this game's pages live on the site. */
const BASE = require('../registry').find((game) => game.id === 'mayday').basePath;

/**
 * `Number(x) || fallback` silently discards an explicit 0, which would make
 * MAYDAY_SPOTLIGHT_MS=0 mean "20 seconds" instead of "no spotlight". This only
 * falls back when the variable is genuinely unset or unparseable.
 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const PORT = envInt('PORT', 3000);

// --- Phase clocks -----------------------------------------------------------
// Every one of these is a real phase the room waits out, so they are all
// tunable from .env rather than baked in.

/** Narrator line, lights out. */
const NIGHT_INTRO_MS = envInt('MAYDAY_NIGHT_INTRO_MS', 5000);
/** Saboteurs agree on a target. */
const SABOTEUR_MS = envInt('MAYDAY_SABOTEUR_MS', 20000);
/** Sensor Officer scans one player. */
const SENSOR_MS = envInt('MAYDAY_SENSOR_MS', 15000);
/** Medic seals one player's quarters. */
const MEDIC_MS = envInt('MAYDAY_MEDIC_MS', 15000);
/** The morning report, and the vent cutscene if there was one. */
const MORNING_MS = envInt('MAYDAY_MORNING_MS', 8000);
/** Total floor time, spotlight included. Configurable per game from the TV. */
const DISCUSSION_MS = envInt('MAYDAY_DISCUSSION_MS', 180000);
/** Each player's turn to defend themselves, when the spotlight is on. */
const SPOTLIGHT_MS = envInt('MAYDAY_SPOTLIGHT_MS', 20000);
/**
 * Open floor left after the spotlight has been round everyone. Twelve players
 * at 20s each is longer than a 180s discussion, so without a floor the whole
 * phase would be spotlight and nobody would get to argue freely.
 */
const OPEN_FLOOR_MIN_MS = envInt('MAYDAY_OPEN_FLOOR_MIN_MS', 30000);
/** Voting window. */
const VOTE_MS = envInt('MAYDAY_VOTE_MS', 40000);
/** The tally, the outcome, and the cutscene if somebody went. */
const ELIMINATION_MS = envInt('MAYDAY_ELIMINATION_MS', 8000);
/** How long a voted-out Security Officer has to name someone. */
const REVENGE_MS = envInt('MAYDAY_REVENGE_MS', 20000);
/**
 * Reading time between the deal and the first night. Not in the phase table,
 * but a room where everybody has just been handed a secret needs a moment to
 * actually read it before the lights go out.
 */
const ROLE_DEAL_MS = envInt('MAYDAY_ROLE_DEAL_MS', 8000);
/**
 * The opening: the ship, the wound, and how the crew ended up in this room.
 * Long, because it is a story rather than a phase — the host can cut it short
 * from their phone once the room has heard it a few times.
 *
 * Two minutes covers the filmed opening — roughly ninety seconds of crew
 * dialogue and dead air, then the ship's closing lines over the roll call. This
 * is only the ceiling: the phase actually ends through endPhase(), so the TV
 * being mid-sentence holds it, and a screen that falls back to the shorter
 * drawn opening releases it early rather than sitting on a black screen.
 */
const INTRO_MS = envInt('MAYDAY_INTRO_MS', 120000);
/**
 * Breathing room after everybody in a window has acted. The clock jumps to
 * this rather than to zero, so the narrator's line lands and the room gets a
 * beat to look up before the next phase starts.
 */
const SETTLE_MS = envInt('MAYDAY_SETTLE_MS', 3200);
/** The same, for the Sensor — who has a result to read before moving on. */
const SCAN_READ_MS = envInt('MAYDAY_SCAN_READ_MS', 5500);
/**
 * How long a phase will wait for the narrator to finish a sentence before
 * giving up and moving on anyway. Only a cap: a TV that crashes mid-line, or
 * one with the sound off, must not be able to freeze the game.
 */
const NARRATION_HOLD_MS = envInt('MAYDAY_NARRATION_HOLD_MS', 15000);
/** Air after the last word, before the next phase starts. */
const NARRATION_GAP_MS = envInt('MAYDAY_NARRATION_GAP_MS', 900);

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 12;

app.use(BASE, express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Crew colours
// ---------------------------------------------------------------------------

/**
 * Twelve colours for twelve maximum players, so every crew member can hold one
 * outright. The server owns this list: colours are handed out here and the
 * clients only ever draw the hex they are given, which is what makes "no two
 * players share a colour" true rather than hopeful.
 *
 * Named as well as coloured, everywhere they appear — a colour-blind player
 * should never have to tell two crewmates apart by hue alone.
 */
const PALETTE = [
  { id: 'red', name: 'Red', hex: '#E8402A' },
  { id: 'blue', name: 'Blue', hex: '#2C5BE0' },
  { id: 'green', name: 'Green', hex: '#28B84C' },
  { id: 'pink', name: 'Pink', hex: '#FF5FA8' },
  { id: 'orange', name: 'Orange', hex: '#FF8A1E' },
  { id: 'yellow', name: 'Yellow', hex: '#F2C31B' },
  { id: 'cyan', name: 'Cyan', hex: '#26C6D6' },
  { id: 'purple', name: 'Purple', hex: '#8B3FE0' },
  { id: 'lime', name: 'Lime', hex: '#9BD62B' },
  { id: 'rose', name: 'Rose', hex: '#B5203C' },
  { id: 'bone', name: 'Bone', hex: '#DFE6E9' },
  { id: 'void', name: 'Void', hex: '#4A525C' },
];

const colourById = (id) => PALETTE.find((c) => c.id === id) || null;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const ROLES = {
  SABOTEUR: 'saboteur',
  MIMIC: 'mimic',
  CREW: 'crew',
  SENSOR: 'sensor',
  MEDIC: 'medic',
  SECURITY: 'security',
};

/** Everything the clients need to name and draw a role, in one place. */
const ROLE_INFO = {
  [ROLES.SABOTEUR]: { label: 'Saboteur', team: 'saboteur' },
  [ROLES.MIMIC]: { label: 'Mimic', team: 'saboteur' },
  [ROLES.CREW]: { label: 'Crew', team: 'crew' },
  [ROLES.SENSOR]: { label: 'Sensor Officer', team: 'crew' },
  [ROLES.MEDIC]: { label: 'Medic', team: 'crew' },
  [ROLES.SECURITY]: { label: 'Security Officer', team: 'crew' },
};

const isSaboteur = (role) => role === ROLES.SABOTEUR || role === ROLES.MIMIC;

/** More players, more saboteurs — the ratio the genre settled on long ago. */
function saboteurCount(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

const PHASES = {
  LOBBY: 'lobby',
  /** The opening story, before anybody is told anything. */
  INTRO: 'intro',
  NIGHT_INTRO: 'night_intro',
  NIGHT_SABOTEURS: 'night_saboteurs',
  NIGHT_SENSOR: 'night_sensor',
  NIGHT_MEDIC: 'night_medic',
  MORNING: 'morning',
  DISCUSSION: 'discussion',
  VOTING: 'voting',
  ELIMINATION: 'elimination',
  /** A voted-out Security Officer choosing who goes with them. */
  REVENGE: 'revenge',
  GAME_OVER: 'game_over',
};

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Four-letter codes from the ship's own vocabulary, easy to shout across a room. */
const CODE_WORDS = [
  'HULL', 'VENT', 'AIRL', 'DECK', 'CREW', 'DUST', 'ORBT', 'FUEL', 'GLOW', 'MASK',
  'BOLT', 'DRIF', 'HALO', 'IRIS', 'KILN', 'LUNA', 'NOVA', 'PORT', 'RUST', 'SCAN',
  'SILO', 'TANK', 'VOID', 'WIRE', 'ZERO', 'ARCX', 'BEAM', 'CARG', 'DOCK', 'EXIT',
];

/** code -> room */
const rooms = new Map();

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
    /** Which night/day we are on. Shown as "Cycle 3". */
    cycle: 0,
    config: {
      sensor: true,
      medic: true,
      security: false,
      mimic: false,
      spotlight: false,
      discussionMs: DISCUSSION_MS,
    },
    /** Cleared and rebuilt every night. */
    night: null,
    /** voterId -> targetId, hidden until the window closes. */
    votes: new Map(),
    /** Set while the day's result is on screen. */
    lastVote: null,
    /** Segments of the discussion phase, spotlight first. */
    discussion: null,
    /** The Security Officer owed a parting shot. */
    revengeBy: null,
    winner: null,
    /**
     * What the TV should narrate and play right now. The TV watches the id and
     * fires once per change, so a screen that joins late or reloads picks the
     * current beat up rather than replaying the whole game.
     */
    beat: null,
    beatSeq: 0,
    paused: false,
    clock: null,
    /**
     * Which screens are mid-sentence, by socket id.
     *
     * A set rather than a flag: a room can have a second TV, and a TV that
     * reloads registers again before the old socket has finished disconnecting.
     * A single shared boolean let either of those wipe the state of the screen
     * that was actually talking, and the phase would sail straight through the
     * line it was supposed to wait for.
     */
    speakers: new Set(),
    /** A phase transition that has come due and is waiting for the narrator. */
    pendingEnd: null,
    holdTimer: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

const findPlayer = (room, id) => room.players.find((p) => p.id === id) || null;

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
const findBySocket = (room, socketId) => room.players.find((p) => p.socketId === socketId) || null;
const livingPlayers = (room) => room.players.filter((p) => p.alive);
const livingWithRole = (room, role) => livingPlayers(room).find((p) => p.role === role) || null;

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * One pausable timer per room.
 *
 * Phases chain by handing the next one to startClock, so pausing is a single
 * operation on a single timer no matter which phase is running: the pending
 * timeout is dropped and what was left of it is banked. Nothing else in the
 * game measures time, so nothing can keep ticking behind a pause.
 */
function clearClock(room) {
  if (room.clock?.handle) clearTimeout(room.clock.handle);
  room.clock = null;
  clearTimeout(room.holdTimer);
  room.holdTimer = null;
  room.pendingEnd = null;
}

function arm(room) {
  const clock = room.clock;
  if (!clock || clock.handle) return;
  clock.endsAt = Date.now() + clock.remaining;
  clock.handle = setTimeout(() => {
    clock.handle = null;
    room.clock = null;
    endPhase(room, clock.onEnd);
  }, clock.remaining);
}

/**
 * A phase is over — unless the ship is still talking.
 *
 * Clocks are set to how long a phase should *feel*, but the narrator's lines
 * are as long as the device's voice makes them, and a line that gets cut off by
 * the next phase takes the following phase's line with it: the queue on the TV
 * fills up, and the room hears a sentence about an ejection while the saboteurs
 * are already choosing. Nothing moves while a sentence is in progress.
 */
function endPhase(room, onEnd) {
  if (!room.speakers.size) return onEnd();
  room.pendingEnd = onEnd;
  clearTimeout(room.holdTimer);
  room.holdTimer = setTimeout(() => releaseHold(room, true), NARRATION_HOLD_MS);
  broadcast(room);
}

/** The narrator has stopped (or run out of patience). Let the phase go. */
function releaseHold(room, forced = false) {
  if (!room.pendingEnd) return;
  // A pause holds everything, including this.
  if (room.paused && !forced) return;

  const go = room.pendingEnd;
  room.pendingEnd = null;
  clearTimeout(room.holdTimer);
  room.holdTimer = null;

  if (forced) return go();
  // A beat of air after the last word, so phases do not tread on the ending.
  room.holdTimer = setTimeout(() => {
    room.holdTimer = null;
    go();
  }, NARRATION_GAP_MS);
}

function startClock(room, ms, onEnd) {
  clearClock(room);
  room.clock = { total: ms, remaining: ms, endsAt: Date.now() + ms, handle: null, onEnd };
  if (!room.paused) arm(room);
}

/** Milliseconds left on the current phase, frozen while paused. */
function msLeft(room) {
  if (!room.clock) return 0;
  if (room.paused || !room.clock.handle) return Math.max(0, room.clock.remaining);
  return Math.max(0, room.clock.endsAt - Date.now());
}

/**
 * Cut the current phase short.
 *
 * Used the moment a window has nothing left to wait for — every saboteur has
 * picked, the Medic has sealed a door, every ballot is in. It never extends a
 * clock, only shortens it, and it leaves a few seconds so the narrator's line
 * finishes and the room can look up before the next thing happens.
 */
function hurry(room, ms) {
  if (!room.clock) return;
  const { onEnd } = room.clock;
  if (msLeft(room) <= ms) return;
  startClock(room, ms, onEnd);
}

function setPaused(room, paused) {
  if (room.paused === paused) return;
  room.paused = paused;
  // A phase waiting on the narrator resumes with everything else.
  if (!paused && room.pendingEnd) releaseHold(room);
  if (!room.clock) return;
  if (paused) {
    room.clock.remaining = Math.max(0, room.clock.endsAt - Date.now());
    clearTimeout(room.clock.handle);
    room.clock.handle = null;
  } else {
    arm(room);
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Everything the whole room may see. No living player's role is in here.
 * `revealedRole` is only ever filled in for the dead — the moment somebody is
 * eliminated their role becomes public, which is the information the survivors
 * are actually playing with.
 */
function publicState(room) {
  const alive = livingPlayers(room).length;
  return {
    code: room.code,
    phase: room.phase,
    cycle: room.cycle,
    paused: room.paused,
    // Relative, not absolute: a phone's clock need not agree with the server's,
    // so each screen counts down locally from whatever it was handed.
    msLeft: msLeft(room),
    phaseMs: room.clock?.total || 0,
    /** The phase is over and waiting for the narrator to finish a sentence. */
    holding: !!room.pendingEnd,
    config: { ...room.config },
    beat: room.beat,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    saboteurCount: saboteurCount(Math.max(room.players.length, MIN_PLAYERS)),
    aliveCount: alive,
    /** What it takes to eject somebody: a strict majority of the living. */
    voteNeeded: Math.floor(alive / 2) + 1,
    /**
     * How many ballots are in, and whose. Never who they were for — that is
     * the part that stays sealed until the window shuts. Knowing the room is
     * waiting on one person is the same information as watching someone not
     * raise their hand.
     */
    votesIn: room.votes.size,
    // Ballots can be cast from the moment the floor opens, so this is live
    // through the discussion too.
    voted: room.phase === PHASES.VOTING || room.phase === PHASES.DISCUSSION
      ? Array.from(room.votes.keys())
      : [],
    lastVote: room.lastVote,
    discussion: room.discussion
      ? {
        kind: room.discussion.segments[room.discussion.index]?.kind || 'open',
        spotlightId: room.discussion.segments[room.discussion.index]?.playerId || null,
        totalMsLeft: discussionMsLeft(room),
        totalMs: room.discussion.totalMs,
      }
      : null,
    revengeBy: room.revengeBy,
    winner: room.winner,
    // The host is a player, not the TV: whoever joined first runs the game
    // from their own phone.
    hostId: room.hostId,
    hostName: findPlayer(room, room.hostId)?.name || null,
    palette: PALETTE.map((colour) => ({
      ...colour,
      takenBy: room.players.find((p) => p.colour === colour.id)?.name || null,
    })),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      colour: colourById(p.colour),
      connected: p.connected,
      alive: p.alive,
      deathBy: p.deathBy,
      revealedRole: p.alive ? null : p.role,
      revealedRoleLabel: p.alive ? null : ROLE_INFO[p.role]?.label || null,
    })),
  };
}

/** What one player, and only that player, is allowed to know. */
function privateState(room, player) {
  const info = ROLE_INFO[player.role];
  const night = room.night;
  const iAmSaboteur = isSaboteur(player.role);

  return {
    playerId: player.id,
    role: player.role,
    roleLabel: info?.label || null,
    team: info?.team || null,
    alive: player.alive,
    // Saboteurs have always known each other; the Mimic is on the list because
    // they are a full member of the team, not a third faction.
    teammates: iAmSaboteur && room.phase !== PHASES.LOBBY
      ? room.players.filter((p) => isSaboteur(p.role) && p.id !== player.id)
        .map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive }))
      : [],
    /**
     * Live picks, so the saboteurs can converge without talking. Only sent to
     * the saboteurs, and only while their own window is open.
     */
    sabPicks: iAmSaboteur && night && room.phase === PHASES.NIGHT_SABOTEURS
      ? Array.from(night.sabPicks, ([voterId, targetId]) => ({ voterId, targetId }))
      : [],
    /** Everything this Sensor has learned, kept across reconnects. */
    scans: player.scans || [],
    /** The Medic may not seal the same quarters two nights running. */
    blockedProtectId: player.role === ROLES.MEDIC ? (player.lastProtectId || null) : null,
    myVote: room.votes.get(player.id) || null,
    myNightAction: night ? (night.sabPicks.get(player.id) || null) : null,
    scanned: night?.scanBy === player.id ? night.scanTargetId : null,
    protected: night?.protectBy === player.id ? night.protectTargetId : null,
  };
}

const nsp = io.of('/mayday');

function broadcast(room) {
  const state = publicState(room);
  nsp.to(`room:${room.code}`).emit('game_state', state);
  // Private payloads ride alongside every broadcast rather than being pushed
  // once at deal time. That is what makes reconnecting free: a phone that comes
  // back mid-night is handed its role and its half-finished action with the
  // very next state, without asking for anything.
  for (const player of room.players) {
    if (player.connected && player.socketId) {
      nsp.to(player.socketId).emit('private_state', privateState(room, player));
    }
  }
}

/**
 * Hand the TV its next thing to say and show. One beat per narrated moment;
 * the id is what the TV de-duplicates on.
 */
function setBeat(room, kind, payload = {}) {
  room.beatSeq += 1;
  room.beat = { id: room.beatSeq, kind, ...payload };
}

/** A dead player, packaged for a cutscene: their bean, their colour, their role. */
function casualty(player, method) {
  return {
    id: player.id,
    name: player.name,
    colour: colourById(player.colour),
    role: player.role,
    roleLabel: ROLE_INFO[player.role]?.label || null,
    team: ROLE_INFO[player.role]?.team || null,
    method,
  };
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

function dealRoles(room) {
  const order = shuffle(room.players);
  const sabs = saboteurCount(order.length);

  for (const player of order) {
    player.role = ROLES.CREW;
    player.alive = true;
    player.deathBy = null;
    player.scans = [];
    player.lastProtectId = null;
  }

  const saboteurs = order.slice(0, sabs);
  for (const player of saboteurs) player.role = ROLES.SABOTEUR;

  /*
   * The Mimic takes one of the saboteur slots rather than adding a body to the
   * team, so the count table above stays true. It needs a slot to take: with a
   * single saboteur, turning one into a Mimic would mean no scan in the game
   * could ever return "Saboteur", which quietly deletes the Sensor instead of
   * making it unreliable. Below 7 players the toggle therefore does nothing,
   * and the setup screen says so.
   */
  if (room.config.mimic && saboteurs.length >= 2) {
    saboteurs[saboteurs.length - 1].role = ROLES.MIMIC;
  }

  const crew = order.slice(sabs);
  let next = 0;
  const give = (enabled, role) => {
    if (enabled && next < crew.length) crew[next++].role = role;
  };
  give(room.config.sensor, ROLES.SENSOR);
  give(room.config.medic, ROLES.MEDIC);
  give(room.config.security, ROLES.SECURITY);
}

// ---------------------------------------------------------------------------
// Win conditions
// ---------------------------------------------------------------------------

/**
 * Run after every single elimination, night or day — a vent that tips the
 * balance ends the game where it happens rather than at the next phase change.
 */
function winner(room) {
  const alive = livingPlayers(room);
  const sabs = alive.filter((p) => isSaboteur(p.role));
  const crew = alive.length - sabs.length;
  if (!sabs.length) return 'crew';
  if (sabs.length >= crew) return 'saboteurs';
  return null;
}

/**
 * Ends the game if a side has won. Returns true when it did.
 *
 * `holdMs` is how long the elimination that just happened keeps the floor. The
 * game is over the instant the balance tips — nobody can act, and the phase
 * says so — but the beat that killed somebody deserves its cutscene and its
 * role reveal before the ship announces the result over the top of it. Sending
 * both beats in the same tick means the narrator talks over themselves and the
 * last thing the room hears is who was ejected rather than who won.
 */
function endIfWon(room, holdMs = 0) {
  const side = winner(room);
  if (!side) return false;

  clearClock(room);
  room.phase = PHASES.GAME_OVER;
  room.winner = {
    side,
    roster: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      colour: colourById(p.colour),
      role: p.role,
      roleLabel: ROLE_INFO[p.role]?.label || null,
      team: ROLE_INFO[p.role]?.team || null,
      alive: p.alive,
    })),
  };
  const announce = () => {
    setBeat(room, side === 'crew' ? 'win_crew' : 'win_saboteurs', { winner: room.winner });
    broadcast(room);
  };

  if (holdMs > 0) {
    // Same pausable clock as every other phase, so a room that pauses on the
    // final cutscene does not get the result shouted at it on resume.
    broadcast(room);
    startClock(room, holdMs, announce);
  } else {
    announce();
  }
  return true;
}

function kill(room, player, method) {
  player.alive = false;
  player.deathBy = method;
  return casualty(player, method);
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

function beginNight(room) {
  room.cycle += 1;
  room.votes = new Map();
  room.lastVote = null;
  room.discussion = null;
  room.revengeBy = null;
  room.night = {
    sabPicks: new Map(),
    ventTargetId: null,
    scanBy: null,
    scanTargetId: null,
    protectBy: null,
    protectTargetId: null,
  };

  room.phase = PHASES.NIGHT_INTRO;
  setBeat(room, 'night_begins', { cycle: room.cycle });
  startClock(room, NIGHT_INTRO_MS, () => saboteurWindow(room));
  broadcast(room);
}

function saboteurWindow(room) {
  room.phase = PHASES.NIGHT_SABOTEURS;
  setBeat(room, 'turn_saboteurs');
  startClock(room, SABOTEUR_MS, () => {
    resolveSaboteurPicks(room);
    sensorWindow(room);
  });
  broadcast(room);
}

/**
 * Majority among the saboteurs wins, a tie is broken at random, and if none of
 * them picked in time nobody is vented. Deliberately forgiving: a saboteur
 * whose phone died should not be able to veto their whole team's night.
 */
function resolveSaboteurPicks(room) {
  const picks = Array.from(room.night.sabPicks.values());
  if (!picks.length) return;

  const counts = new Map();
  for (const id of picks) counts.set(id, (counts.get(id) || 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = Array.from(counts.entries()).filter(([, n]) => n === top).map(([id]) => id);
  room.night.ventTargetId = leaders[Math.floor(Math.random() * leaders.length)];
}

/**
 * The night's remaining windows are skipped when the officer holding them is
 * dead. That leaks nothing: every elimination reveals the role publicly, so by
 * the time a window disappears the whole room already knows why.
 */
function sensorWindow(room) {
  const sensor = livingWithRole(room, ROLES.SENSOR);
  if (!sensor) return medicWindow(room);

  room.phase = PHASES.NIGHT_SENSOR;
  room.night.scanBy = sensor.id;
  setBeat(room, 'turn_sensor');
  startClock(room, SENSOR_MS, () => medicWindow(room));
  broadcast(room);
}

function medicWindow(room) {
  const medic = livingWithRole(room, ROLES.MEDIC);
  if (!medic) return resolveNight(room);

  room.phase = PHASES.NIGHT_MEDIC;
  room.night.protectBy = medic.id;
  setBeat(room, 'turn_medic');
  startClock(room, MEDIC_MS, () => resolveNight(room));
  broadcast(room);
}

function resolveNight(room) {
  const night = room.night;
  const target = night.ventTargetId ? findPlayer(room, night.ventTargetId) : null;
  const sealed = night.protectTargetId && night.protectTargetId === night.ventTargetId;

  const medic = night.protectBy ? findPlayer(room, night.protectBy) : null;
  if (medic) medic.lastProtectId = night.protectTargetId || null;

  let victim = null;
  if (target && target.alive && !sealed) victim = kill(room, target, 'vent');

  room.phase = PHASES.MORNING;
  /*
   * One beat for every quiet night, whether the Medic sealed the door or the
   * saboteurs never agreed on a name. Two different lines here would tell the
   * room whether the Medic guessed right, which is the Medic's secret to keep.
   */
  setBeat(room, victim ? 'morning_vent' : 'morning_quiet', { victim, cycle: room.cycle });
  broadcast(room);

  if (victim && endIfWon(room, MORNING_MS)) return;

  startClock(room, MORNING_MS, () => beginDiscussion(room));
  broadcast(room);
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function beginDiscussion(room) {
  const alive = livingPlayers(room);
  const segments = [];

  if (room.config.spotlight) {
    for (const player of shuffle(alive)) {
      segments.push({ kind: 'spotlight', playerId: player.id, ms: SPOTLIGHT_MS });
    }
  }

  const spotlightMs = segments.reduce((sum, seg) => sum + seg.ms, 0);
  // The floor is what stops a twelve-player spotlight from eating the entire
  // discussion: everyone still gets their turn, and the room still gets time to
  // argue afterwards, even if that runs the phase past its nominal length.
  const openMs = Math.max(room.config.discussionMs - spotlightMs, segments.length ? OPEN_FLOOR_MIN_MS : 0);
  segments.push({ kind: 'open', ms: openMs });

  room.discussion = {
    segments,
    index: 0,
    totalMs: spotlightMs + openMs,
  };

  room.phase = PHASES.DISCUSSION;
  setBeat(room, 'discussion_opens', { cycle: room.cycle });
  runDiscussionSegment(room);
}

function discussionMsLeft(room) {
  if (!room.discussion) return 0;
  const { segments, index } = room.discussion;
  const rest = segments.slice(index + 1).reduce((sum, seg) => sum + seg.ms, 0);
  return msLeft(room) + rest;
}

function runDiscussionSegment(room) {
  const state = room.discussion;
  const segment = state.segments[state.index];
  if (!segment) return beginVote(room);

  startClock(room, segment.ms, () => {
    state.index += 1;
    if (state.index >= state.segments.length) return beginVote(room);
    runDiscussionSegment(room);
  });
  broadcast(room);
}

/**
 * The dedicated voting window. Ballots cast during the discussion are kept —
 * anybody who has already made up their mind has already voted, and this phase
 * exists for the people who have not.
 */
function beginVote(room) {
  room.discussion = null;
  room.phase = PHASES.VOTING;
  setBeat(room, 'vote_opens');
  startClock(room, VOTE_MS, () => closeVote(room));
  broadcast(room);
}

/** Every living player has a ballot in. */
function allVotesIn(room) {
  const alive = livingPlayers(room);
  return alive.length > 0 && alive.every((player) => room.votes.has(player.id));
}

/** The room voted itself out of its own discussion. Skip to the count. */
function closeDiscussionEarly(room) {
  room.discussion = null;
  room.phase = PHASES.VOTING;
  setBeat(room, 'vote_early');
  startClock(room, SETTLE_MS, () => closeVote(room));
  broadcast(room);
}

/**
 * A strict majority of the living ejects somebody; anything short of that and
 * the crew simply failed to agree. No runoff, no coin toss — an indecisive day
 * is a result in itself, and it costs the crew a night.
 */
function closeVote(room) {
  const alive = livingPlayers(room);
  const needed = Math.floor(alive.length / 2) + 1;

  const counts = new Map();
  for (const targetId of room.votes.values()) counts.set(targetId, (counts.get(targetId) || 0) + 1);

  let chosen = null;
  for (const [targetId, n] of counts) if (n >= needed) chosen = targetId;

  const tally = alive
    .map((p) => ({ id: p.id, name: p.name, colour: colourById(p.colour), votes: counts.get(p.id) || 0 }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  room.lastVote = {
    tally,
    needed,
    // Who voted for whom, published only now that the window has shut.
    ballots: Array.from(room.votes, ([voterId, targetId]) => ({ voterId, targetId })),
    abstained: alive.filter((p) => !room.votes.has(p.id)).map((p) => p.id),
    eliminatedId: chosen,
  };

  room.phase = PHASES.ELIMINATION;

  if (!chosen) {
    setBeat(room, 'vote_none', { vote: room.lastVote });
    startClock(room, ELIMINATION_MS, () => beginNight(room));
    broadcast(room);
    return;
  }

  const player = findPlayer(room, chosen);
  const victim = kill(room, player, 'vote');
  setBeat(room, 'vote_out', { victim, vote: room.lastVote });
  broadcast(room);

  // Checked here, before the parting shot: the win check runs after every
  // elimination, so a vote that hands the saboteurs parity ends the game on the
  // spot and the Security Officer never gets to raise their arm.
  if (endIfWon(room, ELIMINATION_MS)) return;

  const canRevenge = player.role === ROLES.SECURITY && livingPlayers(room).length > 0;
  startClock(room, ELIMINATION_MS, () => (canRevenge ? beginRevenge(room, player) : beginNight(room)));
  broadcast(room);
}

function beginRevenge(room, officer) {
  room.revengeBy = { id: officer.id, name: officer.name, colour: colourById(officer.colour) };
  room.phase = PHASES.REVENGE;
  setBeat(room, 'revenge_opens', { officer: room.revengeBy });
  startClock(room, REVENGE_MS, () => resolveRevenge(room, null));
  broadcast(room);
}

function resolveRevenge(room, targetId) {
  const officer = room.revengeBy;
  const target = targetId ? findPlayer(room, targetId) : null;
  room.revengeBy = null;
  room.phase = PHASES.ELIMINATION;

  if (!target || !target.alive) {
    setBeat(room, 'revenge_none', { officer });
    startClock(room, ELIMINATION_MS, () => beginNight(room));
    broadcast(room);
    return;
  }

  const victim = kill(room, target, 'revenge');
  setBeat(room, 'revenge_kill', { officer, victim });
  broadcast(room);

  if (endIfWon(room, ELIMINATION_MS)) return;

  startClock(room, ELIMINATION_MS, () => beginNight(room));
  broadcast(room);
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

function startGame(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { error: `Mayday needs ${MIN_PLAYERS} players. You have ${room.players.length}.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { error: `Mayday tops out at ${MAX_PLAYERS} players.` };
  }

  room.cycle = 0;
  room.winner = null;
  room.paused = false;
  room.phase = PHASES.INTRO;
  // Roles are dealt at the *end* of the opening. Nobody should be reading a
  // secret off their phone while the ship is still explaining what happened.
  setBeat(room, 'intro', { crew: room.players.map((p) => ({ name: p.name, colour: colourById(p.colour) })) });
  // Through endPhase, so the deal never lands on top of the ship's last line.
  startClock(room, INTRO_MS, () => endPhase(room, () => dealRoom(room)));
  broadcast(room);
  return { ok: true };
}

/** The deal: roles land on phones, and everybody gets a moment to read one. */
function dealRoom(room) {
  dealRoles(room);
  room.phase = PHASES.NIGHT_INTRO;
  setBeat(room, 'game_start', { saboteurs: saboteurCount(room.players.length) });
  startClock(room, ROLE_DEAL_MS, () => beginNight(room));
  broadcast(room);
}

function resetToLobby(room) {
  clearClock(room);
  room.phase = PHASES.LOBBY;
  room.cycle = 0;
  room.night = null;
  room.votes = new Map();
  room.lastVote = null;
  room.discussion = null;
  room.revengeBy = null;
  room.winner = null;
  room.beat = null;
  room.paused = false;
  for (const player of room.players) {
    player.role = null;
    player.alive = true;
    player.deathBy = null;
    player.scans = [];
    player.lastProtectId = null;
  }
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

app.get(`${BASE}/api/join-info`, async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  const url = joinUrlFor(req, code);
  try {
    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 420,
      color: { dark: '#0A0D0F', light: '#C9D6DC' },
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
   * Every game control — setup, start, skip, pause, reset — lives on the
   * host's phone. The host is the first player who joined.
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
   * Abandoning a game is the exception to control living on the host's phone.
   * The TV is the device physically in the room, and "this game is broken, or
   * we are done with it" has to be answerable from there — without hunting for
   * whichever phone happens to be the host, or waiting out a phase to get to a
   * button. Nothing here can decide a game; it can only end one.
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
    // This screen has an empty queue — but only this one. Another TV in the
    // room may be halfway through a sentence.
    target.speakers.delete(socket.id);
    if (!target.speakers.size) releaseHold(target);
    ack?.({ ok: true, code: target.code });
    broadcast(target);
  });

  /**
   * The TV telling the ship whether it is mid-sentence. The server cannot know
   * how long a line takes — that depends on the device's voice, its rate, and
   * the length of the line — so the screen doing the talking is the only thing
   * that can say, and phase transitions wait on it.
   */
  socket.on('narration', (payload = {}) => {
    const target = room();
    if (!target || !target.tvSockets.has(socket.id)) return;

    if (!payload.speaking) {
      target.speakers.delete(socket.id);
      if (!target.speakers.size) releaseHold(target);
      return;
    }

    target.speakers.add(socket.id);
    // Still talking. Push the give-up cap back: it exists for a screen that has
    // stopped answering, not for a room that has a lot to be told.
    if (target.pendingEnd) {
      clearTimeout(target.holdTimer);
      target.holdTimer = setTimeout(() => releaseHold(target, true), NARRATION_HOLD_MS);
    }
  });

  socket.on('set_config', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'The game is already running.' });

    const config = target.config;
    for (const key of ['sensor', 'medic', 'security', 'mimic', 'spotlight']) {
      if (typeof payload[key] === 'boolean') config[key] = payload[key];
    }
    if (Number.isFinite(payload.discussionMs)) {
      config.discussionMs = Math.min(Math.max(Math.round(payload.discussionMs), 30000), 600000);
    }
    ack?.({ ok: true });
    broadcast(target);
  });

  socket.on('start_game', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'The game is already running.' });

    const result = startGame(target);
    if (result.error) return ack?.({ error: result.error });
    ack?.({ ok: true });
  });

  /** The opening is long on purpose, and tedious on the fourth game. */
  socket.on('skip_intro', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;
    if (target.phase !== PHASES.INTRO) return ack?.({ error: 'Nothing to skip.' });

    clearClock(target);
    dealRoom(target);
    ack?.({ ok: true });
  });

  socket.on('set_paused', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canControl(target, ack)) return;
    setPaused(target, !!payload.paused);
    ack?.({ ok: true });
    broadcast(target);
  });

  /** Drop the game in progress and put everyone back in the lobby, crew intact. */
  socket.on('reset_game', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canAbandon(target, ack)) return;
    resetToLobby(target);
    ack?.({ ok: true });
  });

  /**
   * Close the room outright: everybody is sent back to the join screen and the
   * TV is handed a fresh code. For when the group changes, or a room has got
   * itself into a state nobody wants to reason about.
   */
  socket.on('close_room', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (!canAbandon(target, ack)) return;

    const fresh = createRoom();
    clearClock(target);
    nsp.to(`room:${target.code}`).emit('room_closed', { code: fresh.code });
    rooms.delete(target.code);
    ack?.({ ok: true, code: fresh.code });
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
        error: requested ? `No ship found with code ${requested}.` : 'No game running. Open the TV screen first.',
      });
    }

    /*
     * Reconnect by name. A phone that died, locked or reloaded rejoins with the
     * same name and gets its seat back — role, alive-or-dead, and whatever
     * action was half-finished, since the next broadcast carries all of it.
     */
    const returning = target.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (returning) {
      if (returning.connected) return ack?.({ error: `${name} is already aboard. Pick another name.` });
      returning.connected = true;
      returning.socketId = socket.id;
      attach(target);
      reassignHost(target);
      ack?.({ ok: true, code: target.code, playerId: returning.id });
      broadcast(target);
      return;
    }

    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'That game is already underway.' });
    if (target.players.length >= MAX_PLAYERS) return ack?.({ error: `The ship is full (${MAX_PLAYERS} crew).` });

    const free = PALETTE.filter((colour) => !target.players.some((p) => p.colour === colour.id));
    const colour = free[Math.floor(Math.random() * free.length)];

    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name,
      colour: colour.id,
      connected: true,
      role: null,
      alive: true,
      deathBy: null,
      scans: [],
      lastProtectId: null,
    };
    target.players.push(player);
    // First one aboard runs the game.
    if (!target.hostId) target.hostId = player.id;

    attach(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    broadcast(target);
  });

  socket.on('rejoin', (payload = {}, ack) => {
    const target = rooms.get(String(payload.code || '').toUpperCase());
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayer(target, payload.playerId);
    if (!player) return ack?.({ error: 'You are not on this crew.' });

    player.connected = true;
    player.socketId = socket.id;
    attach(target);
    reassignHost(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    broadcast(target);
  });

  socket.on('pick_colour', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'Colours are locked once the game starts.' });

    const player = findBySocket(target, socket.id);
    if (!player) return ack?.({ error: 'You are not on this crew.' });

    const colour = colourById(String(payload.colour || ''));
    if (!colour) return ack?.({ error: 'That colour does not exist.' });

    const holder = target.players.find((p) => p.colour === colour.id);
    if (holder && holder.id !== player.id) return ack?.({ error: `${holder.name} has ${colour.name}.` });

    player.colour = colour.id;
    ack?.({ ok: true });
    broadcast(target);
  });

  // --- Night actions --------------------------------------------------------

  socket.on('sab_pick', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.NIGHT_SABOTEURS) return ack?.({ error: 'That window has closed.' });

    const player = findBySocket(target, socket.id);
    if (!player || !player.alive || !isSaboteur(player.role)) return ack?.({ error: 'Not your call.' });

    const mark = findPlayer(target, payload.targetId);
    if (!mark || !mark.alive) return ack?.({ error: 'Pick somebody still breathing.' });
    if (isSaboteur(mark.role)) return ack?.({ error: 'That is one of yours.' });

    target.night.sabPicks.set(player.id, mark.id);
    ack?.({ ok: true });

    // Nothing left to wait for once every living saboteur has named somebody.
    const sabs = livingPlayers(target).filter((p) => isSaboteur(p.role));
    if (sabs.every((p) => target.night.sabPicks.has(p.id))) hurry(target, SETTLE_MS);

    broadcast(target);
  });

  socket.on('scan', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.NIGHT_SENSOR) return ack?.({ error: 'That window has closed.' });

    const player = findBySocket(target, socket.id);
    if (!player || player.id !== target.night.scanBy) return ack?.({ error: 'Not your call.' });
    if (target.night.scanTargetId) return ack?.({ error: 'You have already scanned tonight.' });

    const mark = findPlayer(target, payload.targetId);
    if (!mark || !mark.alive || mark.id === player.id) return ack?.({ error: 'Pick another living crewmate.' });

    // The Mimic is the whole point of the Mimic: a full saboteur whose suit
    // reads clean. The scan reports what the sensor sees, not what is true.
    const reading = mark.role === ROLES.SABOTEUR ? 'saboteur' : 'human';
    target.night.scanTargetId = mark.id;
    player.scans.push({ cycle: target.cycle, name: mark.name, colour: colourById(mark.colour), reading });

    ack?.({ ok: true, reading });
    // Longer than the other windows: there is a result on their screen and
    // they should get to look at it before the ship moves on.
    hurry(target, SCAN_READ_MS);
    broadcast(target);
  });

  socket.on('protect', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.NIGHT_MEDIC) return ack?.({ error: 'That window has closed.' });

    const player = findBySocket(target, socket.id);
    if (!player || player.id !== target.night.protectBy) return ack?.({ error: 'Not your call.' });

    const mark = findPlayer(target, payload.targetId);
    if (!mark || !mark.alive) return ack?.({ error: 'Pick somebody still breathing.' });
    if (player.lastProtectId && mark.id === player.lastProtectId) {
      return ack?.({ error: `You sealed ${mark.name} last night. Someone else tonight.` });
    }

    target.night.protectTargetId = mark.id;
    ack?.({ ok: true });
    hurry(target, SETTLE_MS);
    broadcast(target);
  });

  // --- Day actions ----------------------------------------------------------

  /**
   * A ballot can be cast from the moment the floor opens. The voting phase is
   * not when voting becomes possible — it is the time set aside for the people
   * who have not made up their minds yet, and it ends the moment they have.
   */
  socket.on('cast_vote', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.VOTING && target.phase !== PHASES.DISCUSSION) {
      return ack?.({ error: 'Voting is closed.' });
    }

    const player = findBySocket(target, socket.id);
    if (!player || !player.alive) return ack?.({ error: 'The dead do not vote.' });

    const mark = findPlayer(target, payload.targetId);
    if (!mark || !mark.alive) return ack?.({ error: 'Pick somebody still breathing.' });

    target.votes.set(player.id, mark.id);
    ack?.({ ok: true });

    if (allVotesIn(target)) {
      if (target.phase === PHASES.VOTING) hurry(target, SETTLE_MS);
      else return closeDiscussionEarly(target);
    }

    // Only the count moves; who voted for whom stays sealed until the window
    // shuts, so nobody can watch the room turn on somebody in real time.
    broadcast(target);
  });

  socket.on('revenge_pick', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.REVENGE) return ack?.({ error: 'That moment has passed.' });

    const player = findBySocket(target, socket.id);
    if (!player || player.id !== target.revengeBy?.id) return ack?.({ error: 'Not your call.' });

    const mark = findPlayer(target, payload.targetId);
    if (!mark || !mark.alive) return ack?.({ error: 'Pick somebody still breathing.' });

    clearClock(target);
    resolveRevenge(target, mark.id);
    ack?.({ ok: true });
  });

  // --- Teardown -------------------------------------------------------------

  socket.on('disconnect', () => {
    const target = room();
    if (!target) return;

    target.tvSockets.delete(socket.id);
    // A TV that vanishes mid-sentence must not leave a phase waiting forever.
    if (target.speakers.delete(socket.id) && !target.speakers.size) releaseHold(target);

    const player = findBySocket(target, socket.id);
    if (player) {
      player.connected = false;
      reassignHost(target);
      // A lobby that empties out entirely takes the room with it.
      if (target.phase === PHASES.LOBBY && !target.players.some((p) => p.connected) && !target.tvSockets.size) {
        clearClock(target);
        rooms.delete(target.code);
        return;
      }
      broadcast(target);
    }
  });
});

// Sweep rooms abandoned for an hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [code, target] of rooms) {
    const empty = !target.tvSockets.size && !target.players.some((p) => p.connected);
    if (empty && target.createdAt < cutoff) {
      clearClock(target);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

module.exports.onListen = () => {
  const lan = lanAddress();
  console.log('');
  console.log('  MAYDAY');
  console.log(`  TV screen     http://127.0.0.1:${PORT}${BASE}/tv`);
  console.log(`  Phones        ${lan ? `http://${lan}:${PORT}${BASE}` : `http://127.0.0.1:${PORT}${BASE}`}`);
  console.log('');
};
