/**
 * MAYDAY — the ship's voice.
 *
 * The AI reports a death the way it would report a maintenance fault: flat,
 * procedural, and occasionally, accidentally, very funny about it. Never
 * horror-dramatic. Never chipper. If a line could be read by an enthusiastic
 * host, it does not belong in here.
 *
 * Speech is Web Speech API, spoken from the TV only — it is the one device the
 * whole room can hear. Phones stay silent.
 *
 * The caption is not a fallback. Synthesised voices vary wildly by device and
 * plenty of them mumble, so the caption is what actually carries the line and
 * the voice is texture on top of it. It is also what makes the game playable
 * with the sound off, or by anyone hard of hearing. It is never optional.
 */

window.MaydayNarrator = (() => {
  /**
   * Several interchangeable variants per event, so a full game never repeats
   * itself. {name}, {officer} and {count} are filled in at speak time.
   */
  const LINES = {
    /**
     * The opening's last word, and the only part of it the ship says.
     *
     * The disaster itself is now told by the crew who did not survive it, in
     * pre-rendered audio — see scripts/build-voices.js. By the time these lines
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
        'Automated log ends. Elapsed time since incident: two hours, eleven minutes.',
        'Surviving crew: {count}. Rescue, one hundred and twenty-two days. Life support, nineteen.',
        'The sequence was executed from inside a crew suit. The suit is still aboard. Good luck.',
      ],
      [
        'Log ends. No further transmissions were received, because none were sent.',
        'Surviving crew: {count}. The ship can count you. It cannot vouch for you.',
        'Whatever did this is wearing one of those suits. The ship has no stake in the outcome, and will be recording.',
      ],
    ],

    /**
     * The whole story, for when the film cannot play.
     *
     * If the footage never loaded, nobody has told the room what happened — the
     * three lines above assume a dying crew already did. So this pool carries
     * the original opening: six lines over the drawn sequence's six scenes,
     * landing the same four facts on its own. It is a complete opening, not a
     * message about a missing one, and nothing in it should read as degraded.
     */
    intro_full: [
      [
        'Automated distress relay. Mayday, mayday, mayday.',
        'This is the survey vessel Kestrel, eleven months out, on the wrong side of nowhere.',
        'Two hours ago something opened the reactor shielding from the inside. Then it opened the long-range array.',
        'Casualties: most of you. Survivors: the {count} people in this room.',
        'Rescue is four months away, and life support has three weeks in it. So that is settled.',
        'One more thing, and the ship apologises for the timing. Whatever did this is still aboard, and it is wearing a crew suit.',
      ],
      [
        'Mayday. Mayday. This is the Kestrel, and this is the last thing it will ever say.',
        'Somebody cut the array while the rest of the crew slept. Somebody who knew exactly which cable to cut.',
        'Then the reactor. Then the shielding. It was thorough. It was also, statistically, one of you.',
        'What is left of the crew is standing in this room. The ship can count {count} of you. It cannot vouch for any of you.',
        'No rescue. No comms. One airlock, and a vote.',
        'Good luck. The ship has no stake in the outcome and will be recording either way.',
      ],
    ],

    /** Spoken once, to prove the speakers work and to set the register. */
    sound_check: [
      'Audio confirmed. The ship will narrate your deaths from this screen.',
      'Speakers working. That is one system, at least.',
      'Sound check complete. Please do not adjust anything else.',
      'Audio online. The ship would like to note that this is not a rescue.',
    ],

    game_start: [
      'Crew manifest sealed. Assignments distributed. Please do not discuss yours with the airlock.',
      'Roles issued. Statistically, most of you are still human.',
      'Assignments complete. Morale subsystem remains offline. Proceed anyway.',
      'Manifest locked. Reminder: the ship does not take sides. The ship takes notes.',
      'Duties assigned. Some of you have been assigned other duties.',
    ],

    night_begins: [
      'Lights out. Standard night cycle. Please remain in your quarters. Or don\'t.',
      'Night cycle engaged. Corridor lighting reduced to emergency levels.',
      'Sleep period begins. The log will note who did not sleep.',
      'Main lights offline. Life support, adequate. Trust, unmeasured.',
      'Night cycle. The ship is now unsupervised. It usually is.',
      'Darkness engaged. Please close your eyes. The ship will keep both of its open.',
    ],

    turn_saboteurs: [
      'Saboteurs. Nobody is watching. Choose.',
      'Unregistered crew, select a target.',
      'Saboteurs awake. Twenty seconds of policy violation begins now.',
      'Saboteurs, confirm tonight\'s maintenance.',
      'The ones who are not human may now act.',
    ],

    turn_sensor: [
      'Sensor Officer. One scan available.',
      'Sensor Officer, the array is warm. Pick a crewmate.',
      'Scanning privileges granted. One subject only.',
      'Sensor Officer, choose. The array does not do second opinions.',
    ],

    turn_medic: [
      'Medic. One set of quarters may be sealed.',
      'Medic, choose a door to lock.',
      'Medic, seal someone in. Preferably usefully.',
      'Medic, one seal remaining tonight.',
    ],

    morning_vent: [
      '{name} has been ejected. Hull integrity nominal.',
      'Good morning. Crew count down by one. {name} is now outside the ship.',
      'Overnight incident report. {name}, vented. No damage to ship systems.',
      '{name} left through the airlock at oh three hundred. The airlock did not stop them.',
      'Morning. {name} is unavailable. Permanently. The coffee is still hot.',
      'Crew member {name} has been reclassified as debris.',
    ],

    morning_quiet: [
      'No incidents overnight. Everyone is accounted for. Suspicious.',
      'Morning. Full crew present. Someone had a plan and it did not work.',
      'Nothing to report. The night was uneventful, which is itself an event.',
      'Headcount unchanged. Please contain your disappointment.',
      'Zero casualties overnight. Statistically unlikely. Enjoy it.',
    ],

    discussion_opens: [
      'The floor is open. Accusations permitted. Evidence optional.',
      'Discussion period. Please argue efficiently.',
      'You may now talk among yourselves. The ship will not be participating.',
      'Open forum. Historically, this ends badly for somebody.',
      'Discussion window open. Reminder: lying is not a hull breach and cannot be detected.',
    ],

    spotlight: [
      '{name}. Defend yourself.',
      '{name} has the floor. Twenty seconds.',
      'The room is now looking at {name}.',
      '{name}, account for your night.',
    ],

    vote_opens: [
      'Voting is open. Choose someone to put outside.',
      'Ballots unlocked. A strict majority ejects.',
      'Vote now. The ship counts. The ship does not care.',
      'Voting period. Please select the person you feel least comfortable with.',
    ],

    vote_early: [
      'Every ballot is already in. The ship sees no reason to wait.',
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
      'The crew has chosen {name}. Airlock cycling.',
      '{name}, by majority. Please step towards the door.',
      'Consensus reached. {name}. Escort is not required, but is happening.',
      '{name} has been ejected by vote. Democracy remains undefeated.',
      'Majority found. {name} is going outside to think about it.',
    ],

    vote_none: [
      'No majority. Nobody is ejected. The crew has decided to decide later.',
      'Vote inconclusive. The airlock stays shut. Enjoy the extra night.',
      'No consensus. Everyone stays. Statistically, this favours somebody.',
      'The crew failed to agree. The ship has logged this as, quote, a choice.',
      'Deadlock. No one is ejected. The alarm was, on this occasion, false.',
    ],

    revenge_opens: [
      '{officer} was Security. Standard procedure grants one final designation.',
      'Security Officer down. Sidearm still authorised. {officer}, name someone.',
      '{officer} carried a sidearm and a grudge. One shot remains.',
      'Security protocol seventeen. The ejected officer may take one crewmate with them.',
    ],

    revenge_kill: [
      '{officer} names {name}. Second ejection processing.',
      'Parting shot registered. {name}, out you go.',
      'Security protocol executed. {name} follows {officer} out.',
      '{officer} points at {name}. The ship complies. It usually does.',
    ],

    revenge_none: [
      '{officer} named no one. The sidearm is logged as unused.',
      'No designation given. Filed under, quote, restraint.',
      '{officer} declined to take anyone with them. Noted, and unusual.',
    ],

    win_crew: [
      'All saboteurs accounted for. The crew survives. The ship does not, but well done.',
      'Threat neutralised. Remaining crew, {count}. Ship, still dying. Congratulations.',
      'Sabotage ended. The humans win. The ship will now resume sinking quietly.',
      'No hostile crew remain. You may return to your duties, briefly.',
    ],

    win_saboteurs: [
      'Crew numbers are no longer sufficient. The saboteurs have the ship.',
      'Parity reached. The remaining humans are outnumbered. Handover complete.',
      'Command has passed to the saboteurs. Please enjoy the rest of the flight.',
      'Human crew reduced below viable levels. The ship notes no objection.',
    ],
  };

  /**
   * The tag spoken over the reveal flourish, once the body is gone. The
   * narrator naming the role is part of the reveal — the icon alone does not
   * land it.
   */
  const ROLE_TAG = {
    saboteur: [
      'Suit reads: Saboteur. Not human. Never was.',
      'Saboteur confirmed. The crew was correct, for once.',
      'Scan complete. Saboteur. The ship knew. The ship is not obliged to share.',
    ],
    mimic: [
      'Suit reads: human. Correction. Correction. Saboteur. The suit was lying.',
      'Reading, human — reprocessing — Saboteur. Mimic confirmed.',
      'Identity check passed. Identity check failed. Mimic.',
    ],
    crew: [
      'Suit reads: Crew. No special duties. No second chances.',
      'Crew member. Nothing remarkable in the file. That was rather the point.',
      'Ordinary crew. The ship would like to note that this was avoidable.',
    ],
    sensor: [
      'That was the Sensor Officer. The array is now unstaffed.',
      'Sensor Officer. Whatever they knew, they took outside with them.',
      'Scanning duties are now vacant. No applicants expected.',
    ],
    medic: [
      'That was the Medic. Nobody left to seal the doors.',
      'Medic confirmed. Quarters will remain unlocked from tonight.',
      'The Medic. The ship recommends not needing one.',
    ],
    security: [
      'That was Security. The ship notes the irony.',
      'Security Officer. Armed, briefly.',
      'Security confirmed. Enforcement duties are now unassigned.',
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
  const VOICE_KEY = 'mayday.voice';

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
   * sound like a 1998 answering machine; the newer cloud-backed ones — named
   * "Natural", "Online" or "Neural", and reported with localService false —
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
   * why lines were getting cut: two beats landing close together — a vote
   * closing and the ejection that follows, or the spotlight opening under the
   * discussion line — would talk over each other. Now a new beat clears
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
   * "the narrator has stopped" — the ship's ambience ducking back up, or the
   * server letting the next phase start — must not fire in that gap.
   */
  let announced = false;

  /** Roughly how long a line takes to read aloud — the fallback clock. */
  const readingTime = (text) => Math.min(9000, 600 + text.length * 62);

  /**
   * Speech engines lie in two opposite directions, and both have to be caught.
   *
   * Some platforms accept an utterance and then never fire `end`. That used to
   * be survivable — the guard timer moved the queue on — but now that phases
   * wait for the narrator, a device like that would make every line take its
   * full guard and drag the whole game with it.
   *
   * Others accept an utterance and report it finished immediately, which is
   * what a browser with no usable voice does. Believing that blows the entire
   * queue in one frame: three lines land on the same millisecond and the room
   * sees captions flicker past unread.
   *
   * Either way the answer is the same — stop believing the engine and drive the
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
    const pool = kind === 'role_tag' ? ROLE_TAG[vars.role] || ROLE_TAG.crew : LINES[kind];
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
   * sentence — an ejection, then nightfall, then the saboteurs — the middle one
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
   * that cannot be pre-rendered — it depends on who actually turned up.
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

    /** The device's English voices, best first — for the TV's picker. */
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
