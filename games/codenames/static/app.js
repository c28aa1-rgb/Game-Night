import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import * as rawSfx from "./audio.js";
import { WORD_BANK } from "./words.js";

// The spymaster's phone must never make sound — only the shared board does.
// Wrapping the whole audio module once here means every sfx.playX() call
// site below stays untouched; control functions (mute toggle, unlock) always
// pass through since they aren't playback.
const SFX_CONTROL_FNS = new Set(["toggleMute", "unlockAudio", "onMuteChange", "isMuted"]);
const sfx = new Proxy(rawSfx, {
  get(target, prop) {
    const original = target[prop];

    if (typeof original !== "function" || SFX_CONTROL_FNS.has(prop)) {
      return original;
    }

    return (...args) => {
      if (view.screen === "spymaster") return;
      return original(...args);
    };
  }
});

/* ── Constants ────────────────────────────────────────────── */

const HOST_ROOM_KEY = "codenames-host-room";
const START_NOTICE_KEY = "codenames-start-notice";
const KICK_NOTICE_KEY = "codenames-last-kick";
const LIVE_SITE_URL = "https://codenames-online-40ca1.web.app";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const COLUMNS = 5;
const CARD_COUNT = 25;

// Seat presence. `beforeunload` is not dependable — iOS Safari usually skips
// it, and it never fires on a crash, force-quit, or dropped connection — so a
// seated spymaster also pings, and anyone who can see the room clears seats
// that have gone quiet.
//
// This window is deliberately aggressive, chosen so a closed tab frees its
// seat in about ten seconds. The cost is real and unavoidable: from the
// outside, a closed tab and a backgrounded one are the same thing — both just
// stop pinging — and browsers suspend timers the moment a phone locks. A
// spymaster who sets their phone down between turns WILL lose the seat, and
// at this timeout that happens most turns. reclaimSeat() below is what makes
// it survivable: they take it straight back, silently, the moment they look
// at their phone again, and never see that it happened.
//
// The heartbeat must stay fast enough to fit ~3 pings inside the timeout. If
// only one ping fits, a single dropped write costs someone their seat — so
// these two numbers have to move together, not independently.
const HEARTBEAT_MS = 3000;
const CLAIM_TIMEOUT_MS = 10000;
const REAP_THROTTLE_MS = 2000;

// Both seats empty means nobody is holding the game, so the board deals the
// next round itself and puts the join code back up. Each grace period is
// measured from the moment that becomes true, and any seat filling again
// cancels it — including a phone waking up and silently reclaiming.
//
// The two windows are wildly different on purpose, because what a wipe costs
// is wildly different:
//
//   Finished — the round is over and the result has been read. Resetting
//   costs nothing, so it happens promptly.
//
//   Still in progress — resetting throws away a live game. This has to be
//   long enough that it cannot fire on two spymasters who both happen to put
//   their phones down during one long team discussion. Two minutes of both
//   phones dark, with neither waking to reclaim, is genuinely abandoned; a
//   real pause is nowhere near that, and the first phone to wake cancels it.
//   Without this the board just sits on a half-played game forever, showing
//   no join code, which is the one state the room cannot recover from alone.
const AUTO_NEW_GAME_GRACE_MS = 10000;
const ABANDONED_ROUND_MS = 120000;

// How long the deal waits on the shuffle. Drives the sound, the deck
// animation and the deal offset from one place, so the three cannot drift:
// playShuffle() lays its riffles out against this, and the CSS gets it as
// --dur on the deck. Long enough to read as an actual shuffle — gather, three
// passes, square up — rather than a flash between board states.
const DEAL_LEAD_MS = 2400;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clientId = getClientId();
const hasConfig = !Object.values(firebaseConfig).some((v) => String(v).startsWith("PASTE_YOUR_"));
const app = hasConfig ? initializeApp(firebaseConfig) : null;

// autoDetectLongPolling matters: school and workplace proxies frequently break
// Firestore's default streaming transport, which shows up as multi-second stalls
// between actions. This makes the SDK fall back to long polling automatically.
const db = hasConfig
  ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
  : null;

/* ── Elements ─────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

const screens = {
  home: $("homeScreen"),
  join: $("joinScreen"),
  teams: $("teamScreen"),
  board: $("boardScreen"),
  spymaster: $("spymasterScreen")
};

const el = {
  ambientGrid: $("ambientGrid"),
  hostBoardChoice: $("hostBoardChoice"),
  spymasterChoice: $("spymasterChoice"),
  joinBoardChoice: $("joinBoardChoice"),
  homeMessage: $("homeMessage"),

  joinEyebrow: $("joinEyebrow"),
  joinScreenTitle: $("joinScreenTitle"),
  joinScreenSubtitle: $("joinScreenSubtitle"),
  joinCodeInput: $("joinCodeInput"),
  joinCodeButton: $("joinCodeButton"),
  backToHomeFromJoin: $("backToHomeFromJoin"),
  joinMessage: $("joinMessage"),

  teamScreenLabel: $("teamScreenLabel"),
  redTeamButton: $("redTeamButton"),
  blueTeamButton: $("blueTeamButton"),
  redTeamStatus: $("redTeamStatus"),
  blueTeamStatus: $("blueTeamStatus"),
  confirmTeamButton: $("confirmTeamButton"),
  backToJoinButton: $("backToJoinButton"),
  teamMessage: $("teamMessage"),

  boardTitle: $("boardTitle"),
  boardStatus: $("boardStatus"),
  showQrButton: $("showQrButton"),
  qrOverlay: $("qrOverlay"),
  qrOverlayImage: $("qrOverlayImage"),
  qrOverlayCode: $("qrOverlayCode"),
  closeQrButton: $("closeQrButton"),
  boardNewGameButton: $("boardNewGameButton"),
  backToHomeFromBoard: $("backToHomeFromBoard"),
  soundToggleBoard: $("soundToggleBoard"),
  boardRedOccupancyCard: $("boardRedOccupancyCard"),
  boardBlueOccupancyCard: $("boardBlueOccupancyCard"),
  boardRedOccupancy: $("boardRedOccupancy"),
  boardBlueOccupancy: $("boardBlueOccupancy"),
  boardRedRemaining: $("boardRedRemaining"),
  boardBlueRemaining: $("boardBlueRemaining"),
  boardRedChip: $("boardRedChip"),
  boardBlueChip: $("boardBlueChip"),
  boardWaiting: $("boardWaiting"),
  boardWaitingMessage: $("boardWaitingMessage"),
  board: $("board"),
  resultBanner: $("resultBanner"),
  resultBannerText: $("resultBannerText"),
  linkState: $("linkState"),
  linkStateText: $("linkStateText"),

  spymasterTitle: $("spymasterTitle"),
  spymasterRole: $("spymasterRole"),
  spymasterStatus: $("spymasterStatus"),
  spyRedOccupancy: $("spyRedOccupancy"),
  spyBlueOccupancy: $("spyBlueOccupancy"),
  startGameButton: $("startGameButton"),
  leaveTeamButton: $("leaveTeamButton"),
  keyTabButton: $("keyTabButton"),
  boardTabButton: $("boardTabButton"),
  listTabButton: $("listTabButton"),
  keyTabPanel: $("keyTabPanel"),
  boardTabPanel: $("boardTabPanel"),
  listTabPanel: $("listTabPanel"),
  spymasterBoard: $("spymasterBoard"),
  spymasterPublicBoard: $("spymasterPublicBoard"),
  spymasterListView: $("spymasterListView"),

  cardActionMenu: $("cardActionMenu"),
  revealCardButton: $("revealCardButton"),
  newCardButton: $("newCardButton"),
  closeCardMenuButton: $("closeCardMenuButton"),

  hostKickMenu: $("hostKickMenu"),
  kickCluegiverButton: $("kickCluegiverButton"),
  closeHostKickMenuButton: $("closeHostKickMenuButton"),

  startTeamOverlay: $("startTeamOverlay"),
  startTeamText: $("startTeamText"),
  dismissStartTeamButton: $("dismissStartTeamButton"),

  fxLayer: $("fxLayer")
};

/* ── State ────────────────────────────────────────────────── */

let unsubscribeRoom = null;

const view = {
  screen: "home",
  roomCode: "",
  mode: "",
  joinMode: "spymaster",
  selectedTeam: "",
  pendingTeam: "",
  room: null,
  tab: "key",
  menuIndex: null,
  menuHost: null,
  kickTeam: ""
};

// Tracks what this device has already animated, so a snapshot never replays
// an animation the player has already seen.
const anim = {
  boardVersion: -1,
  primed: false,
  seen: new Set(),
  dealt: false,
  exposed: false
};

// The assassin's execution runs on its own clock, ahead of the room state.
// Firestore says "assassin found" the instant the card is tapped, but the
// player should learn it from the three shots, not from the banner — so the
// sequence holds both the card's turn and the result back until its own beats
// land. Every snapshot that arrives mid-sequence has to respect the hold,
// which is why these are read during render rather than being pure animation.
const execution = {
  index: null,
  holdReveal: false,
  holdResult: false,
  timers: []
};

function clearExecution() {
  execution.timers.forEach((t) => window.clearTimeout(t));
  execution.timers = [];
  execution.index = null;
  execution.holdReveal = false;
  execution.holdResult = false;
}

function afterExecution(ms, fn) {
  execution.timers.push(window.setTimeout(fn, ms));
}

// One built DOM tree per mount point, reused across snapshots.
const boardViews = new Map();
const counters = new WeakMap();
let ambientTimer = null;
let layoutQueued = false;
let heartbeatTimer = null;
let presenceTimer = null;
let lastReapAt = 0;
let autoNewGameArmedAt = 0;
let autoNewGameArmedMode = "";
let autoNewGameInFlight = false;
// The last-agent sting fires once on the way down to one, never on a loop —
// these remember which sides have already had it on this board.
const lastAgentStung = { red: false, blue: false };

