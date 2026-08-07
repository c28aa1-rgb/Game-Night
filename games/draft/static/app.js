/* ═══════════════════════════════════════════════════════════
   DRAFT NIGHT
   Spin a wheel, take picks in turn, end with two to four teams.

   Correctness rule that governs this whole file:
   the name that gets drafted is read back off the wheel's final
   resting angle — not from whatever the shuffle intended. See
   indexAtPointer() and the check inside spin().
   ═══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── timing ─────────────────────────────────────────────── */
const T = {
  spin:      reduceMotion ? 120 : 4200,
  clunk:     reduceMotion ? 0   : 450,   // pointer settles, segment lights up
  hold:      reduceMotion ? 300 : 1900,  // name held on screen
  fly:       reduceMotion ? 0   : 640,   // card travels to the bench
  rebuild:   reduceMotion ? 0   : 460,   // wheel drops the drafted name
  breath:    reduceMotion ? 0   : 480,   // beat before the next spin
  wipe:      reduceMotion ? 0   : 420,
};

/* ── state ──────────────────────────────────────────────── */
const MAX_TEAMS = 4;
const TEAM_COLOUR = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)'];

const state = {
  roster: [],        // names on the input sheet
  wheel: [],         // names still on the wheel
  teamCount: 2,      // 2–4, chosen on the roster page
  teams: [[], []],
  pick: 0,           // picks completed
  rotation: 0,       // accumulated wheel rotation, degrees
  drafting: false,
  run: 0,            // bumped on every start/skip so stale async work bails out
  page: 'roster',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

/**
 * How many players each team ends up with. Picks go round the teams in turn,
 * so when the roster does not divide evenly the earlier teams take the spare
 * names — team 1 gets the extra of an odd pair, exactly as before.
 */
function teamSizes(total, count = state.teamCount) {
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}

/* ═══════════════ PAGE TRANSITIONS ═══════════════════════ */

function stagger(page) {
  page.querySelectorAll('[data-stagger]').forEach((el, i) => el.style.setProperty('--i', i));
  page.classList.remove('is-entering');
  void page.offsetWidth;              // restart the stagger animation
  page.classList.add('is-entering');
}

async function goto(name) {
  if (state.page === name) return;
  SFX.whoosh(true, 0.4);
  const wipe = $('wipe');
  const from = $(`page-${state.page}`);
  const to = $(`page-${name}`);

  wipe.classList.remove('out');
  wipe.classList.add('in');
  await sleep(T.wipe);

  from.classList.remove('is-active', 'is-entering');
  to.classList.add('is-active');
  to.scrollTop = 0;
  state.page = name;
  stagger(to);

  wipe.classList.remove('in');
  wipe.classList.add('out');
  await sleep(T.wipe + 60);
  wipe.classList.remove('out');
}

/* ═══════════════ PAGE 1 — ROSTER ════════════════════════ */

function renderRoster() {
  const list = $('rosterList');
  const n = state.roster.length;

  list.innerHTML = state.roster.map((name, i) => `
    <li class="sheet-row" data-i="${i}">
      <span class="row-num">${pad(i + 1)}</span>
      <span class="row-name">${esc(name)}</span>
      <button class="row-kill" data-kill="${i}" aria-label="Remove ${esc(name)}">&times;</button>
    </li>`).join('');

  $('rosterCount').textContent = `${pad(n)} entrant${n === 1 ? '' : 's'}`;
  $('entryNum').textContent = pad(n + 1);
  $('rosterEmpty').classList.toggle('hidden', n > 0);

  const ready = n >= state.teamCount;
  $('startBtn').disabled = !ready;
  $('startHint').textContent = ready
    ? `Splits into ${teamSizes(n).join(' · ')}.`
    : `Add at least ${state.teamCount} names to open the floor.`;
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addNames(raw) {
  const incoming = raw.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  let added = 0;
  for (const name of incoming) {
    const clean = name.slice(0, 28);
    const dupe = state.roster.some((n) => n.toLowerCase() === clean.toLowerCase());
    if (dupe || state.roster.length >= 60) continue;
    state.roster.push(clean);
    added++;
  }
  if (added) renderRoster();
  return added;
}

$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('nameInput');
  // A name that was a duplicate, or over the cap, adds nothing — say so.
  if (input.value.trim()) addNames(input.value) ? SFX.add() : SFX.nope();
  input.value = '';
  input.focus();
});

$('nameInput').addEventListener('paste', (e) => {
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\n,;\t]/.test(text)) return;      // single name — let the browser handle it
  e.preventDefault();
  if (addNames(text)) SFX.add();
  e.target.value = '';
});

