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

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run live Herd AI evaluations.');
  }

  const failures = [];
  const categoryResults = new Map();
  let truePositivePairs = 0;
  let proposedPairs = 0;
  let expectedPairs = 0;
  for (const entry of evalCases) {
    const result = await getMergeSets({
      question: entry.question,
      answers: entry.answers.map((text, index) => ({ id: `a${index}`, text })),
    });
    const actual = actualPartition(entry.answers, result.mergeSets);
    const expected = normalizePartition(entry.expectedGroups);
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    const actualPairs = pairsFromPartition(actual);
    const wantedPairs = pairsFromPartition(expected);
    truePositivePairs += [...actualPairs].filter((pair) => wantedPairs.has(pair)).length;
    proposedPairs += actualPairs.size;
    expectedPairs += wantedPairs.size;
    const category = categoryResults.get(entry.category) || { passed: 0, total: 0 };
    category.passed += Number(passed);
    category.total += 1;
    categoryResults.set(entry.category, category);
    console.log(`${passed ? 'PASS' : 'FAIL'} ${entry.id} (${result.status})`);
    if (!passed) failures.push({
      id: entry.id,
      category: entry.category,
      question: entry.question,
      answers: entry.answers,
      expected,
      actual,
      falseMerges: [...actualPairs].filter((pair) => !wantedPairs.has(pair)),
      missedMerges: [...wantedPairs].filter((pair) => !actualPairs.has(pair)),
      mergeSets: result.mergeSets,
    });
  }

  const precision = proposedPairs ? truePositivePairs / proposedPairs : 1;
  const recall = expectedPairs ? truePositivePairs / expectedPairs : 1;
  console.log(`\n${evalCases.length - failures.length}/${evalCases.length} exact cases passed.`);
  console.log(`Pair precision: ${(precision * 100).toFixed(1)}% | Pair recall: ${(recall * 100).toFixed(1)}%`);
  console.log('By category:');
  for (const [category, result] of [...categoryResults].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${category}: ${result.passed}/${result.total}`);
  }
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
