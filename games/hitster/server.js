/**
 * Hitster Digital — game server.
 *
 * This process is the referee. It owns every song's release year and never
 * transmits one to a phone until the placement has been resolved. The TV tab
 * receives a Spotify track URI so it can play audio, but no metadata it could
 * render, so the room genuinely cannot see the answer early.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

/**
 * `Number(x) || fallback` silently discards an explicit 0 — 0 is falsy, so
 * STEAL_LOCK_MS=0 in .env would quietly become 15000 instead of "no lockout".
 * This only falls back when the variable is genuinely unset or unparseable.
 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const PORT = envInt('PORT', 3000);
const TARGET_CARDS = envInt('TARGET_CARDS', 10);
/** How long the reveal stays up before the game moves itself on. */
const REVEAL_MS = envInt('REVEAL_MS', 5000);
/** "Alex is up" breathing room between the reveal and the next song. */
const INTRO_MS = envInt('INTRO_MS', 3000);
/** Dead time at the start of a song where nobody may steal. */
const STEAL_LOCK_MS = envInt('STEAL_LOCK_MS', 10000);
/** How long a stealer gets to pick both answers once they've claimed. */
const STEAL_ANSWER_MS = envInt('STEAL_ANSWER_MS', 6000);
/**
 * How long the steal verdict owns the room. This is a real phase rather than a
 * TV-only animation: if play resumed the instant the answer landed, the placer
 * could commit a card while the verdict was still on screen, and the reveal
 * that followed would be cut short by a timer that had already been running.
 */
const VERDICT_MS = envInt('VERDICT_MS', 2800);
/**
 * Extra songs required beyond the player count before a game may start. Kept
 * generous by default so a real game has variety; the discard pile recycling
 * wrong guesses means it's no longer load-bearing for "won't the game just
 * end abruptly", so it's fine to loosen for a small custom set — or a test.
 */
const MIN_DECK_BUFFER = envInt('MIN_DECK_BUFFER', 8);
/**
 * Overridable so a test run can point at a throwaway pool and never touch the
 * resolved one. Resolving takes a while and losing it is genuinely costly.
 */
const SONGS_PATH = process.env.SONGS_FILE
  ? path.resolve(__dirname, process.env.SONGS_FILE)
  : path.join(__dirname, 'songs.json');
const BACKUP_PATH = `${SONGS_PATH.replace(/\.json$/, '')}.backup.json`;
// Overridable for the same reason as SONGS_PATH — lets a test point at a tiny
// throwaway catalog instead of exercising the real one.
const CATALOG_PATH = process.env.CATALOG_FILE
  ? path.resolve(__dirname, process.env.CATALOG_FILE)
  : path.join(__dirname, 'song-catalog.json');
const SETS_PATH = path.join(__dirname, 'sets.json');

// The app, HTTP server and Socket.io instance are the site's, not this game's
// — see lib/host.js. Everything below registers onto them exactly as it did
// when this file stood alone.
const { app, server, io } = require('../../lib/host');
const joinCodes = require('../../lib/join');
const popExpansion = require('./pop-expansion');

/** Where this game's pages live on the site. */
const BASE = require('../registry').find((game) => game.id === 'hitster').basePath;

app.use(express.json({ limit: '2mb' }));
// Stays at the site root. Every page in public/ asks for its assets with a
// root-absolute path (/theme.css, /tv.js, /socket.io/socket.io.js), so this
// game's pages work from /hitster without a single markup change. The cost is
// that public/ owns those names at the root — a later game should keep its
// assets inside its own folder rather than adding a second root mount.
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Song pool
// ---------------------------------------------------------------------------

let songPool = [];

/** Spotify track URIs are the literal prefix plus a 22-character base62 id. */
const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;

/**
 * Sets are independent playlists, not filters that narrow each other. A song is
 * dealt if it belongs to ANY set that is switched on, so turning on Pop and
 * 2000s gives you all the pop plus all the 2000s rather than the sliver where
 * they overlap. That is what makes "64 songs in this set" a number you can
 * actually rely on.
 */
const SETS = [
  { id: 'classic', label: 'Classic', kind: 'special', blurb: 'One song per year, 1960 to 2023' },
  { id: 'pop', label: 'Pop Music', kind: 'genre' },
  { id: 'rock', label: 'Rock', kind: 'genre' },
  { id: 'hiphop', label: 'Hip-hop', kind: 'genre' },
  { id: 'rnb', label: 'R&B / Soul', kind: 'genre' },
  { id: 'country', label: 'Country', kind: 'genre' },
  { id: 'electronic', label: 'Electronic', kind: 'genre' },
  { id: 'sixties-seventies', label: '60s & 70s', kind: 'era', from: 1960, to: 1979 },
  { id: 'eighties-nineties', label: '80s & 90s', kind: 'era', from: 1980, to: 1999 },
  { id: 'two-thousands', label: '2000s', kind: 'era', from: 2000, to: 2009 },
  { id: 'modern', label: '2010 to now', kind: 'era', from: 2010, to: 9999 },
];

const SET_IDS = SETS.map((set) => set.id);

function inSet(song, setId) {
  const set = SETS.find((s) => s.id === setId);
  if (!set) return false;
  if (set.kind === 'special') return song.classic === true;
  if (set.kind === 'genre') return song.genre === set.id;
  return song.year >= set.from && song.year <= set.to;
}

/**
 * song-catalog.json is the curated list of what songs exist; songs.json holds
 * the Spotify ids the resolver found. Merging on read means the catalog can
 * grow without throwing away work already done by /resolve.
 */
