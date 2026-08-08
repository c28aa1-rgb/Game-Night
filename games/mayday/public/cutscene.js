/**
 * MAYDAY — cutscenes.
 *
 * Built compositionally, not hand-authored per combination. Two axes:
 *
 *   base sequence   ← HOW they died
 *   reveal flourish ← WHAT they were
 *
 * There are three ways to be vented, three ways to be ejected by vote, one
 * sidearm, and one false alarm — and six role flourishes on the end of any of
 * them. Sequences are picked at random and never twice running, so a long game
 * does not turn into the same airlock over and over.
 *
 * The opening is the odd one out: one long scripted sequence, advanced by the
 * narrator's own lines rather than by a timer, so the story and the pictures
 * cannot drift apart.
 */

window.MaydayCutscene = (() => {
  const A = window.MaydayAvatar;

  let root = null;
  /** The sequence allowed to touch the screen. Anything older unwinds. */
  let current = null;
  /** Last sequence used per method, so the next one is a different one. */
  const lastUsed = {};

  const CANCELLED = Symbol('cutscene cancelled');

  /**
   * Sleep, then check we are still the sequence on screen.
   *
   * Cancelling by clearing timeouts would leave every pending `await` unsettled
   * and the sequence half-finished forever, holding its DOM. Letting the timer
   * fire and throwing instead lets an abandoned sequence unwind on its own the
   * moment a newer beat takes over.
   */
  function waiter(token) {
    return (ms) => new Promise((resolve, reject) => {
      setTimeout(() => (current === token ? resolve() : reject(CANCELLED)), ms);
    });
  }

  /** A drifting starfield, built fresh for each sequence that wants one. */
  function starfield(density = 1) {
    const layers = [
      { count: Math.round(60 * density), size: 1, opacity: 0.5, drift: 62 },
      { count: Math.round(26 * density), size: 1.8, opacity: 0.8, drift: 38 },
      { count: Math.round(10 * density), size: 2.6, opacity: 1, drift: 22 },
    ];
    return layers.map((layer, index) => {
      const dots = Array.from({ length: layer.count }, () => {
        const x = (Math.random() * 100).toFixed(2);
        const y = (Math.random() * 100).toFixed(2);
        return `<i style="left:${x}%;top:${y}%;width:${layer.size}px;height:${layer.size}px;opacity:${layer.opacity}"></i>`;
      }).join('');
      return `<div class="stars stars--${index}" style="--drift:${layer.drift}s">${dots}</div>`;
    }).join('');
  }

  /**
   * Atmosphere leaving in a hurry. Individual lines rather than a striped
   * gradient: a gradient can only slide as a block, and what this needs is
   * dozens of separate things being pulled the same way at their own pace.
   */
  function streaks(direction = 'right') {
    const lines = Array.from({ length: 44 }, () => {
      const top = (Math.random() * 100).toFixed(2);
      const width = (60 + Math.random() * 220).toFixed(0);
      const delay = (Math.random() * 700).toFixed(0);
      const duration = (520 + Math.random() * 380).toFixed(0);
      return `<i style="top:${top}%;width:${width}px;animation-delay:${delay}ms;animation-duration:${duration}ms"></i>`;
    }).join('');
    return `<div class="streaks streaks--${direction}">${lines}</div>`;
  }

  // --- Role flourishes ------------------------------------------------------

  /**
   * The glyph that materialises over the empty deck plate. An alert glyph for
   * the saboteurs, an instrument for each officer, and — deliberately —
   * nothing dramatic at all for plain crew.
   */
  const GLYPHS = {
    saboteur: {
      tint: 'var(--klaxon)',
      label: 'Saboteur',
      svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
                 stroke-linejoin="round" stroke-linecap="round">
        <path class="draw" d="M50 14 L92 84 L8 84 Z" />
        <path class="draw" d="M50 40 L50 62" stroke-width="7" />
        <circle cx="50" cy="73" r="3.6" fill="currentColor" stroke="none" />
      </svg>`,
    },
    sensor: {
      tint: 'var(--terminal)',
      label: 'Sensor Officer',
      svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
                 stroke-linecap="round">
        <circle cx="50" cy="50" r="5" fill="currentColor" stroke="none" />
        <path class="ring ring--1" d="M32 68 A26 26 0 0 1 32 32" />
        <path class="ring ring--2" d="M22 78 A40 40 0 0 1 22 22" />
        <path class="ring ring--1" d="M68 32 A26 26 0 0 1 68 68" />
        <path class="ring ring--2" d="M78 22 A40 40 0 0 1 78 78" />
      </svg>`,
    },
    medic: {
      tint: '#E8F3F7',
      label: 'Medic',
      svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4">
        <rect class="draw" x="14" y="24" width="72" height="56" rx="10" />
        <path class="draw" d="M50 38 L50 66 M36 52 L64 52" stroke-width="8" stroke-linecap="round" />
      </svg>`,
    },
    security: {
      tint: 'var(--amber)',
      label: 'Security Officer',
      svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
                 stroke-linejoin="round">
        <path class="draw" d="M50 12 L86 26 V54 C86 72 70 84 50 90 C30 84 14 72 14 54 V26 Z" />
        <path class="draw" d="M36 50 L46 62 L66 38" stroke-width="7" stroke-linecap="round" />
      </svg>`,
    },
    crew: {
      tint: 'var(--frost)',
      label: 'Crew',
      svg: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4">
        <rect class="draw" x="16" y="22" width="68" height="56" rx="6" />
        <circle cx="38" cy="44" r="9" />
        <path d="M26 66 C26 57 50 57 50 66" stroke-linecap="round" />
        <path d="M58 40 H74 M58 52 H74 M58 64 H70" stroke-linecap="round" stroke-width="3.4" />
      </svg>`,
    },
  };

  // The Mimic wears the crew badge until the suit stops being able to hold it.
  GLYPHS.mimic = { ...GLYPHS.saboteur, label: 'Mimic' };

  // --- Vented, at night -----------------------------------------------------

  /** The airlock cycles and takes them with it. */
  async function ventAirlock({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--vent';
    stage.innerHTML = `
      ${starfield()}
      <div class="airlock">
        <div class="iris">
          <div class="iris__void">${starfield(0.5)}</div>
          <div class="iris__blade iris__blade--top"></div>
          <div class="iris__blade iris__blade--bottom"></div>
        </div>
        <div class="iris__ring"></div>
        <p class="airlock__label readout">Airlock 4 · cycling</p>
      </div>
      ${streaks()}`;

    await wait(260 * speed);
    sfx?.airlock();
    stage.querySelector('.iris').classList.add('is-open');

    await wait(900 * speed);
    stage.querySelector('.streaks').classList.add('is-live');
    figure.classList.add('is-vented');
    figure.style.setProperty('--pull', `${1400 * speed}ms`);
    sfx?.decompress();

    await wait(1540 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.streaks').classList.remove('is-live');
    stage.querySelector('.iris').classList.remove('is-open');
    sfx?.lock();

    await wait(520 * speed);
  }

  /** The hull gives out beside them, which is quicker and much less tidy. */
  async function ventBreach({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--breach';
    stage.innerHTML = `
      ${starfield()}
      <div class="breach">
        <div class="breach__hole">${starfield(0.4)}</div>
        <div class="breach__plate breach__plate--upper"></div>
        <div class="breach__plate breach__plate--lower"></div>
        <div class="breach__shutter"></div>
        <p class="breach__label readout">Hull section 9 · integrity lost</p>
      </div>
      ${streaks()}
      <div class="blast"></div>`;

    await wait(400 * speed);
    stage.querySelector('.blast').classList.add('is-live');
    stage.querySelector('.breach').classList.add('is-torn');
    sfx?.tear();

    await wait(260 * speed);
    sfx?.decompress();
    stage.querySelector('.streaks').classList.add('is-live');
    figure.classList.add('is-vented');
    figure.style.setProperty('--pull', `${1150 * speed}ms`);

    await wait(1250 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.streaks').classList.remove('is-live');
    stage.querySelector('.breach').classList.add('is-sealed');
    sfx?.slam();

    await wait(620 * speed);
  }

  /** Down a maintenance shaft, which is not what a maintenance shaft is for. */
  async function ventShaft({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--shaft';
    stage.innerHTML = `
      <div class="deck">
        <div class="deck__floor"></div>
        <div class="shaft">
          <div class="shaft__void"></div>
          <div class="shaft__grate shaft__grate--left"></div>
          <div class="shaft__grate shaft__grate--right"></div>
        </div>
        <p class="shaft__label readout">Maintenance shaft 2 · open</p>
      </div>`;

    await wait(420 * speed);
    stage.querySelector('.shaft').classList.add('is-open');
    sfx?.grate();

    await wait(760 * speed);
    figure.classList.add('is-dropping');
    figure.style.setProperty('--drop', `${900 * speed}ms`);
    sfx?.intoVacuum();

    await wait(940 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.shaft').classList.remove('is-open');
    sfx?.slam();

    await wait(700 * speed);
  }

  // --- Voted out, in daylight -----------------------------------------------

  /** Marched down a corridor by people who have decided. */
  async function voteCorridor({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--vote';
    stage.innerHTML = `
      <div class="corridor">
        <div class="corridor__wall corridor__wall--left"></div>
        <div class="corridor__wall corridor__wall--right"></div>
        <div class="corridor__floor"></div>
        <div class="corridor__door"><span></span></div>
      </div>
      <div class="spotlight"></div>`;

    await wait(120 * speed);
    stage.querySelector('.spotlight').classList.add('is-sweeping');
    sfx?.caution();

    await wait(820 * speed);
    stage.querySelector('.corridor').classList.add('is-moving');
    figure.classList.add('is-marching');
    figure.style.setProperty('--march', `${1700 * speed}ms`);

    await wait(1700 * speed);
    stage.querySelector('.corridor__door').classList.add('is-open');
    sfx?.airlock();

    await wait(420 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.corridor__door').classList.remove('is-open');
    sfx?.slam();

    await wait(480 * speed);
  }

  /** The floor plate they are standing on stops being a floor. */
  async function voteTrapdoor({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--trapdoor';
    stage.innerHTML = `
      <div class="deck">
        <div class="deck__floor"></div>
        <div class="trap">
          <div class="trap__void">${starfield(0.5)}</div>
          <div class="trap__leaf trap__leaf--left"></div>
          <div class="trap__leaf trap__leaf--right"></div>
        </div>
        <p class="trap__label readout">Disposal chute · released</p>
      </div>
      <div class="spotlight"></div>`;

    await wait(140 * speed);
    stage.querySelector('.spotlight').classList.add('is-sweeping');
    sfx?.caution();

    await wait(900 * speed);
    stage.querySelector('.trap').classList.add('is-open');
    sfx?.grate();

    await wait(420 * speed);
    figure.classList.add('is-falling');
    figure.style.setProperty('--drop', `${1150 * speed}ms`);
    sfx?.intoVacuum();

    await wait(1180 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.trap').classList.remove('is-open');
    sfx?.slam();

    await wait(560 * speed);
  }

  /** Out of the cargo bay, in front of everybody, like refuse. */
  async function voteCargo({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--cargo';
    stage.innerHTML = `
      <div class="bay">
        <div class="bay__space">${starfield(0.7)}</div>
        <div class="bay__door bay__door--upper"></div>
        <div class="bay__door bay__door--lower"></div>
        <div class="bay__frame"></div>
        <p class="bay__label readout">Cargo bay 1 · depressurising</p>
      </div>
      <div class="deck__floor deck__floor--bay"></div>
      ${streaks()}`;

    await wait(320 * speed);
    stage.querySelector('.bay').classList.add('is-open');
    sfx?.grate();

    await wait(900 * speed);
    stage.querySelector('.streaks').classList.add('is-live');
    sfx?.decompress();
    figure.classList.add('is-sliding');
    figure.style.setProperty('--pull', `${1250 * speed}ms`);

    await wait(1320 * speed);
    figure.classList.add('is-gone');
    stage.querySelector('.streaks').classList.remove('is-live');
    stage.querySelector('.bay').classList.remove('is-open');
    sfx?.slam();

    await wait(560 * speed);
  }

  // --- The Security Officer's parting shot ------------------------------------

  /**
   * Not a variation on being ejected: the officer is already out of the airlock
   * when this happens, and this one is over in about a second and a half. The
   * body is disposed of afterwards, off screen, which the ship considers a
   * separate task.
   */
  async function revengeSidearm({ stage, figure, speed, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--sidearm';
    stage.innerHTML = `
      <div class="bridge">
        <div class="bridge__floor"></div>
        <div class="bridge__glow"></div>
      </div>
      <div class="muzzle"></div>
      <div class="impact"></div>`;

    await wait(420 * speed);
    stage.querySelector('.muzzle').classList.add('is-firing');
    stage.querySelector('.impact').classList.add('is-hit');
    figure.classList.add('is-hit');
    sfx?.gunshot();

    await wait(180 * speed);
    sfx?.shell();

    await wait(420 * speed);
    figure.classList.add('is-falling-over');
    figure.style.setProperty('--fall', `${620 * speed}ms`);

    await wait(660 * speed);
    sfx?.thud();

    await wait(700 * speed);
    figure.classList.add('is-gone');
    await wait(320 * speed);
  }

  /** A tied vote. The lights think about it, and then don't. */
  async function falseAlarm({ stage, sfx, wait }) {
    stage.className = 'cut__stage cut__stage--false';
    stage.innerHTML = `
      <div class="amber-wash"></div>
      <div class="false-plate">
        <p class="display false-plate__line">No majority</p>
        <p class="readout">Airlock remains sealed</p>
      </div>`;
    sfx?.flicker();
    stage.querySelector('.amber-wash').classList.add('is-flickering');
    await wait(1700);
  }

  const SEQUENCES = {
    vent: [ventAirlock, ventBreach, ventShaft],
    vote: [voteCorridor, voteTrapdoor, voteCargo],
    revenge: [revengeSidearm],
  };

  /** Random, but never the same one twice running. */
  function pickSequence(kind) {
    const list = SEQUENCES[kind] || SEQUENCES.vent;
    const fresh = list.length > 1 ? list.filter((fn) => fn !== lastUsed[kind]) : list;
    const choice = fresh[Math.floor(Math.random() * fresh.length)];
    lastUsed[kind] = choice;
    return choice;
  }

  // --- Flourish -------------------------------------------------------------

  async function flourish({ layer, role, sfx, wait, onTag }) {
    const glyph = GLYPHS[role] || GLYPHS.crew;
    const isMimic = role === 'mimic';
    const hostile = role === 'saboteur' || isMimic;

    layer.style.setProperty('--tint', glyph.tint);
    layer.hidden = false;

    if (isMimic) {
      // It reads like it is about to say Human. It gets most of the way there.
      layer.innerHTML = `
        <div class="flourish__glyph is-glitching">${GLYPHS.crew.svg}</div>
        <p class="flourish__label display">Crew</p>`;
      layer.style.setProperty('--tint', 'var(--frost)');
      sfx?.glitch();
      await wait(760);
      layer.style.setProperty('--tint', glyph.tint);
    }

    layer.innerHTML = `
      <div class="flourish__glyph">${glyph.svg}</div>
      <p class="flourish__label display">${glyph.label}</p>`;
    sfx?.reveal(hostile);
    onTag?.(role);

    await wait(1900);
    layer.classList.add('is-leaving');
    await wait(360);
  }

  // --- The opening ----------------------------------------------------------

  /** A survey vessel, eleven months out, with a hole in it. */
  const SHIP = `
<svg class="ship" viewBox="0 0 720 260" fill="none">
  <defs>
    <linearGradient id="ship-hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#39464D" />
      <stop offset="0.45" stop-color="#222C31" />
      <stop offset="1" stop-color="#10161A" />
    </linearGradient>
    <linearGradient id="ship-glow" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#26C6D6" stop-opacity="0.9" />
      <stop offset="1" stop-color="#26C6D6" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- engines -->
  <g class="ship__engines">
    <rect x="18" y="84" width="120" height="26" rx="10" fill="#1A2328" />
    <rect x="18" y="150" width="120" height="26" rx="10" fill="#1A2328" />
    <rect x="6" y="88" width="26" height="18" rx="6" fill="url(#ship-glow)" />
    <rect x="6" y="154" width="26" height="18" rx="6" fill="url(#ship-glow)" />
  </g>

  <!-- spine and hull -->
  <path d="M120 112 H600 L690 130 L600 148 H120 Z" fill="url(#ship-hull)" />
  <path d="M150 96 H560 C590 96 610 112 610 130 C610 148 590 164 560 164 H150 C132 164 122 150 122 130 C122 110 132 96 150 96 Z"
        fill="url(#ship-hull)" stroke="#46555C" stroke-width="1.5" />

  <!-- bridge -->
  <path d="M560 104 C600 104 628 116 640 130 C628 144 600 156 560 156 Z" fill="#28343A" stroke="#4E5F66" stroke-width="1.5" />
  <circle cx="600" cy="130" r="9" fill="#FFB020" opacity="0.85" />

  <!-- lit windows, the ones still lit -->
  <g fill="#FFB020" opacity="0.75">
    <rect x="300" y="118" width="10" height="5" rx="2" />
    <rect x="330" y="118" width="10" height="5" rx="2" />
    <rect x="390" y="118" width="10" height="5" rx="2" />
    <rect x="450" y="138" width="10" height="5" rx="2" />
    <rect x="360" y="138" width="10" height="5" rx="2" />
  </g>

  <!-- antenna array, snapped -->
  <path d="M420 96 L416 62 L400 48" stroke="#4E5F66" stroke-width="3" stroke-linecap="round" />
  <path d="M416 62 L444 54" stroke="#4E5F66" stroke-width="2" stroke-linecap="round" opacity="0.5" />

  <!-- the gash -->
  <g class="ship__wound">
    <path d="M214 100 L236 116 L222 124 L250 134 L226 142 L246 160 L200 154 L208 138 L190 128 L206 118 Z"
          fill="#0A0D0F" stroke="var(--klaxon)" stroke-width="2" />
  </g>
</svg>`;

  const SYSTEMS = [
    ['Long-range array', 'severed'],
    ['Reactor shielding', 'breached'],
    ['Distress relay', 'automated only'],
    ['Life support', '19 days'],
    ['Crew manifest', 'incomplete'],
  ];

  /**
   * The drawn opening. None of it advances on its own — introScene() is called
   * as each narrated line starts, so a slow voice on a slow device drags the
   * pictures along rather than being left behind by them.
   *
   * Two shapes:
   *
   *   full    every scene. This is the fallback for when the filmed opening
   *           cannot play — clips still downloading, no codec, sound never
   *           unlocked — and it is a complete opening in its own right, which
   *           is the only reason the filmed one is allowed to be optional.
   *   short   the roll call and the title only. Runs after the film, over the
   *           ship's three closing lines, once the crew are all dead and the
   *           survivors are the people in the room.
   */
  function playIntro(crew = [], options = {}) {
    if (!root) return;
    stop();
    const short = !!options.short;
    current = { intro: true, short };

    const suits = crew.slice(0, 12).map((player) => `
      <div class="lineup__member">
        ${A.svg({ hex: player.colour?.hex, size: crew.length > 8 ? 84 : 108 })}
        <span class="lineup__name">${A.escapeHtml(player.name)}</span>
      </div>`).join('');

    const debris = Array.from({ length: 26 }, () => {
      const top = (Math.random() * 100).toFixed(1);
      const left = (Math.random() * 60).toFixed(1);
      const size = (2 + Math.random() * 5).toFixed(1);
      const delay = (Math.random() * 2200).toFixed(0);
      const duration = (3600 + Math.random() * 4200).toFixed(0);
      return `<i style="top:${top}%;left:${left}%;width:${size}px;height:${size}px;
                        animation-delay:${delay}ms;animation-duration:${duration}ms"></i>`;
    }).join('');

    // The scenes the film has already covered, and which the short form drops.
    const story = short ? '' : `
        <div class="intro__scene intro__scene--ship is-live">
          <div class="intro__ship">${SHIP}</div>
          <div class="beacon">
            <span></span><span></span><span></span>
          </div>
          <p class="intro__slug readout">Automated distress relay · cycle 4,102 · no reply</p>
        </div>

        <div class="intro__scene intro__scene--wound">
          <div class="intro__ship intro__ship--close">${SHIP}</div>
          <div class="intro__flare"></div>
          <div class="debris">${debris}</div>
          <p class="intro__slug readout">Reactor shielding · opened from inside</p>
        </div>

        <div class="intro__scene intro__scene--systems">
          <p class="readout intro__eyebrow">Kestrel · systems report</p>
          <ul class="systems">
            ${SYSTEMS.map(([name, state]) => `
              <li class="systems__row"><span>${name}</span><b>${state}</b></li>`).join('')}
          </ul>
          <div class="scanline"></div>
        </div>`;

    root.hidden = false;
    showing(true);
    root.className = `cut cut--intro${short ? ' cut--intro-short' : ''}`;
    root.innerHTML = `
      <div class="intro">
        <div class="intro__space">${starfield(1.4)}</div>
${story}
        <div class="intro__scene intro__scene--crew${short ? ' is-live' : ''}">
          <p class="readout intro__eyebrow">Surviving crew</p>
          <div class="lineup">${suits}</div>
        </div>

        <div class="intro__scene intro__scene--title">
          <div class="shockwave"></div>
          <h1 class="display intro__mark">Mayday</h1>
          <p class="intro__tag">Trust some. Question all. Survive together.</p>
        </div>

        <div class="intro__grain" aria-hidden="true"></div>
        <div class="intro__vignette" aria-hidden="true"></div>
        <div class="intro__bar intro__bar--top" aria-hidden="true"></div>
        <div class="intro__bar intro__bar--bottom" aria-hidden="true"></div>
      </div>`;

    /*
     * The short form arrives out of the film's dead air, where the score has
     * already been stopped on purpose. Restarting it here would fill the exact
     * silence the whole sequence has been building toward, so it stays quiet
     * and only comes back for the title.
     */
    if (!short) {
      window.MaydaySFX?.intro.start();
      window.MaydaySFX?.intro.scene(0);
    }
  }

  /** Move the opening on. Scenes are 0-indexed and clamp at both ends. */
  function introScene(index) {
    if (!root || !root.classList.contains('cut--intro')) return;
    const scenes = Array.from(root.querySelectorAll('.intro__scene'));
    if (!scenes.length) return;

    /*
     * Short form: three ship lines over two scenes. The log-ends line and the
     * head count both play over the roll call — the survivors need a moment to
     * be looked at — and the title lands on the line about the suit.
     */
    if (root.classList.contains('cut--intro-short')) {
      const shortMap = [0, 0, 1];
      const target = scenes[shortMap[Math.min(index, shortMap.length - 1)]] || scenes[0];
      const first = !target.classList.contains('is-live');
      for (const scene of scenes) scene.classList.toggle('is-live', scene === target);

      if (first && target.classList.contains('intro__scene--title')) {
        window.MaydaySFX?.titleHit?.();
      }
      // One of the suits in the line-up is lying, and says so for a frame.
      if (index >= 1 && target.classList.contains('intro__scene--crew')) {
        const members = target.querySelectorAll('.lineup__member');
        if (members.length && !target.querySelector('.lineup__member.is-wrong')) {
          members[Math.floor(Math.random() * members.length)].classList.add('is-wrong');
          window.MaydaySFX?.glitch();
        }
      }
      return;
    }

    // Six narrated lines over five scenes: the last two lines share the crew
    // line-up, which is when the narrator mentions that one of them is lying.
    const map = [0, 1, 2, 3, 3, 4];
    const sceneIndex = map[Math.min(index, map.length - 1)];
    const target = scenes[sceneIndex] || scenes[scenes.length - 1];
    const changed = !target.classList.contains('is-live');
    for (const scene of scenes) scene.classList.toggle('is-live', scene === target);

    // The music follows the picture, and both follow the narrator.
    if (changed) window.MaydaySFX?.intro.scene(sceneIndex);

    if (changed && target.classList.contains('intro__scene--systems')) {
      const rows = target.querySelectorAll('.systems__row');
      rows.forEach((row, i) => setTimeout(() => {
        row.classList.add('is-failed');
        window.MaydaySFX?.systemFail();
      }, 520 * i));
    }

    // The last line is the one about a suit that is lying. One of them flickers.
    if (target.classList.contains('intro__scene--crew') && index >= 4) {
      const members = target.querySelectorAll('.lineup__member');
      const already = target.querySelector('.lineup__member.is-wrong');
      if (members.length && !already) {
        members[Math.floor(Math.random() * members.length)].classList.add('is-wrong');
        window.MaydaySFX?.glitch();
      }
    }
  }

  // --- Public ---------------------------------------------------------------

  function mount(container) {
    root = document.createElement('div');
    root.className = 'cut';
    root.hidden = true;
    container.appendChild(root);
    return root;
  }

  /**
   * Tell the page a cutscene owns the screen.
   *
   * The overlay covers everything, including the status bar — which is where
   * the only way out of a game lives. The bar stays clickable and simply gets
   * out of the way visually; it must never become unreachable just because
   * somebody is being ejected.
   */
  function showing(on) {
    document.body.classList.toggle('is-cutscene', !!on);
  }

  function dressStage() {
    root.className = 'cut';
    root.innerHTML = `
      <div class="cut__stage"></div>
      <div class="cut__figure" id="cut-figure"></div>
      <div class="cut__flourish" hidden></div>
      <div class="cut__ident"></div>`;
  }

  /**
   * @param {object}   options
   * @param {string}   options.method  'vent' | 'vote' | 'revenge' | 'false'
   * @param {object}   options.victim  server casualty: name, colour, role
   * @param {boolean}  options.harsh   run it fast and mean
   * @param {function} options.onTag   called with the role as the glyph lands,
   *                                   so the narrator can speak over it
   */
  async function play(options = {}) {
    if (!root) return;
    stop();

    const { method = 'vent', victim = null, harsh = false, onTag = null } = options;
    const sfx = window.MaydaySFX;
    const speed = harsh ? 0.72 : 1;
    const token = {};
    current = token;
    const wait = waiter(token);

    dressStage();
    const stage = root.querySelector('.cut__stage');
    const figure = root.querySelector('.cut__figure');
    const layer = root.querySelector('.cut__flourish');
    const ident = root.querySelector('.cut__ident');

    root.hidden = false;
    showing(true);
    root.classList.toggle('is-harsh', harsh);
    // The sequence decides where the figure stands and how big it is, so the
    // stage and the character are dressed from the same class.
    const family = method === 'false' ? 'false'
      : method === 'revenge' ? 'revenge'
        : method === 'vote' ? 'vote' : 'vent';
    root.classList.add(`is-${family}`);

    if (victim) {
      figure.innerHTML = A.svg({ hex: victim.colour?.hex, size: 280 });
      ident.innerHTML = `
        <span class="cut__name display">${A.escapeHtml(victim.name)}</span>
        <span class="readout">${A.escapeHtml(victim.colour?.name || '')}</span>`;
    } else {
      ident.hidden = true;
    }

    const ctx = { stage, figure, layer, speed, sfx, wait };

    try {
      if (method === 'false') await falseAlarm(ctx);
      else await pickSequence(family)(ctx);

      if (victim) await flourish({ ...ctx, role: victim.role, onTag });
    } catch (err) {
      // A newer beat took the screen. Nothing to clean up — it already reset
      // the stage on its way in.
      if (err !== CANCELLED) throw err;
      return;
    }

    if (current === token) {
      root.hidden = true;
      showing(false);
      current = null;
    }
  }

  /** Abandon whatever is on screen — a new beat has arrived. */
  function stop() {
    current = null;
    if (root?.classList.contains('cut--intro')) window.MaydaySFX?.intro.stop();
    if (root) root.hidden = true;
    showing(false);
  }

  return { mount, play, playIntro, introScene, stop, GLYPHS };
})();
