'use strict';

const PHASES = Object.freeze({
  LOBBY: 'lobby',
  QUESTION_OPEN: 'question_open',
  ANSWERING: 'answering',
  REVIEW: 'review',
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
});

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const WINNING_SCORE = 8;
const MAX_ANSWER_LENGTH = 80;

function shuffled(items, random = Math.random) {
  const output = items.slice();
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 20) {
    throw new Error('Herd Mentality needs at least 20 questions.');
  }
  const ids = new Set();
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !question.id.trim()) {
      throw new Error('Every question needs an id.');
    }
    if (ids.has(question.id)) throw new Error(`Duplicate question id: ${question.id}`);
    ids.add(question.id);
    if (typeof question.text !== 'string' || !question.text.trim()) {
      throw new Error(`${question.id} needs question text.`);
    }
  }
  return true;
}

function createGameState(code) {
  return {
    code,
    phase: PHASES.LOBBY,
    players: [],
    hostId: null,
    roundNo: 0,
    targetScore: WINNING_SCORE,
    scores: {},
    pinkCowHolderId: null,
    currentQuestion: null,
    submissions: new Map(),
    groups: [],
    reviewIssues: [],
    roundResult: null,
    winnerIds: [],
    history: [],
    usedQuestionIds: new Set(),
  };
}

function enabledQuestions(questions) {
  return questions.filter((question) => question.enabled !== false);
}

function chooseQuestion(room, questions, random = Math.random) {
  validateQuestions(questions);
  const enabled = enabledQuestions(questions);
  if (!enabled.length) throw new Error('No questions are enabled.');
  let available = enabled.filter((question) => !room.usedQuestionIds.has(question.id));
  if (!available.length) {
    room.usedQuestionIds.clear();
    available = enabled;
  }
  const question = available[Math.floor(random() * available.length)];
  room.usedQuestionIds.add(question.id);
  return { id: question.id, text: question.text, tags: question.tags || [] };
}

function startMatch(room, questions, random = Math.random) {
  if (room.players.length < MIN_PLAYERS) throw new Error(`Herd Mentality needs ${MIN_PLAYERS} players.`);
  if (room.players.length > MAX_PLAYERS) throw new Error(`Herd Mentality supports at most ${MAX_PLAYERS} players.`);
  room.scores = Object.fromEntries(room.players.map((player) => [player.id, 0]));
  room.roundNo = 0;
  room.targetScore = WINNING_SCORE;
  room.pinkCowHolderId = null;
  room.winnerIds = [];
  room.history = [];
  room.usedQuestionIds = new Set();
  return startRound(room, questions, random);
}

function startRound(room, questions, random = Math.random) {
  if (room.phase === PHASES.GAME_OVER) throw new Error('The match is over.');
  room.roundNo += 1;
  room.phase = PHASES.QUESTION_OPEN;
  room.currentQuestion = chooseQuestion(room, questions, random);
  room.submissions = new Map();
  room.groups = [];
  room.reviewIssues = [];
  room.roundResult = null;
  return room;
}

function openAnswering(room) {
  if (room.phase !== PHASES.QUESTION_OPEN) throw new Error('The question is not opening.');
  room.phase = PHASES.ANSWERING;
  return room;
}

function normalizeAnswer(value) {
  let answer = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:a|an|the)\s+/, '');

  // Only singularize an uncomplicated one-word answer. Broader stemming would
  // silently merge genuinely different ideas and belongs in host review.
  if (/^[a-z]{4,}$/.test(answer) && !/(?:ss|us|is)$/.test(answer)) {
    if (/ies$/.test(answer) && answer.length > 4) answer = `${answer.slice(0, -3)}y`;
    else if (/s$/.test(answer)) answer = answer.slice(0, -1);
  }
  return answer;
}

function submitAnswer(room, playerId, rawAnswer) {
  if (room.phase !== PHASES.ANSWERING) throw new Error('Answers are closed.');
  if (!room.players.some((player) => player.id === playerId)) throw new Error('Unknown player.');
  const answer = String(rawAnswer || '').trim().replace(/\s+/g, ' ').slice(0, MAX_ANSWER_LENGTH);
  if (!answer) throw new Error('Write an answer first.');
  room.submissions.set(playerId, answer);
  return room.submissions.size;
}

function buildGroups(room) {
  const byCanonical = new Map();
  for (const [playerId, rawAnswer] of room.submissions) {
    const canonical = normalizeAnswer(rawAnswer) || rawAnswer.toLocaleLowerCase('en-US');
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical).push({ playerId, rawAnswer });
  }
  return Array.from(byCanonical, ([canonical, answers], index) => ({
    id: `herd-${index + 1}`,
    canonical,
    answers,
  }));
}

function findReviewIssues(room, isKnownWord = () => false) {
  const issues = [];
  for (const [playerId, rawAnswer] of room.submissions) {
    const canonical = normalizeAnswer(rawAnswer);
    if (!canonical || !isKnownWord(canonical)) {
      issues.push({ playerId, reason: canonical.includes(' ') ? 'ambiguous_phrase' : 'unknown_word' });
    }
  }
  return issues;
}

