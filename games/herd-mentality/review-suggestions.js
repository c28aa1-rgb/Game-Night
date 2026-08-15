'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-5-nano';
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
  return `Group duplicate answers for Herd Mentality, a party game where players score when their answers match.

Return only mergeSets. Each mergeSet contains answer IDs that should count as one answer. Omit every answer that should remain separate.

Use the question only to interpret shorthand or grammar. The fact that two answers both answer the question is NEVER evidence that they match.

Merge when ordinary players would clearly treat the responses as the same specific answer:
- spelling, punctuation, article, singular/plural, or inflection variants
- standard abbreviations or exact synonyms
- a short answer and a grammatical restatement that adds no new idea
- a base food and its ordinary preparation or form when the question asks for a broad food category and does not distinguish preparation

Keep separate when the answers are merely related, share a category or theme, name different examples, or differ by a meaningful action, object, condition, location, time, cause, or subtype. A narrower answer stays separate when it changes the thing being named, rather than simply expressing the same answer more specifically. When reasonable people could disagree, keep them separate.

Examples:
- "apple" + "appple" => merge
- "cell phone" + "phone" => merge
- For "name a breakfast food": "eggs" + "scrambled eggs" => merge; the preparation is a direct form of the same food and the question does not ask how eggs are cooked.
- For "name a breakfast food": "eggs" + "omelette" => separate; an omelette is a distinct dish, not merely eggs stated more specifically.
- For "something people do while waiting in line": "listen to music" + "play music on headphones" may merge; "think" and "talk" stay separate.
- For "something people learn": "driving" + "learning to drive" may merge because the question supplies the grammar.
- "death" + "heights" => separate, even for a question about fears
- "dog" + "golden retriever" => separate because one is a subtype

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
        reasoning: { effort: 'low' },
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

module.exports = { MODEL, TIMEOUT_MS, getMergeSets, groupingPrompt, validateMergeSets };