function loadSongs() {
  let resolved = [];
  try {
    resolved = JSON.parse(fs.readFileSync(SONGS_PATH, 'utf8'));
  } catch {
    resolved = [];
  }

  let catalog = [];
  try {
    catalog = [...JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')), ...popExpansion];
  } catch (err) {
    console.error('Could not read song-catalog.json:', err.message);
    // With no catalog, fall back to whatever songs.json already had.
    songPool = resolved;
    return;
  }

  const key = (song) => `${song.title}|${song.artist}`.toLowerCase();
  const seenCatalogEntries = new Set();
  const uniqueCatalog = catalog.filter((entry) => {
    const entryKey = key(entry);
    if (seenCatalogEntries.has(entryKey)) return false;
    seenCatalogEntries.add(entryKey);
    return true;
  });
  const known = new Map(resolved.map((song) => [key(song), song]));

  songPool = uniqueCatalog.map((entry) => {
    const previous = known.get(key(entry));
    return {
      id: previous?.id ?? null,
      albumArt: previous?.albumArt ?? null,
      title: entry.title,
      artist: entry.artist,
      year: entry.year,
      genre: entry.genre,
      classic: entry.classic === true,
    };
  });
}

/** Songs the resolver has matched to a real Spotify track. */
function playableSongs() {
  return songPool.filter((song) => TRACK_URI.test(song.id || ''));
}

// --- Sets -------------------------------------------------------------------

/** Classic alone is a sane default: one song per year, the widest possible spread. */
let activeSets = ['classic'];

function loadSets() {
  try {
    const saved = JSON.parse(fs.readFileSync(SETS_PATH, 'utf8'));
    const picked = (saved.sets || []).filter((id) => SET_IDS.includes(id));
    // Never let a saved file leave the game with nothing to play.
    activeSets = picked.length ? picked : ['classic'];
  } catch {
    activeSets = ['classic'];
  }
}

/** Resolved songs belonging to at least one switched-on set. */
function activeSongs() {
  return playableSongs().filter((song) => activeSets.some((id) => inSet(song, id)));
}

/**
 * The switched-on sets, named. Small enough to ride along with every state
 * broadcast, which is what keeps the TV's label honest the moment someone
 * changes the selection from anywhere.
 */
function activeSetSummary() {
  return {
    active: SETS.filter((set) => activeSets.includes(set.id)).map(({ id, label }) => ({ id, label })),
    total: activeSongs().length,
  };
}

/** What each set is worth on its own, so the toggles can show real numbers. */
function setCounts() {
  const resolved = playableSongs();
  return Object.fromEntries(
    SETS.map((set) => [set.id, resolved.filter((song) => inSet(song, set.id)).length]));
}

loadSongs();
loadSets();

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Four-letter codes drawn from record-shop vocabulary, so they're easy to say aloud. */
const CODE_WORDS = [
  'FUNK', 'SOUL', 'JAZZ', 'ROCK', 'BEAT', 'DISC', 'WAVE', 'TUNE', 'VIBE', 'RIFF',
  'BASS', 'DRUM', 'HORN', 'ECHO', 'DUET', 'LOOP', 'FADE', 'HOOK', 'JAMS', 'SKAS',
  'DUBS', 'MIXX', 'TAPE', 'VINL', 'SPIN', 'GROV', 'REVB', 'TONE', 'CHOR', 'SYNC',
];

/** code -> room */
const rooms = new Map();

const PHASES = {
  LOBBY: 'lobby',
  /** "Alex is up, starting in 3" — the card is drawn but nothing plays yet. */
  TURN_INTRO: 'turn_intro',
  PLAYING: 'playing',
  STEAL_CHOOSING: 'steal_choosing',
  /** The result is on screen and nobody acts until it has been seen. */
  STEAL_VERDICT: 'steal_verdict',
  STEAL_PLACING: 'steal_placing',
  REVEALING: 'revealing',
  GAME_OVER: 'game_over',
};

/*
 * Codes are checked against the whole site, not just this game's rooms. Every
 * QR on the site now encodes /j/CODE and is forwarded on the code alone, so two
 * games holding the same four letters at once would send half a room to the
 * wrong game — and the vocabularies genuinely collide: TONE and GOLD are in
 * Hues & Cues' list too. See lib/join.js.
 */
function newCode() {
  const free = CODE_WORDS.filter((word) => !rooms.has(word) && joinCodes.isFree(word));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  let code;
  do {
    code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  } while (rooms.has(code) || !joinCodes.isFree(code));
  return code;
}

/**
 * Take a room out of play and give its code back to the site, so a later game
 * can be handed those four letters again. Every path that ends a room goes
 * through here rather than calling rooms.delete directly — a code still
 * claimed by a room that no longer exists is a code nobody can ever reuse.
 */
function dropRoom(code) {
  rooms.delete(code);
  joinCodes.release(code);
}

function createRoom() {
  const code = newCode();
  const room = {
    code,
    players: [],
    hostId: null,
    tvSockets: new Set(),
    spotifyReady: false,
    phase: PHASES.LOBBY,
    round: 0,
    currentPlayerIndex: 0,
    /** The song in play. Never leaves this object until a reveal. */
    currentCard: null,
    /** Who is placing right now — normally the current player, or a successful stealer. */
    placerId: null,
    /**
     * The songs this game was dealt from, snapshotted at start. Kept separate
     * from the deck so a cycle can be rebuilt from the real pool rather than
     * from whatever happens to be lying in the discard pile, and so switching
     * sets mid-game cannot change what a running game is drawing from.
     */
    pool: [],
    deck: [],
    deckIndex: 0,
    /** Wrong guesses land here, and only come back once the pool is exhausted. */
    discardPile: [],
    /**
     * Song ids already dealt in the current pass through the pool. This is what
     * enforces "every song plays once before any song plays twice" — the deck
     * order alone cannot, because cards re-enter the deck mid-pass (a skipped
     * song goes back on the bottom) and a card lost to a failed steal returns
     * to circulation from a timeline.
     */
    dealtIds: new Set(),
    /**
     * Set while a steal is in progress. Server-side this also holds the full
     * multiple-choice options and which indices are correct — indices plural,
     * because a record billed to two artists has a right answer for each of
     * them; publicState() strips that down to just who's attempting before it
     * goes over the wire.
     */
    stealClaim: null,
    /** Player ids that already burned their steal on this turn. */
    stealBlocked: new Set(),
    lastReveal: null,
    winner: null,
    /** Set when the TV reports a track that would not play; reveals the skip. */
    playbackFailed: false,
    /** Pending auto-advance out of the reveal. */
    revealTimer: null,
    /** Pending start of playback after the "who's up" intro. */
    introTimer: null,
    /** Fires when a stealer runs out of time to answer. */
    stealTimer: null,
    /** Fires when the verdict has been on screen long enough. */
    verdictTimer: null,
    /** { success, playerName } while the verdict is showing. */
    stealOutcome: null,
    /** When the steal window opens, and when the current answer is due. */
    stealOpensAt: 0,
    stealDeadline: 0,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  joinCodes.claim(code, 'hitster', `${BASE}/play`);
  return room;
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function findPlayerBySocket(room, socketId) {
  return room.players.find((p) => p.socketId === socketId) || null;
}

function currentPlayer(room) {
  return room.players[room.currentPlayerIndex] || null;
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

// ---------------------------------------------------------------------------
// State broadcasting
// ---------------------------------------------------------------------------

/**
 * The only game payload that goes over the wire. Everything here is safe for
 * every device to see; the hidden card is represented purely by whether one
 * exists, until `lastReveal` is populated.
 */
function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    targetCards: TARGET_CARDS,
    revealMs: REVEAL_MS,
    introMs: INTRO_MS,
    stealAnswerMs: STEAL_ANSWER_MS,
    verdictMs: VERDICT_MS,
    stealOutcome: room.stealOutcome,
    // Relative, not absolute: the phone's clock need not agree with the
    // server's, and each client just counts down locally from receipt.
    stealOpensInMs: Math.max(0, room.stealOpensAt - Date.now()),
    stealDeadlineInMs: Math.max(0, room.stealDeadline - Date.now()),
    spotifyReady: room.spotifyReady,
    hostId: room.hostId,
    currentPlayerId: currentPlayer(room)?.id || null,
    placerId: room.placerId,
    // Only the identity of the stealer is public. The options and the correct
    // index are never broadcast — they go to that one socket directly.
    stealClaim: room.stealClaim
      ? { playerId: room.stealClaim.playerId, playerName: room.stealClaim.playerName }
      : null,
    stealBlocked: Array.from(room.stealBlocked),
    // Which music is switched on. Global rather than per-room, but it rides
    // along with the state so every screen can name the set without polling —
    // "which songs am I actually going to hear" is the first thing anyone asks.
    sets: activeSetSummary(),
    playbackFailed: room.playbackFailed,
    winner: room.winner,
    // Includes the discard pile, since those cards are still coming back. The
    // filter matters: a card can sit in the deck behind the cursor and still be
    // spent, so counting raw deck slots would overstate what is genuinely left.
    cardsLeft: room.deck.slice(room.deckIndex).filter((song) => !room.dealtIds.has(song.id)).length
      + room.discardPile.length,
    lastReveal: room.lastReveal,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === room.hostId,
      score: p.timeline.length,
      timeline: p.timeline,
    })),
  };
}

