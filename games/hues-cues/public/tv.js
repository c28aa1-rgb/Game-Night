/**
 * HUES & CUES — the TV.
 *
 * This screen is a display, not a referee. It is told the phase, the pins and
 * (once, at the end of a turn) the target; it never works out a score for
 * itself. Everything below is layout, animation and sound.
 *
 * Two things are worth knowing before reading:
 *
 *   · Geometry is computed, not declared. measure() picks a cell size that
 *     fits the stage and writes --cell/--gap; every overlay is then positioned
 *     from those same two numbers. Letting CSS size the grid and JS size the
 *     overlay independently is how you get pins that sit a pixel off the cell
 *     they mean, at some screen sizes and not others.
 *
 *   · The overlay is reconciled by key rather than rebuilt. A pin that is
 *     already on the board must not replay its landing animation because
 *     somebody else's crosshair moved.
 */

(() => {
  const socket = io('/hues-cues');
  const SFX = window.HuesSFX;
  const ROWS = window.HuesGrid.ROWS;
  const COLS = window.HuesGrid.COLS;
  const CELLS = window.HuesGrid.cells();

  const GAP = 1;
  /** Room for the row labels down the left and the column labels across the top. */
  const AXIS_W = 24;
  const AXIS_H = 16;
  /** The well's padding and hairline, which sit between the stage and the field. */
  const WELL = 8;
  const BOARD_GAP = 6;

  /**
   * The zoom window, in cells. Nine rows deep — enough to hold the whole 5×5
   * scoring area with a ring of context around it — and as many columns as
   * that works out to at the board's own proportions, so the zoom fills the
   * well rather than letterboxing.
   */
  const FOCUS_ROWS = 9;
  const FOCUS_COLS = Math.round(FOCUS_ROWS * (COLS / ROWS.length));

  const el = (id) => document.getElementById(id);
  const $board = el('board');
  const $field = el('field');
  const $layer = el('layer');
  const $plate = el('plate');
  const $zoomLabels = el('zoomLabels');
  const $scores = el('scores');

  let state = null;
  let previous = null;
  /** When the current payload arrived, so its wait clock can keep running. */
  let stateAt = 0;
  let cell = 10;
  let revealTimers = [];
  let revealedTurn = null;
  let winTimer = null;
  let guessClockTimer = null;
  let lastGuessSecond = null;
  /** So the wave runs once per game, not once per state update. */
  let celebrated = false;
  /** Key -> element, so live overlays survive a re-render untouched. */
  let overlay = new Map();

  const rowIndex = (row) => ROWS.indexOf(row);
  const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

  /** #RRGGBB at a given opacity, for glows mixed from a player's own colour. */
  function withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  const playerById = (id) => (state?.players || []).find((p) => p.id === id) || null;

  function updateGuessClock() {
    const clock = el('turnClock');
    if (!state || state.phase !== 'guess' || !state.activeGuesserId) {
      clock.hidden = true;
      lastGuessSecond = null;
      return;
    }
    const serverDeadline = Number(state.guessDeadlineAt);
    const remaining = Number.isFinite(serverDeadline) && serverDeadline > 0
      ? Math.max(0, serverDeadline - Date.now())
      : Math.max(0, (state.guessRemainingMs || 0) - (Date.now() - stateAt));
    const seconds = Math.ceil(remaining / 1000);
    clock.hidden = false;
    clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const urgent = seconds <= 10;
    clock.classList.toggle('is-urgent', urgent);
    if (urgent && seconds > 0 && seconds !== lastGuessSecond) {
      // A distinct, once-per-second audible clock for the final ten.
      SFX.countdownTick(seconds);
    }
    lastGuessSecond = seconds;
  }

  guessClockTimer = setInterval(updateGuessClock, 100);

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  const step = () => cell + GAP;
  const xAt = (col) => (col - 1) * step();
  const yAt = (row) => rowIndex(row) * step();
  const span = (n) => n * cell + (n - 1) * GAP;

  /**
   * The score rail grows and shrinks with the number of players. Anything
   * floating above it has to clear it without covering it, so its height is
   * published rather than guessed at.
   */
  function measureRail() {
    const rail = document.querySelector('.rail--bottom');
    const h = Math.round(rail.getBoundingClientRect().height);
    document.body.style.setProperty('--rail-h', `${h}px`);
  }

  function measure() {
    const stage = document.querySelector('.stage');
    const box = stage.getBoundingClientRect();
    const style = getComputedStyle(stage);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

    const availW = box.width - padX - AXIS_W - BOARD_GAP - WELL;
    const availH = box.height - padY - AXIS_H - BOARD_GAP - WELL;

    const next = Math.floor(Math.min(
      (availW - (COLS - 1) * GAP) / COLS,
      (availH - (ROWS.length - 1) * GAP) / ROWS.length
    ));

    cell = Math.max(6, next);
    $board.style.setProperty('--cell', `${cell}px`);
    $board.style.setProperty('--gap', `${GAP}px`);

    measureRail();
    if (state) drawLayer();
    applyFocus();
  }

  // -------------------------------------------------------------------------
  // The zoom
  // -------------------------------------------------------------------------

  /** Set by the reveal, which overrides whatever the guessers are doing. */
  let forcedFocus = null;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function windowAround(rowMid, colMid) {
    return {
      r0: clamp(Math.round(rowMid - (FOCUS_ROWS - 1) / 2), 0, ROWS.length - FOCUS_ROWS),
      c0: clamp(Math.round(colMid - (FOCUS_COLS - 1) / 2), 1, COLS - FOCUS_COLS + 1),
    };
  }

  /**
   * Where the room is looking while guessing — or null, meaning show the whole
   * board.
   *
   * One rule: follow whoever is pinning, from the moment their crosshair is on
   * a single square. Nothing else is consulted. An earlier version framed every
   * pin on the board at once and gave up whenever they were spread too far
   * apart, which meant the zoom came and went depending on how well the room
   * happened to be agreeing — the same action producing a different screen each
   * time, which reads as broken rather than as responsive.
   *
   * Waiting for both wheels is the one condition, and it is not a hedge: with
   * only a row chosen the crosshair is a band thirty squares wide, and closing
   * in would cut off the thing it is drawing.
   */
  function focusFromGuessing() {
    if (!state || state.phase !== 'guess') return null;

    const active = playerById(state.activeGuesserId);
    // Their call, not the TV's — see the zoom toggle on the guess panel.
    if (!active || active.zoom === false) return null;

    const draft = (state.drafts || []).find((d) => d.playerId === active.id);
    if (!draft || !draft.row || !draft.col) return null;

    return windowAround(rowIndex(draft.row), draft.col);
  }

  function applyFocus() {
    const win = forcedFocus || focusFromGuessing();
    $board.classList.toggle('is-zoomed', !!win);

    if (!win) {
      $plate.style.transform = '';
      $plate.style.setProperty('--unzoom', '1');
      $zoomLabels.replaceChildren();
      return;
    }

    const fieldW = span(COLS);
    const fieldH = span(ROWS.length);
    const raw = Math.min(fieldW / span(FOCUS_COLS), fieldH / span(FOCUS_ROWS));

    /*
     * Snap the zoom so one cell's pitch lands on a whole device pixel.
     *
     * At an arbitrary scale every cell boundary falls halfway across a pixel
     * and the browser antialiases all 480 of them, which is what makes a
     * zoomed board look faintly out of register even when the maths is exact.
     * Rounding the scale costs a fraction of a percent of magnification and
     * puts every edge back on a real pixel.
     */
    const dpr = window.devicePixelRatio || 1;
    const pitch = (cell + GAP) * dpr;
    const scale = Math.max(1, Math.round(raw * pitch) / pitch);

    const snap = (v) => Math.round(v * dpr) / dpr;
    const offsetX = snap((fieldW - span(FOCUS_COLS) * scale) / 2);
    const offsetY = snap((fieldH - span(FOCUS_ROWS) * scale) / 2);

    $plate.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) `
      + `translate(${-xAt(win.c0)}px, ${-yAt(ROWS[win.r0])}px)`;
    $plate.style.setProperty('--unzoom', String(1 / scale));
    drawZoomLabels(win, scale);
  }

  /**
   * Coordinates on the outermost squares of the zoomed view, since the rulers
   * around the board are off screen and would be lying anyway. Divided by the
   * scale so they stay small — the point is to say where you are, not to
   * compete with the colours.
   */
  function drawZoomLabels(win, scale) {
    const size = Math.max(6, (cell * 0.4) / scale);
    const kids = [];

    const put = (text, row, col) => {
      const node = document.createElement('div');
      node.className = 'zoomlabel';
      node.textContent = text;
      node.style.left = `${xAt(col)}px`;
      node.style.top = `${yAt(row)}px`;
      node.style.width = `${cell}px`;
      node.style.height = `${cell}px`;
      node.style.fontSize = `${size}px`;
      kids.push(node);
    };

    for (let i = 0; i < FOCUS_ROWS; i++) put(ROWS[win.r0 + i], ROWS[win.r0 + i], win.c0);
    for (let j = 0; j < FOCUS_COLS; j++) {
      const col = win.c0 + j;
      // Every other, matching the ruler — and never the corner, which the row
      // letter already owns.
      if (col % 2 === 0 || col === win.c0) continue;
      put(String(col), ROWS[win.r0], col);
    }

    $zoomLabels.replaceChildren(...kids);
  }

  // -------------------------------------------------------------------------
  // The board, drawn once
  // -------------------------------------------------------------------------

  function buildBoard() {
    const cols = document.createDocumentFragment();
    for (let c = 1; c <= COLS; c++) {
      const s = document.createElement('span');
      // Every other column, so you can count to a neighbour rather than
      // stepping five at a time. All thirty would be a texture, not a scale.
      s.textContent = c % 2 === 1 ? String(c) : '';
      cols.appendChild(s);
    }
    el('axisCols').appendChild(cols);

    const rows = document.createDocumentFragment();
    for (const row of ROWS) {
      const s = document.createElement('span');
      s.textContent = row;
      rows.appendChild(s);
    }
    el('axisRows').appendChild(rows);

    const field = document.createDocumentFragment();
    for (const c of CELLS) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.background = c.hex;
      div.dataset.at = `${c.row}${c.col}`;
      field.appendChild(div);
    }
    $field.appendChild(field);
  }

  const cellNode = (row, col) => $field.querySelector(`[data-at="${row}${col}"]`);

  // -------------------------------------------------------------------------
  // The overlay
  // -------------------------------------------------------------------------

  /** Reuse the node under `key` if it is already the right kind, else make one. */
  function node(next, key, className) {
    let found = overlay.get(key);
    if (!found || found.dataset.kind !== className) {
      /*
       * Replacing, not reusing. The old node has to come out here: the sweep
       * at the end of drawLayer only removes keys that have gone away, and
       * this key is staying — so a pin that changes kind (cycle one going
       * hollow when cycle two opens) would leave its previous self on the
       * board for good, and the room would read two pins as two guesses.
       */
      found?.remove();
      found = document.createElement('div');
      found.dataset.kind = className;
      found.className = className;
      $layer.appendChild(found);
    }
    next.set(key, found);
    return found;
  }

  /**
   * Sit a box exactly on a block of cells, optionally pulled in by `inset` on
   * all four sides so concentric outlines can nest without any of them drifting
   * off the square they mean.
   */
  function place(node, row, col, rowSpan, colSpan, inset = 0) {
    node.style.left = `${xAt(col) + inset}px`;
    node.style.top = `${yAt(row) + inset}px`;
    node.style.width = `${Math.max(2, span(colSpan) - inset * 2)}px`;
    node.style.height = `${Math.max(2, span(rowSpan) - inset * 2)}px`;
  }

  function drawLayer() {
    const next = new Map();
    const live = state.phase === 'guess';

    /*
     * The reveal's boxes are placed on a timeline, not from state, so they are
     * carried across untouched. Without this, any state update that lands
     * mid-reveal — somebody's phone dropping, a window resize — would sweep
     * the target off the board halfway through showing it.
     */
    for (const [key, el] of overlay) if (key.startsWith('reveal:')) next.set(key, el);

    // Crosshairs. One wheel set lights a whole band; both set collapse it to a
    // single cell. Only one player guesses at a time, so in practice there is
    // one of these — the nesting inset is kept for the moment a stale draft
    // from the previous player has not cleared yet.
    if (live) {
      (state.drafts || []).forEach((draft, index) => {
        const who = playerById(draft.playerId);
        if (!who || (!draft.row && !draft.col)) return;

        const box = node(next, `out:${draft.playerId}`, 'out');
        box.style.setProperty('--tone', who.colour.hex);
        box.classList.toggle('out--band', !(draft.row && draft.col));

        const inset = index * 2;
        if (draft.row && draft.col) place(box, draft.row, draft.col, 1, 1, inset);
        else if (draft.row) place(box, draft.row, 1, 1, COLS, inset);
        else place(box, ROWS[0], draft.col, ROWS.length, 1, inset);
      });
    }

    // Pins. Cycle 1's stay on the board through cycle 2, hollow and smaller.
    for (const guess of (state.guesses || []).flat()) {
      const who = playerById(guess.playerId);
      if (!who) continue;

      const past = guess.cycle === 1 && state.cycle === 2;
      const key = `pin:${guess.cycle}:${guess.playerId}`;
      const pin = node(next, key, past ? 'mark-pin mark-pin--past' : 'mark-pin');

      /*
       * A ring, not a disc, and never wider than the square it is on. The
       * hole is the point: you read the player from the ring and the colour
       * they actually guessed through the middle of it, which is the one
       * thing a filled marker cannot show you. No initial — ten players, ten
       * unmistakable colours, so the letter was only ever covering the board.
       */
      /*
       * Rounded to whole pixels, and to an even width so that centring it with
       * translate(-50%) also lands on a whole pixel. Half-pixel geometry is
       * invisible at 1× and obvious once the zoom multiplies it.
       */
      const size = Math.max(4, Math.round(cell * (past ? 0.54 : 0.92) / 2) * 2);
      const stroke = Math.max(1, Math.round(size * (past ? 0.2 : 0.24)));
      const middle = Math.round(cell / 2);

      pin.style.setProperty('--tone', who.colour.hex);
      pin.style.left = `${xAt(guess.col) + middle}px`;
      pin.style.top = `${yAt(guess.row) + middle}px`;
      pin.style.width = `${size}px`;
      pin.style.height = `${size}px`;
      pin.style.borderWidth = `${stroke}px`;
      pin.style.transform = 'translate(-50%, -50%)';
    }

    for (const [key, el] of overlay) if (!next.has(key)) el.remove();
    overlay = next;

    applyFocus();
  }

  // -------------------------------------------------------------------------
  // The reveal
  // -------------------------------------------------------------------------

  function clearReveal() {
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    forcedFocus = null;
    el('handoff').hidden = true;
    el('tally').hidden = true;
    $field.classList.remove('is-revealing');
    $field.querySelectorAll('.is-target').forEach((n) => n.classList.remove('is-target'));
    for (const [key, el] of overlay) {
      if (key.startsWith('reveal:')) { el.remove(); overlay.delete(key); }
    }
    $layer.querySelectorAll('.is-scoring').forEach((n) => n.classList.remove('is-scoring'));
  }

  const later = (ms, fn) => revealTimers.push(setTimeout(fn, ms));

  /** A square block clipped to the board, so a target near an edge still works. */
  function blockAround(target, radius) {
    const r = rowIndex(target.row);
    const r1 = Math.max(0, r - radius);
    const r2 = Math.min(ROWS.length - 1, r + radius);
    const c1 = Math.max(1, target.col - radius);
    const c2 = Math.min(COLS, target.col + radius);
    return { row: ROWS[r1], col: c1, rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 };
  }

  /**
   * Which corner the ring values hang off, given where the target landed.
   *
   * They sit *outside* their ring, so the question is only ever which two
   * sides have a square to spare. The outermost ring reaches two cells from
   * the target and the label needs about one more beyond that, so a target
   * within three of an edge has to hang its numbers the other way. Answered
   * once for the whole reveal rather than per ring, so the three of them keep
   * stepping outward along one diagonal instead of fanning apart.
   *
   * The zoom does not change the answer: its window is nine rows by seventeen
   * columns around the target, which is wider on every side than the ring plus
   * its label, so anything that clears the board's edge also clears the frame.
   */
  function valueCorner(target) {
    const room = 3;
    const vertical = rowIndex(target.row) >= room ? 't' : 'b';
    const horizontal = target.col > room ? 'l' : 'r';
    return vertical + horizontal;
  }

  function addRevealBox(key, className, target, radius) {
    const next = new Map(overlay);
    const box = node(next, `reveal:${key}`, className);
    overlay = next;
    const b = blockAround(target, radius);
    place(box, b.row, b.col, b.rowSpan, b.colSpan);
    return box;
  }

  /** Light every pin sitting in this ring, both cycles at once. */
  function lightRing(reveal, distance) {
    let hits = 0;
    for (const delta of reveal.deltas) {
      delta.hits.forEach((hit, index) => {
        if (!hit || hit.distance !== distance) return;
        const pin = overlay.get(`pin:${index + 1}:${delta.playerId}`);
        if (!pin) return;
        pin.classList.remove('is-scoring');
        // Restart the animation rather than waiting on it to be re-added.
        void pin.offsetWidth;
        pin.classList.add('is-scoring');
        hits += 1;
      });
    }
    return hits;
  }

  function runReveal(reveal) {
    clearReveal();
    const target = reveal.target;

    // 1 — the neighbourhood, on the full board. The zoom waits: everybody
    // should see where every pin landed before the screen narrows to the part
    // that scored, or a wild guess vanishes before it can be laughed at.
    const zone = addRevealBox('zone', 'zone', target, 1);
    SFX.chime(0);

    // 2 — close in on it, and show the cell itself.
    later(2400, () => {
      zone.remove();
      overlay.delete('reveal:zone');
      forcedFocus = windowAround(rowIndex(target.row), target.col);
      applyFocus();
      $field.classList.add('is-revealing');
      cellNode(target.row, target.col)?.classList.add('is-target');
      addRevealBox('bull', 'bull', target, 0);
      SFX.chime(1);

      const next = new Map(overlay);
      const tag = node(next, 'reveal:tag', 'tag');
      overlay = next;
      tag.style.setProperty('--tone', target.hex);
      tag.innerHTML = '<span class="tag__swatch"></span>'
        + `<span class="tag__name"></span><span class="tag__coord"></span>`;
      tag.querySelector('.tag__name').textContent = target.name;
      tag.querySelector('.tag__coord').textContent = `${target.row}${target.col}`;
      tag.style.left = `${xAt(target.col) + Math.round(cell / 2)}px`;
      tag.style.top = `${yAt(target.row) + Math.round(cell * 2.2)}px`;
      tag.style.width = 'auto';
      tag.style.height = 'auto';
    });

    // 3 — the rings, outward, each lighting the pins it just paid out to.
    // The square itself pays three; the ring touching it two; the next one.
    const RINGS = [
      { at: 3800, radius: 0, distance: 0, value: 3 },
      { at: 5000, radius: 1, distance: 1, value: 2 },
      { at: 6200, radius: 2, distance: 2, value: 1 },
    ];

    const corner = valueCorner(target);

    for (const ring of RINGS) {
      later(ring.at, () => {
        const box = addRevealBox(`ring${ring.value}`, `ring ring--${corner}`, target, ring.radius);
        box.innerHTML = `<span class="ring__value">${ring.value}</span>`;
        const hits = lightRing(reveal, ring.distance);
        if (ring.value === 3 && hits) SFX.bullseye();
        else SFX.chime(4 - ring.value);
      });
    }

    /*
     * 4 — hold. The rings have finished and nothing moves for five seconds:
     * the target is lit, everybody's pin is sitting in whatever ring it earned,
     * and this is the only moment in the turn where the room can look at that
     * and argue about it. Cutting straight to the numbers threw the picture
     * away right when it had become worth reading.
     */
    const tallyEnd = runTally(reveal, reveal.tallyAt || TALLY_AT);

    // 5 — then count the turn up, and hand off, if there is a turn to hand off
    // to. A game that just ended skips this; the winner is the thing to look at.
    if (!reveal.final && reveal.nextClueGiverName) {
      const at = tallyEnd + 1200;
      later(at, () => startHandoff(reveal, at));
    }
  }

  /**
   * When the tally arrives, if the server has not said. The server derives its
   * reveal hold from this same number and sends it back as `reveal.tallyAt`,
   * so the two can only disagree if a state payload predates the server.
   */
  const TALLY_AT = 11200;
  const TALLY_STEP = 620;

  /**
   * The turn's scoring, one player at a time and big enough to read from the
   * sofa. Returns when the last row will have landed, so the handoff can be
   * scheduled behind it.
   */
  function runTally(reveal, at) {
    const gained = new Map();
    for (const delta of reveal.deltas) gained.set(delta.playerId, delta.points);
    if (reveal.clueGiverId) {
      gained.set(reveal.clueGiverId,
        (gained.get(reveal.clueGiverId) || 0) + reveal.clueGiverPoints);
    }

    // Everyone in the turn, best first. Zeroes included — "you got nothing"
    // is information, and leaving people off the board reads as a bug.
    const rows = (state.players || [])
      .filter((p) => gained.has(p.id) || p.id === reveal.clueGiverId)
      .map((p) => ({ player: p, points: gained.get(p.id) || 0 }))
      .sort((a, b) => b.points - a.points);

    later(at, () => {
      // Back out to the whole board — the detail work is done.
      forcedFocus = null;
      applyFocus();

      el('tallyList').replaceChildren(...rows.map(({ player, points }) => {
        const li = document.createElement('li');
        li.style.setProperty('--tone', player.colour.hex);
        li.innerHTML = `<span class="tally__dot"></span>
          <span><span class="tally__name"></span>${player.id === reveal.clueGiverId
            ? ' <span class="tally__role">clue</span>' : ''}</span>
          <span class="tally__delta${points ? '' : ' is-zero'}">+${points}</span>
          <span class="tally__total"></span>`;
        li.querySelector('.tally__name').textContent = player.name;
        // The running total already includes this turn — the row shows where
        // they end up, beside what got them there.
        li.querySelector('.tally__total').textContent = player.score;
        return li;
      }));
      el('tally').hidden = false;
    });

    rows.forEach((row, index) => {
      later(at + 260 + index * TALLY_STEP, () => {
        const li = el('tallyList').children[index];
        if (!li) return;
        li.classList.add('is-in');
        SFX.tally(index, row.points);
      });
    });

    // Sync the score rail underneath while the tally is up.
    later(at + 260, () => renderScores({ deltas: true }));

    return at + 260 + Math.max(0, rows.length - 1) * TALLY_STEP + 700;
  }

  /**
   * Name the next clue-giver and count the room down to them. The countdown is
   * derived from the server's own hold rather than a number of its own, so the
   * two cannot drift apart and leave a "1" sitting on screen.
   */
  function startHandoff(reveal, at) {
    const card = el('handoff');
    el('tally').hidden = true;
    el('handoffName').textContent = reveal.nextClueGiverName;
    const who = playerById(reveal.nextClueGiverId);
    card.style.setProperty('--tone', who?.colour.hex || 'var(--chalk)');
    card.hidden = false;
    SFX.click();

    let left = Math.max(1, Math.round(((reveal.holdMs || 15000) - at) / 1000));
    el('handoffCount').textContent = left;

    const tick = () => {
      left -= 1;
      if (left <= 0) return;
      el('handoffCount').textContent = left;
      // Restart the pulse on the number rather than waiting for the next loop.
      const n = el('handoffCount');
      n.style.animation = 'none';
      void n.offsetWidth;
      n.style.animation = '';
      SFX.tick();
      revealTimers.push(setTimeout(tick, 1000));
    };
    revealTimers.push(setTimeout(tick, 1000));
  }

  // -------------------------------------------------------------------------
  // Rails
  // -------------------------------------------------------------------------

  function renderBanner() {
    const label = el('bannerLabel');
    const main = el('bannerMain');
    const giver = playerById(state.clueGiverId);
    const waiting = (state.waitingOn || []).map((id) => playerById(id)?.name).filter(Boolean);

    el('turnCount').hidden = !state.turnNo;
    el('turnCount').textContent = state.suddenDeath ? 'Sudden death' : `Turn ${state.turnNo}`;

    const cycles = state.cycle
      ? `<span class="cycles">${[1, 2].map((n) => `<i class="${n <= state.cycle ? 'is-on' : ''}"></i>`).join('')}</span>`
      : '';

    main.style.setProperty('--tone', giver?.colour.hex || 'var(--chalk)');

    if (state.phase === 'lobby') {
      label.textContent = 'Standing by';
      main.textContent = 'Waiting for players';
      return;
    }
    if (state.phase === 'game_over') {
      label.textContent = 'Final';
      main.textContent = 'Game over';
      return;
    }
    if (state.phase === 'pick_target') {
      label.textContent = 'Choosing a colour';
      main.innerHTML = `<span class="banner__who">${escape(giver?.name)}</span> is picking`;
      return;
    }
    if (state.phase === 'clue') {
      label.textContent = state.cycle === 1 ? 'Second clue' : 'First clue';
      main.innerHTML = `<span class="banner__who">${escape(giver?.name)}</span> is thinking${cycles}`;
      return;
    }
    /*
     * Whose clue it is has been on screen for two phases by now. What the room
     * actually needs during guessing is the one person it is waiting for, so
     * that goes in the big line and the clue-giver drops to the label.
     *
     * One name, never a list. Only one phone is open at a time, so naming
     * everybody who will eventually pin told the room four names of which
     * three were not actionable — and buried the one that was.
     */
    if (state.phase === 'guess') {
      label.innerHTML = `${escape(giver?.name)}'s clue${cycles}`;
      const active = playerById(state.activeGuesserId);
      if (!active) {
        main.textContent = 'All pins in';
        return;
      }
      const left = Math.max(0, waiting.length - 1);
      main.innerHTML =
        `<span class="banner__who" style="--tone:${escape(active.colour.hex)}">${escape(active.name)}</span> is pinning`
        + (left ? `<span class="banner__rest">${left} to go</span>` : '');
      return;
    }
    if (state.phase === 'reveal') {
      label.textContent = 'The colour was';
      main.innerHTML = state.reveal
        ? `${escape(state.reveal.target.name)} <span class="banner__who" style="--tone:var(--graphite)">${state.reveal.target.row}${state.reveal.target.col}</span>`
        : 'Revealing';
    }
  }

  /**
   * The room is waiting on one phone, and has been for a while.
   *
   * Two things can stall a turn and they look identical from the sofa: a phone
   * that has dropped off, and a phone that is on but face down on a sideboard.
   * Neither used to say anything — the board simply stopped, and the room
   * worked out between themselves whose fault it was. This names them, says
   * which of the two it is, and points at the person who can fix it.
   *
   * Nothing here is a timer that acts. It only ever tells the room something;
   * skipping and removing stay decisions somebody makes.
   */
  function escape(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  /**
   * The score rail. During a reveal the chips hold their pre-turn totals until
   * the deltas pop, so the room watches the points arrive rather than finding
   * them already counted.
   */
  function renderScores({ deltas = false } = {}) {
    const players = state.players || [];
    $scores.dataset.size = players.length >= 8 ? 's' : players.length >= 5 ? 'm' : 'l';

    const gained = new Map();
    if (state.phase === 'reveal' && state.reveal) {
      for (const d of state.reveal.deltas) gained.set(d.playerId, d.points);
      if (state.reveal.clueGiverId) {
        gained.set(state.reveal.clueGiverId,
          (gained.get(state.reveal.clueGiverId) || 0) + state.reveal.clueGiverPoints);
      }
    }

    const submitted = new Set();
    for (const guess of (state.guesses || [])[Math.max(0, state.cycle - 1)] || []) {
      submitted.add(guess.playerId);
    }

    $scores.replaceChildren(...players.map((p) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.setProperty('--tone', p.colour.hex);
      chip.style.setProperty('--ink', p.colour.ink);
      chip.classList.toggle('is-turn', p.id === state.clueGiverId);
      chip.classList.toggle('is-off', !p.connected);

      const delta = gained.get(p.id) || 0;
      const shown = (state.phase === 'reveal' && !deltas) ? p.score - delta : p.score;

      chip.innerHTML = `
        <span class="chip__pin">${escape(initial(p.name))}</span>
        <span class="chip__name">${escape(p.name)}</span>
        <span class="chip__score">${shown}</span>`;

      if (state.phase === 'guess' && submitted.has(p.id) && p.id !== state.clueGiverId) {
        const tick = document.createElement('span');
        tick.className = 'chip__in';
        chip.appendChild(tick);
      }

      if (deltas && gained.has(p.id)) {
        const pop = document.createElement('span');
        pop.className = `delta${delta ? '' : ' is-zero'}`;
        pop.textContent = `+${delta}`;
        chip.appendChild(pop);
      }
      return chip;
    }));

    el('goal').textContent = state.config.targetScore;
  }

  function renderLobby() {
    const sheet = el('lobbySheet');
    sheet.hidden = state.phase !== 'lobby';
    if (sheet.hidden) return;

    el('lobbyCode').textContent = state.code;
    const list = el('lobbyPlayers');

    if (!state.players.length) {
      list.innerHTML = '<li class="lobby__empty">Nobody yet.</li>';
    } else {
      list.replaceChildren(...state.players.map((p) => {
        const li = document.createElement('li');
        li.style.setProperty('--tone', p.colour.hex);
        li.innerHTML = `<span class="who__dot"></span>${escape(p.name)}`
          + (p.id === state.hostId ? '<span class="lobby__badge">Host</span>' : '');
        return li;
      }));
    }

    const short = Math.max(0, state.minPlayers - state.players.length);
    el('lobbyHint').textContent = short
      ? `Waiting for ${short} more player${short === 1 ? '' : 's'}`
      : `${state.hostName || 'The host'} can start the game · first to ${state.config.targetScore}`;
  }

  /**
   * The win.
   *
   * The celebration is the board itself rather than anything imported for the
   * occasion: a wave of the winner's colour rolls out from the middle of the
   * grid, cell by cell, and the standings land behind it. Four hundred and
   * eighty squares are already the most spectacular thing on this screen —
   * confetti would be a smaller idea.
   */
  function runWin(winner) {
    const tone = winner?.colour.hex || '#E9ECEF';
    $field.style.setProperty('--win-tone', tone);

    const cells = $field.children;
    const midCol = (COLS - 1) / 2;
    const midRow = (ROWS.length - 1) / 2;
    for (let i = 0; i < cells.length; i++) {
      const distance = Math.hypot((i % COLS) - midCol, Math.floor(i / COLS) - midRow);
      cells[i].style.setProperty('--wave', `${Math.round(distance * 42)}ms`);
    }

    $field.classList.add('is-celebrating');
    SFX.win();

    // Let the wave get most of the way out before the sheet covers the board.
    winTimer = setTimeout(() => { el('overSheet').hidden = false; }, 1150);
  }

  function stopWin() {
    clearTimeout(winTimer);
    celebrated = false;
    $field.classList.remove('is-celebrating');
    el('overSheet').hidden = true;
  }

  function renderOver() {
    const sheet = el('overSheet');
    // Visibility during game_over belongs to the celebration timeline, which
    // holds the sheet back until the wave has crossed the board.
    if (state.phase !== 'game_over') return;

    const winner = playerById(state.winnerId);
    if (winner) {
      const pin = el('overPin');
      pin.textContent = initial(winner.name);
      pin.style.setProperty('--tone', winner.colour.hex);
      pin.style.setProperty('--tone-ink', winner.colour.ink);
      el('overName').textContent = winner.name;
      el('overScore').textContent = `${winner.score} points · ${winner.colour.name}`;
      // The whole end screen is lit in the winner's colour.
      sheet.style.setProperty('--win-glow', withAlpha(winner.colour.hex, 0.26));
      sheet.style.setProperty('--tone', winner.colour.hex);
    }

    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    el('overTable').replaceChildren(...ranked.map((p) => {
      const li = document.createElement('li');
      li.style.setProperty('--tone', p.colour.hex);
      li.innerHTML = `<span class="who__dot"></span>
        <span class="chip__name">${escape(p.name)}</span>
        <span class="chip__score">${p.score}</span>`;
      return li;
    }));
  }

  // -------------------------------------------------------------------------
  // Sound cues, taken from what changed rather than from extra events
  // -------------------------------------------------------------------------

  function playCues() {
    if (!previous) return;

    if (previous.phase !== state.phase) {
      if (state.phase === 'guess') SFX.open();
      // game_over's sound belongs to runWin, so it lands with the wave.
      if (state.phase === 'pick_target' && previous.phase !== 'lobby') SFX.click();
    }

    const count = (s) => (s.guesses || []).flat().length;
    const landed = count(state) - count(previous);
    for (let i = 0; i < landed; i++) SFX.plink(count(previous) + i);
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  function render() {
    renderBanner();
    renderScores();
    measureRail();
    renderLobby();
    renderOver();
    drawLayer();
    // Something to arrive to while the room fills up, and silence once the
    // game is actually running.
    SFX.lobby(state.phase === 'lobby');
  }

  socket.on('game_state', (next) => {
    previous = state;
    state = next;
    stateAt = Date.now();
    updateGuessClock();
    el('code').textContent = state.code;

    const turnKey = `${state.turnNo}:${state.phase}`;
    if (state.phase !== 'reveal') {
      clearReveal();
      revealedTurn = null;
    }
    if (state.phase !== 'game_over' && celebrated) stopWin();

    render();
    playCues();

    if (state.phase === 'game_over' && !celebrated) {
      celebrated = true;
      runWin(playerById(state.winnerId));
    }

    // Once per turn, however many state updates the reveal phase produces.
    if (state.phase === 'reveal' && state.reveal && revealedTurn !== turnKey) {
      revealedTurn = turnKey;
      runReveal(state.reveal);
    }
  });

  // Crosshairs arrive on their own channel — a wheel moving must not cost a
  // full re-render of the score rail and the banner.
  socket.on('drafts', (drafts) => {
    if (!state) return;
    state.drafts = drafts;
    drawLayer();
  });

  socket.on('connect', () => {
    const code = new URLSearchParams(location.search).get('room');
    socket.emit('register_tv', { code: code || '' }, async (res) => {
      if (!res?.code) return;
      history.replaceState(null, '', `?room=${res.code}`);
      loadJoinInfo(res.code);
    });
  });

  async function loadJoinInfo(code) {
    try {
      const res = await fetch(`/hues-cues/api/join-info?code=${encodeURIComponent(code)}`);
      const info = await res.json();
      el('joinUrl').textContent = info.url.replace(/^https?:\/\//, '');
      if (info.qr) el('qr').innerHTML = `<img src="${info.qr}" alt="Join code" />`;
    } catch {
      el('joinUrl').textContent = 'Open this page on your phone to join';
    }
  }

  /*
   * Return to lobby, from the TV. Armed on the first click and fired on the second,
   * so a stray press cannot end a game that is halfway through. It disarms
   * itself after a few seconds rather than staying hot.
   */
  let armed = null;
  const newGame = el('newGame');

  function disarm() {
    clearTimeout(armed);
    armed = null;
    newGame.classList.remove('is-armed');
    newGame.textContent = 'Return to lobby';
  }

  newGame.addEventListener('click', () => {
    SFX.click();
    if (armed) {
      socket.emit('reset_game', {});
      disarm();
      return;
    }
    newGame.classList.add('is-armed');
    newGame.textContent = 'Tap to confirm';
    armed = setTimeout(disarm, 4000);
  });

  el('sound').addEventListener('click', () => {
    SFX.setEnabled(!SFX.enabled);
    el('sound').setAttribute('aria-pressed', String(SFX.enabled));
    el('soundState').textContent = SFX.enabled ? 'On' : 'Off';
    if (SFX.enabled) {
      SFX.click();
      if (state?.phase === 'lobby') SFX.lobby(true);
    }
  });

  // Browsers will not make a sound until the page has been touched once, so
  // the lobby bed starts on that first touch rather than on load.
  const unlock = () => {
    SFX.unlock();
    if (state?.phase === 'lobby') SFX.lobby(true);
  };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  window.addEventListener('resize', measure);

  buildBoard();
  measure();
  el('sound').setAttribute('aria-pressed', String(SFX.enabled));
  el('soundState').textContent = SFX.enabled ? 'On' : 'Off';
})();
