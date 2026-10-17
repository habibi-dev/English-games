// Last-used play settings (bank, topic, type, level, count). Kept in localStorage on this device.
// Only small preferences go here; progress and the question bank live in IndexedDB.

const KEY = 'grammar-quest.settings.v1';

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