function broadcast(room) {
  io.to(`room:${room.code}`).emit('game_state', publicState(room));
}

function toTv(room, event, payload) {
  for (const socketId of room.tvSockets) io.to(socketId).emit(event, payload);
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates, Durstenfeld's in-place form, and the bounds are the part worth
 * being sure about: `j` is drawn from [0, i] INCLUSIVE, which is what makes all
 * n! orderings equally likely. Drawing from [0, i) instead — the classic
 * off-by-one — quietly forbids an element from staying put and biases the
 * result. Stopping at i > 0 is not a bug: the last swap would be out[0] with
 * itself. Everything downstream now leans on this being a genuinely uniform
 * shuffle, since it is the only thing deciding song order within a pass.
 */
function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Two classes of separator, because they are not equally trustworthy.
 *
 * GUEST is unambiguous. "feat.", "ft.", "featuring" and a lower-case " x "
 * exist for no other purpose than marking a guest on somebody else's record —
 * no act is called "Drake ft. Rihanna". Whenever one of these appears, both
 * sides are genuinely separate acts.
 *
 * JOINT is not. An ampersand between two names is a coin flip: "Elton John &
 * Kiki Dee" is two solo artists on a duet, but "Hall & Oates", "Simon &
 * Garfunkel", "Sam & Dave", "Dan + Shay", "Eric B. & Rakim" and "Macklemore &
 * Ryan Lewis" are single acts whose name happens to contain one. Nobody has
 * ever been billed as "Oates". Splitting those puts a non-existent artist on
 * screen as an option — worse than not splitting at all, because the string the
 * player is actually looking for is then nowhere on the board.
 *
 * Deliberately absent from both: ', ', ' and ' and '/'. In the real catalogue
 * those only ever turn up inside one act's name — "Earth, Wind & Fire",
 * "Tones and I", "AC/DC".
 *
 * The case classes are hand-written rather than an /i flag on purpose: ' x ' is
 * a collaboration marker only in lower case, and matching ' X ' would tear
 * "Malcolm X Something" in half.
 */
const GUEST_SEPARATOR = /\s+(?:x|[Ff]eaturing|[Ff]eat\.?|[Ff]t\.?)\s+/;
const JOINT_SEPARATOR = /\s+[&+]\s+/;

/**
 * Split a billing into the acts a player could reasonably be expected to name.
 * The point is the steal quiz: a record with two artists has two right answers,
 * and marking one of them wrong is the bit that felt unfair in playtesting.
 *
 * Conservative by design, and the conservatism is asymmetric on purpose. Not
 * splitting a real collaboration costs a little leniency — the full billing is
 * still the answer, and it is also what is printed on the card, so the question
 * behaves exactly as it always did. Splitting a band name shows the room an
 * artist who does not exist and hides the one they are hunting for. So a split
 * only stands where the evidence is good.
 *
 * Two guards rule out the band names an ampersand hides:
 *   · a piece that is a single word — "Hall", "Oates", "Dan", "Shay", "Rakim".
 *     A real co-headliner almost always has a forename and a surname or a
 *     multi-word stage name, and a bare word after an ampersand is nearly
 *     always the second half of one act's name. This guard applies only to the
 *     ambiguous separators; "Drake ft. Rihanna" is two single words and still
 *     obviously two artists.
 *   · a leading "The" after the first slot — "& The Vandellas", "& The Furious
 *     Five", "+ The Machine". That is a backing band, never a co-headliner.
 * Plus a comma anywhere, which means the name is itself a list: "Earth, Wind".
 */
function splitArtists(artist) {
  const whole = String(artist || '').trim();
  if (!whole) return [];

  // Guests first, so "Calvin Harris & Rag'n'Bone Man feat. Somebody" resolves
  // the unambiguous marker before the ambiguous one is considered.
  const guests = whole.split(GUEST_SEPARATOR).map((part) => part.trim());
  const parts = guests.length > 1 ? guests : whole.split(JOINT_SEPARATOR).map((part) => part.trim());
  if (parts.length < 2) return [whole];

  // Only the ambiguous split has to clear the single-word bar.
  const needsTwoWords = guests.length < 2;

  const standalone = parts.every((part, index) => {
    if (part.length < 2) return false;
    if (part.includes(',')) return false;
    if (index > 0 && /^the\b/i.test(part)) return false;
    if (needsTwoWords && !/\s/.test(part)) return false;
    return true;
  });

  return standalone ? [...new Set(parts)] : [whole];
}

/**
 * Six options for a steal question: the real answer plus distinct decoys
 * drawn from the whole catalog. Decoys are just text — they don't need a
 * Spotify match — so the full songPool gives plenty of variety even for a
 * small active set. Returns the shuffled options and where the answers landed,
 * so the caller can keep those secret and only ship the text to the client.
 *
 * `correct` may be several values, for a record credited to more than one
 * artist: each is offered separately and any of them counts. `correctIndex`
 * stays on the return for the single-answer callers (titles) that only ever
 * have one.
 */
function buildChoices(correct, pool, count = 6) {
  // Cap the answers so at least half the board is still wrong — a question
  // where four of six options score is not a question.
  const answers = [...new Set((Array.isArray(correct) ? correct : [correct]).filter(Boolean))]
    .slice(0, Math.max(1, count - 3));
  const decoys = shuffle([...new Set(pool)].filter((value) => !answers.includes(value)))
    .slice(0, count - answers.length);
  /*
   * One shuffle over the combined list, rather than dropping the answers in
   * afterwards: appending them and shuffling only the decoys would leave the
   * right answers sitting together at a predictable end of the board. Note that
   * it is a plain uniform shuffle — forcing the correct answers apart would be
   * worse than leaving them adjacent sometimes, because "the two right answers
   * are never next to each other" is itself a tell a player can learn.
   */
  const options = shuffle([...answers, ...decoys]);
  const correctIndices = options
    .map((value, index) => (answers.includes(value) ? index : -1))
    .filter((index) => index >= 0);
  return { options, correctIndices, correctIndex: correctIndices[0] };
}

function startGame(room) {
  const playable = activeSongs();
  const needed = room.players.length + MIN_DECK_BUFFER;
  if (playable.length < needed) {
    const total = playableSongs().length;
    return {
      error: total < needed
        ? `Only ${total} songs are matched to Spotify. Open /resolve on the TV to build the pool.`
        : `Your sets only have ${playable.length} matched songs and this game needs ${needed}. Turn on more sets in /resolve, or match more songs.`,
    };
  }

  room.pool = playable;
  room.deck = shuffle(playable);
  room.deckIndex = 0;
  room.discardPile = [];
  room.dealtIds = new Set();
  room.round = 1;
  room.currentPlayerIndex = 0;
  room.winner = null;
  room.lastReveal = null;

  // Everyone opens with one free card, face up. Placing into an empty timeline
  // would be trivially correct, so the first card has to be a gift. Drawn the
  // same way as any other card so the opening hands count towards the pass —
  // otherwise the songs given away here would all come round again as playable
  // cards later, which is exactly the repetition this is meant to stop.
  for (const player of room.players) {
    const opener = drawCard(room);
    player.timeline = opener ? [{ ...opener }] : [];
  }

  startTurn(room);
  return { ok: true };
}

/** Return the same table to setup without discarding its code or players. */
function returnToLobby(room) {
  clearTimers(room);
  room.phase = PHASES.LOBBY;
  room.round = 0;
  room.currentPlayerIndex = 0;
  room.currentCard = null;
  room.placerId = null;
  room.pool = [];
  room.deck = [];
  room.deckIndex = 0;
  room.discardPile = [];
  room.dealtIds = new Set();
  room.stealClaim = null;
  room.stealBlocked = new Set();
  room.stealOutcome = null;
  room.stealOpensAt = 0;
  room.stealDeadline = 0;
  room.lastReveal = null;
  room.winner = null;
  room.playbackFailed = false;
  for (const player of room.players) player.timeline = [];
  toTv(room, 'stop_music', {});
  broadcast(room);
}

/**
 * Begin a fresh pass once the current one has dealt everything it can.
 *
 * What comes back is every song in the pool that is not sitting on a timeline:
 * the discard pile, in other words, plus anything that leaked out of it. Cards
 * already won are deliberately left out — bringing those back would eventually
 * hand a player a song they already hold, and two identical cards on one
 * timeline is a worse bug than hearing a song twice in a long game. It also
 * keeps the "nothing left anywhere" ending reachable, which is how a game on a
 * small set finishes at all.
 */
function recycleDeck(room) {
  const held = new Set();
  for (const player of room.players) {
    for (const card of player.timeline) held.add(card.id);
  }

  const returning = room.pool.filter((song) => !held.has(song.id));
  if (!returning.length) return false;

  room.deck = shuffle(returning);
  room.deckIndex = 0;
  room.discardPile = [];
  room.dealtIds = new Set();
  return true;
}

/**
 * The next song nobody has heard this pass, or null when the game has genuinely
 * run out of music.
 *
 * The skip is the load-bearing bit. A wrongly placed card goes to the discard
 * pile and a failed steal puts a won card back into circulation, and both used
 * to be able to jump the queue the moment the deck ran dry — so a song the room
 * had just heard could return while most of the catalogue had never been
 * played. Now nothing returns until `dealtIds` covers everything still in play.
 */
function drawCard(room) {
  for (let attempt = 0; attempt < 2; attempt++) {
    while (room.deckIndex < room.deck.length) {
      const card = room.deck[room.deckIndex++];
      if (room.dealtIds.has(card.id)) continue;
      room.dealtIds.add(card.id);
      return card;
    }
    if (!recycleDeck(room)) return null;
  }
  // Only reachable if a freshly recycled deck somehow held nothing drawable,
  // which would mean recycleDeck handed back cards it had just marked spent.
  return null;
}

/**
 * Put a card back as though it had never been dealt. Used by the skip, where
 * the room never really heard the song, so it should not count against the
 * pass — without clearing the id, drawCard would step straight over it forever.
 */
function returnUndealt(room, card) {
  if (!card) return;
  room.dealtIds.delete(card.id);
  room.deck.push(card);
}

/** Every pending timer for a room, cleared together so none fires late. */
function clearTimers(room) {
  clearTimeout(room.revealTimer);
  clearTimeout(room.introTimer);
  clearTimeout(room.stealTimer);
  clearTimeout(room.verdictTimer);
  room.revealTimer = null;
  room.introTimer = null;
  room.stealTimer = null;
  room.verdictTimer = null;
}

function startTurn(room) {
  clearTimers(room);

  const card = drawCard(room);
  if (!card) {
    // Every song has either been correctly placed somewhere or is already on a
    // timeline — nothing left anywhere. Whoever is furthest along takes it.
    //
    // Nobody crossed the target here, so this is the one ending that can be a
    // genuine draw. Sorting and taking the first would crown whoever happened
    // to sort highest, and the TV would announce it as a clean win.
    const ranked = room.players.slice().sort((a, b) => b.timeline.length - a.timeline.length);
    const best = ranked[0];
    const level = best ? ranked.filter((p) => p.timeline.length === best.timeline.length) : [];
    room.winner = best
      ? {
        id: best.id,
        name: best.name,
        score: best.timeline.length,
        tiedWith: level.length > 1 ? level.map((p) => p.name) : null,
      }
      : null;
    room.phase = PHASES.GAME_OVER;
    room.currentCard = null;
    // The track from the last turn is still playing by design (see
    // resolvePlacement); the game ending is where that has to stop.
    toTv(room, 'stop_music', {});
    broadcast(room);
    return;
  }

  room.currentCard = card;
  room.placerId = currentPlayer(room)?.id || null;
  room.stealClaim = null;
  room.stealOutcome = null;
  room.stealBlocked = new Set();
  room.lastReveal = null;
  room.playbackFailed = false;
  room.stealOpensAt = 0;
  room.stealDeadline = 0;

  // Announce who's up before any audio, so the room can look up and register
  // whose turn it is instead of the next song just appearing.
  room.phase = PHASES.TURN_INTRO;
  broadcast(room);

  clearTimeout(room.introTimer);
  room.introTimer = setTimeout(() => beginPlayback(room), INTRO_MS);
}

function beginPlayback(room) {
  if (room.phase !== PHASES.TURN_INTRO || !room.currentCard) return;

  room.phase = PHASES.PLAYING;
  // The steal window opens partway in, so nobody can win on the first note.
  room.stealOpensAt = Date.now() + STEAL_LOCK_MS;

  broadcast(room);
  toTv(room, 'song_started', { spotifyUri: room.currentCard.id });
}

/**
 * Penalty for a failed steal: one card off the player's timeline, chosen at
 * random, back into circulation via the discard pile.
 *
 * Returns the card that was taken, or null if they had nothing to lose — a
 * player on zero cards is not put into debt, they simply get away with it.
 */
function takeRandomCard(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.timeline.length === 0) return null;

  const index = Math.floor(Math.random() * player.timeline.length);
  const [card] = player.timeline.splice(index, 1);
  room.discardPile.push(card);
  return { title: card.title, artist: card.artist, year: card.year };
}

