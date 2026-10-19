import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doneIds, progressOf, markPractice, isPracticeQuestion } from '../js/progress/lesson-progress.js';
import { playerProfile } from '../js/progress/player.js';
import { GameSession } from '../js/engine/game-engine.js';

const LESSON = 'evolve-1/lesson-01';
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

test('only correct answers count as done', () => {
  const questions = [q('a'), q('b')];
  const attempts = [
    { questionId: 'a', correct: true, at: 100 },
    { questionId: 'b', correct: false, at: 100 },
  ];
  assert.deepEqual([...doneIds(questions, attempts)], ['a']);
});

test('a reset starts a new round: earlier correct answers no longer count', () => {
  const questions = [q('a')];
  const attempts = [{ questionId: 'a', correct: true, at: 100 }];
  assert.deepEqual([...doneIds(questions, attempts, { [LESSON]: 200 })], []);

  attempts.push({ questionId: 'a', correct: true, at: 300 });
  assert.deepEqual([...doneIds(questions, attempts, { [LESSON]: 200 })], ['a']);
});

test('attempts of questions that no longer exist are ignored', () => {
  assert.deepEqual([...doneIds([q('a')], [{ questionId: 'gone', correct: true, at: 1 }])], []);
});

test('progress counts enabled questions only and reports completion', () => {
  const questions = [q('a'), q('b'), q('c', 'lesson-01', { enabled: false })];
  assert.deepEqual(progressOf(questions, new Set(['a'])), { done: 1, total: 2, percent: 50, complete: false });
  assert.deepEqual(progressOf(questions, new Set(['a', 'b'])), { done: 2, total: 2, percent: 100, complete: true });
  assert.deepEqual(progressOf([], new Set()), { done: 0, total: 0, percent: 0, complete: false });
});

test('questions of a reset lesson are practice; other lessons are not', () => {
  const resets = { [LESSON]: 100 };
  assert.equal(isPracticeQuestion(q('a'), resets), true);
  assert.equal(isPracticeQuestion(q('b', 'lesson-02'), resets), false);
  const [marked, untouched] = markPractice([q('a'), q('b', 'lesson-02')], resets);
  assert.equal(marked.practice, true);
  assert.equal(untouched.practice, undefined);
});

test('practice attempts add no XP, answers or streak to the player profile', () => {
  const profile = playerProfile([
    { correct: true, points: 50, at: 1 },
    { correct: true, points: 50, practice: true, at: 2 },
    { correct: false, points: 0, practice: true, at: 3 },
  ]);
  assert.equal(profile.xp, 50);
  assert.equal(profile.answered, 1);
  assert.equal(profile.accuracy, 1);
});

test('practice questions pay no points, normal ones do', () => {
  const normal = new GameSession([q('a')], { clock: () => 0 });
  assert.equal(normal.submit('yes').points, 10);

  const practice = new GameSession([{ ...q('b'), practice: true }], { clock: () => 0 });
  const outcome = practice.submit('yes');
  assert.equal(outcome.correct, true);
  assert.equal(outcome.points, 0);
});
