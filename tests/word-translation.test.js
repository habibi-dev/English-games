import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenLesson } from '../js/bank/content.js';
import { normalizeQuestion, validateQuestion, CATEGORIES } from '../js/bank/schema.js';
import { validateAnswer } from '../js/engine/validator.js';

const lessonFile = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01.json', import.meta.url), 'utf8'));

test('word translation is a known exercise type', () => {
  assert.ok(CATEGORIES.word_translation);
});

test('word translation keeps its Persian words and makes the question from them', () => {
  const q = normalizeQuestion({
    id: 'wt-1',
    category: 'word_translation',
    topic: 'to_be',
    difficulty: 'easy',
    book: 'b',
    lesson: 'l',
    word_bank: ['این', 'معلم', 'من', 'است'],
    expected_answer: 'This is my teacher.',
    explanation: 'e',
  });
  assert.deepEqual(q.word_bank, ['این', 'معلم', 'من', 'است']);
  assert.equal(q.question, 'این معلم من است.');
  assert.deepEqual(validateQuestion(q).errors, []);
});

test('word translation needs at least two words', () => {
  const q = normalizeQuestion({
    id: 'wt-2',
    category: 'word_translation',
    topic: 'to_be',
    difficulty: 'easy',
    book: 'b',
    lesson: 'l',
    word_bank: ['معلم'],
    expected_answer: 'Teacher.',
    explanation: 'e',
  });
  assert.ok(validateQuestion(q).errors.some((e) => e.includes('word_bank')));
});

test('word translation is typed, so the answer is checked like a translation', () => {
  const q = normalizeQuestion({
    id: 'wt-3',
    category: 'word_translation',
    topic: 'to_be',
    difficulty: 'easy',
    book: 'b',
    lesson: 'l',
    word_bank: ['این', 'معلم', 'من', 'است'],
    expected_answer: 'This is my teacher.',
    explanation: 'e',
  });
  assert.equal(validateAnswer(q, 'this is my teacher').correct, true);
  assert.equal(validateAnswer(q, 'This is your teacher.').correct, false);
});

test('the lesson file has a word translation exercise and every item in it is valid', () => {
  const result = flattenLesson(lessonFile, { book: 'evolve-1', lesson: 'lesson-01' });
  assert.deepEqual(result.invalid, []);
  const words = result.questions.filter((q) => q.category === 'word_translation');
  // The first 10 plus every other sentence of the lesson that has a Persian text (see the merged sentence pool).
  assert.equal(words.length, 149);
  assert.ok(words.every((q) => q.presentation === 'text' && q.word_bank.length >= 2));
});

test('the lesson file has no Persian in the expected answers of translation items', () => {
  const result = flattenLesson(lessonFile, { book: 'evolve-1', lesson: 'lesson-01' });
  const persian = /[\u0600-\u06FF]/;
  const typed = result.questions.filter((q) => ['quick_translation', 'word_translation'].includes(q.category));
  assert.ok(typed.length > 0);
  assert.ok(typed.every((q) => !persian.test(q.expected_answer)));
});