/**
 * Settle a steal, whether the answer came in or the clock ran out.
 *
 * The result gets its own phase for a couple of seconds. Handing the turn
 * straight back would let the placer commit a card while the verdict was still
 * up on the TV, and the reveal that followed would then be racing a timer that
 * had already been running — which is how a turn could appear to end seconds
 * after it resumed.
 */
function resolveSteal(room, correct) {
  const claim = room.stealClaim;
  if (!claim) return;

  clearTimeout(room.stealTimer);
  room.stealTimer = null;
  room.stealDeadline = 0;

  // A missed steal costs a card. Taken here rather than in finishSteal() so the
  // timeline visibly loses it while the verdict is still on screen, instead of
  // a card quietly vanishing once play has already resumed.
  const lostCard = correct ? null : takeRandomCard(room, claim.playerId);

  room.stealOutcome = { success: correct, playerName: claim.playerName, lostCard };
  room.phase = PHASES.STEAL_VERDICT;

  toTv(room, 'steal_result', { success: correct, playerName: claim.playerName, lostCard });
  broadcast(room);

  clearTimeout(room.verdictTimer);
  room.verdictTimer = setTimeout(() => finishSteal(room, correct), VERDICT_MS);
}

/** Hand the turn back once the verdict has been seen, and restart the song. */
function finishSteal(room, correct) {
  if (room.phase !== PHASES.STEAL_VERDICT) return;
  const claim = room.stealClaim;
  if (!claim) return;

  if (correct) {
    // The stealer takes over the turn and now has to place the card themselves.
    room.placerId = claim.playerId;
    room.phase = PHASES.STEAL_PLACING;
  } else {
    room.stealBlocked.add(claim.playerId);
    room.phase = PHASES.PLAYING;
  }

  room.stealClaim = null;
  room.stealOutcome = null;

  // The TV leaves the track running through the steal verdict. Its phase
  // render restores the user's volume when this result is shown.
  broadcast(room);
}