/**
 * How many of one side's own cards have come up in a row.
 *
 * This is the closest thing to turn tracking the app can honestly do. It
 * never asks whose turn it is — it only counts consecutive reveals of the
 * same colour, which is what a team guessing correctly several times looks
 * like from the outside. Any other card ends the run, which is also exactly
 * what ends a turn, so the two line up without the app having to model
 * passing (which it cannot see).
 *
 * Counted only from reveals this device actually watched: `room.revealed` is
 * a map, and its key order is Firestore's, not the order they were turned
 * over, so a run cannot be reconstructed after the fact. A device joining
 * mid-round simply starts counting from the next card — and since only the
 * board makes sound, that divergence is never audible anywhere.
 */
const streak = { team: "", count: 0 };

/** Advances or breaks the run, and returns the length to sound out. */
function trackStreak(owner) {
  if (owner !== "red" && owner !== "blue") {
    streak.team = "";
    streak.count = 0;
    return 0;
  }

  if (streak.team === owner) {
    streak.count += 1;
  } else {
    streak.team = owner;
    streak.count = 1;
  }

  return streak.count;
}
// `null` until the first snapshot, so joining a room that is already full
// doesn't chime as if the seat had just been taken in front of you.
let prevBothSeated = null;
// Which board version the QR has already reacted to, kept separate from
// anim.boardVersion so a re-deal drives both independently.
let qrBoardVersion = -1;

/* ── Boot ─────────────────────────────────────────────────── */

const entryParams = new URLSearchParams(window.location.search);
const entryHash = window.location.hash.replace(/^#/, "").trim();
const hashMatch = entryHash.match(/^(?:spymaster|cluegiver)[:=-]([A-Z0-9]+)$/i);
const entryRoom = (entryParams.get("room") || hashMatch?.[1] || "").trim().toUpperCase();

bindEvents();
buildAmbientGrid();
showScreen("home");

if (!hasConfig) {
  el.homeMessage.textContent = "Add your Firebase keys to firebase-config.js before creating rooms.";
} else if (entryRoom) {
  prepareJoin("spymaster");
  el.joinCodeInput.value = entryRoom;
  openRoom();
} else if (sessionStorage.getItem(HOST_ROOM_KEY)) {
  // Refreshing the TV mid-game should put the board straight back, not dump
  // the room on the floor.
  resumeHostedBoard(sessionStorage.getItem(HOST_ROOM_KEY));
}

function handleHashRoute() {
  const match = window.location.hash
    .replace(/^#/, "")
    .trim()
    .match(/^(?:spymaster|cluegiver)[:=-]([A-Z0-9]+)$/i);

  const code = match?.[1]?.toUpperCase();

  if (!code || code === view.roomCode) return;

  unsubscribe();
  view.mode = "";
  view.pendingTeam = "";
  prepareJoin("spymaster");
  el.joinCodeInput.value = code;
  openRoom();
}

async function resumeHostedBoard(code) {
  try {
    const snap = await getDoc(getRoomRef(code));

    if (!snap.exists() || isExpired(snap.data())) {
      sessionStorage.removeItem(HOST_ROOM_KEY);
      return;
    }

    view.roomCode = code;
    view.mode = "host";
    subscribe(code);
    showScreen("board");
  } catch (error) {
    sessionStorage.removeItem(HOST_ROOM_KEY);
    console.error(error);
  }
}

/* ── Events ───────────────────────────────────────────────── */

function bindEvents() {
  el.hostBoardChoice.addEventListener("click", createRoom);
  el.spymasterChoice.addEventListener("click", () => prepareJoin("spymaster"));
  el.joinBoardChoice.addEventListener("click", () => prepareJoin("board"));

  el.joinCodeInput.addEventListener("input", () => {
    el.joinCodeInput.value = el.joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  });
  el.joinCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openRoom();
  });
  el.joinCodeButton.addEventListener("click", openRoom);
  el.backToHomeFromJoin.addEventListener("click", () => showScreen("home"));

  el.redTeamButton.addEventListener("click", () => selectTeam("red"));
  el.blueTeamButton.addEventListener("click", () => selectTeam("blue"));
  el.confirmTeamButton.addEventListener("click", claimTeam);
  el.backToJoinButton.addEventListener("click", () => {
    view.selectedTeam = "";
    el.teamMessage.textContent = "";
    showScreen("join");
  });

  el.boardNewGameButton.addEventListener("click", handleBoardNewGame);
  el.backToHomeFromBoard.addEventListener("click", exitRoom);
  el.showQrButton.addEventListener("click", openQrOverlay);
  el.closeQrButton.addEventListener("click", () => closeQrOverlay());
  el.qrOverlay.addEventListener("click", (e) => {
    if (e.target === el.qrOverlay) closeQrOverlay();
  });
  el.boardRedOccupancyCard.addEventListener("click", (e) => openKickMenu("red", e));
  el.boardBlueOccupancyCard.addEventListener("click", (e) => openKickMenu("blue", e));

  el.startGameButton.addEventListener("click", primaryGameAction);
  el.leaveTeamButton.addEventListener("click", leaveTeam);
  el.keyTabButton.addEventListener("click", () => setTab("key"));
  el.boardTabButton.addEventListener("click", () => setTab("board"));
  el.listTabButton.addEventListener("click", () => setTab("list"));

  el.revealCardButton.addEventListener("click", () => revealCard(view.menuIndex));
  el.newCardButton.addEventListener("click", () => swapWord(view.menuIndex));
  el.closeCardMenuButton.addEventListener("click", closeCardMenu);

  el.kickCluegiverButton.addEventListener("click", kickSpymaster);
  el.closeHostKickMenuButton.addEventListener("click", closeKickMenu);
  el.dismissStartTeamButton.addEventListener("click", dismissStartNotice);

  el.soundToggleBoard.addEventListener("click", () => rawSfx.toggleMute());
  rawSfx.onMuteChange((m) => {
    // The note glyph stays put; the button itself turns maroon to show muting.
    el.soundToggleBoard.setAttribute("aria-pressed", m ? "false" : "true");
    el.soundToggleBoard.classList.toggle("is-muted", m);
    el.soundToggleBoard.title = m ? "Sound off" : "Sound on";
  });

  document.addEventListener("click", handleGlobalPointer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCardMenu();
      closeKickMenu();
      closeQrOverlay();
    }
  });

  // One gesture is all the browser needs to let us make sound.
  ["pointerdown", "keydown"].forEach((evt) => {
    window.addEventListener(evt, sfx.unlockAudio, { once: true });
  });

  // Following a room link while already in a room only changes the hash — the
  // page never reloads — so route it by hand or the player just sits in the
  // old room wondering why nothing happened.
  window.addEventListener("hashchange", handleHashRoute);
  window.addEventListener("resize", scheduleLayout, { passive: true });
  // Timers stall in background tabs, so re-announce the moment we're back —
  // and sweep straight away too, since our own sweep timer was stalled for
  // exactly as long and a seat may have gone stale while we weren't looking.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;

    sendHeartbeat();

    const room = view.room;
    if (!room) return;

    reapStaleClaims(room);

    // Coming back is exactly when we are most likely to have been swept, so
    // take the seat back here rather than waiting for the next snapshot to
    // happen along — there may not be one, since nothing else is writing.
    if (view.mode === "spymaster" && view.selectedTeam
      && !claimedTeam(room) && !room.occupancy?.[view.selectedTeam]) {
      reclaimSeat(view.selectedTeam);
    }
  });

  // Best-effort only, on both events: `pagehide` fires in cases `beforeunload`
  // does not (iOS Safari especially), but neither is guaranteed to flush the
  // write before the page dies, and neither fires at all on a crash or a
  // dropped connection. The sweep above is what actually frees the seat; this
  // just makes the common case immediate instead of waiting out the timeout.
  const release = () => {
    if (view.mode === "spymaster") releaseClaim().catch(() => {});
  };

  window.addEventListener("beforeunload", release);
  window.addEventListener("pagehide", release);
}

/* ── Room lifecycle ───────────────────────────────────────── */

async function createRoom() {
  if (!requireDb(el.homeMessage)) return;

  sfx.playUi();
  el.homeMessage.textContent = "Opening a room…";

  try {
    const code = await generateRoomCode();
    await setDoc(getRoomRef(code), buildRoom(code));

    sessionStorage.setItem(HOST_ROOM_KEY, code);
    view.roomCode = code;
    view.mode = "host";
    view.room = null;
    resetAnim(-1);
    el.homeMessage.textContent = "";
    subscribe(code);
    showScreen("board");
    sfx.playJoin();
  } catch (error) {
    el.homeMessage.textContent = friendlyError(error, "Could not open a room.");
    console.error(error);
  }
}

function prepareJoin(mode) {
  sfx.playUi();
  view.joinMode = mode;
  view.roomCode = "";
  view.mode = "";
  view.selectedTeam = "";
  el.joinCodeInput.value = "";
  el.joinMessage.textContent = "";

  const spy = mode === "spymaster";
  el.joinEyebrow.textContent = spy ? "Spymaster" : "Second screen";
  el.joinScreenTitle.textContent = spy ? "Enter the room code" : "Open an existing board";
  el.joinScreenSubtitle.textContent = spy
    ? "Four characters, shown on the board screen."
    : "Mirrors the public board. No key, no controls.";
  el.joinCodeButton.textContent = spy ? "Open room" : "Open board";

  showScreen("join");
  el.joinCodeInput.focus();
}

async function openRoom() {
  if (!requireDb(el.joinMessage)) return;

  const code = el.joinCodeInput.value.trim();

  if (!code) {
    el.joinMessage.textContent = "Enter a room code first.";
    sfx.playError();
    return;
  }

  el.joinMessage.textContent = "Connecting…";

  try {
    const snap = await getDoc(getRoomRef(code));

    if (!snap.exists()) {
      el.joinMessage.textContent = "No room with that code.";
      sfx.playError();
      return;
    }

    if (isExpired(snap.data())) {
      el.joinMessage.textContent = "That room has expired.";
      deleteDoc(getRoomRef(code)).catch(() => {});
      sfx.playError();
      return;
    }

    view.roomCode = code;
    view.selectedTeam = "";
    // Drop the previous room before listening to a new one, so a stale board
    // can never drive a render between here and the first snapshot.
    view.room = null;
    resetAnim(-1);
    el.joinMessage.textContent = "";
    subscribe(code);

    if (view.joinMode === "board") {
      view.mode = "board";
      showScreen("board");
    } else {
      showScreen("teams");
    }

    sfx.playJoin();
  } catch (error) {
    el.joinMessage.textContent = friendlyError(error, "Could not reach that room.");
    console.error(error);
  }
}

