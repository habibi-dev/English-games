// Answer Validator
// Compares a learner's answer with the accepted answers stored in the question bank.
// It never generates answers and never analyses grammar: a reply is correct only when
// it equals one of the listed accepted answers after the allowed normalization.
// Pure module (no DOM / storage) so it can be unit-tested in Node.

/**
 * Normalization applied to both the learner's answer and each accepted answer:
 * - Unicode NFC
 * - curly apostrophes/quotes -> straight ones (keyboard/speech output differences only)
 * - commas (Latin or Persian) treated as spaces, since speech input cannot type them
 *   ("Sorry, what page?" and "Sorry what page" are the same answer; digit groups such as 1,000 are kept)
 * - sentence marks (. ! ? ; :) treated as spaces anywhere in the answer, not only at the end, since
 *   speech input never says them ("Yes, I am. And you?" is the same as "Yes I am and you"). Dots between
 *   digits (3.5) are kept, and "Mr. Lee" is the same as "Mr Lee".
 * - extra spaces collapsed and trimmed
 * - case-insensitive (lowercased)
 * Word order and every other character are preserved, so grammar mistakes still fail.
 * Contractions are NOT expanded: "isn't" and "is not" are different strings, so every accepted
 * form is listed in the question data.
 */
export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/(?<!\d),|,(?!\d)|،|؛/g, ' ')
    .replace(/(?<!\d)[.!?;:…]|[.!?;:…](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Separators for list answers: comma (Latin or Persian), semicolon, slash or a new line.
const LIST_SEPARATOR = /\s*(?:,|،|;|\/|\n)\s*/;

/** Splits a list answer ("big, huge") into normalized, unique items. */
export function splitListAnswer(text) {
  const items = String(text ?? '')
    .split(LIST_SEPARATOR)
    .map(normalizeAnswer)
    .filter(Boolean);
  return [...new Set(items)];
}

/**
 * Single answer (default): the reply must equal one of the accepted answers.
 * List answer (`answer_mode: 'list'`): the learner gives several items, and the reply is correct
 * when at least `min_items` distinct items are accepted. Extra items do not make it wrong.
 * Example: "name 2 synonyms of big" -> accepted_answers [large, huge, great], min_items 2.
 *
 * @param {{accepted_answers: string[], answer_mode?: string, min_items?: number}} question
 * @param {string} userAnswer
 * @returns {{correct: boolean, matched: string|null, matchedItems: string[], reason: 'empty'|'accepted'|'not_accepted'}}
 *   matched: the first accepted answer found; matchedItems: every accepted item found.
 */
export function validateAnswer(question, userAnswer) {
  if (question.answer_mode === 'list') return validateListAnswer(question, userAnswer);

  const given = normalizeAnswer(userAnswer);
  if (!given) {
    return { correct: false, matched: null, matchedItems: [], reason: 'empty' };
  }
  const matched = (question.accepted_answers ?? []).find((answer) => normalizeAnswer(answer) === given) ?? null;
  return {
    correct: matched !== null,
    matched,
    matchedItems: matched !== null ? [matched] : [],
    reason: matched !== null ? 'accepted' : 'not_accepted',
  };
}

// Characters that separate two items of a list answer: space, comma (Latin or Persian), semicolon,
// slash, "+", "|" and a new line (a new line is already a space after normalization).
const ITEM_BOUNDARY = /[\s,،؛;\/+|]/;
const atBoundary = (char) => char === undefined || ITEM_BOUNDARY.test(char);

/**
 * The accepted items that the reply contains as whole items. An item counts when it starts and ends at a
 * boundary (start or end of the reply, or a separator), so "large huge", "large, huge" and "large + huge"
 * all contain both items. A longer item wins over a shorter one inside it: "very large" does not also count
 * "large". Every item is counted once, however often it is typed.
 */
function findItems(text, accepted) {
  const candidates = [];
  for (const item of accepted) {
    for (let at = text.indexOf(item); at >= 0; at = text.indexOf(item, at + 1)) {
      const end = at + item.length;
      if ((at === 0 || atBoundary(text[at - 1])) && (end === text.length || atBoundary(text[end]))) {
        candidates.push({ item, start: at, end });
      }
    }
  }
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const taken = [];
  const found = [];
  for (const candidate of candidates) {
    if (taken.some((span) => candidate.start < span.end && span.start < candidate.end)) continue;
    taken.push(candidate);
    if (!found.includes(candidate.item)) found.push(candidate.item);
  }
  return found;
}

function validateListAnswer(question, userAnswer) {
  const given = normalizeAnswer(userAnswer);
  // A reply that is only separators (",", "+") has no item at all.
  if (!given.replace(new RegExp(ITEM_BOUNDARY.source, 'g'), '')) {
    return { correct: false, matched: null, matchedItems: [], reason: 'empty' };
  }
  const accepted = [...new Set((question.accepted_answers ?? []).map(normalizeAnswer).filter(Boolean))];
  const matchedItems = findItems(given, accepted);
  const needed = question.min_items ?? 1;
  const correct = matchedItems.length >= needed;
  return {
    correct,
    matched: matchedItems[0] ?? null,
    matchedItems,
    reason: correct ? 'accepted' : 'not_accepted',
  };
}
