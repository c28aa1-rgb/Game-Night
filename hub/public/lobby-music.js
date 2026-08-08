/**
 * LOBBY MUSIC — the bed that plays while a room fills up.
 *
 * Shared by every game on the site. Served from /hub/lobby-music.js, so a game
 * wires it in with one script tag and two calls:
 *
 *   <script src="/hub/lobby-music.js"></script>
 *   LobbyMusic.start({ key: 'mayday' });   // the waiting screen is showing
 *   LobbyMusic.stop();                     // the game has actually begun
 *
 * Synthesised, like every other sound on this site. No audio files are loaded
 * from disk anywhere here and that is deliberate: nothing to license, nothing
 * to host, nothing to wait on before the first chord, and a game stays a
 * folder of text. See any game's own sfx.js — this is built from the same parts.
 *
 * What it is
 * ----------
 * Three layers, all quiet, none of them a tune:
 *
 *   pad       a chord held for ten seconds or so, crossfading into the next
 *             one in a four-chord loop. Two oscillators a few cents apart per
 *             note, because two detuned voices beat against each other and a
 *             single one sounds like a test signal.
 *   pulse     a soft low thump every couple of seconds. Something for the room
 *             to stand around in time to. Never a click — it has a 30ms attack.
 *   arpeggio  single pentatonic notes falling into a reverb at irregular
 *             intervals. Pentatonic is the whole trick: every note in the set
 *             is consonant against every chord in that game's progression, so
 *             a random note can never land wrong and the line never has to be
 *             composed. It also means it never resolves, which is what stops
 *             it becoming a melody the room learns and then resents.
 *
 * There is no noise or "air" layer, which the effects engines all have. Hiss
 * under a one-shot is texture; hiss held continuously through a cheap TV
 * soundbar for twenty minutes is just hiss.
 *
 * The mix
 * -------
 * MASTER is 0.085, which is very low on purpose. For comparison, the effects
 * buses on this site sit at 0.8–0.9 (games/mayday/public/sfx.js,
 * games/draft/static/sfx.js, games/hues-cues/public/sfx.js) and Hitster's is
 * 0.22 because it already has to live under Spotify. Those are all one-shots:
 * they are loud for a fraction of a second and then gone. This runs
 * continuously, and continuous sound is perceived as far more present than an
 * intermittent one at the same level — so it is set at roughly a tenth of a
 * normal effects bus and about a third of Hitster's already-restrained one.
 * The test is whether two people can talk across it without raising their
 * voices. If a game's own sounds ever seem to be fighting this, this number is
 * the one to move, not theirs.
 *
 * Timing is done with setTimeout rather than scheduled ahead on the audio
 * clock. Background tabs throttle timers, which would stretch the music — but
 * this only ever plays on a television nobody has tabbed away from, and the
 * alternative is a scheduler that has to be torn down mid-flight on every
 * stop. The other sound engines here make the same trade.
 */

