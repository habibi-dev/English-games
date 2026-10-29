// Lesson progress helpers. Every lesson in a book is always open; there is no sequential lock.

export const UNLOCK_SHARE = 0.75;

/** True when a lesson (or a list of lessons) is at least 75% of its questions done (used for "All lessons" review rows). */
export function reachedShare({ done, total }) {
  return total > 0 && done / total >= UNLOCK_SHARE;
}

/** Every lesson key in course order is open. Progress and stored unlocks are ignored. */
export function unlockedLessons(lessonKeys) {
  return new Set(lessonKeys);
}

/** The key of the lesson before `key` in the course order, or null for the first lesson (or an unknown key). */
export function previousLesson(lessonKeys, key) {
  const index = lessonKeys.indexOf(key);
  return index > 0 ? lessonKeys[index - 1] : null;
}
