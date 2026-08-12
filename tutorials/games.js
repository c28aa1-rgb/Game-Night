const shot = (game, device, state = '') => `/hub/tutorial/screens/${game}${state ? `-${state}` : ''}-${device}.webp`;

export const GAME_TUTORIALS = {
  hitster: {
    name: 'Hitster',
    eyebrow: 'Hear it. Place it. Steal it.',
    accent: '#FF2E92',
    accent2: '#6E36FF',
    tvShot: shot('hitster', 'tv'),
    phoneShot: shot('hitster', 'phone'),
    slides: [
      {
        title: 'Listen to the mystery song',
        body: 'The TV plays a song but hides its title, artist, and year. The player named on screen is the only person placing it.',
        facts: ['Everyone can listen and talk.', 'The first phone in the room is the host.'],
        scene: { layout: 'tv', action: 'hitster-listen', phases: [
          { label: 'The TV starts a mystery song' },
          { label: 'The title and year stay hidden' },
        ] },
      },
      {
        title: 'Put it before or after a date',
        body: 'Alex decides when the song came out. On the phone, Alex scrolls through the timeline and chooses a gap—before 2012, after 2012, or between two songs.',
        facts: ['You are choosing the order, not typing an exact year.', 'Tap Place it here when the gap looks right.'],
        scene: { layout: 'phone', action: 'hitster-place', phases: [
          { label: 'Scroll to a song already in the timeline' },
          { label: 'Choose before 2012' },
          { label: 'Tap Place it here' },
        ] },
      },
      {
        title: 'The real year decides the card',
        body: 'The TV reveals the song and year. If the new song belongs in the gap Alex chose, it stays in Alex’s timeline. If not, Alex does not keep it.',
        facts: ['Equal years can sit beside each other.', 'The next player then gets a new song.'],
        scene: { layout: 'tv', action: 'hitster-reveal', phases: [
          { label: 'The hidden song is revealed' },
          { label: 'The year is checked against the chosen gap' },
          { label: 'A correct card joins the timeline' },
        ] },
      },
      {
        title: 'Other players can steal',
        body: 'When the TV says Steals open, another player can tap Steal and answer a quick title-and-artist quiz. A correct answer lets that player place the song instead.',
        facts: ['A wrong answer or timeout removes one random timeline card, if you have one.', 'After a failed steal, you cannot try again on that song.'],
        scene: { layout: 'pair', action: 'hitster-steal', phases: [
          { label: 'The TV opens stealing' },
          { label: 'Another player taps Steal' },
          { label: 'A correct quiz answer takes the turn' },
        ] },
      },
      {
        title: 'The host fixes playback problems',
        body: 'If Spotify cannot play a song, the host phone gets a Skip song button. Skipping returns that unheard song to the pool and moves on.',
        facts: ['The skip button appears only after a real playback failure.', 'The TV controls game sound.'],
        scene: { layout: 'phone', action: 'host-control', phases: [
          { label: 'The TV reports a playback problem' },
          { label: 'The host taps Skip song' },
          { label: 'A different song starts' },
        ] },
      },
      {
        title: 'First to ten cards wins',
        body: 'Keep taking turns until one player has ten correctly placed songs. The final screen shows the standings, then the room can return to the lobby and play again.',
        facts: ['A stolen song can be the winning tenth card.', 'If the song pool runs out, the longest timeline wins.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'A correct card raises the timeline total' },
          { label: 'The first player to 10 wins' },
        ] },
      },
    ],
  },

  codenames: {
    name: 'Codenames',
    eyebrow: 'One public board. Two private keys.',
    accent: '#E01B2E',
    accent2: '#3186D6',
    tvShot: shot('codenames', 'tv', 'board'),
    phoneShot: shot('codenames', 'phone', 'key'),
    slides: [
      {
        title: 'The TV shows words. Phones show the key.',
        body: 'Everyone looks at the same 25-word board on the TV. Only the Red and Blue spymasters see which words belong to each team.',
        facts: ['Red, Blue, neutral, and the black assassin are visible on the Key tab.', 'Players guessing words must not see the key.'],
        scene: { layout: 'pair', phases: [
          { label: 'TV: the public word board', tv: shot('codenames', 'tv', 'board'), phone: shot('codenames', 'phone', 'board') },
          { label: 'Phone: the private color key', tv: shot('codenames', 'tv', 'board'), phone: shot('codenames', 'phone', 'key') },
        ] },
      },
      {
        title: 'The spymaster gives one clue',
        body: 'The active spymaster looks at the key and says one word plus a number. For example, “Ocean, 2” means two words on the board connect to ocean.',
        facts: ['The clue is spoken aloud; the app does not type it.', 'The team discusses which words the clue probably means.'],
        scene: { layout: 'phone', action: 'codenames-clue', phases: [
          { label: 'The spymaster studies their team colors', phone: shot('codenames', 'phone', 'key'), tv: shot('codenames', 'tv', 'board') },
          { label: 'Clue: “Ocean, 2”', phone: shot('codenames', 'phone', 'key'), tv: shot('codenames', 'tv', 'board') },
        ] },
      },
      {
        title: 'Tap the guessed word, then Reveal',
        body: 'When the team says MATCH, the spymaster taps MATCH on the Key screen, then taps Reveal. The MATCH card flips blue on the TV for everyone.',
        facts: ['The Key tab is where cards are revealed.', 'The public Board tab is a read-only copy of the TV board.'],
        scene: { layout: 'phone', action: 'codenames-reveal', stepMs: 4800, phases: [
          { label: '1 · Tap MATCH on the private key', phone: shot('codenames', 'phone', 'key'), tv: shot('codenames', 'tv', 'board') },
          { label: '2 · Tap Reveal', phone: shot('codenames', 'phone', 'reveal'), tv: shot('codenames', 'tv', 'board') },
          { label: '3 · MATCH flips blue on the TV', phone: shot('codenames', 'phone', 'key'), tv: shot('codenames', 'tv', 'revealed') },
        ] },
      },
      {
        title: 'The color changes what happens next',
        body: 'Your team’s color is a correct guess. A neutral card or the other team’s color ends your turn. Revealing the black assassin loses the game immediately.',
        facts: ['The app flips cards but leaves spoken turn-taking to the room.', 'The counters show how many Red and Blue agents remain.'],
        scene: { layout: 'tv', action: 'codenames-outcomes', phases: [
          { label: 'Team color · keep guessing', tv: shot('codenames', 'tv', 'revealed'), phone: shot('codenames', 'phone', 'key') },
          { label: 'Neutral or opponent · end the turn', tv: shot('codenames', 'tv', 'board'), phone: shot('codenames', 'phone', 'key') },
          { label: 'Black assassin · lose immediately', tv: shot('codenames', 'tv', 'board'), phone: shot('codenames', 'phone', 'key') },
        ] },
      },
      {
        title: 'Key, Board, and List are different views',
        body: 'Key shows every card’s hidden color. Board matches what players see on the TV. List groups the remaining words by color.',
        facts: ['Swap word replaces an unrevealed word without changing its color.', 'Leave frees the team’s spymaster seat.'],
        scene: { layout: 'phone', phases: [
          { label: 'Key · hidden colors', phone: shot('codenames', 'phone', 'key'), tv: shot('codenames', 'tv', 'board') },
          { label: 'Board · public view', phone: shot('codenames', 'phone', 'board'), tv: shot('codenames', 'tv', 'board') },
          { label: 'List · words grouped by color', phone: shot('codenames', 'phone', 'list'), tv: shot('codenames', 'tv', 'board') },
        ] },
      },
      {
        title: 'Find every agent to win',
        body: 'A team wins as soon as all of its colored cards have been revealed. Tap New game to keep the same room and deal 25 fresh words.',
        facts: ['The starting team has nine agents; the other team has eight.', 'Either spymaster can start the next board.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'Each correct reveal lowers the team counter', tv: shot('codenames', 'tv', 'revealed'), phone: shot('codenames', 'phone', 'key') },
          { label: 'Reveal the final agent to win', tv: shot('codenames', 'tv', 'revealed'), phone: shot('codenames', 'phone', 'key') },
        ] },
      },
    ],
  },

  mafia: {
    name: 'Mafia',
    eyebrow: 'The TV moderates. Every phone keeps a secret.',
    accent: '#FF3B1F',
    accent2: '#B88845',
    tvShot: shot('mafia', 'tv'),
    phoneShot: shot('mafia', 'phone'),
    slides: [
      {
        title: 'Join the room and deal secret roles',
        body: 'Five to twelve players join on phones. The host chooses optional roles, then starts the game. The TV becomes the moderator.',
        facts: ['The game automatically chooses one to three Mafia.', 'Detective, Doctor, Vigilante, Godfather, and Spotlight are optional.'],
        scene: { layout: 'pair', action: 'mafia-deal', phases: [
          { label: 'The host starts the table' },
          { label: 'Every phone receives one secret role' },
        ] },
      },
      {
        title: 'Read your role without showing anyone',
        body: 'Tap the role card on your phone. Town players try to find the Mafia. Mafia players know their team and try to survive.',
        facts: ['The TV never shows secret roles during play.', 'Eliminated players watch but cannot act or vote.'],
        scene: { layout: 'phone', action: 'mafia-role', phases: [
          { label: 'Tap the closed role card' },
          { label: 'Read your role privately' },
          { label: 'Close it before passing the phone' },
        ] },
      },
      {
        title: 'At night, special roles act in order',
        body: 'Mafia choose someone to remove. Then the Detective checks one player, and the Doctor protects one player. Everyone else keeps their eyes closed.',
        facts: ['A Godfather looks innocent to the Detective.', 'The Doctor cannot protect the same player two nights in a row.'],
        scene: { layout: 'pair', action: 'mafia-night', phases: [
          { label: '1 · Mafia choose a target' },
          { label: '2 · Detective checks one player' },
          { label: '3 · Doctor protects one player' },
        ] },
      },
      {
        title: 'The morning starts a discussion',
        body: 'The TV announces who was removed—or that nobody died. Living players discuss who seems suspicious before voting.',
        facts: ['Spotlight can give each player a short timed turn to speak.', 'Players may vote early and change their vote before the tally.'],
        scene: { layout: 'tv', action: 'mafia-morning', phases: [
          { label: 'The TV announces the night result' },
          { label: 'Living players discuss the clues' },
        ] },
      },
      {
        title: 'A strict majority removes a player',
        body: 'Every living player votes privately on their phone. The TV shows how many votes are in, then reveals the tally. More than half of the living players must agree.',
        facts: ['No majority means nobody is removed.', 'A removed player’s role is revealed.'],
        scene: { layout: 'pair', action: 'mafia-vote', phases: [
          { label: 'Choose a living player on the phone' },
          { label: 'The TV counts submitted ballots' },
          { label: 'The final tally is revealed' },
        ] },
      },
      {
        title: 'Some roles change the normal flow',
        body: 'A voted-out Vigilante may remove one final player. The host can pause or advance a stuck phase from the phone controls.',
        facts: ['A Vigilante shot can end the game immediately.', 'Dead players remain visible but cannot participate.'],
        scene: { layout: 'phone', action: 'host-control', phases: [
          { label: 'A removed Vigilante chooses one last target' },
          { label: 'The host can pause or advance if needed' },
        ] },
      },
      {
        title: 'Town or Mafia wins automatically',
        body: 'Town wins when every Mafia player is gone. Mafia wins when living Mafia are equal to or outnumber all living Town players.',
        facts: ['The game checks this after every removal.', 'Return to lobby keeps the same players for another deal.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'No Mafia left · Town wins' },
          { label: 'Mafia equal Town · Mafia wins' },
        ] },
      },
    ],
  },

  'hues-cues': {
    name: 'Hues & Cues',
    eyebrow: 'One word. Two clues. Find the color.',
    accent: '#F9680D',
    accent2: '#24B8B4',
    tvShot: shot('hues-cues', 'tv'),
    phoneShot: shot('hues-cues', 'phone'),
    slides: [
      {
        title: 'The clue-giver gets one secret color',
        body: 'The TV shows the full color board. On their phone, the clue-giver chooses one of four secret target squares. Nobody else sees the target.',
        facts: ['Two to ten people can play.', 'The next clue-giver changes after every turn.'],
        scene: { layout: 'phone', action: 'hues-target', phases: [
          { label: 'Four private colors appear on the phone' },
          { label: 'The clue-giver chooses one target' },
        ] },
      },
      {
        title: 'Give one word that fits the color',
        body: 'The clue-giver says one word connected to the target. For a pale blue square, they might say “sky.” Then guessing begins.',
        facts: ['Do not say a coordinate or exact color value.', 'The clue is spoken; nothing needs to be typed.'],
        scene: { layout: 'tv', action: 'hues-clue', phases: [
          { label: 'Secret target: pale blue' },
          { label: 'Spoken clue: “Sky”' },
        ] },
      },
      {
        title: 'Spin the wheels to choose a square',
        body: 'The active guesser scrolls the letter wheel and number wheel on the phone. As the wheels move, the selector box moves across the TV board. Tap Submit to place the pin.',
        facts: ['Only the active player controls the selector.', 'Every player places one pin for the first clue.'],
        scene: { layout: 'phone', action: 'hues-pin', stepMs: 4800, phases: [
          { label: '1 · Scroll the letter and number wheels' },
          { label: '2 · The selector moves on the TV' },
          { label: '3 · Tap Submit to place the pin' },
        ] },
      },
      {
        title: 'A second clue gives everyone one more pin',
        body: 'After all first pins are placed, the clue-giver says a second one-word clue. Players guess again in reverse order.',
        facts: ['Both pins stay visible on the TV.', 'Each pin scores separately.'],
        scene: { layout: 'tv', action: 'hues-second', phases: [
          { label: 'First pins stay on the board' },
          { label: 'The clue-giver says one new word' },
          { label: 'Players pin again in reverse order' },
        ] },
      },
      {
        title: 'Closer pins earn more points',
        body: 'The exact target earns 3 points. A touching square earns 2. The next ring earns 1. Anything farther away earns 0.',
        facts: ['The clue-giver earns 1 point for every pin on or touching the target.', 'Both clue rounds are added together.'],
        scene: { layout: 'tv', action: 'hues-score', phases: [
          { label: 'Exact square · 3 points' },
          { label: 'Touching square · 2 points' },
          { label: 'Next ring · 1 point' },
        ] },
      },
      {
        title: 'Reach the target score with a clear lead',
        body: 'Turns continue until one player reaches the chosen score and is alone in first place. A tie at the target starts sudden death.',
        facts: ['The host can skip or remove a disconnected player.', 'Replay returns everyone to the lobby.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'Pins add to each player’s score' },
          { label: 'A sole leader at the target wins' },
        ] },
      },
    ],
  },

  wavelength: {
    name: 'Wavelength',
    eyebrow: 'Give a clue. Find the hidden point.',
    accent: '#F3B342',
    accent2: '#5AD5E8',
    tvShot: shot('wavelength', 'tv'),
    phoneShot: shot('wavelength', 'phone'),
    slides: [
      {
        title: 'Each team shares one phone',
        body: 'The TV shows the spectrum and both scores. Team 1 and Team 2 each join with one phone that the team passes around.',
        facts: ['Both team phones must be connected to start.', 'Choose between 3 and 10 rounds.'],
        scene: { layout: 'pair', phases: [
          { label: 'TV · shared spectrum and scores' },
          { label: 'Phones · one controller per team' },
        ] },
      },
      {
        title: 'One player sees the hidden target',
        body: 'The active player privately sees where the target sits between two ideas, such as Quiet and Loud. They say one clue that belongs near that point.',
        facts: ['Do not show the target to teammates.', 'The clue is spoken aloud.'],
        scene: { layout: 'phone', action: 'wavelength-target', phases: [
          { label: 'The clue-giver opens the private target' },
          { label: 'They invent and say one clue' },
          { label: 'The phone is passed to the team' },
        ] },
      },
      {
        title: 'Move the marker to match the clue',
        body: 'The team talks about the clue. On the phone, tap or hold the left and right arrows. Every press moves the marker on the TV.',
        facts: ['There are 61 possible marker positions.', 'The target stays hidden while the team chooses.'],
        scene: { layout: 'pair', action: 'wavelength-aim', phases: [
          { label: '1 · Hold the right arrow' },
          { label: '2 · The TV marker moves right' },
          { label: '3 · Fine-tune with one tap' },
        ] },
      },
      {
        title: 'Lock the marker to reveal the score',
        body: 'Tap Lock this signal when the team agrees. The target appears: center or one step away earns 4, then the outer bands earn 3 or 2, and a miss earns 0.',
        facts: ['The score is added immediately.', 'The other team takes the next turn.'],
        scene: { layout: 'tv', action: 'wavelength-score', phases: [
          { label: 'Tap Lock this signal' },
          { label: 'The hidden target opens' },
          { label: 'The matching band awards points' },
        ] },
      },
      {
        title: 'Teams alternate complete turns',
        body: 'Team 1 gives a clue and scores, then Team 2 does the same with a new spectrum. Keep alternating until all scheduled rounds are complete.',
        facts: ['The active team is shown on both screens.', 'Used prompt pairs rotate before repeating.'],
        scene: { layout: 'tv', phases: [
          { label: 'Team 1 · clue, aim, score' },
          { label: 'Team 2 · clue, aim, score' },
        ] },
      },
      {
        title: 'The higher score wins',
        body: 'After the final scheduled round, the team with more points wins. A tie gives each team one extra sudden-death turn until the tie breaks.',
        facts: ['Scoring stays the same in sudden death.', 'New session keeps the teams and returns to setup.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'Compare scores after the last round' },
          { label: 'A tie starts sudden death' },
          { label: 'The first clear lead wins' },
        ] },
      },
    ],
  },

  chameleon: {
    name: 'Chameleon',
    eyebrow: 'Know the word—or pretend you do.',
    accent: '#98C93C',
    accent2: '#EF2F70',
    tvShot: shot('chameleon', 'tv'),
    phoneShot: shot('chameleon', 'phone'),
    slides: [
      {
        title: 'Everyone but one player sees the word',
        body: 'The TV shows a category and 25 possible words. Town players see the same secret word on their phones. One player sees only “Chameleon.”',
        facts: ['Four to twelve people can play.', 'Keep your phone hidden from the people beside you.'],
        scene: { layout: 'pair', action: 'chameleon-role', phases: [
          { label: 'Town phone · secret word revealed' },
          { label: 'Chameleon phone · no secret word' },
          { label: 'TV · everyone sees the same word grid' },
        ] },
      },
      {
        title: 'Give one clue when your name appears',
        body: 'Each player says one clue connected to the secret word, then taps I gave my clue. Town proves it knows the word without making it obvious.',
        facts: ['The Chameleon listens and tries to blend in.', 'Everyone speaks once in each configured clue round.'],
        scene: { layout: 'pair', action: 'chameleon-clue', phases: [
          { label: 'The TV calls the next player' },
          { label: 'That player says one clue' },
          { label: 'Tap I gave my clue' },
        ] },
      },
      {
        title: 'Vote for the player who did not fit',
        body: 'After all clues, choose one suspicious player on your phone. You cannot vote for yourself. The TV shows only how many ballots are in.',
        facts: ['Votes are private until the result.', 'A strict majority is needed to accuse someone immediately.'],
        scene: { layout: 'pair', action: 'chameleon-vote', phases: [
          { label: 'Choose a suspicious player' },
          { label: 'Submit the private ballot' },
          { label: 'The TV counts received votes' },
        ] },
      },
      {
        title: 'No majority creates a runoff',
        body: 'If nobody has a majority, the leading vote groups enter a second ballot. A single runoff leader is accused. Another tie sends the Chameleon to a final guess.',
        facts: ['Only runoff candidates appear on phones.', 'Runoff votes are also private.'],
        scene: { layout: 'phone', action: 'chameleon-runoff', phases: [
          { label: 'The top candidates enter the runoff' },
          { label: 'Players vote between those candidates' },
          { label: 'One leader is accused—or the tie continues' },
        ] },
      },
      {
        title: 'A caught Chameleon gets one final guess',
        body: 'If the accused player is the Chameleon, that phone chooses one word from the TV grid. Guessing the secret word is the Chameleon’s last escape.',
        facts: ['Only the Chameleon can submit this guess.', 'A tied runoff also opens the final guess.'],
        scene: { layout: 'pair', action: 'chameleon-guess', phases: [
          { label: 'The Chameleon opens the word grid' },
          { label: 'One word is selected' },
          { label: 'The TV reveals whether it was correct' },
        ] },
      },
      {
        title: 'The round awards points',
        body: 'A wrong Town accusation gives the Chameleon 2 points. Catching the Chameleon gives Town 2 points. The Chameleon also gets 3 for a correct final guess, or 2 for a miss or timeout.',
        facts: ['The TV reveals the role, word, ballots, and final guess.', 'Both sides can score in a round where the Chameleon was caught.'],
        scene: { layout: 'tv', action: 'chameleon-score', phases: [
          { label: 'Wrong accusation · Chameleon +2' },
          { label: 'Caught Chameleon · Town +2' },
          { label: 'Correct final guess · Chameleon +3' },
        ] },
      },
      {
        title: 'Reach the target with a clear lead',
        body: 'Deal new words and keep playing until Town or Chameleon reaches the target score and leads. Equal scores at the target mean one more round.',
        facts: ['Play again keeps the room together.', 'Return to lobby goes back to setup with the same players.'],
        scene: { layout: 'tv', action: 'score-win', phases: [
          { label: 'New roles and a new secret word each round' },
          { label: 'Reach the target with a clear lead to win' },
        ] },
      },
    ],
  },
};
