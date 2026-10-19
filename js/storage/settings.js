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