function isCorrectPlacement(timeline, year, gapIndex) {
  const before = timeline[gapIndex - 1];
  const after = timeline[gapIndex];
  if (before && year < before.year) return false;
  if (after && year > after.year) return false;
  return true;
}

function resolvePlacement(room, player, gapIndex) {
  const card = room.currentCard;
  const correct = isCorrectPlacement(player.timeline, card.year, gapIndex);

  if (correct) {
    player.timeline.splice(gapIndex, 0, { ...card });
    player.timeline.sort((a, b) => a.year - b.year);
  } else {
    // Doesn't vanish — it's back in circulation once the deck runs dry.
    room.discardPile.push(card);
  }

  // Read the phase, not stealClaim: the claim is cleared when the verdict ends,
  // which is before a successful stealer ever gets to place.
  const wasSteal = room.phase === PHASES.STEAL_PLACING;

  room.phase = PHASES.REVEALING;
  room.lastReveal = {
    card: { title: card.title, artist: card.artist, year: card.year, albumArt: card.albumArt },
    correct,
    gapIndex,
    placerId: player.id,
    placerName: player.name,
    wasSteal,
  };
  room.currentCard = null;
  room.stealClaim = null;

  if (player.timeline.length >= TARGET_CARDS) {
    room.winner = { id: player.id, name: player.name, score: player.timeline.length };
  }

  broadcast(room);

  /*
   * The track deliberately keeps playing through the reveal and the "who's up
   * next" countdown. Cutting it the instant a card landed dropped the room into
   * REVEAL_MS + INTRO_MS of dead air on every single turn — eight seconds of a
   * party game in silence, which is what playtesters actually complained about.
   * beginPlayback's song_started replaces the track when the next turn starts,
   * so nothing has to be stopped for the handover to be clean.
   *
   * The end of the game is the exception: there is no next song to replace it,
   * so the winning card is where the music genuinely does stop.
   */
  if (room.winner) toTv(room, 'stop_music', {});

  // Nobody should have to tap to keep the game moving. The manual button is
  // still there to cut the wait short; whichever fires first wins, and
  // nextTurn() clears the other.
  clearTimeout(room.revealTimer);
  room.revealTimer = setTimeout(() => {
    if (room.phase === PHASES.REVEALING) nextTurn(room);
  }, REVEAL_MS);
}

function nextTurn(room) {
  clearTimers(room);

  if (room.winner) {
    room.phase = PHASES.GAME_OVER;
    broadcast(room);
    return;
  }

  const startIndex = room.currentPlayerIndex;
  for (let step = 1; step <= room.players.length; step++) {
    const index = (startIndex + step) % room.players.length;
    if (room.players[index].connected) {
      room.currentPlayerIndex = index;
      if (index <= startIndex) room.round += 1;
      startTurn(room);
      return;
    }
  }

  // Nobody is connected. Park the game until someone comes back — and since a
  // track now outlives its own turn, silence the room rather than leaving the
  // last song playing to nobody.
  room.phase = PHASES.LOBBY;
  toTv(room, 'stop_music', {});
  broadcast(room);
}

