import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, validateAnswer } from '../js/engine/validator.js';

const q = { accepted_answers: ['I am a developer.', "She isn't happy."] };

test('ignores letter case, extra spaces and terminal punctuation', () => {
  assert.equal(validateAnswer(q, 'i   AM a developer').correct, true);
  assert.equal(validateAnswer(q, '  I am a developer!  ').correct, true);
  assert.equal(validateAnswer(q, 'I am a developer').correct, true);
});

test('keeps word order significant', () => {
  assert.equal(validateAnswer(q, 'a developer I am').correct, false);
});

test('rejects grammar errors unless they are listed as accepted', () => {
  assert.equal(validateAnswer(q, 'I is a developer').correct, false);
  assert.equal(validateAnswer(q, 'I am developers').correct, false);
  assert.equal(validateAnswer(q, "I'm a developer").correct, false);
});

test('accepts any listed answer and reports which one matched', () => {
  const multi = { accepted_answers: ['We are ready.', 'We are all ready.'] };
  const verdict = validateAnswer(multi, 'we are all READY');
  assert.equal(verdict.correct, true);
  assert.equal(verdict.matched, 'We are all ready.');
});

test('empty answers are never correct', () => {
  assert.deepEqual(validateAnswer(q, '   '), { correct: false, matched: null, reason: 'empty' });
  assert.equal(validateAnswer(q, undefined).correct, false);
});

test('curly apostrophes from keyboards or speech still match straight ones', () => {
  assert.equal(validateAnswer(q, 'She isn’t happy').correct, true);
});

test('normalizeAnswer strips only terminal punctuation', () => {
  assert.equal(normalizeAnswer(' Does she work? '), 'does she work');
  assert.equal(normalizeAnswer('Do you know Mr. Lee'), 'do you know mr. lee');
});
