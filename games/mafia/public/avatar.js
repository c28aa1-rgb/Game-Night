/* Colour-coded fedora silhouettes: readable at TV distance, discreet on a phone. */
window.MafiaAvatar = (() => {
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const mix = (a, b, amount) => {
    const hex = (value) => Number.parseInt(value.replace('#', ''), 16);
    const left = hex(a); const right = hex(b);
    const channel = (shift) => Math.round(((left >> shift) & 255) * (1 - amount) + ((right >> shift) & 255) * amount)
      .toString(16).padStart(2, '0');
    return `#${channel(16)}${channel(8)}${channel(0)}`;
  };
  const lighten = (hex, amount) => mix(hex, '#ffffff', amount);
  const darken = (hex, amount) => mix(hex, '#100b09', amount);
  const drain = (hex) => mix(hex, '#82766a', 0.72);

  function svg({ hex = '#8E1B22', size = 64, state = 'alive', idle = false } = {}) {
    const dead = state === 'dead';
    const cloth = dead ? drain(hex) : hex;
    const shadow = darken(cloth, 0.46);
    const ribbon = dead ? '#6d6258' : '#1a1110';
    const tilt = dead ? 'rotate(-9 64 67)' : (idle ? 'rotate(-1.5 64 67)' : '');
    return `<svg class="fedora${dead ? ' is-dead' : ''}${idle ? ' is-idle' : ''}" width="${size}" height="${size}" viewBox="0 0 128 128" aria-hidden="true">
      <g transform="${tilt}">
        <ellipse cx="64" cy="113" rx="43" ry="7" fill="#100b09" opacity="${dead ? '0.18' : '0.34'}"/>
        <path d="M39 78 C39 58 45 40 64 36 C83 40 89 58 89 78 L94 108 L34 108 Z" fill="${cloth}"/>
        <path d="M42 77 C49 84 79 84 86 77 L89 91 C79 97 49 97 39 91 Z" fill="${ribbon}"/>
        <path d="M33 73 C39 67 89 67 95 73 L104 84 C93 91 35 91 24 84 Z" fill="${cloth}"/>
        <path d="M42 64 L48 28 L72 17 L85 31 L88 68 C76 72 52 72 42 64 Z" fill="${cloth}"/>
        <path d="M48 28 L72 17 L85 31 L82 43 C69 35 58 36 48 43 Z" fill="${lighten(cloth, 0.16)}" opacity="0.55"/>
        <path d="M42 64 C54 70 76 70 88 64" fill="none" stroke="${shadow}" stroke-width="4" opacity="0.75"/>
        <circle cx="64" cy="81" r="4" fill="${lighten(cloth, 0.25)}" opacity="0.65"/>
        ${dead ? '<path d="M36 103 L91 49" stroke="#8E1B22" stroke-width="5" stroke-linecap="round"/>' : ''}
      </g>
    </svg>`;
  }

  function chip(player, { size = 34, showColourName = true, state } = {}) {
    const colour = player.colour || { hex: '#8A9AA2', name: '—' };
    const dead = state === 'dead' || player.alive === false;
    return `<span class="town${dead ? ' is-dead' : ''}">${svg({ hex: colour.hex, size, state: dead ? 'dead' : 'alive' })}<span class="town__text"><span class="town__name">${escapeHtml(player.name)}</span>${showColourName ? `<span class="town__colour">${escapeHtml(colour.name)}</span>` : ''}</span></span>`;
  }

  return { svg, chip, mix, lighten, darken, drain, escapeHtml };
})();
