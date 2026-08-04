/**
 * The list of games on the site. This is the only file you edit to add one.
 *
 * Each entry:
 *   id        folder name under games/, and the id the hub uses
 *   name      what the hub tile says
 *   tagline   one line under the name on the tile
 *   players   free text, shown on the tile
 *   accent    hex colour for the tile, normally borrowed from the game itself
 *   basePath  the URL the game lives at
 *   href      where the hub tile links to (defaults to basePath)
 *   type      'static' — served straight from games/<id>/static/
 *             'node'   — games/<id>/server.js registers its own routes on the
 *                        shared host (see lib/host.js)
 *
 * To add a third game:
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
    accent: '#F2B33D',
    basePath: '/hitster',
    href: '/hitster/tv',
    type: 'node',
  },
  {
    id: 'codenames',
    name: 'Codenames',
    tagline: 'One word, many meanings. Get your team to the right cards.',
    players: '4+ players · one device each',
    accent: '#6FA8B8',
    basePath: '/codenames',
    type: 'static',
  },
];
