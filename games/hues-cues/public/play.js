/**
 * HUES & CUES — the phone.
 *
 * Shows exactly one panel at a time, chosen from the phase and whether this
 * player is the one giving the clue. Everything private — the four candidate
 * colours, the target you kept — arrives on `private_state` and is never in
 * the payload the rest of the room gets.
 *
 * The phone makes no sound. It vibrates instead: a wheel detent, a pin
 * landing, a turn arriving. A phone at a party is either muted or a nuisance,
 * and the TV is already doing the audio.
 */

(() => {
  const socket = io('/hues-cues');
  const GRID = window.HuesGrid;
  const ROWS = GRID.ROWS;
  const COLS = GRID.COLS;

  const KEY = 'hues.session';
  /**
   * Not namespaced under `hues.`, and that is the point: every game on this
   * site reads and writes this one key, so a phone that joined Mafia last
   * week arrives here with the box already filled in. Typing over it is the
   * whole opt-out.
   */
  const NAME_KEY = 'arcade.name';
  const el = (id) => document.getElementById(id);

  let state = null;
  let stateAt = 0;
  let priv = null;
  let session = readSession();
  /** The colour chosen on the join form, before there is any room state. */
  let wantColour = null;
  let paletteCache = [];
  /** Which cycle the wheels were last reset for, so they clear exactly once. */
  let wheelCycle = null;
  /** The player whose Remove button is one tap from firing, if any. */
  let armedKick = null;
  let kickTimer = null;

  function updateGuessClock() {
    const clock = el('guessClock');
    if (!state || state.phase !== 'guess' || !priv?.myTurn) {
      clock.hidden = true;
      return;
    }
    const serverDeadline = Number(state.guessDeadlineAt);
    const remaining = Number.isFinite(serverDeadline) && serverDeadline > 0
      ? Math.max(0, serverDeadline - Date.now())
      : Math.max(0, (state.guessRemainingMs || 0) - (Date.now() - stateAt));
    const seconds = Math.ceil(remaining / 1000);
    clock.hidden = false;
    clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    clock.classList.toggle('is-urgent', seconds <= 10);
  }

  setInterval(updateGuessClock, 100);

  function readSession() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }
  function writeSession(next) {
    session = next;
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  }

  function readName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  }
  // Written only once a join has actually been accepted, so a name the server
  // turned down — taken, or empty — is never the one waiting here next time.
  // Wrapped for the same reason readName is: storage throws outright in a
  // private window, and losing the convenience must not lose the join with it.
  const writeName = (name) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ } };

  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not everywhere */ } };
  const me = () => (state?.players || []).find((p) => p.id === priv?.playerId) || null;
  const playerById = (id) => (state?.players || []).find((p) => p.id === id) || null;

  function flash(node, message) {
    node.textContent = message;
    node.hidden = !message;
    if (message) setTimeout(() => { node.hidden = true; }, 4000);
  }

  /** Every emit that can fail surfaces its reason in the same place. */
  const guard = (node) => (res) => { if (res?.error) flash(node, res.error); };

  // -------------------------------------------------------------------------
  // The ten colours
  // -------------------------------------------------------------------------

  function renderSwatches(host, palette, selectedId, onPick) {
    host.replaceChildren(...palette.map((colour) => {
      const taken = colour.takenBy && colour.id !== selectedId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `swatch${colour.id === selectedId ? ' is-on' : ''}`;
      btn.style.setProperty('--tone', colour.hex);
      btn.disabled = !!taken;
      btn.title = taken ? `${colour.name} — taken by ${colour.takenBy}` : colour.name;
      btn.setAttribute('aria-label', taken ? `${colour.name}, taken` : colour.name);
      btn.setAttribute('aria-pressed', String(colour.id === selectedId));
      btn.innerHTML = '<span class="swatch__dot"></span>';
      btn.addEventListener('click', () => { buzz(8); onPick(colour.id); });
      return btn;
    }));
  }

  function paintJoinSwatches() {
    renderSwatches(el('joinSwatches'), paletteCache, wantColour, (id) => {
      wantColour = id;
      paintJoinSwatches();
    });
  }

  async function loadPalette() {
    const code = el('codeInput').value.trim().toUpperCase();
    try {
      const res = await fetch(`/hues-cues/api/palette?code=${encodeURIComponent(code)}`);
      paletteCache = (await res.json()).palette || [];
    } catch {
      // Keep whatever we last had rather than blanking the picker.
    }
    // A colour that was free when the page loaded may be gone by now.
    if (wantColour && paletteCache.find((c) => c.id === wantColour)?.takenBy) wantColour = null;
    paintJoinSwatches();
  }

  // -------------------------------------------------------------------------
  // Wheels
  // -------------------------------------------------------------------------

  /**
   * One picker column.
   *
   * A native scroll container with snap points, not a drag handler — that is
   * what gives it the platform's own momentum. The first item is blank, which
   * is what makes "row chosen, column not yet" a state the player can actually
   * be in, and therefore what the TV's row-wide crosshair is drawn from.
   */
  function wheel(wheelEl, listEl, items, onChange) {
    let index = 0;
    let frame = null;

    listEl.replaceChildren(...items.map((item, i) => {
      const div = document.createElement('div');
      div.className = `wheel__item${item.value === null ? ' wheel__item--none' : ''}`;
      div.textContent = item.label;
      div.dataset.i = String(i);
      return div;
    }));

    const itemHeight = () =>
      parseFloat(getComputedStyle(wheelEl).getPropertyValue('--item')) || 44;

    /** The drum: everything away from the band shrinks back and fades. */
    function style() {
      frame = null;
      const centre = listEl.scrollTop / itemHeight();
      for (const node of listEl.children) {
        const distance = Math.abs(Number(node.dataset.i) - centre);
        node.style.setProperty('--near', String(Math.max(0.22, 1 - distance * 0.3)));
        node.style.setProperty('--scale', String(Math.max(0.7, 1 - distance * 0.13)));
        node.classList.toggle('is-on', distance < 0.5);
      }
    }

    /*
     * Which item is under the band, worked out straight from scrollTop.
     *
     * This deliberately does not live inside the frame callback below. A
     * requestAnimationFrame never fires while the browser is not compositing
     * the page, and what the player has actually selected — and therefore what
     * the room sees on the TV, and whether Submit is live — must not depend on
     * whether the browser felt like painting. Only the drum effect does.
     */
    function settle() {
      const next = Math.max(0, Math.min(items.length - 1,
        Math.round(listEl.scrollTop / itemHeight())));
      if (next === index) return;
      index = next;
      buzz(4);
      onChange(items[index].value);
    }

    listEl.addEventListener('scroll', () => {
      settle();
      if (!frame) frame = requestAnimationFrame(style);
    }, { passive: true });

    style();

    return {
      get value() { return items[index].value; },
      reset() {
        listEl.scrollTop = 0;
        index = 0;
        style();
      },
    };
  }

  const rowItems = [{ value: null, label: '—' }]
    .concat(ROWS.map((row) => ({ value: row, label: row })));
  const colItems = [{ value: null, label: '—' }]
    .concat(Array.from({ length: COLS }, (_, i) => ({ value: i + 1, label: String(i + 1) })));

  let sendTimer = null;

  /**
   * A pin is already on this square, so it is out of bounds for the rest of
   * the turn — your own first-clue pin included.
   */
  function occupied(row, col) {
    if (!row || !col) return null;
    const id = (state?.takenCells || {})[`${row}${col}`];
    if (!id) return null;
    return { self: id === priv?.playerId, name: playerById(id)?.name || 'Someone' };
  }

  function refreshSubmit() {
    const ready = rowWheel.value && colWheel.value
      && !occupied(rowWheel.value, colWheel.value);
    el('submitBtn').disabled = !ready;
  }

  function onWheelMove() {
    renderPreview();
    refreshSubmit();
    // The room is watching this move. Coalesced to one message a frame's worth
    // of scrolling, rather than one per detent.
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      socket.emit('set_draft', { row: rowWheel.value, col: colWheel.value });
    }, 60);
  }

  const rowWheel = wheel(el('rowWheel'), el('rowList'), rowItems, onWheelMove);
  const colWheel = wheel(el('colWheel'), el('colList'), colItems, onWheelMove);

  /** The swatch you are about to commit to — or the band you are choosing in. */
  function renderPreview() {
    const row = rowWheel.value;
    const col = colWheel.value;
    const chip = el('previewChip');
    const name = el('previewName');
    const coord = el('previewCoord');

    if (row && col) {
      /*
       * The swatch and the coordinate, never the board's name for it. The
       * clue-giver has just said a word out loud; showing a guesser that they
       * are hovering over "macaroni cheese" would hand them a match on a
       * plate. The name arrives once the pin is in and it can no longer help.
       */
      const cell = GRID.cell(row, col);
      const holder = occupied(row, col);
      chip.style.background = cell.hex;
      name.textContent = `${row}${col}`;
      coord.textContent = holder
        ? (holder.self ? 'Your first pin is here' : `${holder.name} is already here`)
        : 'Submit to lock it in';
      el('preview').classList.toggle('is-taken', !!holder);
      return;
    }
    el('preview').classList.remove('is-taken');

    if (row || col) {
      const band = GRID.cells().filter((c) => (row ? c.row === row : c.col === col));
      chip.style.background = `linear-gradient(${row ? '90deg' : '180deg'}, ${band.map((c) => c.hex).join(',')})`;
      name.textContent = row ? `Row ${row}` : `Column ${col}`;
      coord.textContent = `${band.length} colours · pick the other wheel`;
      return;
    }

    chip.style.background = '';
    name.textContent = 'Spin both wheels';
    coord.textContent = 'Letter, then number';
  }

  // -------------------------------------------------------------------------
  // Rosters
  // -------------------------------------------------------------------------

  function roster(host, rows) {
    host.replaceChildren(...rows.map(({ player, tag, done, active }) => {
      const li = document.createElement('li');
      li.style.setProperty('--tone', player.colour.hex);
      li.classList.toggle('is-off', !player.connected);
      li.classList.toggle('is-active', !!active);
      const dot = document.createElement('span');
      dot.className = 'who__dot';
      const name = document.createElement('span');
      name.className = 'who__name';
      name.textContent = player.name;
      const mark = document.createElement('span');
      mark.className = `roster__tag${done ? ' is-in' : ''}`;
      mark.textContent = tag;
      li.append(dot, name, mark);

      const why = removable(player);
      if (why) {
        li.classList.add('has-kick');
        li.append(removeButton(player, why));
      }
      return li;
    }));
  }

  /**
   * Why the host may take this player out — or null, meaning they may not.
   *
   * The same two cases the server enforces, worked out here as well so the
   * button only exists where it would be honoured. A phone that has gone, and
   * the phone the whole room is currently waiting on.
   */
  function removable(player) {
    if (!priv?.isHost || player.id === priv.playerId) return null;
    if (!player.connected) return 'gone';
    if (state.phase === 'guess' && state.activeGuesserId === player.id) return 'stalling';
    return null;
  }

  /**
   * Armed on the first tap, fired on the second.
   *
   * Removing somebody is the one control here that cannot be undone — they
   * lose their score and their seat — and it lives in a list the host scrolls
   * past all game. One tap is not enough of a decision for that.
   */
  function removeButton(player, why) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'roster__kick';
    btn.textContent = why === 'gone' ? 'Remove' : 'Remove?';
    btn.setAttribute('aria-label', `Remove ${player.name} from the game`);

    if (armedKick === player.id) {
      btn.classList.add('is-armed');
      btn.textContent = 'Sure?';
    }

    btn.addEventListener('click', () => {
      buzz(10);
      if (armedKick === player.id) {
        armedKick = null;
        clearTimeout(kickTimer);
        socket.emit('kick_player', { playerId: player.id }, guard(el('gameError')));
        return;
      }
      armedKick = player.id;
      clearTimeout(kickTimer);
      // Disarms itself rather than staying hot behind whatever the host does
      // next, so a stale confirm cannot be collected by a later tap.
      kickTimer = setTimeout(() => { armedKick = null; if (state) route(); }, 4000);
      route();
    });
    return btn;
  }

  /**
   * The running order for this cycle — who has gone, who is up, who is next.
   * Shown in the order they actually play, which reverses on the second clue.
   */
  function guessRows() {
    const queue = state.guessQueue || [];
    const waiting = new Set(state.waitingOn || []);
    const active = state.activeGuesserId;

    const ordered = queue.length
      ? queue.map((id) => playerById(id)).filter(Boolean)
      : state.players.filter((p) => p.id !== state.clueGiverId);

    /*
     * Outside the guessing phase there is no queue and nobody owes a pin, so
     * the "has everyone gone?" test would mark the whole room as done. On the
     * clue screen that read as "Pinned" beside people who had not been given
     * the chance yet.
     */
    if (state.phase !== 'guess') {
      return ordered.map((player) => ({
        player,
        done: false,
        tag: player.connected ? 'Ready' : 'Away',
      }));
    }

    /*
     * Whether a pin is in comes from the pins, not from the queue. "Not still
     * waiting" is not the same fact — somebody the host skipped is no longer
     * waiting either, and reading that as Pinned told the room a pin had landed
     * that never did.
     */
    const pinned = new Set((state.guesses?.[state.cycle - 1] || []).map((g) => g.playerId));

    return ordered.map((player) => ({
      player,
      active: player.id === active,
      done: pinned.has(player.id),
      // The player who is up and offline is the one the room is stuck behind,
      // so that reads as the problem rather than as two neutral facts.
      tag: player.id === active
        ? (player.connected ? 'Pinning now' : 'Up · offline')
        : pinned.has(player.id) ? 'Pinned'
          : !player.connected ? 'Away'
            : waiting.has(player.id) ? 'Up next' : 'Skipped',
    }));
  }

  // -------------------------------------------------------------------------
  // Panels
  // -------------------------------------------------------------------------

  const PANELS = ['lobbyView', 'pickView', 'clueView', 'guessView', 'waitView', 'revealView', 'overView'];

  function show(id) {
    for (const panel of PANELS) el(panel).hidden = panel !== id;
  }

  function waiting(label, lead) {
    show('waitView');
    el('waitLabel').textContent = label;
    el('waitLead').textContent = lead;

    const mine = priv?.submitted;
    el('mine').hidden = !mine;
    if (mine) {
      const cell = GRID.cell(mine.row, mine.col);
      el('mineChip').style.setProperty('--tone', cell.hex);
      el('mineCoord').textContent = `${mine.row}${mine.col} · ${cell.name}`;
    }

    roster(el('waitRoster'), state.clueGiverId ? guessRows() : []);
  }

  function renderLobby() {
    show('lobbyView');

    roster(el('lobbyRoster'), state.players.map((player) => ({
      player,
      done: false,
      tag: player.id === state.hostId ? 'Host' : player.colour.name,
    })));

    const isHost = priv?.isHost;
    el('hostSetup').hidden = !isHost;
    el('goalValue').textContent = state.config.targetScore;
    el('startBtn').disabled = state.players.filter((p) => p.connected).length < state.minPlayers;

    const short = Math.max(0, state.minPlayers - state.players.length);
    el('lobbyNote').textContent = isHost
      ? (short ? `Needs ${short} more player${short === 1 ? '' : 's'}.` : 'Everybody in? Start when ready.')
      : `Waiting for ${state.hostName || 'the host'} to start. First to ${state.config.targetScore}.`;
  }

  function renderPick() {
    show('pickView');
    el('candidates').replaceChildren(...priv.candidates.map((cell) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'candidate';
      btn.style.setProperty('--tone', cell.hex);
      // Swatch and coordinate only — naming it for them would be giving them
      // the clue. See the note on the held strip in play.html.
      btn.innerHTML = `<span class="candidate__swatch"></span>
        <span class="coord candidate__coord"></span>
        <span class="candidate__go" aria-hidden="true">→</span>`;
      btn.querySelector('.candidate__coord').textContent = `${cell.row}${cell.col}`;
      btn.addEventListener('click', () => {
        buzz(12);
        socket.emit('pick_target', { row: cell.row, col: cell.col }, guard(el('gameError')));
      });
      return btn;
    }));
  }

  /**
   * The clue-giver's colour and coordinate, kept on screen for the whole turn
   * rather than only on the panel where they chose it. They are the one player
   * who cannot look at the board to remind themselves.
   */
  function renderHeld() {
    const cell = priv?.isClueGiver ? priv.target : null;
    el('held').hidden = !cell;
    if (!cell) return;
    el('held').style.setProperty('--tone', cell.hex);
    el('heldCoord').textContent = `${cell.row}${cell.col}`;
  }

  function renderClue() {
    show('clueView');
    if (!priv.target) return;

    const second = state.cycle === 1;
    el('clueLabel').textContent = second ? 'Second clue' : 'First clue';
    el('clueLead').textContent = second
      ? 'Say a different word — same colour. Then open the board again.'
      : 'Say one word out loud. Then open the board.';
    el('openBtn').textContent = second ? 'Start second round' : 'Start guessing';
    roster(el('clueRoster'), guessRows());
  }

  function renderGuess() {
    show('guessView');
    el('guessLabel').textContent =
      `Your turn · ${state.clueGiverName}'s clue ${state.cycle} of 2`;

    const zoom = me()?.zoom !== false;
    el('zoomBtn').setAttribute('aria-pressed', String(zoom));
    el('zoomState').textContent = zoom ? 'On' : 'Off';

    // Fresh wheels each cycle: the second clue is meant to be reconsidered, not
    // nudged from where the first one left off.
    const key = `${state.turnNo}:${state.cycle}`;
    if (wheelCycle !== key) {
      wheelCycle = key;
      rowWheel.reset();
      colWheel.reset();
      buzz(18);
    }
    renderPreview();
    refreshSubmit();
  }

  function renderReveal() {
    show('revealView');
    const reveal = state.reveal;
    if (!reveal) return;

    el('revealSwatch').style.setProperty('--tone', reveal.target.hex);
    el('revealName').textContent = reveal.target.name;
    el('revealCoord').textContent = `${reveal.target.row}${reveal.target.col} · ${reveal.target.hex}`;

    const mineId = priv?.playerId;
    const delta = reveal.deltas.find((d) => d.playerId === mineId);
    const asGiver = reveal.clueGiverId === mineId ? reveal.clueGiverPoints : 0;
    const gained = (delta?.points || 0) + asGiver;

    el('revealGained').textContent = `+${gained}`;
    el('revealGained').classList.toggle('is-zero', !gained);

    if (reveal.clueGiverId === mineId) {
      const total = reveal.cycleBullseyes[0] + reveal.cycleBullseyes[1];
      el('revealLead').textContent = total
        ? `${total} pin${total === 1 ? '' : 's'} landed in your bullseye.`
        : 'Nobody found the bullseye that time.';
    } else if (delta) {
      // Map before filtering — the cycle number is the position in `hits`, and
      // a player who missed the first clue would otherwise see the second
      // labelled as their first.
      const shots = delta.hits
        .map((hit, i) => (hit ? `Clue ${i + 1}: ${hit.points} pt${hit.points === 1 ? '' : 's'}` : null))
        .filter(Boolean);
      el('revealLead').textContent = shots.join(' · ');
    } else {
      el('revealLead').textContent = 'No pins in from you that turn.';
    }

    roster(el('revealRoster'), [...state.players]
      .sort((a, b) => b.score - a.score)
      .map((player) => ({ player, done: false, tag: `${player.score}` })));
  }

  function renderOver() {
    show('overView');
    const winner = playerById(state.winnerId);
    el('overWinner').textContent = winner ? `${winner.name} wins` : 'Game over';
    el('overWinner').style.setProperty('--tone', winner?.colour.hex || 'var(--chalk)');
    roster(el('overRoster'), [...state.players]
      .sort((a, b) => b.score - a.score)
      .map((player) => ({ player, done: false, tag: `${player.score}` })));
  }

  function route() {
    const mine = me();
    if (mine) {
      el('topMe').style.setProperty('--tone', mine.colour.hex);
      el('topMe').querySelector('.who__name').textContent = mine.name;
      el('topScore').textContent = mine.score;
    }
    el('topCode').textContent = state.code;

    const isGiver = priv?.isClueGiver;
    renderHeld();
    el('hostBar').hidden = !priv?.isHost || state.phase === 'lobby';
    el('skipBtn').disabled = state.phase === 'game_over';

    switch (state.phase) {
      case 'lobby':
        return renderLobby();

      case 'pick_target':
        return isGiver
          ? renderPick()
          : waiting('Someone else\'s turn', `${state.clueGiverName} is picking a colour`);

      case 'clue':
        return isGiver
          ? renderClue()
          : waiting(state.cycle === 1 ? 'Second clue coming' : 'First clue coming',
            `${state.clueGiverName} is thinking`);

      case 'guess': {
        // One phone is open at a time. Everybody else watches the board.
        if (priv?.myTurn) return renderGuess();
        const up = playerById(state.activeGuesserId);
        const label = `Clue ${state.cycle} of 2`;
        if (isGiver) return waiting(label, up ? `${up.name} is pinning` : 'Everyone has pinned');
        if (priv?.submitted) return waiting(label, up ? `${up.name} is pinning` : 'Pin is in');
        return waiting(label, up ? `${up.name} is pinning` : 'Waiting');
      }

      case 'reveal':
        return renderReveal();

      case 'game_over':
        return renderOver();

      default:
        return waiting('Standing by', 'Waiting');
    }
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  socket.on('game_state', (next) => {
    const arriving = state && state.clueGiverId !== next.clueGiverId
      && next.clueGiverId === priv?.playerId;
    const ending = state && state.phase !== 'game_over' && next.phase === 'game_over';
    // An armed button is aimed at the phase it was armed in. Once that has
    // moved on, the tap that would have confirmed it means something else.
    const moved = state && state.phase !== next.phase;
    state = next;
    stateAt = Date.now();
    updateGuessClock();
    if (moved) {
      disarmHost.forEach((disarm) => disarm());
      clearTimeout(kickTimer);
      armedKick = null;
    }
    if (arriving) buzz([14, 60, 14]);
    // The TV has the sound; the phones join in the only way they can.
    if (ending) buzz([24, 50, 24, 50, 90]);
    if (priv) {
      el('joinView').hidden = true;
      el('gameView').hidden = false;
      route();
    }
  });

  socket.on('private_state', (next) => {
    // The board has come round to you. Worth a nudge — everyone else is
    // watching the TV and waiting.
    const handedTheBoard = next.myTurn && !priv?.myTurn;
    priv = next;
    el('joinView').hidden = true;
    el('gameView').hidden = false;
    if (state) route();
    if (handedTheBoard) buzz([18, 60, 18]);
  });

  /**
   * Another device picked up this seat. Rather than sitting on a game we can
   * no longer affect, hand the screen back to the join form and say why.
   */
  socket.on('seat_taken', () => {
    writeSession(null);
    priv = null;
    state = null;
    el('gameView').hidden = true;
    el('joinView').hidden = false;
    flash(el('joinError'), 'Your seat was picked up on another device.');
    loadPalette();
  });

  socket.on('connect', () => {
    const code = new URLSearchParams(location.search).get('room');
    if (code) el('codeInput').value = code.toUpperCase();

    if (session?.playerId && session?.code) {
      socket.emit('rejoin', session, (res) => {
        if (res?.error) {
          writeSession(null);
          loadPalette();
        }
      });
      return;
    }
    loadPalette();
  });

  // The box comes up holding whatever this phone last called itself. It is the
  // same answer every time, and typing it on a phone in a dim room while
  // everybody else is already in is the slowest part of joining.
  el('nameInput').value = readName();

  el('joinForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = el('nameInput').value.trim();
    const code = el('codeInput').value.trim().toUpperCase();
    if (!name) return flash(el('joinError'), 'Enter a name to join.');

    el('joinBtn').disabled = true;
    socket.emit('join_game', { name, code, colour: wantColour }, (res) => {
      el('joinBtn').disabled = false;
      if (res?.error) return flash(el('joinError'), res.error);
      writeSession({ code: res.code, playerId: res.playerId });
      writeName(name);
      history.replaceState(null, '', `?room=${res.code}`);
    });
  });

  let paletteTimer = null;
  el('codeInput').addEventListener('input', () => {
    clearTimeout(paletteTimer);
    paletteTimer = setTimeout(loadPalette, 350);
  });

  el('startBtn').addEventListener('click', () => {
    buzz(14);
    socket.emit('start_game', {}, guard(el('gameError')));
  });

  el('zoomBtn').addEventListener('click', () => {
    buzz(8);
    socket.emit('set_zoom', { zoom: me()?.zoom === false }, guard(el('gameError')));
  });

  el('openBtn').addEventListener('click', () => {
    buzz(14);
    socket.emit('open_guessing', {}, guard(el('gameError')));
  });

  el('submitBtn').addEventListener('click', () => {
    if (!(rowWheel.value && colWheel.value)) return;
    if (occupied(rowWheel.value, colWheel.value)) return;
    buzz(20);
    el('submitBtn').disabled = true;
    socket.emit('submit_guess', { row: rowWheel.value, col: colWheel.value }, (res) => {
      if (res?.error) {
        el('submitBtn').disabled = false;
        flash(el('gameError'), res.error);
      }
    });
  });

  for (const [id, step] of [['goalDown', -1], ['goalUp', 1]]) {
    el(id).addEventListener('click', () => {
      buzz(6);
      socket.emit('set_config',
        { targetScore: state.config.targetScore + step * 5 }, guard(el('gameError')));
    });
  }

  /**
   * Two taps for anything that cannot be taken back.
   *
   * The host bar sits under every panel for the whole game, a thumb's width
   * from the controls people are actually using — and both buttons on it throw
   * away somebody's work: one ends a player's turn out from under them, the
   * other ends the game. The second tap is the decision. The first is just
   * reaching for it.
   *
   * Returns a disarm, because an armed button has to go cold when the thing it
   * was aimed at changes.
   */
  function confirms(button, label, sure, run) {
    let armed = null;

    const disarm = () => {
      clearTimeout(armed);
      armed = null;
      button.classList.remove('is-armed');
      button.textContent = label;
    };

    button.addEventListener('click', () => {
      buzz(armed ? 18 : 8);
      if (armed) {
        disarm();
        run();
        return;
      }
      button.classList.add('is-armed');
      button.textContent = sure;
      // Goes cold on its own rather than staying hot for the rest of the
      // evening, waiting to collect a tap meant for whatever replaced it.
      armed = setTimeout(disarm, 4000);
    });

    return disarm;
  }

  const disarmHost = [
    confirms(el('skipBtn'), 'Skip ahead', 'Skip — sure?', () => {
      socket.emit('force_advance', {}, guard(el('gameError')));
    }),
    confirms(el('resetBtn'), 'New game', 'End game?', () => {
      socket.emit('reset_game', {}, guard(el('gameError')));
    }),
  ];

  renderPreview();
})();
