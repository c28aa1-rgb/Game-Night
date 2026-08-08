/**
 * MAFIA â€” the ship's voice.
 *
 * The AI reports a death the way it would report a maintenance fault: flat,
 * procedural, and occasionally, accidentally, very funny about it. Never
 * horror-dramatic. Never chipper. If a line could be read by an enthusiastic
 * host, it does not belong in here.
 *
 * Speech is Web Speech API, spoken from the TV only â€” it is the one device the
 * whole room can hear. Phones stay silent.
 *
 * The caption is not a fallback. Synthesised voices vary wildly by device and
 * plenty of them mumble, so the caption is what actually carries the line and
 * the voice is texture on top of it. It is also what makes the game playable
 * with the sound off, or by anyone hard of hearing. It is never optional.
 */

window.MafiaNarrator = (() => {
  /**
   * Several interchangeable variants per event, so a full game never repeats
   * itself. {name}, {officer} and {count} are filled in at speak time.
   */
  const LINES = {
    /**
     * The opening's last word, and the only part of it the ship says.
     *
     * The disaster itself is now told by the town who did not survive it, in
     * pre-rendered audio â€” see scripts/build-voices.js. By the time these lines
     * arrive the channel has been dead for three seconds and the room has just
     * worked out that nobody is coming. So the ship does not narrate the story;
     * it arrives late, counts the survivors, and states the problem.
     *
     * Told in order, so this is a list of *sequences* and one whole sequence is
     * picked. Both have to land the same three facts: the log has ended, the
     * numbers are bad, and one of the suits in the room did this.
     */
    intro: [
      [
        'The House is open. {count} names have been entered in the ledger.',
        'Most of you came here to make a case. A few came here to make a problem disappear.',
        'Keep your counsel. Watch your neighbors. The House is taking notes.',
      ],
      [
        'The lamps are low and the books are closed. {count} people remain at this table.',
        'Somebody here knows how the story ends. They will be lying about it.',
        'The House asks only one thing: make your case before somebody makes theirs for you.',
      ],
    ],

    /**
     * The whole story, for when the film cannot play.
     *
     * If the footage never loaded, nobody has told the room what happened â€” the
     * three lines above assume a dying town already did. So this pool carries
     * the original opening: six lines over the drawn sequence's six scenes,
     * landing the same four facts on its own. It is a complete opening, not a
     * message about a missing one, and nothing in it should read as degraded.
     */
    intro_full: [],

    /** Spoken once, to prove the speakers work and to set the register. */
    sound_check: [
      'Sound check. The House is ready to call the room to order.',
      'The house band is quiet. The House is listening.',
      'Sound check complete. Keep the volume up; the House has a few things to say.',
    ],

    game_start: [
      'Cards are dealt. Keep yours close to the vest.',
      'The ledger is sealed. Do not discuss what the House has shown you.',
      'The House has dealt the room. Some of you have business tonight.',
    ],

    night_begins: [
      'Night falls over the block. Close your eyes.',
      'The lamps go out. No peeking.',
      'Quiet now. The House has night business to conduct.',
    ],

    turn_mafia: [
      'Mafia, the room is yours. Choose carefully.',
      'Mafia, settle tonight\'s business.',
      'Mafia, make your move.',
    ],

    turn_detective: [
      'Detective, read one face.',
      'Detective, choose one player to investigate.',
    ],

    turn_doctor: [
      'Doctor, choose whom to protect.',
      'Doctor, one name gets your cover tonight.',
    ],

    morning_hit: [
      'Morning ledger: {name} did not make it home.',
      '{name} is gone. The coffee is still hot.',
      'The House records one less chair at the table. {name}.',
    ],

    morning_quiet: [
      'Morning. Every chair is filled. For now.',
      'Nobody was taken last night. Somebody is disappointed.',
      'The block is quiet this morning. Do not get comfortable.',
    ],

    discussion_opens: [
      'The floor is open. Accusations permitted. Evidence optional.',
      'Discussion period. Please argue efficiently.',
      'The floor is open. The House will not be participating.',
      'Open forum. Historically, this ends badly for somebody.',
      'Discussion window open. Lying is permitted. Getting caught is not.',
    ],

    spotlight: [
      '{name}. Defend yourself.',
      '{name} has the floor. Twenty seconds.',
      'The room is now looking at {name}.',
      '{name}, account for your night.',
    ],

    vote_opens: [
      'Voting is open. Choose who leaves the table.',
      'Ballots are open. A strict majority sends someone out.',
      'Vote now. The House counts. The House does not care.',
      'Voting period. Please select the person you feel least comfortable with.',
    ],

    vote_early: [
      'Every ballot is in. The House sees no reason to wait.',
      'All hands have voted. Closing the window early. Enthusiasm noted.',
      'Ballots complete ahead of schedule. That is either decisiveness or a plan.',
      'Everyone has voted. Counting now.',
    ],

    vote_closes: [
      'Voting closed. Tally follows.',
      'Ballots sealed. Counting.',
      'Window shut. The numbers are the numbers.',
      'Voting complete. Results are final and non-appealable.',
    ],

    vote_out: [
      'The town has chosen {name}. The door is waiting.',
      '{name}, by majority. Please step away from the table.',
      'Consensus reached. {name}. Escort is not required, but is happening.',
      '{name} has been sent out by vote. The House records the verdict.',
      'Majority found. {name}, take a walk.',
    ],

    vote_none: [
      'No majority. Nobody leaves the table.',
      'Vote inconclusive. Enjoy the extra night.',
      'No consensus. Everyone stays. Statistically, this favours somebody.',
      'The town failed to agree. The House has logged this as, quote, a choice.',
      'Deadlock. No one is ejected. The alarm was, on this occasion, false.',
    ],

    revenge_opens: [
      '{officer} was the Vigilante. One last name is theirs to give.',
      'Vigilante down. {officer}, name someone.',
      '{officer} carried a sidearm and a grudge. One shot remains.',
      '{officer} has one last shot. The House is listening.',
    ],

    revenge_kill: [
      '{officer} names {name}. The House records it.',
      'Parting shot registered. {name}, you are leaving too.',
      'Vigilante protocol executed. {name} follows {officer} out.',
      '{officer} points at {name}. The House complies.',
    ],

    revenge_none: [
      '{officer} named no one. The House closes the book.',
      'No designation given. Filed under, quote, restraint.',
      '{officer} declined to take anyone with them. Noted, and unusual.',
    ],

    win_town: [
      'All Mafia are accounted for. The town survives.',
      'The House closes the ledger. The town has won.',
      'No Mafia remain. You may return to your ordinary lies.',
    ],

    win_mafia: [
      'Town numbers are no longer sufficient. The Mafia own the room.',
      'Parity reached. The Mafia have taken the table.',
      'The House closes the ledger. The Mafia have won.',
    ],
  };

  /**
   * The tag spoken over the reveal flourish, once the body is gone. The
   * narrator naming the role is part of the reveal â€” the icon alone does not
   * land it.
   */
  const ROLE_TAG = {
    mafia: [
      'Mafia. The town was right, for once.',
      'Mafia confirmed. The House closes the file.',
    ],
    godfather: [
      'Godfather. A clean face and a dirty ledger.',
      'Godfather confirmed. The detective was meant to be fooled.',
    ],
    town: [
      'Town. No private business, just bad luck.',
      'Town member. The House marks the loss.',
    ],
    detective: [
      'That was the Detective. Their notebook is closed.',
      'Detective. Whatever they knew, they took with them.',
    ],
    doctor: [
      'That was the Doctor. There will be no more cover tonight.',
      'Doctor confirmed. The House marks the loss.',
    ],
    vigilante: [
      'That was the Vigilante. The House notes the irony.',
      'Vigilante confirmed. Armed, briefly.',
    ],
  };

  /** Pools already used this session, so nothing repeats while an option remains. */
  const used = new Map();

  function pick(pool, key) {
    if (!pool || !pool.length) return '';
    const seen = used.get(key) || new Set();
    const fresh = pool.filter((line) => !seen.has(line));
    const options = fresh.length ? fresh : pool;
    const line = options[Math.floor(Math.random() * options.length)];
    if (!fresh.length) seen.clear();
    seen.add(line);
    used.set(key, seen);
    return line;
  }

  const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (match, key) => (vars[key] == null ? match : vars[key]));

  // --- Voice ---------------------------------------------------------------

  const speech = window.speechSynthesis || null;
  const VOICE_KEY = 'mafia.voice';

  let voice = null;
  let enabled = true;
  /** Fired as each line starts, so the caption and any cutscene can follow it. */
  let onLine = () => {};
  /** Fired when the narrator starts and stops, so the ambience can duck. */
  let onSpeaking = () => {};

  /**
   * How good a voice is likely to sound.
   *
   * Browsers ship two very different classes of voice under one API. The old
   * built-in formant voices (eSpeak, Microsoft David, Fred) are the ones that
   * sound like a 1998 answering machine; the newer cloud-backed ones â€” named
   * "Natural", "Online" or "Neural", and reported with localService false â€”
   * are genuinely good and cost nothing. Ranking rather than hard-coding names
   * means every device gets the best voice it happens to have, and a machine
   * with only the old ones still works.
   */
  function score(v) {
    const name = v.name || '';
    let points = 0;
    if (/natural|neural/i.test(name)) points += 100;
    if (/online/i.test(name)) points += 45;
    if (v.localService === false) points += 30;
    if (/^google/i.test(name)) points += 35;
    // Known-decent local voices, as a floor for offline machines.
    if (/\b(Daniel|Alex|Samantha|Serena|Ryan|Guy|Aria|Jenny|Sonia)\b/i.test(name)) points += 18;
    // Deliberately down-ranked: these are the robotic ones.
    if (/\b(David|Zira|Mark|Hazel|eSpeak|Fred|Albert|Bad News|Bells)\b/i.test(name)) points -= 30;
    if (/en-GB/i.test(v.lang)) points += 12;
    if (/en-US|en-AU|en-IE/i.test(v.lang)) points += 8;
    return points;
  }

  /** Every English voice this device has, best first. */
  function catalogue() {
    if (!speech) return [];
    const all = speech.getVoices() || [];
    const english = all.filter((v) => /^en/i.test(v.lang));
    return (english.length ? english : all).slice().sort((a, b) => score(b) - score(a));
  }

  function chooseVoice() {
    const list = catalogue();
    if (!list.length) return;
    const saved = localStorage.getItem(VOICE_KEY);
    voice = (saved && list.find((v) => v.name === saved)) || list[0];
  }

  if (speech) {
    chooseVoice();
    // Voice lists load asynchronously, and on Chrome the first call almost
    // always returns an empty array.
    speech.addEventListener?.('voiceschanged', chooseVoice);
  }

  // --- The queue -----------------------------------------------------------

  /**
   * Lines are spoken one at a time, in order, and a line is never chopped off
   * mid-word by the next one.
   *
   * The old version called speechSynthesis.cancel() on every new line, which is
   * why lines were getting cut: two beats landing close together â€” a vote
   * closing and the ejection that follows, or the spotlight opening under the
   * discussion line â€” would talk over each other. Now a new beat clears
   * whatever is *pending* and waits for the sentence in progress to finish.
   */
  const queue = [];
  let speaking = null;
  let guard = null;
  /**
   * Whether we have told the outside world we are talking.
   *
   * This tracks the whole *run* of lines, not each line: between two queued
   * sentences there is a gap of a few milliseconds, and anything acting on
   * "the narrator has stopped" â€” the ship's ambience ducking back up, or the
   * server letting the next phase start â€” must not fire in that gap.
   */
  let announced = false;

  /** Roughly how long a line takes to read aloud â€” the fallback clock. */
  const readingTime = (text) => Math.min(9000, 600 + text.length * 62);

  /**
   * Speech engines lie in two opposite directions, and both have to be caught.
   *
   * Some platforms accept an utterance and then never fire `end`. That used to
   * be survivable â€” the guard timer moved the queue on â€” but now that phases
   * wait for the narrator, a device like that would make every line take its
   * full guard and drag the whole game with it.
   *
   * Others accept an utterance and report it finished immediately, which is
   * what a browser with no usable voice does. Believing that blows the entire
   * queue in one frame: three lines land on the same millisecond and the room
   * sees captions flicker past unread.
   *
   * Either way the answer is the same â€” stop believing the engine and drive the
   * captions on the reading clock, which is what the caption is for.
   */
  let speechTrusted = true;
  let naturalEnds = 0;
  let guardFires = 0;
  let instantEnds = 0;

  function pump() {
    if (speaking || !queue.length) return;
    const item = queue.shift();
    speaking = item;
    onLine(item.text, item.kind, item.meta);
    // Fired on every line, not just the first: anything waiting on the narrator
    // treats this as a heartbeat, so a long run of lines is not mistaken for a
    // screen that has stopped answering.
    announced = true;
    onSpeaking(true);

    if (!speech || !enabled || !speechTrusted) {
      // No voice, or one that cannot be relied on: the caption still needs to
      // hold long enough to be read.
      guard = setTimeout(done, readingTime(item.text));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(item.text);
    if (voice) utterance.voice = voice;
    // The natural voices are already unhurried; pitch down a touch for the flat,
    // procedural register without tipping into cartoon-villain.
    utterance.rate = 0.96;
    utterance.pitch = /natural|neural|online/i.test(voice?.name || '') ? 0.92 : 0.78;
    utterance.volume = 1;
    const startedAt = Date.now();
    utterance.onend = () => {
      guardFires = 0;
      // A sentence that "finished" in a fraction of the time it takes to say it
      // was never said. Two of those and the engine has stopped being evidence.
      if (Date.now() - startedAt < readingTime(item.text) * 0.35) {
        instantEnds += 1;
        if (instantEnds >= 2) speechTrusted = false;
      } else {
        naturalEnds += 1;
        instantEnds = 0;
      }
      done();
    };
    utterance.onerror = () => { naturalEnds += 1; done(); };
    speech.speak(utterance);

    // The safety net, kept close to the natural length of the line so that a
    // silent engine costs a beat rather than doubling every phase.
    guard = setTimeout(() => {
      guardFires += 1;
      if (naturalEnds === 0 && guardFires >= 2) speechTrusted = false;
      done();
    }, readingTime(item.text) * 1.25 + 1200);
  }

  function done() {
    if (!speaking) return;
    clearTimeout(guard);
    guard = null;
    speaking = null;
    // Straight into the next sentence, still counting as speaking.
    if (queue.length) return pump();
    announced = false;
    onSpeaking(false);
  }

  /**
   * Chrome stops synthesising after about fifteen seconds of continuous
   * speech, and again whenever the tab is throttled. Nudging it while it is
   * meant to be talking is the long-standing workaround.
   */
  if (speech) {
    setInterval(() => {
      if (speech.speaking && !speech.paused) speech.resume();
    }, 5000);
  }

  function textFor(kind, vars) {
    const pool = kind === 'role_tag' ? ROLE_TAG[vars.role] || ROLE_TAG.town : LINES[kind];
    const key = kind === 'role_tag' ? `role_tag:${vars.role}` : kind;
    return fill(pick(pool, key), vars);
  }

  function push(text, kind, meta) {
    if (!text) return '';
    queue.push({ text, kind, meta });
    pump();
    return text;
  }

  /**
   * Say a line, after whatever is already waiting.
   *
   * Nothing is ever dropped. An earlier version cleared the pending queue on
   * every new line, which meant that when three beats landed during one long
   * sentence â€” an ejection, then nightfall, then the mafia â€” the middle one
   * was thrown away and the room never heard it. The game now waits for the
   * narrator instead (see endPhase on the server), so the queue cannot run
   * away, and every line the ship starts is a line the room gets to hear.
   */
  function say(kind, vars = {}) {
    return push(textFor(kind, vars), kind, vars);
  }

  /** Explicitly queue a line. Same thing as say(), kept for readability. */
  function queueLine(kind, vars = {}) {
    return push(textFor(kind, vars), kind, vars);
  }

  /**
   * The ship's part of the opening, queued as one run of lines.
   *
   * `vars` carries the survivor count, which is the one thing in the opening
   * that cannot be pre-rendered â€” it depends on who actually turned up.
   *
   * `full` asks for the whole story rather than just the closing, and is what
   * the drawn opening uses when the film could not play. The two pools are
   * different lengths on purpose, because they are doing different jobs: three
   * lines over a roll call and a title, or six over six scenes.
   */
  function sayIntro(vars = {}, { full = false } = {}) {
    queue.length = 0;
    const key = full ? 'intro_full' : 'intro';
    const sequence = pick(LINES[key], key).map((text) => fill(text, vars));
    sequence.forEach((text, index) => {
      push(text, 'intro', { index, total: sequence.length });
    });
    return sequence;
  }

  /** Hard stop. For abandoning a game, not for moving between beats. */
  function cancel() {
    queue.length = 0;
    clearTimeout(guard);
    guard = null;
    speaking = null;
    if (announced) {
      announced = false;
      onSpeaking(false);
    }
    speech?.cancel();
  }

  /** Lines waiting to be spoken, not counting the one in progress. */
  const pending = () => queue.length;

  return {
    say,
    queue: queueLine,
    sayIntro,
    cancel,
    pending,
    get speaking() { return announced; },
    onLine(handler) { onLine = handler; },
    onSpeaking(handler) { onSpeaking = handler; },

    /** The device's English voices, best first â€” for the TV's picker. */
    voices: () => catalogue().map((v) => ({ name: v.name, lang: v.lang, local: v.localService })),
    get voiceName() { return voice?.name || ''; },
    setVoice(name) {
      const found = catalogue().find((v) => v.name === name);
      if (!found) return false;
      voice = found;
      localStorage.setItem(VOICE_KEY, name);
      return true;
    },

    get enabled() { return enabled; },
    setEnabled(next) {
      enabled = !!next;
      if (!enabled) cancel();
      return enabled;
    },
    get available() { return !!speech; },
  };
})();
