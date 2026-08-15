'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('./engine');
const questions = require('./questions.json');
const { isKnownAnswer } = require('./word-confidence');

function roomWithPlayers(count = 4) {
  const room = Engine.createGameState('HERD');
  room.players = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
  }));
  room.hostId = room.players[0].id;
  return room;
}

function answerRound(room, answers) {
  Engine.openAnswering(room);
  answers.forEach((answer, index) => Engine.submitAnswer(room, room.players[index].id, answer));
  Engine.beginReview(room);
  return Engine.scoreRound(room);
}

test('question deck is valid, original-sized, and cycles without repeats', () => {
  assert.equal(Engine.validateQuestions(questions), true);
  assert.equal(questions.length, 96);
  const room = roomWithPlayers();
  const selected = new Set();
  for (let index = 0; index < questions.length; index += 1) {
    const question = Engine.chooseQuestion(room, questions, () => 0);
    assert.equal(selected.has(question.id), false);
    selected.add(question.id);
  }
  assert.equal(selected.size, questions.length);
  assert.doesNotThrow(() => Engine.chooseQuestion(room, questions, () => 0));
});

test('safe normalization handles presentation variants without semantic guessing', () => {
  assert.equal(Engine.normalizeAnswer('  The APPLES!! '), 'apple');
  assert.equal(Engine.normalizeAnswer('Berries'), 'berry');
  assert.equal(Engine.normalizeAnswer("Rock ’n’ Roll"), 'rock n roll');
  assert.equal(Engine.normalizeAnswer('Class'), 'class');
  assert.notEqual(Engine.normalizeAnswer('couch'), Engine.normalizeAnswer('sofa'));
});

test('clean dictionary words can skip host review', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  Engine.openAnswering(room);
  ['Apples', 'orange', 'Pear', 'pizza'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room, isKnownAnswer);
  assert.equal(Engine.needsHostReview(room), false);
  assert.deepEqual(room.reviewIssues, []);
});

test('known compounds pass while ambiguous phrases and typos pause for review', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  Engine.openAnswering(room);
  ['Apple', 'appple', 'Ice cream', 'Snowy winter'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room, isKnownAnswer);
  assert.equal(Engine.needsHostReview(room), true);
  assert.deepEqual(room.reviewIssues, [
    { playerId: 'p2', reason: 'unknown_word' },
    { playerId: 'p4', reason: 'ambiguous_phrase' },
  ]);
});

test('match requires 4 players and supports a full 12-player room', () => {
  assert.throws(() => Engine.startMatch(roomWithPlayers(3), questions), /needs 4 players/);
  const full = roomWithPlayers(12);
  Engine.startMatch(full, questions, () => 0);
  assert.equal(full.phase, Engine.PHASES.QUESTION_OPEN);
  assert.equal(Object.keys(full.scores).length, 12);
  assert.equal(full.targetScore, 8);
});

test('the unique majority earns cows and the sole odd answer takes the Pink Cow', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  const result = answerRound(room, ['Apple', 'apple', 'The apples', 'Orange']);
  assert.deepEqual(result.awardedPlayerIds, ['p1', 'p2', 'p3']);
  assert.equal(result.oddPlayerId, 'p4');
  assert.equal(room.pinkCowHolderId, 'p4');
  assert.deepEqual(room.scores, { p1: 1, p2: 1, p3: 1, p4: 0 });
  assert.equal(room.phase, Engine.PHASES.REVEAL);
});

test('multiple unique answers do not move the Pink Cow', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  room.pinkCowHolderId = 'p1';
  const result = answerRound(room, ['Apple', 'Apple', 'Orange', 'Pear']);
  assert.deepEqual(result.awardedPlayerIds, ['p1', 'p2']);
  assert.equal(result.oddPlayerId, null);
  assert.equal(room.pinkCowHolderId, 'p1');
});

test('an evenly split top answer awards no cows and does not move the Pink Cow', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  room.pinkCowHolderId = 'p4';
  const result = answerRound(room, ['Apple', 'Apple', 'Pear', 'Pear']);
  assert.equal(result.tied, true);
  assert.deepEqual(result.awardedPlayerIds, []);
  assert.equal(result.oddPlayerId, null);
  assert.equal(room.pinkCowHolderId, 'p4');
  assert.deepEqual(room.scores, { p1: 0, p2: 0, p3: 0, p4: 0 });
});

test('when everyone agrees, everyone earns a cow and nobody takes the Pink Cow', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  const result = answerRound(room, ['Pizza', 'pizza', 'The pizza', 'pizzas']);
  assert.deepEqual(result.awardedPlayerIds, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(result.oddPlayerId, null);
  assert.equal(room.pinkCowHolderId, null);
});

