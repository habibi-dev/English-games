// Lessons the learner has unlocked on this device. Kept in localStorage, like the play settings.
// Reset progress clears it, so the lessons lock again.

const KEY = 'grammar-quest.unlocked.v1';

export function getUnlockedLessons() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return new Set(Array.isArray(data) ? data.filter((key) => typeof key === 'string') : []);
  } catch {
    return new Set(); // unreadable value: nothing unlocked yet (the first lesson of a book is always open)
  }
}

export function saveUnlockedLessons(keys) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...keys]));
  } catch {
    // Storage full or disabled: the unlock lasts only for this visit.
  }
}

export function clearUnlockedLessons() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
