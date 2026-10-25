// Karaoke room server. Zero dependencies: plain node:http, Server-Sent Events for live updates.
//
//   import { createKaraoke } from './karaoke/server/karaoke.mjs'
//   const karaoke = createKaraoke({ staticDir: join(process.cwd(), 'karaoke', 'app') })
//   // first line of your request handler:
//   if (await karaoke.handle(request, response)) return
//
// The TV opens <basePath>/ and creates a room; phones join with the 4-letter code.
// Rooms live in memory: they survive while the server runs and are swept after hours of inactivity.

import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O — easy to read off a TV
const MAX_ROOMS = 500;
const MAX_QUEUE = 150;
const MAX_PER_DEVICE = 12;
const IDLE_MS = 1000 * 60 * 60 * 6;
const PHASES = ["lobby", "upnext", "playing", "score"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function cleanSong(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = str(raw.title, 140);
  const artist = str(raw.artist, 140);
  if (!title || !artist) return null;
  const art = str(raw.art, 300);
  return {
    key: str(raw.key, 300) || `${title}|${artist}`.toLowerCase(),
    title,
    artist,
    year: Number.isInteger(raw.year) ? raw.year : null,
    art: /^https:\/\/is\d+(-ssl)?\.mzstatic\.com\//.test(art) ? art : null,
  };
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createKaraoke({ staticDir = null, basePath = "/karaoke", apiPath = "/karaoke-api" } = {}) {
  const rooms = new Map();
  const youtubeCache = new Map();

  function newCode() {
    for (let tries = 0; tries < 50; tries++) {
      let code = "";
      for (const b of randomBytes(4)) code += LETTERS[b % LETTERS.length];
      if (!rooms.has(code)) return code;
    }
    throw new Error("no free room codes");
  }

  const publicState = (room) => ({
    code: room.code,
    phase: room.phase,
    queue: room.queue,
    current: room.current,
    lastScore: room.lastScore,
    history: room.history.slice(0, 12),
    phones: room.listeners.size - room.hostListeners,
    rev: room.rev,
  });

  function broadcast(room) {
    room.rev++;
    room.updatedAt = Date.now();
    const msg = `data: ${JSON.stringify(publicState(room))}\n\n`;
    for (const res of room.listeners) res.write(msg);
  }

  function sweep() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.listeners.size === 0 && now - room.updatedAt > IDLE_MS) rooms.delete(code);
    }
  }
  setInterval(sweep, 10 * 60 * 1000).unref();

  // ── Actions ──────────────────────────────────────────────────
  function act(room, body) {
    const isHost = body.hostToken === room.hostToken;
    const deviceId = str(body.deviceId, 64);
    const host = () => {
      if (!isHost) throw Object.assign(new Error("Only the TV can do that."), { status: 403 });
    };
    const pull = () => {
      room.current = room.queue.shift() || null;
      room.phase = room.current ? "upnext" : "lobby";
    };

    switch (body.action) {
      case "add": {
        const song = cleanSong(body.song);
        const singer = str(body.singer, 30);
        if (!song || !singer) throw Object.assign(new Error("Pick a song and enter a name."), { status: 400 });
        if (room.queue.length >= MAX_QUEUE) throw Object.assign(new Error("The queue is full."), { status: 409 });
        if (!isHost && room.queue.filter((e) => e.deviceId === deviceId).length >= MAX_PER_DEVICE)
          throw Object.assign(new Error(`You can have ${MAX_PER_DEVICE} songs in the queue at once.`), { status: 409 });
        room.queue.push({ id: randomUUID(), song, singer, deviceId: deviceId || null, addedAt: Date.now() });
        break;
      }
      case "remove": {
        const entry = room.queue.find((e) => e.id === body.id);
        if (!entry) break;
        if (!isHost && entry.deviceId !== deviceId) throw Object.assign(new Error("You can only remove your own songs."), { status: 403 });
        room.queue = room.queue.filter((e) => e.id !== body.id);
        break;
      }
      case "reorder": {
        host();
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const byId = new Map(room.queue.map((e) => [e.id, e]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
        room.queue = [...ordered, ...room.queue.filter((e) => !ids.includes(e.id))];
        break;
      }
      case "shuffle":
        host();
        room.queue = shuffle(room.queue);
        break;
      case "clear":
        host();
        room.queue = [];
        break;
      case "startShow":
        host();
        if (room.phase === "lobby") pull();
        break;
      case "go": {
        // The TV, or whoever is up, can start the song.
        if (room.phase !== "upnext" || !room.current) break;
        if (!isHost && room.current.deviceId !== deviceId) throw Object.assign(new Error("It's not your turn yet."), { status: 403 });
        room.phase = "playing";
        room.startedAt = Date.now();
        break;
      }
      case "finish": {
        host();
        if (!room.current || room.phase !== "playing") break;
        const hype = Number.isFinite(body.hype) ? Math.max(0, Math.min(100, Math.round(body.hype))) : null;
        room.lastScore = { singer: room.current.singer, song: room.current.song, hype, at: Date.now() };
        room.history.unshift(room.lastScore);
        room.history = room.history.slice(0, 50);
        room.phase = "score";
        break;
      }
      case "next": // after the score, or to skip whoever is up
        host();
        // `from` makes it idempotent: a double tap (or tap + auto-advance) can't skip an extra singer.
        if (body.from && body.from !== room.phase) break;
        pull();
        break;
      case "stop": // back to the lobby; the current singer keeps their place at the front
        host();
        if (room.current) room.queue.unshift(room.current);
        room.current = null;
        room.phase = "lobby";
        break;
      default:
        throw Object.assign(new Error("Unknown action."), { status: 400 });
    }
    if (!PHASES.includes(room.phase)) room.phase = "lobby";
  }

  // ── HTTP plumbing ────────────────────────────────────────────
  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  async function readBody(req) {
    // The arcade host installs Express' JSON parser before this bridge. Keep
    // the raw-stream fallback so the same module still works standalone.
    if (req.body && typeof req.body === "object") return req.body;
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 32_000) throw Object.assign(new Error("Request too large."), { status: 413 });
    }
    try {
      return JSON.parse(raw || "{}");
    } catch {
      throw Object.assign(new Error("Invalid JSON."), { status: 400 });
    }
  }

  async function searchYouTube(body) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error("YouTube search is not configured on this server. Add YOUTUBE_API_KEY in Render."), {
        status: 503,
        kind: "nokey",
      });
    }

    const code = str(body.code, 4).toUpperCase();
    const room = rooms.get(code);
    if (!room || body.hostToken !== room.hostToken) {
      throw Object.assign(new Error("Only the TV for an active party can search YouTube."), { status: 403, kind: "forbidden" });
    }

    const title = str(body.title, 140);
    const artist = str(body.artist, 140);
    const current = room.current?.song;
    if (!current || title !== current.title || artist !== current.artist) {
      throw Object.assign(new Error("That song is not currently up next."), { status: 409, kind: "stale" });
    }

    const cleanArtist = artist.split(/ ft\.? | feat\.? /i)[0];
    const query = `${title} ${cleanArtist} karaoke`;
    const cached = youtubeCache.get(query.toLowerCase());
    if (cached) return cached;

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "10",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "moderate",
      q: query,
      key: apiKey,
    });

    let response;
    try {
      response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw Object.assign(new Error("YouTube didn't respond. Try again."), { status: 502, kind: "network" });
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = result?.error?.errors?.[0]?.reason || "";
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        throw Object.assign(new Error("Today's YouTube quota is used up. Songs already cached on this TV still work."), {
          status: 429,
          kind: "quota",
        });
      }
      if (response.status === 400 || response.status === 403) {
        throw Object.assign(new Error("YouTube rejected the server API key. Check its API restrictions."), {
          status: 502,
          kind: "badkey",
        });
      }
      throw Object.assign(new Error("YouTube didn't respond. Try again."), { status: 502, kind: "network" });
    }

    const safeResult = {
      items: (result.items || []).slice(0, 10).map((item) => ({
        id: { videoId: str(item.id?.videoId, 20) },
        snippet: {
          title: str(item.snippet?.title, 300),
          channelTitle: str(item.snippet?.channelTitle, 200),
          thumbnails: { high: { url: str(item.snippet?.thumbnails?.high?.url, 500) } },
        },
      })),
    };
    youtubeCache.set(query.toLowerCase(), safeResult);
    if (youtubeCache.size > 400) youtubeCache.delete(youtubeCache.keys().next().value);
    return safeResult;
  }

  async function api(req, res, path) {
    try {
      if (path === "/youtube/search" && req.method === "POST") {
        return json(res, 200, await searchYouTube(await readBody(req)));
      }

      if (path === "/rooms" && req.method === "POST") {
        if (rooms.size >= MAX_ROOMS) sweep();
        if (rooms.size >= MAX_ROOMS) return json(res, 503, { error: "Too many parties right now. Try again later." });
        const code = newCode();
        const room = {
          code,
          hostToken: randomUUID(),
          phase: "lobby",
          queue: [],
          current: null,
          lastScore: null,
          history: [],
          listeners: new Set(),
          hostListeners: 0,
          rev: 0,
          updatedAt: Date.now(),
        };
        rooms.set(code, room);
        return json(res, 201, { code, hostToken: room.hostToken, state: publicState(room) });
      }

      const m = path.match(/^\/rooms\/([A-Z]{4})(\/events|\/actions)?$/i);
      if (!m) return json(res, 404, { error: "Not found." });
      const room = rooms.get(m[1].toUpperCase());
      if (!room) return json(res, 404, { error: "That party code doesn't exist. Check the code on the TV." });

      if (!m[2] && req.method === "GET") return json(res, 200, { state: publicState(room) });

      if (m[2] === "/events" && req.method === "GET") {
        const isHost = new URL(req.url, "http://x").searchParams.get("host") === room.hostToken;
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`retry: 2000\n\n`);
        room.listeners.add(res);
        if (isHost) room.hostListeners++;
        broadcast(room); // everyone sees the updated phone count
        const ping = setInterval(() => res.write(`: ping\n\n`), 15_000);
        req.on("close", () => {
          clearInterval(ping);
          room.listeners.delete(res);
          if (isHost) room.hostListeners--;
          if (rooms.has(room.code)) broadcast(room);
        });
        return;
      }

      if (m[2] === "/actions" && req.method === "POST") {
        const body = await readBody(req);
        act(room, body);
        broadcast(room);
        return json(res, 200, { state: publicState(room) });
      }
      return json(res, 405, { error: "Method not allowed." });
    } catch (e) {
      return json(res, e.status || 500, {
        error: e.status ? e.message : "Something went wrong.",
        ...(e.kind ? { kind: e.kind } : {}),
      });
    }
  }

  function serveStatic(req, res, pathname) {
    if (pathname === basePath) {
      res.writeHead(301, { Location: `${basePath}/` });
      return res.end();
    }
    const rel = normalize(decodeURIComponent(pathname.slice(basePath.length + 1) || "index.html")).replace(/^(\.\.[/\\])+/, "");
    let file = join(staticDir, rel);
    if (!file.startsWith(staticDir + sep) || !existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, "index.html");
    const ext = extname(file);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    const pathname = new URL(req.url || "/", "http://x").pathname;
    if (pathname === apiPath || pathname.startsWith(`${apiPath}/`)) {
      await api(req, res, pathname.slice(apiPath.length));
      return true;
    }
    if (staticDir && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
      serveStatic(req, res, pathname);
      return true;
    }
    return false;
  }

  return { handle, rooms };
}
