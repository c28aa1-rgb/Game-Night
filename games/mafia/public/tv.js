/**
 * MAFIA â€” the TV.
 *
 * A thin client with one job the phones do not have: performing. It renders
 * whatever the server says the game looks like, and when the server hands it a
 * new beat it fires the whole sequence â€” klaxon flash, alarm tone, hard cut to
 * silence, narrator, cutscene, role reveal â€” in that order, every time.
 *
 * It holds no game controls. Setup, start, pause and reset all live on the
 * host's phone; this screen only reports. The two things it does own are its
 * own speakers: the narrator's voice and the ship's ambience.
 */

const socket = io('/mafia');
const el = (id) => document.getElementById(id);
const A = window.MafiaAvatar;
const SFX = window.MafiaSFX;
const Narrator = window.MafiaNarrator;
const Music = window.LobbyMusic;
const Cinematics = window.MafiaCinematics;

let state = null;
let lastBeatId = 0;
/** Local mirror of the phase clock, so the countdown is smooth between states. */
let clockLeft = 0;
let clockTotal = 0;
let clockStamp = Date.now();
let clockPaused = false;
/** The spotlight player currently being announced, so it is announced once. */
let lastSpotlightId = null;
/** When the narrator last started a line, so nothing talks over it. */
let lastBeatAt = 0;
const BEAT_FLOOR_MS = 3200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const STORE = 'mafia.tv.room';
let roomCode = (params.get('room') || sessionStorage.getItem(STORE) || '').toUpperCase();

socket.on('connect', () => {
  socket.emit('register_tv', { code: roomCode }, (res) => {
    if (res?.code) {
      roomCode = res.code;
      sessionStorage.setItem(STORE, res.code);
      loadJoinInfo(res.code);
    }
  });
});

