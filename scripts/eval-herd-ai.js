'use strict';

require('dotenv').config();
const Engine = require('../games/herd-mentality/engine');
const evalCases = require('../games/herd-mentality/answer-grouping-evals.json');
const { getMergeSets, validateMergeSets } = require('../games/herd-mentality/review-suggestions');

function normalizePartition(groups) {
  return groups
    .map((group) => group.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

function actualPartition(answers, mergeSets) {
  const room = Engine.createGameState('EVAL');
  room.phase = Engine.PHASES.REVIEW;
  room.submissions = new Map(answers.map((answer, index) => [`a${index}`, answer]));
  room.groups = Engine.buildGroups(room);
  const validated = validateMergeSets(mergeSets, room.groups);
  for (const mergeSet of validated) Engine.mergeGroups(room, mergeSet.groupIds);
  return normalizePartition(room.groups.map((group) => group.answers.map((answer) => Number(answer.playerId.slice(1)))));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run live Herd AI evaluations.');
  }

  const failures = [];
  for (const entry of evalCases) {
    const result = await getMergeSets({
      question: entry.question,
      answers: entry.answers.map((text, index) => ({ id: `a${index}`, text })),
    });
    const actual = actualPartition(entry.answers, result.mergeSets);
    const expected = normalizePartition(entry.expectedGroups);
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${passed ? 'PASS' : 'FAIL'} ${entry.id} (${result.status})`);
    if (!passed) failures.push({ id: entry.id, question: entry.question, answers: entry.answers, expected, actual, mergeSets: result.mergeSets });
  }

  console.log(`\n${evalCases.length - failures.length}/${evalCases.length} cases passed.`);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
