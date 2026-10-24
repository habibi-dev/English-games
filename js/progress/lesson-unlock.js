// Lesson unlocking. A lesson the learner has not started stays locked until the lesson before it is at least 75% done.
// Once a lesson is unlocked it stays unlocked: the earlier lesson may drop below 75% later (spaced repetition),
// and the learner keeps access. The first lesson of a book is always open. Pure functions, so they are easy to test.

export const UNLOCK_SHARE = 0.75;

/** True when a lesson (or a list of lessons) is far enough done to open the next one: at least 75% of its questions. */
export function reachedShare({ done, total }) {
  return total > 0 && done / total >= UNLOCK_SHARE;
}

/**
 * The keys of the unlocked lessons of one book, given in course order.
 * `unlocked` is the set stored so far; `progressOfKey(key)` gives { done, total } for one lesson.
 * Returns a new Set with everything that is unlocked now (the stored keys are kept).
 */
export function unlockedLessons(lessonKeys, progressOfKey, unlocked = new Set()) {
  const next = new Set(unlocked);
  lessonKeys.forEach((key, index) => {
    if (index === 0) next.add(key);
    const { done, total } = progressOfKey(key);
    // A lesson that has been started (at least one answer done) is open.
    if (done > 0) next.add(key);
    // Reaching the share opens the lesson after this one, for good.
    if (reachedShare({ done, total }) && index + 1 < lessonKeys.length) next.add(lessonKeys[index + 1]);
  });
  return next;
}

/** The key of the lesson before `key` in the course order, or null for the first lesson (or an unknown key). */
export function previousLesson(lessonKeys, key) {
  const index = lessonKeys.indexOf(key);
  return index > 0 ? lessonKeys[index - 1] : null;
}
