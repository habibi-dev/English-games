import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSpellWithLetters,
  spellingModesFor,
  pickSpellingMode,
  applySpellingMode,
  scrambleLetters,
} from '../js/engine/spelling.js';
import { persianSentence } from '../js/bank/schema.js';

const word = (expected, extra = {}) => ({
  id: 'd1',
  category: 'dictation',
  presentation: 'audio',
  expected_answer: expected,
  hint: 'فهمیدن',
  ...extra,
});

// A random source that always returns the same value.
const fixed = (value) => () => value;

test('letters mode is only for one plain word of at least three letters', () => {
  assert.equal(canSpellWithLetters(word('help')), true);
  assert.equal(canSpellWithLetters(word('give me a hand')), false);
  assert.equal(canSpellWithLetters(word('check in')), false);
  assert.equal(canSpellWithLetters(word('I, you, he')), false);
  assert.equal(canSpellWithLetters(word('my bad')), false);
  assert.equal(canSpellWithLetters(word('I')), false);
});

test('a word with a hint can be spelled in all three modes, without a hint only in two', () => {
  assert.deepEqual(spellingModesFor(word('help')), ['audio', 'meaning', 'letters']);
  assert.deepEqual(spellingModesFor(word('help', { hint: '' })), ['audio', 'letters']);
  assert.deepEqual(spellingModesFor(word('check in')), ['audio', 'meaning']);
});

test('the random choice picks from the word modes', () => {
  assert.equal(pickSpellingMode(word('help'), fixed(0)), 'audio');
  assert.equal(pickSpellingMode(word('help'), fixed(0.5)), 'meaning');
  assert.equal(pickSpellingMode(word('help'), fixed(0.99)), 'letters');
});

test('applying a mode sets the presentation of a dictation word only', () => {
  const spelled = applySpellingMode(word('help'), fixed(0.99));
  assert.equal(spelled.presentation, 'letters');
  assert.equal(spelled.expected_answer, 'help');

  const other = { id: 't1', category: 'quick_translation', presentation: 'text' };
  assert.equal(applySpellingMode(other, fixed(0.99)), other);
});

test('the letters are the same letters, in a different order', () => {
  const letters = scrambleLetters('teacher', fixed(0.3));
  assert.deepEqual([...letters].sort(), [...'teacher'].sort());
  assert.notEqual(letters.join(''), 'teacher');
});

test('a single repeated letter cannot be scrambled into a different order, so it is returned as it is', () => {
  assert.deepEqual(scrambleLetters('aaa', fixed(0.5)), ['a', 'a', 'a']);
});

test('the persian sentence is made from its parts, with a full stop at the end', () => {
  assert.equal(persianSentence(['من', 'یک شریک', 'هستم']), 'من یک شریک هستم.');
  assert.equal(persianSentence(['آیا', 'این', 'معلم', 'است؟']), 'آیا این معلم است؟');
  assert.equal(persianSentence([]), '');
});
