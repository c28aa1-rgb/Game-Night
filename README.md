# Arcade

Party games behind one hub page, served by one Express process.

```
/                 hub landing page
/hitster          Hitster — pick a screen
/hitster/tv       Hitster — TV screen
/hitster/play     Hitster — phone controller
/hitster/resolve  Hitster — match songs to Spotify
/mafia           Mafia — pick a screen
/mafia/tv        Mafia — TV screen, and the ship's AI
/mafia/play      Mafia — phone
/chameleon       Chameleon - pick a screen
/chameleon/tv    Chameleon - shared screen
/chameleon/play  Chameleon - phone controller
/codenames        Codenames
/draft            Draft Night
```

`/hitster?room=CODE` redirects to `/hitster/play?room=CODE`, and `/mafia`
does the same, so a QR code or a shared link still drops a player straight into
the game rather than asking them which screen they are.

## Run it

```bash
npm install
npm start
```

Needs `.env` with `SPOTIFY_CLIENT_ID` (copy `.env.example`). Default port 3000.

## Layout

```
server.js            the site host: hub at /, mounts every game, forwards /j/CODE
lib/host.js          the one Express app + HTTP server + Socket.io instance
lib/join.js          the site-wide room-code directory and the short join URL
games/registry.js    the list of games — the only file you edit to add one
games/hitster/       server.js registers its own routes; public/ is its frontend
games/mafia/        the same shape, but everything under /mafia — including
                     its socket namespace and its assets
games/chameleon/    TV-and-phone social deduction, with its engine, curated
                     decks, React source and built browser assets
games/codenames/     static/ is the bundle, served as-is
games/draft/         static/ is the bundle; theme/ is its design notes
                     (sfx.js synthesises its sound — no audio files)
hub/template.html    the landing page, with the cards rendered into it
hub/public/          the only hub files served — favicon and art/
scripts/build-art.js turns source key art into web-sized WebP
```

## The hub

The cards are the games' key art, so the hub's own type stays out of the way:
the poster carries each game's printed title and the hub supplies only the
service text around it. Pointing at one card steps the others back, which is
what keeps three loud posters from fighting on one wall.

Art is optimised before it is committed — the sources are around 1.9 MB each
and the served WebP are 40–70 KB:

```bash
node scripts/build-art.js draft="C:/path/to/source.png"
```

Output lands in `hub/public/art/<id>.webp`, which is what the registry's `art`
field points at. Sources are not kept in the repo.

## Adding another game

**Static game** — drop the bundle in `games/<id>/static/` and add an entry to
`games/registry.js` with `type: 'static'`. Keep its asset paths relative, the
way Codenames does; the host redirects `/<id>` to `/<id>/` so they resolve.

**Game with a server** — put it at `games/<id>/server.js`, have it get
`{ app, server, io }` from `require('../../lib/host')` instead of creating its
own, register its routes, and optionally export `onListen()` for startup
logging. Add a registry entry with `type: 'node'`. Never call `server.listen`
in a game; the host owns the port.

Registry fields are documented at the top of `games/registry.js`. The hub reads
them directly, and `/api/games` returns the same data as JSON.

## Joining a room

Every QR code on the site encodes one address — `https://host/j/CODE` — and
`server.js` forwards it to whichever game claimed that code. Two reasons it
works that way rather than each game encoding its own join page:

- **The symbol is smaller.** A QR's density comes from how many characters it
  carries, and `/j/HUES` is fifteen characters shorter than
  `/hues-cues/play?room=HUES`. That is a version or two off the code somebody
  is scanning across a room, off a TV.
- **Codes are unique site-wide.** The games invent four-letter codes from their
  own vocabularies and those vocabularies overlap — `TONE` is in both Hitster's
  list and Hues & Cues'. Since a scanned code now has to decide on its own
  which game it belongs to, it has to mean exactly one room.

A game with a server does three things to take part, all in `lib/join.js`:

