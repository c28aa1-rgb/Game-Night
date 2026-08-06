/**
 * MAYDAY — the phone.
 *
 * Everything private in this game happens on this screen: your role, your
 * teammates, your scan result, your vote. Two rules shape it.
 *
 *   · It renders what the server told *this* socket. The phone never receives
 *     another living player's role, so it cannot leak one.
 *   · It stays quiet. No sound, no full-bleed saboteur red — a phone held at
 *     arm's length on a sofa should not tell the room anything. The role sits
 *     behind a chip you deliberately open.
 */

const socket = io('/mayday');
const el = (id) => document.getElementById(id);
const A = window.MaydayAvatar;

const STORE = 'mayday.player';

let pub = null;
let priv = null;
/**
 * The deal card. It opens itself once, when the roles land, and then gets out
 * of the way at the next phase — a player who never taps "Understood" must
 * still be shown their night action and their vote. Opening it from the suit
 * chip pins it, because then it was asked for.
 */
let roleCardOpen = false;
let roleCardPinned = false;
let seenRole = null;
/** Set when a player opens the ballot during the discussion, before it is due. */
let earlyVoteOpen = false;
let clockLeft = 0;
let clockStamp = Date.now();
let toastTimer = null;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function readIdentity() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {
    return null;
  }
}

const saveIdentity = (next) => localStorage.setItem(STORE, JSON.stringify(next));

(function prefill() {
  const saved = readIdentity();
  const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (room) {
    el('code-input').value = room;
    el('code-field').hidden = true;
  } else if (saved?.code) {
    el('code-input').value = saved.code;
  }
  if (saved?.name) el('name-input').value = saved.name;
})();

/*
 * Reconnect by name is the server's job; this just asks. Read storage fresh on
 * every connect so a phone that locked, died or reloaded mid-game gets its
 * role, its alive-or-dead status and its half-finished action back with the
 * next state — no re-entering anything.
 */
socket.on('connect', () => {
  const saved = readIdentity();
  if (!saved?.playerId) return;
  socket.emit('rejoin', saved, (res) => {
    if (res?.error) {
      // The room is gone or this is a different game — fall back to joining by
      // name, which is also how a phone recovers after a server restart.
      socket.emit('join_game', { name: saved.name, code: saved.code }, (retry) => {
        if (retry?.error) {
          localStorage.removeItem(STORE);
          show('screen-join');
        } else {
          saveIdentity({ ...saved, playerId: retry.playerId, code: retry.code });
        }
      });
    }
  });
});

function join() {
  const name = el('name-input').value.trim();
  const code = el('code-input').value.trim().toUpperCase();
  if (!name) {
    el('join-error').textContent = 'Enter a name to join.';
    return;
  }

  el('join-btn').disabled = true;
  socket.emit('join_game', { name, code }, (res) => {
    el('join-btn').disabled = false;
    if (res?.error) {
      el('join-error').textContent = res.error;
      return;
    }
    el('join-error').textContent = '';
    saveIdentity({ playerId: res.playerId, code: res.code, name });
  });
}