async function loadJoinInfo(code) {
  el('join-code').textContent = code;
  el('hud-code').textContent = `Room ${code}`;
  try {
    const res = await fetch(`/mafia/api/join-info?code=${encodeURIComponent(code)}`);
    const info = await res.json();
    if (info.qr) el('join-qr').src = info.qr;
    el('join-url').textContent = info.url.replace(/^https?:\/\//, '');
  } catch {
    el('join-url').textContent = '';
  }
}

// ---------------------------------------------------------------------------
// Narration, ambience and the klaxon
// ---------------------------------------------------------------------------

Narrator.onLine((text, kind, meta) => {
  // The alarm dies the moment the voice starts â€” not when the line was queued.
  // That is the signature beat, and it only lands if it happens on the syllable.
  SFX.cut();
  el('caption').hidden = false;
  el('caption').querySelector('.caption__who').textContent = 'The House';
  el('caption-line').textContent = text;
});

Narrator.onSpeaking((on) => {
  // The bed drops under the narrator and comes back up afterwards. Silence
  // between lines would read as the sound having broken.
  SFX.duck(on);
  // And the ship waits: phases do not advance while this screen is mid-sentence.
  socket.emit('narration', { speaking: on });
});

/** Queue a line. The alarm is cut when it actually starts, in onLine above. */
function say(kind, vars) {
  return Narrator.say(kind, vars);
}

/**
 * The signature. A hard red wash sweeps the screen over a rising alarm, and
 * then everything stops dead the instant the narrator starts. The contrast is
 * the entire tone of the game: procedural visuals, interrupted by violence,
 * delivered completely flat.
 */
function klaxonFlash(amber = false) {
  const flash = el('flash');
  flash.classList.remove('is-firing', 'is-firing--amber');
  // Restart the animation rather than waiting out the old one.
  void flash.offsetWidth;
  flash.classList.add('is-firing');
  if (amber) flash.classList.add('is-firing--amber');
  if (amber) SFX.caution(); else SFX.klaxon();
}

/** Flash, let the alarm rise, then cut it with the line. */
async function alarmThen(kind, vars, amber = false) {
  klaxonFlash(amber);
  await sleep(amber ? 460 : 620);
  return say(kind, vars);
}

/** What the ship sounds like during each phase. */
const AMBIENCE_FOR = {
  lobby: 'lobby',
  // The opening has a score of its own; the ambience bed would only fight it.
  intro: null,
  night_intro: 'night',
  night_mafia: 'night',
  night_detective: 'night',
  night_doctor: 'night',
  morning: 'day',
  discussion: 'day',
  voting: 'vote',
  elimination: 'day',
  revenge: 'vote',
  game_over: null,
};

/**
 * The lobby's music.
 *
 * A separate thing from the ambience above, and from a different file: the bed
 * that plays on every game's waiting screen, shared from /hub/lobby-music.js.
 * It belongs to exactly one phase â€” the lobby â€” and has to be gone by the time
 * anything else on this screen makes a noise. The opening is the case that
 * matters: it is ninety seconds of recorded town dialogue over a score of its
 * own, and there is nothing this bed could add to it except a second key.
 *
 * Safe to call on every state, including the ones that do not change phase:
 * start() only acts the first time and stop() only acts if something is
 * playing.
 */
function syncLobbyMusic(phase) {
  if (!Music) return;
  if (phase === 'lobby') Music.start({ key: 'mafia' });
  else Music.stop();
}

// ---------------------------------------------------------------------------
// The opening
// ---------------------------------------------------------------------------

/**
 * Clear whatever is performing.
 *
 * There are two stages now â€” the filmed opening and the drawn cutscenes â€” and
 * every reason to stop one is a reason to stop the other. Anything that ends a
 * game abruptly (the menu, a reset, a room closing) goes through here, so a
 * ninety-second cinematic can never keep playing over a lobby.
 */
function stopShow() {
  Cinematics?.stop?.();
}

/**
 * Show a caption for somebody other than the ship.
 *
 * The town are pre-rendered audio, so they never touch the narrator â€” but the
 * caption is not decoration. Synthesised or recorded, the line on screen is
 * what actually carries the plot in a loud room, and with three voices it now
 * has to say who is talking as well as what they said.
 */
function townCaption(who, text) {
  el('caption').hidden = false;
  el('caption').querySelector('.caption__who').textContent = who;
  el('caption-line').textContent = text;
}

/**
 * The opening, in two halves.
 *
 * First the filmed disaster, told by three town who do not survive it. Then
 * three seconds of nothing. Then the ship â€” in the same synthesised voice it
 * will use for the rest of the game â€” counts the survivors over the roll call.
 *
 * If the film is not ready, the drawn opening plays instead and tells the whole
 * story itself. That path is not a degraded mode anyone should notice; it is
 * the opening this game shipped with, kept working on purpose.
 */
async function playOpening(town) {
  stopShow();
  SFX.cut();
  if (Music) Music.stop();
  el('caption').hidden = false;
  el('caption').querySelector('.caption__who').textContent = 'The House';
  // The picture establishes the club while the House speaks. The scene is
  // drawn from actual players, so the roll call belongs to this table.
  Cinematics?.intro?.({ town });
  Narrator.sayIntro({ count: town.length });
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

async function handleBeat(beat) {
  switch (beat.kind) {
    case 'intro':
      await playOpening(beat.town || []);
      break;

    case 'game_start':
      stopShow();
      await alarmThen('game_start');
      break;

    case 'night_begins':
      SFX.lightsOut();
      say('night_begins');
      break;

    case 'turn_mafia':
    case 'turn_detective':
    case 'turn_doctor':
      say(beat.kind);
      break;

    case 'morning_hit':
      await alarmThen('morning_hit', { name: beat.victim.name });
      playDeath(beat.victim, 'hit', false);
      break;

    case 'morning_quiet':
      SFX.dayBreak();
      say('morning_quiet');
      break;

    case 'discussion_opens':
      say('discussion_opens');
      break;

    case 'vote_opens':
      say('vote_opens');
      break;

    case 'vote_early':
      say('vote_early');
      break;

    case 'vote_out': {
      say('vote_closes');
      // The tally gets a moment of its own before the verdict lands.
      await sleep(1500);
      await alarmThen('vote_out', { name: beat.victim.name });
      playDeath(beat.victim, 'vote', false);
      break;
    }

    case 'vote_none':
      say('vote_closes');
      await sleep(1400);
      await alarmThen('vote_none', {}, true);
      flashReport('No verdict', 'The table could not agree.');
      break;

    case 'revenge_opens':
      await alarmThen('revenge_opens', { officer: beat.officer.name }, true);
      break;

    case 'revenge_kill':
      await alarmThen('revenge_kill', { officer: beat.officer.name, name: beat.victim.name });
      playDeath(beat.victim, 'revenge', true);
      break;

    case 'revenge_none':
      say('revenge_none', { officer: beat.officer.name });
      break;

    case 'win_town':
    case 'win_mafia': {
      const town = beat.kind === 'win_town';
      stopShow();
      klaxonFlash(town);
      await sleep(560);
      SFX.cut();
      SFX.win(town);
      Narrator.say(beat.kind, { count: state?.aliveCount ?? 0 });
      break;
    }

    default:
      break;
  }
}

/**
 * "Marlowe, defend yourself."
 *
 * The first spotlight lands in the same instant as the beat that opened the
 * discussion, and render() runs before the beat does â€” so without this the
 * spotlight line would be spoken first and then immediately talked over. It
 * waits for the opening line to have had the floor.
 */
function announceSpotlight(player) {
  const wait = Math.max(0, BEAT_FLOOR_MS - (Date.now() - lastBeatAt));
  setTimeout(() => {
    if (state?.discussion?.spotlightId === player.id) say('spotlight', { name: player.name });
  }, wait);
}

function flashReport(victimOrTitle, note) {
  const victim = typeof victimOrTitle === 'object' ? victimOrTitle : null;
  el('report-figure').innerHTML = victim
    ? A.svg({ hex: victim.colour.hex, size: 128, state: 'dead' })
    : A.svg({ hex: '#B88845', size: 112 });
  el('report-label').textContent = 'The House records';
  el('report-line').textContent = victim ? victim.name : victimOrTitle;
  el('report-sub').textContent = note;
}

function playDeath(victim, method, harsh) {
  flashReport(victim, method === 'hit' ? 'Gone before morning.' : 'The table has rendered its verdict.');
  Cinematics?.eliminate?.({ victim, method, seed: state?.beat?.id });
  // Give the visual impact room to land before the public role is printed.
  setTimeout(() => say('role_tag', { role: victim.role }), harsh ? 2200 : 2600);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PHASE_LABEL = {
  lobby: 'Awaiting town',
  intro: 'The House opens',
  night_intro: 'Night falls',
  night_mafia: 'Mafia move',
  night_detective: 'Detective sweep',
  night_doctor: 'Doctor rounds',
  morning: 'Morning ledger',
  discussion: 'Discussion',
  voting: 'Voting',
  elimination: 'Ejection',
  revenge: 'Parting shot',
  game_over: 'Final report',
};

const SCREEN_FOR = {
  lobby: 'screen-lobby',
  intro: 'screen-night',
  night_intro: 'screen-night',
  night_mafia: 'screen-night',
  night_detective: 'screen-night',
  night_doctor: 'screen-night',
  morning: 'screen-report',
  discussion: 'screen-talk',
  voting: 'screen-vote',
  elimination: 'screen-tally',
  revenge: 'screen-revenge',
  game_over: 'screen-over',
};

const SCREENS = ['screen-lobby', 'screen-night', 'screen-report', 'screen-talk',
  'screen-vote', 'screen-tally', 'screen-revenge', 'screen-over'];

/** The lights-out glyph. Everything else borrows the cutscene's role icons. */
const NIGHT_GLYPH = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4">
  <circle cx="50" cy="50" r="34" />
  <path d="M50 16 A34 34 0 0 0 50 84" fill="currentColor" stroke="none" opacity="0.28" />
  <path d="M12 50 H2 M98 50 H88 M50 12 V2 M50 98 V88" stroke-linecap="round" />
</svg>`;

const NIGHT_VIEW = {
  intro: { glyph: NIGHT_GLYPH, tint: 'var(--klaxon)', title: 'The House', note: 'The ledger is opening.' },
  deal: {
    glyph: A.svg({ hex: '#B88845', size: 96 }),
    tint: 'var(--amber)',
    title: 'Check your phone',
    note: 'Your assignment is on your own screen. Nobody else\'s is.',
  },
  night_intro: { glyph: NIGHT_GLYPH, tint: 'var(--muted)', title: 'Lights out', note: 'Everyone, eyes closed.' },
  night_mafia: { glyph: A.svg({ hex: '#8D1E20', size: 96 }), tint: 'var(--klaxon)', title: 'Mafia', note: 'Mafia are choosing. Everyone else, eyes closed.' },
  night_detective: { glyph: A.svg({ hex: '#B88845', size: 96 }), tint: 'var(--terminal)', title: 'Detective', note: 'One investigation is being made. Everyone else, eyes closed.' },
  night_doctor: { glyph: A.svg({ hex: '#E8F3F7', size: 96 }), tint: '#E8F3F7', title: 'Doctor', note: 'One player is being protected. Everyone else, eyes closed.' },
};

socket.on('game_state', (next) => {
  const phaseChanged = !state || state.phase !== next.phase;
  state = next;

  clockPaused = next.paused;
  clockTotal = next.phaseMs;
  clockLeft = next.msLeft;
  clockStamp = Date.now();

  if (phaseChanged) SFX.ambience(AMBIENCE_FOR[next.phase] ?? null);

  // Before render(), and before the beat below fires the opening: this is the
  // last moment at which the music is allowed to still be going.
  syncLobbyMusic(next.phase);

  // Dropped back to the lobby mid-game â€” by this screen's menu or by the host's
  // phone. Whatever was playing is now about a game that no longer exists.
  if (phaseChanged && next.phase === 'lobby') {
    stopShow();
    Narrator.cancel();
    el('caption-line').textContent = '';
  }

  // Every trip through the lobby is another chance to have the opening ready
  // before it is wanted â€” including the second game of the night, and the case
  // where this screen reconnected after the sound gate was already dealt with.
  if (next.phase === 'lobby') warmTheFilm();

  render();

  if (next.beat && next.beat.id !== lastBeatId) {
    lastBeatId = next.beat.id;
    lastBeatAt = Date.now();
    handleBeat(next.beat);
  }
});

function render() {
  if (!state) return;
  const phase = state.phase;

  document.body.classList.toggle('is-paused', state.paused);

  // Cycle 0 is the deal: the game has started but the first night has not, and
  // the only thing anybody should be doing is reading their own phone.
  const dealing = phase === 'night_intro' && state.cycle === 0;
  el('hud-phase').textContent = dealing ? 'Roles dealt' : (PHASE_LABEL[phase] || phase);
  el('hud-cycle').textContent = phase === 'lobby' ? 'Standby'
    : phase === 'game_over' ? 'Game over'
      : phase === 'intro' ? 'The House Â· opening the ledger'
        : dealing ? 'Town manifest' : `Cycle ${state.cycle}`;

  const wash = el('wash');
  wash.classList.toggle('is-live', phase !== 'lobby' && phase !== 'game_over');

  for (const id of SCREENS) el(id).hidden = id !== SCREEN_FOR[phase];

  el('roster').hidden = phase === 'lobby' || phase === 'game_over' || phase === 'intro';
  // The caption sits above the cutscenes, so it stays up through the opening
  // and through every reveal.
  el('caption').hidden = phase === 'lobby';

  if (phase === 'lobby') renderLobby();
  if (phase === 'intro' || phase.startsWith('night')) renderNight(phase);
  if (phase === 'morning') renderReport();
  if (phase === 'discussion') renderTalk();
  if (phase === 'voting') renderVote();
  if (phase === 'elimination') renderTally();
  if (phase === 'revenge') renderRevenge();
  if (phase === 'game_over') renderOver();

  renderRoster();
  tickClock();
}

// --- Lobby -----------------------------------------------------------------

function renderLobby() {
  const players = state.players;
  el('muster-count').textContent = `${players.length} / ${state.maxPlayers}`;
  el('muster-empty').hidden = players.length > 0;

  el('muster-grid').innerHTML = players.map((player) => `
    <div class="recruit${player.connected ? '' : ' is-away'}${player.id === state.hostId ? ' is-host' : ''}">
      ${A.svg({ hex: player.colour.hex, size: 62, idle: true })}
      <span class="recruit__name">${A.escapeHtml(player.name)}</span>
      <span class="recruit__colour">${player.id === state.hostId ? 'Host' : A.escapeHtml(player.colour.name)}</span>
    </div>`).join('');

  const config = state.config;
  const minutes = Math.round(config.discussionMs / 60000 * 10) / 10;
  const rows = [
    ['Detective Officer', config.detective],
    ['Doctor', config.doctor],
    ['Vigilante Officer', config.vigilante],
    ['Godfather', config.godfather && players.length >= 7],
    ['Spotlight', config.spotlight],
  ];

  el('briefing').innerHTML = rows.map(([label, on]) => `
    <li class="briefing__row${on ? ' is-on' : ''}">
      <span>${label}</span><b>${on ? 'On' : 'Off'}</b>
    </li>`).join('')
    + `<li class="briefing__row is-info"><span>Discussion</span><b>${minutes} min</b></li>`;

  el('host-name').textContent = state.hostName || 'Nobody yet';

  const enough = players.length >= state.minPlayers;
  el('setup-brief').textContent = enough
    ? `${players.length} town Â· ${state.mafiaCount} mafia${state.mafiaCount === 1 ? '' : 's'} Â· start from the host's phone`
    : `${state.minPlayers - players.length} more town needed`;
}

// --- Night -----------------------------------------------------------------

function renderNight(phase) {
  const view = phase === 'intro' ? NIGHT_VIEW.intro
    : phase === 'night_intro' && state.cycle === 0 ? NIGHT_VIEW.deal
      : (NIGHT_VIEW[phase] || NIGHT_VIEW.night_intro);
  const glyph = el('night-glyph');
  glyph.innerHTML = view.glyph;
  glyph.style.color = view.tint;
  el('night-title').textContent = view.title;
  el('night-note').textContent = view.note;
}

// --- Morning ---------------------------------------------------------------

function renderReport() {
  const beat = state.beat || {};
  const card = el('report-card');
  const fatal = beat.kind === 'morning_hit';
  card.classList.toggle('is-fatal', fatal);
  card.classList.toggle('is-quiet', !fatal);
  el('report-label').textContent = `Cycle ${state.cycle} Â· overnight`;
  el('report-line').textContent = fatal ? `${beat.victim.name} was taken` : 'Nobody was taken';
  el('report-sub').textContent = fatal
    ? `${beat.victim.colour?.name || ''} Â· ${beat.victim.roleLabel}`
    : 'The town is intact. Somebody is disappointed.';
  el('report-figure').innerHTML = fatal
    ? A.svg({ hex: beat.victim.colour?.hex, size: 120, state: 'dead' })
    : '';
}

// --- Discussion ------------------------------------------------------------

function renderTalk() {
  const talk = state.discussion;
  if (!talk) return;

  const spotlit = talk.kind === 'spotlight' && talk.spotlightId;
  el('talk-spotlight').hidden = !spotlit;
  el('talk-open').hidden = spotlit;

  if (spotlit) {
    const player = state.players.find((p) => p.id === talk.spotlightId);
    if (player) {
      el('talk-figure').innerHTML = A.svg({ hex: player.colour.hex, size: 180 });
      el('talk-name').textContent = player.name;
      if (lastSpotlightId !== player.id) {
        lastSpotlightId = player.id;
        announceSpotlight(player);
      }
    }
  } else {
    lastSpotlightId = null;
  }

  el('talk-total').textContent = `${formatClock(remaining(talk.totalMsLeft))} of discussion left`;
  // Ballots can already be coming in. The count is public; the targets are not.
  el('talk-votes').textContent = state.votesIn
    ? `${state.votesIn} of ${state.aliveCount} have already voted`
    : 'Nobody has voted yet';
}

// --- Voting ----------------------------------------------------------------

function renderVote() {
  const alive = state.players.filter((p) => p.alive);
  const voted = new Set(state.voted || []);

  el('vote-grid').innerHTML = alive.map((player) => `
    <div class="ballot${voted.has(player.id) ? ' is-in' : ''}">
      ${A.svg({ hex: player.colour.hex, size: 58 })}
      <span class="ballot__name">${A.escapeHtml(player.name)}</span>
      <span class="ballot__state">${voted.has(player.id) ? 'Ballot in' : 'Waiting'}</span>
    </div>`).join('');

  el('vote-count').textContent = `${state.votesIn} of ${alive.length} ballots in Â· ${state.voteNeeded} to eject`;
}

// --- Tally -----------------------------------------------------------------

/** Which tally we last animated, so the bars only count up once. */
let tallyKey = null;

function renderTally() {
  const vote = state.lastVote;
  if (!vote) return;

  const top = Math.max(vote.needed, ...vote.tally.map((row) => row.votes), 1);
  el('tally-label').textContent = vote.eliminatedId ? 'Ejected by majority' : 'No majority';

  el('tally-rows').innerHTML = vote.tally.map((row) => `
    <div class="tally__row${row.id === vote.eliminatedId ? ' is-out' : ''}">
      ${A.svg({ hex: row.colour.hex, size: 30 })}
      <span class="tally__name">${A.escapeHtml(row.name)}</span>
      <span class="tally__bar"><i data-width="${(row.votes / top) * 100}"></i></span>
      <span class="tally__votes">${row.votes}</span>
    </div>`).join('');

  requestAnimationFrame(() => {
    for (const bar of document.querySelectorAll('#tally-rows .tally__bar i')) {
      bar.style.width = `${bar.dataset.width}%`;
    }
  });

  el('tally-need').textContent = `${vote.needed} needed Â· ${vote.abstained.length} did not vote`;

  // Count the ballots out loud, once per tally.
  const key = `${state.cycle}:${state.beat?.id}`;
  if (tallyKey !== key) {
    tallyKey = key;
    const total = vote.tally.reduce((sum, row) => sum + row.votes, 0);
    for (let i = 0; i < total; i++) setTimeout(() => SFX.tallyTick(i), 120 + i * 130);
    setTimeout(() => SFX.tallyLand(), 220 + total * 130);
  }
}

// --- Revenge ---------------------------------------------------------------

function renderRevenge() {
  const officer = state.revengeBy;
  if (!officer) return;
  el('revenge-figure').innerHTML = A.svg({ hex: officer.colour.hex, size: 150, state: 'dead' });
  el('revenge-title').textContent = `${officer.name} was Vigilante`;
}

// --- Game over -------------------------------------------------------------

function renderOver() {
  const winner = state.winner;
  if (!winner) return;
  const town = winner.side === 'town';

  const over = document.querySelector('.over');
  over.classList.toggle('is-town', town);
  over.classList.toggle('is-mafia', !town);
  el('over-title').textContent = town ? 'Town survives' : 'Mafia own the room';
  el('over-label').textContent = `Cycle ${state.cycle} Â· final report`;

  el('over-roster').innerHTML = winner.roster.map((player) => `
    <div class="final is-${player.team}${player.alive ? '' : ' is-dead'}">
      ${A.svg({ hex: player.colour.hex, size: 64, state: player.alive ? 'alive' : 'dead' })}
      <span class="final__name">${A.escapeHtml(player.name)}</span>
      <span class="final__role">${A.escapeHtml(player.roleLabel)}</span>
    </div>`).join('');

  // A win immediately after an ejection used to replace the tally screen with
  // the winner screen. Keep the last public count on the final report, so the
  // ending still answers the argument the room was just having.
  const vote = state.lastVote;
  const finalTally = el('over-tally');
  finalTally.hidden = !vote;
  if (vote) {
    const top = Math.max(vote.needed, ...vote.tally.map((row) => row.votes), 1);
    el('over-tally-rows').innerHTML = vote.tally.map((row) => `
      <div class="over__tally-row${row.id === vote.eliminatedId ? ' is-out' : ''}">
        <span>${A.escapeHtml(row.name)}</span>
        <i><b style="width:${(row.votes / top) * 100}%"></b></i>
        <strong>${row.votes}</strong>
      </div>`).join('');
    const ballots = vote.ballots?.length || 0;
    el('over-tally-note').textContent = `${ballots} ballots cast · ${vote.abstained.length} abstained · ${vote.needed} needed`;
  }

  el('over-next').textContent = state.hostName
    ? `${state.hostName} starts the next game from their phone`
    : 'The host starts the next game from their phone';
}

// --- Roster ----------------------------------------------------------------

function renderRoster() {
  if (el('roster').hidden) return;
  const spotlightId = state.discussion?.spotlightId;

  el('roster').innerHTML = state.players.map((player) => {
    const classes = ['pip'];
    if (!player.alive) classes.push('is-dead');
    if (!player.connected) classes.push('is-away');
    if (player.id === spotlightId) classes.push('is-speaking');
    return `
      <div class="${classes.join(' ')}">
        ${A.svg({ hex: player.colour.hex, size: 44, state: player.alive ? 'alive' : 'dead' })}
        <span class="pip__name">${A.escapeHtml(player.name)}</span>
        <span class="pip__colour">${A.escapeHtml(player.alive ? player.colour.name : player.revealedRoleLabel || 'Gone')}</span>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

/**
 * Milliseconds left, counted locally from the last state.
 *
 * A paused clock is genuinely frozen â€” the server stops counting, so this has
 * to stop counting too rather than draining towards zero behind the pause
 * overlay while nothing is actually happening.
 */
function remaining(snapshot) {
  if (clockPaused) return snapshot;
  return Math.max(0, snapshot - (Date.now() - clockStamp));
}

function tickClock() {
  if (!state) return;
  const running = state.phase !== 'lobby' && state.phase !== 'game_over';
  const left = remaining(clockLeft);

  // Holding: the phase is over and the ship is finishing a sentence.
  el('hud-clock').textContent = !running ? '' : state.holding ? 'â€¢â€¢â€¢' : formatClock(left);
  const urgent = running && !clockPaused && !state.holding && left <= 5000 && left > 0;
  el('hud-clock').classList.toggle('is-urgent', urgent);

  const fill = el('meter-fill');
  const share = running && clockTotal ? Math.max(0, Math.min(1, left / clockTotal)) : 0;
  fill.style.width = `${share * 100}%`;
  fill.classList.toggle('is-urgent', urgent);
  fill.classList.toggle('is-paused', clockPaused);

  // The ship gets more insistent as a phase runs out.
  SFX.setIntensity(running ? 1 - share : 0);

  if (state.phase === 'discussion' && state.discussion) {
    el('talk-total').textContent = `${formatClock(remaining(state.discussion.totalMsLeft))} of discussion left`;
  }
}

setInterval(tickClock, 250);

// ---------------------------------------------------------------------------
// This screen's own controls â€” sound, and which voice reads the lines
// ---------------------------------------------------------------------------

/**
 * The gesture that unlocks audio.
 *
 * Both the Web Audio context and speechSynthesis stay muted until the page has
 * been interacted with, and every game control now lives on the host's phone â€”
 * so this screen has to ask for one click of its own, or it would narrate the
 * whole game silently.
 */
function openTheDoors() {
  el('gate').hidden = true;
  SFX.prime();
  // The same gesture lets the lobby bed in. It would catch this click by itself
  // â€” it listens for the first one anywhere on the page â€” but saying so here
  // means the music comes up with everything else rather than a frame later.
  if (Music) Music.unlock();
  // Speaking one short line here is what actually unlocks speech synthesis for
  // the rest of the session on the strict browsers.
  if (SFX.enabled) Narrator.say('sound_check');
  // Decoding the opening's dialogue needs a running AudioContext, which needs
  // this gesture. Everything else could start earlier; the voices could not.
  warmTheFilm();
}

/**
 * Fetch the opening ahead of time.
 *
 * The cinematic is about ten megabytes of footage, and there is exactly one
 * stretch of a Mafia session where nobody is waiting on the screen: the lobby,
 * while people find the room code and type their names. That is where this
 * belongs. By the time the host presses start it is either ready or it is not,
 * and if it is not the drawn opening plays instead â€” nobody waits on a loading
 * bar in front of a room.
 *
 * Safe to call repeatedly: the first call owns the work and the rest join it.
 */
function warmTheFilm() {
  return;
  // Not `ready` alone: the pictures can be loaded while the dialogue is not,
  // and stopping here on `ready` would mean a voice decode that failed before
  // the sound gate never got a second chance.
  if (!Film || (Film.ready && Film.voiced)) return;
  Film.preload(document.body).then((res) => {
    if (res && res.loaded) return;
    // Not fatal, and not worth saying out loud on screen â€” the fallback is a
    // complete opening. Leave a trace for whoever is looking at the console.
    console.info('[mafia] filmed opening unavailable; using the drawn one', res);
  });
}

el('gate-btn').addEventListener('click', openTheDoors);
document.addEventListener('click', () => SFX.prime(), { once: true });

// ---------------------------------------------------------------------------
// The way out
//
// Available in every phase, from the screen that is physically in the room.
// Two taps: one to open the menu, one to confirm â€” this can end a game that is
// halfway through, so it should not be reachable by accident.
// ---------------------------------------------------------------------------

let armed = null;

function closeMenu() {
  el('menu').hidden = true;
  el('menu-btn').setAttribute('aria-expanded', 'false');
  el('menu-status').textContent = '';
  disarm();
}

function disarm() {
  if (!armed) return;
  armed.node.classList.remove('is-armed');
  armed.node.querySelector('.menu__name').textContent = armed.label;
  clearTimeout(armed.timer);
  armed = null;
}

/** First tap arms, second tap fires. Disarms itself after a few seconds. */
function arm(node, label, run) {
  if (armed?.node === node) {
    const go = armed.run;
    disarm();
    closeMenu();
    go();
    return;
  }
  disarm();
  const nameNode = node.querySelector('.menu__name');
  // Long enough to cross a room and press it again.
  armed = { node, label, run, timer: setTimeout(disarm, 7000) };
  node.classList.add('is-armed');
  nameNode.textContent = 'Tap again to confirm';
  SFX.nope();
}

el('menu-btn').addEventListener('click', () => {
  const menu = el('menu');
  menu.hidden = !menu.hidden;
  el('menu-btn').setAttribute('aria-expanded', String(!menu.hidden));
  if (menu.hidden) disarm();
  SFX.prime();
});

el('menu-cancel').addEventListener('click', closeMenu);

/**
 * Send a control and say what happened.
 *
 * A TV cannot have a silent failure: nobody is going to open a console in front
 * of a room full of people. Two things get reported â€” the server refusing, and
 * the server not answering at all, which is what happens when the page is
 * talking to a process that was started before the event existed.
 */
function sendControl(name) {
  const status = el('menu-status');
  status.textContent = '';
  let answered = false;

  const giveUp = setTimeout(() => {
    if (answered) return;
    status.textContent = 'No answer from the House. If the server has been running since before this '
      + 'control was added, restart it â€” then reload this screen.';
    el('menu').hidden = false;
    el('menu-btn').setAttribute('aria-expanded', 'true');
    SFX.nope();
  }, 2500);

  socket.emit(name, {}, (res) => {
    answered = true;
    clearTimeout(giveUp);
    if (!res?.error) return;
    status.textContent = res.error;
    el('menu').hidden = false;
    el('menu-btn').setAttribute('aria-expanded', 'true');
    SFX.nope();
  });
}

el('menu-lobby').addEventListener('click', (event) => {
  arm(event.currentTarget, 'Back to the lobby', () => {
    stopShow();
    Narrator.cancel();
    sendControl('reset_game');
  });
});

el('menu-close').addEventListener('click', (event) => {
  arm(event.currentTarget, 'Close the room', () => {
    stopShow();
    Narrator.cancel();
    sendControl('close_room');
  });
});

// Somebody closed the room â€” this screen picks up the fresh code and starts over.
socket.on('room_closed', ({ code }) => {
  stopShow();
  Narrator.cancel();
  SFX.ambience(null);
  lastBeatId = 0;
  state = null;
  sessionStorage.setItem(STORE, code);
  roomCode = code;
  socket.emit('register_tv', { code }, (res) => {
    if (res?.code) loadJoinInfo(res.code);
  });
});

el('sound-btn').addEventListener('click', () => {
  const on = SFX.toggle();
  Narrator.setEnabled(on);
  el('sound-btn').textContent = on ? 'Sound on' : 'Sound off';
  el('sound-btn').setAttribute('aria-pressed', String(on));
});

/**
 * The lobby bed's own switch.
 *
 * Deliberately not folded into the sound button: this game's alarms and its
 * narrator are the game, and the music is not. Somebody who wants one without
 * the other should be able to have it â€” and because the preference is stored
 * site-wide, pressing it here settles the question for every game.
 */
function paintMusicButton() {
  const btn = el('music-btn');
  if (!btn) return;
  const on = Music ? Music.isEnabled() : false;
  btn.textContent = on ? 'Music on' : 'Music off';
  btn.setAttribute('aria-pressed', String(on));
  // Nothing to offer if the browser has no Web Audio at all.
  btn.disabled = !Music;
}

el('music-btn').addEventListener('click', () => {
  if (!Music) return;
  Music.setEnabled(!Music.isEnabled());
  paintMusicButton();
});

/**
 * Voices load asynchronously and Chrome usually returns an empty list on the
 * first ask, so this is refreshed a few times rather than read once.
 */
function refreshVoices() {
  const select = el('voice-select');
  const list = Narrator.voices();
  if (!list.length) {
    select.innerHTML = '<option>Default voice</option>';
    return;
  }
  const current = Narrator.voiceName;
  select.innerHTML = list.map((v) => `
    <option value="${A.escapeHtml(v.name)}"${v.name === current ? ' selected' : ''}>
      ${A.escapeHtml(v.name.replace(/\s*-\s*English.*$/i, '').replace(/Microsoft |Google /, ''))}
    </option>`).join('');
}

el('voice-select').addEventListener('change', (event) => {
  Narrator.setVoice(event.target.value);
  SFX.prime();
  // Say something in the new voice, so picking one is a decision you can hear.
  Narrator.say('sound_check');
});

refreshVoices();
setTimeout(refreshVoices, 1200);
setTimeout(refreshVoices, 3500);

// Mount both stages once; every sequence reuses them. The film goes in after
// the cutscene layer so the roll call and the title draw over it, not under.

el('sound-btn').textContent = SFX.enabled ? 'Sound on' : 'Sound off';
Narrator.setEnabled(SFX.enabled);
paintMusicButton();

/*
 * Ask for the bed before the first state arrives.
 *
 * This screen opens on the lobby and stays there until a host does something,
 * which can be several minutes. The request is safe this early: the module
 * remembers it and starts on the first gesture â€” the one the sound gate is
 * about to collect anyway â€” and the next game_state either confirms the lobby
 * or stops it.
 */
syncLobbyMusic('lobby');
