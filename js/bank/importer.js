// Import / export of question banks (JSON or CSV).
// Pure module: text in, validated records out. Storage is handled by repository.js.

import { parseCsv, rowsToRecords, stringifyCsv } from './csv.js';
import { normalizeQuestion, validateQuestion, SCHEMA_VERSION } from './schema.js';

export const CSV_COLUMNS = [
  'id',
  'category',
  'topic',
  'difficulty',
  'question',
  'expected_answer',
  'accepted_answers',
  'explanation',
  'hint',
  'points',
  'time_limit',
  'enabled',
  'word_bank',
  'incorrect_sentence',
  'options',
  'operation',
  'glossary',
  'book',
  'lesson',
  'exercise',
  'presentation',
  'answer_mode',
  'min_items',
];

// Returns raw records (not yet normalized) from JSON or CSV text.
export function parseBankText(text, format) {
  const body = String(text).replace(/^\uFEFF/, '');
  const kind = format ?? (/^\s*[[{]/.test(body) ? 'json' : 'csv');

  if (kind === 'json') {
    const data = JSON.parse(body);
    const list = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(list)) {
      throw new Error('فایل JSON باید آرایه‌ای از سؤال‌ها یا کلید "questions" داشته باشد.');
    }
    return list;
  }

  if (kind === 'csv') {
    return rowsToRecords(parseCsv(body));
  }

  throw new Error(`فرمت ناشناخته: ${kind}`);
}

/**
 * Parses, normalizes and validates a whole file.
 * Invalid records are reported and skipped; the rest are returned for saving.
 */
export function importQuestions(text, format) {
  const rawItems = parseBankText(text, format);
  const questions = [];
  const invalid = [];
  const warnings = [];
  const seenIds = new Set();

  rawItems.forEach((raw, index) => {
    const question = normalizeQuestion(raw ?? {});
    const { errors, warnings: notes } = validateQuestion(question);

    if (question.id && seenIds.has(question.id)) {
      errors.push(`شناسه تکراری در همین فایل: ${question.id}`);
    }

    if (errors.length > 0) {
      invalid.push({ index, id: question.id || null, errors });
      return;
    }

    seenIds.add(question.id);
    questions.push(question);
    if (notes.length > 0) warnings.push({ id: question.id, messages: notes });
  });

  return { questions, invalid, warnings, total: rawItems.length };
}

function toCsvCell(column, value) {
  if (column === 'glossary') return (value ?? []).map((entry) => `${entry.word}=${entry.meaning}`).join(' | ');
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value ?? '';
}

export function serializeQuestions(questions, format) {
  if (format === 'csv') {
    const rows = [
      CSV_COLUMNS,
      ...questions.map((q) => CSV_COLUMNS.map((column) => toCsvCell(column, q[column]))),
    ];
    // BOM so Excel opens Persian text correctly.
    return `\uFEFF${stringifyCsv(rows)}`;
  }

  return JSON.stringify(
    {
      schema_version: SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      total: questions.length,
      questions,
    },
    null,
    2,
  );
}
