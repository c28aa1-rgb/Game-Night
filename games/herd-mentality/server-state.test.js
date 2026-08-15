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
  assert.deepEqual(hostPrivate.reviewGroups, []);
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

test('answers stay open for sixty seconds before the server skips to review', () => {
  assert.equal(Server.ANSWER_MS, 60000);
});

test('validated AI grouping is applied automatically before reveal and scoring', async () => {
  const room = Server.createRoom();
  room.players = [player('p1', 'Host'), player('p2', 'Maya'), player('p3', 'Leo'), player('p4', 'Nora')];
  room.hostId = 'p1';
  room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };
  room.phase = Engine.PHASES.ANSWERING;
  room.roundNo = 1;
  room.currentQuestion = { id: 'q-test', text: 'Name a fruit.' };
  ['Apple', 'appple', 'Pear', 'Orange'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room);
  room.reviewPending = true;

  await Server.requestAutomaticGrouping(room, {
    getMergeSetsImpl: async () => ({ status: 'ok', mergeSets: [
      { answerIds: ['p1', 'p2'], reason: 'Spelling variant.' },
    ] }),
  });

  assert.equal(room.phase, Engine.PHASES.REVEAL);
  assert.equal(room.groups.length, 3);
  assert.deepEqual(room.roundResult.awardedPlayerIds, ['p1', 'p2']);
  assert.equal(room.reviewPending, false);
  Server.dropRoom(room.code);
});

test('AI failure falls back to conservative local groups and still reveals', async () => {
  const room = Server.createRoom();
  room.players = [player('p1', 'Host'), player('p2', 'Maya'), player('p3', 'Leo'), player('p4', 'Nora')];
  room.hostId = 'p1';
  room.scores = { p1: 0, p2: 0, p3: 0, p4: 0 };
  room.phase = Engine.PHASES.ANSWERING;
  room.roundNo = 1;
  room.currentQuestion = { id: 'q-test', text: 'Name a fruit.' };
  ['Apple', 'appple', 'Pear', 'Orange'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room);

  await Server.requestAutomaticGrouping(room, {
    getMergeSetsImpl: async () => ({ status: 'timeout', mergeSets: [] }),
  });

  assert.equal(room.phase, Engine.PHASES.REVEAL);
  assert.equal(room.groups.length, 4);
  assert.equal(room.roundResult.tied, true);
  Server.dropRoom(room.code);
});

test('winning rounds remain revealed until the correction window closes', () => {
  const room = Server.createRoom();
  room.players = [player('p1', 'Host'), player('p2', 'Maya'), player('p3', 'Leo'), player('p4', 'Nora')];
  room.hostId = 'p1';
  room.scores = { p1: 7, p2: 0, p3: 0, p4: 0 };
  room.phase = Engine.PHASES.ANSWERING;
  room.roundNo = 1;
  room.currentQuestion = { id: 'q-test', text: 'Name a fruit.' };
  ['Apple', 'Apple', 'Pear', 'Orange'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room);
  Engine.scoreRound(room);
  assert.equal(room.phase, Engine.PHASES.REVEAL);
  assert.deepEqual(room.winnerIds, ['p1']);
  Server.advanceAfterReveal(room);
  assert.equal(room.phase, Engine.PHASES.GAME_OVER);
  Server.dropRoom(room.code);
});
