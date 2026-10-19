// Question schema: canonical record shape, normalization and validation.
// Pure module (no DOM / storage) so it can be unit-tested in Node.
// Questions are written inside lesson files (see content.js). The game only ever sees records
// that pass through this module.

import { normalizeAnswer } from '../engine/validator.js';

export const SCHEMA_VERSION = '2.0';

// Exercise types. An exercise's type is the question category: the UI picks its answer widget from it.
export const CATEGORIES = Object.freeze({
  quick_translation: 'Quick translation',
  sentence_builder: 'Sentence building',
  grammar_correction: 'Grammar correction',
  multiple_choice: 'Multiple choice',
  positive_negative_question: 'Positive / Negative / Question',
  voice_translation: 'Audio translation',
  dictation: 'Dictation',
  vocabulary: 'Synonyms and antonyms',
});

// How the English sentence is shown: as text, or only played (listening).
export const PRESENTATIONS = Object.freeze({
  text: 'Text',
  audio: 'Audio only',
});

// Known topics get nice labels. Unknown topics from future lessons are still accepted.
export const TOPIC_LABELS = Object.freeze({
  to_be: 'To Be',
  do_does: 'Do / Does',
});

export const DIFFICULTIES = Object.freeze({
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
});

export const OPERATIONS = Object.freeze({
  positive: 'Positive',
  negative: 'Negative',
  question: 'Question',
});

export const DEFAULT_POINTS = Object.freeze({ easy: 10, medium: 15, hard: 20 });
export const DEFAULT_TIME_LIMIT = 20;

export const topicLabel = (topic) => TOPIC_LABELS[topic] ?? topic;

/** Identifies a lesson across books, e.g. "iwelo-1/lesson-03". */
export const lessonKey = (book, lesson) => `${book}/${lesson}`;

const str = (value) => (value == null ? '' : String(value).trim());

// Accepts an array, or a string whose items are separated by "|" (used by CSV).
function toList(value) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : [];
  return items.map(str).filter(Boolean);
}

function toNumber(value, fallback) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function toBool(value, fallback) {
  if (value === '' || value == null) return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

const unique = (items) => [...new Set(items)];

/**
 * Glossary: key words with their meaning, e.g. [{word: "work", meaning: "to do"}].
 * Accepts objects, or strings like "work=to do" (used by CSV and the admin form).
 */
function toGlossary(value) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : [];
  return items
    .map((item) => {
      if (item && typeof item === 'object') return { word: str(item.word), meaning: str(item.meaning) };
      const text = str(item);
      const at = text.indexOf('=');
      return at < 0 ? { word: text, meaning: '' } : { word: str(text.slice(0, at)), meaning: str(text.slice(at + 1)) };
    })
    .filter((entry) => entry.word);
}

/**
 * Splits text into comparable English words: lowercase, no surrounding punctuation,
 * and punctuation-only tokens (such as ".") dropped. Used for word-bank checks.
 */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Turns any raw record (from a lesson file, JSON, CSV or the admin form) into the canonical shape.
 * Only fields that belong to the record's category are kept.
 * The expected answer is always part of accepted_answers.
 */
export function normalizeQuestion(raw = {}) {
  const category = str(raw.category);
  const difficulty = str(raw.difficulty);
  const expected = str(raw.expected_answer);

  const question = {
    id: str(raw.id),
    category,
    topic: str(raw.topic),
    difficulty,
    question: str(raw.question),
    expected_answer: expected,
    accepted_answers: unique([expected, ...toList(raw.accepted_answers)].filter(Boolean)),
    explanation: str(raw.explanation),
    hint: str(raw.hint),
    points: toNumber(raw.points, DEFAULT_POINTS[difficulty] ?? 10),
    time_limit: toNumber(raw.time_limit, DEFAULT_TIME_LIMIT),
    enabled: toBool(raw.enabled, true),
    glossary: toGlossary(raw.glossary),
    presentation: str(raw.presentation) || 'text',
  };

  // Course position. Set by the lesson loader; a question always belongs to one lesson.
  if (str(raw.book)) question.book = str(raw.book);
  if (str(raw.lesson)) question.lesson = str(raw.lesson);
  if (str(raw.exercise)) question.exercise = str(raw.exercise);

  // Answer mode: 'single' (default, one reply) or 'list' (the learner gives several items, at least min_items).
  const answerMode = str(raw.answer_mode);
  if (answerMode && answerMode !== 'single') {
    question.answer_mode = answerMode;
    if (answerMode === 'list') question.min_items = toNumber(raw.min_items, 1);
  }

  if (category === 'sentence_builder') question.word_bank = toList(raw.word_bank);
  if (category === 'grammar_correction') question.incorrect_sentence = str(raw.incorrect_sentence);
  if (category === 'multiple_choice') question.options = toList(raw.options);
  if (category === 'positive_negative_question') question.operation = str(raw.operation) || 'negative';

  return question;
}