```js
const joinCodes = require('../../lib/join');

// while inventing a code, ask the site as well as your own room map
const free = CODE_WORDS.filter((w) => !rooms.has(w) && joinCodes.isFree(w));

joinCodes.claim(code, '<game id>', '<basePath>/play');  // on createRoom
joinCodes.release(code);                                // on every path that ends a room
```

`joinCodes.joinUrl(req, code)` builds the address to put in the QR, answering a
loopback request with this machine's LAN address so a phone can actually reach
it. An unknown code lands on a small page saying the game has finished, rather
than a bare 404 in somebody's hand.

Player names are remembered site-wide under the `arcade.name` localStorage key,
so you type your name once per evening rather than once per game.

## Herd Mentality answer grouping

Herd Mentality groups exact spelling, punctuation, article, and plural variants
locally. When more than one group remains, the server asks GPT-5 nano for a
strict list of duplicate-answer merges, validates the returned IDs, applies the
merges, and reveals automatically. The request uses low reasoning and a
6-second ceiling so review cannot stall the game. The API key never reaches a
browser. If the model is unavailable or times out, the conservative local
groups reveal instead.

The host can merge or split groups after the reveal; either correction restores
the pre-round score and recalculates cows, the Pink Cow, and any winner. A
winning round therefore keeps its reveal window before the final result appears.

Set `OPENAI_API_KEY` in Render. To run the labeled model evaluation corpus on a
machine that has the key, use `npm run eval:herd-ai`. To test the exact deployed
game without copying its key locally, use `npm run eval:herd-deployed`; set
`HERD_BASE_URL` only when testing a deployment other than the default Render
service. Both evaluators report exact cases plus pair precision and recall.

## Chameleon

Social deduction for 4-12 players. The TV shows a 5x5 word grid while every
town player privately receives the target word on their phone; the single
Chameleon sees only the category and has to blend into one to three spoken clue
rounds. Secret phone ballots support a runoff, and a caught Chameleon gets one
final guess before the round scores. The first side to the configured target
wins, with equal scores continuing into sudden death.

The authoritative rules live in `games/chameleon/engine.js`, with curated
25-word packs in `decks.json`. `server.js` owns rooms, clocks and secret state;
`src/` contains the TV and phone interfaces compiled by
`scripts/build-chameleon.js`. Runtime music and cues are synthesized in the
browser, so there are no audio files to preload.

## Mafia

Social deduction for 5–12 players. The ship's AI runs the whole thing — it
narrates every beat, keeps every clock and counts every vote — so nobody has to
sit out as moderator.

It is mounted the way the note at the end of the Hitster section recommends,
rather than the way Hitster itself was: everything lives under `/mafia`. Its
pages, its assets (`/mafia/theme.css`, `/mafia/tv.js`), its API
(`/mafia/api/join-info`) and its **Socket.io namespace** (`/mafia`) are all
namespaced. The namespace is the important one: the site has a single Socket.io
instance, so two games listening for `join_game` on the root namespace would
both answer the same phone.

```
games/mafia/server.js       the referee. Owns roles, clocks, votes and what
                             each screen is allowed to know
games/mafia/public/
  tv.html / tv.js / tv.css   the shared screen: HUD, phases, roster, captions
  play.html / play.js        the phone: role, night actions, votes
  avatar.js                  the crew — one suit, twelve colours, drawn in SVG
  narration.js               the AI's voice lines, and speechSynthesis
  cutscene.js / .css         deaths composed as method × role: three ways to be
                             vented, three to be ejected, one sidearm, one false
                             alarm, six role flourishes — picked at random,
                             never the same one twice running. Also the drawn
                             opening, which is now the fallback
  film.js / .css             the opening cinematic: footage cut to recorded crew
                             dialogue
  film/                      nine graded clips, ~8.7 MB, built by
                             scripts/build-film.js
  vox/                       fourteen lines of crew dialogue and a manifest,
                             ~520 KB, built by scripts/build-voices.js
  sfx.js                     synthesised alarms — no audio files
  theme.css                  the emergency-lighting palette and type
```

