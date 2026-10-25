// Builds src/data/songbook.json from Billboard's Year-End Hot 100 lists on Wikipedia (1959 → latest).
// Song names only: title, artist, first chart year, popularity score, duet flag.
// Run: node scripts/build-songbook.mjs
import { writeFile, mkdir, readFile } from "node:fs/promises";

const FIRST = 1959;
const LAST = new Date().getFullYear() - 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "KaraokeGame/0.1 (personal karaoke songbook builder)" };

const CACHE = new URL("./.cache/", import.meta.url);

// Cached on disk so re-runs don't hit Wikipedia; retries with backoff when rate-limited.
async function wikitext(year) {
  const file = new URL(`${year}.wiki`, CACHE);
  try {
    return await readFile(file, "utf8");
  } catch {
    /* not cached */
  }
  const page = `Billboard_Year-End_Hot_100_singles_of_${year}`;
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2&redirects=1&maxlag=5`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    if (res.status === 429 || !text.startsWith("{")) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    const body = JSON.parse(text);
    if (body.error) throw new Error(body.error.info);
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, body.parse.wikitext);
    return body.parse.wikitext;
  }
  throw new Error("rate limited");
}

// [[Target|Label]] → Label, [[Target]] → Target, drop refs/templates/markup.
function plain(s) {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{sort\|[^|}]*\|([^}]*)\}\}/gi, "$1")
    .replace(/\{\{(?:nowrap|nobr)\|([^}]*)\}\}/gi, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Two or more separately-linked artists joined by and/&/with/"," (not "featuring") reads as a duet.
function isDuet(rawArtist) {
  const main = rawArtist.split(/\bfeat(?:uring|\.)?\b/i)[0];
  const links = main.match(/\[\[[^\]]+\]\]/g) || [];
  return links.length >= 2 && /\]\]\s*(?:,|and|&|with|duet with)\s*\[\[/i.test(main);
}

function cells(rowText) {
  // Cells start at a line beginning with | or !, and may be chained with || / !!
  const out = [];
  for (const line of rowText.split("\n")) {
    const l = line.trim();
    if (!l || (!l.startsWith("|") && !l.startsWith("!"))) {
      if (out.length && l) out[out.length - 1] += " " + l;
      continue;
    }
    for (const part of l.slice(1).split(/\|\||!!/)) {
      // Strip cell attributes: `style="..." | content`
      const m = part.match(/^\s*(?:[a-z-]+\s*=\s*"[^"]*"\s*)+\|(.*)$/i);
      out.push((m ? m[1] : part).trim());
    }
  }
  return out;
}

function parseYear(text, year) {
  const start = text.search(/\{\|\s*class="wikitable/);
  if (start < 0) throw new Error(`${year}: no table`);
  const end = text.indexOf("\n|}", start);
  const table = text.slice(start, end);
  const rows = table.split(/\n\|-[^\n]*/).slice(1);
  const songs = [];
  let lastArtist = null;
  let lastRank = 0;
  for (const row of rows) {
    const cs = cells(row);
    if (!cs.length || cs.every((c) => /^(no\.|title|artist)/i.test(plain(c)) || !plain(c))) continue;
    const ti = cs.findIndex((c) => /"/.test(c) || /“/.test(c));
    if (ti < 0) continue;
    const rankCell = cs.slice(0, ti).map(plain).find((c) => /^\d+$/.test(c));
    const rank = rankCell ? Number(rankCell) : lastRank; // ties/rowspans share the previous rank
    lastRank = rank;
    const rawArtist = cs[ti + 1] ?? lastArtist;
    if (!rawArtist) continue;
    lastArtist = rawArtist;
    const artist = plain(rawArtist);
    // Double A-sides: "Song A" / "Song B"
    const titles = [...plain(cs[ti]).matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1].trim());
    for (const title of titles) {
      if (title && artist && rank) songs.push({ title, artist, rank, duet: isDuet(rawArtist) });
    }
  }
  return songs;
}

function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const keyOf = (title, artist) =>
  `${norm(title.replace(/\s*[([].*?[)\]]\s*/g, " "))}|${norm(artist.split(":")[0]).split(/ (?:featuring|feat|ft|with|and|x) /)[0]}`;

const all = new Map();
for (let year = FIRST; year <= LAST; year++) {
  let songs;
  try {
    songs = parseYear(await wikitext(year), year);
  } catch (e) {
    console.warn(`skip ${year}: ${e.message}`);
    continue;
  }
  if (songs.length < 80) console.warn(`${year}: only ${songs.length} songs parsed`);
  for (const s of songs) {
    const key = keyOf(s.title, s.artist);
    const prev = all.get(key);
    const points = 101 - Math.min(s.rank, 100);
    if (prev) {
      prev.score += points;
      prev.year = Math.min(prev.year, year);
      prev.duet ||= s.duet;
    } else all.set(key, { title: s.title, artist: s.artist, year, score: points, duet: s.duet });
  }
  process.stdout.write(`${year}:${songs.length} `);
  await sleep(700);
}

const list = [...all.values()].sort((a, b) => b.score - a.score);
// Compact rows: [title, artist, year, score, duet?1:0]
const rows = list.map((s) => [s.title, s.artist, s.year, s.score, s.duet ? 1 : 0]);
await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../src/data/songbook.json", import.meta.url), JSON.stringify(rows));
console.log(`\nwrote ${rows.length} songs`);
