import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTranscript } from '../js/ui/answer-widgets.js';

const question = { answer_mode: 'single', accepted_answers: ['He eats.'] };

test('the first alternative that is a correct answer wins, ignoring case and final punctuation', () => {
  assert.equal(pickTranscript(['he eat', 'He eats'], question), 'He eats');
  assert.equal(pickTranscript(['He eats!', 'he is eating'], question), 'He eats!');
});

test('when no alternative is correct, the top guess is used', () => {
  assert.equal(pickTranscript(['he eat', 'he is eating'], question), 'he eat');
});

test('empty or blank alternatives give an empty transcript', () => {
  assert.equal(pickTranscript([], question), '');
  assert.equal(pickTranscript(['   '], question), '');
});

test('without a question, the top guess is used', () => {
  assert.equal(pickTranscript([' He eats ', 'x']), 'He eats');
});

test('list answers: an alternative with all the items is preferred', () => {
  const list = { answer_mode: 'list', min_items: 2, accepted_answers: ['large', 'huge'] };
  assert.equal(pickTranscript(['large', 'large huge'], list), 'large huge');
});
