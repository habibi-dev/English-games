import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuestions, pickQuestions, GameSession } from '../js/engine/game-engine.js';

const make = (id, extra = {}) => ({
  id,
  category: 'quick_translation',
  topic: 'to_be',
  difficulty: 'easy',
  question: `q ${id}`,
  expected_answer: 'I am a developer.',
  accepted_answers: ['I am a developer.'],
  explanation: 'why',
  points: 10,
  time_limit: 15,
  enabled: true,
  ...extra,
});

const bank = [
  make('a'),
  make('b', { topic: 'do_does', category: 'multiple_choice', points: 20, time_limit: 25 }),
  make('c', { enabled: false }),
  make('d', { difficulty: 'hard', points: 20 }),
];

test('filters ignore disabled questions and respect each filter', () => {
  assert.deepEqual(filterQuestions(bank).map((q) => q.id), ['a', 'b', 'd']);
  assert.deepEqual(filterQuestions(bank, { topics: ['do_does'] }).map((q) => q.id), ['b']);
  assert.deepEqual(filterQuestions(bank, { difficulties: [] }), []);
  assert.deepEqual(filterQuestions(bank, { categories: ['multiple_choice'] }).map((q) => q.id), ['b']);
});

test('pickQuestions honours count and returns a shuffled copy', () => {
  const picked = pickQuestions(bank, {}, { count: 2, random: () => 0 });
  assert.equal(picked.length, 2);
  assert.equal(bank.length, 4);
});

test('a correct answer scores the question points and is recorded', () => {
  let now = 0;
  const session = new GameSession(bank, { clock: () => now });
  const outcome = session.submit('i am a developer');
  assert.equal(outcome.correct, true);
  assert.equal(outcome.points, 10);
  assert.equal(session.answered, true);
  assert.equal(session.summary().score, 10);
});

test('a wrong answer scores 0 and the flow waits for next()', () => {
  const session = new GameSession(bank);
  const outcome = session.submit('I is a developer');
  assert.equal(outcome.correct, false);
  assert.equal(outcome.points, 0);
  assert.throws(() => session.submit('again'), /already been answered/);
  session.next();
  assert.equal(session.index, 1);
  assert.equal(session.answered, false);
});

test('next() is refused before the current question is answered', () => {
  const session = new GameSession(bank);
  assert.throws(() => session.next());
});

test('timeout is recorded as a wrong answer with timedOut set', () => {
  let now = 1000;
  const session = new GameSession([make('t', { time_limit: 2 })], { clock: () => now });
  assert.equal(session.remainingMs(), 2000);
  now = 3000;
  assert.equal(session.remainingMs(), 0);
  const outcome = session.timeout();
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.correct, false);
  assert.equal(outcome.elapsedMs, 2000);
});

test('summary and finish state after the last question', () => {
  const session = new GameSession([make('x'), make('y', { points: 20 })]);
  session.submit('I am a developer.');
  session.next();
  session.timeout();
  session.next();
  assert.equal(session.finished, true);
  assert.equal(session.current, null);
  assert.deepEqual(
    (({ answered, correct, wrong, timeouts, score, maxScore }) => ({ answered, correct, wrong, timeouts, score, maxScore }))(session.summary()),
    { answered: 2, correct: 1, wrong: 1, timeouts: 1, score: 10, maxScore: 30 },
  );
  assert.throws(() => session.timeout(), /already finished/);
});

test('a wrong answer is not asked again in the same mission', () => {
  const session = new GameSession([make('x'), make('y')]);
  session.submit('wrong');
  session.next();
  assert.equal(session.total, 2);
  assert.equal(session.current.question.id, 'y');
  session.submit('I am a developer.');
  session.next();
  assert.equal(session.finished, true);
});

test('a question answered correctly is not asked again in the same mission', () => {
  const session = new GameSession([make('x'), make('y')]);
  session.submit('I am a developer.');
  session.next();
  assert.equal(session.total, 2);
});

test('a question that already gave points pays nothing on a correct answer', () => {
  const session = new GameSession([make('x')], { alreadyScored: ['x'] });
  const outcome = session.submit('I am a developer.');
  assert.equal(outcome.correct, true);
  assert.equal(outcome.points, 0);
  assert.equal(session.summary().score, 0);
});

test('the same question inside one session pays only once', () => {
  const session = new GameSession([make('x'), make('x')]);
  assert.equal(session.submit('I am a developer.').points, 10);
  session.next();
  assert.equal(session.submit('I am a developer.').points, 0);
});
