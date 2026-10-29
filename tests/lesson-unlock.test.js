import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlockedLessons, previousLesson, reachedShare, UNLOCK_SHARE } from '../js/progress/lesson-unlock.js';

test('reachedShare is true from 75% of the questions, and false with no questions', () => {
  assert.equal(reachedShare({ done: 7, total: 10 }), false);
  assert.equal(reachedShare({ done: 8, total: 10 }), true);
  assert.equal(reachedShare({ done: 0, total: 0 }), false);
});

const KEYS = ['b/l1', 'b/l2', 'b/l3'];

test('every lesson in the book is always open', () => {
  assert.equal(UNLOCK_SHARE, 0.75);
  const open = unlockedLessons(KEYS);
  assert.deepEqual([...open].sort(), KEYS);
});

test('previousLesson gives the lesson before, and null for the first or an unknown lesson', () => {
  assert.equal(previousLesson(KEYS, 'b/l2'), 'b/l1');
  assert.equal(previousLesson(KEYS, 'b/l1'), null);
  assert.equal(previousLesson(KEYS, 'b/none'), null);
});
