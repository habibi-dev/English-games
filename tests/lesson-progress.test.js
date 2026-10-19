import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doneIds, progressOf } from '../js/progress/lesson-progress.js';
import { playerProfile } from '../js/progress/player.js';

const DAY = 24 * 60 * 60 * 1000;
const q = (id, lesson = 'lesson-01', extra = {}) => ({
  id,
  book: 'evolve-1',
  lesson,
  expected_answer: 'yes',
  accepted_answers: ['yes'],
  points: 10,
  time_limit: 20,
  enabled: true,
  category: 'quick_translation',
  ...extra,
});

test('a question answered correctly is done until its interval expires', () => {
  const questions = [q('a')];
  const attempts = [{ questionId: 'a', correct: true, at: 1000 }];
  assert.deepEqual([...doneIds(questions, attempts, 1000 + DAY - 1)], ['a']);
  assert.deepEqual([...doneIds(questions, attempts, 1000 + DAY)], []);
});

test('a wrong answer leaves the question not done', () => {
  const questions = [q('a'), q('b')];
  const attempts = [
    { questionId: 'a', correct: true, at: 100 },
    { questionId: 'b', correct: false, at: 100 },
  ];
  assert.deepEqual([...doneIds(questions, attempts, 101)], ['a']);
});

test('a question that was never answered is not done', () => {
  assert.deepEqual([...doneIds([q('a')], [], 0)], []);
});

test('each correct answer in a row makes the wait longer', () => {
  const questions = [q('a')];
  const attempts = [
    { questionId: 'a', correct: true, at: 0 },
    { questionId: 'a', correct: true, at: 2 * DAY },
  ];
  // Box 2 waits 3 days after the second correct answer.
  assert.deepEqual([...doneIds(questions, attempts, 2 * DAY + 3 * DAY - 1)], ['a']);
  assert.deepEqual([...doneIds(questions, attempts, 2 * DAY + 3 * DAY)], []);
});

test('attempts of questions that no longer exist are ignored', () => {
  assert.deepEqual([...doneIds([q('a')], [{ questionId: 'gone', correct: true, at: 1 }], 2)], []);
});

test('progress counts enabled questions only and reports completion', () => {
  const questions = [q('a'), q('b'), q('c', 'lesson-01', { enabled: false })];
  assert.deepEqual(progressOf(questions, new Set(['a'])), { done: 1, total: 2, percent: 50, complete: false });
  assert.deepEqual(progressOf(questions, new Set(['a', 'b'])), { done: 2, total: 2, percent: 100, complete: true });
  assert.deepEqual(progressOf([], new Set()), { done: 0, total: 0, percent: 0, complete: false });
});

test('practice attempts recorded before this version still add no XP, answers or streak', () => {
  const profile = playerProfile([
    { correct: true, points: 50, at: 1 },
    { correct: true, points: 50, practice: true, at: 2 },
    { correct: false, points: 0, practice: true, at: 3 },
  ]);
  assert.equal(profile.xp, 50);
  assert.equal(profile.answered, 1);
  assert.equal(profile.accuracy, 1);
});
