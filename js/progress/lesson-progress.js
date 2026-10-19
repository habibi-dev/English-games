// Lesson progress. Pure functions (no storage access), so they are easy to test.
//
// A question is "done" for now when it was answered correctly and is not due yet (see spaced-repetition.js).
// When its interval expires it is due again, and the progress goes down by one. Nothing is done for good.

import { scheduleOf, isDue } from './spaced-repetition.js';

/**
 * Ids of the questions that are done for now: answered, and not due yet.
 * A wrong answer leaves a question due at once, so it is not done.
 */
export function doneIds(questions, attempts, now = Date.now()) {
  const schedule = scheduleOf(attempts);
  return new Set(questions.filter((q) => schedule.has(q.id) && !isDue(schedule, q.id, now)).map((q) => q.id));
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