/**
 * @param {object} q normalized question
 * @returns {{errors: string[], warnings: string[]}}
 *   errors   -> the record cannot be stored or played
 *   warnings -> the record is playable but probably needs a look
 */
export function validateQuestion(q) {
  const errors = [];
  const warnings = [];

  if (!q.id) errors.push('id is empty.');
  if (!CATEGORIES[q.category]) errors.push(`Exercise type (category) is invalid: "${q.category}".`);
  if (!q.book) errors.push('book is empty.');
  if (!q.lesson) errors.push('lesson is empty.');
  if (!q.topic) errors.push('topic is empty.');
  if (!DIFFICULTIES[q.difficulty]) errors.push(`Level (difficulty) is invalid: "${q.difficulty}".`);
  if (!PRESENTATIONS[q.presentation]) errors.push(`Presentation mode (presentation) is invalid: "${q.presentation}".`);
  if (!q.question) errors.push('Question text is empty.');
  if (!q.expected_answer) errors.push('Expected answer (expected_answer) is empty.');
  if (!q.explanation) warnings.push('Explanation (explanation) is empty.');
  for (const entry of q.glossary ?? []) {
    if (!entry.meaning) warnings.push(`Meaning of key word "${entry.word}" is empty.`);
  }
  if (!Number.isInteger(q.points) || q.points <= 0) errors.push('Points (points) must be a positive whole number.');
  if (!(Number.isFinite(q.time_limit) && q.time_limit > 0)) errors.push('Time limit (time_limit) must be a positive number.');

  if (q.answer_mode !== undefined && q.answer_mode !== 'list') {
    errors.push(`Answer mode (answer_mode) is invalid: "${q.answer_mode}".`);
  }
  if (q.answer_mode === 'list') {
    if (!Number.isInteger(q.min_items) || q.min_items < 1) {
      errors.push('min_items must be a whole number, at least 1.');
    } else if (q.min_items > (q.accepted_answers ?? []).length) {
      errors.push('min_items is greater than the number of accepted answers.');
    }
  }

  if (q.presentation === 'audio') {
    // A listening question has to play an English sentence, and a blank would give the answer away.
    if (!/[A-Za-z]/.test(q.question)) errors.push('A listening exercise needs English text to play as audio.');
    if (q.question.includes('___')) errors.push('A listening exercise cannot contain a blank (___).');
    if ((q.glossary ?? []).length > 0) warnings.push('Key words are not shown in a listening exercise.');
  }

  switch (q.category) {
    case 'sentence_builder': {
      const bank = q.word_bank ?? [];
      if (bank.length < 2) {
        errors.push('word_bank must contain at least two words.');
      } else if (q.expected_answer) {
        const bankWords = tokenize(bank.join(' ')).sort().join(' ');
        const answerWords = tokenize(q.expected_answer).sort().join(' ');
        if (bankWords !== answerWords) {
          errors.push('The words in word_bank do not match the words in expected_answer.');
        }
      }
      break;
    }
    case 'grammar_correction':
      if (!q.incorrect_sentence) {
        errors.push('Incorrect sentence (incorrect_sentence) is empty.');
      } else if (normalizeAnswer(q.incorrect_sentence) === normalizeAnswer(q.expected_answer)) {
        warnings.push('The incorrect sentence is the same as the correct answer; it may not contain a mistake.');
      }
      break;
    case 'multiple_choice': {
      const options = q.options ?? [];
      const sameAs = (a, b) => normalizeAnswer(a) === normalizeAnswer(b);
      if (options.length < 2) errors.push('At least two options are required.');
      if (new Set(options.map(normalizeAnswer)).size !== options.length) {
        errors.push('There are duplicate options.');
      }
      if (q.expected_answer && !options.some((o) => sameAs(o, q.expected_answer))) {
        errors.push('The correct answer (expected_answer) is not among the options.');
      }
      for (const answer of q.accepted_answers) {
        if (!options.some((o) => sameAs(o, answer))) {
          warnings.push(`Accepted answer "${answer}" is not among the options.`);
        }
      }
      break;
    }
    case 'positive_negative_question':
      if (!OPERATIONS[q.operation]) errors.push(`Operation (operation) is invalid: "${q.operation}".`);
      break;
    default:
      break;
  }

  return { errors, warnings };
}
