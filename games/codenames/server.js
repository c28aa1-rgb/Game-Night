/**
 * Codenames' small bridge to the shared host.
 *
 * The game state stays in Firestore and the browser remains its sole client.
 * This file only reserves its short-lived room code in the site's shared join
 * directory and renders the local QR image. That lets its phones enter through
 * the same short /j/CODE address as the Socket.io games without moving any
 * Firebase state into this server.
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

const { app } = require('../../lib/host');
const joinCodes = require('../../lib/join');

const BASE = '/codenames';
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const CODE = /^[A-Z0-9]{4}$/;

function normalise(value) {
  return String(value || '').trim().toUpperCase();
}

function activeCodenamesRoom(code) {
  const room = joinCodes.lookup(code);
  return room?.gameId === 'codenames' ? room : null;
}

/**
 * Reserve a Firebase room code before the client writes the corresponding
 * document. The lease is deliberately the same 24 hours as the document: this
 * server cannot observe Firestore's TTL deletion, so the shared route expires
 * lazily on its next lookup instead.
 */
app.post(`${BASE}/api/join-code`, (req, res) => {
  const code = normalise(req.query.code);
  if (!CODE.test(code)) return res.status(400).json({ error: 'Room codes are four letters or numbers.' });

  const token = crypto.randomUUID();
  const claimed = joinCodes.claim(code, 'codenames', `${BASE}/`, {
    expiresAt: Date.now() + ROOM_TTL_MS,
  });
  if (!claimed) return res.status(409).json({ error: 'That room code is already in use.' });

  // The token is only needed if the following Firestore write fails. It is
  // deliberately not persisted: a server restart already loses all live
  // routes, exactly like the site's other in-memory rooms.
  pendingClaims.set(code, token);
  res.status(201).json({ ok: true, token });
});

/** Release a just-reserved code when its matching Firestore write failed. */
app.delete(`${BASE}/api/join-code`, (req, res) => {
  const code = normalise(req.query.code);
  const token = String(req.query.token || '');
  if (!CODE.test(code) || pendingClaims.get(code) !== token || !activeCodenamesRoom(code)) {
    return res.status(404).json({ error: 'No pending room reservation.' });
  }

  pendingClaims.delete(code);
  joinCodes.release(code);
  res.status(204).end();
});

/** The Firestore document exists now; the temporary rollback token can go. */
app.post(`${BASE}/api/join-code/confirm`, (req, res) => {
  const code = normalise(req.query.code);
  const token = String(req.query.token || '');
  if (!CODE.test(code) || pendingClaims.get(code) !== token || !activeCodenamesRoom(code)) {
    return res.status(404).json({ error: 'No pending room reservation.' });
  }

  pendingClaims.delete(code);
  res.status(204).end();
});

/**
 * QR image endpoint rather than a third-party QR service. `joinUrl` swaps a
 * local TV's loopback host for its LAN address, so phones on the same Wi-Fi can
 * scan the exact same generic route that production uses.
 */
app.get(`${BASE}/api/join-qr`, async (req, res) => {
  const code = normalise(req.query.code);
  if (!CODE.test(code) || !activeCodenamesRoom(code)) return res.sendStatus(404);

  const size = Math.max(120, Math.min(900, Number(req.query.size) || 520));
  try {
    const png = await QRCode.toBuffer(joinCodes.joinUrl(req, code), {
      margin: 1,
      width: size,
      errorCorrectionLevel: 'M',
      color: { dark: '#10161E', light: '#E9E5DB' },
    });
    res.set('Cache-Control', 'private, max-age=300').type('png').send(png);
  } catch {
    res.sendStatus(500);
  }
});

/** Pending reservations exist only during one browser's Firestore write. */
const pendingClaims = new Map();
setInterval(() => {
  for (const [code] of pendingClaims) {
    if (!activeCodenamesRoom(code)) pendingClaims.delete(code);
  }
}, 10 * 60 * 1000).unref();