$('rosterList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-kill]');
  if (!btn) return;
  const row = btn.closest('.sheet-row');
  const i = Number(btn.dataset.kill);
  SFX.remove();
  row.classList.add('leaving');
  setTimeout(() => { state.roster.splice(i, 1); renderRoster(); }, reduceMotion ? 0 : 260);
});

$('sampleBtn').addEventListener('click', () => {
  state.roster = [];
  addNames('Marcus, Elena, Priya, Dante, Nadia, Ivan, Rosa, Kwame, Hana, Theo');
  SFX.add();
  $('nameInput').focus();
});

$('clearBtn').addEventListener('click', () => {
  state.roster = [];
  SFX.remove();
  renderRoster();
  $('nameInput').focus();
});

$('teamSel').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-teams]');
  if (!btn) return;
  const count = Math.min(MAX_TEAMS, Math.max(2, Number(btn.dataset.teams)));
  if (count === state.teamCount) return;
  state.teamCount = count;
  SFX.detent();
  for (const opt of $('teamSel').querySelectorAll('.teamsel-opt')) {
    const on = Number(opt.dataset.teams) === count;
    opt.classList.toggle('is-on', on);
    opt.setAttribute('aria-checked', String(on));
  }
  renderRoster();
});

$('startBtn').addEventListener('click', () => {
  SFX.start();
  startDraft(state.roster.slice());
});

/* ═══════════════ THE WHEEL ══════════════════════════════ */

const CX = 300, CY = 300, R = 272, TEXT_R = 250;

// polar → cartesian, angle measured clockwise from 12 o'clock
const pt = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};

function segAngle() { return 360 / state.wheel.length; }

/** `viewRotation` is the rotation the wheel will be sitting at when the reader
 *  actually looks at it. Labels are oriented against that, so names on the left
 *  of the screen flip to stay upright. Re-rendered at the start of each spin,
 *  where the motion hides the swap. */
