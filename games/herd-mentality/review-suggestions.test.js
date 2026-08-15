'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODEL, getMergeSets, groupingPrompt, validateMergeSets } = require('./review-suggestions');
const evalCases = require('./answer-grouping-evals.json');

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
  assert.equal(request.reasoning.effort, 'low');
  assert.match(request.input, /p1: Driving/);
  assert.match(request.input, /both answer the question is NEVER evidence/);
  assert.doesNotMatch(request.input, /Maya|Leo/);
  assert.deepEqual(result, { status: 'ok', mergeSets: [
    { answerIds: ['p1', 'p2'], reason: 'Question supplies the grammar.' },
  ] });
});

test('prompt encodes measured broad-merge regressions', () => {
  const prompt = groupingPrompt('Name something people do while waiting in line.', [
    { id: 'p1', text: 'Listen to music' },
    { id: 'p2', text: 'Play music on headphones' },
    { id: 'p3', text: 'Think' },
    { id: 'p4', text: 'Talk' },
  ]);
  assert.match(prompt, /"listen to music" \+ "play music on headphones" may merge/);
  assert.match(prompt, /"think" and "talk" stay separate/);
  assert.match(prompt, /"death" \+ "heights" => separate/);
  assert.match(prompt, /"dog" \+ "golden retriever" => separate/);
});

test('evaluation corpus covers representative positive and negative grouping cases', () => {
  assert.equal(evalCases.length >= 12, true);
  assert.equal(new Set(evalCases.map((entry) => entry.id)).size, evalCases.length);
  for (const entry of evalCases) {
    assert.equal(entry.answers.length, 4);
    assert.deepEqual(entry.expectedGroups.flat().sort((a, b) => a - b), [0, 1, 2, 3]);
  }
});