test('host review can merge synonyms and split an over-grouped answer', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  Engine.openAnswering(room);
  ['Couch', 'Sofa', 'Sofas', 'Chair'].forEach((answer, index) => Engine.submitAnswer(room, `p${index + 1}`, answer));
  Engine.beginReview(room);
  assert.equal(room.groups.length, 3);
  const couch = room.groups.find((group) => group.canonical === 'couch');
  const sofa = room.groups.find((group) => group.canonical === 'sofa');
  Engine.mergeGroups(room, [couch.id, sofa.id]);
  assert.equal(room.groups.length, 2);
  assert.equal(room.groups.find((group) => group.id === couch.id).answers.length, 3);
  Engine.splitAnswer(room, 'p3');
  assert.equal(room.groups.length, 3);
  assert.equal(room.groups.find((group) => group.answers[0].playerId === 'p3').answers.length, 1);
});

test('a reveal merge recalculates scores while preserving every submitted answer', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  const result = answerRound(room, ['Driving', 'Learning to drive', 'Driving', 'Pizza']);
  assert.deepEqual(result.awardedPlayerIds, ['p1', 'p3']);
  const driving = room.groups.find((group) => group.answers.some((answer) => answer.rawAnswer === 'Driving'));
  const learning = room.groups.find((group) => group.answers.some((answer) => answer.rawAnswer === 'Learning to drive'));
  Engine.mergeGroups(room, [driving.id, learning.id]);
  const rescored = Engine.rescoreRevealedRound(room);
  assert.deepEqual(rescored.awardedPlayerIds.slice().sort(), ['p1', 'p2', 'p3']);
  assert.equal(room.groups.find((group) => group.id === driving.id).answers.map((answer) => answer.rawAnswer).join(', '), 'Driving, Driving, Learning to drive');
  assert.deepEqual(room.scores, { p1: 1, p2: 1, p3: 1, p4: 0 });
});

test('a Pink Cow holder can earn cows but cannot win', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  room.scores = { p1: 7, p2: 0, p3: 0, p4: 0 };
  room.pinkCowHolderId = 'p1';
  answerRound(room, ['Apple', 'Apple', 'Pear', 'Orange']);
  assert.equal(room.scores.p1, 8);
  assert.deepEqual(room.winnerIds, []);
  assert.equal(room.pinkCowHolderId, 'p1');

  Engine.startRound(room, questions, () => 0);
  answerRound(room, ['Apple', 'Apple', 'Apple', 'Pear']);
  assert.equal(room.pinkCowHolderId, 'p4');
  assert.deepEqual(room.winnerIds, ['p1']);
  assert.equal(room.phase, Engine.PHASES.GAME_OVER);
});

test('players tied at the winning score push the target up until one leads', () => {
  const room = roomWithPlayers();
  Engine.startMatch(room, questions, () => 0);
  room.scores = { p1: 7, p2: 7, p3: 0, p4: 0 };
  answerRound(room, ['Apple', 'Apple', 'Pear', 'Orange']);
  assert.deepEqual(room.winnerIds, []);
  assert.equal(room.targetScore, 9);
  assert.equal(room.phase, Engine.PHASES.REVEAL);

  Engine.startRound(room, questions, () => 0);
  answerRound(room, ['Apple', 'Pear', 'Apple', 'Orange']);
  assert.deepEqual(room.winnerIds, ['p1']);
  assert.equal(room.scores.p1, 9);
  assert.equal(room.phase, Engine.PHASES.GAME_OVER);
});

test('high-player-count scoring handles 12 answers and a single odd player', () => {
  const room = roomWithPlayers(12);
  Engine.startMatch(room, questions, () => 0);
  const answers = Array.from({ length: 12 }, (_, index) => index === 11 ? 'Pear' : 'Apple');
  const result = answerRound(room, answers);
  assert.equal(result.awardedPlayerIds.length, 11);
  assert.equal(result.oddPlayerId, 'p12');
  assert.equal(room.pinkCowHolderId, 'p12');
});

test('review can close with missing players for host recovery', () => {
  const room = roomWithPlayers(5);
  Engine.startMatch(room, questions, () => 0);
  Engine.openAnswering(room);
  Engine.submitAnswer(room, 'p1', 'Apple');
  Engine.submitAnswer(room, 'p2', 'Apple');
  Engine.submitAnswer(room, 'p3', 'Pear');
  assert.doesNotThrow(() => Engine.beginReview(room));
  const result = Engine.scoreRound(room);
  assert.deepEqual(result.answeredPlayerIds, ['p1', 'p2', 'p3']);
  assert.deepEqual(result.awardedPlayerIds, ['p1', 'p2']);
});
