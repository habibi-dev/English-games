import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalXp, levelFor, levelProgress, bestStreak, playerProfile, starsFor } from '../js/progress/player.js';

const attempt = (id, correct, points = 10) => ({ id, at: id, correct, points });

test('XP counts points of correct answers only', () => {
  const attempts = [attempt(1, true, 10), attempt(2, false, 15), attempt(3, true, 20)];
  assert.equal(totalXp(attempts), 30);
});

test('level goes up every 100 XP and progress shows the share toward the next level', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(levelProgress(150), 0.5);
});

test('best streak is the longest run of correct answers in order', () => {
  const attempts = [attempt(1, true), attempt(2, true), attempt(3, false), attempt(4, true), attempt(5, true), attempt(6, true)];
  assert.equal(bestStreak(attempts), 3);
  assert.equal(bestStreak([]), 0);
});

test('profile with no attempts has no accuracy yet', () => {
  const profile = playerProfile([]);
  assert.equal(profile.level, 1);
  assert.equal(profile.accuracy, null);
  assert.equal(profile.answered, 0);
});

test('profile accuracy is correct over answered', () => {
  const profile = playerProfile([attempt(1, true), attempt(2, false), attempt(3, true), attempt(4, true)]);
  assert.equal(profile.accuracy, 0.75);
  assert.equal(profile.answered, 4);
});

test('stars follow the session accuracy thresholds', () => {
  assert.equal(starsFor(9, 10), 3);
  assert.equal(starsFor(7, 10), 2);
  assert.equal(starsFor(4, 10), 1);
  assert.equal(starsFor(3, 10), 0);
  assert.equal(starsFor(0, 0), 0);
});
