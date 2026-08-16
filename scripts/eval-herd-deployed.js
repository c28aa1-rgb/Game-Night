'use strict';

const { io } = require('socket.io-client');
const evalCases = require('../games/herd-mentality/deployed-answer-grouping-evals.json');

const BASE_URL = process.env.HERD_BASE_URL || 'https://game-night-qnpb.onrender.com';
const NAMESPACE = '/herd-mentality';
const ACK_TIMEOUT_MS = 10000;
const STATE_TIMEOUT_MS = 15000;
const FILLER_ANSWERS = ['aardvark', 'microwave', 'jazz', 'Tuesday'];

function emit(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (error, result) => {
      if (error) reject(error);
      else if (result?.error) reject(new Error(result.error));
      else resolve(result || {});
    });
  });
}

function waitForState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error('Timed out waiting for game state.'));
    }, STATE_TIMEOUT_MS);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('state', onState);
      resolve(state);
    }
    socket.on('state', onState);
  });
}

function normalizePartition(groups) {
  return groups
    .map((group) => group.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

function actualPartition(state, playerIds) {
  return normalizePartition(state.groups.map((group) => group.answers.map((answer) => playerIds.indexOf(answer.playerId))));
}

function samePartition(left, right) {
  return JSON.stringify(normalizePartition(left)) === JSON.stringify(normalizePartition(right));
}

function pairsFromPartition(partition) {
  const pairs = new Set();
  for (const group of partition) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        pairs.add(`${group[left]}:${group[right]}`);
      }
    }
  }
  return pairs;
}

async function connectClient() {
  const socket = io(`${BASE_URL}${NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    timeout: ACK_TIMEOUT_MS,
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => {
      socket.disconnect();
      reject(error);
    });
  });
  return socket;
}

async function splitMergedGroups(host, state) {
  for (const group of state.groups) {
    for (const answer of group.answers.slice(0, -1)) {
      await emit(host, 'review_split_answer', { playerId: answer.playerId });
    }
  }
}

async function main() {
  const byQuestionId = new Map(evalCases.map((entry) => [entry.questionId, entry]));
  const remaining = new Set(byQuestionId.keys());
  const results = [];
  const sockets = await Promise.all(Array.from({ length: 5 }, () => connectClient()));
  const [tv, ...players] = sockets;

  try {
    const { code } = await emit(tv, 'create_room');
    const playerIds = [];
    for (let index = 0; index < players.length; index += 1) {
      const joined = await emit(players[index], 'join_game', { code, name: `Eval ${index + 1}` });
      playerIds.push(joined.playerId);
    }

    const firstQuestion = waitForState(players[0], (state) => state.phase === 'question_open' && state.roundNo === 1);
    await emit(players[0], 'start_game');
    let state = await firstQuestion;

    while (remaining.size) {
      const questionId = state.currentQuestion.id;
      const entry = byQuestionId.get(questionId);
      const answers = entry && remaining.has(questionId) ? entry.answers : FILLER_ANSWERS;
      const answering = waitForState(players[0], (next) => next.phase === 'answering' && next.roundNo === state.roundNo);
      await answering;

      const reveal = waitForState(players[0], (next) => next.phase === 'reveal' && next.roundNo === state.roundNo);
      await Promise.all(players.map((socket, index) => emit(socket, 'submit_answer', { answer: answers[index] })));
      state = await reveal;

      if (entry && remaining.delete(questionId)) {
        const actual = actualPartition(state, playerIds);
        const passed = samePartition(actual, entry.expectedGroups);
        results.push({ id: entry.id, question: state.currentQuestion.text, answers, expected: entry.expectedGroups, actual });
        console.log(`${passed ? 'PASS' : 'FAIL'} ${entry.id} (${results.length}/${evalCases.length})`);
      }

      await splitMergedGroups(players[0], state);
      const nextRound = waitForState(players[0], (next) => next.phase === 'question_open' && next.roundNo === state.roundNo + 1);
      await emit(players[0], 'next_round');
      state = await nextRound;
    }

    const failures = results.filter((entry) => !samePartition(entry.actual, entry.expected));
    let truePositivePairs = 0;
    let proposedPairs = 0;
    let expectedPairs = 0;
    for (const result of results) {
      const actualPairs = pairsFromPartition(result.actual);
      const wantedPairs = pairsFromPartition(result.expected);
      truePositivePairs += [...actualPairs].filter((pair) => wantedPairs.has(pair)).length;
      proposedPairs += actualPairs.size;
      expectedPairs += wantedPairs.size;
    }
    const precision = proposedPairs ? truePositivePairs / proposedPairs : 1;
    const recall = expectedPairs ? truePositivePairs / expectedPairs : 1;
    console.log(`\n${results.length - failures.length}/${results.length} deployed cases passed.`);
    console.log(`Pair precision: ${(precision * 100).toFixed(1)}% | Pair recall: ${(recall * 100).toFixed(1)}%`);
    if (failures.length) {
      console.log(JSON.stringify(failures, null, 2));
      process.exitCode = 1;
    }
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