function subscribe(code) {
  unsubscribe();
  startPresenceSweep();

  unsubscribeRoom = onSnapshot(
    getRoomRef(code),
    { includeMetadataChanges: true },
    (snap) => {
      setLinkState(snap.metadata);

      if (!snap.exists()) {
        // A local-cache miss right after creating a room is not a closed room.
        if (snap.metadata.fromCache) return;

        unsubscribe();
        view.room = null;
        el.homeMessage.textContent = "That room was closed.";
        showScreen("home");
        return;
      }

      const room = snap.data();

      if (isExpired(room)) {
        unsubscribe();
        view.room = null;
        deleteDoc(getRoomRef(code)).catch(() => {});
        el.homeMessage.textContent = "That room has expired.";
        showScreen("home");
        return;
      }

      view.room = room;

      if (handleKick(room)) return;

      render();
    },
    (error) => {
      console.error(error);
      setLinkState({ fromCache: true });
      el.boardStatus.textContent = "Connection lost. Retrying…";
    }
  );
}

function unsubscribe() {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = null;
  stopPresenceSweep();
}

function exitRoom() {
  sfx.playUi();
  unsubscribe();

  if (view.mode === "host") sessionStorage.removeItem(HOST_ROOM_KEY);

  view.roomCode = "";
  view.mode = "";
  view.room = null;
  resetAnim(-1);
  showScreen("home");
}

/* ── Team claim ───────────────────────────────────────────── */

function selectTeam(team) {
  const room = view.room;
  if (!room) return;

  if (room.occupancy?.[team] && room.occupancy[team] !== clientId) {
    el.teamMessage.textContent = `${cap(team)} is taken.`;
    sfx.playError();
    return;
  }

  sfx.playUi();
  view.selectedTeam = team;
  el.teamMessage.textContent = "";
  renderTeams();
}

async function claimTeam() {
  if (!requireDb(el.teamMessage) || !view.selectedTeam) return;

  const team = view.selectedTeam;

  // The snapshot carrying our claim may land after this call resolves, so mark
  // the claim as in flight — otherwise the spymaster screen sees an unclaimed
  // room for one frame and bounces straight back to the team picker.
  view.pendingTeam = team;

  try {
    // Claiming is the one place a transaction earns its cost: two people can
    // race for the same side.
    await runTransaction(db, async (tx) => {
      const ref = getRoomRef(view.roomCode);
      const snap = await tx.get(ref);

      if (!snap.exists()) throw new Error("Room missing");

      const held = snap.data().occupancy?.[team];
      if (held && held !== clientId) throw new Error("Team taken");

      tx.update(ref, {
        [`occupancy.${team}`]: clientId,
        [`heartbeat.${team}`]: Date.now(),
        updatedAtMs: Date.now()
      });
    });

    view.mode = "spymaster";
    el.teamMessage.textContent = "";
    showScreen("spymaster");
    sfx.playJoin();
  } catch (error) {
    view.pendingTeam = "";
    el.teamMessage.textContent =
      error.message === "Team taken" ? `${cap(team)} was just taken.` : friendlyError(error, "Could not take that side.");
    sfx.playError();
  }
}

/**
 * Silently retakes a seat we were swept out of while the seat is still empty.
 *
 * This is the counterweight to the short presence timeout. Because a
 * backgrounded tab is indistinguishable from a closed one, an active
 * spymaster who locks their phone between turns loses the seat — so the seat
 * has to come back on its own the instant they return, with no message and no
 * trip through the team picker. The transaction still refuses if someone
 * genuinely claimed the side in the meantime; losing a race is the one case
 * where the player does need to be told.
 */
async function reclaimSeat(team) {
  if (!db || !view.roomCode || view.pendingTeam) return;

  view.pendingTeam = team;

  try {
    await runTransaction(db, async (tx) => {
      const ref = getRoomRef(view.roomCode);
      const snap = await tx.get(ref);

      if (!snap.exists()) throw new Error("Room missing");

      const held = snap.data().occupancy?.[team];
      if (held && held !== clientId) throw new Error("Team taken");

      tx.update(ref, {
        [`occupancy.${team}`]: clientId,
        [`heartbeat.${team}`]: Date.now(),
        updatedAtMs: Date.now()
      });
    });
  } catch (error) {
    // Let the next render fall through to the team picker and explain there.
    view.pendingTeam = "";
  }
}

async function leaveTeam() {
  sfx.playUi();

  try {
    await releaseClaim();
  } catch (error) {
    console.error(error);
  }

  view.selectedTeam = "";
  view.pendingTeam = "";
  view.mode = "";
  showScreen("teams");
}

/* ── Seat presence ────────────────────────────────────────── */