function reassignHost(room) {
  const host = findPlayer(room, room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  room.hostId = next ? next.id : null;
}

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));

// A room code in the URL means this is somebody joining — almost always from
// the QR code on the TV — so send them to the controller instead of asking
// which screen they are. Older codes pointing at /hitster still work.
app.get(BASE, (req, res, next) => {
  const code = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z]{2,8}$/.test(code)) return next();
  res.redirect(302, `${BASE}/play?room=${encodeURIComponent(code)}`);
});

app.get(BASE, page('start.html'));
app.get(`${BASE}/play`, page('controller.html'));
app.get(`${BASE}/tv`, page('tv.html'));
app.get(`${BASE}/resolve`, page('resolve.html'));
// Stays at the site root: spotify-auth.js builds its redirect_uri from
// location.origin, so moving this would mean re-registering the URI with
// Spotify. Root is a fine home for it — no other game wants /callback.
app.get('/callback', page('callback.html'));

app.get('/api/config', (req, res) => {
  res.json({
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    targetCards: TARGET_CARDS,
    songsTotal: songPool.length,
    songsPlayable: playableSongs().length,
    songsActive: activeSongs().length,
  });
});

app.get('/api/sets', (req, res) => {
  res.json({
    sets: SETS.map(({ id, label, kind, blurb }) => ({ id, label, kind, blurb })),
    active: activeSets,
    counts: setCounts(),
    activeTotal: activeSongs().length,
  });
});

