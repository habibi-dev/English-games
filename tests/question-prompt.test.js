import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLE_QUESTIONS, QUESTION_PROMPT } from '../js/bank/question-prompt.js';
import { importQuestions, CSV_COLUMNS } from '../js/bank/importer.js';
import { CATEGORIES } from '../js/bank/schema.js';
import { indexLessons } from '../js/bank/content.js';

// Fields an author writes. "exercise" is set by lesson files only, so the prompt leaves it out.
const WRITTEN_FIELDS = [...CSV_COLUMNS.filter((field) => field !== 'exercise'), 'translation'];

const COURSE_INDEX = JSON.parse(readFileSync(new URL('../content/index.json', import.meta.url), 'utf8'));

test('the examples in the prompt pass the same import as a real file', () => {
  const result = importQuestions(JSON.stringify({ questions: EXAMPLE_QUESTIONS }));
  assert.deepEqual(result.invalid, []);
  assert.equal(result.questions.length, EXAMPLE_QUESTIONS.length);
  assert.deepEqual(result.warnings, []);
});

test('the prompt names every exercise type the game accepts', () => {
  for (const key of Object.keys(CATEGORIES)) {
    assert.ok(QUESTION_PROMPT.includes(key), `missing ${key}`);
  }
});

test('the examples cover every exercise type', () => {
  const used = new Set(EXAMPLE_QUESTIONS.map((q) => q.category));
  assert.deepEqual([...used].sort(), Object.keys(CATEGORIES).sort());
});

test('the prompt documents every field the importer reads', () => {
  for (const field of WRITTEN_FIELDS) {
    assert.ok(QUESTION_PROMPT.includes(`- ${field}:`), `missing field ${field}`);
  }
});

test('every example has the Persian translation and explanation the bank expects', () => {
  for (const q of EXAMPLE_QUESTIONS) {
    assert.ok(q.translation, `${q.id} has no translation`);
    assert.ok(q.explanation, `${q.id} has no explanation`);
  }
});

test('the prompt embeds the examples as JSON', () => {
  assert.ok(QUESTION_PROMPT.includes('"example-tr-01"'));
});

test('every example points at a lesson that exists in content/index.json', () => {
  const lessons = new Set(indexLessons(COURSE_INDEX).map((entry) => `${entry.book}/${entry.lesson}`));
  for (const q of EXAMPLE_QUESTIONS) {
    assert.ok(lessons.has(`${q.book}/${q.lesson}`), `${q.id} points at ${q.book}/${q.lesson}, which is not in the index`);
  }
});

test('the prompt explains the course levels and forbids a unit field', () => {
  assert.ok(QUESTION_PROMPT.includes('series > book > unit > lesson'));
  assert.ok(QUESTION_PROMPT.includes('Do not write a unit field'));
  assert.ok(QUESTION_PROMPT.includes('content/index.json'));
});
