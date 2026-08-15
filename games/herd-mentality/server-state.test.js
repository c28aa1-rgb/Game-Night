'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('./engine');
const Server = require('./server');

function player(id, name, socketId = id) {
  return { id, name, socketId, connected: true };
}

test('public state never exposes answer text before reveal', () => {
  const room = Server.createRoom();
  room.players = [player('p1', 'Host'), player('p2', 'Maya'), player('p3', 'Leo'), player('p4', 'Nora')];
  room.hostId = 'p1';
  room.phase = Engine.PHASES.ANSWERING;
  room.currentQuestion = { id: 'q-test', text: 'Name a fruit.' };
  room.submissions.set('p1', 'Apple');
  room.submissions.set('p2', 'Pear');

  const answering = Server.publicState(room);
  assert.equal(answering.submissionsIn, 2);
  assert.deepEqual(answering.groups, []);
  assert.equal(JSON.stringify(answering).includes('Apple'), false);
  assert.equal(JSON.stringify(answering).includes('Pear'), false);

  Engine.beginReview(room);
  const review = Server.publicState(room);
  assert.equal(review.answerGroupCount, 2);
  assert.deepEqual(review.groups, []);
  assert.equal(JSON.stringify(review).includes('Apple'), false);

  const hostPrivate = Server.privateState(room, room.players[0]);
  const guestPrivate = Server.privateState(room, room.players[1]);
  assert.equal(hostPrivate.reviewGroups.length, 2);
  assert.equal(hostPrivate.reviewGroups[0].answers[0].rawAnswer, 'Apple');
  assert.deepEqual(guestPrivate.reviewGroups, []);
  assert.equal(guestPrivate.myAnswer, 'Pear');
  Server.dropRoom(room.code);
});

test('answer groups and player names become public only after scoring', () => {
  const room = Server.createRoom();
  room.players = [player('p1', 'Host'), player('p2', 'Maya'), player('p3', 'Leo'), player('p4', 'Nora')];
  room.hostId = 'p1';
  room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };
  room.phase = Engine.PHASES.ANSWERING;
  room.currentQuestion = { id: 'q-test', text: 'Name a fruit.' };
  Engine.submitAnswer(room, 'p1', 'Apple');
  Engine.submitAnswer(room, 'p2', 'Apple');
  Engine.submitAnswer(room, 'p3', 'Apple');
  Engine.submitAnswer(room, 'p4', 'Pear');
  Engine.beginReview(room);
  Engine.scoreRound(room);

  const revealed = Server.publicState(room);
  assert.equal(revealed.phase, Engine.PHASES.REVEAL);
  assert.equal(revealed.groups.length, 2);
  assert.equal(revealed.groups[0].answers[0].playerName, 'Host');
  assert.equal(revealed.roundResult.oddPlayerId, 'p4');
  Server.dropRoom(room.code);
});
