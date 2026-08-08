/**
 * MAFIA â€” the opening cinematic.
 *
 * The rest of the game's cutscenes are drawn: SVG, CSS and synthesis, composed
 * on the fly. This one is cut from footage, because the opening is the only
 * place in the game that has to establish a world rather than report an event.
 *
 * How it runs
 * -----------
 * The dialogue is the clock. Each of the fourteen pre-rendered lines resolves a
 * promise when it stops sounding, and the edit advances off the back of that â€”
 * so a slow decode or a long line drags the pictures along with it instead of
 * letting them drift. Nothing here is driven by a wall-clock timer except the
 * deliberate silences, which are the point.
 *
 * Every clip is its own <video>, all of them loaded and paused before the first
 * frame plays. Swapping the src of a single element stalls for a beat on the
 * cut, which is exactly where a stall is most visible. Nine elements is cheap;
 * a hitch on every cut is not.
 *
 * The video carries no audio track at all. Sound comes from the Web Audio graph
 * in sfx.js, which means one mixer governs dialogue, score and effects, and the
 * browser's autoplay rules never get a muted-video argument to have.
 *
 * If any of this is not ready â€” clips still downloading, decode failed, no
 * codec â€” `ready` reports false and the caller falls back to the drawn opening
 * that shipped before this existed. A cinematic that might not play is not
 * allowed to be the only opening.
 */

