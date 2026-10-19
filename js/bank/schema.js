// Question schema: canonical record shape, normalization and validation.
// Pure module (no DOM / storage) so it can be unit-tested in Node.
// Questions are written inside lesson files (see content.js). The game only ever sees records
// that pass through this module.

import { normalizeAnswer } from '../engine/validator.js';

export const SCHEMA_VERSION = '2.0';

// Exercise types. An exercise's type is the question category: the UI picks its answer widget from it.
export const CATEGORIES = Object.freeze({
  quick_translation: 'ترجمه سریع',
  sentence_builder: 'ساخت جمله',
  grammar_correction: 'اصلاح گرامر',
  multiple_choice: 'چندگزینه‌ای',
  positive_negative_question: 'مثبت / منفی / سؤالی',
  voice_translation: 'ترجمه صوتی',
  dictation: 'املا',
  vocabulary: 'مترادف و متضاد',
});

// How the English sentence is shown: as text, or only played (listening).
export const PRESENTATIONS = Object.freeze({
  text: 'متن',
  audio: 'فقط صدا',
});

// Known topics get nice labels. Unknown topics from future lessons are still accepted.
export const TOPIC_LABELS = Object.freeze({
  to_be: 'To Be',
  do_does: 'Do / Does',
});

export const DIFFICULTIES = Object.freeze({
  easy: 'آسان',
  medium: 'متوسط',
  hard: 'سخت',
});

export const OPERATIONS = Object.freeze({
  positive: 'مثبت',
  negative: 'منفی',
  question: 'سؤالی',
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
 * Glossary: key words with their meaning, e.g. [{word: "work", meaning: "کار کردن"}].
 * Accepts objects, or strings like "work=کار کردن" (used by CSV and the admin form).
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

  if (!q.id) errors.push('شناسه (id) خالی است.');
  if (!CATEGORIES[q.category]) errors.push(`نوع تمرین (category) نامعتبر است: «${q.category}».`);
  if (!q.book) errors.push('کتاب (book) خالی است.');
  if (!q.lesson) errors.push('درس (lesson) خالی است.');
  if (!q.topic) errors.push('موضوع (topic) خالی است.');
  if (!DIFFICULTIES[q.difficulty]) errors.push(`سطح (difficulty) نامعتبر است: «${q.difficulty}».`);
  if (!PRESENTATIONS[q.presentation]) errors.push(`حالت نمایش (presentation) نامعتبر است: «${q.presentation}».`);
  if (!q.question) errors.push('متن سؤال خالی است.');
  if (!q.expected_answer) errors.push('پاسخ اصلی (expected_answer) خالی است.');
  if (!q.explanation) warnings.push('توضیح (explanation) خالی است.');
  for (const entry of q.glossary ?? []) {
    if (!entry.meaning) warnings.push(`معنی کلمه‌ی کلیدی «${entry.word}» خالی است.`);
  }
  if (!Number.isInteger(q.points) || q.points <= 0) errors.push('امتیاز (points) باید عدد صحیح مثبت باشد.');
  if (!(Number.isFinite(q.time_limit) && q.time_limit > 0)) errors.push('زمان (time_limit) باید عدد مثبت باشد.');

  if (q.answer_mode !== undefined && q.answer_mode !== 'list') {
    errors.push(`حالت پاسخ (answer_mode) نامعتبر است: «${q.answer_mode}».`);
  }
  if (q.answer_mode === 'list') {
    if (!Number.isInteger(q.min_items) || q.min_items < 1) {
      errors.push('min_items باید عدد صحیح و حداقل ۱ باشد.');
    } else if (q.min_items > (q.accepted_answers ?? []).length) {
      errors.push('min_items بیشتر از تعداد پاسخ‌های قابل قبول است.');
    }
  }

  if (q.presentation === 'audio') {
    // A listening question has to play an English sentence, and a blank would give the answer away.
    if (!/[A-Za-z]/.test(q.question)) errors.push('تمرین شنیداری باید متن انگلیسی برای پخش صوتی داشته باشد.');
    if (q.question.includes('___')) errors.push('تمرین شنیداری نمی‌تواند جای خالی (___) داشته باشد.');
    if ((q.glossary ?? []).length > 0) warnings.push('در تمرین شنیداری کلمات کلیدی نمایش داده نمی‌شوند.');
  }

  switch (q.category) {
    case 'sentence_builder': {
      const bank = q.word_bank ?? [];
      if (bank.length < 2) {
        errors.push('word_bank باید حداقل دو کلمه داشته باشد.');
      } else if (q.expected_answer) {
        const bankWords = tokenize(bank.join(' ')).sort().join(' ');
        const answerWords = tokenize(q.expected_answer).sort().join(' ');
        if (bankWords !== answerWords) {
          errors.push('کلمات word_bank با کلمات expected_answer یکی نیست.');
        }
      }
      break;
    }
    case 'grammar_correction':
      if (!q.incorrect_sentence) {
        errors.push('جمله اشتباه (incorrect_sentence) خالی است.');
      } else if (normalizeAnswer(q.incorrect_sentence) === normalizeAnswer(q.expected_answer)) {
        warnings.push('جمله اشتباه با پاسخ صحیح یکی است؛ ممکن است خطایی در آن نباشد.');
      }
      break;
    case 'multiple_choice': {
      const options = q.options ?? [];
      const sameAs = (a, b) => normalizeAnswer(a) === normalizeAnswer(b);
      if (options.length < 2) errors.push('حداقل دو گزینه لازم است.');
      if (new Set(options.map(normalizeAnswer)).size !== options.length) {
        errors.push('گزینه‌های تکراری وجود دارد.');
      }
      if (q.expected_answer && !options.some((o) => sameAs(o, q.expected_answer))) {
        errors.push('پاسخ صحیح (expected_answer) در گزینه‌ها نیست.');
      }
      for (const answer of q.accepted_answers) {
        if (!options.some((o) => sameAs(o, answer))) {
          warnings.push(`پاسخ قابل قبول «${answer}» در گزینه‌ها نیست.`);
        }
      }
      break;
    }
    case 'positive_negative_question':
      if (!OPERATIONS[q.operation]) errors.push(`نوع تبدیل (operation) نامعتبر است: «${q.operation}».`);
      break;
    default:
      break;
  }

  return { errors, warnings };
}
