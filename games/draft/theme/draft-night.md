# Theme: Draft Night

Custom theme — premium sports broadcast. The visual language of a televised draft:
a darkened arena, trophy gold as the only luxury, and team colors that never mix.

## Palette

| Token        | Hex       | Role |
|--------------|-----------|------|
| `--ink`      | `#070A12` | Arena black — page ground |
| `--pitch`    | `#0C1120` | Panel ground, one step up from black |
| `--panel`    | `#121A2D` | Raised surfaces, wheel segments (even) |
| `--panel-2`  | `#0E1526` | Wheel segments (odd) |
| `--line`     | `#22304C` | Hairlines, dividers, empty slots |
| `--chalk`    | `#EEF2F9` | Primary text |
| `--mute`     | `#8494AE` | Labels, metadata, eyebrows |
| `--gold`     | `#E8B84B` | Trophy gold — pointer, rim, accents |
| `--gold-hi`  | `#FFF0C2` | Gold specular highlight |
| `--gold-lo`  | `#8F6A18` | Gold shadow / bevel |
| `--t1`       | `#F0523F` | Team 1 — scarlet |
| `--t2`       | `#3AA0FF` | Team 2 — sky |
| `--t3`       | `#2FD08A` | Team 3 — turf |
| `--t4`       | `#B07CFF` | Team 4 — floodlight violet |

Two to four teams, chosen on the roster page. None of the team colours is gold:
gold belongs to the chrome, so a team can never be mistaken for the furniture.

## Typography

- **Display** — Big Shoulders Display, 800/900. American condensed, jersey-and-scoreboard
  lineage. Used for headlines, names on the wheel, and team rosters. Tight tracking, caps.
- **Body / UI** — Archivo, 400–700. Neutral grotesque with a broad lowercase; carries
  buttons, inputs, and running copy without competing with the display face.
- **Data** — Archivo with `font-variant-numeric: tabular-nums`, uppercase, `0.18em`
  tracking for pick counters, roster numbers, and status lines.

## Signature

The wheel is a machined trophy bezel: dark segments separated by gold hairlines, a
milled gold pointer at 12 o'clock, and a specular sheen that sweeps the rim while
spinning. Every pick resolves into a broadcast lower-third that then physically flies
across the screen and locks into its team column.

## Layout by team count

The broadcast split holds at every count: benches flank the wheel, up to two a
side, stacked. Teams 1–2 take the left column, 3–4 the right, and the right-hand
benches mirror so both columns read outward from the wheel. Three teams leave one
bench alone on the right, where it takes both rows rather than sitting in half a
column.

The wheel always owns the full-height middle column. That is load-bearing, not
cosmetic: it is sized `min(58vh, 100%, 620px)`, so giving it a short grid row
instead makes it overflow upward into the status line on laptop-height screens.

The versus badge exists only between exactly two squads. Below 1080px everything
stacks under the wheel at any team count.

## Motion

- Spin: 4.2s, `cubic-bezier(.16,.84,.28,1)` — fast break, long settle.
- Reveal beat: ~5s from stop to locked-in row.
- Page change: full-bleed gold wipe, left-to-right in, right-to-left out.
- `prefers-reduced-motion`: spins resolve instantly, wipes become cross-fades.

## Sound

Synthesised in `sfx.js` — no audio files, so the game stays a static bundle with
nothing to preload. The context is built on the first gesture, because browsers
refuse to start audio before one. The toggle sits top-right on every page and
remembers itself in `localStorage`.

The wheel is the voice of this game. Its ratchet clicks once per segment edge
passing the pointer: bright and quiet at speed, fat and slow as it dies, so the
wheel can be heard running out of momentum without being watched. Those clicks
are derived from the spin's easing curve and handed to the audio clock up front
rather than sampled frame by frame — sample-accurate, and unaffected by dropped
frames or a backgrounded tab, where `requestAnimationFrame` is throttled to
nothing. Abandoning a spin cuts the queued clicks.

Everything else mixes under the wheel and the pointer's clunk. Stings are pitched
per team — F3, A3, C4, E4 — so which team just picked is audible as well as
visible. Measured peaks: ticks 0.19–0.29, clunk 0.44, team stings and the
completion fanfare 0.27–0.35, UI blips 0.08–0.26.
