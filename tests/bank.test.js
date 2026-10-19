import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeQuestion, validateQuestion } from '../js/bank/schema.js';
import { importQuestions, serializeQuestions } from '../js/bank/importer.js';
import { parseCsv, stringifyCsv } from '../js/bank/csv.js';
import { flattenLesson } from '../js/bank/content.js';

const SAMPLE_LESSON = new URL('../content/evolve-1/lesson-01.json', import.meta.url);
const sampleQuestions = () =>
  flattenLesson(JSON.parse(readFileSync(SAMPLE_LESSON, 'utf8')), { book: 'evolve-1', lesson: 'lesson-01' });

test('a Persian translation survives normalization and is only kept when present', () => {
  const kept = normalizeQuestion({ category: 'translation', question: 'آن خانه من است.', expected_answer: 'It is my house.', translation: ' آن خانه من است. ' });
  assert.equal(kept.translation, 'آن خانه من است.');
  const bare = normalizeQuestion({ category: 'translation', question: 'آن خانه من است.', expected_answer: 'It is my house.' });
  assert.equal('translation' in bare, false);
});

test('every English question in the lesson has a Persian translation', () => {
  const { questions, invalid } = sampleQuestions();
  assert.equal(invalid.length, 0);
  const missing = questions.filter((q) => !q.translation).map((q) => q.id);
  assert.deepEqual(missing, []);
});

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
  assert.equal(q.presentation, 'text');
  assert.deepEqual(q.accepted_answers, ['am']);
  assert.deepEqual(q.options, ['am', 'is']);
  assert.equal('word_bank' in q, false);
});

test('validation catches broken sentence_builder and multiple_choice records', () => {
  const builder = normalizeQuestion({
    id: 'b1', category: 'sentence_builder', topic: 'to_be', difficulty: 'easy', book: 'b', lesson: 'l',
    question: 'x', expected_answer: 'I am a developer.', word_bank: ['am', 'I', 'teacher'],
    explanation: 'e',
  });
  assert.ok(validateQuestion(builder).errors.some((e) => e.includes('word_bank')));

  const mc = normalizeQuestion({
    id: 'm1', category: 'multiple_choice', topic: 'to_be', difficulty: 'easy', book: 'b', lesson: 'l',
    question: 'I ___ tired.', expected_answer: 'are', options: ['am', 'is'], explanation: 'e',
  });
  assert.ok(validateQuestion(mc).errors.length > 0);
});

test('every question must say which book and lesson it belongs to', () => {
  const q = normalizeQuestion({
    id: 'n1', category: 'quick_translation', topic: 'articles', difficulty: 'easy',
    question: 'یک سیب', expected_answer: 'An apple', explanation: 'e',
  });
  const errors = validateQuestion(q).errors;
  assert.ok(errors.some((e) => e.includes('book')));
  assert.ok(errors.some((e) => e.includes('lesson')));
});

test('the sample lesson turns into valid questions with no errors', () => {
  const result = sampleQuestions();
  assert.equal(result.invalid.length, 0, JSON.stringify(result.invalid));
  assert.equal(result.total, result.questions.length);
  assert.ok(result.questions.length > 0);
  assert.equal(new Set(result.questions.map((q) => q.id)).size, result.questions.length);
  assert.ok(result.questions.every((q) => q.accepted_answers.includes(q.expected_answer)));
  assert.ok(result.questions.every((q) => q.book === 'evolve-1' && q.lesson === 'lesson-01'));
});

test('dictation items are listening items, and transformation items keep their operation', () => {
  const { questions } = sampleQuestions();
  const dictation = questions.filter((q) => q.category === 'dictation');
  assert.ok(dictation.length > 0);
  assert.ok(dictation.every((q) => q.presentation === 'audio'));
  const operations = questions
    .filter((q) => q.category === 'positive_negative_question')
    .map((q) => q.operation);
  assert.ok(operations.includes('negative'));
  assert.ok(operations.includes('question'));
});

test('JSON and CSV export round-trip the same records', () => {
  const { questions } = sampleQuestions();
  // One plain record, one with a word bank, and one list answer, so every special field is covered.
  const builder = questions.find((q) => q.category === 'sentence_builder');
  const listItem = questions.find((q) => q.answer_mode === 'list');
  const sample = [questions.find((q) => q.category === 'quick_translation'), builder, listItem];

  const fromJson = importQuestions(serializeQuestions(sample, 'json'));
  assert.equal(fromJson.invalid.length, 0);
  assert.deepEqual(fromJson.questions, sample);

  const fromCsv = importQuestions(serializeQuestions(sample, 'csv'), 'csv');
  assert.equal(fromCsv.invalid.length, 0, JSON.stringify(fromCsv.invalid));
  const csvById = Object.fromEntries(fromCsv.questions.map((q) => [q.id, q]));
  for (const original of sample) {
    assert.equal(csvById[original.id].question, original.question);
    assert.deepEqual(csvById[original.id].accepted_answers, original.accepted_answers);
    assert.equal(csvById[original.id].lesson, 'lesson-01');
  }
  assert.deepEqual(csvById[builder.id].word_bank, builder.word_bank);
  assert.equal(csvById[listItem.id].answer_mode, 'list');
  assert.equal(csvById[listItem.id].min_items, listItem.min_items);
});

test('duplicate ids inside one file are rejected', () => {
  const text = JSON.stringify([
    { id: 'd1', category: 'quick_translation', topic: 'to_be', difficulty: 'easy', book: 'b', lesson: 'l', question: 'a', expected_answer: 'A', explanation: 'e' },
    { id: 'd1', category: 'quick_translation', topic: 'to_be', difficulty: 'easy', book: 'b', lesson: 'l', question: 'b', expected_answer: 'B', explanation: 'e' },
  ]);
  const result = importQuestions(text);
  assert.equal(result.questions.length, 1);
  assert.equal(result.invalid.length, 1);
});
