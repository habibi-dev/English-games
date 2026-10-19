import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeSentence, contextSentence } from '../js/ui/speech-out.js';

test('fill-in-the-blank questions read the completed sentence', () => {
  assert.equal(completeSentence({ question: 'I ___ a student.', expected_answer: 'am' }), 'I am a student.');
  assert.equal(completeSentence({ question: 'She ___ happy.', expected_answer: 'is' }), 'She is happy.');
});

test('other questions read the expected answer as the full sentence', () => {
  assert.equal(
    completeSentence({ question: 'این جمله را با کلمات بساز: من دانشجو هستم.', expected_answer: 'I am a student.' }),
    'I am a student.',
  );
  assert.equal(completeSentence({ question: 'جمله را منفی کن: I am happy.', expected_answer: 'I am not happy.' }), 'I am not happy.');
});

test('the Persian instruction is never part of the full sentence', () => {
  assert.equal(completeSentence({ question: 'جای خالی را کامل کن: It ___ .', expected_answer: 'eats' }), 'It eats.');
  assert.equal(completeSentence({ question: 'جای خالی را کامل کن: You ___.', expected_answer: 'eat' }), 'You eat.');
});

test('missing or padded values are handled', () => {
  assert.equal(completeSentence({ question: 'x ___ y.', expected_answer: '  is  ' }), 'x is y.');
  assert.equal(completeSentence({ question: '', expected_answer: '' }), '');
});

test('context sentence is the English part of the question, without the Persian prefix', () => {
  assert.equal(contextSentence({ question: 'جمله را منفی کن: I am happy.' }), 'I am happy.');
  assert.equal(contextSentence({ question: 'They live in Germany.' }), 'They live in Germany.');
});

test('no context when the question has no English on screen or still has a blank', () => {
  assert.equal(contextSentence({ question: 'من معلم هستم.' }), null);
  assert.equal(contextSentence({ question: 'I ___ a student.' }), null);
});

