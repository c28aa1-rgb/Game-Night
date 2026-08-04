/**
 * The site host.
 *
 * Serves the hub at / and mounts every game listed in games/registry.js. It
 * owns the single HTTP listener; games never listen themselves.
 *
 *   static games  served from games/<id>/static/ at their basePath
 *   node games    games/<id>/server.js registers its own routes on the shared
 *                 app/io from lib/host.js, and may export onListen()
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const { app, server } = require('./lib/host');
const games = require('./games/registry');

const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

const HUB_DIR = path.join(__dirname, 'hub');
const hubTemplate = fs.readFileSync(path.join(HUB_DIR, 'index.html'), 'utf8');

/** Escape anything from the registry before it lands in the hub's markup. */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function renderTiles() {
  return games
    .map((game) => {
      const href = game.href || game.basePath;
      return `
      <a class="tile" href="${esc(href)}" style="--accent: ${esc(game.accent)}">
        <h2 class="tile__name">${esc(game.name)}</h2>
        <p class="tile__tagline">${esc(game.tagline)}</p>
        <p class="tile__players">${esc(game.players)}</p>
        <span class="tile__go" aria-hidden="true">Play</span>
      </a>`;
    })
    .join('\n');
}

app.get('/', (req, res) => {
  res.type('html').send(hubTemplate.replace('<!--TILES-->', renderTiles()));
});

// The hub's own assets. Namespaced so no game's static folder can shadow them.
app.use('/hub', express.static(HUB_DIR));

/** Machine-readable version of the registry, for anything else that wants it. */
app.get('/api/games', (req, res) => {
  res.json(games.map(({ id, name, tagline, players, accent, basePath, href }) => ({
    id, name, tagline, players, accent, basePath, href: href || basePath,
  })));
});

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const nodeGames = [];

for (const game of games) {
  if (game.type === 'static') {
    const dir = path.join(__dirname, 'games', game.id, 'static');
    // Without this redirect a request to /codenames serves index.html at a URL
    // with no trailing slash, and every relative asset in it resolves one level
    // too high (/style.css instead of /codenames/style.css). Redirecting first
    // is what lets these bundles be served unmodified.
    app.get(game.basePath, (req, res, next) => {
      // Express matches this route for both /codenames and /codenames/, so the
      // trailing-slash form has to fall through or the redirect loops forever.
      const [pathname, query] = req.originalUrl.split('?');
      if (pathname.endsWith('/')) return next();
      res.redirect(302, `${game.basePath}/${query ? `?${query}` : ''}`);
    });
    app.use(game.basePath, express.static(dir));
  } else if (game.type === 'node') {
    nodeGames.push(require(path.join(__dirname, 'games', game.id, 'server.js')));
  } else {
    throw new Error(`Game "${game.id}" has unknown type "${game.type}"`);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  ARCADE  http://127.0.0.1:${PORT}`);
  for (const game of games) console.log(`  · ${game.name.padEnd(12)} ${game.basePath}`);
  for (const game of nodeGames) if (game.onListen) game.onListen();
});
