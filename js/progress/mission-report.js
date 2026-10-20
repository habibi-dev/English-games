// Facts of one finished mission, for the result card: what was played, which lessons and books it touched,
// and how far they moved (progress before and after). Pure functions: no storage, no DOM.

import { progressOf } from './lesson-progress.js';
import { lessonKey, CATEGORIES } from '../bank/schema.js';

/** Longest run of correct answers, in the order they were answered. */
function longestRun(outcomes) {
  let best = 0;
  let run = 0;
  for (const outcome of outcomes) {
    run = outcome.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * @param {object} input
 * @param {Array} input.outcomes  answers of the mission, in order (GameSession.outcomes)
 * @param {Array} input.lessons  lesson records of the course (listLessons)
 * @param {Array} input.questions  every question of the bank
 * @param {Set} input.doneBefore  ids of the questions that were done before the mission (doneIds)
 * @param {string} input.mode  play mode of the mission: easy, medium or hard
 * @param {number} input.startedAt  time the mission started (ms)
 * @param {number} input.endedAt  time the mission ended (ms)
 */
export function missionReport({ outcomes, lessons, questions, doneBefore, mode, startedAt, endedAt }) {
  const answered = outcomes.length;
  const correct = outcomes.filter((o) => o.correct).length;
  const doneAfter = new Set([...doneBefore, ...outcomes.filter((o) => o.correct).map((o) => o.question.id)]);
  const newlyDone = [...doneAfter].filter((id) => !doneBefore.has(id)).length;

  // Lessons the mission touched, in course order (lessons unknown to the course list are still listed).
  const lessonKeys = [...new Set(outcomes.map((o) => lessonKey(o.question.book, o.question.lesson)))];
  const lessonRows = lessonKeys
    .map((key) => {
      const info = lessons.find((lesson) => lesson.key === key);
      const inLesson = questions.filter((q) => lessonKey(q.book, q.lesson) === key);
      const mine = outcomes.filter((o) => lessonKey(o.question.book, o.question.lesson) === key);
      return {
        key,
        order: info?.order ?? Number.MAX_SAFE_INTEGER,
        title: info?.lessonTitle || key,
        unitTitle: info?.unitTitle || '',
        bookTitle: info?.bookTitle || '',
        answered: mine.length,
        correct: mine.filter((o) => o.correct).length,
        before: progressOf(inLesson, doneBefore),
        after: progressOf(inLesson, doneAfter),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Books the mission touched (a review can cover several books).
  const bookIds = [...new Set(outcomes.map((o) => o.question.book))];
  const books = bookIds.map((bookId) => {
    const info = lessons.find((lesson) => lesson.book === bookId);
    const inBook = questions.filter((q) => q.book === bookId);
    return {
      id: bookId,
      title: info?.bookTitle || bookId,
      level: info?.bookLevel || '',
      series: info?.seriesTitle || '',
      before: progressOf(inBook, doneBefore),
      after: progressOf(inBook, doneAfter),
    };
  });

  const categories = [...new Set(outcomes.map((o) => o.question.category))].map((key) => CATEGORIES[key] ?? key);

  return {
    answered,
    correct,
    wrong: answered - correct,
    timeouts: outcomes.filter((o) => o.timedOut).length,
    accuracy: answered ? correct / answered : 0,
    score: outcomes.reduce((sum, o) => sum + (Number(o.points) || 0), 0),
    maxScore: outcomes.reduce((sum, o) => sum + (Number(o.question.points) || 0), 0),
    bestStreak: longestRun(outcomes),
    durationMs: Math.max(0, endedAt - startedAt),
    mode,
    categories,
    newlyDone,
    lessons: lessonRows,
    lessonsCompleted: lessonRows.filter((row) => row.after.complete && !row.before.complete).length,
    books,
  };
}
