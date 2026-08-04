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
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

module.exports = { app, server, io };
