'use strict';

const { io } = require('socket.io-client');

const origin = String(process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const holdArgument = process.argv.find((argument) => argument.startsWith('--hold='));
const holdMs = Math.max(0, Number(holdArgument?.slice('--hold='.length)) || 0);
const scenarioArgument = process.argv.find((argument) => argument.startsWith('--scenario='));
const scenario = scenarioArgument?.slice('--scenario='.length) || 'typo';
let answers = process.argv.slice(3).filter((argument) => !argument.startsWith('--'));

function domainFor(question) {
  const text = question.toLowerCase();
  if (/food|toast|fruit|vegetable|pizza|snack|cheese|breakfast|ice cream/.test(text)) return 'food';
  if (/animal|swimming/.test(text)) return 'animal';
  if (/house|home|room|drawer|household|carpet/.test(text)) return 'home';
  if (/place|somewhere|seat|theater|sunset|shoes/.test(text)) return 'place';
  if (/song|movie|game|instrument|band|story|talent|road trip|hobby/.test(text)) return 'entertainment';
  if (/weather|picnic|nature|outdoor|beach|tent|season|campfire|summer|walk/.test(text)) return 'outdoors';
  if (/afraid/.test(text)) return 'fear';
  if (/friend|quality|people|parents|children|grandparents|teammate|eighteen/.test(text)) return 'people';
  return 'everyday';
}

function answersFor(question, kind) {
  const domain = domainFor(question);
  const sets = {
    food: { typo: ['Pizza', 'piza', 'Burger', 'Tacos'], synonym: ['French fries', 'Fries', 'Pizza', 'Tacos'], distinct: ['Pizza', 'Burger', 'Tacos', 'Salad'] },
    animal: { typo: ['Dog', 'dgo', 'Cat', 'Horse'], synonym: ['Dog', 'Canine', 'Cat', 'Horse'], distinct: ['Dog', 'Cat', 'Horse', 'Cow'] },
    home: { typo: ['Couch', 'couchh', 'Table', 'Keys'], synonym: ['Couch', 'Sofa', 'Table', 'Keys'], distinct: ['Couch', 'Chair', 'Bed', 'Table'] },
    place: { typo: ['Beach', 'beech', 'Park', 'Library'], synonym: ['Movie theater', 'Cinema', 'Beach', 'Park'], distinct: ['Beach', 'Ocean', 'Mountain', 'Park'] },
    entertainment: { typo: ['Movie', 'moive', 'Music', 'Game'], synonym: ['Movie', 'Film', 'Music', 'Game'], distinct: ['Movie', 'Music', 'Game', 'Book'] },
    outdoors: { typo: ['Rain', 'rian', 'Sun', 'Snow'], synonym: ['Sun', 'Sunshine', 'Rain', 'Snow'], distinct: ['Rain', 'Snow', 'Wind', 'Heat'] },
    fear: { typo: ['Death', 'deatth', 'Heights', 'Spiders'], synonym: ['Death', 'Dying', 'Heights', 'Spiders'], distinct: ['Death', 'Heights', 'Spiders', 'Darkness'] },
    people: { typo: ['Honesty', 'honsety', 'Kindness', 'Loyalty'], synonym: ['Honesty', 'Being honest', 'Kindness', 'Loyalty'], distinct: ['Honesty', 'Kindness', 'Loyalty', 'Humor'] },
    everyday: { typo: ['Phone', 'phoen', 'Keys', 'Wallet'], synonym: ['Phone', 'Cell phone', 'Keys', 'Wallet'], distinct: ['Phone', 'Keys', 'Wallet', 'Door'] },
  };
  return sets[domain][kind] || sets[domain].typo;
}

function connect() {
  const socket = io(`${origin}/herd-mentality`, { transports: ['websocket'], timeout: 15000 });
  socket.on('state', (state) => { socket.latestState = state; });
  socket.on('private_state', (state) => { socket.latestPrivateState = state; });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(15000).emit(event, payload, (error, result) => {
      if (error) reject(error);
      else if (result?.error) reject(new Error(result.error));
      else resolve(result || {});
    });
  });
}

function waitForState(socket, predicate, timeoutMs = 20000) {
  if (socket.latestState && predicate(socket.latestState)) return Promise.resolve(socket.latestState);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error(`Timed out after ${timeoutMs}ms; last phase was ${socket.latestState?.phase || 'unknown'}.`));
    }, timeoutMs);
    timeout.unref?.();
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off('state', onState);
      resolve(state);
    }
    socket.on('state', onState);
  });
}

function waitForPrivateState(socket, predicate, timeoutMs = 20000) {
  if (socket.latestPrivateState && predicate(socket.latestPrivateState)) return Promise.resolve(socket.latestPrivateState);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('private_state', onState);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for private state.`));
    }, timeoutMs);
    timeout.unref?.();
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off('private_state', onState);
      resolve(state);
    }
    socket.on('private_state', onState);
  });
}

async function main() {
  const sockets = [];
  try {
    const tv = await connect();
    sockets.push(tv);
    const { code } = await emitAck(tv, 'register_tv');
    const runId = Date.now().toString(36).slice(-5);
    const players = [];
    for (let index = 0; index < 4; index += 1) {
      const socket = await connect();
      sockets.push(socket);
      await emitAck(socket, 'join_game', { code, name: `Eval ${runId}-${index + 1}` });
      players.push(socket);
    }

    const answering = waitForState(tv, (state) => state.phase === 'answering');
    await emitAck(players[0], 'start_game');
    const openState = await answering;
    if (answers.length !== 4) answers = answersFor(openState.currentQuestion.text, scenario);
    const revealed = waitForState(tv, (state) => state.phase === 'reveal');
    const legacyReview = waitForPrivateState(players[0], (state) => (
      players[0].latestState?.phase === 'review' && state.reviewPending === false
    ));
    await Promise.all(players.map((socket, index) => emitAck(socket, 'submit_answer', { answer: answers[index] })));
    const firstOutcome = await Promise.race([
      revealed.then((state) => ({ kind: 'automatic', state })),
      legacyReview.then((state) => ({ kind: 'legacy', state })),
    ]);
    let legacySuggestions = [];
    if (firstOutcome.kind === 'legacy') {
      legacySuggestions = firstOutcome.state.reviewSuggestions || [];
      for (const suggestion of legacySuggestions) {
        await emitAck(players[0], 'review_merge_answers', { groupIds: suggestion.groupIds });
      }
      await emitAck(players[0], 'review_confirm_groups');
    }
    const result = firstOutcome.kind === 'automatic' ? firstOutcome.state : await revealed;

    console.log(JSON.stringify({
      origin,
      code,
      question: result.currentQuestion.text,
      answers,
      groups: result.groups.map((group) => group.answers.map((answer) => answer.rawAnswer)),
      legacySuggestions,
      result: result.roundResult,
      moment: result.moment,
    }, null, 2));

    if (holdMs) await new Promise((resolve) => setTimeout(resolve, holdMs));
    await emitAck(players[0], 'close_room');
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