window.LobbyMusic = (() => {
  /** Shared across all five games and remembered between sessions. */
  const STORE = 'arcade.lobbyMusic';

  /** See the note on the mix above before changing this. */
  const MASTER = 0.085;

  const FADE_IN = 1.2;
  const FADE_OUT = 0.9;

  const semi = (root, steps) => root * Math.pow(2, steps / 12);

  // ---------------------------------------------------------------------------
  // The five games
  //
  // Each key gets its own root, progression and timbre so the site does not
  // play one identical loop five times. The mood is taken from the game itself
  // and from the accent colour in games/registry.js — these beds are meant to
  // sound like they belong to the poster on the hub.
  //
  // Chords and scale degrees are semitone offsets from the root, so a
  // progression can be read as music rather than as a list of frequencies.
  // Negative offsets are notes below the root, which is how a relative minor
  // gets voiced without dropping the whole piece an octave.
  // ---------------------------------------------------------------------------

  const ACCENTS = {
    /*
     * HITSTER — #FF2E92, hot pink. A music quiz, and the one screen where this
     * has to share a room with actual records: the Hitster TV plays Spotify.
     * So it is the softest and sparsest of the five, and pure major — A, with
     * added sixths and ninths rather than plain triads, which reads as warm
     * rather than as a fanfare. Triangle pad: almost no upper harmonics, so it
     * cannot compete with a vocal.
     */
    hitster: {
      root: 110.0,                                   // A2
      chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 19], [7, 11, 14]],
      scale: [0, 2, 4, 7, 9],                        // A major pentatonic
      pad: 'triangle',
      colour: 1500,
      level: 0.85,
      chordMs: 12000,
      pulseMs: 3000,
      sparkleMs: 4200,
    },

    /*
     * CODENAMES — #E01B2E, red under a darkroom safelight. The game is two
     * people staring at a grid trying not to give anything away, so the bed is
     * the quietest and slowest here: D minor, voiced with sevenths and ninths
     * so nothing lands on a plain minor triad and turns maudlin. Sine pad
     * through a low filter — a hush rather than an instrument. Almost no
     * arpeggio, because the sound of this game is people thinking.
     */
    codenames: {
      root: 73.42,                                   // D2
      chords: [[0, 3, 7, 14], [-4, 0, 3, 7], [5, 8, 12, 15], [7, 10, 14, 17]],
      scale: [0, 3, 5, 7, 10],                       // D minor pentatonic
      pad: 'sine',
      colour: 950,
      level: 1.15,                                   // sine is thin; give it back
      chordMs: 14000,
      pulseMs: 4200,
      sparkleMs: 5600,
    },

    /*
     * MAFIA — #FF3B1F, hazard orange. Shipped as Mayday and renamed; the alias
     * below the table keeps the old key working. A derelict ship, and the lobby
     * is people boarding it. C minor, and the only sawtooth pad of the five —
     * filtered down to 520Hz so what comes out is not strings but the hum of
     * something large running in another compartment. The pulse is the closest
     * thing here to machinery. The arpeggio is deliberately rare and goes to
     * the reverb almost dry-free, so a note reads as a distant beacon rather
     * than as decoration.
     *
     * It also has to be able to disappear instantly: the opening cinematic has
     * recorded crew dialogue and its own score, and nothing may sit under it.
     */
    mafia: {
      root: 65.41,                                   // C2
      chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]],
      scale: [0, 3, 5, 7, 10],                       // C minor pentatonic
      pad: 'sawtooth',
      colour: 520,
      level: 0.55,                                   // sawtooth is loud; pull it down
      chordMs: 13000,
      pulseMs: 2600,
      sparkleMs: 6400,
    },

    /*
     * HUES & CUES — #F9680D, orange. The lightest game on the site: colours,
     * one-word clues, nobody in danger. F major with a raised fourth in the
     * scale would be too clever, so it is plain F major pentatonic over major
     * ninths — the brightest filter, the shortest chords and by far the
     * busiest arpeggio of the five. This is the one that sounds like a lounge.
     */
    'hues-cues': {
      root: 87.31,                                   // F2
      chords: [[0, 4, 7, 14], [2, 5, 9, 12], [5, 9, 12, 14], [7, 11, 14]],
      scale: [0, 2, 4, 7, 9],                        // F major pentatonic
      pad: 'triangle',
      colour: 2200,
      level: 0.9,
      chordMs: 10000,
      pulseMs: 2400,
      sparkleMs: 2800,
    },

    /*
     * DRAFT NIGHT — #3AA0FF, broadcast blue. This one is pre-game television:
     * a studio bed under a countdown clock. G major, and the most regular
     * pulse of the five at roughly a resting heart rate, because the point is
     * anticipation rather than calm. Shortest chords too, so the progression
     * turns over often enough to feel like it is going somewhere.
     */
    draft: {
      root: 98.0,                                    // G2
      chords: [[0, 4, 7], [-3, 0, 4, 7], [5, 9, 12], [7, 11, 14]],
      scale: [0, 2, 4, 7, 9],                        // G major pentatonic
      pad: 'triangle',
      colour: 1400,
      level: 0.9,
      chordMs: 9000,
      pulseMs: 1900,
      sparkleMs: 3400,
    },
  };

  /** The five real characters, read off before any aliases are added. */
  const CHARACTERS = Object.keys(ACCENTS);

  /*
   * Old names, pointing at the same character.
   *
   * A game that gets renamed should not silently fall through to the hash below
   * and come back sounding like a different game — the room would hear the
   * change. Keep the old key alive here instead.
   */
  ACCENTS.mayday = ACCENTS.mafia;

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  const Ctor = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  /** One impulse response, generated once and shared by every run's convolver. */
  let impulse = null;

  let enabled = recall() !== 'off';
  /** True once the page has had a real gesture, so a context is allowed to run. */
  let gestured = false;
  let listening = false;
  /**
   * The key the site last asked for. Kept even while muted or while waiting on
   * a gesture, because that is what lets the music start by itself the moment
   * either of those changes — nobody should have to press "play music".
   */
  let wanted = null;
  /** The run currently sounding, or null. */
  let run = null;

  function recall() {
    try { return localStorage.getItem(STORE); } catch { return null; }
  }

  function remember(value) {
    try { localStorage.setItem(STORE, value); } catch { /* private mode; not worth failing over */ }
  }

  function build() {
    if (!Ctor) return false;
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);

    /*
     * A room for the arpeggio to fall into.
     *
     * The single thing that separates "synthesised notes" from something that
     * sounds like it was played somewhere is reverb, and an impulse response
     * needs no audio file: it is only noise with an exponential decay, which is
     * what a room does to a sound. Long and soft — 2.6 seconds with a steep
     * curve, so notes bloom and vanish rather than smearing into each other.
     */
    const seconds = 2.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const tail = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // A little pre-delay, so the direct note is heard before the room is.
        const gate = i < ctx.sampleRate * 0.02 ? 0 : 1;
        tail[i] = gate * (Math.random() * 2 - 1) * (1 - t) ** 3.4;
      }
    }

    return true;
  }

  /**
   * Wait for a gesture.
   *
   * Browsers keep an AudioContext suspended until the page has been touched,
   * and this music is meant to be running before anybody has been asked to do
   * anything — people are standing in front of a QR code, not clicking. So the
   * first pointer, key or touch anywhere on the page resumes the context and
   * starts whatever was asked for while we could not play it.
   *
   * touchend as well as pointerdown because older iOS Safari treats only the
   * end of a touch as the qualifying gesture.
   */
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];

  function arm() {
    if (listening || gestured) return;
    listening = true;
    for (const type of GESTURES) window.addEventListener(type, onGesture, { passive: true });
  }

  /**
   * The page has been touched, so audio is allowed now.
   *
   * Reached from the listeners above and from the public unlock(), which is why
   * it does its own tidying up rather than relying on { once: true }: a game
   * that calls unlock() from its own button handler must leave nothing armed
   * behind it.
   */
  function wake() {
    if (listening) {
      listening = false;
      for (const type of GESTURES) window.removeEventListener(type, onGesture);
    }
    gestured = true;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* nothing to do */ });
    if (enabled && wanted && !run) begin(wanted);
  }

  function onGesture() {
    wake();
  }

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------

  /**
   * One note, with a long way in and a long way out.
   *
   * Every layer in the bed is made of these; the pad, the pulse and the
   * arpeggio differ only in how long each stage of the envelope lasts. The
   * oscillator schedules its own stop, so nothing has to be swept up
   * afterwards except on a hard stop.
   */
  function voice(r, spec) {
    const t = ctx.currentTime + (spec.at || 0);
    const peak = Math.max(spec.peak, 0.0002);
    const end = t + spec.attack + spec.hold + spec.release;

    const osc = ctx.createOscillator();
    osc.type = spec.type || 'sine';
    osc.frequency.value = spec.freq;
    if (spec.detune) osc.detune.value = spec.detune;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + spec.attack);
    gain.gain.setValueAtTime(peak, t + spec.attack + spec.hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(spec.dest || r.colour);

    if (spec.wet) {
      const tap = ctx.createGain();
      tap.gain.value = spec.wet;
      gain.connect(tap);
      tap.connect(r.send);
    }

    osc.start(t);
    osc.stop(end + 0.05);
    keep(r, osc, end);
  }

  /**
   * Hold on to a node so a hard stop can silence it mid-note.
   *
   * A lobby can be open for half an hour, which is a few thousand notes, so the
   * list is swept of anything that has already finished whenever it gets long.
   */
  function keep(r, node, end) {
    r.nodes.push({ node, end });
    if (r.nodes.length > 120) r.nodes = r.nodes.filter((v) => v.end > ctx.currentTime);
  }

  /** Arm the next step of one layer. One pending timer per layer, never more. */
  function later(r, name, fn, ms) {
    r.timers[name] = setTimeout(() => { if (r.live) fn(r); }, Math.max(60, ms));
  }

  /**
   * The pad: the next chord in the progression, crossfading over the last one.
   *
   * The attack and release are both longer than the gap between steps, which is
   * what makes this a crossfade rather than a sequence of chords — the old
   * chord is still dying while the new one arrives, so the progression moves
   * without anything ever being heard to start or stop.
   */
  function chordStep(r) {
    const a = r.accent;
    const chord = a.chords[r.step % a.chords.length];
    const seconds = a.chordMs / 1000;
    const hold = Math.max(0.6, seconds - 3.4);

    for (const note of chord) {
      const freq = semi(a.root * 2, note);
      // Two of everything, a few cents either side of the note. The slow beat
      // between them is the difference between a pad and a sine wave.
      voice(r, { freq, type: a.pad, peak: 0.05 * a.level, attack: 3.4, hold, release: 4.2, detune: -6, wet: 0.16 });
      voice(r, { freq, type: a.pad, peak: 0.05 * a.level, attack: 3.9, hold, release: 4.6, detune: 7, wet: 0.16 });
    }

    // The chord's own bass note, an octave under the pad, as a plain sine.
    // Weight without mud: a filtered sawtooth down here would swallow the room.
    voice(r, { freq: semi(a.root, chord[0]), type: 'sine', peak: 0.1, attack: 3, hold, release: 3.6 });

    r.step += 1;
    later(r, 'chord', chordStep, a.chordMs);
  }

  /**
   * The pulse. Two sines an octave apart, the lower one felt rather than heard
   * on a small speaker and the upper one carrying it on speakers that cannot
   * reach the bottom octave at all. The 35ms attack is doing the real work: at
   * anything shorter this reads as a tick, and a tick every two seconds for
   * twenty minutes is a metronome nobody asked for.
   *
   * The gap wanders by a few tens of milliseconds so it never quite locks, which
   * keeps it from sounding like a countdown.
   */
  function pulse(r) {
    const a = r.accent;
    voice(r, { freq: a.root, type: 'sine', peak: 0.15, attack: 0.035, hold: 0.03, release: 0.46 });
    voice(r, { freq: a.root * 2, type: 'sine', peak: 0.07, attack: 0.03, hold: 0.02, release: 0.26 });
    later(r, 'pulse', pulse, a.pulseMs + (Math.random() * 90 - 45));
  }

  /**
   * The arpeggio: one pentatonic note, dropped into the reverb.
   *
   * Straight to the run's bus rather than through the colour filter, so a dark
   * pad can still have a bright note over it — on Mafia that contrast is the
   * point, and the note reads as something pinging somewhere else on the ship.
   *
   * Two octaves are in play (two and three above the root) and the gap is
   * heavily jittered, so the line wanders rather than pacing. Nothing repeats.
   */
  function sparkle(r) {
    const a = r.accent;
    const degree = a.scale[Math.floor(Math.random() * a.scale.length)];
    const lift = Math.random() < 0.3 ? 8 : 4;
    voice(r, {
      freq: semi(a.root * lift, degree),
      type: 'sine',
      peak: 0.055,
      attack: 0.04,
      hold: 0.06,
      release: 2.0,
      dest: r.bus,
      wet: 1,
    });
    later(r, 'sparkle', sparkle, a.sparkleMs * (0.6 + Math.random() * 0.9));
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  /**
   * A key nobody has written a character for still has to sound like something,
   * and it has to sound like the same something every time — so an unknown key
   * is hashed onto one of the five rather than defaulting to a sixth generic
   * one. Add a game to ACCENTS and it stops being a coin toss.
   */
  function accentFor(key) {
    if (ACCENTS[key]) return ACCENTS[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
    return ACCENTS[CHARACTERS[hash % CHARACTERS.length]];
  }

  function begin(key) {
    if (!enabled) return;

    /*
     * Do not so much as open a context before a gesture. Browsers log a warning
     * for one created in a state they are not going to let run, and there is no
     * point: onGesture() calls straight back here the moment there is one.
     */
    if (!ctx && !gestured) return;
    if (!ctx && !build()) return;   // no Web Audio at all — do nothing, quietly

    if (ctx.state === 'suspended') {
      // Resume and come back rather than laying the music down into silence and
      // having it appear halfway through a chord. Safari rejects this outside a
      // gesture, which is exactly why the gesture listeners exist as well.
      ctx.resume()
        .then(() => { if (wanted === key && enabled && !run) begin(key); })
        .catch(() => { /* the gesture listeners will get there */ });
      return;
    }

    // A different game's bed is still going — retire it and let the two fades
    // cross. Each run owns its own bus, so they never fight over one gain.
    if (run) retire(run);

    const accent = accentFor(key);

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_IN);
    bus.connect(master);

    // The pad and the pulse go through this; it is most of what makes one
    // game's bed sound different from another's.
    const colour = ctx.createBiquadFilter();
    colour.type = 'lowpass';
    colour.frequency.value = accent.colour;
    colour.Q.value = 0.6;
    colour.connect(bus);

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    convolver.connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    send.connect(convolver);

    run = {
      key,
      accent,
      live: true,
      step: 0,
      nodes: [],
      timers: {},
      wires: [bus, colour, convolver, send],
      bus,
      colour,
      send,
    };

    chordStep(run);
    // The pulse and the arpeggio come in behind the first chord rather than on
    // top of it, so the bed arrives as one thing settling in.
    later(run, 'pulse', pulse, 1800);
    later(run, 'sparkle', sparkle, 4200);
  }

  /** Fade a run out and take it apart once it is inaudible. */
  function retire(dying) {
    dying.live = false;
    for (const id of Object.values(dying.timers)) clearTimeout(id);
    dying.timers = {};

    const t = ctx.currentTime;
    dying.bus.gain.cancelScheduledValues(t);
    dying.bus.gain.setValueAtTime(Math.max(dying.bus.gain.value, 0.0001), t);
    dying.bus.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT);

    // Held pad notes would otherwise run for another several seconds behind a
    // silent fader, so they are stopped outright — but only once the fade has
    // finished, because cutting an oscillator at any audible level is a click.
    setTimeout(() => {
      for (const held of dying.nodes) {
        try { held.node.stop(); } catch { /* already finished */ }
      }
      dying.nodes = [];
      for (const wire of dying.wires) {
        try { wire.disconnect(); } catch { /* already gone */ }
      }
    }, (FADE_OUT + 0.25) * 1000);
  }

  // ---------------------------------------------------------------------------
  // The public set
  // ---------------------------------------------------------------------------

  return {
    /**
     * Play the bed for a game.
     *
     * Idempotent by design: a screen that re-renders on every state update can
     * call this every time and only the first call does anything. Calling it
     * with a different key while something is already playing hands over
     * between the two rather than layering them.
     *
     * Safe before any gesture — the request is remembered and the music starts
     * itself the moment the first pointer, key or touch arrives.
     */
    start(options) {
      const key = typeof options === 'string' ? options : String((options && options.key) || '');
      wanted = key;
      arm();
      if (!enabled) return;
      if (run && run.key === key) return;
      begin(key);
    },

    /**
     * Stop, over about a second. Also forgets what was playing, so a gesture
     * arriving later cannot bring it back under a game already in progress.
     */
    stop() {
      wanted = null;
      if (!run) return;
      retire(run);
      run = null;
    },

    /**
     * The mute preference, shared by every game and remembered between visits.
     * Turning it back on restarts whatever the current screen last asked for,
     * so it takes effect where you pressed it rather than on the next reload.
     */
    setEnabled(on) {
      enabled = !!on;
      remember(enabled ? 'on' : 'off');
      if (!enabled) {
        if (run) retire(run);
        run = null;
        return;
      }
      if (wanted && !run) begin(wanted);
    },

    isEnabled() {
      return enabled;
    },

    /**
     * Call this from inside a gesture handler a game already has — a "turn the
     * sound on" button, say. Not required: the listeners above catch the first
     * gesture anywhere on the page by themselves.
     */
    unlock() {
      wake();
    },
  };
})();