function startHeartbeat() {
  stopHeartbeat();
  sendHeartbeat();
  heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/** "I'm still here." One tiny field write; no transaction needed. */
async function sendHeartbeat() {
  const room = view.room;
  if (!db || !room || view.mode !== "spymaster") return;

  const team = claimedTeam(room);
  if (!team) return;

  try {
    await updateDoc(getRoomRef(view.roomCode), { [`heartbeat.${team}`]: Date.now() });
  } catch (error) {
    // A missed beat is fine — the next one covers it.
  }
}

/**
 * Drives the sweep on its own clock.
 *
 * The sweep used to run only from render(), which only runs when a Firestore
 * snapshot arrives — and the thing being swept for is a client that has
 * stopped writing. With one spymaster seated, closing their tab stopped the
 * only source of writes to the room, so no snapshot ever landed, render()
 * never ran again, and the seat stayed claimed forever. It appeared to work
 * with two spymasters seated only because the surviving one's heartbeat kept
 * producing the snapshots that incidentally drove the sweep.
 */
function startPresenceSweep() {
  stopPresenceSweep();
  presenceTimer = window.setInterval(() => {
    if (!view.room) return;
    reapStaleClaims(view.room);
    // Has to run on the timer, not only on snapshots, for the same reason the
    // sweep does: an abandoned room is precisely one where nothing is writing,
    // so no snapshot will arrive to notice the grace period has elapsed.
    maybeAutoNewGame(view.room);
  }, REAP_THROTTLE_MS);
}

function stopPresenceSweep() {
  if (presenceTimer) window.clearInterval(presenceTimer);
  presenceTimer = null;
}

/**
 * Frees seats whose occupant has gone silent.
 *
 * Every client subscribed to the room sweeps, with no screen or host gate.
 * Two earlier, narrower versions both left real setups with nobody sweeping:
 * gating on isHost() missed boards opened by typing the room code (hostId
 * belongs to whoever created the room), and adding a board/teams screen check
 * still missed two phones playing with no board open at all. Occupancy is now
 * load-bearing — bothSeated() gates starting a round — so a seat nobody is
 * watching would let a round start against a spymaster who had already gone.
 *
 * Several clients noticing the same dead seat just write the same eviction
 * twice; it is idempotent, and the throttle keeps it cheap.
 */
async function reapStaleClaims(room) {
  if (!db || !view.roomCode || !room) return;

  const now = Date.now();
  if (now - lastReapAt < REAP_THROTTLE_MS) return;

  const mine = claimedTeam(room);
  const updates = {};

  for (const team of ["red", "blue"]) {
    if (!room.occupancy?.[team] || team === mine) continue;

    const beat = Number(room.heartbeat?.[team]) || 0;

    if (!beat) {
      // Seat claimed before heartbeats existed (or mid-claim): start its clock
      // rather than evicting someone who may well be present.
      updates[`heartbeat.${team}`] = now;
      continue;
    }

    if (now - beat > CLAIM_TIMEOUT_MS) {
      updates[`occupancy.${team}`] = "";
      updates[`heartbeat.${team}`] = 0;
    }
  }

  if (!Object.keys(updates).length) return;

  lastReapAt = now;

  try {
    await updateDoc(getRoomRef(view.roomCode), updates);
  } catch (error) {
    // Another client probably got there first.
  }
}

async function releaseClaim() {
  if (!db || !view.roomCode || !view.room) return;

  const updates = { updatedAtMs: Date.now() };

  if (view.room.occupancy?.red === clientId) {
    updates["occupancy.red"] = "";
    updates["heartbeat.red"] = 0;
  }

  if (view.room.occupancy?.blue === clientId) {
    updates["occupancy.blue"] = "";
    updates["heartbeat.blue"] = 0;
  }

  if (Object.keys(updates).length > 1) {
    await updateDoc(getRoomRef(view.roomCode), updates);
  }
}

/* ── Play actions — all immediate, no approvals ───────────── */

async function revealCard(index) {
  const room = view.room;
  if (!db || index === null || !room?.gameStarted || room.gameResult) return;
  if (isRevealed(room, index)) {
    closeCardMenu();
    return;
  }

  closeCardMenu();

  const card = room.cards[index];
  const nextRevealed = { ...(room.revealed || {}), [index]: true };
  const result = evaluateResult(room.cards, nextRevealed);

  const patch = {
    [`revealed.${index}`]: true,
    lastEvent: { kind: "reveal", index, owner: card.owner, nonce: `${Date.now()}-${Math.random()}` },
    updatedAtMs: Date.now()
  };

  if (result) patch.gameResult = result;

  try {
    // No transaction, no serverTimestamp: this write lands in the local cache
    // immediately and the snapshot fires before the network round-trip.
    await updateDoc(getRoomRef(view.roomCode), patch);
  } catch (error) {
    el.spymasterStatus.textContent = friendlyError(error, "Could not reveal that card.");
    sfx.playError();
  }
}

async function swapWord(index) {
  const room = view.room;
  if (!db || index === null || !room?.gameStarted || room.gameResult) return;
  if (isRevealed(room, index)) return;

  closeCardMenu();

  try {
    const { word, usedWords } = pickReplacement(room, index);
    const nextCards = room.cards.map((c, i) => (i === index ? { ...c, word } : c));

    await updateDoc(getRoomRef(view.roomCode), {
      cards: nextCards,
      usedWords,
      lastEvent: { kind: "swap", index, nonce: `${Date.now()}-${Math.random()}` },
      updatedAtMs: Date.now()
    });

    sfx.playFlip();
  } catch (error) {
    el.spymasterStatus.textContent = friendlyError(error, "Could not swap that word.");
    sfx.playError();
  }
}

async function primaryGameAction() {
  const room = view.room;
  if (!room) return;

  sfx.playUi();

  if (room.gameStarted || room.gameResult) {
    await newGame();
  } else {
    await startGame();
  }
}

async function startGame() {
  if (!db || !view.room || view.room.gameStarted) return;

  // The button is already disabled without both seats, but a seat can be swept
  // between the render that enabled it and the tap that follows — and with a
  // 10s presence timeout that gap is not hypothetical.
  if (!bothSeated(view.room)) {
    el.spymasterStatus.textContent = "Both spymasters need to be connected to start.";
    sfx.playError();
    return;
  }

  try {
    await updateDoc(getRoomRef(view.roomCode), {
      gameStarted: true,
      startedAtMs: Date.now(),
      updatedAtMs: Date.now()
    });
  } catch (error) {
    el.spymasterStatus.textContent = friendlyError(error, "Could not start the game.");
    sfx.playError();
  }
}

async function newGame() {
  if (!db || !view.room) return;

  sfx.playUi();

  try {
    await updateDoc(getRoomRef(view.roomCode), {
      ...buildBoard((view.room.boardVersion || 0) + 1, usedWordsOf(view.room)),
      revealed: {},
      gameStarted: false,
      gameResult: null,
      lastEvent: null,
      updatedAtMs: Date.now()
    });
    return true;
  } catch (error) {
    el.boardStatus.textContent = friendlyError(error, "Could not deal a new board.");
    sfx.playError();
    return false;
  }
}

/**
 * The board's own "New game" button. The join code is no longer raised here:
 * syncQrOverlay() puts it up when the new deal lands, which covers this
 * button, the spymaster's New Game, and the automatic deal identically.
 */
async function handleBoardNewGame() {
  await newGame();
}

/**
 * Deals the next round unattended once a finished board has been abandoned.
 *
 * This is what lets the room run on its own: a group finishes, walks away,
 * their seats time out, and the board resets itself and puts the join code
 * back up for whoever wanders over next — nobody has to press anything.
 *
 * The write is a transaction purely to settle who deals. Two boards open on
 * the same room would otherwise both notice the same abandoned game and each
 * deal a different set of cards. Re-reading inside the transaction means the
 * second one sees gameResult already cleared and stands down.
 */
async function maybeAutoNewGame(room) {
  if (!db || view.screen !== "board" || autoNewGameInFlight) return;

  const abandoned = room && !room.occupancy?.red && !room.occupancy?.blue;
  // A dealt-but-unstarted board sitting empty is the normal idle state — the
  // room waiting for players, not a game that needs clearing.
  const mode = !abandoned ? "" : room.gameResult ? "finished" : room.gameStarted ? "in-progress" : "";

  if (!mode) {
    // Somebody is seated, or there is nothing to reset — drop the clock.
    autoNewGameArmedAt = 0;
    autoNewGameArmedMode = "";
    return;
  }

  const now = Date.now();

  // A round finishing while the long clock is already running re-arms it on
  // the short one, rather than leaving a finished board waiting out the rest
  // of an in-progress timer it no longer qualifies for.
  if (!autoNewGameArmedAt || autoNewGameArmedMode !== mode) {
    autoNewGameArmedAt = now;
    autoNewGameArmedMode = mode;
    return;
  }

  const grace = mode === "finished" ? AUTO_NEW_GAME_GRACE_MS : ABANDONED_ROUND_MS;
  if (now - autoNewGameArmedAt < grace) return;

  autoNewGameInFlight = true;

  try {
    await runTransaction(db, async (tx) => {
      const ref = getRoomRef(view.roomCode);
      const snap = await tx.get(ref);

      if (!snap.exists()) throw new Error("Room missing");

      const current = snap.data();

      // Someone sat down in the moment between arming and committing, or
      // another board got here first — in which case the room is already back
      // to a fresh, unstarted board and there is nothing left to clear.
      if (current.occupancy?.red || current.occupancy?.blue) {
        throw new Error("No longer abandoned");
      }

      if (!current.gameResult && !current.gameStarted) {
        throw new Error("Already dealt");
      }

      tx.update(ref, {
        ...buildBoard((current.boardVersion || 0) + 1, usedWordsOf(current)),
        revealed: {},
        gameStarted: false,
        gameResult: null,
        lastEvent: null,
        updatedAtMs: Date.now()
      });
    });
  } catch (error) {
    // Losing the race is the expected outcome for every board but one.
  } finally {
    autoNewGameArmedAt = 0;
    autoNewGameArmedMode = "";
    autoNewGameInFlight = false;
  }
}

async function kickSpymaster() {
  const team = view.kickTeam;
  if (!db || !view.room || !team) return;

  try {
    await updateDoc(getRoomRef(view.roomCode), {
      [`occupancy.${team}`]: "",
      kickEvent: { team, clientId: view.room.occupancy[team], nonce: Date.now() },
      updatedAtMs: Date.now()
    });

    el.boardStatus.textContent = `${cap(team)} spymaster removed.`;
    closeKickMenu();
  } catch (error) {
    el.boardStatus.textContent = friendlyError(error, "Could not remove that spymaster.");
  }
}

function handleKick(room) {
  const ev = room.kickEvent;
  if (view.mode !== "spymaster" || !ev || ev.clientId !== clientId) return false;

  const sig = `${room.code}:${ev.nonce}`;
  if (sessionStorage.getItem(KICK_NOTICE_KEY) === sig) return false;

  sessionStorage.setItem(KICK_NOTICE_KEY, sig);
  unsubscribe();
  closeCardMenu();
  view.roomCode = "";
  view.room = null;
  view.mode = "";
  view.pendingTeam = "";
  el.homeMessage.textContent = "The host removed you from the room.";
  showScreen("home");
  return true;
}

/* ── Render ───────────────────────────────────────────────── */

function render() {
  const room = view.room;
  if (!room) return;

  if (room.boardVersion !== anim.boardVersion) resetAnim(room.boardVersion, room);

  armExecution(room);

  if (view.screen === "teams") renderTeams();
  if (view.screen === "board") renderBoardScreen();
  if (view.screen === "spymaster") renderSpymasterScreen();

  processEvents(room);
  reapStaleClaims(room);
  maybeAutoNewGame(room);
}

function renderTeams() {
  const room = view.room;
  if (!room) return;

  el.teamScreenLabel.textContent = `Room ${room.code}`;

  [
    ["red", el.redTeamButton, el.redTeamStatus],
    ["blue", el.blueTeamButton, el.blueTeamStatus]
  ].forEach(([team, button, label]) => {
    const held = room.occupancy?.[team];
    const takenByOther = Boolean(held && held !== clientId);

    button.classList.toggle("is-taken", takenByOther);
    button.classList.toggle("is-selected", view.selectedTeam === team);
    button.disabled = takenByOther;
    label.textContent = takenByOther ? "Taken" : held === clientId ? "You" : "Open";
  });

  el.confirmTeamButton.disabled = !view.selectedTeam;
}

function renderBoardScreen() {
  const room = view.room;

  el.boardTitle.textContent = room.code;
  el.boardStatus.textContent = room.gameStarted
    ? room.gameResult && !execution.holdResult
      ? room.gameResult.message
      : "Board live"
    : "Waiting to start";

  syncQrOverlay(room);
  syncReadyChime(room);

  el.boardNewGameButton.disabled = !isHost(room);

  renderOccupancy(room);
  syncKickControls(room);

  const started = Boolean(room.gameStarted);
  el.boardWaiting.style.display = started ? "none" : "flex";
  document.querySelector(".table-plane").style.display = started ? "block" : "none";
  el.boardWaitingMessage.textContent = waitingMessage(room);

  if (started) {
    paintBoard(el.board, room, { showKey: false, interactive: false });
    updateCounters(room);
  }

  syncResult(room);
}

function renderSpymasterScreen() {
  const room = view.room;
  const team = claimedTeam(room);

  if (!team) {
    // Still waiting on the write to come back around; hold this screen.
    if (view.pendingTeam) return;

    // We held this seat a moment ago and it is still empty, so nobody wanted
    // it — we were swept for going quiet. At a 20s timeout that is the normal
    // consequence of locking a phone mid-turn, not an error worth a screenful
    // of explanation, so take it straight back and stay where we are.
    if (view.selectedTeam && !room.occupancy?.[view.selectedTeam]) {
      reclaimSeat(view.selectedTeam);
      return;
    }

    // Genuinely gone: somebody else is sitting there now.
    el.teamMessage.textContent = view.selectedTeam
      ? "Someone else took your side while you were away."
      : "";

    view.mode = "";
    view.selectedTeam = "";
    showScreen("teams");
    return;
  }

  view.pendingTeam = "";
  view.selectedTeam = team;
  el.spymasterRole.textContent = `${cap(team)} spymaster`;
  el.spymasterTitle.textContent = room.code;
  el.spymasterStatus.textContent = spymasterStatus(room, team);
  document.body.dataset.team = team;

  renderOccupancy(room);

  // Dealing a fresh board alone is fine; beginning a round is not. Only the
  // start is gated, and since "New game" resets gameStarted the button comes
  // back round to a gated "Start game" anyway.
  const isRestart = room.gameStarted || room.gameResult;
  el.startGameButton.textContent = isRestart ? "New game" : "Start game";
  el.startGameButton.disabled = !isRestart && !bothSeated(room);

  const started = Boolean(room.gameStarted);
  [el.keyTabPanel, el.boardTabPanel, el.listTabPanel].forEach((p) => p.classList.toggle("is-dark", !started));

  if (started) {
    paintBoard(el.spymasterBoard, room, { showKey: true, interactive: true, tag: "key" });
    paintBoard(el.spymasterPublicBoard, room, { showKey: false, interactive: false, tag: "pub" });
    renderList(room);
  } else {
    clearBoard(el.spymasterBoard);
    clearBoard(el.spymasterPublicBoard);
    el.spymasterListView.innerHTML = "";
    closeCardMenu();
  }

  syncTabs();
  syncStartNotice(room);
}

function renderOccupancy(room) {
  const label = (team) => {
    const held = room.occupancy?.[team];
    return held ? (held === clientId ? "You" : "Connected") : "Waiting";
  };

  const red = label("red");
  const blue = label("blue");

  el.boardRedOccupancy.textContent = red;
  el.boardBlueOccupancy.textContent = blue;
  el.spyRedOccupancy.textContent = red;
  el.spyBlueOccupancy.textContent = blue;
}

/**
 * Builds the 25 cards once per board, then only mutates what changed.
 * The previous version rebuilt every card on every snapshot, which is what
 * made the board flicker and killed every transition mid-flight.
 */
function paintBoard(mount, room, { showKey, interactive, tag = "" }) {
  const signature = `${room.boardVersion}:${room.cards.length}`;
  let entry = boardViews.get(mount);

  if (!entry || entry.signature !== signature) {
    mount.innerHTML = "";
    const nodes = [];

    for (let i = 0; i < room.cards.length; i += 1) {
      const node = buildCard(i, room.cards[i], interactive, tag);
      nodes.push(node);
      mount.appendChild(node.root);
    }

    entry = { signature, nodes, dealt: false };
    boardViews.set(mount, entry);
  }

  for (let i = 0; i < entry.nodes.length; i += 1) {
    const node = entry.nodes[i];
    const card = room.cards[i];
    const revealed = isRevealed(room, i);

    if (node.word !== card.word) {
      node.word = card.word;
      node.frontText.textContent = card.word;
      node.backText.textContent = card.word;
      node.root.classList.remove("just-swapped");
      void node.root.offsetWidth;
      node.root.classList.add("just-swapped");
    }

    if (node.owner !== card.owner) {
      node.owner = card.owner;
      node.root.dataset.owner = card.owner;
    }

    // Held back while the shots land: the card is already revealed as far as
    // the room is concerned, but it must keep showing its face until the
    // sequence develops it. Locking still follows the real state, so nobody
    // can tap the card that is currently being shot.
    const turned = revealed && !(execution.holdReveal && execution.index === i);

    node.root.classList.toggle("is-revealed", turned);
    node.root.classList.toggle("show-key", Boolean(showKey));
    node.root.classList.toggle("is-locked", Boolean(room.gameResult) || revealed);

    if (interactive) node.root.disabled = Boolean(room.gameResult) || revealed;
  }

  if (!entry.dealt && room.gameStarted) {
    entry.dealt = true;
    dealIn(mount, entry.nodes);
  }
}

function buildCard(index, card, interactive, tag) {
  const root = document.createElement(interactive ? "button" : "div");
  root.className = "card";
  root.dataset.index = String(index);
  root.dataset.owner = card.owner;
  root.style.setProperty("--row", String(Math.floor(index / COLUMNS)));
  root.style.setProperty("--col", String(index % COLUMNS));
  root.style.setProperty("--wave", String(Math.floor(index / COLUMNS) + (index % COLUMNS)));

  if (interactive) {
    root.type = "button";
    root.addEventListener("click", (e) => openCardMenu(index, root, e, tag));
  }

  const inner = document.createElement("span");
  inner.className = "card-inner";

  const front = document.createElement("span");
  front.className = "card-face card-front";
  const frontText = document.createElement("span");
  frontText.className = "card-word";
  frontText.textContent = card.word;
  front.appendChild(frontText);

  const back = document.createElement("span");
  back.className = "card-face card-back";
  const backText = document.createElement("span");
  backText.className = "card-word";
  backText.textContent = card.word;
  back.appendChild(backText);

  inner.append(front, back);
  root.appendChild(inner);

  return { root, frontText, backText, word: card.word, owner: card.owner };
}

function clearBoard(mount) {
  mount.innerHTML = "";
  boardViews.delete(mount);
}

function renderList(room) {
  const groups = [
    { key: "red", label: "Red", cls: "grp-red" },
    { key: "blue", label: "Blue", cls: "grp-blue" },
    { key: "neutral", label: "Bystanders", cls: "grp-neutral" },
    { key: "assassin", label: "Assassin", cls: "grp-assassin" }
  ];

  const frag = document.createDocumentFragment();

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = `list-section ${group.cls}`;

    const heading = document.createElement("h3");
    heading.className = "list-heading";
    const remaining = room.cards.filter((c, i) => c.owner === group.key && !isRevealed(room, i)).length;
    heading.innerHTML = `<span>${group.label}</span><span class="list-count">${remaining}</span>`;
    section.appendChild(heading);

    const items = document.createElement("div");
    items.className = "list-items";

    room.cards
      .map((card, index) => ({ ...card, index }))
      .filter((card) => card.owner === group.key)
      .sort((a, b) => {
        const ra = isRevealed(room, a.index);
        const rb = isRevealed(room, b.index);
        return ra === rb ? a.word.localeCompare(b.word) : ra ? 1 : -1;
      })
      .forEach((card) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "list-word";
        item.textContent = card.word;

        if (isRevealed(room, card.index)) {
          item.classList.add("is-revealed");
          item.disabled = true;
        } else {
          item.addEventListener("click", (e) => openCardMenu(card.index, item, e, "list"));
        }

        items.appendChild(item);
      });

    section.appendChild(items);
    frag.appendChild(section);
  }

  el.spymasterListView.innerHTML = "";
  el.spymasterListView.appendChild(frag);
}

