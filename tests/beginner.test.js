import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeQuestion, validateQuestion } from '../js/bank/schema.js';
import { importQuestions, serializeQuestions } from '../js/bank/importer.js';

const BEGINNER = new URL('../banks/beginner_question_bank.json', import.meta.url);

test('beginner bank imports with no invalid rows and no warnings', () => {
  const result = importQuestions(readFileSync(BEGINNER, 'utf8'));
  assert.equal(result.total, 120);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.questions.every((q) => q.difficulty === 'easy'));
});

test('glossary accepts "word=meaning" strings and objects', () => {
  const fromStrings = normalizeQuestion({ id: 'g1', glossary: ['work = کار کردن', 'leave=رفتن'] });
  assert.deepEqual(fromStrings.glossary, [
    { word: 'work', meaning: 'کار کردن' },
    { word: 'leave', meaning: 'رفتن' },
  ]);
  const fromObjects = normalizeQuestion({ id: 'g2', glossary: [{ word: 'busy', meaning: 'مشغول' }] });
  assert.deepEqual(fromObjects.glossary, [{ word: 'busy', meaning: 'مشغول' }]);
  assert.deepEqual(normalizeQuestion({ id: 'g3' }).glossary, []);
});

test('glossary entry without meaning is a warning, not an error', () => {
  const q = normalizeQuestion({
    id: 'g4',
    category: 'quick_translation',
    topic: 'to_be',
    difficulty: 'easy',
    question: 'x',
    expected_answer: 'I am busy.',
    glossary: ['busy'],
  });
  const { errors, warnings } = validateQuestion(q);
  assert.equal(errors.length, 0);
  assert.ok(warnings.some((w) => w.includes('busy')));
});

test('bank tag is preserved by normalizeQuestion only when provided', () => {
  assert.equal(normalizeQuestion({ id: 'b1', bank: 'beginner' }).bank, 'beginner');
  assert.equal('bank' in normalizeQuestion({ id: 'b2' }), false);
});

test('CSV round trip keeps glossary and bank columns', () => {
  const q = normalizeQuestion({
    id: 'c1',
    category: 'quick_translation',
    topic: 'do_does',
    difficulty: 'easy',
    question: 'They leave at nine.',
    expected_answer: 'They leave at nine.',
    glossary: [{ word: 'leave', meaning: 'رفتن' }, { word: 'nine', meaning: 'نه' }],
    bank: 'beginner',
  });
  const csv = serializeQuestions([q], 'csv');
  assert.ok(csv.includes('leave=رفتن | nine=نه'));
  assert.ok(!csv.includes('[object Object]'));
  const back = importQuestions(csv, 'csv');
  assert.equal(back.invalid.length, 0);
  assert.deepEqual(back.questions[0].glossary, q.glossary);
  assert.equal(back.questions[0].bank, 'beginner');
});
