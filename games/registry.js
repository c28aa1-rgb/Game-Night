/**
 * The list of games on the site. This is the only file you edit to add one.
 *
 * Each entry:
 *   id        folder name under games/, and the id the hub uses
 *   name      the game's name — the hub keeps it for screen readers, since the
 *             printed title lives inside the key art
 *   tagline   one line under the art
 *   players   free text, shown as the card's supporting line
 *   age       suggested minimum age, shown in the hover facts
 *   time      typical play length, shown in the hover facts
 *   accent    hex colour picked out of that game's key art
 *   art       poster shown on the hub, 16:9. Source images are optimised with
 *             scripts/build-art.js into hub/public/art/
 *   status    optional. 'draft' marks the card as unfinished on the hub
 *   basePath  the URL the game lives at
 *   href      where the card links to (defaults to basePath)
 *   type      'static' — served straight from games/<id>/static/
 *             'node'   — games/<id>/server.js registers its own routes on the
 *                        shared host (see lib/host.js)
 *
 * To add a fourth game:
 *   static → drop the bundle in games/<id>/static/ and add an entry here
 *   node   → games/<id>/server.js, requiring lib/host.js for { app, server, io },
 *            add an entry with type: 'node'
 */

module.exports = [
  {
    id: 'hitster',
    name: 'Hitster',
    tagline: 'Hear a song, guess the year, build your timeline.',
    players: '2–10 players · TV + phones · Spotify Premium',
    age: '16+',
    time: '30–45 min',
    accent: '#FF2E92',
    art: '/hub/art/hitster.webp',
    basePath: '/hitster',
    type: 'node',
  },
  {
    id: 'codenames',
    name: 'Codenames',
    tagline: 'One word, many meanings. Get your team to the right cards.',
    players: '4+ players · board on a TV, spymasters on phones',
    age: '10+',
    time: '15–30 min',
    accent: '#E01B2E',
    art: '/hub/art/codenames.webp',
    basePath: '/codenames',
    type: 'static',
  },
  {
    id: 'mafia',
    name: 'Mafia',
    tagline: 'Trust some. Question all. Survive together.',
    players: '5–12 players · TV narrates, phones decide',
    age: '8+',
    time: '30–45 min',
    accent: '#FF3B1F',
    art: '/hub/art/mafia.png',
    basePath: '/mafia',
    type: 'node',
    status: 'draft',
  },
  {
    id: 'hues-cues',
    name: 'Hues & Cues',
    tagline: 'One word. Four hundred and eighty colours.',
    players: '2–10 players · TV + phones',
    age: '8+',
    time: '30 min',
    accent: '#F9680D',
    art: '/hub/art/hues-cues.webp',
    basePath: '/hues-cues',
    type: 'node',
  },
  {
    id: 'draft',
    name: 'Draft Night',
    tagline: 'Spin the wheel, split the room into two, three or four teams.',
    players: 'Any number · one screen',
    age: 'No limit',
    time: '20–30 min',
    accent: '#3AA0FF',
    art: '/hub/art/draft.webp',
    basePath: '/draft',
    type: 'static',
  },
];
