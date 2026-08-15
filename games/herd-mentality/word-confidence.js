'use strict';

const fs = require('fs');
const path = require('path');
const englishWords = new Set(require('word-list-json').map((word) => word.toLocaleLowerCase('en-US')));
const wordNet = require('wordnet-db');

const lexicalConcepts = new Set();
for (const file of ['index.noun', 'index.verb', 'index.adj', 'index.adv']) {
  const entries = fs.readFileSync(path.join(wordNet.path, file), 'utf8').split(/\r?\n/);
  for (const entry of entries) {
    if (!entry || /^\s/.test(entry)) continue;
    const lemma = entry.slice(0, entry.indexOf(' '));
    if (lemma.includes('_')) lexicalConcepts.add(lemma.replaceAll('_', ' ').toLocaleLowerCase('en-US'));
  }
}

function isKnownAnswer(value) {
  return /^[a-z]+$/.test(value) ? englishWords.has(value) : lexicalConcepts.has(value);
}

module.exports = { isKnownAnswer };