app.post('/api/sets', (req, res) => {
  const picked = (req.body?.sets || []).filter((id) => SET_IDS.includes(id));
  if (!picked.length) return res.status(400).json({ error: 'Leave at least one set switched on.' });

  activeSets = picked;
  try {
    fs.writeFileSync(SETS_PATH, `${JSON.stringify({ sets: activeSets }, null, 2)}\n`);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Every screen showing the set label needs to change with it, wherever the
  // toggle was pressed. A running game keeps the deck it was dealt — this only
  // decides what the next one is built from.
  for (const room of rooms.values()) broadcast(room);

  res.json({
    ok: true,
    active: activeSets,
    activeTotal: activeSongs().length,
    counts: setCounts(),
  });
});

app.get('/api/songs', (req, res) => res.json(songPool));

/**
 * The resolver posts the completed pool back so the running game can use it
 * immediately. Resolving is expensive to redo, so the previous pool is copied
 * aside first — a bad or partial run should never be the only thing left.
 */
app.post('/api/songs', (req, res) => {
  if (!Array.isArray(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Expected a non-empty array of songs.' });
  }
  try {
    /*
     * Only ever back up a pool that came from a real resolve. Album art is the
     * tell: /resolve always returns it alongside the id, so a pool with ids but
     * no art was written by something else. Without this guard a throwaway pool
     * could overwrite the backup and leave no good copy anywhere.
     */
    const current = playableSongs();
    const worthKeeping = current.length && current.some((song) => /i\.scdn\.co/.test(song.albumArt || ''));
    if (worthKeeping) fs.copyFileSync(SONGS_PATH, BACKUP_PATH);
    fs.writeFileSync(SONGS_PATH, `${JSON.stringify(req.body, null, 2)}\n`);

    // The catalogue is the source of truth for year, so a year corrected in the
    // resolver has to land there too — otherwise loadSongs() would put the old
    // one straight back on the next restart.
    const corrected = writeCatalogYears(req.body);

    loadSongs();
    res.json({ ok: true, playable: playableSongs().length, yearsCorrected: corrected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function writeCatalogYears(incoming) {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return 0;
  }

  const key = (song) => `${song.title}|${song.artist}`.toLowerCase();
  const years = new Map(incoming
    .filter((song) => Number.isInteger(song.year))
    .map((song) => [key(song), song.year]));

  let changed = 0;
  for (const entry of catalog) {
    const year = years.get(key(entry));
    if (year && year !== entry.year) {
      entry.year = year;
      changed++;
    }
  }

  if (changed) fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  return changed;
}

/** Put back whatever the last save replaced. */
app.post('/api/songs/restore', (req, res) => {
  if (!fs.existsSync(BACKUP_PATH)) return res.status(404).json({ error: 'No backup to restore.' });
  try {
    fs.copyFileSync(BACKUP_PATH, SONGS_PATH);
    loadSongs();
    res.json({ ok: true, playable: playableSongs().length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
 * Both of these moved to lib/join.js when every game's QR started encoding the
 * site-wide /j/CODE address rather than this game's own join page. A shorter
 * string makes a less dense symbol, which is the entire point: the code is
 * scanned across a room, off a TV, by whoever is sitting furthest from it.
 */
const { lanAddress, joinUrl: joinUrlFor } = joinCodes;

app.get('/api/join-info', async (req, res) => {
  const code = String(req.query.code || '').toUpperCase();
  const url = joinUrlFor(req, code);
  try {
    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 420,
      color: { dark: '#1B2A3F', light: '#FFFFFF' },
    });
    res.json({ url, qr });
  } catch (err) {
    res.json({ url, qr: null });
  }
});

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  /** Set once this socket belongs to a room, so handlers can find it again. */
  let roomCode = null;

  const room = () => (roomCode ? rooms.get(roomCode) || null : null);

  function attach(target) {
    roomCode = target.code;
    socket.join(`room:${target.code}`);
  }

  // --- TV -----------------------------------------------------------------

  socket.on('register_tv', (payload = {}, ack) => {
    const requested = String(payload.code || '').toUpperCase();
    const target = (requested && rooms.get(requested)) || createRoom();
    attach(target);
    target.tvSockets.add(socket.id);
    if (typeof ack === 'function') ack({ ok: true, code: target.code });
    broadcast(target);

    // song_started is a one-shot fired when the turn began. A TV that joins or
    // reloads after that point never saw it, and would sit silent for the rest
    // of the turn — so hand the current track to this socket directly.
    const midTurn = target.phase === PHASES.PLAYING || target.phase === PHASES.STEAL_PLACING;
    if (midTurn && target.currentCard) {
      io.to(socket.id).emit('song_started', { spotifyUri: target.currentCard.id });
    }
  });

  socket.on('spotify_ready', () => {
    const target = room();
    if (!target) return;
    target.spotifyReady = true;
    broadcast(target);
  });

  /**
   * Hitster has no skip. The control only exists to rescue a turn when a track
   * refuses to play, so it stays hidden until the TV reports exactly that.
   */
  socket.on('playback_failed', () => {
    const target = room();
    if (!target || !target.tvSockets.has(socket.id)) return;
    target.playbackFailed = true;
    broadcast(target);
    io.to(`room:${target.code}`).emit('playback_failed', {});
  });

  // --- Joining ------------------------------------------------------------

  socket.on('join_game', (payload = {}, ack) => {
    const name = String(payload.name || '').trim().slice(0, 16);
    if (!name) return ack?.({ error: 'Enter a name to join.' });

    const requested = String(payload.code || '').toUpperCase();
    let target = requested ? rooms.get(requested) : null;

    if (!target && !requested) {
      // No code given: drop into the only game running, if there is exactly one.
      const open = Array.from(rooms.values());
      if (open.length === 1) target = open[0];
    }
    if (!target) return ack?.({ error: requested ? `No game found with code ${requested}.` : 'No game running. Open the TV screen first.' });

    // Returning player, same name — hand them their timeline back.
    const returning = target.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (returning) {
      if (returning.connected) return ack?.({ error: `${name} is already in this game. Pick another name.` });
      returning.connected = true;
      returning.socketId = socket.id;
      attach(target);
      reassignHost(target);
      ack?.({ ok: true, code: target.code, playerId: returning.id });
      broadcast(target);
      return;
    }

    if (target.phase !== PHASES.LOBBY) {
      return ack?.({ error: 'That game is already underway.' });
    }
    if (target.players.length >= 8) {
      return ack?.({ error: 'This game is full (8 players).' });
    }

    const player = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name,
      timeline: [],
      connected: true,
    };
    target.players.push(player);
    if (!target.hostId) target.hostId = player.id;

    attach(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    broadcast(target);
  });

  socket.on('rejoin', (payload = {}, ack) => {
    const target = rooms.get(String(payload.code || '').toUpperCase());
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayer(target, payload.playerId);
    if (!player) return ack?.({ error: 'You are not in that game.' });

    player.connected = true;
    player.socketId = socket.id;
    attach(target);
    reassignHost(target);
    ack?.({ ok: true, code: target.code, playerId: player.id });
    broadcast(target);
  });

  // --- Host controls ------------------------------------------------------

  socket.on('start_game', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayerBySocket(target, socket.id);
    if (!player || player.id !== target.hostId) return ack?.({ error: 'Only the host can start the game.' });
    if (target.phase !== PHASES.LOBBY) return ack?.({ error: 'The game is already running.' });
    if (target.players.length < 2) return ack?.({ error: 'You need at least 2 players.' });

    const result = startGame(target);
    if (result.error) return ack?.({ error: result.error });
    ack?.({ ok: true });
  });

  /** Hand host duties to someone else, on purpose rather than by disconnecting. */
  socket.on('transfer_host', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayerBySocket(target, socket.id);
    if (!player || player.id !== target.hostId) return ack?.({ error: 'Only the host can hand off host.' });

    const next = findPlayer(target, payload.playerId);
    if (!next) return ack?.({ error: 'That player is not in this game.' });
    if (!next.connected) return ack?.({ error: `${next.name} is not connected right now.` });
    if (next.id === target.hostId) return ack?.({ error: `${next.name} is already the host.` });

    target.hostId = next.id;
    broadcast(target);
    ack?.({ ok: true });
  });

  socket.on('skip_song', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayerBySocket(target, socket.id);
    if (!player || player.id !== target.hostId) return ack?.({ error: 'Only the host can skip.' });
    if (target.phase !== PHASES.PLAYING && target.phase !== PHASES.STEAL_CHOOSING) {
      return ack?.({ error: 'Nothing is playing to skip.' });
    }

    // Put the skipped song back at the bottom rather than burning it. It goes
    // back as undealt: nobody heard it, so it should still get its turn in this
    // pass instead of being counted as spent.
    returnUndealt(target, target.currentCard);
    target.stealClaim = null;
    target.stealOutcome = null;
    target.stealBlocked = new Set();
    startTurn(target);
    ack?.({ ok: true });
  });

  /**
   * Abandon this room and open a fresh one. Available to the host and to the
   * TV, so a wedged game can be cleared from whichever surface is to hand.
   * Everyone lands back on the join screen with the new code.
   */
  socket.on('new_room', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });

    const isTv = target.tvSockets.has(socket.id);
    const player = findPlayerBySocket(target, socket.id);
    if (!isTv && (!player || player.id !== target.hostId)) {
      return ack?.({ error: 'Only the host or the TV can open a new room.' });
    }

    const fresh = createRoom();
    clearTimers(target);
    toTv(target, 'stop_music', {});
    io.to(`room:${target.code}`).emit('room_closed', { code: fresh.code });
    dropRoom(target.code);

    ack?.({ ok: true, code: fresh.code });
  });

  /** Same room, same code, same people — just clear the finished game. */
  socket.on('return_to_lobby', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayerBySocket(target, socket.id);
    if (!player || player.id !== target.hostId) return ack?.({ error: 'Only the host can return everyone to the lobby.' });
    if (target.phase !== PHASES.GAME_OVER) return ack?.({ error: 'Finish the current game first.' });
    returnToLobby(target);
    ack?.({ ok: true });
  });

  // --- Turn actions -------------------------------------------------------

  socket.on('place_card', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    const player = findPlayerBySocket(target, socket.id);
    if (!player) return ack?.({ error: 'You are not in this game.' });
    if (target.phase !== PHASES.PLAYING && target.phase !== PHASES.STEAL_PLACING) {
      return ack?.({ error: 'Too late — that turn is over.' });
    }
    if (player.id !== target.placerId) return ack?.({ error: 'It is not your turn.' });

    const gapIndex = Number(payload.gapIndex);
    if (!Number.isInteger(gapIndex) || gapIndex < 0 || gapIndex > player.timeline.length) {
      return ack?.({ error: 'That slot does not exist.' });
    }

    resolvePlacement(target, player, gapIndex);
    ack?.({ ok: true });
  });

  socket.on('attempt_steal', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.PLAYING) return ack?.({ error: 'The steal window is closed.' });

    const player = findPlayerBySocket(target, socket.id);
    if (!player) return ack?.({ error: 'You are not in this game.' });
    if (player.id === target.placerId) return ack?.({ error: 'You cannot steal on your own turn.' });
    if (target.stealBlocked.has(player.id)) return ack?.({ error: 'You already used your steal this turn.' });
    if (target.stealClaim) return ack?.({ error: 'Someone beat you to it.' });

    const waitMs = target.stealOpensAt - Date.now();
    if (waitMs > 0) {
      return ack?.({ error: `Hold on — ${Math.ceil(waitMs / 1000)}s until stealing opens.` });
    }

    const card = target.currentCard;
    const titles = buildChoices(card.title, songPool.map((s) => s.title));
    /*
     * A record billed to two acts asks an unfair question if only one of them
     * scores, so both go on the board and either one wins it. The decoys are
     * split the same way, so the options are all single acts and nothing on
     * screen half-contains the answer — offering "Macklemore" against a decoy
     * of "Macklemore & Ryan Lewis" would be a trick, not a question.
     *
     * Only the quiz splits the billing. The reveal and the timeline card still
     * carry card.artist verbatim, because that is what the record says.
     */
    const artists = buildChoices(
      splitArtists(card.artist),
      songPool.flatMap((s) => splitArtists(s.artist)));

    target.stealClaim = {
      playerId: player.id,
      playerName: player.name,
      titleOptions: titles.options,
      correctTitleIndex: titles.correctIndex,
      artistOptions: artists.options,
      correctArtistIndices: artists.correctIndices,
    };
    target.phase = PHASES.STEAL_CHOOSING;
    target.stealDeadline = Date.now() + STEAL_ANSWER_MS;

    // Running out of time is the same outcome as answering wrong, so the
    // room can never be left waiting on someone who froze.
    clearTimeout(target.stealTimer);
    target.stealTimer = setTimeout(() => {
      if (target.phase === PHASES.STEAL_CHOOSING) resolveSteal(target, false);
    }, STEAL_ANSWER_MS);

    // Keep the song running while the stealer answers. The TV ducks it from
    // the phase broadcast so the countdown remains audible without creating a
    // dead-air hole in the round.
    broadcast(target);
    toTv(target, 'steal_attempt', { playerName: player.name, answerMs: STEAL_ANSWER_MS });
    // The options — and which one is right — go only to the stealer's socket.
    io.to(socket.id).emit('steal_choices', { titleOptions: titles.options, artistOptions: artists.options });
    ack?.({ ok: true });
  });

  socket.on('submit_steal_answer', (payload = {}, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    if (target.phase !== PHASES.STEAL_CHOOSING || !target.stealClaim) {
      return ack?.({ error: 'That steal has already been settled.' });
    }

    const claim = target.stealClaim;
    const player = findPlayerBySocket(target, socket.id);
    if (!player || player.id !== claim.playerId) return ack?.({ error: 'This is not your steal to answer.' });

    // Membership, not equality: a two-artist record has more than one right
    // answer on the board and any of them takes the steal.
    const correct = payload.titleIndex === claim.correctTitleIndex
      && claim.correctArtistIndices.includes(payload.artistIndex);
    resolveSteal(target, correct);
    ack?.({ ok: true, correct });
  });

  socket.on('ready_next_turn', (payload, ack) => {
    const target = room();
    if (!target) return ack?.({ error: 'That game has ended.' });
    // The reveal advances itself, so a tap that lands after the timer already
    // fired is expected and simply has nothing to do.
    if (target.phase !== PHASES.REVEALING) return ack?.({ ok: true, alreadyAdvanced: true });

    const player = findPlayerBySocket(target, socket.id);
    // Whoever just placed moves the game on; the host can also unstick it.
    if (!player || (player.id !== target.lastReveal?.placerId && player.id !== target.hostId)) {
      return ack?.({ error: 'Only the player who just went can move things along.' });
    }

    nextTurn(target);
    ack?.({ ok: true });
  });

  // --- Teardown -----------------------------------------------------------

  socket.on('disconnect', () => {
    const target = room();
    if (!target) return;

    target.tvSockets.delete(socket.id);

    const player = findPlayerBySocket(target, socket.id);
    if (player) {
      player.connected = false;
      reassignHost(target);

      // A stealer who vanishes mid-choice would otherwise leave the room
      // stuck waiting on an answer that's never coming.
      if (target.phase === PHASES.STEAL_CHOOSING && target.stealClaim?.playerId === player.id) {
        resolveSteal(target, false);
      }

      // If the room emptied out during the lobby, drop the room entirely.
      if (target.phase === PHASES.LOBBY && !connectedPlayers(target).length && !target.tvSockets.size) {
        clearTimers(target);
        dropRoom(target.code);
        return;
      }
      broadcast(target);
      return;
    }

    if (!target.tvSockets.size) {
      // A quick reload or a hop over to /resolve disconnects this socket too;
      // give a real reconnect a few seconds before flipping the room back to
      // "waiting for Spotify".
      const code = target.code;
      setTimeout(() => {
        const still = rooms.get(code);
        if (still && !still.tvSockets.size) {
          still.spotifyReady = false;
          broadcast(still);
        }
      }, 4000);
    }
  });
});

