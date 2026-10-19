// Last-used play settings (book, lessons, exercise types, presentation, count). Kept in localStorage on this device.
// Only small preferences go here; progress and the course content live in IndexedDB.

const KEY = 'grammar-quest.settings.v2';

export function getSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {}; // unreadable value: fall back to defaults
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or disabled (e.g. private mode): settings are a convenience, so ignore.
  }
}

// Lesson resets: lesson key -> time of the reset. Kept apart from the settings above, because saveSettings
// writes only the play settings and must not drop these. A reset lesson is practised without points.
const RESETS_KEY = 'grammar-quest.lesson-resets.v1';

export function getLessonResets() {
  try {
    const data = JSON.parse(localStorage.getItem(RESETS_KEY) ?? 'null');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Starts a new round of the lesson. Attempts made before `at` belong to the old round. */
export function markLessonReset(key, at = Date.now()) {
  const resets = getLessonResets();
  resets[key] = at;
  try {
    localStorage.setItem(RESETS_KEY, JSON.stringify(resets));
  } catch {
    // Storage full or disabled: the reset is then not remembered.
  }
}
