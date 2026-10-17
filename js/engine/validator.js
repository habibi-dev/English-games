// Answer Validator
// Compares a learner's answer with the accepted answers stored in the question bank.
// It never generates answers and never analyses grammar: a reply is correct only when
// it equals one of the listed accepted answers after the allowed normalization.
// Pure module (no DOM / storage) so it can be unit-tested in Node.

/**
 * Normalization applied to both the learner's answer and each accepted answer:
 * - Unicode NFC
 * - curly apostrophes/quotes -> straight ones (keyboard/speech output differences only)
 * - extra spaces collapsed and trimmed
 * - terminal punctuation (. ! ?) removed
 * - case-insensitive (lowercased)
 * Word order and every other character are preserved, so grammar mistakes still fail.
 */
export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[.!?]+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * @param {{accepted_answers: string[]}} question
 * @param {string} userAnswer
 * @returns {{correct: boolean, matched: string|null, reason: 'empty'|'accepted'|'not_accepted'}}
 */
export function validateAnswer(question, userAnswer) {
  const given = normalizeAnswer(userAnswer);
  if (!given) {
    return { correct: false, matched: null, reason: 'empty' };
  }
  const matched = (question.accepted_answers ?? []).find((answer) => normalizeAnswer(answer) === given) ?? null;
  return {
    correct: matched !== null,
    matched,
    reason: matched !== null ? 'accepted' : 'not_accepted',
  };
}
