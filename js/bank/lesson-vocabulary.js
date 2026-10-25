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
 * The order of the words list. Words with a category come first, one block per category (the categories in the
 * order they first appear), and each block keeps the lesson's own order, so a set like capital city, country,
 * nationality stays together. The words without a category follow, A to Z.
 */
export function orderWords(words) {
  const rank = new Map();
  for (const word of words) {
    if (word.category && !rank.has(word.category)) rank.set(word.category, rank.size);
  }
  const grouped = words.filter((word) => word.category).sort((a, b) => rank.get(a.category) - rank.get(b.category));
  const plain = words
    .filter((word) => !word.category)
    .sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
  return [...grouped, ...plain];
}

/**
 * The rows of the words page, in the order they are listed: each category as one block (its vocabulary words, then
 * its quiz rows), the categories in the order they first appear, and then the words without a category, A to Z.
 */
export function wordRows(material) {
  const all = [...material.words, ...(material.quiz ?? [])];
  const rank = new Map();
  for (const row of all) {
    if (row.category && !rank.has(row.category)) rank.set(row.category, rank.size);
  }
  const grouped = all
    .filter((row) => row.category)
    .sort((a, b) => rank.get(a.category) - rank.get(b.category));
  return [...grouped, ...material.words.filter((word) => !word.category)];
}

/**
 * Everything the lesson pages show, for the chosen lessons together.
 * `contents` is one lesson_content part per lesson (null when a lesson has none).
 * Returns:
 *   words:     [{ word, ipa, meaning, category }]
 *   quiz:      [{ word, ipa, meaning, category, quiz: [{ label, word, ipa, meaning }] }]
 *              a quiz row shows its capital city (word); its answers stay hidden until the learner checks them.
 *   sentences: [{ english, persian }]
 *   grammar:   [{ title, explanation, examples: [{ english, persian }] }]
 *   stories:   [{ title, lines: [{ english, persian }] }]
 */
export function lessonMaterial(questions, contents = []) {
  const parts = contents.filter(Boolean);
  const vocabulary = parts.flatMap((part) => part.vocabulary ?? []);
  const sentences = parts.flatMap((part) => part.sentences ?? []);

  const words = vocabulary.length
    ? orderWords(
        uniqueBy(
          vocabulary.map((entry) => ({
            word: text(entry.word),
            ipa: text(entry.ipa),
            meaning: text(entry.meaning),
            category: text(entry.category),
          })),
          (entry) => entry.word.toLowerCase(),
        ),
      )
    : lessonWords(questions).map((entry) => ({ ...entry, ipa: '', category: '' }));

  // A quiz takes its pronunciation and meanings from the vocabulary, so each word is written only once in the lesson.
  const known = new Map(words.map((word) => [word.word.toLowerCase(), word]));
  const quiz = parts.flatMap((part) =>
    (part.quiz ?? []).map((entry) => {
      const capital = text(entry.capital_city);
      return {
        word: capital,
        ipa: known.get(capital.toLowerCase())?.ipa ?? '',
        meaning: '',
        category: text(entry.category),
        quiz: (entry.answers ?? []).map((answer) => {
          const word = text(answer.word);
          const found = known.get(word.toLowerCase());
          return { label: text(answer.label), word, ipa: found?.ipa ?? '', meaning: found?.meaning ?? '' };
        }),
      };
    }),
  );

  return {
    words,
    quiz,
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
