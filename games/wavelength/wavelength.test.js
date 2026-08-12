'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const wavelength = require('./server');

const { activeSession, newRoom, pointsFor, privateState, publicState } = wavelength._test;

test('score bands wrap across the two bottom corners', () => {
  assert.deepEqual(pointsFor(60, 0), { points: 4, band: 'center' });
  assert.deepEqual(pointsFor(57, 0), { points: 3, band: 'inner' });
  assert.deepEqual(pointsFor(54, 0), { points: 2, band: 'outer' });
  assert.deepEqual(pointsFor(0, 60), { points: 4, band: 'center' });
});

test('four phone seats keep clue targets private from guessing phones', () => {
  const room = newRoom();
  const clue = { token: 'clue-token', socketId: 'clue-socket', team: 0, role: 'clue' };
  const guess = { token: 'guess-token', socketId: 'guess-socket', team: 0, role: 'guess' };
  room.teams[0].clue = clue;
  room.teams[0].guess = guess;
  room.phase = 'clue';
  room.activeTeam = 0;
  room.targetIndex = 0;

  assert.equal(activeSession(room, clue.socketId), clue);
  assert.equal(privateState(room, clue).targetIndex, 0);
  assert.equal(privateState(room, guess).targetIndex, null);
  assert.equal(privateState(room, clue).canSkip, true);
  assert.equal(privateState(room, guess).canSkip, false);
  assert.equal(publicState(room).teams[0].connected, true);
});
