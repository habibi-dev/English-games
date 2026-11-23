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

const lesson201 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-02-01.json', import.meta.url), 'utf8'));
const questions201 = flattenLesson(lesson201, { book: 'evolve-1', lesson: 'lesson-02-01' }).questions;
const family = questions201.filter((q) => q.group === 'Family');
const familyVocab = lesson201.lesson_content.vocabulary.filter((w) => w.category === 'Family').map((w) => w.word);

test('lesson 2.1 has a Family practice group, and only its items carry the group', () => {
  assert.ok(family.length >= 20, `only ${family.length} questions in the Family group`);
  assert.ok(questions201.some((q) => !q.group), 'every question is in a group, so Family cannot be told apart');
});

test('every Family vocabulary word is dictated in the Family group', () => {
  const dictated = new Set(family.filter((q) => q.category === 'dictation').map((q) => q.expected_answer));
  for (const word of familyVocab) {
    assert.ok(dictated.has(word), `"${word}" is not a dictation item in the Family group`);
  }
});

test('every Family question mentions a Family vocabulary word', () => {
  const words = familyVocab.map((word) => word.toLowerCase());
  for (const q of family) {
    const text = [q.question, q.expected_answer, q.translation, ...(q.accepted_answers ?? [])]
      .join(' ')
      .toLowerCase();
    assert.ok(
      words.some((word) => text.includes(word)),
      `question ${q.id} is in the Family group but has no Family word: "${q.question}"`,
    );
  }
});

const numbers = questions201.filter((q) => q.group === 'Numbers');
const numberVocab = lesson201.lesson_content.vocabulary
  .filter((w) => w.category === 'Numbers')
  .map((w) => w.word);

test('lesson 2.1 has a Numbers practice group with dictation for every number word', () => {
  assert.ok(numbers.length >= 20);
  const dictated = new Set(numbers.filter((q) => q.category === 'dictation').map((q) => q.expected_answer));
  for (const word of numberVocab) {
    assert.ok(dictated.has(word), `"${word}" is not a dictation item in the Numbers group`);
  }
});

const lesson202 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-02-02.json', import.meta.url), 'utf8'));
const questions202 = flattenLesson(lesson202, { book: 'evolve-1', lesson: 'lesson-02-02' }).questions;

for (const groupName of ['Age', 'Appearance', 'Personality']) {
  test(`lesson 2.2 has a ${groupName} practice group with dictation for every ${groupName} word`, () => {
    const vocab = lesson202.lesson_content.vocabulary
      .filter((w) => w.category === groupName)
      .map((w) => w.word);
    const group = questions202.filter((q) => q.group === groupName);
    assert.ok(group.length >= 3);
    const dictated = new Set(group.filter((q) => q.category === 'dictation').map((q) => q.expected_answer));
    for (const word of vocab) {
      assert.ok(dictated.has(word), `"${word}" is not a dictation item in the ${groupName} group`);
    }
  });
}
