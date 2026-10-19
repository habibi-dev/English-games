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
  // "I'm" is not "I am" unless the data lists it: the app does not rewrite forms.
  assert.equal(validateAnswer(q, "I'm a developer").correct, false);
});

test('accepts any listed answer and reports which one matched', () => {
  const multi = { accepted_answers: ['We are ready.', 'We are all ready.'] };
  const verdict = validateAnswer(multi, 'we are all READY');
  assert.equal(verdict.correct, true);
  assert.equal(verdict.matched, 'We are all ready.');
});

test('empty answers are never correct', () => {
  assert.deepEqual(validateAnswer(q, '   '), { correct: false, matched: null, matchedItems: [], reason: 'empty' });
  assert.equal(validateAnswer(q, undefined).correct, false);
});

test('curly apostrophes from keyboards or speech still match straight ones', () => {
  assert.equal(validateAnswer(q, 'She isn’t happy').correct, true);
});

test('normalizeAnswer strips only terminal punctuation', () => {
  assert.equal(normalizeAnswer(' Does she work? '), 'does she work');
  assert.equal(normalizeAnswer('Do you know Mr. Lee'), 'do you know mr. lee');
});

test('commas do not matter, so spoken answers without them still match', () => {
  const sorry = { accepted_answers: ['Sorry, what page?'] };
  assert.equal(validateAnswer(sorry, 'Sorry what page').correct, true);
  assert.equal(validateAnswer(sorry, 'sorry, what page').correct, true);
  assert.equal(validateAnswer(sorry, 'Sorry , what page').correct, true);
  assert.equal(validateAnswer(sorry, 'what Sorry page').correct, false);
  const please = { accepted_answers: ['Can you repeat that, please?'] };
  assert.equal(validateAnswer(please, 'Can you repeat that please').correct, true);
});

test('Persian comma is ignored too, and digit groups keep their commas', () => {
  assert.equal(normalizeAnswer('Sorry، what page'), 'sorry what page');
  assert.equal(normalizeAnswer('It costs 1,000 dollars'), 'it costs 1,000 dollars');
});
