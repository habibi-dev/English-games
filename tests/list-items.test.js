import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswer } from '../js/engine/validator.js';

// "Name 2 synonyms of big": any two of the accepted items, separated by a comma, a space or "+".
const synonyms = { answer_mode: 'list', min_items: 2, accepted_answers: ['large', 'huge', 'great'] };

test('items can be separated by spaces, commas or "+"', () => {
  for (const reply of ['large huge', 'large, huge', 'large,huge', 'large + huge', 'large/huge', 'large؛ huge']) {
    assert.equal(validateAnswer(synonyms, reply).correct, true, reply);
  }
});

test('the count of different accepted items decides, not how often one is typed', () => {
  const verdict = validateAnswer(synonyms, 'large large');
  assert.equal(verdict.correct, false);
  assert.deepEqual(verdict.matchedItems, ['large']);
});

test('extra items that are not accepted do not make a correct reply wrong', () => {
  assert.equal(validateAnswer(synonyms, 'large huge tiny').correct, true);
});

test('a letter run is not split into items', () => {
  assert.equal(validateAnswer(synonyms, 'largehuge').correct, false);
  assert.equal(validateAnswer(synonyms, 'largehuge').matchedItems.length, 0);
});

test('a longer accepted item wins over a shorter one inside it', () => {
  const phrases = { answer_mode: 'list', min_items: 2, accepted_answers: ['very large', 'large', 'huge'] };
  // "very large" is one item; "large" inside it is not counted again, so only one item plus "huge" remains.
  const verdict = validateAnswer(phrases, 'very large huge');
  assert.deepEqual(verdict.matchedItems.sort(), ['huge', 'very large']);
  assert.equal(verdict.correct, true);
  assert.equal(validateAnswer(phrases, 'very large').correct, false);
});

test('a single answer still has to match exactly', () => {
  const single = { accepted_answers: ['She is my sister.'] };
  assert.equal(validateAnswer(single, 'she is my sister').correct, true);
  assert.equal(validateAnswer(single, 'she is my sister huge').correct, false);
});
