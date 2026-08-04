/**
 * The list of games on the site. This is the only file you edit to add one.
 *
 * Each entry:
 *   id        folder name under games/, and the id the hub uses
 *   name      the game's name — the hub keeps it for screen readers, since the
 *             printed title lives inside the key art
 *   tagline   one line under the art
 *   players   free text, shown as the card's meta line
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
    accent: '#FF2E92',
    art: '/hub/art/hitster.webp',
    basePath: '/hitster',
    href: '/hitster/tv',
    type: 'node',
  },
  {
    id: 'codenames',
    name: 'Codenames',
    tagline: 'One word, many meanings. Get your team to the right cards.',
    players: '4+ players · board on a TV, spymasters on phones',
    accent: '#E01B2E',
    art: '/hub/art/codenames.webp',
    basePath: '/codenames',
    type: 'static',
  },
  {
    id: 'draft',
    name: 'Draft Night',
    tagline: 'Spin the wheel, split the room into two, three or four teams.',
    players: 'Any number · one screen',
    accent: '#3AA0FF',
    art: '/hub/art/draft.webp',
    status: 'draft',
    basePath: '/draft',
    type: 'static',
  },
];
