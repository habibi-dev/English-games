import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlockedLessons, previousLesson, reachedShare, UNLOCK_SHARE } from '../js/progress/lesson-unlock.js';

test('reachedShare is true from 75% of the questions, and false with no questions', () => {
  assert.equal(reachedShare({ done: 7, total: 10 }), false);
  assert.equal(reachedShare({ done: 8, total: 10 }), true);
  assert.equal(reachedShare({ done: 0, total: 0 }), false);
});

const KEYS = ['b/l1', 'b/l2', 'b/l3'];
// progress by lesson: { done, total }
const progressWith = (map) => (key) => map[key] ?? { done: 0, total: 10 };

test('the first lesson of a book is always open', () => {
  const open = unlockedLessons(KEYS, progressWith({}));
  assert.ok(open.has('b/l1'));
  assert.ok(!open.has('b/l2'));
  assert.ok(!open.has('b/l3'));
});

test('the next lesson opens only when the earlier one is at least 75% done', () => {
  assert.equal(UNLOCK_SHARE, 0.75);
  const at74 = unlockedLessons(KEYS, progressWith({ 'b/l1': { done: 7, total: 10 } }));
  assert.ok(!at74.has('b/l2'));
  const at75 = unlockedLessons(KEYS, progressWith({ 'b/l1': { done: 8, total: 10 } }));
  assert.ok(at75.has('b/l2'));
  assert.ok(!at75.has('b/l3'));
});

test('a lesson with no questions does not open the next one', () => {
  const open = unlockedLessons(KEYS, progressWith({ 'b/l1': { done: 0, total: 0 } }));
  assert.ok(!open.has('b/l2'));
});

test('once unlocked, a lesson stays open even when its progress drops again', () => {
  const stored = new Set(['b/l1', 'b/l2']);
  // The first lesson is back to 0% (its answers are due again); the second one stays open.
  const open = unlockedLessons(KEYS, progressWith({ 'b/l1': { done: 0, total: 10 } }), stored);
  assert.ok(open.has('b/l2'));
});

test('a started lesson is open, even when the lesson before it is not done', () => {
  const open = unlockedLessons(KEYS, progressWith({ 'b/l3': { done: 2, total: 10 } }));
  assert.ok(open.has('b/l3'));
  assert.ok(!open.has('b/l2'));
});

test('an unlock chain follows the course order, one lesson at a time', () => {
  const open = unlockedLessons(
    KEYS,
    progressWith({ 'b/l1': { done: 10, total: 10 }, 'b/l2': { done: 8, total: 10 } }),
  );
  assert.deepEqual([...open].sort(), ['b/l1', 'b/l2', 'b/l3']);
});

test('the result keeps the stored keys and does not change the stored set', () => {
  const stored = new Set(['b/l2']);
  const open = unlockedLessons(KEYS, progressWith({}), stored);
  assert.ok(open.has('b/l2'));
  assert.deepEqual([...stored], ['b/l2']);
});

test('previousLesson gives the lesson before, and null for the first or an unknown lesson', () => {
  assert.equal(previousLesson(KEYS, 'b/l2'), 'b/l1');
  assert.equal(previousLesson(KEYS, 'b/l1'), null);
  assert.equal(previousLesson(KEYS, 'b/none'), null);
});