/* ── Animation orchestration ──────────────────────────────── */

function resetAnim(boardVersion, room = null) {
  anim.boardVersion = boardVersion;
  anim.primed = false;
  anim.seen = new Set(room ? Object.keys(room.revealed || {}) : []);
  anim.dealt = false;
  anim.exposed = false;

  // Leaving a room entirely (-1): forget which deal the join code last
  // reacted to, so walking into a different room raises it again, and drop
  // the seated state so the next room's fill still reads as a transition.
  if (boardVersion === -1) {
    qrBoardVersion = -1;
    prevBothSeated = null;
  }
  autoNewGameArmedAt = 0;
  autoNewGameArmedMode = "";

  // A fresh board is nine agents a side again, so the sting is re-armed and
  // any glow left over from the last round comes off. The run starts over
  // too — nothing carries across a deal.
  lastAgentStung.red = false;
  lastAgentStung.blue = false;
  streak.team = "";
  streak.count = 0;
  el.boardRedChip.classList.remove("is-critical");
  el.boardBlueChip.classList.remove("is-critical");

  clearExecution();

  document.body.classList.remove("round-over", "is-celebrating");
  delete document.body.dataset.winTeam;
  el.resultBanner.classList.remove("is-victory");
  el.fxLayer.innerHTML = "";
  document.querySelectorAll(".card.is-condemned").forEach((card) => {
    card.classList.remove("is-condemned", "is-struck", "is-bleeding", "is-drying", "is-executed");
    card.querySelectorAll(".fx-wound").forEach((w) => w.remove());
  });
  boardViews.forEach((entry) => {
    entry.dealt = false;
  });
  [el.board, el.spymasterBoard, el.spymasterPublicBoard].forEach((b) => b.classList.remove("board-exposed"));
}

/**
 * Fires animations and sound for state this device has not seen yet.
 * The first snapshot of a board only primes the set, so joining a game already
 * in progress does not replay a dozen reveals at once.
 */
function processEvents(room) {
  const revealedKeys = Object.keys(room.revealed || {});

  if (!anim.primed) {
    anim.primed = true;
    revealedKeys.forEach((k) => anim.seen.add(k));
    if (room.gameResult) exposeBoard(room, false);
    return;
  }

  const fresh = revealedKeys.filter((k) => !anim.seen.has(k));
  fresh.forEach((k) => anim.seen.add(k));

  if (fresh.length) {
    fresh.forEach((key, order) => {
      const index = Number(key);
      const owner = room.cards[index]?.owner;
      const pan = ((index % COLUMNS) / (COLUMNS - 1)) * 1.2 - 0.6;

      // Advanced out here rather than inside the timeout: the timeouts are
      // staggered and would otherwise all read the counter after every one of
      // them had already run, giving each card the same number.
      const run = trackStreak(owner);

      window.setTimeout(() => {
        if (owner === "assassin") {
          executeAssassin(index);
        } else if (owner === "neutral") {
          sfx.playRevealNeutral(pan);
          puffNeutral(index);
        } else {
          sfx.playRevealTeam(owner, pan, run);
        }
      }, order * 90);
    });

    updateCounters(room, true);
  }

  if (room.gameResult && !anim.exposed) exposeBoard(room, true);
}

/** Staggered deal-in the first time a board becomes visible. */
function dealIn(mount, nodes) {
  if (reduceMotion) return;

  // The deal classes go on now, not after the shuffle: `deal` animates with
  // `backwards`, so applying it immediately holds every card at its first
  // keyframe (invisible) through the lead-in. Delaying the class instead
  // would leave the finished board on screen for a beat and then snap it
  // away to fly back in.
  mount.classList.add("is-dealing");
  mount.style.setProperty("--deal-lead", `${DEAL_LEAD_MS}ms`);
  nodes.forEach((n) => n.root.classList.add("deal"));

  if (mount === el.board || (mount === el.spymasterBoard && view.screen === "spymaster")) {
    sfx.playShuffle();
    // Scheduled on the audio clock rather than a timer, so the first card
    // lands exactly as the deck squares up.
    sfx.playDeal(nodes.length, COLUMNS, DEAL_LEAD_MS / 1000);
    shuffleFlourish(mount, nodes);
  }

  window.setTimeout(() => {
    mount.classList.remove("is-dealing");
    mount.style.removeProperty("--deal-lead");
    nodes.forEach((n) => n.root.classList.remove("deal"));
  }, DEAL_LEAD_MS + 1400);
}

