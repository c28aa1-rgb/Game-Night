# Karaoke

A party karaoke game in the browser. Pick a song from the built-in songbook (or search Apple's music
catalogue for anything else). The app finds a karaoke video for it on YouTube and plays it with the lyrics
on screen. Everyone joins from their phone with a QR code and adds songs to one queue; the TV plays them in turn.
The TV can also monitor a microphone with a karaoke-style echo and reverb while a song is playing.
The mic output mutes automatically during count-ins, pauses, and transitions.

No audio is stored or processed. The songbook is just names, and playback is the official YouTube player.

## How a party works

- **TV:** open the app and press **Start a party**. The TV shows a QR code and a 4-letter code in the top-left
  the whole time, plus the queue, **Randomize order** and **Start**. During a song it shows the video, a
  **Next up** card and the QR code.
- **Phones:** scan the QR code (or enter the code), type a name, and pick songs from the songbook. When it's
  your turn, the phone shows a big **Start** button. Nothing plays until someone presses Start (on the TV or
  the singer's phone), then the TV counts in with four dots.

## Run it

```bash
npm install
npm run dev
```

This runs the app and the room server together. To let phones on the same Wi-Fi join, run
`npm run dev -- --host` and open the TV page using the "Network" address Vite prints (not localhost).

To run the production build on its own: `npm run build && npm start` (serves `/karaoke/` on port 3000).

## Putting it on the arcade server

`npm run package` builds `release/karaoke.zip`: a drop-in `karaoke/` folder, `INTEGRATION.md`
(3 lines to add to the Render server), and this source. See [INTEGRATION.md](INTEGRATION.md).

## YouTube API key

Finding videos uses the YouTube Data API v3 through the Node server. Create a key in Google Cloud (enable "YouTube Data API v3",
then Credentials → API key, restricted to that API) and set `YOUTUBE_API_KEY` in the server environment.
The key is never included in the browser bundle. Only a TV holding the current party's host token can use the search endpoint.

Each song costs one search (100 of the default 10,000 daily quota units) the first time it's picked.
After that the result is cached in the browser for good.

Without a key you can still paste a YouTube link on the TV when a song comes up.

## The songbook

About 6,500 songs, made of two parts:

- **Chart hits:** every song on Billboard's Year-End Hot 100 from 1959 on, pulled from Wikipedia into
  `src/data/songbook.json`. Songs are ranked by how high and how long they charted. To refresh after a new
  year's list is published:
  ```bash
  node scripts/build-songbook.mjs
  ```
- **Karaoke classics:** a hand-picked list in `src/lib/library.js` (`RAW`) of karaoke staples, duets, Disney,
  musicals and holiday songs. These are boosted toward the top, and they supply the Musicals & Film and Holiday
  filters.

Anything that isn't in the songbook still turns up in search through Apple's catalogue.

## Where things live

- `src/lib/library.js`: hand-picked classics, songbook loading, typo-tolerant search
- `src/lib/youtube.js`: video finder, catalogue search, caching
- `server/karaoke.mjs`: zero-dependency room server (party codes, queue, live updates over SSE)
- `src/host/`: TV screens (Lobby, HostUpNext, HostStage, HostScore)
- `src/phone/PhoneApp.jsx`: phone remote (songbook, queue, "You're up")
- `src/components/`: shared pieces (Songbook, SongRow, AddSheet, JoinBadge, Wipe, MicButton)
- `design/philosophy.md` + `public/poster.png`: the "Timed Light" art direction
