import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timedPoints, GameSession } from '../js/engine/game-engine.js';

const make = (extra = {}) => ({
  id: 'x',
  category: 'quick_translation',
  topic: 'to_be',
  difficulty: 'easy',
  question: 'q',
  expected_answer: 'I am a developer.',
  accepted_answers: ['I am a developer.'],
  explanation: 'why',
  points: 10,
  time_limit: 20,
  enabled: true,
  ...extra,
});

test('a quick answer keeps the full points, and fewer points the longer it takes', () => {
  assert.equal(timedPoints(10, 0, 20000), 10);
  assert.equal(timedPoints(10, 5000, 20000), 8);
  assert.equal(timedPoints(10, 10000, 20000), 5);
  assert.equal(timedPoints(10, 15000, 20000), 3);
});

test('the points reach zero when the whole time limit is used up, and never go below', () => {
  assert.equal(timedPoints(10, 20000, 20000), 0);
  assert.equal(timedPoints(10, 99000, 20000), 0);
  assert.equal(timedPoints(10, -5, 20000), 10);
});

test('without a usable time limit the points are not reduced', () => {
  assert.equal(timedPoints(10, 9000, 0), 10);
});

test('a correct answer in a session loses points with the time it takes', () => {
  let now = 0;
  const session = new GameSession([make()], { clock: () => now });
  now = 10000;
  const outcome = session.submit('I am a developer.');
  assert.equal(outcome.points, 5);
  assert.equal(session.summary().score, 5);
  assert.equal(session.summary().maxScore, 10);
});

test('an answer given at once keeps the full points', () => {
  let now = 0;
  const session = new GameSession([make({ time_limit: 10 })], { clock: () => now });
  assert.equal(session.submit('I am a developer.').points, 10);
});