/**
 * The deck being squared up, over the empty board, while the shuffle plays.
 *
 * The lead-in was silent-picture before this: the sound rifled and the board
 * just sat blank until the cards flew in. Slips gather into a single stack at
 * the centre of the grid and are gone by the time the first card is dealt, so
 * the whole thing reads as one motion — gather, then fan out.
 *
 * Lives in the fixed FX layer rather than the board, because the board is a
 * CSS grid and any child of it becomes a 26th cell.
 */
function shuffleFlourish(mount, nodes) {
  const box = mount.getBoundingClientRect();
  if (!box.width) return;

  // Sized off a real card on this board, so the deck reads as the same object
  // that is about to be dealt.
  const cardBox = nodes[0]?.root.getBoundingClientRect();
  const w = Math.round(cardBox?.width || box.width / COLUMNS);
  const h = Math.round(cardBox?.height || w * 0.7);

  const deck = document.createElement("div");
  deck.className = "fx-shuffle";
  deck.style.left = `${box.left + box.width / 2}px`;
  deck.style.top = `${box.top + box.height / 2}px`;
  deck.style.setProperty("--w", `${w}px`);
  deck.style.setProperty("--h", `${h}px`);
  deck.style.setProperty("--dur", `${DEAL_LEAD_MS}ms`);

  for (let i = 0; i < 7; i += 1) {
    const slip = document.createElement("span");
    slip.className = "fx-shuffle-card";

    // Alternating sides, so they interleave the way a riffle actually does.
    const side = i % 2 ? 1 : -1;

    // Where it flies in from, before the deck is gathered.
    slip.style.setProperty("--dx", (side * (0.45 + Math.random() * 0.55)).toFixed(3));
    slip.style.setProperty("--rot", `${(side * (8 + Math.random() * 12)).toFixed(1)}deg`);

    // How far it fans on each riffle pass. Much smaller than the entry — a
    // riffle splits a deck, it doesn't scatter it. No animation-delay here on
    // purpose: a stagger would slide each slip's passes off the beats the
    // sound is playing them on.
    slip.style.setProperty("--sp", (side * (0.1 + Math.random() * 0.16)).toFixed(3));
    slip.style.setProperty("--sy", (side * (0.05 + Math.random() * 0.09)).toFixed(3));
    slip.style.setProperty("--spr", `${(side * (3 + Math.random() * 6)).toFixed(1)}deg`);

    deck.appendChild(slip);
  }

  el.fxLayer.appendChild(deck);

  window.setTimeout(() => deck.remove(), DEAL_LEAD_MS + 140);
}

/** End of round: every remaining card turns over. */
function exposeBoard(room, withSound) {
  anim.exposed = true;
  document.body.classList.add("round-over");

  // Not the spymaster's key board — it already shows every identity, so there
  // is nothing to expose there, and flipping it only risked mirrored text.
  // The assassin's board waits out the whole execution — three shots, the
  // bleed, the develop, and the banner — before the rest of the cards turn.
  const boards = [el.board, el.spymasterPublicBoard];
  const delay = room.gameResult?.style === "assassin" ? 4200 : 700;

  window.setTimeout(() => {
    boards.forEach((b) => b.classList.add("board-exposed"));

    if (withSound) {
      const hidden = room.cards.filter((_, i) => !isRevealed(room, i)).length;
      sfx.playCascade(Math.min(hidden, 16));

      // Gated on withSound, same as the sound above: this only fires the
      // moment the win is freshly observed, not every time a device loads
      // into (or refreshes on top of) a game that already finished.
      if (room.gameResult?.winner) {
        celebrateVictory(room.gameResult.winner);
      }
    }
  }, reduceMotion ? 0 : delay);
}

/** A team reveals all their own cards outright — the actual win condition,
 *  distinct from the assassin ending the round early. */
function celebrateVictory(team) {
  document.body.classList.add("is-celebrating");
  document.body.dataset.winTeam = team;
  el.resultBanner.classList.add("is-victory");

  spawnConfetti(team);
  window.setTimeout(() => sfx.playVictory(team), 350);
}

