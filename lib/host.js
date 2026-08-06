/**
 * The shared HTTP host every game hangs off.
 *
 * Games that need a live server process (Hitster) require this module to get
 * the one Express app, HTTP server and Socket.io instance for the whole site,
 * instead of creating their own. It lives in its own module so that requiring
 * a game registers its routes on the same app no matter what order the
 * registry loads things in.
 */

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();

/*
 * Render — and any other host that terminates TLS in front of the process —
 * forwards the original scheme in x-forwarded-proto and speaks plain HTTP to
 * us. Without this, req.protocol reports 'http' on a site served over https,
 * and both games encode an http:// address into the join QR code that every
 * phone in the room is about to scan.
 */
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

module.exports = { app, server, io };
