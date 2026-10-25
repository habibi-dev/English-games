import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenLesson } from '../js/bank/content.js';
import { lessonWords, lessonSentences, lessonMaterial, buildWordStudyIndex, orderWords, wordRows } from '../js/bank/lesson-vocabulary.js';

// Names of people in the lesson's sentences and stories. They are not vocabulary words, so they are not listed in it.
const PERSON_NAMES = ['ali', 'habibi', 'bahar'];

const lessonFile = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01.json', import.meta.url), 'utf8'));
const questions = flattenLesson(lessonFile, { book: 'evolve-1', lesson: 'lesson-01' }).questions;
const content = lessonFile.lesson_content;

// The English words of a text, as the stories and the vocabulary write them (contractions kept).
const wordsOf = (text) => String(text).toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];

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

test('orderWords puts each category first in lesson order, then the other words A to Z', () => {
  const words = orderWords([
    { word: 'zebra', category: '' },
    { word: 'Country', category: 'Countries' },
    { word: 'apple', category: '' },
    { word: 'Brazil', category: 'Countries' },
  ]);
  assert.deepEqual(
    words.map((word) => word.word),
    ['Country', 'Brazil', 'apple', 'zebra'],
  );
});

test('the country words of lesson 1.1 are one category: capital city, country, nationality for each country', () => {
  const lesson11 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01-01.json', import.meta.url), 'utf8'));
  const material = lessonMaterial([], [lesson11.lesson_content]);
  const countries = material.words.filter((word) => word.category === 'Countries').map((word) => word.word);
  const chart = lesson11.lesson_content.country_chart.flatMap((row) => [row.capital_city, row.country, row.nationality]);
  assert.deepEqual(countries.slice(0, 4), ['capital city', 'country', 'nationality', 'nationalities']);
  assert.deepEqual(countries.slice(4), chart);
  // The category comes first in the list, so its words are next to each other when studied.
  assert.ok(material.words.slice(0, countries.length).every((word) => word.category === 'Countries'));
});

