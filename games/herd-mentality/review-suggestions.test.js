'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('./engine');
const {
  MODEL, REASONING_EFFORT, TIMEOUT_MS, getMergeSets, groupingPrompt, validateMergeSets,
} = require('./review-suggestions');
const evalCases = require('./answer-grouping-evals.json');
const deployedEvalCases = require('./deployed-answer-grouping-evals.json');

const groups = [
  { id: 'herd-1', answers: [{ playerId: 'p1' }, { playerId: 'p3' }] },
  { id: 'herd-2', answers: [{ playerId: 'p2' }] },
  { id: 'herd-3', answers: [{ playerId: 'p4' }] },
];

test('accepts only disjoint merge sets that join distinct existing groups', () => {
  const mergeSets = validateMergeSets([
    { answerIds: ['p1', 'p2'], reason: 'Exact synonym.' },
    { answerIds: ['p2', 'p4'], reason: 'Overlaps the first set.' },
    { answerIds: ['p3', 'p4'], reason: 'Uses an already merged local group.' },
    { answerIds: ['p1', 'p3'], reason: 'Already one local group.' },
    { answerIds: ['p4', 'missing'], reason: 'Unknown answer.' },
  ], groups);
  assert.deepEqual(mergeSets, [{
    id: 'ai-1', answerIds: ['p1', 'p2'], groupIds: ['herd-1', 'herd-2'], reason: 'Exact synonym.',
  }]);
});

test('reports missing keys, API failures, malformed output, and timeout without blocking', async () => {
  const input = { question: 'Name a fruit.', answers: [{ id: 'p1', text: 'Apple' }, { id: 'p2', text: 'appple' }] };
  assert.deepEqual(await getMergeSets(input, { apiKey: '' }), { status: 'unavailable', mergeSets: [] });
  assert.deepEqual(await getMergeSets(input, {
    apiKey: 'test', fetchImpl: async () => ({ ok: false }),
  }), { status: 'api_error', mergeSets: [] });
  assert.deepEqual(await getMergeSets(input, {
    apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ output_text: '{bad json' }) }),
  }), { status: 'invalid_response', mergeSets: [] });
  assert.deepEqual(await getMergeSets(input, {
    apiKey: 'test', timeoutMs: 1,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    })),
  }), { status: 'timeout', mergeSets: [] });
});

test('sends anonymous answers and parses a structured grouping response', async () => {
  let request;
  const result = await getMergeSets({
    question: 'Name something you learn to do.',
    answers: [{ id: 'p1', text: 'Driving' }, { id: 'p2', text: 'Learning to drive' }],
  }, {
    apiKey: 'test',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ mergeSets: [
        { answerIds: ['p1', 'p2'], reason: 'Question supplies the grammar.' },
      ] }) }) };
    },
  });
  assert.equal(request.model, MODEL);
  assert.equal(REASONING_EFFORT, 'low');
  assert.equal(request.reasoning.effort, REASONING_EFFORT);
  assert.equal(TIMEOUT_MS, 6000);
  assert.match(request.input, /p1: Driving/);
  assert.match(request.input, /answers both fit the question is never evidence/);
  assert.doesNotMatch(request.input, /Maya|Leo/);
  assert.deepEqual(result, { status: 'ok', mergeSets: [
    { answerIds: ['p1', 'p2'], reason: 'Question supplies the grammar.' },
  ] });
});

test('prompt encodes measured pairwise grouping regressions', () => {
  const prompt = groupingPrompt('Name something people do while waiting in line.', [
    { id: 'p1', text: 'Listen to music' },
    { id: 'p2', text: 'Play music on headphones' },
    { id: 'p3', text: 'Think' },
    { id: 'p4', text: 'Talk' },
  ]);
  assert.match(prompt, /verify every pair in that group/);
  assert.match(prompt, /Never add a related answer through a chain/);
  assert.match(prompt, /"honesty" \+ "being honest" => merge/);
  assert.match(prompt, /"bed" \+ "my bed" => merge/);
  assert.match(prompt, /"the DMV" \+ "going to the DMV" => merge/);
  assert.match(prompt, /"napping" \+ "taking a nap" => merge/);
  assert.match(prompt, /"sleeping" stays separate/);
  assert.match(prompt, /Do not group all weather answers/);
  assert.match(prompt, /"dog" \+ "golden retriever" => separate/);
  assert.match(prompt, /"eggs" \+ "scrambled eggs" => merge/);
  assert.match(prompt, /"omelette" stays separate/);
  assert.match(prompt, /"a beach day" \+ "going to the beach" => merge/);
  assert.match(prompt, /"summer vacation" stays separate/);
});

test('evaluation corpus covers representative positive and negative grouping cases', () => {
  assert.equal(evalCases.length >= 30, true);
  assert.equal(new Set(evalCases.map((entry) => entry.id)).size, evalCases.length);
  for (const entry of evalCases) {
    assert.match(entry.category, /^[a-z-]+$/);
    assert.equal(entry.answers.length, 4);
    assert.deepEqual(entry.expectedGroups.flat().sort((a, b) => a - b), [0, 1, 2, 3]);
  }
});

test('deployed evaluation corpus targets distinct questions in the real deck', () => {
  const questions = require('./questions.json');
  const questionIds = new Set(questions.map((question) => question.id));
  assert.equal(deployedEvalCases.length >= 20, true);
  assert.equal(new Set(deployedEvalCases.map((entry) => entry.questionId)).size, deployedEvalCases.length);
  for (const entry of deployedEvalCases) {
    assert.equal(questionIds.has(entry.questionId), true, entry.id);
    assert.equal(entry.answers.length, 4);
    assert.deepEqual(entry.expectedGroups.flat().sort((a, b) => a - b), [0, 1, 2, 3]);
  }
});

test('every labeled evaluation partition is compatible with local grouping and validated AI merges', () => {
  for (const entry of evalCases) {
    const room = Engine.createGameState('EVAL');
    room.phase = Engine.PHASES.REVIEW;
    room.submissions = new Map(entry.answers.map((answer, index) => [`a${index}`, answer]));
    room.groups = Engine.buildGroups(room);

    const proposed = entry.expectedGroups
      .filter((indices) => indices.length > 1)
      .map((indices) => ({ answerIds: indices.map((index) => `a${index}`), reason: 'Labeled equivalent answers.' }));
    for (const mergeSet of validateMergeSets(proposed, room.groups)) {
      Engine.mergeGroups(room, mergeSet.groupIds);
    }

    const actual = room.groups
      .map((group) => group.answers.map((answer) => Number(answer.playerId.slice(1))).sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);
    const expected = entry.expectedGroups
      .map((group) => group.slice().sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);
    assert.deepEqual(actual, expected, entry.id);
  }
});