el('join-btn').addEventListener('click', join);
for (const id of ['name-input', 'code-input']) {
  el(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
}

function send(event, payload) {
  socket.emit(event, payload || {}, (res) => {
    if (res?.error) toast(res.error);
  });
}

function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const ROLE_BRIEF = {
  saboteur: 'Each night, you and the others pick one crewmate to vent. By day, be appalled with everybody else.',
  mimic: 'You are a saboteur — you pick the target with your team. The difference: the Sensor\'s array reads your suit as human.',
  crew: 'No powers, no instruments. Watch who says what, and vote. That is the whole job.',
  sensor: 'Each night you scan one crewmate. The array reports Human or Saboteur. It can be wrong about a Mimic.',
  medic: 'Each night you seal one crewmate\'s quarters, which blocks a vent on them. Never the same person two nights running.',
  security: 'If the crew votes you out, you name one person on the way to the airlock. They go out with you.',
};

const SCREENS = ['screen-join', 'screen-lobby', 'screen-role', 'screen-act', 'screen-vote',
  'screen-quiet', 'screen-over'];

function show(id) {
  for (const screen of SCREENS) el(screen).hidden = screen !== id;
}

const EYES_GLYPH = `<svg viewBox="0 0 100 60" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
  <path d="M6 30 C24 46 76 46 94 30" />
  <path d="M18 40 L12 50 M50 46 L50 57 M82 40 L88 50" />
</svg>`;

const TALK_GLYPH = `<svg viewBox="0 0 100 76" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round">
  <path d="M8 10 H68 V48 H34 L18 62 V48 H8 Z" />
  <path d="M78 26 H92 V60 H84 V72 L72 60 H54" />
</svg>`;

const DEAD_GLYPH = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
  <circle cx="50" cy="50" r="36" />
  <path d="M34 38 L46 50 L34 62 M66 38 L54 50 L66 62" />
</svg>`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

socket.on('game_state', (next) => {
  const phaseChanged = pub && pub.phase !== next.phase;
  pub = next;
  clockLeft = next.msLeft;
  clockStamp = Date.now();
  if (phaseChanged) {
    if (!roleCardPinned) roleCardOpen = false;
    earlyVoteOpen = false;
  }
  render();
});

socket.on('private_state', (next) => {
  priv = next;
  // The deal: open the card once, unprompted. After that it is on the chip.
  if (priv.role && seenRole !== priv.role) {
    seenRole = priv.role;
    roleCardOpen = true;
    roleCardPinned = false;
  }
  if (!priv.role) {
    seenRole = null;
    roleCardOpen = false;
    roleCardPinned = false;
  }
  render();
});

socket.on('disconnect', () => toast('Lost the ship. Reconnecting…'));

/** The TV closed the room. Everybody is back at the join screen. */
socket.on('room_closed', ({ code }) => {
  localStorage.removeItem(STORE);
  pub = null;
  priv = null;
  seenRole = null;
  roleCardOpen = false;
  roleCardPinned = false;
  earlyVoteOpen = false;
  el('bar').hidden = true;
  if (code) el('code-input').value = code;
  el('join-error').textContent = 'That room was closed. Join the new one.';
  show('screen-join');
});

function me() {
  return pub?.players.find((p) => p.id === priv?.playerId) || null;
}

/** The first player to join runs the game from here. */
const iAmHost = () => !!(pub && priv && pub.hostId === priv.playerId);

function render() {
  if (!pub || !readIdentity()?.playerId) {
    show('screen-join');
    el('bar').hidden = true;
    return;
  }

  const mine = me();
  const phase = pub.phase;

  document.body.classList.toggle('is-night', phase.startsWith('night'));

  // --- Host controls, wherever the game is up to ---
  const running = phase !== 'lobby' && phase !== 'game_over';
  el('pause-btn').hidden = !(iAmHost() && running);
  el('pause-btn').textContent = pub.paused ? 'Resume' : 'Pause';
  el('pause-btn').classList.toggle('is-live', pub.paused);
  el('skip-btn').hidden = !(iAmHost() && phase === 'intro');
  el('again-btn').hidden = !(iAmHost() && phase === 'game_over');

  // --- Suit bar ---
  el('bar').hidden = !mine;
  if (mine) {
    el('bar').classList.toggle('is-dead', !mine.alive);
    el('bar-figure').innerHTML = A.svg({
      hex: mine.colour.hex, size: 34, state: mine.alive ? 'alive' : 'dead',
    });
    el('bar-name').textContent = mine.name;
    const label = el('bar-label');
    label.textContent = priv?.roleLabel ? (roleCardOpen ? priv.roleLabel : 'Tap for your role') : mine.colour.name;
    label.classList.toggle('is-hostile', roleCardOpen && priv?.team === 'saboteur');
    label.classList.toggle('is-crew', roleCardOpen && priv?.team === 'crew');
    el('role-chip').setAttribute('aria-expanded', String(roleCardOpen));
  }

  if (phase === 'lobby') {
    roleCardOpen = false;
    renderLobby();
    show('screen-lobby');
  } else if (phase === 'game_over') {
    renderOver();
    show('screen-over');
  } else if (roleCardOpen) {
    renderRole();
    show('screen-role');
  } else {
    renderPlay();
  }

  tickClock();
}

// --- Lobby -----------------------------------------------------------------

function renderLobby() {
  const mine = me();
  if (!mine) return;

  el('me-figure').innerHTML = A.svg({ hex: mine.colour.hex, size: 96, idle: true });
  el('me-name').textContent = mine.name;
  el('me-colour').textContent = `${mine.colour.name} suit`;

  el('swatches').innerHTML = pub.palette.map((colour) => {
    const mineNow = colour.takenBy === mine.name;
    const taken = colour.takenBy && !mineNow;
    return `
      <button class="swatch${mineNow ? ' is-mine' : ''}${taken ? ' is-taken' : ''}"
              type="button" data-colour="${colour.id}" ${taken ? 'disabled' : ''}
              style="--suit:${colour.hex}"
              data-label="${A.escapeHtml(taken ? colour.takenBy : colour.name)}"
              aria-label="${A.escapeHtml(colour.name)}${taken ? ` — taken by ${A.escapeHtml(colour.takenBy)}` : ''}">
        <i></i>
      </button>`;
  }).join('');

  const short = pub.minPlayers - pub.players.length;
  const host = pub.hostName || 'the host';
  el('lobby-note').textContent = short > 0
    ? `${short} more crew needed before this can start.`
    : iAmHost() ? 'Everybody aboard. Set it up and launch.' : `Ready when ${host} starts it.`;

  el('lobby-crew').innerHTML = pub.players
    .filter((player) => player.id !== mine.id)
    .map((player) => crewRow(player, player.id === pub.hostId ? 'Host' : player.colour.name))
    .join('');

  renderHostPanel();
}

/** The setup switches. Only the host has these, and only in the lobby. */
function renderHostPanel() {
  const panel = el('hostpanel');
  panel.hidden = !iAmHost();
  if (panel.hidden) return;

  const config = pub.config;
  for (const button of panel.querySelectorAll('.toggle')) {
    const on = !!config[button.dataset.key];
    button.classList.toggle('is-on', on);
    button.querySelector('.toggle__state').textContent = on ? 'On' : 'Off';
  }

  // The Mimic takes a saboteur slot, and below seven players there is only one
  // — turning the only saboteur into a Mimic would mean no scan could ever
  // come back positive.
  const mimicUseless = pub.players.length < 7;
  const mimic = panel.querySelector('.toggle[data-key="mimic"]');
  mimic.classList.toggle('is-muted', mimicUseless);
  el('mimic-note').textContent = mimicUseless
    ? 'A saboteur whose suit scans clean. Needs 7+ crew — inactive at this size.'
    : 'A saboteur whose suit scans clean. Takes one of the saboteur slots.';

  for (const button of panel.querySelectorAll('#setup-length button')) {
    button.classList.toggle('is-on', Number(button.dataset.ms) === config.discussionMs);
  }

  const enough = pub.players.length >= pub.minPlayers;
  el('start-btn').disabled = !enough;
  el('setup-brief').textContent = enough
    ? `${pub.players.length} crew · ${pub.saboteurCount} saboteur${pub.saboteurCount === 1 ? '' : 's'}`
    : `${pub.minPlayers - pub.players.length} more to launch`;
}

el('swatches').addEventListener('click', (event) => {
  const button = event.target.closest('.swatch');
  if (!button || button.disabled) return;
  send('pick_colour', { colour: button.dataset.colour });
});

function crewRow(player, meta, extraClass = '') {
  return `
    <div class="crewrow${player.alive === false ? ' is-dead' : ''} ${extraClass}">
      ${A.svg({ hex: player.colour.hex, size: 30, state: player.alive === false ? 'dead' : 'alive' })}
      <span class="crewrow__name">${A.escapeHtml(player.name)}</span>
      <span class="crewrow__meta">${A.escapeHtml(meta || '')}</span>
    </div>`;
}

// --- Role card -------------------------------------------------------------

function renderRole() {
  const hostile = priv.team === 'saboteur';
  const mine = me();
  el('role-eyebrow').textContent = hostile ? 'Assignment — keep it shut' : 'Assignment';

  if (mine) el('role-figure').innerHTML = A.svg({ hex: mine.colour.hex, size: 92, idle: true });
  el('role-win').textContent = hostile
    ? 'You win when saboteurs are no longer outnumbered'
    : 'You win when every saboteur is gone';

  const name = el('role-name');
  name.textContent = priv.roleLabel || 'Crew';
  name.classList.toggle('is-hostile', hostile);
  name.classList.toggle('is-crew', !hostile);
  el('role-brief').textContent = ROLE_BRIEF[priv.role] || '';

  const teammates = priv.teammates || [];
  el('role-team').hidden = !teammates.length;
  if (teammates.length) {
    el('role-teammates').innerHTML = teammates.map((mate) => {
      const player = pub.players.find((p) => p.id === mate.id);
      if (!player) return '';
      return crewRow(player, mate.role === 'mimic' ? 'Mimic' : 'Saboteur', 'is-hostile');
    }).join('');
  }

  const scans = priv.scans || [];
  el('role-log').hidden = !scans.length;
  if (scans.length) {
    el('role-scans').innerHTML = scans.map((scan) => `
      <div class="scan">
        ${A.svg({ hex: scan.colour.hex, size: 26 })}
        <span>${A.escapeHtml(scan.name)}</span>
        <span class="scan__reading is-${scan.reading}">${scan.reading === 'saboteur' ? 'Saboteur' : 'Human'}</span>
      </div>`).join('');
  }
}

el('role-chip').addEventListener('click', () => {
  if (!priv?.role) return;
  roleCardOpen = !roleCardOpen;
  roleCardPinned = roleCardOpen;
  render();
});

el('role-close').addEventListener('click', () => {
  roleCardOpen = false;
  roleCardPinned = false;
  render();
});

// --- Play ------------------------------------------------------------------

function renderPlay() {
  const mine = me();
  const phase = pub.phase;
  const alive = !!mine?.alive;

  // The parting shot belongs to somebody who has just been ejected, so it has
  // to be checked before the "you are gone" screen — otherwise the one player
  // the game is waiting on is the one player who cannot answer.
  if (phase === 'revenge' && pub.revengeBy?.id === priv.playerId) return revengeAct();

  if (!alive) return quiet(DEAD_GLYPH, 'You are gone', deadNote());

  if (phase === 'night_saboteurs' && priv.team === 'saboteur') return saboteurAct();
  if (phase === 'night_sensor' && priv.role === 'sensor') return sensorAct();
  if (phase === 'night_medic' && priv.role === 'medic') return medicAct();
  if (phase === 'voting') return voteAct();
  // Voting early is a deliberate choice, so it takes a tap to open.
  if (phase === 'discussion' && earlyVoteOpen) return voteAct();

  switch (phase) {
    case 'intro':
      return quiet(TALK_GLYPH, 'Watch the TV', 'The ship is explaining how this happened.');
    case 'night_intro':
      return quiet(EYES_GLYPH, 'Lights out', 'Close your eyes. The ship is counting.');
    case 'night_saboteurs':
      return quiet(EYES_GLYPH, 'Eyes closed', 'Somewhere on this ship, a decision is being made about you.');
    case 'night_sensor':
    case 'night_medic':
      return quiet(EYES_GLYPH, 'Eyes closed', 'An officer is working. Keep them shut.');
    case 'morning':
      return quiet(TALK_GLYPH, morningTitle(), 'Look up. The TV has the report.');
    case 'discussion':
      return discussionQuiet();
    case 'elimination':
      return quiet(TALK_GLYPH, eliminationTitle(), 'Watch the TV.');
    case 'revenge':
      return quiet(TALK_GLYPH, 'Parting shot', `${pub.revengeBy?.name || 'Security'} is naming someone.`);
    default:
      return quiet(EYES_GLYPH, 'Standby', 'Waiting for the ship.');
  }
}

function deadNote() {
  const mine = me();
  if (!mine) return '';
  const how = mine.deathBy === 'vent' ? 'Vented in the night.'
    : mine.deathBy === 'revenge' ? 'Taken along by Security.'
      : 'Ejected by vote.';
  return `${how} You keep your phone, you lose your voice. No talking, no voting — just watching.`;
}

function morningTitle() {
  const beat = pub.beat || {};
  if (beat.kind === 'morning_vent') return `${beat.victim.name} was vented`;
  return 'Nobody was vented';
}

function eliminationTitle() {
  const beat = pub.beat || {};
  if (beat.kind === 'vote_out') return `${beat.victim.name} was ejected`;
  if (beat.kind === 'revenge_kill') return `${beat.victim.name} went too`;
  if (beat.kind === 'revenge_none') return 'No one was named';
  return 'No majority';
}

function discussionQuiet() {
  const talk = pub.discussion;
  if (talk?.kind === 'spotlight' && talk.spotlightId) {
    const player = pub.players.find((p) => p.id === talk.spotlightId);
    const isMe = player?.id === priv.playerId;
    return quiet(TALK_GLYPH,
      isMe ? 'You have the floor' : `${player?.name || 'Someone'} has the floor`,
      isMe ? 'Twenty seconds. Account for your night.' : 'Listen. Your turn comes round.');
  }
  return quiet(TALK_GLYPH, 'Open floor', 'Phones down. This part happens in the room.');
}

function quiet(glyph, title, note) {
  el('quiet-glyph').innerHTML = glyph;
  el('quiet-title').textContent = title;
  el('quiet-note').textContent = note;

  // The ballot is available all through the discussion, not just when the
  // voting phase opens.
  const canVoteNow = pub.phase === 'discussion' && me()?.alive;
  const button = el('vote-early-btn');
  button.hidden = !canVoteNow;
  button.textContent = priv?.myVote ? 'Change your vote' : 'Vote now';

  show('screen-quiet');
}

/** One list of living crew, with whatever this phase needs written on it. */
function picker(container, options) {
  const { targets, chosenId, disabledIds = [], marks = {}, safe = false } = options;
  container.innerHTML = targets.map((player) => {
    const disabled = disabledIds.includes(player.id);
    const mark = marks[player.id];
    const classes = ['target'];
    if (safe) classes.push('is-safe');
    if (player.id === chosenId) classes.push('is-chosen');
    if (mark) classes.push('is-marked');
    return `
      <button class="${classes.join(' ')}" type="button" data-id="${player.id}" ${disabled ? 'disabled' : ''}>
        ${A.svg({ hex: player.colour.hex, size: 44 })}
        <span>${A.escapeHtml(player.name)}</span>
        <span class="target__meta">${A.escapeHtml(
          player.id === chosenId ? 'Chosen' : mark || (disabled ? 'Blocked' : player.colour.name))}</span>
      </button>`;
  }).join('');
}

function living(excludeSelf = true) {
  return pub.players.filter((p) => p.alive && (!excludeSelf || p.id !== priv.playerId));
}

function actScreen({ eyebrow, title, note }) {
  el('act-eyebrow').textContent = eyebrow;
  el('act-title').textContent = title;
  el('act-note').textContent = note;
  el('act-result').hidden = true;
  show('screen-act');
}

function saboteurAct() {
  actScreen({
    eyebrow: 'Night action',
    title: 'Pick a target',
    note: 'Majority among you wins. A tie is broken at random. If none of you picks, nobody is vented.',
  });

  // Teammate picks, live. They already know who each other are, so naming the
  // saboteur behind each mark costs nothing and saves an argument.
  const marks = {};
  for (const pick of priv.sabPicks || []) {
    const voter = pub.players.find((p) => p.id === pick.voterId);
    if (!voter) continue;
    marks[pick.targetId] = marks[pick.targetId]
      ? `${marks[pick.targetId]} + ${voter.name}`
      : voter.name;
  }

  picker(el('act-picker'), {
    targets: living().filter((p) => !(priv.teammates || []).some((mate) => mate.id === p.id)),
    chosenId: priv.myNightAction,
    marks,
  });
}

function sensorAct() {
  actScreen({
    eyebrow: 'Night action',
    title: 'Scan one crewmate',
    note: 'The array reports Human or Saboteur. One scan a night.',
  });

  picker(el('act-picker'), {
    targets: living(),
    chosenId: priv.scanned,
    disabledIds: priv.scanned ? living().map((p) => p.id) : [],
    safe: true,
  });

  const latest = (priv.scans || [])[priv.scans.length - 1];
  if (latest && latest.cycle === pub.cycle) {
    const result = el('act-result');
    result.hidden = false;
    result.className = `act__result is-${latest.reading}`;
    result.textContent = `${latest.name} reads ${latest.reading === 'saboteur' ? 'Saboteur' : 'Human'}`;
  }
}

function medicAct() {
  const blocked = priv.blockedProtectId;
  actScreen({
    eyebrow: 'Night action',
    title: 'Seal a door',
    note: blocked
      ? 'Blocks tonight\'s vent if it lands on them. You sealed someone last night — not them again.'
      : 'Blocks tonight\'s vent if it lands on them. You may seal your own quarters.',
  });

  picker(el('act-picker'), {
    targets: living(false),
    chosenId: priv.protected,
    disabledIds: blocked ? [blocked] : [],
    safe: true,
  });
}

function revengeAct() {
  actScreen({
    eyebrow: 'On your way out',
    title: 'Take someone with you',
    note: 'One name. They go out of the airlock behind you. Say nothing and nobody follows.',
  });
  picker(el('act-picker'), { targets: living(), chosenId: null });
}

function voteAct() {
  const early = pub.phase === 'discussion';
  el('vote-note').textContent = early
    ? `Lock it in now if you are sure — you can change it until the count. ${pub.votesIn} of ${pub.aliveCount} have voted.`
    : `${pub.voteNeeded} of ${pub.aliveCount} ejects. No majority and nobody goes. `
      + `${pub.votesIn} ballot${pub.votesIn === 1 ? '' : 's'} in.`;
  picker(el('vote-picker'), { targets: living(), chosenId: priv.myVote });
  el('vote-back').hidden = !early;
  show('screen-vote');
}

/** One handler for every picker — the phase decides what the tap means. */
function onPick(event) {
  const button = event.target.closest('.target');
  if (!button || button.disabled) return;
  const targetId = button.dataset.id;

  switch (pub.phase) {
    case 'night_saboteurs': return send('sab_pick', { targetId });
    case 'night_sensor': return send('scan', { targetId });
    case 'night_medic': return send('protect', { targetId });
    case 'revenge': return send('revenge_pick', { targetId });
    // A ballot cast during the discussion is the same ballot. Without this the
    // early-voting screen rendered fine and then quietly did nothing.
    case 'discussion':
    case 'voting': return send('cast_vote', { targetId });
    default: return undefined;
  }
}

el('act-picker').addEventListener('click', onPick);
el('vote-picker').addEventListener('click', onPick);

el('vote-early-btn').addEventListener('click', () => {
  earlyVoteOpen = true;
  render();
});

el('vote-back').addEventListener('click', () => {
  earlyVoteOpen = false;
  render();
});

// --- Host controls ---------------------------------------------------------

for (const button of document.querySelectorAll('#setup-roles .toggle')) {
  button.addEventListener('click', () => {
    if (!pub) return;
    send('set_config', { [button.dataset.key]: !pub.config[button.dataset.key] });
  });
}

for (const button of document.querySelectorAll('#setup-length button')) {
  button.addEventListener('click', () => send('set_config', { discussionMs: Number(button.dataset.ms) }));
}

el('start-btn').addEventListener('click', () => {
  el('start-btn').disabled = true;
  send('start_game');
});

el('skip-btn').addEventListener('click', () => send('skip_intro'));
el('pause-btn').addEventListener('click', () => send('set_paused', { paused: !pub?.paused }));
el('again-btn').addEventListener('click', () => send('reset_game'));

// --- Game over -------------------------------------------------------------

function renderOver() {
  const winner = pub.winner;
  if (!winner) return;

  const crewWon = winner.side === 'crew';
  const iWon = (priv?.team === 'crew') === crewWon;

  const title = el('over-title');
  title.textContent = crewWon ? 'Crew survives' : 'Saboteurs take the ship';
  title.classList.toggle('is-win', iWon);
  title.classList.toggle('is-loss', !iWon);

  el('over-eyebrow').textContent = iWon ? 'You win' : 'You lose';
  el('over-line').textContent = priv?.roleLabel ? `You were the ${priv.roleLabel}.` : '';

  el('over-crew').innerHTML = winner.roster
    .map((player) => crewRow(player, player.roleLabel, player.team === 'saboteur' ? 'is-hostile' : ''))
    .join('');
}

// --- Clock -----------------------------------------------------------------

function tickClock() {
  if (!pub) return;
  const running = pub.phase !== 'lobby' && pub.phase !== 'game_over';
  const left = pub.paused ? clockLeft : Math.max(0, clockLeft - (Date.now() - clockStamp));
  const node = el('bar-clock');

  node.textContent = !running ? ''
    : pub.paused ? 'Paused'
      : pub.holding ? '•••'
        : `${Math.ceil(left / 1000)}`;
  node.classList.toggle('is-urgent', running && !pub.paused && !pub.holding && left <= 5000);
}

setInterval(tickClock, 250);