**The opening is filmed; everything else is drawn.** The rest of the game
composes its cutscenes out of SVG and CSS, because they report events. The
opening has to establish a world instead, so it is cut from stock footage and
carried by three crew — Comms, Engineering and the Captain — who do not survive
it. The dialogue is pre-rendered to audio at build time with neural voices,
because the only speech engine available at runtime is the Web Speech API, and
on a typical machine that means three formant voices from the 1990s; three of
those talking to each other is worse than one.

The ship's AI deliberately keeps that synthesised voice. It arrives after three
seconds of silence, once the last crew member has been cut off mid-word, and
counts the survivors over the roll call. Nothing degrades at the seam into
gameplay, and the machine sounding like a machine reads as a choice rather than
as a limitation.

None of it is required. The clips and the dialogue are fetched during the lobby,
while people are still typing their names, and if anything is missing — still
downloading, no codec, a decode that failed — the drawn opening plays instead
and tells the whole story itself, on a longer script written for exactly that.
A cinematic that might not play is not allowed to be the only opening.

Rebuilding either needs the sources, which live outside the repo for the same
reason the key art does:

```
node scripts/build-voices.js                 # dialogue; no sources needed
node scripts/build-film.js <dir-of-masters>  # footage; optionally name shots
```

**The host is a player, not the TV.** Whoever joins first gets the setup
switches, the start button, pause, skip and reset on their own phone; if they
drop out the next connected player inherits them. The TV holds no game controls
at all — it only reports, and it may step in only when no host is connected, so
a room whose host walked off with their phone can still be unstuck.

**Phases wait for the narrator.** A phase clock says how long a phase should
*feel*; how long a line takes is decided by the device's voice, its rate and the
length of the sentence, and the server cannot know any of that. So the TV
reports whether it is mid-sentence and transitions hold until it stops. Without
this, a long line got cut off by the next phase and took the following phase's
line down with it — the room would hear about an ejection while the saboteurs
were already choosing, and never hear the night begin at all. The hold is capped
(`MAFIA_NARRATION_HOLD_MS`), reset by every line the TV starts, and released
early if the screen disconnects, so a dead TV can slow a game but never freeze
one. Which screens are talking is tracked per socket, because a second TV — or
one that reloads — must not clear the state of the screen that is actually
speaking.

**Clocks end early when there is nothing left to wait for.** Every saboteur has
picked, the Medic has sealed a door, the last ballot is in — the phase jumps to
`MAFIA_SETTLE_MS` rather than running out. Ballots can be cast from the moment
the floor opens: the voting phase is not when voting becomes possible, it is the
time set aside for people who have not decided yet, and it collapses the moment
they have.

**Sound is five layers.** A bed (the ship, per phase, ducking under the
narrator rather than stopping), one-shots (doors, gunshots, ballots,
decompression), the klaxon — killed outright the instant the narrator speaks —
the opening's score, and the opening's crew dialogue. The first four are
synthesised, with no files to load. The dialogue is the one exception, and it
still runs through the same Web Audio graph rather than a loose `<audio>`
element, so one mixer decides what is audible and the whole cinematic stops on a
single disconnect.

The score is a single continuous piece in D minor that follows the story rather
than looping under it: a sub drone that never leaves, a distress-beacon motif,
a string pad that opens its filter as the situation gets worse, a dissonant
semitone held back until it is earned, a heartbeat pulse that quickens, and a
riser into the title hit. Reverb is a convolver fed a synthesised impulse
response — noise with an exponential decay, which is what a large metal room
does to a sound — and it is the single biggest reason this reads as scored
rather than as beeping.

