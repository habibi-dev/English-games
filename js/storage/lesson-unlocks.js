// Legacy unlocked-lesson keys from backups and older app versions. Lessons are no longer locked in the UI.

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
