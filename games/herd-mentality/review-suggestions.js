'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-5-nano';
const REASONING_EFFORT = 'low';
const TIMEOUT_MS = 7000;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mergeSets'],
  properties: {
    mergeSets: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['answerIds', 'reason'],
        properties: {
          answerIds: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string' } },
          reason: { type: 'string', maxLength: 120 },
        },
      },
    },
  },
};

function responseText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  for (const item of body?.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function groupingPrompt(question, answers) {
  const candidatePairs = [];
  for (let left = 0; left < answers.length; left += 1) {
    for (let right = left + 1; right < answers.length; right += 1) {
      candidatePairs.push(`- ${answers[left].id} + ${answers[right].id}: "${answers[left].text}" <> "${answers[right].text}"`);
    }
  }

  return `Find duplicate answers for Herd Mentality, a party game where only matching answers score.

Return only mergeSets. Each mergeSet contains answer IDs that should count as one answer. Omit every answer that should remain separate.

Judge answer identity, not similarity. The fact that answers both fit the question is never evidence that they match.

Use this procedure:
1. Check obvious typos and harmless surface changes first: spelling, punctuation, articles, possessives, singular/plural, and inflection.
2. Rewrite each answer as its shortest core answer to this specific question. Remove words or meaning explicitly supplied by the question, plus ordinary grammatical framing such as "being", "learning to", "going to", "a day of", or an obvious delivery mechanism. Do not remove context merely because it is related or plausible.
3. Compare every candidate pair independently. Merge when those shortest question-relative cores name the same referent, action, event, or quality. A grammatical wrapper is not a different answer. If a pair passes this rule, merging it is required, not optional.
4. Keep answers separate when a genuinely different core remains: a subtype, different object, different action, extra condition, location, time, cause, or meaningful modifier. A modifier is removable only when its meaning is explicitly present in the question; otherwise it is additional meaning and must remain.
5. Before returning a group, verify every pair in that group passes step 3. Never add a related answer through a chain or because it shares the question's category.

Mandatory matches include exact synonyms, standard abbreviations, harmless grammatical restatements, and a bare place or object used as conventional shorthand for the same visit, chore, activity, or experience. Words already supplied by the question do not create a meaningful distinction: a pizza question makes "pepperoni pizza" reduce to "pepperoni", and a beach-packing question makes "beach towel" reduce to "towel". A base food and its ordinary preparation match only for a broad food question that does not distinguish preparation.

Apply the rules in both directions. For an activity, event, job, chore, ability, or experience question, a concise noun may be the natural shorthand for a longer action phrase: "dishes" means "washing dishes", "the DMV" means "going to the DMV", and "teleportation" means "being able to teleport". Do not demand identical parts of speech when the question makes their intended answer identical.

Examples:
- "apple" + "appple" => merge
- For a good-friend quality: "honesty" + "being honest" => merge.
- For the best nap place: "bed" + "my bed" => merge; "couch" stays separate.
- For something that takes too long: "the DMV" + "going to the DMV" => merge; "traffic" stays separate.
- For an Olympic activity: "napping" + "taking a nap" => merge; "sleeping" stays separate because it is a broader, different activity.
- For day-off weather: "sunny" + "sunshine" => merge; "warm and sunny" and "snow" each stay separate. Do not group all weather answers.
- For something worth waiting for: "a beach day" + "going to the beach" => merge; "summer vacation" stays separate.
- For a breakfast food: "eggs" + "scrambled eggs" => merge; "omelette" stays separate as a distinct dish.
- "death" + "dying" => merge as noun/gerund forms of the same core answer.
- "alarm" + "alarm clock" => merge when both mean the morning alarm sound.
- "listen to music" + "play music on headphones" => merge when the activity being answered is listening to music; "think" and "talk" stay separate.
- "dog" + "golden retriever" => separate because one is a subtype.

Player identities are unavailable. Never merge based on popularity. Merge sets must be disjoint.

Question: ${question}

Answers:
${answers.map((answer) => `${answer.id}: ${answer.text}`).join('\n')}

Candidate pairs to judge independently:
${candidatePairs.join('\n')}

Final check: first decide SAME or DIFFERENT for every candidate pair. Return a mergeSet only from SAME pairs, using the exact IDs on that pair. For a mergeSet larger than two, every pair inside it must be SAME.`;
}

async function getMergeSets(
  { question, answers },
  { apiKey = process.env.OPENAI_API_KEY, fetchImpl = global.fetch, timeoutMs = TIMEOUT_MS } = {},
) {
  if (!apiKey || typeof fetchImpl !== 'function') return { status: 'unavailable', mergeSets: [] };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: REASONING_EFFORT },
        input: groupingPrompt(question, answers),
        text: { format: { type: 'json_schema', name: 'herd_answer_groups', strict: true, schema: RESPONSE_SCHEMA } },
      }),
    });
    if (!response.ok) return { status: 'api_error', mergeSets: [] };
    const parsed = JSON.parse(responseText(await response.json()));
    return { status: 'ok', mergeSets: Array.isArray(parsed.mergeSets) ? parsed.mergeSets : [] };
  } catch (error) {
    return { status: error?.name === 'AbortError' ? 'timeout' : 'invalid_response', mergeSets: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function validateMergeSets(mergeSets, groups) {
  const groupByAnswerId = new Map();
  for (const group of groups) {
    for (const answer of group.answers) groupByAnswerId.set(answer.playerId, group.id);
  }

  const usedAnswerIds = new Set();
  const usedGroupIds = new Set();
  return Array.isArray(mergeSets) ? mergeSets.flatMap((mergeSet, index) => {
    const answerIds = Array.from(new Set(mergeSet?.answerIds || []));
    const groupIds = Array.from(new Set(answerIds.map((id) => groupByAnswerId.get(id))));
    const valid = answerIds.length >= 2
      && answerIds.every((id) => groupByAnswerId.has(id) && !usedAnswerIds.has(id))
      && groupIds.length >= 2
      && groupIds.every((id) => id && !usedGroupIds.has(id))
      && typeof mergeSet.reason === 'string' && mergeSet.reason.trim();
    if (!valid) return [];
    answerIds.forEach((id) => usedAnswerIds.add(id));
    groupIds.forEach((id) => usedGroupIds.add(id));
    return [{
      id: `ai-${index + 1}`,
      answerIds,
      groupIds,
      reason: mergeSet.reason.trim().slice(0, 120),
    }];
  }).slice(0, 6) : [];
}

module.exports = { MODEL, REASONING_EFFORT, TIMEOUT_MS, getMergeSets, groupingPrompt, validateMergeSets };
