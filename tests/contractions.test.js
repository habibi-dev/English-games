import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswer } from '../js/engine/validator.js';
import { tokenize } from '../js/bank/schema.js';

// The app never rewrites forms: a reply is correct only if it matches a listed accepted answer.
// Equivalent forms (contracted and full) are therefore listed in the data, not guessed by the app.

test('a form that is not listed is not accepted', () => {
  const onlyFull = { accepted_answers: ['Ali is not from Germany.'] };
  assert.equal(validateAnswer(onlyFull, 'Ali is not from Germany').correct, true);
  assert.equal(validateAnswer(onlyFull, "Ali isn't from Germany").correct, false);
});

test('when both forms are listed, either one is accepted', () => {
  const both = { accepted_answers: ['Ali is not from Germany.', "Ali isn't from Germany."] };
  assert.equal(validateAnswer(both, 'Ali is not from Germany').correct, true);
  assert.equal(validateAnswer(both, "Ali isn't from Germany").correct, true);
  assert.equal(validateAnswer(both, 'Ali is not from German').correct, false);
});

test('I am and I\'m are different strings unless both are listed', () => {
  const contracted = { accepted_answers: ["I'm a teacher."] };
  assert.equal(validateAnswer(contracted, "I'm a teacher").correct, true);
  assert.equal(validateAnswer(contracted, 'I am a teacher').correct, false);
});

test('a word bank keeps a contraction as one word', () => {
  assert.deepEqual(tokenize("Ali isn't here."), ['ali', "isn't", 'here']);
});
