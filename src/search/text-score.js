export function rankCandidates(query, entries, limit, excludedThreadId) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  return entries
    .filter((entry) => entry.threadId !== excludedThreadId)
    .map((entry) => ({ ...entry, score: scoreEntry(queryTokens, entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function rankCandidatesFromIterable(query, entries, limit, excludedThreadId) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const candidates = [];
  for await (const entry of entries) {
    if (entry.threadId === excludedThreadId) {
      continue;
    }

    const score = scoreEntry(queryTokens, entry);
    if (score <= 0) {
      continue;
    }

    candidates.push({ ...entry, score });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > limit) {
      candidates.pop();
    }
  }

  return candidates;
}

function scoreEntry(queryTokens, entry) {
  const titleTokens = new Set(tokenize(entry.title));
  const contentTokens = new Set(tokenize(entry.content));
  const tagTokens = new Set(entry.tags.flatMap((tag) => tokenize(tag)));

  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 3;
    }
    if (contentTokens.has(token)) {
      score += 1;
    }
    if (tagTokens.has(token)) {
      score += 2;
    }
  }

  const coverage = score / Math.max(queryTokens.length, 1);
  const titleBonus = entry.title.toLowerCase().includes(queryTokens.join(" ")) ? 2 : 0;
  return Number((coverage + titleBonus).toFixed(3));
}

function tokenize(value) {
  const normalized = value.toLowerCase();
  const rawTokens = normalized.match(/[\p{Letter}\p{Number}_-]+/gu) ?? [];
  const tokens = [];

  for (const token of rawTokens) {
    if (token.length >= 2) {
      tokens.push(token);
    }

    if (containsCjk(token)) {
      tokens.push(...ngrams(token, 2), ...ngrams(token, 3));
    }
  }

  return [...new Set(tokens)];
}

function containsCjk(value) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function ngrams(value, size) {
  const chars = [...value];
  if (chars.length < size) {
    return [];
  }

  return chars.slice(0, chars.length - size + 1).map((_, index) => chars.slice(index, index + size).join(""));
}
