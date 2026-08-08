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
const joinCodes = require('./lib/join');
const games = require('./games/registry');

const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

const HUB_DIR = path.join(__dirname, 'hub');
const hubTemplate = fs.readFileSync(path.join(HUB_DIR, 'template.html'), 'utf8');

/** Escape anything from the registry before it lands in the hub's markup. */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function renderCards() {
  return games
    .map((game) => {
      const href = game.href || game.basePath;
      // The poster carries the game's printed title, so the img is decorative
      // and the name is announced from the hidden heading instead of twice.
      const badge = game.status === 'draft'
        ? '<span class="badge">In progress</span>'
        : '';
      return `
      <a class="card" href="${esc(href)}" style="--accent: ${esc(game.accent)}">
        <span class="frame">
          <img src="${esc(game.art)}" alt="" width="1200" height="675" decoding="async" />
          ${badge}
        </span>
        <span class="card-facts" aria-label="Game details">
          <span class="fact"><b>${esc(game.age || 'All ages')}</b><small>AGE</small></span>
          <span class="fact"><b>${esc(game.time || 'Flexible')}</b><small>TIME</small></span>
          <span class="fact fact--players"><b>${esc(game.players.split(' · ')[0])}</b><small>PLAYERS</small></span>
        </span>
        <span class="meta">
          <h2 class="visually-hidden">${esc(game.name)}</h2>
          <p class="tagline">${esc(game.tagline)}</p>
          <span class="players">
            <span class="label">${esc(game.players)}</span>
            <span class="play" aria-hidden="true">Play →</span>
          </span>
        </span>
      </a>`;
    })
    .join('\n');
}

app.get('/', (req, res) => {
  const count = `${games.length} game${games.length === 1 ? '' : 's'}`;
  res.type('html').send(
    hubTemplate
      .replace('<!--TILES-->', renderCards())
      .replace('<!--COUNT-->', count)
  );
});

// The hub's own assets. Namespaced so no game's static folder can shadow them,
// and pointed at hub/public/ so the template itself is never served raw.
app.use('/hub', express.static(path.join(HUB_DIR, 'public')));

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

/**
 * The one address every QR code on the site points at.
 *
 * A code on a TV used to encode that game's own join page — /hues-cues/play
 * ?room=HUES — which is long enough that the symbol came out dense and fiddly
 * to scan across a room. Everything now goes through /j/HUES and is forwarded
 * from here, which is fifteen characters shorter and a version or two simpler.
 *
 * It also means the phone does not have to know which game it is joining. The
 * code alone decides, because every room registers its code with lib/join.js
 * the moment it is created.
 */
app.get('/j/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = joinCodes.lookup(code);
  if (room) return res.redirect(302, `${room.joinPath}?room=${encodeURIComponent(code)}`);

  /*
   * No such room. Almost always a code from a game that has already finished,
   * or one scanned off a photo taken last week — so this says what happened
   * rather than returning a bare 404 to somebody standing there holding a
   * phone, and puts the way back to the site one tap away.
   */
  res.status(404).type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>No game with that code</title>
  <link rel="icon" href="/hub/favicon.svg" type="image/svg+xml" />
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100svh; display: grid; place-content: center;
      gap: 1rem; padding: 2rem; text-align: center; background: #08090B;
      color: #E9ECEF; font: 400 1rem/1.5 system-ui, -apple-system, sans-serif;
    }
    h1 { margin: 0; font-size: 1.5rem; letter-spacing: -0.01em; }
    p { margin: 0; color: #8B9199; }
    code { color: #E9ECEF; letter-spacing: 0.12em; }
    a {
      justify-self: center; margin-top: 0.5rem; padding: 0.7rem 1.4rem;
      border-radius: 999px; border: 1px solid #2A2E35; color: #E9ECEF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <h1>Nothing running under <code>${esc(code)}</code></h1>
  <p>That game has finished, or the code was mistyped.</p>
  <a href="/">Game night →</a>
</body>
</html>`);
});

/** Machine-readable version of the registry, for anything else that wants it. */
app.get('/api/games', (req, res) => {
  res.json(games.map(({ id, name, tagline, players, age, time, accent, art, status, basePath, href }) => ({
    id, name, tagline, players, age, time, accent, art, status, basePath, href: href || basePath,
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

    // A static game may still need a small server-side bridge without becoming
    // a Socket.io game. Codenames uses this for its shared short join-code and
    // QR endpoint; its room state remains entirely in Firebase.
    const bridge = path.join(__dirname, 'games', game.id, 'server.js');
    if (fs.existsSync(bridge)) nodeGames.push(require(bridge));
  } else if (game.type === 'node') {
    nodeGames.push(require(path.join(__dirname, 'games', game.id, 'server.js')));
  } else {
    throw new Error(`Game "${game.id}" has unknown type "${game.type}"`);
  }
}

// Keep unknown URLs inside the same game-night world as the hub. API callers
// still get a small JSON error; browser requests get the designed 404 page.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(HUB_DIR, 'public', '404.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  ARCADE  http://127.0.0.1:${PORT}`);
  for (const game of games) console.log(`  · ${game.name.padEnd(12)} ${game.basePath}`);
  for (const game of nodeGames) if (game.onListen) game.onListen();
});
