# Arcade

Both party games behind one hub page, served by one Express process.

```
/            hub landing page
/hitster     Hitster — phone controller
/hitster/tv  Hitster — TV screen
/codenames   Codenames
```

## Run it

```bash
npm install
npm start
```

Needs `.env` with `SPOTIFY_CLIENT_ID` (copy `.env.example`). Default port 3000.

## Layout

```
server.js            the site host: hub at /, mounts every game
lib/host.js          the one Express app + HTTP server + Socket.io instance
games/registry.js    the list of games — the only file you edit to add one
games/hitster/       server.js registers its own routes; public/ is its frontend
games/codenames/     static/ is the bundle, served as-is
hub/                 the landing page
```

## Adding a third game

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

## Deploying

Nothing here is tied to a host or a domain. It is one Node process serving one
origin: `npm start` with `PORT` set is all a host needs. Whatever origin it ends
up on, register `<origin>/callback` as a redirect URI in the Spotify dashboard.
