'use strict';

/**
 * Express bridge for Karaoke's dependency-free room server.
 *
 * The registry serves the built client from games/karaoke/static. The original
 * ESM server owns /karaoke-api, including room state and the server-side
 * YouTube search proxy.
 */

const { app } = require('../../lib/host');

const karaoke = import('./source/server/karaoke.mjs')
  .then(({ createKaraoke }) => createKaraoke())
  .catch((error) => {
    console.error('Karaoke failed to initialize:', error);
    throw error;
  });

app.use(async (req, res, next) => {
  try {
    const instance = await karaoke;
    if (!(await instance.handle(req, res))) next();
  } catch (error) {
    next(error);
  }
});

module.exports = {};
