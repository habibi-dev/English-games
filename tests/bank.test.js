import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeQuestion, validateQuestion } from '../js/bank/schema.js';
import { importQuestions, serializeQuestions } from '../js/bank/importer.js';
import { parseCsv, stringifyCsv } from '../js/bank/csv.js';

const DATASET = new URL('../banks/english_grammar_question_bank_1000.json', import.meta.url);

test('CSV parser handles quotes, commas, escaped quotes and new lines', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['x, y', 'say "hi"', 'line1\nline2'],
  ]);
  assert.equal(parseCsv(stringifyCsv(rows))[1][2], 'line1\nline2');
});

test('normalizeQuestion keeps only the fields of its category and defaults the rest', () => {
  const q = normalizeQuestion({
    id: 'x1',
    category: 'multiple_choice',
    topic: 'to_be',
    difficulty: 'medium',
    question: 'I ___ tired.',
    expected_answer: 'am',
    options: ['am', 'is'],
    word_bank: ['ignored'],
    enabled: 'false',
  });
  assert.equal(q.points, 15);
  assert.equal(q.time_limit, 20);
  assert.equal(q.enabled, false);
  assert.deepEqual(q.accepted_answers, ['am']);
  assert.deepEqual(q.options, ['am', 'is']);
  assert.equal('word_bank' in q, false);
});

test('validation catches broken sentence_builder and multiple_choice records', () => {
  const builder = normalizeQuestion({
    id: 'b1', category: 'sentence_builder', topic: 'to_be', difficulty: 'easy',
    question: 'x', expected_answer: 'I am a developer.', word_bank: ['am', 'I', 'teacher'],
    explanation: 'e',
  });
  assert.ok(validateQuestion(builder).errors.some((e) => e.includes('word_bank')));

  const mc = normalizeQuestion({
    id: 'm1', category: 'multiple_choice', topic: 'to_be', difficulty: 'easy',
    question: 'I ___ tired.', expected_answer: 'are', options: ['am', 'is'], explanation: 'e',
  });
  assert.ok(validateQuestion(mc).errors.length > 0);
});

test('a new question type or topic can be added as data without code changes', () => {
  const q = normalizeQuestion({
    id: 'n1', category: 'quick_translation', topic: 'articles', difficulty: 'easy',
    question: 'یک سیب', expected_answer: 'An apple', explanation: 'e',
  });
  assert.deepEqual(validateQuestion(q).errors, []);
});

test('the bundled 1000-question bank imports without errors', () => {
  const result = importQuestions(readFileSync(DATASET, 'utf8'));
  assert.equal(result.total, 1000);
  assert.equal(result.invalid.length, 0, JSON.stringify(result.invalid.slice(0, 3)));
  assert.equal(result.questions.length, 1000);
  assert.equal(new Set(result.questions.map((q) => q.id)).size, 1000);
  assert.ok(result.questions.every((q) => q.accepted_answers.includes(q.expected_answer)));
});

test('the bundled bank reports the known data issue q0060 as a warning', () => {
  const result = importQuestions(readFileSync(DATASET, 'utf8'));
  const warned = result.warnings.map((w) => w.id);
  assert.ok(warned.includes('q0060'));
});

test('JSON and CSV export round-trip the same records', () => {
  const { questions } = importQuestions(readFileSync(DATASET, 'utf8'));
  const sample = questions.filter((q) => ['q0001', 'q0041', 'q0071'].includes(q.id));

  const fromJson = importQuestions(serializeQuestions(sample, 'json'));
  assert.deepEqual(fromJson.questions, sample);

  const fromCsv = importQuestions(serializeQuestions(sample, 'csv'), 'csv');
  assert.equal(fromCsv.invalid.length, 0);
  const csvById = Object.fromEntries(fromCsv.questions.map((q) => [q.id, q]));
  for (const original of sample) {
    assert.equal(csvById[original.id].question, original.question);
    assert.deepEqual(csvById[original.id].accepted_answers, original.accepted_answers);
    assert.equal(csvById[original.id].enabled, original.enabled);
  }
  const builder = csvById.q0041;
  assert.deepEqual(builder.word_bank, sample.find((q) => q.id === 'q0041').word_bank);
});

test('duplicate ids inside one file are rejected', () => {
  const text = JSON.stringify([
    { id: 'd1', category: 'quick_translation', topic: 'to_be', difficulty: 'easy', question: 'a', expected_answer: 'A', explanation: 'e' },
    { id: 'd1', category: 'quick_translation', topic: 'to_be', difficulty: 'easy', question: 'b', expected_answer: 'B', explanation: 'e' },
  ]);
  const result = importQuestions(text);
  assert.equal(result.questions.length, 1);
  assert.equal(result.invalid.length, 1);
});
