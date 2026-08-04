# Theme: Draft Night

Custom theme — premium sports broadcast. The visual language of a televised draft:
a darkened arena, trophy gold as the only luxury, and two team colors that never mix.

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

## Motion

- Spin: 4.2s, `cubic-bezier(.16,.84,.28,1)` — fast break, long settle.
- Reveal beat: ~5s from stop to locked-in row.
- Page change: full-bleed gold wipe, left-to-right in, right-to-left out.
- `prefers-reduced-motion`: spins resolve instantly, wipes become cross-fades.
