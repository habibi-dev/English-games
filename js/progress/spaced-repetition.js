// Spaced repetition (Leitner boxes). Pure functions over attempts, so they are easy to test.
//
// Every question sits in a box. The box decides how long the question stays away after it is answered:
//   - a correct answer moves it up one box, so the next time comes later (1 day, 3 days, 1 week, ...);
//   - a wrong answer or a timeout puts it back in box 0, so it is due at once.
// A question that is due is asked again. Nothing is done for good: when its interval expires it comes back.
//
// The boxes are not stored. They are worked out from the attempts (oldest first), so the history already
// on the device gives the right schedule, and nothing needs migrating.

import { shuffle } from '../engine/game-engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a question waits after it is answered, per box. Box 0 is due at once. */
export const INTERVAL_DAYS = Object.freeze([0, 1, 3, 7, 14, 30, 60, 120]);
export const MAX_BOX = INTERVAL_DAYS.length - 1;

/**
 * Box of every question that has been answered: questionId -> { box, at }, where `at` is the time of its last answer.
 * A question missing from the map has never been answered (it is new, and due).
 */
export function scheduleOf(attempts) {
  const ordered = [...attempts].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  const schedule = new Map();
  for (const attempt of ordered) {
    const previous = schedule.get(attempt.questionId)?.box ?? 0;
    let box = 0;
    if (attempt.correct) box = previous === 0 ? 1 : Math.min(previous + 1, MAX_BOX);
    schedule.set(attempt.questionId, { box, at: attempt.at ?? 0 });
  }
  return schedule;
}

/** The time a question is due again. New questions (no entry) are due from the start of time. */
export function dueAt(entry) {
  return entry ? entry.at + INTERVAL_DAYS[entry.box] * DAY_MS : -Infinity;
}

/** True when the question is due now (or was never answered). */
export function isDue(schedule, questionId, now = Date.now()) {
  return now >= dueAt(schedule.get(questionId));
}

/** The earliest time a question that is not due yet comes back, or null when none is waiting. */
export function nextDueAt(questions, schedule, now = Date.now()) {
  let next = null;
  for (const question of questions) {
    const time = dueAt(schedule.get(question.id));
    if (time > now && (next === null || time < next)) next = time;
  }
  return next;
}

/**
 * The questions for one mission: at most `count` of the due ones, in random order.
 * Questions that came back on their own are picked first, the most overdue first; new questions fill the rest.
 */
export function missionQuestions(questions, schedule, now = Date.now(), { count = Infinity, random = Math.random } = {}) {
  const due = questions.filter((q) => isDue(schedule, q.id, now));
  const reviews = due
    .filter((q) => schedule.has(q.id))
    .sort((a, b) => dueAt(schedule.get(a.id)) - dueAt(schedule.get(b.id)));
  const fresh = shuffle(
    due.filter((q) => !schedule.has(q.id)),
    random,
  );
  return shuffle([...reviews, ...fresh].slice(0, count), random);
}
