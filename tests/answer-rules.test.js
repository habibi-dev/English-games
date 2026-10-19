import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitListAnswer, validateAnswer } from '../js/engine/validator.js';
import { normalizeQuestion, validateQuestion } from '../js/bank/schema.js';

const synonyms = { answer_mode: 'list', min_items: 2, accepted_answers: ['large', 'huge', 'great'] };

test('list answer: enough accepted items is correct, extra items do not make it wrong', () => {
  assert.equal(validateAnswer(synonyms, 'large, huge').correct, true);
  assert.equal(validateAnswer(synonyms, 'large, huge, tiny').correct, true);
  assert.deepEqual(validateAnswer(synonyms, 'Great, LARGE').matchedItems, ['great', 'large']);
});

test('list answer: too few accepted items is wrong', () => {
  const verdict = validateAnswer(synonyms, 'large, tiny');
  assert.equal(verdict.correct, false);
  assert.deepEqual(verdict.matchedItems, ['large']);
  assert.equal(verdict.reason, 'not_accepted');
});

test('list answer: the same item twice counts once', () => {
  assert.equal(validateAnswer(synonyms, 'large, large').correct, false);
});

test('list answer: accepts Persian comma, semicolon and new lines', () => {
  assert.equal(validateAnswer(synonyms, 'large، huge').correct, true);
  assert.equal(validateAnswer(synonyms, 'large; huge').correct, true);
  assert.equal(validateAnswer(synonyms, 'large\nhuge').correct, true);
});

test('list answer: empty reply is reported as empty', () => {
  assert.equal(validateAnswer(synonyms, '  , ,  ').reason, 'empty');
});

test('single answer keeps its old behaviour and reports matchedItems', () => {
  const single = { accepted_answers: ['We are ready.'] };
  const verdict = validateAnswer(single, 'we are ready');
  assert.equal(verdict.correct, true);
  assert.deepEqual(verdict.matchedItems, ['We are ready.']);
});

test('splitListAnswer normalizes and removes duplicates', () => {
  assert.deepEqual(splitListAnswer('Big, big. , huge'), ['big', 'huge']);
});

test('schema keeps book, lesson and list settings only when given', () => {
  const plain = normalizeQuestion({ id: 'a', category: 'quick_translation' });
  assert.equal('book' in plain, false);
  assert.equal('answer_mode' in plain, false);

  const q = normalizeQuestion({
    id: 'syn1',
    category: 'quick_translation',
    topic: 'vocabulary',
    difficulty: 'easy',
    question: 'Synonyms of big (2 of 3)',
    expected_answer: 'large',
    accepted_answers: 'huge|great',
    answer_mode: 'list',
    min_items: '2',
    book: 'iwelo-1',
    lesson: '3',
  });
  assert.equal(q.book, 'iwelo-1');
  assert.equal(q.lesson, '3');
  assert.equal(q.answer_mode, 'list');
  assert.equal(q.min_items, 2);
  assert.deepEqual(validateQuestion(q).errors, []);
});

test('schema rejects unknown answer modes and impossible min_items', () => {
  const base = {
    id: 'x',
    category: 'quick_translation',
    topic: 'vocabulary',
    difficulty: 'easy',
    question: 'Synonyms of big',
    expected_answer: 'large',
    explanation: 'ok',
  };
  const unknown = validateQuestion(normalizeQuestion({ ...base, answer_mode: 'pick_any' }));
  assert.ok(unknown.errors.some((message) => message.includes('answer_mode')));

  const tooMany = validateQuestion(normalizeQuestion({ ...base, answer_mode: 'list', min_items: 3 }));
  assert.ok(tooMany.errors.some((message) => message.includes('min_items')));
});
