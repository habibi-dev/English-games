import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleOf, isDue, nextDueAt, missionQuestions, INTERVAL_DAYS, MAX_BOX } from '../js/progress/spaced-repetition.js';

const DAY = 24 * 60 * 60 * 1000;
const q = (id) => ({ id, enabled: true });
const ok = (questionId, at) => ({ questionId, correct: true, at });
const bad = (questionId, at) => ({ questionId, correct: false, at });

test('a new question is due at once', () => {
  assert.equal(isDue(scheduleOf([]), 'a', 0), true);
});

test('a correct answer waits the first interval, then the next correct answer waits longer', () => {
  const schedule = scheduleOf([ok('a', 0)]);
  assert.equal(isDue(schedule, 'a', DAY - 1), false);
  assert.equal(isDue(schedule, 'a', DAY), true);

  const second = scheduleOf([ok('a', 0), ok('a', DAY)]);
  // Box 2: 3 days after the second correct answer.
  assert.equal(isDue(second, 'a', DAY + 3 * DAY - 1), false);
  assert.equal(isDue(second, 'a', DAY + 3 * DAY), true);
});

test('the waits grow with every correct answer and stop at the last box', () => {
  const attempts = Array.from({ length: MAX_BOX + 3 }, (_, i) => ok('a', i));
  assert.equal(scheduleOf(attempts).get('a').box, MAX_BOX);
  assert.equal(INTERVAL_DAYS[MAX_BOX], 120);
});

test('a wrong answer or a timeout puts the question back to box 0, due at once', () => {
  const schedule = scheduleOf([ok('a', 0), ok('a', DAY), ok('a', 5 * DAY), bad('a', 6 * DAY)]);
  assert.equal(schedule.get('a').box, 0);
  assert.equal(isDue(schedule, 'a', 6 * DAY), true);
});

test('after a mistake the question comes back to box 1 with the first correct answer', () => {
  const schedule = scheduleOf([ok('a', 0), ok('a', DAY), bad('a', 2 * DAY), ok('a', 2 * DAY + 1000)]);
  assert.equal(schedule.get('a').box, 1);
  assert.equal(isDue(schedule, 'a', 2 * DAY + 1000 + DAY - 1), false);
});

test('attempts are replayed in time order, whatever their order in the list', () => {
  const schedule = scheduleOf([ok('a', DAY), ok('a', 0)]);
  assert.equal(schedule.get('a').box, 2);
  assert.equal(schedule.get('a').at, DAY);
});

test('nextDueAt is the earliest time a waiting question comes back', () => {
  const questions = [q('a'), q('b'), q('c')];
  const schedule = scheduleOf([ok('a', 0), ok('b', 0)]);
  assert.equal(nextDueAt(questions, schedule, 10), DAY);
  assert.equal(nextDueAt(questions, schedule, DAY), null);
});

test('a mission takes due questions only, reviews before new ones, and never more than count', () => {
  const questions = [q('new1'), q('new2'), q('waiting'), q('old')];
  // "old" was answered 10 days ago and is due again (box 1 waits one day).
  // "waiting" was answered at 0 and is not due yet at now = half a day.
  const schedule = scheduleOf([ok('waiting', 0), ok('old', -10 * DAY)]);
  const now = DAY / 2;
  const picked = missionQuestions(questions, schedule, now, { count: 2, random: () => 0.5 }).map((x) => x.id);
  assert.equal(picked.length, 2);
  assert.ok(picked.includes('old'), 'a due review is picked before new questions');
  assert.ok(!picked.includes('waiting'), 'questions that are not due are never picked');
});

test('a mission with count=Infinity takes every due question', () => {
  const questions = [q('a'), q('b'), q('c')];
  const schedule = scheduleOf([ok('a', 0)]);
  const picked = missionQuestions(questions, schedule, 0).map((x) => x.id).sort();
  assert.deepEqual(picked, ['b', 'c']);
});
