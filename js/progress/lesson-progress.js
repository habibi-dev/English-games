// Lesson progress and rounds. Pure functions (no storage access), so they are easy to test.
//
// A round of a lesson is one run through all its questions. Inside a round, a question that was answered
// correctly is done and is not offered again. When every question of a lesson is done, the lesson can be
// reset: a new round starts, and it is practice only (no points, XP or stats), see markPractice.

import { lessonKey } from '../bank/schema.js';

/**
 * Question ids answered correctly in the current round of their lesson.
 * `resets` maps a lesson key to the time it was last reset; attempts before that time belong to an old round.
 */
export function doneIds(questions, attempts, resets = {}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const done = new Set();
  for (const attempt of attempts) {
    if (!attempt.correct) continue;
    const question = byId.get(attempt.questionId);
    if (!question) continue;
    const roundStart = resets[lessonKey(question.book, question.lesson)] ?? -Infinity;
    if ((attempt.at ?? 0) >= roundStart) done.add(question.id);
  }
  return done;
}

/** Done / total of a list of questions (enabled ones only), with the share as a whole percent. */
export function progressOf(questions, done) {
  const enabled = questions.filter((q) => q.enabled !== false);
  const finished = enabled.filter((q) => done.has(q.id)).length;
  const total = enabled.length;
  return {
    done: finished,
    total,
    percent: total ? Math.round((finished / total) * 100) : 0,
    complete: total > 0 && finished === total,
  };
}

/** True when the lesson of this question was reset at least once: its rounds are practice only. */
export function isPracticeQuestion(question, resets = {}) {
  return resets[lessonKey(question.book, question.lesson)] !== undefined;
}

/** A copy of each question, marked as practice when its lesson has been reset. */
export function markPractice(questions, resets = {}) {
  return questions.map((question) =>
    isPracticeQuestion(question, resets) ? { ...question, practice: true } : question,
  );
}
