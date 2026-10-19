import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlayMode, PLAY_MODES, GameSession } from '../js/engine/game-engine.js';

const question = { id: 'a', time_limit: 60, points: 10, expected_answer: 'yes', accepted_answers: ['yes'] };

test('easy keeps the question as it is', () => {
  assert.equal(applyPlayMode(question, 'easy'), question);
  assert.equal(applyPlayMode(question), question);
  assert.equal(applyPlayMode(question, 'unknown'), question);
});

test('the time is split into three steps: full, two thirds, one third', () => {
  assert.equal(applyPlayMode(question, 'medium').time_limit, 40);
  assert.equal(applyPlayMode(question, 'hard').time_limit, 20);
  assert.equal(applyPlayMode({ ...question, time_limit: 20 }, 'hard').time_limit, 7);
});

test('the points grow with the mode: a little more in medium, more again in hard', () => {
  const medium = applyPlayMode(question, 'medium').points;
  const hard = applyPlayMode(question, 'hard').points;
  assert.equal(medium, 13);
  assert.equal(hard, 15);
  assert.ok(medium > question.points && hard > medium);
});

test('the time limit never drops below five seconds', () => {
  assert.equal(applyPlayMode({ ...question, time_limit: 5 }, 'hard').time_limit, 5);
});

test('the original question is not changed', () => {
  applyPlayMode(question, 'hard');
  assert.equal(question.time_limit, 60);
  assert.equal(question.points, 10);
});

test('the modes are exactly easy, medium and hard', () => {
  assert.deepEqual(Object.keys(PLAY_MODES), ['easy', 'medium', 'hard']);
});

test('a session in hard mode scores the scaled points', () => {
  const session = new GameSession([applyPlayMode(question, 'hard')], { clock: () => 0 });
  assert.equal(session.submit('yes').points, 15);
  assert.equal(session.summary().maxScore, 15);
});
