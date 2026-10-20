// Words and sentences of a lesson, read from its questions. No DOM here, so it can be tested on its own.
// Words: the dictation items (the English word and its Persian meaning in the hint) and the key words (glossary).
// Sentences: the English sentences of the translation exercises, with their Persian translation.

const SENTENCE_CATEGORIES = ['quick_translation', 'voice_translation', 'word_translation', 'sentence_builder'];

const text = (value) => String(value ?? '').trim();

/**
 * The words of the given questions, alphabetically, without repeats.
 * Returns [{ word, meaning }]; meaning is '' when the question has none.
 */
export function lessonWords(questions) {
  const seen = new Map();
  const add = (word, meaning) => {
    const value = text(word);
    if (!value) return;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, { word: value, meaning: text(meaning) });
    else if (!seen.get(key).meaning && text(meaning)) seen.get(key).meaning = text(meaning);
  };
  for (const q of questions) {
    if (q.category === 'dictation') add(q.expected_answer, q.hint);
  }
  for (const q of questions) {
    for (const entry of q.glossary ?? []) add(entry.word, entry.meaning);
  }
  return [...seen.values()].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
}

/**
 * The English sentences of the given questions, in the order they come, without repeats.
 * Returns [{ english, persian }]; persian is '' when the question has no translation.
 */
export function lessonSentences(questions) {
  const seen = new Set();
  const out = [];
  for (const q of questions) {
    if (!SENTENCE_CATEGORIES.includes(q.category)) continue;
    const english = text(q.expected_answer);
    const key = english.toLowerCase();
    if (!english || seen.has(key)) continue;
    seen.add(key);
    out.push({ english, persian: text(q.translation) });
  }
  return out;
}
