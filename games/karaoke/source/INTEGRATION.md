# Karaoke integration

Karaoke is mounted in the Game Night Express host at `/karaoke/`. The TV creates
an in-memory party room, phones join by QR code, and everyone shares one live
queue over Server-Sent Events.

## Repository layout

- `games/karaoke/static/` is the production browser bundle committed for Render.
- `games/karaoke/server.js` connects the game to the shared Express host.
- `games/karaoke/source/server/karaoke.mjs` owns rooms and `/karaoke-api/`.
- `games/karaoke/source/` contains the editable Vite + React source.
- `games/registry.js` supplies the hub card at `/karaoke`.

## Rebuild the browser bundle

From `games/karaoke/source`:

```bash
npm ci
npm run build
```

Replace the contents of `games/karaoke/static/` with the contents of `dist/`,
then commit both the source changes and rebuilt static assets.

## YouTube API key

Video search runs through the Node server so the key never reaches the browser.
Set `YOUTUBE_API_KEY` in Render's environment settings. In Google Cloud, enable
YouTube Data API v3 and restrict the key to that API. Browser referrer restrictions
do not apply because the request originates from the server.

The search endpoint requires the active room's host token and only accepts the
exact song currently up next. Search results are cached in the server process and
again in the TV browser.

## Runtime notes

- Rooms live in memory. Restarting or redeploying ends open parties.
- Keep the service at one instance unless room state is moved to shared storage.
- Limits are 150 queued songs, 12 queued songs per phone, and 500 rooms.
- Idle rooms are removed after six hours.
- Only the TV can reorder, randomize, skip, or clear the queue. A singer may
  start their own turn from their phone.
