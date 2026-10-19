import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_QUESTIONS, QUESTION_PROMPT } from '../js/bank/question-prompt.js';
import { importQuestions, CSV_COLUMNS } from '../js/bank/importer.js';
import { CATEGORIES } from '../js/bank/schema.js';

// Fields an author writes. "exercise" is set by lesson files only, so the prompt leaves it out.
const WRITTEN_FIELDS = [...CSV_COLUMNS.filter((field) => field !== 'exercise'), 'translation'];

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