function renderWheel(viewRotation = state.rotation) {
  const g = $('segments');
  const n = state.wheel.length;
  const seg = 360 / n;
  const fs = Math.min(26, Math.max(9, (seg * Math.PI / 180) * 150 * 0.55));
  const maxChars = Math.max(4, Math.floor((TEXT_R - 88) / (fs * 0.52)));

  let svg = '';
  state.wheel.forEach((name, i) => {
    const a0 = i * seg, a1 = (i + 1) * seg;
    const [x0, y0] = pt(a0, R);
    const [x1, y1] = pt(a1, R);
    const large = seg > 180 ? 1 : 0;
    const d = n === 1
      ? `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX - 0.01} ${CY - R} Z`
      : `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
    svg += `<path class="seg ${i % 2 ? 'b' : 'a'}" data-i="${i}" d="${d}"/>`;
  });

  // Each name runs along its own spoke. Which end it starts from depends on
  // where the spoke will be pointing on screen once the wheel stops.
  state.wheel.forEach((name, i) => {
    const c = (i + 0.5) * seg;
    const [tx, ty] = pt(c, TEXT_R);
    const onScreen = ((c + viewRotation) % 360 + 360) % 360;
    const flip = onScreen > 180;                  // left-hand side of the wheel
    const label = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
    svg += `<text class="seg-label" data-i="${i}" x="${tx}" y="${ty}"
              transform="rotate(${(flip ? c + 90 : c - 90).toFixed(2)} ${tx.toFixed(1)} ${ty.toFixed(1)})"
              style="font-size:${fs.toFixed(1)}px;text-anchor:${flip ? 'start' : 'end'}"
            >${esc(label)}</text>`;
  });

  g.innerHTML = svg;
}

/** Which wheel index is under the pointer at a given rotation. The wheel's
 *  own frame runs clockwise from 12 o'clock, so the pointer sits at -rot. */
function indexAtPointer(rot) {
  const n = state.wheel.length;
  const seg = 360 / n;
  const at = ((-rot % 360) + 360) % 360;
  return Math.floor(at / seg) % n;
}

/** Rotation that parks `index` under the pointer, landing off-centre by a
 *  random amount that always stays inside the segment. */
function rotationFor(index) {
  const seg = segAngle();
  const centre = (index + 0.5) * seg;
  const jitter = (Math.random() - 0.5) * seg * 0.62;   // ±31% of the segment
  const target = ((360 - centre - jitter) % 360 + 360) % 360;
  const current = ((state.rotation % 360) + 360) % 360;
  const delta = ((target - current) % 360 + 360) % 360;
  const turns = 4 + Math.floor(Math.random() * 3);
  return state.rotation + turns * 360 + delta;
}

function setRotation(deg, animate) {
  const rotor = $('rotor');
  rotor.style.transition = animate
    ? `transform ${T.spin}ms cubic-bezier(.16,.84,.28,1)`
    : 'none';
  rotor.style.transform = `rotate(${deg}deg)`;
  if (!animate) void rotor.getBoundingClientRect();     // flush before re-enabling
}

/* ═══════════════ PAGE 2 — DRAFT FLOOR ═══════════════════ */

/** Lays out one bench per team. Called once at the start of a draft. */
function buildBenches() {
  $('floorGrid').dataset.teams = state.teamCount;
  $('benches').innerHTML = state.teams
    .map((_, t) => `
      <aside class="bench" style="--team:${TEAM_COLOUR[t]}">
        <header class="bench-head">
          <span class="bench-bar"></span>
          <h2 class="bench-name">Team ${t + 1}</h2>
          <span class="bench-count" data-count="${t}">0</span>
        </header>
        <ol class="bench-list" data-list="${t}"></ol>
      </aside>`)
    .join('');
}

function renderBenches() {
  const sizes = teamSizes(state.roster.length);

  state.teams.forEach((team, t) => {
    let html = '';
    for (let i = 0; i < sizes[t]; i++) {
      const name = team[i];
      html += `<li class="slot ${name ? 'filled' : 'empty'}" data-team="${t}" data-slot="${i}">
                 <span class="slot-num">${pad(i + 1)}</span>
                 <span class="slot-name">${name ? esc(name) : '—'}</span>
               </li>`;
    }
    $('benches').querySelector(`[data-list="${t}"]`).innerHTML = html;
    $('benches').querySelector(`[data-count="${t}"]`).textContent = `${team.length}/${sizes[t]}`;
  });
}

function setStatus(text, team) {
  const el = $('floorStatus');
  el.textContent = text;
  el.style.color = team == null ? '' : TEAM_COLOUR[team];
}

async function startDraft(names) {
  SFX.stopTicks();          // a previous draft may still be spinning
  state.wheel = names.slice();
  state.teams = Array.from({ length: state.teamCount }, () => []);
  state.pick = 0;
  state.rotation = 0;
  state.drafting = true;
  const run = ++state.run;

  buildBenches();
  renderBenches();
  renderWheel(0);
  const segs = $('segments');
  segs.style.transition = 'none';        // the last draft faded these out
  segs.style.opacity = '1';
  setRotation(0, false);
  $('hubNum').textContent = pad(1);
  $('stageMeta').textContent = `${state.wheel.length} names left on the wheel`;
  setStatus('Get ready', null);

  await goto('floor');
  await sleep(reduceMotion ? 0 : 700);
  runDraft(run);
}

async function runDraft(run) {
  const live = () => state.drafting && state.run === run;

  while (live() && state.wheel.length > 0) {
    const team = state.pick % state.teamCount;   // round the teams in turn
    setStatus(`Team ${team + 1} is on the clock`, team);
    SFX.onClock(team);
    await sleep(reduceMotion ? 0 : 420);
    if (!live()) return;

    const landed = await spin(team);
    if (!live()) return;

    await revealAndSeat(landed, team, live);
    if (!live()) return;

    await sleep(T.breath);
  }
  if (live()) finishDraft();
}

/* ── the ratchet ────────────────────────────────────────── */

/** The wheel's CSS easing, as control points. Must match setRotation(). */
const SPIN_EASE = { x1: 0.16, y1: 0.84, x2: 0.28, y2: 1 };

/** One axis of a cubic bezier from (0,0) to (1,1), at parameter s. */
function bezierAxis(s, p1, p2) {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
}

/** Given how far the wheel has turned (0–1), when does that happen (0–1)? */
function timeForProgress(p) {
  let lo = 0, hi = 1, s = 0.5;
  for (let i = 0; i < 24; i++) {                 // invert y(s), then read x(s)
    s = (lo + hi) / 2;
    if (bezierAxis(s, SPIN_EASE.y1, SPIN_EASE.y2) < p) lo = s; else hi = s;
  }
  return bezierAxis(s, SPIN_EASE.x1, SPIN_EASE.x2);
}

/**
 * Queues one ratchet click for every segment edge that will pass the pointer
 * during this spin.
 *
 * The whole spin is known in advance — start angle, end angle, duration and
 * easing — so the clicks are computed and handed to the audio clock up front
 * rather than sampled frame by frame. Sample-accurate, and it keeps ticking at
 * the right moments even if the page drops frames or is running in a
 * background tab, where requestAnimationFrame is throttled to nothing.
 *
 * Boundaries land on exact multiples of the segment angle: a segment edge is
 * under the pointer whenever the rotation is a multiple of 360/n.
 */
function scheduleTicks(from, to, duration) {
  if (reduceMotion) return;
  const seg = 360 / state.wheel.length;
  const span = to - from;
  if (span <= 0) return;

  const times = [];
  for (let k = Math.ceil(from / seg); k <= Math.floor(to / seg); k++) {
    times.push(timeForProgress((k * seg - from) / span) * duration);
  }

  let last = -Infinity;
  times.forEach((ms, i) => {
    // A real ratchet cannot articulate faster than this; at the start of a
    // spin the edges fly past far quicker, so those collapse into a blur.
    if (ms - last < 16) return;
    // Rate comes from the gap to the next edge; the last edge has none, so it
    // borrows the gap behind it — otherwise the dying click sounds like a fast
    // one and the wheel stops sounding like it ran out of momentum.
    const gap = i + 1 < times.length
      ? times[i + 1] - ms
      : (i > 0 ? ms - times[i - 1] : 40);
    const speed = Math.min(1, seg / Math.max(gap, 1) / 1.1);   // deg/ms → 0–1
    SFX.tick(speed, ms / 1000);
    last = ms;
  });
}

/** Spins the wheel and returns the index the pointer actually landed on. */
async function spin(team) {
  const wrap = document.querySelector('.wheel-wrap');
  const n = state.wheel.length;

  // Choose a target, then derive the rotation that parks it under the pointer.
  const intended = Math.floor(Math.random() * n);
  const target = rotationFor(intended);

  setStatus('Spinning', team);
  wrap.classList.add('spinning');
  renderWheel(target);              // orient labels for where the wheel will stop
  setRotation(target, true);
  scheduleTicks(state.rotation, target, T.spin);
  await sleep(T.spin);

  // Normalise so the number never balloons, without moving the wheel.
  state.rotation = ((target % 360) + 360) % 360;
  setRotation(state.rotation, false);

  // Read the winner off the wheel's actual resting angle. This is the value
  // that gets drafted, so what you see under the pointer is always what counts.
  const landed = indexAtPointer(state.rotation);
  if (landed !== intended) {
    console.warn(`Wheel landed on ${landed}, aimed for ${intended} — using ${landed}.`);
  }

  wrap.classList.remove('spinning');
  SFX.clunk();
  $('pointer').classList.add('clunk');
  setTimeout(() => $('pointer').classList.remove('clunk'), 700);

  // Light up the segment that won.
  document.querySelector(`.seg[data-i="${landed}"]`)?.classList.add('win');
  document.querySelector(`.seg-label[data-i="${landed}"]`)?.classList.add('win');

  await sleep(T.clunk);
  return landed;
}

async function revealAndSeat(wheelIndex, team, live = () => true) {
  const reveal = $('reveal');
  const card = $('revealCard');
  const name = state.wheel[wheelIndex];
  const slotIndex = state.teams[team].length;

  card.style.setProperty('--team', TEAM_COLOUR[team]);
  $('revealMeta').textContent = `Pick ${pad(state.pick + 1)} — Team ${team + 1}`;
  $('revealName').textContent = name;

  setStatus(`Team ${team + 1} selects`, team);
  SFX.reveal(team);
  reveal.classList.add('show');
  await sleep(T.hold);
  if (!live()) { reveal.classList.remove('show'); return; }

  // Fly the card into the slot it's about to occupy.
  const slot = document.querySelector(`.slot[data-team="${team}"][data-slot="${slotIndex}"]`);
  let flight;
  if (slot && !reduceMotion) {
    const a = card.getBoundingClientRect();
    const b = slot.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const scale = Math.max(0.1, b.width / a.width);
    flight = card.animate(
      [{ transform: 'none', opacity: 1 },
       { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }],
      { duration: T.fly, easing: 'cubic-bezier(.55,0,.2,1)', fill: 'forwards' }
    );
    reveal.style.background = 'transparent';
    await flight.finished;
  }
  if (!live()) { reveal.classList.remove('show'); flight?.cancel(); reveal.style.background = ''; return; }

  // Seat the player. Removal is by index, never by name.
  state.teams[team].push(name);
  state.wheel.splice(wheelIndex, 1);
  state.pick++;
  renderBenches();
  SFX.lock(team);
  document.querySelector(`.slot[data-team="${team}"][data-slot="${slotIndex}"]`)?.classList.add('landing');

  reveal.classList.remove('show');
  flight?.cancel();
  reveal.style.background = '';

  // Drop the name off the wheel.
  const segs = $('segments');
  if (state.wheel.length > 0) {
    segs.style.transition = `opacity ${T.rebuild / 2}ms ease`;
    segs.style.opacity = '0.12';
    await sleep(T.rebuild / 2);
    renderWheel();
    $('hubNum').textContent = pad(state.pick + 1);
    segs.style.opacity = '1';
    $('stageMeta').textContent = `${state.wheel.length} name${state.wheel.length === 1 ? '' : 's'} left on the wheel`;
    await sleep(T.rebuild / 2);
  } else {
    segs.style.opacity = '0';
    $('stageMeta').textContent = 'The wheel is empty';
  }
}

$('skipBtn').addEventListener('click', () => {
  state.drafting = false;
  state.run++;
  SFX.stopTicks();          // a spin may still have clicks queued
  SFX.click();
  $('reveal').classList.remove('show');
  $('reveal').style.background = '';
  // Deal the rest of the wheel out in the order it stands.
  while (state.wheel.length) {
    state.teams[state.pick % state.teamCount].push(state.wheel.shift());
    state.pick++;
  }
  finishDraft();
});

/* ═══════════════ PAGE 3 — FINAL TEAMS ═══════════════════ */

function finishDraft() {
  state.drafting = false;
  setStatus('Draft complete', null);

  const grid = $('finalGrid');
  grid.dataset.teams = state.teamCount;

  const squad = (team, t) => {
    const n = team.length;
    return `
      <article class="squad" data-stagger style="--team:${TEAM_COLOUR[t]}">
        <header class="squad-head">
          <h2 class="squad-name">Team ${t + 1}</h2>
          <span class="squad-count">${n} player${n === 1 ? '' : 's'}</span>
        </header>
        <ol class="squad-list">${team.map((name, i) => `
          <li class="squad-row" style="animation-delay:${420 + i * 70}ms">
            <span class="squad-rank">${pad(i + 1)}</span>
            <span class="squad-player">${esc(name)}</span>
          </li>`).join('')}
        </ol>
        <span class="squad-sheen" aria-hidden="true"></span>
      </article>`;
  };

  const squads = state.teams.map(squad);
  // The versus badge belongs between two squads and nowhere else.
  grid.innerHTML = state.teamCount === 2
    ? squads[0] + '<div class="versus" data-stagger><span>vs</span></div>' + squads[1]
    : squads.join('');

  SFX.complete();
  goto('final');
}

$('redraftBtn').addEventListener('click', () => {
  SFX.start();
  startDraft(state.roster.slice());
});

/*
 * Back to the sheet, from the floor or from the final teams.
 *
 * Bumping the run number is what actually stops a draft: a spin in flight
 * checks it before dealing its name, so abandoning mid-wheel cannot land one
 * more pick on a bench nobody is looking at any more. The reveal card is
 * cleared by hand for the same reason — mid-spin it is on screen, and the
 * wipe would carry it over to the roster.
 */
async function backToRoster() {
  state.drafting = false;
  state.run++;
  SFX.stopTicks();
  SFX.click();
  $('reveal').classList.remove('show');
  $('reveal').style.background = '';
  await goto('roster');
  $('nameInput').focus();
}

$('newRosterBtn').addEventListener('click', backToRoster);
$('abandonBtn').addEventListener('click', backToRoster);

$('copyBtn').addEventListener('click', async (e) => {
  const text = state.teams
    .map((team, t) => `TEAM ${t + 1}\n` + team.map((n, i) => `${i + 1}. ${n}`).join('\n'))
    .join('\n\n');
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
    SFX.blip();
  } catch {
    btn.textContent = 'Copy blocked — select the list instead';
    SFX.nope();
  }
  setTimeout(() => { btn.textContent = 'Copy teams'; }, 2200);
});

/* ═══════════════ SOUND ══════════════════════════════════ */

function paintSoundButton() {
  const btn = $('soundBtn');
  btn.setAttribute('aria-pressed', String(SFX.enabled));
  $('soundLabel').textContent = SFX.enabled ? 'Sound on' : 'Sound off';
}

$('soundBtn').addEventListener('click', () => {
  SFX.toggle();
  paintSoundButton();
});

// Browsers will not start audio until the user has done something, so the
// context is opened on the first gesture rather than at load.
addEventListener('pointerdown', () => SFX.prime(), { once: true });
addEventListener('keydown', () => SFX.prime(), { once: true });

/* ── boot ───────────────────────────────────────────────── */
paintSoundButton();
renderRoster();
stagger($('page-roster'));
$('nameInput').focus();
