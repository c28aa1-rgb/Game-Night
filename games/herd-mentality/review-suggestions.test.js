'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSuggestions, validateSuggestions } = require('./review-suggestions');

const groups = [
  { id: 'herd-1', answers: [{ playerId: 'p1' }, { playerId: 'p3' }] },
  { id: 'herd-2', answers: [{ playerId: 'p2' }] },
  { id: 'herd-3', answers: [{ playerId: 'p4' }] },
];

test('accepts only disjoint suggestions that merge distinct existing groups', () => {
  const suggestions = validateSuggestions([
    { answerIds: ['p1', 'p2'], reason: 'Both refer to driving.', confidence: 'high' },
    { answerIds: ['p2', 'p4'], reason: 'Overlaps the first suggestion.', confidence: 'medium' },
    { answerIds: ['p3', 'p4'], reason: 'Shares a local group with the first suggestion.', confidence: 'medium' },
    { answerIds: ['p1', 'p3'], reason: 'Already one local group.', confidence: 'high' },
    { answerIds: ['p4', 'missing'], reason: 'Unknown answer.', confidence: 'high' },
  ], groups);
  assert.deepEqual(suggestions, [{
    id: 'ai-1', groupIds: ['herd-1', 'herd-2'], reason: 'Both refer to driving.', confidence: 'high',
  }]);
});

test('returns no suggestions for missing keys, failures, or malformed model output', async () => {
  const input = { question: 'Name a fruit.', answers: [{ id: 'p1', text: 'Apple' }, { id: 'p2', text: 'appple' }] };
  assert.deepEqual(await getSuggestions(input, { apiKey: '' }), []);
  assert.deepEqual(await getSuggestions(input, {
    apiKey: 'test', fetchImpl: async () => ({ ok: false }),
  }), []);
  assert.deepEqual(await getSuggestions(input, {
    apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ output_text: '{bad json' }) }),
  }), []);
  assert.deepEqual(await getSuggestions(input, {
    apiKey: 'test', timeoutMs: 1,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  }), []);
});

test('sends anonymous answer IDs and parses a structured GPT suggestion', async () => {
  let request;
  const suggestions = await getSuggestions({
    question: 'Name something you learn to do.',
    answers: [{ id: 'p1', text: 'Driving' }, { id: 'p2', text: 'Learning to drive' }],
  }, {
    apiKey: 'test',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ suggestions: [
        { answerIds: ['p1', 'p2'], reason: 'Same activity at different stages.', confidence: 'high' },
      ] }) }) };
    },
  });
  assert.equal(request.model, 'gpt-5-nano');
  assert.match(request.input, /p1: Driving/);
  assert.match(request.input, /"death" and "heights".*MUST NOT be merged/);
  assert.doesNotMatch(request.input, /Maya|Leo/);
  assert.deepEqual(suggestions, [{ answerIds: ['p1', 'p2'], reason: 'Same activity at different stages.', confidence: 'high' }]);
});

test('drops anything below high confidence so broad associations never become suggestions', () => {
  const suggestions = validateSuggestions([
    { answerIds: ['p1', 'p2'], reason: 'Both describe fear of mortality.', confidence: 'medium' },
  ], groups);
  assert.deepEqual(suggestions, []);
});
