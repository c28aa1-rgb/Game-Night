import { norm, songKey } from "./library.js";

const CACHE_STORAGE = "nk.videoCache";
const REJECTED_STORAGE = "nk.rejectedVideoIds";

// Channels that reliably upload clean, well-timed karaoke tracks. Results from these sort first.
const TRUSTED = [
  "sing king",
  "karafun",
  "stingray karaoke",
  "karaoke version",
  "zzang karaoke",
  "musisi karaoke",
  "karaoke hits",
  "global karaoke",
];

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function readRejectedVideos() {
  try {
    const ids = JSON.parse(safeGet(REJECTED_STORAGE) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id) => /^[\w-]{11}$/.test(id)) : []);
  } catch {
    return new Set();
  }
}

export function rememberUnplayableVideos(ids) {
  const rejected = readRejectedVideos();
  for (const id of ids || []) if (/^[\w-]{11}$/.test(id)) rejected.add(id);
  safeSet(REJECTED_STORAGE, JSON.stringify([...rejected].slice(-500)));
}

export function decodeEntities(str) {
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

export function cleanTitle(raw) {
  return decodeEntities(raw)
    .replace(/[([](?:[^)\]]*?(karaoke|instrumental|lyrics?|sing ?along|no vocals?|backing track)[^)\]]*)[)\]]/gi, "")
    .replace(/\|.*$/g, "")
    .replace(/\b(karaoke( version)?|instrumental|with lyrics)\b/gi, "")
    .replace(/\s*[-–—:]\s*$/g, "")
    .replace(/^\s*[-–—:]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// A songbook-style number, stable per video.
export function songCode(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String((h >>> 0) % 100000).padStart(5, "0");
}

export function thumbFor(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function parseVideoInput(input) {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1, 12) || null;
    if (url.hostname.includes("youtube.com")) {
      if (url.searchParams.get("v")) return url.searchParams.get("v").slice(0, 11);
      const m = url.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function readCache() {
  try {
    return JSON.parse(safeGet(CACHE_STORAGE) || "{}");
  } catch {
    return {};
  }
}

export class SearchError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

// Finds karaoke videos for a songbook entry. Results are cached per song for good,
// so each song costs one search (100 quota units) per browser, ever.
export async function findKaraokeVideos(song, { refresh = false, code, hostToken } = {}) {
  const cache = readCache();
  const hit = cache[song.key];
  const rejected = readRejectedVideos();
  const cachedItems = hit?.items?.filter((item) => !rejected.has(item.id)) || [];
  if (!refresh && cachedItems.length) return cachedItems;

  const res = await fetch("/karaoke-api/youtube/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, hostToken, title: song.title, artist: song.artist, excludeVideoIds: [...rejected] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SearchError(body.error || "YouTube didn't respond. Try again.", body.kind || "network");
  }

  const titleWords = norm(song.title).split(" ").filter((w) => w.length > 2);
  const items = (body.items || [])
    .filter((it) => it.id?.videoId && !rejected.has(it.id.videoId))
    .map((it) => {
      const channel = decodeEntities(it.snippet.channelTitle || "");
      const raw = decodeEntities(it.snippet.title);
      const n = norm(raw);
      const titleHit = titleWords.length ? titleWords.filter((w) => n.includes(w)).length / titleWords.length : 1;
      const trusted = TRUSTED.some((t) => channel.toLowerCase().includes(t));
      return {
        id: it.id.videoId,
        title: raw,
        channel,
        thumb: it.snippet.thumbnails?.high?.url || thumbFor(it.id.videoId),
        trusted,
        rank: (trusted ? 2 : 0) + titleHit * 2 + (/karaoke|instrumental/i.test(raw) ? 1 : 0),
      };
    })
    .sort((a, b) => b.rank - a.rank);

  if (!items.length) throw new SearchError("No karaoke video found for this song.", "empty");
  cache[song.key] = { at: Date.now(), items };
  const entries = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, 400);
  safeSet(CACHE_STORAGE, JSON.stringify(Object.fromEntries(entries)));
  return items;
}

// Drop a video that refused to play so it's never picked again for this song.
export function markUnplayable(songKeyValue, videoId) {
  rememberUnplayableVideos([videoId]);
  const cache = readCache();
  const hit = cache[songKeyValue];
  if (!hit) return [];
  hit.items = hit.items.filter((v) => v.id !== videoId);
  safeSet(CACHE_STORAGE, JSON.stringify(cache));
  return hit.items;
}

// The wider catalogue: Apple's free iTunes Search API. Song names only, no key needed.
// Cleaned up so it reads like a songbook: originals only, one row per song.
const JUNK_ARTIST = /kidz bop|karaoke|tribute|glee cast|sing king|hit crew|vitamin string|string quartet|piano (?:dreamers|tribute|covers)|lullaby|rockabye|8-?bit|twinkle|relax|workout|fitness|cover band|in the style of/i;
const JUNK_TITLE = /[([][^)\]]*\b(sped up|slowed|remix|mix|acoustic|live|instrumental|karaoke|8d|nightcore|demo|reverb|lofi|lo-fi|edit|stripped|piano|cover|version)\b[^)\]]*[)\]]/i;
const JUNK_GENRE = /children|relaxation|fitness|karaoke|meditation|instrumental|easy listening|vocal pop/i;
const KEEP_VERSION = /taylor['’]s version/i;

const catalogCache = new Map();
export async function searchCatalog(term) {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return [];
  if (catalogCache.has(q)) return catalogCache.get(q);
  // The server proxy keeps Apple's keyless catalog request same-origin and cached.
  const res = await fetch("/karaoke-api/catalog/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term: q }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new SearchError(body.error || "Apple's catalogue isn't responding.", body.kind || "network");
  const seen = new Set();
  const songs = [];
  for (const r of body.results || []) {
    if (!r.trackName || !r.artistName) continue;
    if (JUNK_ARTIST.test(r.artistName) || JUNK_GENRE.test(r.primaryGenreName || "")) continue;
    if (JUNK_TITLE.test(r.trackName) && !KEEP_VERSION.test(r.trackName)) continue;
    const key = songKey(r.trackName, r.artistName);
    if (seen.has(key)) continue;
    seen.add(key);
    const title = r.trackName.replace(/\s*\((?:feat|with)\.?[^)]*\)/i, "").trim();
    songs.push({
      key,
      title,
      artist: r.artistName,
      year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
      genre: r.primaryGenreName || "",
      art: r.artworkUrl100?.replace("100x100", "200x200"),
      source: "catalog",
    });
  }
  catalogCache.set(q, songs);
  return songs;
}

// Works without an API key — used for pasted links.
export async function lookupVideo(id) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { id, title: cleanTitle(data.title) || data.title, channel: data.author_name || "", thumb: thumbFor(id), trusted: false };
  } catch {
    return { id, title: "YouTube video", channel: "", thumb: thumbFor(id), trusted: false };
  }
}
