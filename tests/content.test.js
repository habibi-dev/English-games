import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenLesson } from '../js/bank/content.js';
import { filterQuestions } from '../js/engine/game-engine.js';

const item = (id, extra = {}) => ({
  id,
  question: 'من دانشجو هستم.',
  expected_answer: 'I am a student.',
  explanation: 'e',
  ...extra,
});

test('a lesson file needs an exercises list', () => {
  const result = flattenLesson({}, { book: 'b', lesson: 'l' });
  assert.equal(result.questions.length, 0);
  assert.equal(result.invalid.length, 1);
});

test('exercise settings flow down to items, and items can override them', () => {
  const result = flattenLesson(
    {
      exercises: [
        {
          id: 'ex1',
          type: 'positive_negative_question',
          presentation: 'audio',
          operation: 'negative',
          difficulty: 'hard',
          items: [item('a', { question: 'جمله را منفی کن: We play.' }), item('b', { operation: 'question', presentation: 'text' })],
        },
      ],
    },
    { book: 'iwelo-1', lesson: 'lesson-01' },
  );
  assert.equal(result.invalid.length, 0, JSON.stringify(result.invalid));
  const [first, second] = result.questions;
  assert.equal(first.presentation, 'audio');
  assert.equal(first.operation, 'negative');
  assert.equal(first.difficulty, 'hard');
  assert.equal(first.exercise, 'ex1');
  assert.equal(first.topic, 'lesson-01');
  assert.equal(second.presentation, 'text');
  assert.equal(second.operation, 'question');
});

test('an unknown exercise type is reported and its items are skipped', () => {
  const result = flattenLesson(
    { exercises: [{ id: 'bad', type: 'speaking', items: [item('x'), item('y')] }] },
    { book: 'b', lesson: 'l' },
  );
  assert.equal(result.questions.length, 0);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.total, 2);
});

test('invalid items are reported without stopping the other items', () => {
  const result = flattenLesson(
    { exercises: [{ id: 'ex', type: 'quick_translation', items: [item('good'), item('bad', { expected_answer: '' })] }] },
    { book: 'b', lesson: 'l' },
  );
  assert.deepEqual(result.questions.map((q) => q.id), ['good']);
  assert.equal(result.invalid[0].id, 'bad');
  assert.equal(result.total, 2);
});

test('duplicate ids inside one lesson are rejected', () => {
  const result = flattenLesson(
    { exercises: [{ id: 'ex', type: 'quick_translation', items: [item('same'), item('same')] }] },
    { book: 'b', lesson: 'l' },
  );
  assert.equal(result.questions.length, 1);
  assert.equal(result.invalid.length, 1);
});

test('a listening exercise with a blank is reported', () => {
  const result = flattenLesson(
    { exercises: [{ id: 'ex', type: 'dictation', items: [item('blank', { question: 'I ___ a student.' })] }] },
    { book: 'b', lesson: 'l' },
  );
  assert.equal(result.questions.length, 0);
  assert.ok(result.invalid[0].errors.some((e) => e.includes('___')));
});

test('filters select by book and lesson; the same lesson number in two books stays apart', () => {
  const questions = [
    { id: '1', book: 'iwelo-1', lesson: 'lesson-01', category: 'quick_translation', enabled: true },
    { id: '2', book: 'iwelo-1', lesson: 'lesson-02', category: 'quick_translation', enabled: true },
    { id: '3', book: 'iwelo-2', lesson: 'lesson-01', category: 'quick_translation', enabled: true },
    { id: '4', book: 'iwelo-1', lesson: 'lesson-01', category: 'dictation', enabled: false },
  ];
  assert.deepEqual(
    filterQuestions(questions, { books: ['iwelo-1'] }).map((q) => q.id),
    ['1', '2'],
  );
  assert.deepEqual(
    filterQuestions(questions, { books: ['iwelo-1'], lessons: ['iwelo-1/lesson-01'] }).map((q) => q.id),
    ['1'],
  );
  assert.deepEqual(
    filterQuestions(questions, { lessons: ['iwelo-2/lesson-01'] }).map((q) => q.id),
    ['3'],
  );
  assert.deepEqual(filterQuestions(questions, { books: [] }), []);
});
