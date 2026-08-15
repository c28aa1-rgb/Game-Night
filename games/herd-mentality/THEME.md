# County Fair After Dark

County Fair After Dark is a custom theme built for a lively family game on a shared TV and personal phones. It borrows from painted livestock barns, enamel scoreboards, paper ear tags, and strings of fairground bulbs without becoming rustic costume.

## Palette

- Night Barn: `#101B2A` - primary background and deep ink
- Milk Glass: `#FFF9E7` - cards, high-contrast text, and breathing space
- Hay Bale: `#F6C95D` - prompts, progress, and positive emphasis
- Fairground Red: `#C93B2A` - decisive controls and structural accents
- Pasture: `#3D8067` - supporting panels and successful herd states
- Pink Cow: `#FF5C9A` - reserved for the penalty token and its transfer

## Type

- Display: Bowlby One SC, used for questions, scores, and short calls to action
- Body: Nunito Sans, used for instructions and player-facing copy
- Utility: IBM Plex Mono, used for room codes, rounds, counts, and status labels

## Shape And Motion

Player identity lives on clipped-corner ear tags with a punched circular mark. Tags gather along a horizontal herd rail as answers arrive, then reorganize into answer groups during the reveal. Motion is playful and weighty: 140ms presses, 280ms tag moves, 680ms scene entrances, and one 950ms Pink Cow transfer. The main easing is `cubic-bezier(.2,.8,.2,1)` with restrained overshoot on the cow only.