function needsHostReview(room) {
  return room.reviewIssues.length > 0;
}

function beginReview(room, isKnownWord) {
  if (room.phase !== PHASES.ANSWERING) throw new Error('Answers are not open.');
  if (room.submissions.size < 2) throw new Error('At least two answers are needed to review the round.');
  room.groups = buildGroups(room);
  room.reviewIssues = findReviewIssues(room, isKnownWord);
  room.phase = PHASES.REVIEW;
  return room.groups;
}

function mergeGroups(room, groupIds) {
  if (room.phase !== PHASES.REVIEW) throw new Error('The round is not in review.');
  const ids = Array.from(new Set(groupIds || []));
  if (ids.length < 2) throw new Error('Choose at least two answer groups to merge.');
  const selected = room.groups.filter((group) => ids.includes(group.id));
  if (selected.length !== ids.length) throw new Error('One of those answer groups is gone.');
  const merged = {
    id: selected[0].id,
    canonical: selected[0].canonical,
    answers: selected.flatMap((group) => group.answers),
  };
  const selectedIds = new Set(ids);
  const insertAt = room.groups.findIndex((group) => selectedIds.has(group.id));
  room.groups = room.groups.filter((group) => !selectedIds.has(group.id));
  room.groups.splice(insertAt, 0, merged);
  return merged;
}

function splitAnswer(room, playerId) {
  if (room.phase !== PHASES.REVIEW) throw new Error('The round is not in review.');
  const groupIndex = room.groups.findIndex((group) => group.answers.some((entry) => entry.playerId === playerId));
  if (groupIndex < 0) throw new Error('That answer is gone.');
  const group = room.groups[groupIndex];
  if (group.answers.length < 2) throw new Error('That answer is already on its own.');
  const answer = group.answers.find((entry) => entry.playerId === playerId);
  group.answers = group.answers.filter((entry) => entry.playerId !== playerId);
  room.groups.splice(groupIndex + 1, 0, {
    id: `herd-split-${playerId}`,
    canonical: normalizeAnswer(answer.rawAnswer) || answer.rawAnswer.toLocaleLowerCase('en-US'),
    answers: [answer],
  });
  return answer;
}

function scoreRound(room) {
  if (room.phase !== PHASES.REVIEW) throw new Error('Review the answer groups first.');
  if (!room.groups.length) throw new Error('There are no answers to score.');

  const sizes = room.groups.map((group) => group.answers.length);
  const largest = Math.max(...sizes);
  const leaders = room.groups.filter((group) => group.answers.length === largest);
  const hasMajority = leaders.length === 1;
  const majority = hasMajority ? leaders[0] : null;
  const awardedPlayerIds = majority ? majority.answers.map((entry) => entry.playerId) : [];
  for (const playerId of awardedPlayerIds) room.scores[playerId] = (room.scores[playerId] || 0) + 1;

  const uniqueGroups = room.groups.filter((group) => group.answers.length === 1);
  const oddPlayerId = hasMajority && uniqueGroups.length === 1
    ? uniqueGroups[0].answers[0].playerId
    : null;
  const previousPinkCowHolderId = room.pinkCowHolderId;
  if (oddPlayerId) room.pinkCowHolderId = oddPlayerId;

  const eligible = room.players.filter((player) => (
    (room.scores[player.id] || 0) >= room.targetScore && player.id !== room.pinkCowHolderId
  ));
  const eligibleHigh = eligible.length
    ? Math.max(...eligible.map((player) => room.scores[player.id] || 0))
    : 0;
  const eligibleLeaders = eligible.filter((player) => (room.scores[player.id] || 0) === eligibleHigh);

  if (eligibleLeaders.length === 1) {
    room.winnerIds = [eligibleLeaders[0].id];
  } else if (eligibleLeaders.length > 1) {
    room.targetScore = eligibleHigh + 1;
  }

  room.roundResult = {
    majorityGroupId: majority?.id || null,
    awardedPlayerIds,
    oddPlayerId,
    previousPinkCowHolderId,
    pinkCowHolderId: room.pinkCowHolderId,
    tied: !hasMajority,
    answeredPlayerIds: Array.from(room.submissions.keys()),
  };
  room.history.push({
    round: room.roundNo,
    question: { ...room.currentQuestion },
    groups: room.groups.map((group) => ({
      id: group.id,
      canonical: group.canonical,
      answers: group.answers.map((answer) => ({ ...answer })),
    })),
    result: { ...room.roundResult, awardedPlayerIds: awardedPlayerIds.slice() },
    scores: { ...room.scores },
    targetScore: room.targetScore,
  });
  room.phase = room.winnerIds.length ? PHASES.GAME_OVER : PHASES.REVEAL;
  return room.roundResult;
}

module.exports = {
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  WINNING_SCORE,
  MAX_ANSWER_LENGTH,
  validateQuestions,
  createGameState,
  chooseQuestion,
  startMatch,
  startRound,
  openAnswering,
  normalizeAnswer,
  submitAnswer,
  buildGroups,
  findReviewIssues,
  needsHostReview,
  beginReview,
  mergeGroups,
  splitAnswer,
  scoreRound,
  shuffled,
};
