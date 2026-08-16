'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-5-nano';
const REASONING_EFFORT = 'low';
const TIMEOUT_MS = 6000;

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
  return `Find duplicate answers for Herd Mentality, a party game where only matching answers score.

Return only mergeSets. Each mergeSet contains answer IDs that should count as one answer. Omit every answer that should remain separate.

Judge answer identity, not similarity. The fact that answers both fit the question is never evidence that they match.

Use this procedure:
1. Check obvious typos and harmless surface changes first: spelling, punctuation, articles, possessives, singular/plural, and inflection.
2. For each possible pair, remove only grammar or framing supplied by the question. Merge only if the remaining core referent, action, event, or quality is the same.
3. Before returning a group, verify every pair in that group passes step 2. Never add a related answer through a chain or because it shares the question's category.
4. If one answer adds a meaningful subtype, object, action, condition, location, time, cause, or modifier, keep it separate. This rule wins when uncertain.

Exact synonyms, standard abbreviations, harmless grammatical restatements, and a place/object used as shorthand for the same visit or experience may merge. A base food and its ordinary preparation may merge only for a broad food question that does not distinguish preparation.

Examples:
- "apple" + "appple" => merge
- For a good-friend quality: "honesty" + "being honest" => merge.
- For the best nap place: "bed" + "my bed" => merge; "couch" stays separate.
- For something that takes too long: "the DMV" + "going to the DMV" => merge; "traffic" stays separate.
- For an Olympic activity: "napping" + "taking a nap" => merge; "sleeping" stays separate because it is a broader, different activity.
- For day-off weather: "sunny" + "sunshine" => merge; "warm and sunny" and "snow" each stay separate. Do not group all weather answers.
- For something worth waiting for: "a beach day" + "going to the beach" => merge; "summer vacation" stays separate.
- For a breakfast food: "eggs" + "scrambled eggs" => merge; "omelette" stays separate as a distinct dish.
- "dog" + "golden retriever" => separate because one is a subtype.

Player identities are unavailable. Never merge based on popularity. Merge sets must be disjoint.

Question: ${question}

Answers:
${answers.map((answer) => `${answer.id}: ${answer.text}`).join('\n')}`;
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
