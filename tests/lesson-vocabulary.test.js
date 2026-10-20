import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenLesson } from '../js/bank/content.js';
import { lessonWords, lessonSentences } from '../js/bank/lesson-vocabulary.js';

const lessonFile = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01.json', import.meta.url), 'utf8'));
const questions = flattenLesson(lessonFile, { book: 'evolve-1', lesson: 'lesson-01' }).questions;

test('words come from dictation items with their meaning, sorted alphabetically', () => {
  const words = lessonWords([
    { category: 'dictation', expected_answer: 'synonym', hint: 'مترادف' },
    { category: 'dictation', expected_answer: 'Opposite', hint: 'متضاد' },
    { category: 'quick_translation', expected_answer: 'My first name is Ali.', hint: 'x' },
  ]);
  assert.deepEqual(words, [
    { word: 'Opposite', meaning: 'متضاد' },
    { word: 'synonym', meaning: 'مترادف' },
  ]);
});

test('a word repeated in different questions is listed once, and keeps a meaning if one has it', () => {
  const words = lessonWords([
    { category: 'dictation', expected_answer: 'teacher', hint: '' },
    { category: 'positive_negative_question', expected_answer: 'x', glossary: [{ word: 'teacher', meaning: 'معلم' }] },
  ]);
  assert.deepEqual(words, [{ word: 'teacher', meaning: 'معلم' }]);
});

test('words without a meaning are still listed', () => {
  assert.deepEqual(lessonWords([{ category: 'dictation', expected_answer: 'road', hint: null }]), [
    { word: 'road', meaning: '' },
  ]);
});

test('sentences come from translation exercises, once each, with the Persian translation', () => {
  const sentences = lessonSentences([
    { category: 'quick_translation', expected_answer: 'This is my teacher.', translation: 'این معلم من است.' },
    { category: 'voice_translation', expected_answer: 'this is my teacher.', translation: 'این معلم من است.' },
    { category: 'dictation', expected_answer: 'synonym', translation: 'مترادف' },
    { category: 'word_translation', expected_answer: 'Help me.' },
  ]);
  assert.deepEqual(sentences, [
    { english: 'This is my teacher.', persian: 'این معلم من است.' },
    { english: 'Help me.', persian: '' },
  ]);
});

test('the lesson gives many words and sentences, and every word has a meaning', () => {
  const words = lessonWords(questions);
  const sentences = lessonSentences(questions);
  assert.ok(words.length > 50, `expected many words, got ${words.length}`);
  assert.ok(sentences.length > 50, `expected many sentences, got ${sentences.length}`);
  assert.ok(sentences.every((entry) => entry.english.length > 0));
  assert.ok(words.every((entry) => entry.word.length > 0));
});