function spawnConfetti(team) {
  if (reduceMotion) return;

  const palette = team === "red"
    ? ["#d14a42", "#8e2a26", "#e8a33d", "#e9e5db"]
    : ["#3e92be", "#1e5a7a", "#e8a33d", "#e9e5db"];

  const frag = document.createDocumentFragment();
  const count = 90;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("div");
    piece.className = "fx-confetti";
    const size = 6 + Math.random() * 7;

    piece.style.left = `${Math.random() * window.innerWidth}px`;
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 280}px`);
    piece.style.setProperty("--spin", `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`);
    piece.style.setProperty("--w", `${size}px`);
    piece.style.setProperty("--h", `${size * 1.6}px`);
    piece.style.setProperty("--d", `${2400 + Math.random() * 1600}ms`);
    piece.style.animationDelay = `${Math.random() * 500}ms`;
    piece.style.background = palette[i % palette.length];

    frag.appendChild(piece);
  }

  el.fxLayer.appendChild(frag);

  // Only the confetti we just added, in case anything else is sharing this
  // layer. The longest possible piece (max duration + max delay) lands
  // around 4500ms.
  window.setTimeout(() => {
    el.fxLayer.querySelectorAll(".fx-confetti").forEach((p) => p.remove());
  }, 5200);
}

/**
 * Arms the execution before anything paints.
 *
 * render() paints first and fires animations second, which is the right order
 * for every other effect — but this one has to suppress the very reveal that
 * triggers it. Catching the assassin here, ahead of the first paint, is what
 * keeps the card face-down and the banner off screen until the shots land.
 */
function armExecution(room) {
  if (!anim.primed || reduceMotion || execution.index !== null) return;

  const hit = Object.keys(room.revealed || {}).find(
    (k) => !anim.seen.has(k) && room.cards[Number(k)]?.owner === "assassin"
  );

  if (hit === undefined) return;

  execution.index = Number(hit);
  execution.holdReveal = true;
  execution.holdResult = true;
}

/** Every painted copy of one card — the board, and both spymaster views. */
function cardNodes(index) {
  return [el.board, el.spymasterPublicBoard, el.spymasterBoard]
    .map((mount) => mount?.querySelector(`.card[data-index="${index}"]`))
    .filter(Boolean);
}

/**
 * A bystander: a small puff of dust off the card, and nothing else.
 *
 * Sized and shaped to be read as an anticlimax next to the assassin — a few
 * dull flecks that drift up and die, against three bullet holes and a bleed.
 * The sound already plays the letdown; this just gives it something to land
 * on, so "nothing happened" looks different from a reveal rather than only
 * sounding different.
 */
function puffNeutral(index) {
  if (reduceMotion) return;

  const spawned = [];

  cardNodes(index).forEach((card) => {
    const box = card.getBoundingClientRect();
    const unit = Math.round(Math.min(box.width, box.height)) || 100;
    card.style.setProperty("--unit", `${unit}px`);
    card.classList.add("is-puffing");

    const frag = document.createDocumentFragment();

    // A soft body behind the flecks — on its own the specks read as a few
    // stray dots rather than something being knocked off the card.
    const haze = document.createElement("span");
    haze.className = "fx-haze";
    frag.appendChild(haze);
    spawned.push(haze);

    for (let i = 0; i < 12; i += 1) {
      const fleck = document.createElement("span");
      fleck.className = "fx-dust";

      // Fanned upward — dust knocked loose, not an explosion.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const distance = 0.22 + Math.random() * 0.32;

      fleck.style.setProperty("--dx", (Math.cos(angle) * distance).toFixed(3));
      fleck.style.setProperty("--dy", (Math.sin(angle) * distance).toFixed(3));
      fleck.style.setProperty("--s", (0.055 + Math.random() * 0.055).toFixed(3));
      fleck.style.animationDelay = `${Math.round(Math.random() * 90)}ms`;

      frag.appendChild(fleck);
      spawned.push(fleck);
    }

    card.appendChild(frag);
  });

  // Only the flecks this call made — a second bystander turning over while
  // these are still in the air must not sweep them up early.
  window.setTimeout(() => {
    spawned.forEach((fleck) => fleck.remove());
    cardNodes(index).forEach((card) => card.classList.remove("is-puffing"));
  }, 900);
}

/**
 * The assassin.
 *
 * Three rounds through a card that is still face-down, a slow
 * bleed, and only then the identity. The card develops in place rather than
 * turning over: a flip would carry the holes around to the back for the
 * length of the turn, and the holes are the part that has to persist.
 */
function executeAssassin(index) {
  const cards = cardNodes(index);
  const pan = ((index % COLUMNS) / (COLUMNS - 1)) * 1.2 - 0.6;

  cards.forEach((card) => card.classList.add("is-condemned"));

  if (reduceMotion) {
    sfx.playGunshot(0, pan);
    cards.forEach((card) => {
      card.classList.add("is-executed");
      [0, 1, 2].forEach((shot) => strike(card, shot));
    });
    return;
  }

  const SHOTS = [200, 550, 900];

  SHOTS.forEach((at, shot) => {
    afterExecution(at, () => {
      sfx.playGunshot(shot, pan);
      cards.forEach((card) => strike(card, shot));
      if (shot === SHOTS.length - 1) sfx.playExecutionTail(pan);
    });
  });

  // The wounds start to seep, a beat after the last round.
  afterExecution(1000, () => {
    cards.forEach((card) => card.classList.add("is-bleeding"));
  });

  // It gives up what it is.
  afterExecution(3000, () => {
    execution.holdReveal = false;
    sfx.playDevelop(pan);
    cards.forEach((card) => card.classList.add("is-executed", "is-revealed"));
  });

  // The blood dries off. The holes stay until the next board is dealt.
  afterExecution(3500, () => {
    cards.forEach((card) => card.classList.add("is-drying"));
  });

  // Only now is it named.
  afterExecution(4000, () => {
    execution.holdResult = false;

    const room = view.room;
    if (!room?.gameResult) return;

    syncResult(room);
    el.boardStatus.textContent = room.gameResult.message;

    const team = claimedTeam(room);
    if (team) el.spymasterStatus.textContent = spymasterStatus(room, team);
  });
}

/** One round landing: a hole punched through the face, and the card kicking. */
function strike(card, shot) {
  // Spread wide across the face, still an uneven triangle rather than a row:
  // three marks at equal spacing would read as decoration, not as hits.
  const spots = [
    { x: 29, y: 30 },
    { x: 70, y: 43 },
    { x: 45, y: 68 }
  ];
  const spot = spots[shot] || spots[0];

  // Everything scales off the card's short side, so a hole is the same
  // fraction of a card on a phone as it is on a television — and a run still
  // lands on the card it came from. Scaling off width alone put drips most of
  // a card-height below the bottom edge on the wide public board.
  const box = card.getBoundingClientRect();
  const unit = Math.round(Math.min(box.width, box.height)) || 100;
  card.style.setProperty("--unit", `${unit}px`);

  const wound = document.createElement("span");
  wound.className = "fx-wound";
  wound.style.left = `${spot.x + (Math.random() - 0.5) * 9}%`;
  wound.style.top = `${spot.y + (Math.random() - 0.5) * 9}%`;
  wound.style.setProperty("--tear", randomTear());
  wound.style.setProperty("--pool", (1 + Math.random() * 0.26).toFixed(2));

  const blood = document.createElement("span");
  blood.className = "fx-blood";

  const pool = document.createElement("span");
  pool.className = "fx-pool";
  blood.appendChild(pool);

  // Two runs per hole, at different lengths and start times. One drip reads
  // as a graphic mark; two that set off a beat apart read as bleeding.
  for (let i = 0; i < 2; i += 1) {
    const lead = i === 0;
    const run = document.createElement("span");
    run.className = "fx-run";
    run.style.setProperty("--run", ((lead ? 0.38 : 0.2) + Math.random() * 0.24).toFixed(3));
    run.style.setProperty("--w", lead ? "0.075" : "0.05");
    run.style.setProperty("--lean", `${((Math.random() - 0.5) * (lead ? 14 : 30)).toFixed(1)}deg`);
    // Latest possible drip: 480ms + 1.9s = 2.38s, landing inside the 2.5s
    // the timeline allows between the bleed starting and the blood clearing.
    run.style.animationDelay = `${Math.round(i * 220 + Math.random() * 260)}ms`;
    blood.appendChild(run);
  }

  wound.appendChild(blood);

  ["fx-hole", "fx-impact"].forEach((cls) => {
    const part = document.createElement("span");
    part.className = cls;
    wound.appendChild(part);
  });

  card.appendChild(wound);

  card.classList.remove("is-struck");
  void card.offsetWidth;
  card.classList.add("is-struck");
}

/** An irregular border-radius, so no two holes are the same shape. */
function randomTear() {
  const n = () => 42 + Math.random() * 16;
  return `${n()}% ${n()}% ${n()}% ${n()}% / ${n()}% ${n()}% ${n()}% ${n()}%`;
}

/** Counters roll downward when a side loses an agent. */
function updateCounters(room, animate = false) {
  const red = room.cards.filter((c, i) => c.owner === "red" && !isRevealed(room, i)).length;
  const blue = room.cards.filter((c, i) => c.owner === "blue" && !isRevealed(room, i)).length;

  setCounter(el.boardRedRemaining, red, animate);
  setCounter(el.boardBlueRemaining, blue, animate);

  syncLastAgent(room, "red", red, animate);
  syncLastAgent(room, "blue", blue, animate);
}

/**
 * One agent from winning.
 *
 * The glow is driven off current state rather than the transition, so a phone
 * that joins mid-round still shows the side that is one away. The sting is the
 * opposite — it marks the moment, so it is gated on `animate` (only true for a
 * reveal this device actually watched happen) and latched per side, or every
 * later snapshot would sound it again.
 */
function syncLastAgent(room, team, remaining, animate) {
  const chip = team === "red" ? el.boardRedChip : el.boardBlueChip;
  const critical = remaining === 1 && !room.gameResult;

  chip.classList.toggle("is-critical", critical);

  if (!critical) {
    lastAgentStung[team] = false;
    return;
  }

  if (animate && !lastAgentStung[team]) {
    lastAgentStung[team] = true;
    // Behind the reveal that caused it, so the two do not stack on one beat.
    window.setTimeout(() => sfx.playLastAgent(team), 420);
  }
}

function setCounter(node, value, animate) {
  const previous = counters.get(node);
  counters.set(node, value);

  if (previous === value) return;

  if (!animate || previous === undefined || reduceMotion || value > previous) {
    node.textContent = String(value);
    return;
  }

  const ghost = document.createElement("span");
  ghost.className = "counter-ghost";
  ghost.textContent = String(previous);

  node.textContent = "";
  node.append(document.createTextNode(String(value)), ghost);
  node.classList.remove("counter-tick");
  void node.offsetWidth;
  node.classList.add("counter-tick");

  sfx.playTick(value);

  window.setTimeout(() => {
    ghost.remove();
    node.classList.remove("counter-tick");
  }, 520);
}

/* ── Card menu ────────────────────────────────────────────── */

function openCardMenu(index, button, event, tag) {
  event.preventDefault();
  event.stopPropagation();
  closeKickMenu();

  const room = view.room;
  if (!room?.gameStarted || room.gameResult || isRevealed(room, index)) return;

  sfx.playUi();

  const host = tag === "list"
    ? button.closest(".list-items") || el.listTabPanel
    : button.closest(".board-wrap") || screens.spymaster;

  if (el.cardActionMenu.parentElement !== host) host.appendChild(el.cardActionMenu);

  const hostRect = host.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - hostRect.left;
  const y = rect.top + rect.height / 2 - hostRect.top;

  view.menuIndex = index;
  view.menuHost = host;

  el.cardActionMenu.style.display = "grid";
  el.cardActionMenu.style.left = `${x}px`;
  el.cardActionMenu.style.top = `${y}px`;
  el.cardActionMenu.dataset.above = y > hostRect.height * 0.6 ? "true" : "false";
  el.cardActionMenu.dataset.right = x > hostRect.width * 0.72 ? "true" : "false";
  el.revealCardButton.focus();
}

function closeCardMenu() {
  view.menuIndex = null;
  view.menuHost = null;
  el.cardActionMenu.style.display = "none";
}

function openKickMenu(team, event) {
  event.preventDefault();
  event.stopPropagation();

  const room = view.room;
  if (!room || !isHost(room) || !room.occupancy?.[team]) return;

  closeCardMenu();
  sfx.playUi();

  view.kickTeam = team;
  el.kickCluegiverButton.textContent = `Remove ${cap(team)}`;
  el.hostKickMenu.style.display = "grid";
  el.hostKickMenu.style.left = `${event.clientX}px`;
  el.hostKickMenu.style.top = `${event.clientY}px`;
  el.hostKickMenu.dataset.right = event.clientX > window.innerWidth * 0.7 ? "true" : "false";
}

function closeKickMenu() {
  view.kickTeam = "";
  el.hostKickMenu.style.display = "none";
}

function syncKickControls(room) {
  const canKick = isHost(room);

  [["red", el.boardRedOccupancyCard], ["blue", el.boardBlueOccupancyCard]].forEach(([team, node]) => {
    const kickable = canKick && Boolean(room.occupancy?.[team]);
    node.classList.toggle("is-kickable", kickable);
    node.title = kickable ? `Remove the ${cap(team)} spymaster` : "";
  });

  if (!canKick || !room.occupancy?.[view.kickTeam]) closeKickMenu();
}

function handleGlobalPointer(event) {
  if (el.cardActionMenu.style.display === "grid") {
    const inside = el.cardActionMenu.contains(event.target);
    const onCard = event.target.closest?.(".card, .list-word");
    if (!inside && !onCard) closeCardMenu();
  }

  if (el.hostKickMenu.style.display === "grid") {
    const inside = el.hostKickMenu.contains(event.target);
    const onTrigger = event.target.closest?.(".occ-card");
    if (!inside && !onTrigger) closeKickMenu();
  }
}

/* ── Screen + chrome ──────────────────────────────────────── */

function showScreen(name) {
  Object.entries(screens).forEach(([key, node]) => node.classList.toggle("active", key === name));

  view.screen = name;
  document.body.dataset.screen = name;

  closeCardMenu();
  closeKickMenu();

  if (name !== "spymaster") el.startTeamOverlay.classList.remove("is-open");
  if (name !== "board") el.qrOverlay.classList.remove("is-open");

  if (name === "spymaster") startHeartbeat();
  else stopHeartbeat();
  if (name === "home") setAmbient(true);
  else setAmbient(false);

  if (view.room) render();
  scheduleLayout();
}

function setTab(tab) {
  sfx.playUi();
  view.tab = tab;
  closeCardMenu();
  syncTabs();
}

function syncTabs() {
  [
    ["key", el.keyTabButton, el.keyTabPanel],
    ["board", el.boardTabButton, el.boardTabPanel],
    ["list", el.listTabButton, el.listTabPanel]
  ].forEach(([name, button, panel]) => {
    const active = view.tab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    panel.classList.toggle("active", active);
  });

  document.body.classList.toggle("safelight-on", view.screen === "spymaster" && view.tab === "key");
}

function syncResult(room) {
  const has = Boolean(room.gameResult) && !execution.holdResult;
  el.resultBanner.classList.toggle("is-open", has);
  el.resultBanner.dataset.style = has ? room.gameResult.style || "" : "";

  if (has) el.resultBannerText.textContent = room.gameResult.message;
}

/** The join QR, on demand — the inline one disappears once the round starts.
 *  `silent` is for the automatic openings, where a click tick and a focus
 *  jump would both be unexplained: nobody pressed anything. */
function openQrOverlay({ silent = false } = {}) {
  const room = view.room;
  if (!room) return;

  if (!silent) sfx.playUi();

  const src = qrUrlFor(room.code, 520);

  // Only reassign when the room actually changed, so reopening the overlay
  // shows the cached image instead of refetching and flashing empty.
  if (el.qrOverlayImage.dataset.code !== room.code) {
    el.qrOverlayImage.dataset.code = room.code;
    el.qrOverlayImage.src = src;
  }

  el.qrOverlayCode.textContent = room.code;
  el.qrOverlay.classList.add("is-open");
  if (!silent) el.closeQrButton.focus();
}

/**
 * The join code is derived from room state rather than raised by whoever
 * happened to press a button.
 *
 * That is what lets a spymaster's "New game", tapped on a phone, put the code
 * up on the board across the room — the board is reacting to the new deal
 * landing, not to a local click it never saw. It also covers the board's own
 * button and the unattended auto-deal with the same rule, so the three paths
 * cannot drift apart.
 *
 * Up:   a freshly dealt board that still has an empty seat.
 * Down: both seats filled — the code has done its job — or the round starting,
 *       which is the failsafe: however the code got up, beginning a round
 *       always takes it down.
 */
function syncQrOverlay(room) {
  const seated = bothSeated(room);
  const awaitingPlayers = !room.gameStarted && !room.gameResult;

  if (room.boardVersion !== qrBoardVersion) {
    qrBoardVersion = room.boardVersion;
    if (awaitingPlayers && !seated) openQrOverlay({ silent: true });
  }

  if (seated || room.gameStarted) closeQrOverlay({ silent: true });
}

/**
 * The moment the second seat fills.
 *
 * Until now this passed in silence — the join code just vanished and a line of
 * status text changed, neither of which anyone is looking at from across a
 * room. Only fires on the transition into seated, and only once the board has
 * seen at least one snapshot, so walking up to an already-full room is quiet.
 */
function syncReadyChime(room) {
  const seated = bothSeated(room);

  if (prevBothSeated === false && seated) sfx.playReady();

  prevBothSeated = seated;
}

/** `silent` is for auto-dismissal, where a click tick and a focus jump would
 *  both be unexplained — nobody pressed anything. */
function closeQrOverlay({ silent = false } = {}) {
  if (!el.qrOverlay.classList.contains("is-open")) return;

  el.qrOverlay.classList.remove("is-open");

  if (!silent) {
    sfx.playUi();
    el.showQrButton.focus();
  }
}

function syncStartNotice(room) {
  const sig = `${room.code}:${room.boardVersion}:${room.startingTeam}`;
  const show = room.gameStarted && !room.gameResult && sessionStorage.getItem(START_NOTICE_KEY) !== sig;

  el.startTeamText.textContent = `${cap(room.startingTeam)} starts`;
  el.startTeamOverlay.classList.toggle("is-open", show);
}

function dismissStartNotice() {
  const room = view.room;
  if (!room) return;

  sfx.playUi();
  sessionStorage.setItem(START_NOTICE_KEY, `${room.code}:${room.boardVersion}:${room.startingTeam}`);
  el.startTeamOverlay.classList.remove("is-open");
}

function setLinkState(metadata) {
  const offline = metadata.fromCache && !metadata.hasPendingWrites;
  const syncing = metadata.hasPendingWrites;
  const state = offline ? "offline" : syncing ? "syncing" : "live";

  if (el.linkState.dataset.state === state) return;

  el.linkState.dataset.state = state;
  el.linkStateText.textContent = offline ? "Offline" : syncing ? "Syncing" : "Live";
}

function scheduleLayout() {
  if (layoutQueued) return;
  layoutQueued = true;

  requestAnimationFrame(() => {
    layoutQueued = false;
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
  });
}

/* ── Ambient hero grid ────────────────────────────────────── */

function buildAmbientGrid() {
  const owners = ["red", "blue", "neutral"];
  const frag = document.createDocumentFragment();

  for (let i = 0; i < CARD_COUNT; i += 1) {
    const tile = document.createElement("span");
    tile.className = "ambient-tile";
    tile.dataset.owner = i === 12 ? "assassin" : owners[i % 3];
    tile.style.setProperty("--i", String(i));
    frag.appendChild(tile);
  }

  el.ambientGrid.appendChild(frag);
}

function setAmbient(on) {
  if (ambientTimer) {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }

  if (!on || reduceMotion) return;

  const tiles = Array.from(el.ambientGrid.children);

  ambientTimer = window.setInterval(() => {
    if (document.hidden) return;

    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    tile.classList.toggle("is-lit");
  }, 900);
}

/* ── Board data ───────────────────────────────────────────── */

function buildRoom(code) {
  const expiresAtMs = Date.now() + ROOM_TTL_MS;

  return {
    code,
    hostId: clientId,
    // Two forms of the same deadline, on purpose:
    //   expiresAtMs — a plain number the client checks instantly, so a room
    //                 stops working the moment it turns 24 hours old.
    //   expiresAt   — a real Timestamp, which is the only type Firestore's TTL
    //                 policy will act on. This is what actually deletes the doc.
    expiresAtMs,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...buildBoard(1, []),
    revealed: {},
    occupancy: { red: "", blue: "" },
    heartbeat: { red: 0, blue: 0 },
    gameStarted: false,
    gameResult: null,
    lastEvent: null,
    kickEvent: null
  };
}

function buildBoard(boardVersion, usedWords) {
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const other = startingTeam === "red" ? "blue" : "red";

  const owners = shuffle([
    ...Array(9).fill(startingTeam),
    ...Array(8).fill(other),
    ...Array(7).fill("neutral"),
    "assassin"
  ]);

  const history = Array.isArray(usedWords) ? usedWords : [];
  let pool = WORD_BANK.filter((w) => !history.includes(w));
  let base = [...history];

  if (pool.length < CARD_COUNT) {
    pool = [...WORD_BANK];
    base = [];
  }

  const words = shuffle([...pool]).slice(0, CARD_COUNT);

  return {
    cards: words.map((word, i) => ({ word, owner: owners[i] })),
    startingTeam,
    boardVersion,
    usedWords: [...base, ...words]
  };
}

function pickReplacement(room, index) {
  const active = new Set(room.cards.filter((_, i) => i !== index).map((c) => c.word));
  const history = Array.isArray(room.usedWords) ? room.usedWords : [];

  let pool = WORD_BANK.filter((w) => !history.includes(w) && !active.has(w));

  if (!pool.length) pool = WORD_BANK.filter((w) => !active.has(w));
  if (!pool.length) throw new Error("No words left to swap in.");

  const word = pool[Math.floor(Math.random() * pool.length)];
  return { word, usedWords: [...new Set([...history, word])] };
}

function evaluateResult(cards, revealed) {
  const isUp = (i) => Boolean(revealed[i]);

  if (cards.some((c, i) => c.owner === "assassin" && isUp(i))) {
    return { style: "assassin", winner: null, message: "Assassin found" };
  }

  const red = cards.filter((c, i) => c.owner === "red" && !isUp(i)).length;
  const blue = cards.filter((c, i) => c.owner === "blue" && !isUp(i)).length;

  if (red === 0) return { style: "red", winner: "red", message: "Red wins" };
  if (blue === 0) return { style: "blue", winner: "blue", message: "Blue wins" };

  return null;
}

function usedWordsOf(room) {
  const history = Array.isArray(room?.usedWords) ? room.usedWords : [];
  const active = Array.isArray(room?.cards) ? room.cards.map((c) => c.word) : [];
  return [...new Set([...history, ...active])];
}

/* ── Copy ─────────────────────────────────────────────────── */

function waitingMessage(room) {
  if (!room.occupancy?.red || !room.occupancy?.blue) {
    const missing = !room.occupancy?.red ? "Red" : "Blue";
    return `Waiting for the ${missing} spymaster to join with code ${room.code}.`;
  }

  return "Both spymasters are in. Either one can start the round.";
}

function spymasterStatus(room, team) {
  if (room.gameResult) return `${room.gameResult.message}. Deal a new board when you're ready.`;
  if (room.gameStarted) return "Tap a card to reveal it. Your team's key is on the Key tab.";

  const other = team === "red" ? "blue" : "red";
  if (!room.occupancy?.[other]) return `Waiting for the ${cap(other)} spymaster to join before you can start.`;

  return "Both sides are in. Start when the room is ready.";
}

