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

// Sound effects (win and lose sounds). Small preferences, so they live in localStorage like the play settings.
// Missing values fall back to the defaults: sounds are on, at a moderate volume.
const SOUNDS_KEY = 'grammar-quest.sounds.v1';
export const SOUND_DEFAULTS = Object.freeze({
  enabled: true,
  win: true,
  lose: true,
  timeout: true,
  vibrate: true,
  volume: 0.6,
});

export function getSoundSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SOUNDS_KEY) ?? 'null');
    const stored = data && typeof data === 'object' ? data : {};
    const volume = Number(stored.volume);
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : SOUND_DEFAULTS.enabled,
      win: typeof stored.win === 'boolean' ? stored.win : SOUND_DEFAULTS.win,
      lose: typeof stored.lose === 'boolean' ? stored.lose : SOUND_DEFAULTS.lose,
      timeout: typeof stored.timeout === 'boolean' ? stored.timeout : SOUND_DEFAULTS.timeout,
      vibrate: typeof stored.vibrate === 'boolean' ? stored.vibrate : SOUND_DEFAULTS.vibrate,
      volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : SOUND_DEFAULTS.volume,
    };
  } catch {
    return { ...SOUND_DEFAULTS };
  }
}

/** Saves some of the sound settings; the others keep their stored values. */
export function saveSoundSettings(changes) {
  const next = { ...getSoundSettings(), ...changes };
  try {
    localStorage.setItem(SOUNDS_KEY, JSON.stringify(next));
  } catch {
    // Storage full or disabled: the choice then lasts only for this visit.
  }
  return next;
}
