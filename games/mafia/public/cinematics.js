/*
 * MAFIA — drawn cinematics
 *
 * These scenes are deliberately made from the same paper, brass and oxblood
 * as the game rather than from video files. That keeps them instant, lets the
 * casualty wear their actual calling colour, and makes every TV replay cleanly
 * after a round reset.
 */
window.MafiaCinematics = (() => {
  let root = null;
  let timers = [];

  const later = (ms, fn) => {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  };

  const clear = () => {
    for (const id of timers) clearTimeout(id);
    timers = [];
  };

  const escape = (value) => window.MafiaAvatar?.escapeHtml(value) || String(value || '');

  function mount(kind, markup) {
    stop();
    root = document.createElement('section');
    root.className = `cinema cinema--${kind}`;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = markup;
    document.body.append(root);
    requestAnimationFrame(() => root?.classList.add('is-live'));
    document.body.classList.add('is-cinema');
    return root;
  }

  function stop() {
    clear();
    root?.remove();
    root = null;
    document.body.classList.remove('is-cinema');
  }

  function hash(value) {
    return Array.from(String(value || '')).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
  }

  function figure(person, size = 230) {
    return window.MafiaAvatar?.svg({ hex: person?.colour?.hex || '#8E1B22', size, state: 'dead' }) || '';
  }

  function intro({ town = [] } = {}) {
    const cast = town.slice(0, 12).map((player, index) => `
      <li style="--i:${index}; --ink:${player.colour?.hex || '#8E1B22'}">
        <span class="cinema__roll-dot"></span>${escape(player.name)}
      </li>`).join('');
    const scene = mount('intro', `
      <div class="cinema__grain"></div><div class="cinema__vignette"></div>
      <div class="cinema__ledger-rule"></div>
      <div class="cinema__intro-copy">
        <p class="cinema__kicker">New York · 1931</p>
        <h2 class="cinema__title">The House<br /><em>opens</em></h2>
        <p class="cinema__sub">Every chair is filled. Not every hand is clean.</p>
      </div>
      <ol class="cinema__roll">${cast}</ol>
      <div class="cinema__seal">M</div>
      <div class="cinema__curtain cinema__curtain--left"></div>
      <div class="cinema__curtain cinema__curtain--right"></div>`);
    const sfx = window.MafiaSFX;
    later(360, () => { if (root === scene) sfx?.titleHit?.(); });
    later(1700, () => { if (root === scene) sfx?.caution?.(); scene.classList.add('is-roll'); });
    later(6200, () => { if (root === scene) scene.classList.add('is-verdict'); });
    later(27800, () => { if (root === scene) stop(); });
  }

  function playEffect(variant) {
    const sfx = window.MafiaSFX;
    if (variant === 'shot') {
      sfx?.gunshot?.();
      later(140, () => sfx?.shell?.());
      later(260, () => sfx?.thud?.());
      return;
    }
    if (variant === 'stab') {
      sfx?.tear?.();
      later(180, () => sfx?.thud?.());
      return;
    }
    // The vote is a civic execution: paper, a stamp, then the door.
    sfx?.ballot?.();
    later(110, () => sfx?.ballot?.());
    later(220, () => sfx?.tallyLand?.());
    later(420, () => sfx?.slam?.());
  }

  function eliminate({ victim, method = 'hit', seed } = {}) {
    const variant = method === 'vote'
      ? 'vote'
      : method === 'revenge'
        ? 'shot'
        : (hash(`${seed}:${victim?.name}`) % 2 ? 'shot' : 'stab');
    const label = variant === 'vote' ? 'Voted out' : variant === 'stab' ? 'Found in the alley' : 'Taken in the night';
    const scene = mount(`death cinema--${variant}`, `
      <div class="cinema__grain"></div><div class="cinema__vignette"></div>
      <div class="cinema__alley"></div><div class="cinema__streetlamp"></div>
      <div class="cinema__muzzle"></div><div class="cinema__slash"></div>
      <div class="cinema__ballot-paper"><span>VERDICT</span><b>OUT</b></div>
      <div class="cinema__death-figure">${figure(victim)}</div>
      <div class="cinema__blood-rule"></div>
      <div class="cinema__death-copy">
        <p>${label}</p><h2>${escape(victim?.name)}</h2><span>${escape(victim?.colour?.name || '')} calling card</span>
      </div>`);
    later(260, () => {
      if (root !== scene) return;
      scene.classList.add('is-impact');
      playEffect(variant);
    });
    later(980, () => { if (root === scene) scene.classList.add('is-reveal'); });
    later(3600, () => { if (root === scene) stop(); });
    return variant;
  }

  return { intro, eliminate, stop };
})();