/* ── Utilities ────────────────────────────────────────────── */

function isRevealed(room, index) {
  return Boolean(room.revealed?.[index]);
}

/** Both sides seated. A round needs two spymasters to be playable at all. */
function bothSeated(room) {
  return Boolean(room?.occupancy?.red) && Boolean(room?.occupancy?.blue);
}

function claimedTeam(room) {
  if (room.occupancy?.red === clientId) return "red";
  if (room.occupancy?.blue === clientId) return "blue";
  return "";
}

function isHost(room) {
  return room.hostId === clientId || sessionStorage.getItem(HOST_ROOM_KEY) === room.code || view.mode === "host";
}

function getRoomRef(code) {
  return doc(db, "rooms", code);
}

function isExpired(room) {
  return Number(room?.expiresAtMs) > 0 && Date.now() >= Number(room.expiresAtMs);
}

async function generateRoomCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    const snap = await getDoc(getRoomRef(code));

    if (!snap.exists()) return code;

    if (isExpired(snap.data())) {
      await deleteDoc(getRoomRef(code)).catch(() => {});
      return code;
    }
  }

  throw new Error("Could not find a free room code. Try again.");
}

function qrUrlFor(code, size = 200) {
  const url = new URL(LIVE_SITE_URL);
  url.hash = `spymaster:${code}`;
  // Dark modules on a light ground. The old build inverted this to match the
  // dark theme, but plenty of phone cameras refuse to read an inverted QR —
  // and a code nobody can scan is worse than one that's slightly off-palette.
  // No cache-buster: the old build appended Date.now(), so every single render
  // refetched this image over the network and the QR visibly flickered.
  return `https://quickchart.io/qr?text=${encodeURIComponent(url.toString())}&size=${size}&margin=1&ecLevel=M&dark=10161e&light=e9e5db`;
}

function getClientId() {
  const key = "codenames-client-id";
  let id = sessionStorage.getItem(key);

  if (!id) {
    id = `client-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }

  return id;
}

function requireDb(target) {
  if (db) return true;
  target.textContent = "Firebase config is missing in firebase-config.js.";
  return false;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function cap(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function friendlyError(error, fallback) {
  if (error?.code === "permission-denied") return "The database rejected that write. Check your Firestore rules.";
  if (error?.code === "unavailable") return "Network unreachable. It will retry automatically.";
  return error?.message?.trim() || fallback;
}

scheduleLayout();
