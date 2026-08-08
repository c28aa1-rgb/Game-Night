# Hues & Cues — Design Spec

TV + phones adaptation of the Hues & Cues board game, built on this repo's
shared host (`lib/host.js`), following the same shape as `games/mafia`: a
`server.js` that registers `/hues-cues` routes and its own Socket.io
namespace, `public/` holding `tv.*`, `play.*`, `start.*`, `theme.css`,
`sfx.js`.

## 1. Core loop

1. **Lobby** — players join via QR/link on their phones. First to join is
   host. Each player picks a name + a color from a **fixed palette of 10**
   distinct colors (first-come-first-served, no duplicates). Host sets the
   winning score threshold (default **20**, configurable) and starts the
   game once 2+ players have joined.
2. **Clue-giver turn** — rotates through all players in join order, looping
   as needed until someone crosses the threshold.
   - Server randomly draws **4 candidate coordinates** from the 480-cell
     grid, shown privately on the clue-giver's phone (swatch + name +
     coordinate for each).
   - Clue-giver picks **one of the 4** as the target for their whole turn.
   - **Cycle 1**: clue-giver says a clue word out loud in the room, then
     taps "Start guessing" on their phone. This opens input on every other
     player's phone simultaneously.
   - Guessers place a pin (see §3) and submit. Submitted pins appear live
     on the TV immediately, in the player's color — but the target's 3×3
     zone and exact target cell stay hidden.
   - Once all guessers have submitted (or host force-advances), clue-giver
     gets a "Give second clue" prompt.
   - **Cycle 2**: same target. Clue-giver says a second, different clue out
     loud, taps "Start guessing" again. Guessers place a **new** pin (can
     reconsider based on the extra clue). Live pins update on the TV same
     as cycle 1.
   - **Reveal**: once cycle 2 is submitted, the TV reveals the 3×3 bullseye
     zone and the exact target cell (see §4), then scores every pin from
     both cycles against it and tallies points.
   - Turn ends, rotate to next clue-giver.
3. **Win check** — after each full clue-giver turn (both cycles scored), if
   any player is at/above the threshold, the round is the last one:
   - If exactly one player is at/above threshold and has the strict
     highest score → game ends, they win.
   - If tied at the top → **sudden-death**: one more clue-giver turn
     (next player in rotation), winner is whoever has the highest score
     after that turn (ties broken the same way again if needed).

## 2. Scoring

Per guess (both cycles score independently and add up):
- Lands on the **exact** target square → **3 pts**
- Lands in the ring touching it (the 8 neighbours) → **2 pts**
- Lands in the next ring out (16 squares) → **1 pt**
- Otherwise → 0

Clue-giver: **+1 pt per guesser who landed in the 3×3 bullseye**, per
cycle (so up to 2 scoring opportunities per turn, one per cycle).

Edge handling: rings clip at the grid boundary (rows A–P, cols 1–30) —
no wraparound.

## 3. Guess input (phone)

Two spinner/picker wheels — one for letter (A–P), one for number (1–30),
iOS-picker style. As soon as one axis is set and the other isn't, the TV
shows an **outline highlighting the full row or column** in that player's
color. Once both axes are set, the outline collapses to a single-cell
**box outline** in their color, live-updating as they scroll. The current
selection's actual swatch is shown on their own phone (small preview chip)
so they can see the color they're about to lock in. Tapping **Submit**
locks it: the TV swaps the outline for a solid pin marker (outlined shape +
player initial, per §6) in their color, and their phone shows a waiting
state until the phase advances.

While waiting (before their turn to guess, or after submitting), a
guesser's phone shows: whose turn it is to give clues, which cycle, and a
roster of who has/hasn't submitted yet.

## 4. Reveal sequence

Nothing about *whose* pins are where is hidden — that's live throughout.
The only reveal is the target itself, after cycle 2 submissions close:

1. TV highlights the 3×3 neighborhood around the target (still not saying
   which cell is the actual target) — a beat of anticipation.
2. Target cell flips/flashes to reveal itself.
3. Rings pulse outward from the target (3×3 → ring 2 → ring 3) as a visual
   scoring guide, each ring briefly highlighting the pins from both cycles
   that fall inside it.
4. **The board holds, still, for five seconds.** Everything is now on
   screen — the target lit, every pin sitting in whatever ring it earned —
   and this is the only point in the turn where that picture is worth
   reading. Cutting to the numbers threw it away exactly when it had become
   interesting.
