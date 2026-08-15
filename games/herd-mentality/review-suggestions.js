'use strict';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const TIMEOUT_MS = 4000;
const CONFIDENCE = new Set(['high']);

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['answerIds', 'reason', 'confidence'],
        properties: {
          answerIds: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string' } },
          reason: { type: 'string', maxLength: 140 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
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

async function getSuggestions({ question, answers }, { apiKey = process.env.OPENAI_API_KEY, fetchImpl = global.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (!apiKey || typeof fetchImpl !== 'function') return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-5-nano',
        reasoning: { effort: 'minimal' },
        input: `You are an extremely conservative party-game answer matcher. Suggest ONLY duplicate answers, never answers that merely fit the same question. The question supplies context for the replacement test below; it is never evidence that two answers belong in one group.\n\nBefore suggesting a merge, BOTH tests must pass:\n1. Replacement test: either answer can replace the other as the direct answer without materially changing what is said.\n2. Duplicate-entry test: a host would record them as the same answer, not as two independent valid responses.\n\nAllowed merges are limited to obvious spelling mistakes, singular/plural forms, articles, exact synonyms, or a longer phrase that adds no new action, condition, or specificity. Never merge answers because they share a category, cause, consequence, theme, emotional association, or are both plausible answers. If a reasonable host could disagree, return no suggestion.\n\nFor the question "What is something you do in line?", "listen to music", "play music on their headphones", "think", and "talk" are separate answers and MUST NOT be merged. The fact that every answer fits the question is never a reason to merge. Likewise, "death" and "heights" are both fears but are different answers and MUST NOT be merged. Return only high-confidence suggestions; omit medium or low-confidence ideas. Player names are unavailable.\n\nQuestion: ${question}\n\nAnswers:\n${answers.map((answer) => `${answer.id}: ${answer.text}`).join('\n')}`,
        text: { format: { type: 'json_schema', name: 'herd_review_suggestions', strict: true, schema: RESPONSE_SCHEMA } },
      }),
    });
    if (!response.ok) return [];
    return JSON.parse(responseText(await response.json())).suggestions || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function validateSuggestions(suggestions, groups) {
  const groupByAnswerId = new Map();
  for (const group of groups) {
    for (const answer of group.answers) groupByAnswerId.set(answer.playerId, group.id);
  }

  const usedAnswerIds = new Set();
  const usedGroupIds = new Set();
  return Array.isArray(suggestions) ? suggestions.flatMap((suggestion, index) => {
    const answerIds = Array.from(new Set(suggestion?.answerIds || []));
    const groupIds = Array.from(new Set(answerIds.map((id) => groupByAnswerId.get(id))));
    const valid = answerIds.length >= 2
      && answerIds.every((id) => groupByAnswerId.has(id) && !usedAnswerIds.has(id))
      && groupIds.length >= 2
      && groupIds.every((id) => !usedGroupIds.has(id))
      && typeof suggestion.reason === 'string' && suggestion.reason.trim()
      && CONFIDENCE.has(suggestion.confidence);
    if (!valid) return [];
    answerIds.forEach((id) => usedAnswerIds.add(id));
    groupIds.forEach((id) => usedGroupIds.add(id));
    return [{
      id: `ai-${index + 1}`,
      groupIds,
      reason: suggestion.reason.trim().slice(0, 140),
      confidence: suggestion.confidence,
    }];
  }).slice(0, 4) : [];
}

module.exports = { TIMEOUT_MS, getSuggestions, validateSuggestions };