window.MafiaFilm = (() => {
  const FILM = '/mafia/film';
  const VOX = '/mafia/vox';

  /** Every clip the edit can call on. Loaded once, reused across cuts. */
  const SHOTS = [
    'calm', 'readout', 'console', 'corridor', 'ship', 'viewport', 'figure',
  ];
  const ELEMENTS = ['smoke', 'embers'];

  /**
   * The edit.
   *
   * `lines` is how many dialogue lines a shot stays up for, which is how the
   * picture stays welded to the performance. Long lines get long shots; the
   * reactor section cuts three times in fifteen seconds because that is what
   * the scene is doing. `overlay` screen-blends an element clip on top â€”
   * atmosphere leaving, or debris â€” and `shake` is the compartment failing.
   */
  const CUTS = [
    { shot: 'calm', lines: 1, score: 0 },
    { shot: 'readout', lines: 1 },
    { shot: 'console', lines: 2 },
    { shot: 'corridor', lines: 1, overlay: 'embers', shake: 0.4, cue: 'alarm', score: 1 },
    { shot: 'ship', lines: 1 },
    { shot: 'corridor', lines: 1, overlay: 'embers', shake: 0.8 },
    { shot: 'viewport', lines: 1, overlay: 'smoke', shake: 1, cue: 'breach', score: 2 },
    { shot: 'figure', lines: 1 },
    { shot: 'ship', lines: 1, overlay: 'smoke' },
    { shot: 'console', lines: 2, cue: 'quiet', score: 3 },
    { shot: 'figure', lines: 1 },
    { shot: 'console', lines: 1 },
  ];

  /** How long the screen stays dead after the last voice is cut off. */
  const DEAD_AIR_MS = 3000;
  /** Gaps between lines: inside a beat, and across a change of beat. */
  const GAP_MS = 420;
  const BEAT_GAP_MS = 1300;
  /** If a line's audio never loaded, hold roughly as long as it takes to read. */
  const READ_MS_PER_CHAR = 55;

  let root = null;
  let manifest = null;
  const videos = new Map();
  let loaded = false;
  let loading = null;
  /** How many lines have decoded, so a partial load can be finished later. */
  let voiceCount = 0;
  /** The run that owns the screen. A newer one invalidates whatever is going. */
  let token = null;

  const SFX = () => window.MafiaSFX;

  function sleep(ms, mine) {
    return new Promise((resolve, reject) => {
      setTimeout(() => (token === mine ? resolve() : reject(CANCELLED)), ms);
    });
  }

  const CANCELLED = Symbol('film cancelled');

  // --- Loading --------------------------------------------------------------

  /** Resolves once a clip has enough buffered to play without stalling. */
  function loadVideo(name, url) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.className = 'film__clip';
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.loop = true;
      // Safari will not decode anything until it is in the document.
      v.setAttribute('aria-hidden', 'true');

      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok ? { name, el: v } : null);
      };

      v.addEventListener('canplaythrough', () => done(true), { once: true });
      v.addEventListener('error', () => done(false), { once: true });
      // Don't let one slow clip hold the lobby hostage forever.
      setTimeout(() => done(v.readyState >= 3), 25000);
      v.load();
    });
  }

  /**
   * Pull everything down.
   *
   * Idempotent on purpose, because it is called from more than one place and
   * more than once: on the sound gate, and on every trip through the lobby.
   * Each stage is skipped if it already succeeded, so a retry costs only the
   * part that failed â€” and, critically, never appends a second set of video
   * elements to the stack.
   */
  function preload(container) {
    if (loading) return loading;

    loading = (async () => {
      if (!root && container) mount(container);
      if (!root) return { loaded: false, voices: 0 };

      if (!manifest) {
        try {
          const res = await fetch(`${VOX}/manifest.json`);
          if (!res.ok) throw new Error(String(res.status));
          manifest = await res.json();
        } catch {
          loaded = false;
          return { loaded: false, voices: 0 };
        }
      }

      if (!videos.size) {
        const wanted = [...SHOTS, ...ELEMENTS];
        const results = await Promise.all(
          wanted.map((name) => loadVideo(name, `${FILM}/${name}.mp4`)),
        );
        const stack = root.querySelector('.film__stack');
        for (const r of results) {
          if (!r) continue;
          videos.set(r.name, r.el);
          r.el.classList.add(ELEMENTS.includes(r.name) ? 'film__element' : 'film__scene');
          stack.appendChild(r.el);
        }
      }

      /*
       * Decoding needs an AudioContext. Browsers let one be built and decode
       * into before any gesture â€” it is only playback that waits â€” but not all
       * of them, so this is allowed to come up short and be retried later.
       */
      if (voiceCount < manifest.length) {
        voiceCount = (await SFX()?.voice.load(manifest.map((l) => `${VOX}/${l.file}`))) || 0;
      }

      // Every scene shot has to be there or the edit has holes in it. Missing
      // elements are survivable â€” they are overlays, not the picture.
      loaded = SHOTS.every((s) => videos.has(s)) && manifest.length > 0;

      return { loaded, voices: voiceCount };
    })().then((r) => {
      loading = null;
      return r;
    });

    return loading;
  }

  // --- The stage ------------------------------------------------------------

  function mount(container) {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'film';
    root.hidden = true;
    root.innerHTML = `
      <div class="film__stack"></div>
      <div class="film__flash" aria-hidden="true"></div>
      <div class="film__grain" aria-hidden="true"></div>
      <div class="film__vignette" aria-hidden="true"></div>
      <div class="film__bar film__bar--top" aria-hidden="true"></div>
      <div class="film__bar film__bar--bottom" aria-hidden="true"></div>`;
    container.appendChild(root);
    return root;
  }

  /** Put one shot on screen and, optionally, an element over it. */
  function cutTo(cut) {
    for (const [name, el] of videos) {
      const live = name === cut.shot || name === cut.overlay;
      el.classList.toggle('is-live', live);
      if (live) {
        try { el.currentTime = 0; } catch { /* not seekable yet */ }
        const p = el.play();
        if (p?.catch) p.catch(() => {});
      } else {
        el.pause();
      }
    }
    root.style.setProperty('--shake', String(cut.shake || 0));
    root.classList.toggle('is-shaking', !!cut.shake);
  }

  function blackout() {
    for (const el of videos.values()) {
      el.classList.remove('is-live');
      el.pause();
    }
    root.classList.remove('is-shaking');
  }

  /** The one-shots that punctuate the edit, fired as their cut lands. */
  function fireCue(name) {
    const sfx = SFX();
    if (!sfx) return;
    if (name === 'alarm') { sfx.caution?.(); root.classList.add('is-alarmed'); }
    if (name === 'breach') { sfx.decompress?.(); sfx.explosion?.(); flash(); }
    if (name === 'quiet') { root.classList.remove('is-alarmed'); }
  }

  function flash() {
    const f = root.querySelector('.film__flash');
    f.classList.remove('is-firing');
    void f.offsetWidth;
    f.classList.add('is-firing');
  }

  // --- Playing --------------------------------------------------------------

  /**
   * Run the town's half of the opening.
   *
   * Resolves after the dead air, at which point the ship has the room and the
   * caller takes over with the narrator. Rejects with CANCELLED if a newer beat
   * or a skip took the screen â€” the caller should treat that as "not my
   * problem any more" rather than as a failure.
   *
   * @param {object}   options
   * @param {function} options.onLine  ({ who, text }) as each line starts
   * @param {function} options.onClear called when the captions should go
   */
  async function play(options = {}) {
    if (!loaded || !root) return false;
    const { onLine = () => {}, onClear = () => {} } = options;

    const mine = {};
    token = mine;

    root.hidden = false;
    // `is-cutscene` is what dims the status bar without disabling it, and the
    // way out of a game lives in that bar. Reuse it rather than inventing a
    // second rule that could drift out of step with it.
    document.body.classList.add('is-film', 'is-cutscene');
    SFX()?.intro.start();
    // One duck, held for the whole sequence â€” see the note in sfx.js voice.play.
    SFX()?.duck(true);

    let index = 0;
    try {
      for (const cut of CUTS) {
        if (token !== mine) throw CANCELLED;
        cutTo(cut);
        if (cut.cue) fireCue(cut.cue);
        // The score follows the edit: beacon, then the pad opening as the
        // reactor goes, then the pulse, then the tension under the realisation.
        if (cut.score !== undefined) SFX()?.intro.scene(cut.score);

        for (let i = 0; i < cut.lines; i += 1) {
          const line = manifest[index];
          index += 1;
          if (!line) break;

          const prev = manifest[index - 2];
          if (prev) {
            await sleep(prev.beat === line.beat ? GAP_MS : BEAT_GAP_MS, mine);
          }
          if (token !== mine) throw CANCELLED;

          onLine({ who: line.who, text: line.text });
          const played = await SFX()?.voice.play(`${VOX}/${line.file}`);
          if (token !== mine) throw CANCELLED;

          // No audio for this line: hold long enough to read the caption, so a
          // failed decode costs comprehension rather than the whole scene.
          if (!played) await sleep(Math.max(1400, line.text.length * READ_MS_PER_CHAR), mine);
        }
      }

      // The channel dies mid-word. Everything stops: picture, score, room tone.
      // Three seconds of genuine nothing is the whole point of the sequence, so
      // the score is cut here rather than faded under the ship's first line.
      blackout();
      onClear();
      SFX()?.intro.stop();
      SFX()?.voice.stop();
      SFX()?.duck(false);
      await sleep(DEAD_AIR_MS, mine);

      return true;
    } catch (err) {
      if (err !== CANCELLED) throw err;
      return false;
    }
  }

  /** Abandon the cinematic. Safe to call when nothing is running. */
  function stop() {
    token = null;
    SFX()?.voice.stop();
    SFX()?.intro.stop();
    SFX()?.duck(false);
    if (!root) return;
    blackout();
    root.hidden = true;
    root.classList.remove('is-alarmed');
    document.body.classList.remove('is-film', 'is-cutscene');
  }

  return {
    mount,
    preload,
    play,
    stop,
    get ready() { return loaded; },
    /** True once every line has audio â€” pictures can be ready before voices. */
    get voiced() { return !!manifest && voiceCount >= manifest.length; },
    get shots() { return [...videos.keys()]; },
  };
})();