5. The turn counts up, one player at a time, full-screen and large enough to
   read from the sofa. Everybody in the turn gets a row, zeroes included;
   the clue-giver's row is marked as theirs.
6. The handoff: the next clue-giver is named and the room counts down to
   them.

The hold is the game's only clock, and its length is derived rather than
chosen — the count is per player, so a ten-player turn holds longer than a
three-player one. Tap-to-skip on the host's phone cuts it short. A turn that
ends the game skips the handoff entirely.

## 5. Screens

**TV (`tv.html`)**
- Full color grid (16×30, rows A–P labeled left, columns 1–30 labeled top),
  rendered from the real board's hex data.
- Live outline previews + locked pin markers overlaid on the grid.
- Score bar: single row (top or bottom), player chips (color swatch +
  initial + score), auto-shrinks chip size as player count grows (2–10).
- Turn state banner: whose turn to give clues, which cycle (1 or 2),
  who's still deciding.
- Reveal overlay per §4.
- End-game screen: winner spotlight, final standings.

**Phone — lobby (`start.html`)**
- Join with name, pick color from the 10-color palette (taken colors
  disabled). First joiner flagged as host, gets the threshold-setting
  control and the "Start Game" button (disabled until 2+ players).

**Phone — clue-giver view (`play.html`, clue-giver state)**
- Private reveal of the 4 candidate swatches+coordinates, tap one to lock
  in as target for the turn.
- Between cycles: reminder of their own target (so they don't forget what
  they're clueing), "Start guessing" button, submitted-count roster.
- No text input anywhere for the clue — it's spoken aloud.

**Phone — guesser view (`play.html`, guesser state)**
- Locked-out state until clue-giver opens the cycle.
- Two spinner wheels + swatch preview + Submit, per §3.
- Waiting state with roster after submitting.

## 6. Visual & sound direction

- **Theme**: neutral dark chrome (near-black background, quiet
  typography, minimal accent) — the 480-color grid and player pin colors
  are the spectacle, UI chrome stays out of the way. No single "brand"
  accent color the way Hitster/Mafia have one, since a bold accent would
  visually compete with the board.
- **Player colors**: fixed palette of 10 distinct, saturated colors,
  chosen for max separation from each other AND for legibility as an
  outlined marker over arbitrary board colors (white/black stroke + player
  initial on every pin, not just a filled dot).
- **Sound**: minimal and tactile — soft UI clicks, a satisfying "plink" on
  pin placement, a rising chime through the reveal sequence, a warm
  success sting when someone lands a bullseye. No cartoonish/arcade
  stingers. Follows `games/mafia/public/sfx.js`'s pattern of synthesized
  sound (no audio files) if we want to keep the repo's zero-asset-audio
  convention.

## 7. Data

Source: 480-cell grid (16 rows A–P × 30 cols 1–30), each cell a hex code
+ common name, pulled from the user's spreadsheet. Needs to land as a
static JSON/JS module (e.g. `games/hues-cues/public/grid-data.js` or a
server-side JSON the TV/phone both fetch) — `{ row: 'A', col: 1, hex:
'#652F0D', name: 'brown' }` per cell, 480 entries. To be exported from the
spreadsheet as CSV and committed (not fetched live from Google Sheets at
runtime).

## 8. Open items for build time (not blocking design)

- Exact 10 player-color hex values (pull from `frontend-design` /
  `theme-factory` conventions for a legible, high-contrast palette against
  a dark chrome background).
- Key art / hub poster — use `canvas-design` to produce the poster the way
  the other hub cards were sourced, then run through
  `scripts/build-art.js`.
- Registry entry in `games/registry.js`: `id: 'hues-cues'`, players
  `'2–10 players · TV + phones'`, `status: 'draft'` until playtested.
- Reconnect/disconnect handling for a player mid-guess (out of scope for
  design, follow Mafia's existing reconnect pattern in
  `games/mafia/server.js`).

  *Settled in build:* the guess queue does **not** step over a player whose
  phone has dropped. Skipping silently is indistinguishable from a bug when
  you are watching from a sofa, and it costs somebody a clue for standing up.
  Instead the queue holds, the TV names who it is holding for and why, and the
  host gets two buttons — skip them, or remove them from the game. Removal is
  restricted to a player who has dropped or who is currently holding the queue
  up; anybody else is off limits, since "the host can remove whoever they
  like" is a different game.
