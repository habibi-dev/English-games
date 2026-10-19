// Report calculations. Pure functions over question metadata and attempts.
// Nothing here inspects the grammar of an answer: it only counts metadata and results.

import { CATEGORIES } from '../bank/schema.js';

const emptyBankCounts = () => ({
  total: 0,
  enabled: 0,
  disabled: 0,
  byCategory: Object.fromEntries(Object.keys(CATEGORIES).map((category) => [category, 0])),
});

/** How many questions exist per topic and per question type. */
export function bankSummary(questions) {
  const rows = new Map();
  const totals = emptyBankCounts();

  for (const q of questions) {
    if (!rows.has(q.topic)) rows.set(q.topic, { topic: q.topic, ...emptyBankCounts() });
    for (const target of [rows.get(q.topic), totals]) {
      target.total++;
      if (q.enabled === false) target.disabled++;
      else target.enabled++;
      target.byCategory[q.category] = (target.byCategory[q.category] ?? 0) + 1;
    }
  }

  return { byTopic: [...rows.values()], totals };
}

const statRow = (base) => ({ ...base, attempted: 0, correct: 0, wrong: 0, timeouts: 0, points: 0 });

function addAttempt(row, attempt) {
  row.attempted++;
  if (attempt.correct) {
    row.correct++;
    row.points += attempt.points ?? 0;
  } else {
    row.wrong++;
  }
  if (attempt.timedOut) row.timeouts++;
}

const finish = (row) => ({ ...row, successRate: row.attempted ? row.correct / row.attempted : null });

/** Results grouped by topic, by topic + category, and overall. */
export function performanceSummary(attempts) {
  const cells = new Map();
  const topics = new Map();
  const overall = statRow({ label: 'Total' });

  for (const attempt of attempts) {
    const key = `${attempt.topic}|${attempt.category}`;
    if (!cells.has(key)) cells.set(key, statRow({ topic: attempt.topic, category: attempt.category }));
    if (!topics.has(attempt.topic)) topics.set(attempt.topic, statRow({ topic: attempt.topic }));
    addAttempt(cells.get(key), attempt);
    addAttempt(topics.get(attempt.topic), attempt);
    addAttempt(overall, attempt);
  }

  return {
    cells: [...cells.values()].map(finish),
    topics: [...topics.values()].map(finish),
    overall: finish(overall),
  };
}

/**
 * Questions that need review:
 * - the latest answer was wrong or timed out, or
 * - the question was wrong at least twice and at least half of its attempts were wrong.
 */
export function reviewList(attempts) {
  const byQuestion = new Map();
  const ordered = [...attempts].sort((a, b) => a.at - b.at);

  for (const attempt of ordered) {
    let entry = byQuestion.get(attempt.questionId);
    if (!entry) {
      entry = {
        questionId: attempt.questionId,
        question: attempt.question,
        expected_answer: attempt.expected_answer,
        topic: attempt.topic,
        category: attempt.category,
        attempted: 0,
        wrong: 0,
        lastCorrect: true,
        lastAnswer: '',
        lastAt: 0,
        incorrect_sentence: attempt.incorrect_sentence ?? null,
      };
      byQuestion.set(attempt.questionId, entry);
    }
    entry.attempted++;
    if (!attempt.correct) entry.wrong++;
    entry.lastCorrect = Boolean(attempt.correct);
    entry.lastAnswer = attempt.answer ?? '';
    entry.lastAt = attempt.at;
  }

  return [...byQuestion.values()]
    .filter((e) => !e.lastCorrect || (e.wrong >= 2 && e.wrong / e.attempted >= 0.5))
    .sort((a, b) => b.wrong - a.wrong || b.lastAt - a.lastAt);
}
