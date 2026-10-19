import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankSummary, performanceSummary, reviewList } from '../js/progress/report.js';
import { flattenLesson } from '../js/bank/content.js';

const SAMPLE_LESSON = new URL('../content/evolve-1/lesson-01.json', import.meta.url);

test('bank summary counts the sample lesson by topic and type', () => {
  const { questions } = flattenLesson(JSON.parse(readFileSync(SAMPLE_LESSON, 'utf8')), {
    book: 'evolve-1',
    lesson: 'lesson-01',
  });
  const summary = bankSummary(questions);
  // Items without their own topic take the lesson id as their topic.
  const lessonRow = summary.byTopic.find((row) => row.topic === 'lesson-01');
  const quickCount = questions.filter((q) => q.category === 'quick_translation').length;
  const enabledCount = questions.filter((q) => q.enabled !== false).length;
  assert.equal(lessonRow.total, questions.length);
  assert.equal(lessonRow.byCategory.quick_translation, quickCount);
  assert.equal(summary.totals.total, questions.length);
  assert.equal(summary.totals.enabled, enabledCount);
});

test('bank summary separates disabled questions', () => {
  const summary = bankSummary([
    { id: '1', topic: 'to_be', category: 'quick_translation', enabled: true },
    { id: '2', topic: 'to_be', category: 'quick_translation', enabled: false },
  ]);
  assert.equal(summary.totals.enabled, 1);
  assert.equal(summary.totals.disabled, 1);
});

const attempt = (questionId, correct, at, extra = {}) => ({
  questionId,
  topic: 'do_does',
  category: 'multiple_choice',
  question: questionId,
  expected_answer: 'takes',
  answer: correct ? 'takes' : 'take',
  correct,
  timedOut: false,
  points: correct ? 10 : 0,
  at,
  ...extra,
});

test('performance summary groups by topic and type and computes success rate', () => {
  const perf = performanceSummary([
    attempt('a', true, 1),
    attempt('b', false, 2),
    attempt('c', true, 3, { category: 'quick_translation' }),
  ]);
  assert.equal(perf.overall.attempted, 3);
  assert.equal(perf.overall.correct, 2);
  assert.ok(Math.abs(perf.overall.successRate - 2 / 3) < 1e-9);
  const mc = perf.cells.find((c) => c.category === 'multiple_choice');
  assert.equal(mc.wrong, 1);
  assert.equal(perf.topics[0].attempted, 3);
});

test('review list contains questions whose latest answer was wrong', () => {
  const review = reviewList([attempt('a', true, 1), attempt('a', false, 2), attempt('b', false, 3), attempt('b', true, 4)]);
  assert.deepEqual(review.map((r) => r.questionId), ['a']);
});

test('review list also contains questions that are often wrong even if the last answer was right', () => {
  const review = reviewList([
    attempt('a', false, 1),
    attempt('a', false, 2),
    attempt('a', true, 3),
    attempt('b', false, 4),
    attempt('b', true, 5),
    attempt('b', true, 6),
  ]);
  assert.deepEqual(review.map((r) => r.questionId), ['a']);
});
