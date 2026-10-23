// Words, sentences, grammar and stories of a lesson. No DOM here, so they can be tested on their own.
// The lesson file has a `lesson_content` part (see content/evolve-1/lesson-01.json); it is stored with the lesson.
// When a lesson has no such part, the words and sentences are read from its questions instead:
//   words: the dictation items (the English word and its Persian meaning in the hint) and the key words (glossary);
//   sentences: the English sentences of the translation exercises, with their Persian translation.

const SENTENCE_CATEGORIES = ['quick_translation', 'voice_translation', 'word_translation', 'sentence_builder'];

const text = (value) => String(value ?? '').trim();

const uniqueBy = (items, keyOf) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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
  const out = [];
  for (const q of questions) {
    if (!SENTENCE_CATEGORIES.includes(q.category)) continue;
    out.push({ english: text(q.expected_answer), persian: text(q.translation) });
  }
  return uniqueBy(out, (entry) => entry.english.toLowerCase());
}

/**
 * Everything the lesson pages show, for the chosen lessons together.
 * `contents` is one lesson_content part per lesson (null when a lesson has none).
 * Returns:
 *   words:     [{ word, ipa, meaning }]
 *   sentences: [{ english, persian }]
 *   grammar:   [{ title, explanation, examples: [{ english, persian }] }]
 *   stories:   [{ title, lines: [{ english, persian }] }]
 */
export function lessonMaterial(questions, contents = []) {
  const parts = contents.filter(Boolean);
  const vocabulary = parts.flatMap((part) => part.vocabulary ?? []);
  const sentences = parts.flatMap((part) => part.sentences ?? []);

  const words = vocabulary.length
    ? uniqueBy(
        vocabulary.map((entry) => ({ word: text(entry.word), ipa: text(entry.ipa), meaning: text(entry.meaning) })),
        (entry) => entry.word.toLowerCase(),
      ).sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }))
    : lessonWords(questions).map((entry) => ({ ...entry, ipa: '' }));

  return {
    words,
    sentences: sentences.length
      ? uniqueBy(
          sentences.map((entry) => ({ english: text(entry.en), persian: text(entry.fa) })),
          (entry) => entry.english.toLowerCase(),
        )
      : lessonSentences(questions),
    grammar: parts.flatMap((part) =>
      (part.grammar ?? []).map((rule) => ({
        title: text(rule.title),
        explanation: text(rule.explanation),
        examples: (rule.examples ?? []).map((example) => ({ english: text(example.en), persian: text(example.fa) })),
      })),
    ),
    stories: parts.flatMap((part) =>
      (part.stories ?? []).map((story) => ({
        title: text(story.title),
        lines: (story.lines ?? []).map((line) => ({ english: text(line.en), persian: text(line.fa) })),
      })),
    ),
  };
}

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Synonyms, antonyms and example sentences for a lesson word (from vocabulary exercises + sentence bank).
 */
export function buildWordStudyIndex(questions, sentences, { maxExamples = 4 } = {}) {
  const synonymOf = new Map();
  const antonymOf = new Map();

  const addRelation = (map, base, related) => {
    const baseKey = text(base).toLowerCase();
    const rel = text(related);
    if (!baseKey || !rel) return;
    if (!map.has(baseKey)) map.set(baseKey, new Set());
    map.get(baseKey).add(rel);
  };

  for (const q of questions) {
    if (q.category !== 'vocabulary') continue;
    const qtext = text(q.question);
    let kind = null;
    let base = '';
    if (/^synonym\b/i.test(qtext)) {
      kind = 'synonym';
      base = qtext.replace(/^synonym(?:\s*\([^)]*\))?:\s*/i, '');
    } else if (/^opposite\b/i.test(qtext)) {
      kind = 'antonym';
      base = qtext.replace(/^opposite:\s*/i, '');
    } else continue;

    const answers = [q.expected_answer, ...(q.accepted_answers ?? [])].map((a) => text(a)).filter(Boolean);
    const map = kind === 'synonym' ? synonymOf : antonymOf;
    for (const answer of answers) {
      addRelation(map, base, answer);
      addRelation(map, answer, base);
    }
  }

  const sentenceList = (sentences ?? []).map((entry) => ({
    english: text(entry.english ?? entry.en),
    persian: text(entry.persian ?? entry.fa),
  }));

  return (word) => {
    const key = text(word).toLowerCase();
    const pattern = new RegExp(`\\b${escapeRegExp(text(word))}\\b`, 'i');
    const examples = [];
    for (const line of sentenceList) {
      if (!pattern.test(line.english)) continue;
      examples.push(line);
      if (examples.length >= maxExamples) break;
    }
    return {
      synonyms: [...(synonymOf.get(key) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      antonyms: [...(antonymOf.get(key) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      examples,
    };
  };
}
