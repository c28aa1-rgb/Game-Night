/**
 * MAYDAY — the crew.
 *
 * One character, twelve colours. Everybody aboard is the same pressure suit:
 * a heavy-shouldered bean with a wrap-around visor and a life-support pack
 * slung on the spine. The shape is drawn here from scratch rather than
 * imported, and every one of its tones is derived from the single hex the
 * server assigned to that player, so a crew of twelve is one drawing twelve
 * times over and never twelve drawings.
 *
 * Two details do the heavy lifting, and both come from the ship rather than
 * from the character: a cool key light down the left edge, and the alarm's red
 * bouncing off the right. That is why these read as being *in* this game
 * instead of dropped into it — the emergency lighting is painted onto the crew,
 * not just the room around them.
 *
 * Identity is colour AND name, everywhere, without exception. chip() is the one
 * place that pairing is built, so it cannot be forgotten on some screen.
 */

window.MaydayAvatar = (() => {
  /** Unique gradient ids — several dozen beans can share a page. */
  let seq = 0;

  const clamp = (n) => Math.min(255, Math.max(0, Math.round(n)));

  function parse(hex) {
    const clean = String(hex || '#888888').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  }

  const toHex = (rgb) => `#${rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;

  /** Blend towards another colour. amount 0 = untouched, 1 = fully the target. */
  function mix(hex, target, amount) {
    const a = parse(hex);
    const b = parse(target);
    return toHex(a.map((v, i) => v + (b[i] - v) * amount));
  }

  const lighten = (hex, amount) => mix(hex, '#FFFFFF', amount);
  const darken = (hex, amount) => mix(hex, '#000000', amount);

  /** Drain a suit of its colour — what the roster shows once somebody is gone. */
  function drain(hex) {
    const [r, g, b] = parse(hex);
    const grey = r * 0.32 + g * 0.5 + b * 0.18;
    return toHex([grey, grey, grey].map((v, i) => v * 0.72 + [r, g, b][i] * 0.1));
  }

  /**
   * One crew member.
   *
   * @param {object}  options
   * @param {string}  options.hex    the suit colour
   * @param {number}  options.size   rendered width in px
   * @param {string}  options.state  'alive' | 'dead' | 'ghost'
   * @param {boolean} options.idle   breathe on the spot
   * @param {string}  options.label  accessible name; omit for decoration
   */
  function svg(options = {}) {
    const {
      size = 96,
      state = 'alive',
      idle = false,
      label = '',
      className = '',
    } = options;

    const dead = state === 'dead' || state === 'ghost';
    const hex = dead ? drain(options.hex) : (options.hex || '#8A9AA2');
    const id = `bean${++seq}`;

    const body = hex;
    const bodyLo = darken(hex, dead ? 0.5 : 0.4);
    const bodyHi = lighten(hex, dead ? 0.12 : 0.26);
    const packHex = darken(hex, 0.52);
    const packHi = darken(hex, 0.3);
    const rim = lighten(hex, 0.62);

    const classes = [
      'bean',
      idle ? 'bean--idle' : '',
      dead ? 'bean--dead' : '',
      state === 'ghost' ? 'bean--ghost' : '',
      className,
    ].filter(Boolean).join(' ');

    // The silhouette, defined once: filled, clipped against, and reused as the
    // outline. Everything painted on the suit is clipped to it, so no seam,
    // cuff or light can ever escape the body's edge.
    const BODY = 'M41 66 C41 33 55 17 74 17 C94 17 108 32 108 60 L108 117 '
      + 'C108 124 104 128 97 128 L85 128 C80 128 77 125 76 120 L74 112 '
      + 'C73 108 69 108 68 112 L66 120 C65 125 62 128 57 128 L48 128 '
      + 'C42 128 41 124 41 117 Z';

    return `
<svg class="${classes}" viewBox="0 0 120 148" width="${size}" height="${Math.round(size * 148 / 120)}"
     ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'}>
  <defs>
    <linearGradient id="${id}-body" x1="0.1" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${bodyHi}" />
      <stop offset="0.42" stop-color="${body}" />
      <stop offset="1" stop-color="${bodyLo}" />
    </linearGradient>
    <linearGradient id="${id}-pack" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="${packHi}" />
      <stop offset="1" stop-color="${packHex}" />
    </linearGradient>
    <linearGradient id="${id}-glass" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#31414A" />
      <stop offset="0.5" stop-color="#101A1F" />
      <stop offset="1" stop-color="#05090B" />
    </linearGradient>
    <!-- The corridor lamp, off to the left. -->
    <linearGradient id="${id}-key" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#EAF6FF" stop-opacity="${dead ? 0.14 : 0.32}" />
      <stop offset="1" stop-color="#EAF6FF" stop-opacity="0" />
    </linearGradient>
    <!-- The alarm, bouncing off the right. This is the ship, not the suit. -->
    <linearGradient id="${id}-alarm" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="var(--klaxon, #FF3B1F)" stop-opacity="${dead ? 0.18 : 0.42}" />
      <stop offset="1" stop-color="var(--klaxon, #FF3B1F)" stop-opacity="0" />
    </linearGradient>
    <radialGradient id="${id}-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.55" />
      <stop offset="1" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <clipPath id="${id}-clip"><path d="${BODY}" /></clipPath>
  </defs>

  <ellipse class="bean__shadow" cx="72" cy="135" rx="38" ry="8" fill="url(#${id}-shadow)" />

  <g class="bean__figure">
    <!-- Life support, slung on the spine and cut back at the top like a tank. -->
    <g class="bean__pack">
      <path d="M44 52 L34 56 C25 59 21 65 21 75 L21 102 C21 112 25 118 34 118 L44 118 Z"
            fill="url(#${id}-pack)" />
      <path d="M26 70 L26 106 M33 68 L33 108" stroke="${darken(hex, 0.68)}" stroke-width="3.6"
            stroke-linecap="round" />
      <circle class="bean__led" cx="28" cy="62" r="2.5"
              fill="${dead ? '#2A3438' : 'var(--terminal, #3DDC84)'}" />
    </g>

    <!-- The suit. -->
    <g clip-path="url(#${id}-clip)">
      <rect x="0" y="0" width="120" height="148" fill="url(#${id}-body)" />

      <!-- Collar gasket, where the helmet clamps to the suit. -->
      <path d="M38 76 C58 83 92 83 111 75 L111 87 C92 95 58 95 38 88 Z"
            fill="${darken(hex, 0.34)}" fill-opacity="0.75" />
      <path d="M38 76 C58 83 92 83 111 75" fill="none" stroke="${lighten(hex, 0.4)}"
            stroke-opacity="0.35" stroke-width="1.4" />
      <circle cx="49" cy="85" r="2" fill="${lighten(hex, 0.3)}" fill-opacity="0.5" />
      <circle cx="101" cy="83" r="2" fill="${lighten(hex, 0.3)}" fill-opacity="0.5" />

      <!-- Hazard flash, low on the flank. -->
      <g opacity="${dead ? 0.2 : 0.55}">
        <path d="M50 100 L58 100 L52 114 L44 114 Z" fill="${darken(hex, 0.5)}" />
        <path d="M59 100 L64 100 L58 114 L53 114 Z" fill="${lighten(hex, 0.28)}" fill-opacity="0.55" />
      </g>

      <!-- Boot cuffs. -->
      <path d="M36 116 L68 116 L66 124 L36 124 Z" fill="${darken(hex, 0.46)}" fill-opacity="0.7" />
      <path d="M74 116 L112 116 L112 124 L76 124 Z" fill="${darken(hex, 0.46)}" fill-opacity="0.7" />

      <rect x="36" y="12" width="16" height="124" fill="url(#${id}-key)" />
      <rect x="92" y="12" width="20" height="124" fill="url(#${id}-alarm)" />
    </g>

    <!-- Reinforcing rib, front to back over the crown. -->
    <path d="M47 60 C47 35 58 23 76 20" fill="none" stroke="${darken(hex, 0.36)}"
          stroke-opacity="0.6" stroke-width="6.5" stroke-linecap="round" />
    <path d="M47 60 C47 35 58 23 76 20" fill="none" stroke="${rim}"
          stroke-opacity="${dead ? 0.1 : 0.28}" stroke-width="1.8" stroke-linecap="round" />

    <!-- Visor: a letterbox in a bolted gasket, not a porthole. -->
    <g class="bean__visor">
      <path d="M66 45 C66 36 74 31 87 31 C101 31 108 36 108 45 L108 62 C108 71 101 76 87 76 C74 76 66 71 66 62 Z"
            fill="${darken(hex, 0.6)}" />
      <path d="M70 46 C70 39.5 76.5 35.5 87 35.5 C98 35.5 104 39.5 104 46 L104 61 C104 67.5 98 71.5 87 71.5 C76.5 71.5 70 67.5 70 61 Z"
            fill="url(#${id}-glass)" />
      <!-- Reflection of the corridor lamp, and the alarm's own glint. -->
      <path d="M75 43 C80 39 90 38 96 40 C89 42.5 81.5 46 78 51 Z"
            fill="#FFFFFF" fill-opacity="${dead ? 0.05 : 0.2}" />
      <path d="M72 58 L102 58" stroke="${dead ? '#2A3438' : 'var(--terminal, #3DDC84)'}"
            stroke-opacity="${dead ? 0.3 : 0.22}" stroke-width="1" />
      <circle cx="98" cy="65" r="2.2" fill="var(--klaxon, #FF3B1F)" fill-opacity="${dead ? 0.15 : 0.6}" />
      <circle cx="72" cy="34" r="1.5" fill="${lighten(hex, 0.45)}" fill-opacity="0.6" />
      <circle cx="102" cy="34" r="1.5" fill="${lighten(hex, 0.45)}" fill-opacity="0.6" />
      ${dead ? `
      <path d="M74 42 L88 56 L82 58 L100 70" fill="none" stroke="#05090B" stroke-opacity="0.9"
            stroke-width="1.8" stroke-linejoin="round" />
      ` : ''}
    </g>
  </g>
</svg>`.trim();
  }

  /**
   * The standard way a person is named on any screen: the suit, the swatch, the
   * name. Colour is never the only carrier — a crew of twelve includes colours
   * a colour-blind player cannot tell apart, and the name is what they read.
   */
  function chip(player, options = {}) {
    const { size = 34, showColourName = true, state } = options;
    const colour = player.colour || { hex: '#8A9AA2', name: '—' };
    const dead = state === 'dead' || player.alive === false;
    return `
<span class="crew${dead ? ' is-dead' : ''}">
  ${svg({ hex: colour.hex, size, state: dead ? 'dead' : 'alive' })}
  <span class="crew__text">
    <span class="crew__name">${escapeHtml(player.name)}</span>
    ${showColourName ? `<span class="crew__colour">${escapeHtml(colour.name)}</span>` : ''}
  </span>
</span>`.trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  return { svg, chip, mix, lighten, darken, drain, escapeHtml };
})();
