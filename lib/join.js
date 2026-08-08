/**
 * How a phone gets into a room.
 *
 * Two jobs, both of which only make sense site-wide rather than per game:
 *
 *   1. One directory of live room codes. Every game invents four-letter codes
 *      from its own vocabulary and the vocabularies overlap — TONE is in both
 *      Hitster's list and Hues & Cues' — so without somewhere central to ask,
 *      two games can be running the same code at once. That was harmless while
 *      each game owned its own join URL, and is not harmless now that a scanned
 *      code has to decide on its own which game it belongs to.
 *
 *   2. The short join URL the QR code encodes. A QR's density is driven by how
 *      many characters it carries, and the per-game form —
 *      https://host/hues-cues/play?room=HUES — was long enough that the code on
 *      the TV came out dense and fiddly to scan from a sofa. Everything now
 *      goes through https://host/j/HUES, which the site forwards to whichever
 *      game claimed that code (see the /j/:code route in server.js). Fifteen
 *      characters shorter, and it drops the symbol a version or two.
 *
 * Codes are claimed when a room is created and released when it is swept, so
 * this map only ever holds rooms that actually exist. Nothing is persisted:
 * a restart takes every room with it anyway.
 */

const os = require('os');

/** CODE -> { gameId, joinPath, expiresAt? } */
const codes = new Map();

const normalise = (code) => String(code || '').toUpperCase();

/**
 * Is this code going spare?
 *
 * Games call this while inventing a code, alongside their own "is this room
 * code already mine" check. A code held by another game reads as taken.
 */
function isFree(code) {
  return !lookup(code);
}

/**
 * Take a code for a room.
 *
 * `joinPath` is where a phone holding this code should end up — the game's
 * player page, e.g. '/hues-cues/play'. Returns false if somebody else got
 * there first, which a caller that checked isFree() first should never see,
 * but is worth reporting honestly rather than silently stealing the code.
 */
function claim(code, gameId, joinPath, options = {}) {
  const key = normalise(code);
  if (lookup(key)) return false;
  const expiresAt = Number(options.expiresAt);
  codes.set(key, {
    gameId,
    joinPath,
    // Most rooms live only in this process and explicitly release their code.
    // Codenames is the exception: its Firebase room has a 24-hour TTL, so its
    // bridge registration must disappear too even when no browser comes back
    // to tell this server that Firestore removed the document.
    expiresAt: Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : null,
  });
  return true;
}

/** Give a code back. Safe to call for a code that was never claimed. */
function release(code) {
  codes.delete(normalise(code));
}

/** Which game owns this code, or null if nothing does. */
function lookup(code) {
  const key = normalise(code);
  const room = codes.get(key) || null;
  if (room?.expiresAt && room.expiresAt <= Date.now()) {
    codes.delete(key);
    return null;
  }
  return room;
}

/** LAN address, so a QR code points somewhere a phone can actually reach. */
function lanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

/**
 * The address to put in a QR code.
 *
 * A phone scanning the TV cannot reach 127.0.0.1, so a request that arrived on
 * a loopback host is answered with this machine's LAN address instead. Anywhere
 * else — a real deployment behind a proxy — the Host header is already right,
 * and lib/host.js sets trust proxy so req.protocol reports https rather than
 * the plain http the proxy speaks to us.
 */
function joinUrl(req, code) {
  const port = Number(process.env.PORT) || 3000;
  const host = req.get('host') || `localhost:${port}`;
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const lan = lanAddress();
  const target = isLoopback && lan ? `${lan}:${port}` : host;
  const protocol = isLoopback ? 'http' : req.protocol;
  return `${protocol}://${target}/j/${normalise(code)}`;
}

module.exports = { isFree, claim, release, lookup, lanAddress, joinUrl };