// Sweep rooms that have been abandoned for an hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [code, target] of rooms) {
    const empty = !target.tvSockets.size && !connectedPlayers(target).length;
    if (empty && target.createdAt < cutoff) {
      clearTimers(target);
      dropRoom(code);
    }
  }
}, 10 * 60 * 1000);

// The site owns the listen call now (see ../../server.js); this is the same
// startup report, printed once the port is actually open.
module.exports.onListen = () => {
  const lan = lanAddress();
  console.log('');
  console.log('  HITSTER DIGITAL');
  console.log(`  TV screen     http://127.0.0.1:${PORT}${BASE}/tv`);
  console.log(`  Phones        ${lan ? `http://${lan}:${PORT}${BASE}` : `http://127.0.0.1:${PORT}${BASE}`}`);
  const playable = playableSongs();
  console.log(`  Song pool     ${playable.length} of ${songPool.length} matched to Spotify`);
  console.log(`  Active sets   ${activeSongs().length} songs · ${activeSets.join(', ')}`);
  if (!process.env.SPOTIFY_CLIENT_ID) console.log('  ! SPOTIFY_CLIENT_ID is not set — copy .env.example to .env');
  if (!playable.length) console.log(`  ! No songs matched yet — open http://127.0.0.1:${PORT}${BASE}/resolve`);
  // A genuine resolve always brings album art back with the track id. Ids
  // without art mean the pool was written by something other than /resolve,
  // and those ids will not play.
  else if (!playable.some((song) => song.albumArt)) {
    console.log('  ! Track ids present but no album art — this pool did not come from /resolve');
    console.log(`  ! Re-run http://127.0.0.1:${PORT}/resolve, or POST /api/songs/restore for the previous pool`);
  }
  console.log('');
};
