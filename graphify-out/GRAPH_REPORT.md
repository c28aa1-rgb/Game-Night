# Graph Report - arcade  (2026-08-15)

## Corpus Check
- 90 files · ~526,359 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1503 nodes · 3096 edges · 72 communities (64 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a7d871d3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- film.js
- server.js
- broadcast
- herd-mentality.test.js
- broadcast
- server-state.test.js
- mafia/public/sfx.js
- activeSongs
- syncQrOverlay
- hitster/public/tv.js
- hitster/server.js
- hues-cues/public/tv.js
- mafia/server.js
- chameleon/engine.js
- mafia/public/tv.js
- chameleon/server.js
- chameleon/src/play.jsx
- mafia/public/play.js
- scripts
- codenames/static/app.js
- hues-cues/server.js
- wavelength/server.js
- audio.js
- draft/static/app.js
- Arcade
- wavelength/src/shared.jsx
- lobby-music.js
- controller.js
- build-film.js
- hues-cues/public/play.js
- codenames/server.js
- static/sfx.js
- getRoomRef
- tutorial.jsx
- hues-cues/public/sfx.js
- cutscene.js
- narration.js
- wavelength/public/sfx.js
- bindEvents
- resolve.js
- hitster/public/sfx.js
- build-voices.js
- Hues & Cues — Design Spec
- newGame
- join.js
- chameleon/public/sfx.js
- isRevealed
- Theme: Draft Night
- spotify-auth.js
- Calibration Room
- renderSpymasterScreen
- resetAnim
- cinematics.js
- House Lights — tutorial theme
- Tropical Optical Camouflage
- build-art.js
- build-chameleon.js
- build-wavelength.js
- tutorials/PHILOSOPHY.md
- avatar.js
- chameleon/PHILOSOPHY.md
- build-tutorial.js
- NOIR-ROSSO.md
- wavelength/PHILOSOPHY.md
- herd-mentality/src/play.jsx
- herd-mentality/server.js
- herd-mentality/engine.js
- herd-mentality/public/sfx.js
- Herd Mentality Audio Direction
- County Fair After Dark
- build-herd-mentality.js
- herd-mentality/PHILOSOPHY.md

## God Nodes (most connected - your core abstractions)
1. `live()` - 41 edges
2. `tone()` - 37 edges
3. `el()` - 34 edges
4. `hiss()` - 32 edges
5. `bindEvents()` - 30 edges
6. `el()` - 22 edges
7. `showScreen()` - 20 edges
8. `el()` - 19 edges
9. `broadcast()` - 19 edges
10. `tone()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `begin()` --indirect_call--> `run()`  [INFERRED]
  hub/public/lobby-music.js → games/hitster/public/confetti.js
- `setEnabled()` --indirect_call--> `run()`  [INFERRED]
  hub/public/lobby-music.js → games/hitster/public/confetti.js
- `stop()` --indirect_call--> `run()`  [INFERRED]
  hub/public/lobby-music.js → games/hitster/public/confetti.js
- `onListen()` --calls--> `lanAddress()`  [EXTRACTED]
  games/hitster/server.js → lib/join.js
- `onListen()` --calls--> `lanAddress()`  [EXTRACTED]
  games/hues-cues/server.js → lib/join.js

## Import Cycles
- None detected.

## Communities (72 total, 8 thin omitted)

### Community 0 - "film.js"
Cohesion: 0.22
Nodes (11): blackout(), cutTo(), fireCue(), flash(), loadVideo(), mount(), play(), preload() (+3 more)

### Community 1 - "server.js"
Cohesion: 0.12
Nodes (16): app, express, http, io, { Server }, { app, server }, esc(), express (+8 more)

### Community 2 - "broadcast"
Cohesion: 0.53
Nodes (9): beginReview(), beginRound(), broadcast(), clearClock(), openQuestion(), resetToLobby(), revealRound(), setMoment() (+1 more)

### Community 3 - "herd-mentality.test.js"
Cohesion: 0.14
Nodes (11): assert, Engine, { isKnownAnswer }, questions, test, englishWords, fs, isKnownAnswer() (+3 more)

### Community 4 - "broadcast"
Cohesion: 0.21
Nodes (17): beginPlayback(), broadcast(), buildChoices(), clearTimers(), drawCard(), finishSteal(), isCorrectPlacement(), nextTurn() (+9 more)

### Community 5 - "server-state.test.js"
Cohesion: 0.33
Nodes (4): assert, Engine, Server, test

### Community 6 - "mafia/public/sfx.js"
Cohesion: 0.11
Nodes (56): airlock(), ambience(), applyBedGain(), ballot(), beacon(), beat(), blip(), build() (+48 more)

### Community 7 - "activeSongs"
Cohesion: 0.32
Nodes (8): activeSetSummary(), activeSongs(), currentPlayer(), inSet(), onListen(), playableSongs(), publicState(), setCounts()

### Community 8 - "syncQrOverlay"
Cohesion: 0.50
Nodes (4): closeQrOverlay(), openQrOverlay(), qrUrlFor(), syncQrOverlay()

### Community 9 - "hitster/public/tv.js"
Cohesion: 0.08
Nodes (72): announceMatchPoint(), applyMusicVolume(), bootStatus(), buildWave(), claimDevice(), closeSetsPanel(), diagnoseMissingSdk(), drawSheetChips() (+64 more)

### Community 12 - "hitster/server.js"
Cohesion: 0.05
Nodes (29): activeSets, { app, server, io }, CODE_WORDS, connectedPlayers(), createRoom(), crypto, express, findPlayer() (+21 more)

### Community 15 - "hues-cues/public/tv.js"
Cohesion: 0.13
Nodes (24): addRevealBox(), applyFocus(), blockAround(), clearReveal(), drawLayer(), drawZoomLabels(), escape(), focusFromGuessing() (+16 more)

### Community 21 - "mafia/server.js"
Cohesion: 0.06
Nodes (79): allVotesIn(), { app, io }, arm(), beginDiscussion(), beginNight(), beginRevenge(), beginVote(), broadcast() (+71 more)

### Community 27 - "chameleon/engine.js"
Cohesion: 0.07
Nodes (37): assert, decks, Engine, { io }, net, path, { spawn }, test (+29 more)

### Community 30 - "mafia/public/tv.js"
Cohesion: 0.10
Nodes (43): alarmThen(), AMBIENCE_FOR, announceSpotlight(), arm(), clockStamp, closeMenu(), disarm(), el() (+35 more)

### Community 31 - "chameleon/server.js"
Cohesion: 0.09
Nodes (39): advanceClue(), { app, io }, armClock(), armForPhase(), beginTally(), broadcast(), canControl(), canEndGame() (+31 more)

### Community 32 - "chameleon/src/play.jsx"
Cohesion: 0.10
Nodes (36): HostRail(), Join(), submit(), Phone(), act(), PhoneClue(), PhoneGuess(), PhoneLobby() (+28 more)

### Community 33 - "mafia/public/play.js"
Cohesion: 0.14
Nodes (41): actScreen(), clockStamp, deadNote(), detectiveAct(), discussionQuiet(), doctorAct(), drawJoinColours(), el() (+33 more)

### Community 37 - "scripts"
Cohesion: 0.04
Nodes (47): dotenv, esbuild, express, ffmpeg-static, motion, msedge-tts, dependencies, dotenv (+39 more)

### Community 43 - "codenames/static/app.js"
Cohesion: 0.08
Nodes (34): afterExecution(), anim, boardViews, cardNodes(), celebrateVictory(), clientId, counters, el (+26 more)

### Community 46 - "hues-cues/server.js"
Cohesion: 0.05
Nodes (58): activeGuesserId(), advanceFromReveal(), advanceGuess(), ALL_CELLS, { app, io }, armReveal(), beginTurn(), broadcast() (+50 more)

### Community 52 - "wavelength/server.js"
Cohesion: 0.07
Nodes (26): activeSession(), advance(), { app, io }, beginTurn(), broadcast(), CODE_WORDS, crypto, drawPrompt() (+18 more)

### Community 53 - "audio.js"
Cohesion: 0.17
Nodes (25): burst(), chain(), ensureContext(), ensureShotBus(), listeners, now(), panner(), playCascade() (+17 more)

### Community 58 - "draft/static/app.js"
Cohesion: 0.15
Nodes (31): addNames(), backToRoster(), bezierAxis(), buildBenches(), esc(), finishDraft(), goto(), indexAtPointer() (+23 more)

### Community 61 - "Arcade"
Cohesion: 0.18
Nodes (10): Adding another game, Arcade, Chameleon, Deploying, How the two games are mounted, Joining a room, Layout, Mafia (+2 more)

### Community 62 - "wavelength/src/shared.jsx"
Cohesion: 0.11
Nodes (36): App(), join(), Clue(), Controller(), act(), Guess(), nudge(), start() (+28 more)

### Community 63 - "lobby-music.js"
Cohesion: 0.15
Nodes (27): burst(), celebrate(), ensureCanvas(), rain(), resize(), run(), spawn(), step() (+19 more)

### Community 64 - "controller.js"
Cohesion: 0.18
Nodes (28): buildWave(), buildWheel(), confetti(), el(), escapeHtml(), gapLabel(), join(), pickAnswer() (+20 more)

### Community 65 - "build-film.js"
Cohesion: 0.20
Nodes (10): ELEMENT, encode(), ffmpeg, fs, GRADE, main(), OUT, path (+2 more)

### Community 67 - "hues-cues/public/play.js"
Cohesion: 0.14
Nodes (22): guessRows(), loadPalette(), occupied(), onWheelMove(), paintJoinSwatches(), refreshSubmit(), removable(), removeButton() (+14 more)

### Community 70 - "codenames/server.js"
Cohesion: 0.25
Nodes (5): { app }, crypto, joinCodes, pendingClaims, QRCode

### Community 72 - "static/sfx.js"
Cohesion: 0.22
Nodes (23): add(), blip(), build(), chord(), click(), clunk(), complete(), detent() (+15 more)

### Community 73 - "getRoomRef"
Cohesion: 0.23
Nodes (16): claimJoinCode(), claimTeam(), confirmJoinCode(), createRoom(), evaluateResult(), friendlyError(), generateRoomCode(), getRoomRef() (+8 more)

### Community 80 - "hues-cues/public/sfx.js"
Cohesion: 0.23
Nodes (20): bedStep(), bedVoice(), build(), bullseye(), chime(), click(), countdownTick(), live() (+12 more)

### Community 82 - "cutscene.js"
Cohesion: 0.18
Nodes (15): dressStage(), falseAlarm(), flourish(), pickSequence(), play(), playIntro(), showing(), starfield() (+7 more)

### Community 83 - "narration.js"
Cohesion: 0.18
Nodes (16): cancel(), catalogue(), chooseVoice(), done(), onLine(), onSpeaking(), pick(), pump() (+8 more)

### Community 84 - "wavelength/public/sfx.js"
Cohesion: 0.27
Nodes (18): at(), boot(), click(), envelope(), guessOpen(), live(), lobby(), reveal() (+10 more)

### Community 88 - "bindEvents"
Cohesion: 0.21
Nodes (17): bindEvents(), claimedTeam(), closeKickMenu(), dismissStartNotice(), handleGlobalPointer(), handleHashRoute(), kickSpymaster(), leaveTeam() (+9 more)

### Community 89 - "resolve.js"
Cohesion: 0.23
Nodes (15): chip(), draw(), drawSets(), drawTally(), el(), escapeHtml(), GENRE_LABELS, keyOf() (+7 more)

### Community 93 - "hitster/public/sfx.js"
Cohesion: 0.31
Nodes (13): cardLand(), correct(), fanfare(), matchPoint(), noise(), soundCheck(), stealClaimed(), tick() (+5 more)

### Community 94 - "build-voices.js"
Cohesion: 0.18
Nodes (13): CAST, durationOf(), ffmpeg, fs, hardCut(), main(), { MsEdgeTTS, OUTPUT_FORMAT }, OUT (+5 more)

### Community 95 - "Hues & Cues — Design Spec"
Cohesion: 0.20
Nodes (9): 1. Core loop, 2. Scoring, 3. Guess input (phone), 4. Reveal sequence, 5. Screens, 6. Visual & sound direction, 7. Data, 8. Open items for build time (not blocking design) (+1 more)

### Community 96 - "newGame"
Cohesion: 0.25
Nodes (9): buildBoard(), buildRoom(), handleBoardNewGame(), maybeAutoNewGame(), newGame(), primaryGameAction(), shuffle(), startGame() (+1 more)

### Community 98 - "join.js"
Cohesion: 0.27
Nodes (11): onListen(), onListen(), claim(), codes, isFree(), joinUrl(), lanAddress(), lookup() (+3 more)

### Community 99 - "chameleon/public/sfx.js"
Cohesion: 0.35
Nodes (8): beginLobby(), cue(), ensure(), lobbyChord(), setEnabled(), startLobby(), tone(), unlock()

### Community 100 - "isRevealed"
Cohesion: 0.28
Nodes (9): buildCard(), dealIn(), isRevealed(), openCardMenu(), paintBoard(), pickReplacement(), renderList(), shuffleFlourish() (+1 more)

### Community 101 - "Theme: Draft Night"
Cohesion: 0.25
Nodes (7): Layout by team count, Motion, Palette, Signature, Sound, Theme: Draft Night, Typography

### Community 102 - "spotify-auth.js"
Cohesion: 0.36
Nodes (10): challengeFor(), clientId(), completeLogin(), getToken(), login(), logout(), randomString(), readStore() (+2 more)

### Community 103 - "Calibration Room"
Cohesion: 0.25
Nodes (7): Calibration Room, Colour and material, Composition and hierarchy, Craft, Scale and rhythm, Space and form, The movement

### Community 104 - "renderSpymasterScreen"
Cohesion: 0.14
Nodes (21): armExecution(), bothSeated(), cap(), clearBoard(), closeCardMenu(), isHost(), openKickMenu(), reclaimSeat() (+13 more)

### Community 105 - "resetAnim"
Cohesion: 0.29
Nodes (7): clearExecution(), exitRoom(), handleKick(), resetAnim(), startPresenceSweep(), stopPresenceSweep(), unsubscribe()

### Community 107 - "cinematics.js"
Cohesion: 0.50
Nodes (6): eliminate(), figure(), intro(), mount(), playEffect(), stop()

### Community 108 - "House Lights — tutorial theme"
Cohesion: 0.29
Nodes (6): Core palette, House Lights — tutorial theme, Layout, Motion identity, Signature, Type roles

### Community 109 - "Tropical Optical Camouflage"
Cohesion: 0.29
Nodes (6): Layout, Motion identity, Palette, Signature, Tropical Optical Camouflage, Type

### Community 111 - "build-art.js"
Cohesion: 0.40
Nodes (5): fs, main(), OUT, path, sharp

### Community 112 - "build-chameleon.js"
Cohesion: 0.50
Nodes (3): esbuild, path, ROOT

### Community 113 - "build-wavelength.js"
Cohesion: 0.50
Nodes (3): esbuild, path, ROOT

### Community 121 - "herd-mentality/src/play.jsx"
Cohesion: 0.11
Nodes (31): Answering(), submit(), GameOver(), HostReview(), merge(), split(), JoinScreen(), Lobby() (+23 more)

### Community 125 - "herd-mentality/server.js"
Cohesion: 0.09
Nodes (30): { app, io }, attach(), canControl(), CODE_WORDS, createRoom(), crypto, dropRoom(), Engine (+22 more)

### Community 131 - "herd-mentality/engine.js"
Cohesion: 0.16
Nodes (11): beginReview(), buildGroups(), chooseQuestion(), enabledQuestions(), findReviewIssues(), normalizeAnswer(), PHASES, splitAnswer() (+3 more)

### Community 141 - "herd-mentality/public/sfx.js"
Cohesion: 0.31
Nodes (7): cue(), enabled(), ensure(), noise(), setEnabled(), tone(), unlock()

### Community 144 - "Herd Mentality Audio Direction"
Cohesion: 0.33
Nodes (5): Accessibility and control, Herd Mentality Audio Direction, Mix, Palette and timing, Sound thesis

### Community 146 - "County Fair After Dark"
Cohesion: 0.40
Nodes (4): County Fair After Dark, Palette, Shape And Motion, Type

### Community 147 - "build-herd-mentality.js"
Cohesion: 0.50
Nodes (3): esbuild, path, ROOT

## Knowledge Gaps
- **313 isolated node(s):** `test`, `assert`, `{ spawn }`, `path`, `net` (+308 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `app` connect `server.js` to `codenames/server.js`, `hitster/server.js`, `hues-cues/server.js`, `wavelength/server.js`, `mafia/server.js`, `herd-mentality/server.js`, `chameleon/server.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `io` connect `server.js` to `hitster/server.js`, `hues-cues/server.js`, `wavelength/server.js`, `mafia/server.js`, `herd-mentality/server.js`, `chameleon/server.js`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `pad()` connect `draft/static/app.js` to `mafia/public/sfx.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `bindEvents()` (e.g. with `claimTeam()` and `closeCardMenu()`) actually correct?**
  _`bindEvents()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `test`, `assert`, `{ spawn }` to the rest of the system?**
  _313 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12280701754385964 - nodes in this community are weakly interconnected._
- **Should `herd-mentality.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._