**The TV keeps one game control: the way out.** A menu in its status bar, in
every phase, with three doors — back to the lobby (drops the game, keeps the
crew and their suits), close the room (everybody out, fresh code, phones return
to the join screen), and leave Mafia. Abandoning is the one thing that should
not require finding whichever phone is the host, so it is the one exception to
control living there. It takes two taps: the second one confirms.

**The TV asks for one click before it can make a sound.** Browsers block audio
until a page has been interacted with, and every game control now lives on the
host's phone, so the TV opens on a sound gate. Captions carry the narration
whether or not anybody presses it.

**Narration picks the best voice the device has.** Voices are ranked rather than
named: "Natural" and "Online" voices, and anything with `localService` false,
are the free cloud-backed ones that actually sound like a person; the old
built-in formant voices are down-ranked. The TV has a picker in its status bar.
Lines are queued, never cancelled mid-sentence — a new beat clears what is
*pending* and lets the sentence in progress finish, which is what stops two
beats landing together from cutting each other off.

Speech engines lie in both directions and both are caught. Some accept an
utterance and never report it finished, which would make every line take its
full guard timeout now that phases wait for the narrator. Others report it
finished immediately, which is what a browser with no usable voice does, and
believing that blows the whole queue in one frame — three lines on the same
millisecond, captions flickering past unread. Either way the narrator stops
trusting the engine after two offences and paces the captions on a reading
clock instead.

Two rules hold the game together and are worth keeping if it is ever changed:

- **`publicState()` never contains a living player's role.** A role appears in
  it exactly once, at the moment that player dies and it becomes public to
  everybody at the same time. Everything private — your role, your teammates,
  what your scan found — goes to one socket at a time through `privateState()`.
- **One pausable clock per room.** Phases chain by handing the next one to
  `startClock`, so the host's pause is a single operation and nothing can keep
  ticking behind it.

Captions under the narration are not optional. Synthesised voices vary wildly
by device, rooms are loud, and some players cannot hear the TV at all — the
caption is the line, and the voice is texture on top of it.

Every phase length is an env var (see `.env.example`), and the TV's setup screen
switches the Sensor, Medic, Security Officer, Mimic and per-player spotlight on
and off before a game starts.

## How the two games are mounted

**Codenames** is served byte-identical to its Firebase Hosting copy in
`../codenames-online`. Its asset references are all relative, so the only thing
needed was the trailing-slash redirect. Firestore is called straight from the
browser and is untouched, so the Firebase deploy still works too. If you edit
Codenames, the change has to be copied into `games/codenames/static/`.

**Hitster** keeps its API, Socket.io and OAuth callback at the site root
(`/api/*`, `/socket.io`, `/callback`) and only its pages moved under `/hitster`.
That was deliberate: `spotify-auth.js` builds its `redirect_uri` from
`location.origin`, so leaving `/callback` at the root means the redirect URI
registered with Spotify does not change. Its `public/` folder is also mounted at
the root, because every page asks for `/theme.css`, `/tv.js` and so on — so
those names are taken at the root, and a later game should keep its assets
inside its own folder.

The paths that did have to change are the in-app links that pointed at the old
root routes: `controller.js` and `tv.js` (`room_closed` redirects), `tv.js`
(`SpotifyAuth.login` return path), `tv.html` and `resolve.js` (links to
`/hitster/resolve` and `/hitster/tv`), `callback.html` (the error link), and
`joinUrlFor` in `games/hitster/server.js`, which is what the join QR code
encodes. No game logic, styling or markup structure was touched.

`start.html` / `start.css` are new — the screen picker at `/hitster`, which is
why the controller now lives at `/hitster/play`. It is the game's own page, so
it is built from `theme.css` and looks like Hitster rather than like the hub.

## Deploying

Nothing here is tied to a host or a domain. It is one Node process serving one
origin: `npm start` with `PORT` set is all a host needs. Whatever origin it ends
up on, register `<origin>/callback` as a redirect URI in the Spotify dashboard.
