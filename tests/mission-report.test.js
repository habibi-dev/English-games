import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missionReport } from '../js/progress/mission-report.js';

const q = (id, lesson, extra = {}) => ({
  id,
  book: 'evolve-1',
  lesson,
  category: 'quick_translation',
  points: 10,
  enabled: true,
  ...extra,
});

const outcome = (question, correct, extra = {}) => ({
  question,
  correct,
  timedOut: false,
  points: correct ? question.points : 0,
  ...extra,
});

const lessons = [
  { key: 'evolve-1/lesson-01', book: 'evolve-1', lesson: 'lesson-01', order: 0, lessonTitle: 'Lesson 1: Verbs', unitTitle: 'Unit 1', bookTitle: 'Evolve 1', bookLevel: 'A1', seriesTitle: 'Evolve' },
  { key: 'evolve-1/lesson-02', book: 'evolve-1', lesson: 'lesson-02', order: 1, lessonTitle: 'Lesson 2: Nouns', unitTitle: 'Unit 1', bookTitle: 'Evolve 1', bookLevel: 'A1', seriesTitle: 'Evolve' },
];

// Bank: 3 questions in lesson 1, 2 in lesson 2.
const questions = [q('a', 'lesson-01'), q('b', 'lesson-01'), q('c', 'lesson-01'), q('d', 'lesson-02'), q('e', 'lesson-02')];

test('counts answers, accuracy, points and the longest run', () => {
  const a = questions[0];
  const b = questions[1];
  const c = questions[2];
  const outcomes = [outcome(a, true), outcome(b, true), outcome(c, false, { timedOut: true })];
  const report = missionReport({ outcomes, lessons, questions, doneBefore: new Set(), mode: 'easy', startedAt: 1000, endedAt: 61000 });
  assert.equal(report.answered, 3);
  assert.equal(report.correct, 2);
  assert.equal(report.wrong, 1);
  assert.equal(report.timeouts, 1);
  assert.equal(report.accuracy, 2 / 3);
  assert.equal(report.score, 20);
  assert.equal(report.maxScore, 30);
  assert.equal(report.bestStreak, 2);
  assert.equal(report.durationMs, 60000);
  assert.equal(report.mode, 'easy');
});

test('lesson progress goes up with the correct answers, and a wrong answer does not finish anything', () => {
  const [a, b, c] = questions;
  const outcomes = [outcome(a, true), outcome(b, true), outcome(c, false)];
  const report = missionReport({ outcomes, lessons, questions, doneBefore: new Set(['c']), mode: 'hard', startedAt: 0, endedAt: 1 });
  assert.equal(report.lessons.length, 1);
  const [row] = report.lessons;
  assert.equal(row.title, 'Lesson 1: Verbs');
  assert.equal(row.unitTitle, 'Unit 1');
  assert.equal(row.answered, 3);
  assert.equal(row.correct, 2);
  // Before: only c was done (1 of 3). After: a and b are done as well, c stays done from before.
  assert.equal(row.before.done, 1);
  assert.equal(row.after.done, 3);
  assert.equal(row.after.complete, true);
  assert.equal(report.lessonsCompleted, 1);
  assert.equal(report.newlyDone, 2);
});

test('a wrong answer to a question that was not done stays not done', () => {
  const [a] = questions;
  const outcomes = [outcome(a, false)];
  const report = missionReport({ outcomes, lessons, questions, doneBefore: new Set(), mode: 'easy', startedAt: 0, endedAt: 1 });
  assert.equal(report.lessons[0].after.done, 0);
  assert.equal(report.newlyDone, 0);
  assert.equal(report.lessonsCompleted, 0);
});

test('a mission over two lessons lists both in course order, with the book progress', () => {
  const [a, , , d, e] = questions;
  // Answer the second lesson first, to check the course order is used.
  const outcomes = [outcome(d, true), outcome(a, true), outcome(e, false)];
  const report = missionReport({ outcomes, lessons, questions, doneBefore: new Set(['b']), mode: 'medium', startedAt: 0, endedAt: 1 });
  assert.deepEqual(
    report.lessons.map((row) => row.title),
    ['Lesson 1: Verbs', 'Lesson 2: Nouns'],
  );
  assert.equal(report.books.length, 1);
  const [book] = report.books;
  assert.equal(book.title, 'Evolve 1');
  assert.equal(book.level, 'A1');
  assert.equal(book.series, 'Evolve');
  // 5 questions in the book. Before: b (1 of 5). After: a, b and d (3 of 5).
  assert.equal(book.before.done, 1);
  assert.equal(book.after.done, 3);
  assert.equal(book.after.percent, 60);
});

test('exercise types are listed once, with their labels', () => {
  const grammar = q('g', 'lesson-01', { category: 'grammar_correction' });
  const outcomes = [outcome(questions[0], true), outcome(questions[1], true), outcome(grammar, true)];
  const report = missionReport({
    outcomes,
    lessons,
    questions: [...questions, grammar],
    doneBefore: new Set(),
    mode: 'easy',
    startedAt: 0,
    endedAt: 1,
  });
  assert.deepEqual(report.categories, ['Quick translation', 'Grammar correction']);
});
