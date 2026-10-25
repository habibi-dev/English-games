import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenLesson } from '../js/bank/content.js';
import { normalizeQuestion } from '../js/bank/schema.js';
import { filterQuestions } from '../js/engine/game-engine.js';

const lesson11 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01-01.json', import.meta.url), 'utf8'));
const questions = flattenLesson(lesson11, { book: 'evolve-1', lesson: 'lesson-01-01' }).questions;
const chart = lesson11.lesson_content.country_chart;
const countries = questions.filter((q) => q.group === 'Countries');

// The general words of the group, as the vocabulary names them (see the new-lesson-content rules).
const GENERAL_WORDS = ['country', 'capital city', 'nationality', 'nationalities'];

test('lesson 1.1 has a Countries practice group, and only its items carry the group', () => {
  assert.ok(countries.length >= 80, `only ${countries.length} questions in the Countries group`);
  assert.ok(questions.some((q) => !q.group), 'every question is in a group, so Countries cannot be told apart');
});

test('every country, capital city and nationality of the chart is dictated in the Countries group', () => {
  const dictated = new Set(countries.filter((q) => q.category === 'dictation').map((q) => q.expected_answer));
  for (const row of chart) {
    for (const word of [row.capital_city, row.country, row.nationality]) {
      // Names with non-English letters (for example Bogotá) are not typed or spoken,
      // so they are practiced in a multiple choice item of the group instead.
      if (/[^\x00-\x7F]/.test(word)) {
        assert.ok(
          countries.some((q) => q.category === 'multiple_choice' && (q.expected_answer === word || (q.question ?? '').includes(word))),
          `"${word}" is not in a multiple choice item of the Countries group`,
        );
        continue;
      }
      assert.ok(dictated.has(word), `"${word}" is not a dictation item in the Countries group`);
    }
  }
  for (const word of GENERAL_WORDS) {
    assert.ok(dictated.has(word), `"${word}" is not a dictation item in the Countries group`);
  }
});

test('every Countries question mentions a country word of the chart or a general word', () => {
  const words = [
    ...chart.flatMap((row) => [row.capital_city, row.country, row.nationality]),
    ...GENERAL_WORDS,
  ].map((word) => word.toLowerCase());
  for (const q of countries) {
    const text = [q.question, q.expected_answer, q.translation, ...(q.accepted_answers ?? [])]
      .join(' ')
      .toLowerCase();
    assert.ok(
      words.some((word) => text.includes(word)),
      `question ${q.id} is in the Countries group but has no country word: "${q.question}"`,
    );
  }
});

test('a group filter picks only the questions of that group, and no others', () => {
  const picked = filterQuestions(questions, { groups: ['Countries'] });
  assert.deepEqual(
    picked.map((q) => q.id),
    countries.map((q) => q.id),
  );
  assert.equal(filterQuestions(questions, {}).length, questions.length);
  assert.equal(filterQuestions(questions, { groups: undefined }).length, questions.length);
  assert.deepEqual(filterQuestions(questions, { groups: [] }), []);
});

test('a question keeps its practice group when it is normalized, and a question without one has none', () => {
  assert.equal(normalizeQuestion({ category: 'dictation', expected_answer: 'Chile', group: 'Countries' }).group, 'Countries');
  assert.equal(normalizeQuestion({ category: 'dictation', expected_answer: 'Chile' }).group, undefined);
});