test('a word repeated in different questions is listed once, and keeps a meaning if one has it', () => {
  const words = lessonWords([
    { category: 'dictation', expected_answer: 'teacher', hint: '' },
    { category: 'positive_negative_question', expected_answer: 'x', glossary: [{ word: 'teacher', meaning: 'معلم' }] },
  ]);
  assert.deepEqual(words, [{ word: 'teacher', meaning: 'معلم' }]);
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

test('the lesson file has a lesson_content part with vocabulary, sentences, grammar and stories', () => {
  assert.ok(content, 'lesson_content is missing');
  assert.ok(content.vocabulary.length >= 170);
  assert.ok(content.sentences.length >= 50);
  assert.ok(content.grammar.length >= 5);
  assert.ok(content.stories.length >= 3);
});

test('every vocabulary entry has an English word, a pronunciation and a Persian meaning', () => {
  for (const entry of content.vocabulary) {
    assert.ok(entry.word, 'word is empty');
    assert.match(entry.ipa, /^\/.+\/$/, `pronunciation of ${entry.word}`);
    assert.ok(entry.meaning, `meaning of ${entry.word}`);
  }
});

test('every English word of the lesson sentences is in the vocabulary', () => {
  const known = new Set([...PERSON_NAMES, ...content.vocabulary.flatMap((entry) => wordsOf(entry.word))]);
  const missing = new Set();
  for (const sentence of content.sentences) {
    for (const word of wordsOf(sentence.en)) if (!known.has(word)) missing.add(word);
  }
  assert.deepEqual([...missing], []);
});

test('every word of every story is in the lesson vocabulary', () => {
  const known = new Set([...PERSON_NAMES, ...content.vocabulary.flatMap((entry) => wordsOf(entry.word))]);
  for (const story of content.stories) {
    for (const line of story.lines) {
      for (const word of wordsOf(line.en)) {
        assert.ok(known.has(word), `"${word}" in story "${story.title}" is not in the lesson vocabulary`);
      }
    }
  }
});

test('every story line has its English and Persian', () => {
  for (const story of content.stories) {
    assert.ok(story.lines.length >= 5, `story "${story.title}" is too short`);
    for (const line of story.lines) {
      assert.ok(line.en && line.fa, `story "${story.title}" has a line without its pair`);
    }
  }
});

test('every grammar example is a sentence of the lesson', () => {
  const english = new Set(content.sentences.map((entry) => entry.en.toLowerCase()));
  for (const rule of content.grammar) {
    assert.ok(rule.explanation, `rule "${rule.title}" has no explanation`);
    for (const example of rule.examples) {
      assert.ok(english.has(example.en.toLowerCase()), `example "${example.en}" is not a lesson sentence`);
    }
  }
});

test('lessonMaterial uses the lesson content when there is one', () => {
  const material = lessonMaterial(questions, [content]);
  assert.equal(material.words.length, content.vocabulary.length);
  assert.ok(material.words.every((word) => word.ipa));
  assert.equal(material.stories.length, content.stories.length);
  assert.equal(material.grammar.length, content.grammar.length);
});

test('lessonMaterial gives each story line its English and Persian under english and persian', () => {
  // The stories page reads these names; the file itself uses en and fa.
  const material = lessonMaterial(questions, [content]);
  for (const story of material.stories) {
    assert.ok(story.lines.length > 0, `story "${story.title}" has no lines`);
    for (const line of story.lines) {
      assert.ok(line.english, `line without English in "${story.title}"`);
      assert.ok(line.persian, `line without Persian in "${story.title}"`);
    }
  }
});

test('buildWordStudyIndex links synonyms, antonyms and example sentences to a word', () => {
  const study = buildWordStudyIndex(
    [
      {
        category: 'vocabulary',
        question: 'Synonym: help',
        expected_answer: 'assist',
        accepted_answers: ['aid'],
      },
      {
        category: 'vocabulary',
        question: 'Opposite: open',
        expected_answer: 'close',
      },
    ],
    [{ english: 'Can you help me?', persian: 'می‌توانی کمکم کنی؟' }],
  );
  const help = study('help');
  assert.deepEqual(help.synonyms.sort(), ['aid', 'assist']);
  assert.deepEqual(help.antonyms, []);
  assert.equal(help.examples.length, 1);
  const open = study('open');
  assert.deepEqual(open.antonyms, ['close']);
});

test('lessonMaterial falls back to the questions when a lesson has no content', () => {
  const material = lessonMaterial(questions, [null]);
  assert.ok(material.words.length > 50);
  assert.ok(material.words.every((word) => word.ipa === ''));
  assert.deepEqual(material.grammar, []);
  assert.deepEqual(material.stories, []);
});

test('the Guess the country quiz has one row per country of the chart: capital city shown, country and nationality as answers', () => {
  const lesson11 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01-01.json', import.meta.url), 'utf8'));
  const chart = lesson11.lesson_content.country_chart;
  const material = lessonMaterial([], [lesson11.lesson_content]);
  assert.equal(material.quiz.length, chart.length);
  material.quiz.forEach((row, i) => {
    assert.equal(row.category, 'Guess the country');
    assert.equal(row.word, chart[i].capital_city);
    assert.deepEqual(
      row.quiz.map((answer) => [answer.label, answer.word]),
      [
        ['Country', chart[i].country],
        ['Nationality', chart[i].nationality],
      ],
    );
  });
});

test('every quiz word is a vocabulary word, so it has its pronunciation, and an answer has its Persian meaning', () => {
  const lesson11 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01-01.json', import.meta.url), 'utf8'));
  const material = lessonMaterial([], [lesson11.lesson_content]);
  for (const row of material.quiz) {
    assert.ok(row.ipa, `pronunciation of the capital city ${row.word}`);
    for (const answer of row.quiz) {
      assert.ok(answer.ipa, `pronunciation of ${answer.word}`);
      assert.ok(answer.meaning, `meaning of ${answer.word}`);
    }
  }
});

test('the words page lists the Countries block, then the quiz block, then the other words A to Z', () => {
  const lesson11 = JSON.parse(readFileSync(new URL('../content/evolve-1/lesson-01-01.json', import.meta.url), 'utf8'));
  const material = lessonMaterial([], [lesson11.lesson_content]);
  const rows = wordRows(material);
  const categories = rows.map((row) => row.category ?? '');
  const firstQuiz = categories.indexOf('Guess the country');
  const lastCountry = categories.lastIndexOf('Countries');
  assert.ok(firstQuiz > lastCountry, 'the quiz block comes after the Countries block');
  assert.ok(categories.slice(firstQuiz, firstQuiz + material.quiz.length).every((c) => c === 'Guess the country'));
  const plain = rows.slice(firstQuiz + material.quiz.length).map((row) => row.word);
  assert.ok(plain.length > 0 && plain.every((word, i) => !categories[firstQuiz + material.quiz.length + i]));
  assert.deepEqual(
    plain,
    [...plain].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
  );
  // Every vocabulary word is listed once; the quiz rows are extra rows of their own.
  assert.equal(rows.length, material.words.length + material.quiz.length);
});
