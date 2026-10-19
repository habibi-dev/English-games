import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_QUESTIONS, QUESTION_PROMPT } from '../js/bank/question-prompt.js';
import { importQuestions } from '../js/bank/importer.js';
import { CATEGORIES } from '../js/bank/schema.js';

test('the examples in the prompt pass the same import as a real file', () => {
  const result = importQuestions(JSON.stringify({ questions: EXAMPLE_QUESTIONS }));
  assert.deepEqual(result.invalid, []);
  assert.equal(result.questions.length, EXAMPLE_QUESTIONS.length);
});

test('the prompt names every exercise type the game accepts', () => {
  for (const key of Object.keys(CATEGORIES)) {
    assert.ok(QUESTION_PROMPT.includes(key), `missing ${key}`);
  }
});

test('the prompt embeds the examples as JSON', () => {
  assert.ok(QUESTION_PROMPT.includes('"example-tr-01"'));
});
