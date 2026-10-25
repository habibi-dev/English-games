// Splits a question prompt into its Persian instruction and its English sentence.
// Example: "جمله را سؤالی کن: The students like tea." ->
//   { instruction: "جمله را سؤالی کن", sentence: "The students like tea." }
// A prompt with no English (for example a Persian sentence to translate) gives sentence "".

// English is every stretch of Latin letters, digits (ASCII or Persian), blanks ("___") and ASCII punctuation.
// A stretch counts as English only when it has a Latin letter or a blank, so a lone "?" after Persian is not English.
const ENGLISH_RUN = /[\p{Script=Latin}0-9\u06F0-\u06F9_\u0020-\u007e]+/gu;
const HAS_ENGLISH = /\p{Script=Latin}|__/u;

// Everything that is not English goes to the instruction, on both sides of the English:
// "پاسخ درست به Are you American? کدام است؟" -> instruction "پاسخ درست به … کدام است؟", sentence "Are you American?".
// Persian on both sides of an English part is joined with " … ", so the learner sees where the English box belongs.
export function splitPrompt(text) {
  const source = String(text ?? '').trim();

  const runs = [];
  for (const match of source.matchAll(ENGLISH_RUN)) {
    const run = match[0].trim();
    if (HAS_ENGLISH.test(run)) runs.push({ start: match.index, end: match.index + match[0].length, text: run });
  }
  if (runs.length === 0) return { instruction: source, sentence: '' };

  // The Persian text between and around the English runs, in order.
  const pieces = [];
  let cursor = 0;
  for (const run of runs) {
    pieces.push(source.slice(cursor, run.start));
    cursor = run.end;
  }
  pieces.push(source.slice(cursor));

  const instruction = pieces
    .map((piece) => piece.replace(/^[\s:：]+|[\s:：]+$/gu, '').trim())
    .filter(Boolean)
    .join(' … ');

  return {
    instruction,
    sentence: runs.map((run) => run.text.replace(/^:+/, '').trim()).join(' '),
  };
}
