// Lesson play-all toolbar preferences (repeat, gap offset, loop) on this device.

const KEY = 'grammar-quest.lesson-playbar.v1';

export function loadLessonPlaybarSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!data || typeof data !== 'object') return null;
    const timesPerItem = Number(data.timesPerItem);
    const gapOffset = Number(data.gapOffset);
    const loopEnabled = Boolean(data.loopEnabled);
    const shuffleEnabled = Boolean(data.shuffleEnabled);
    return {
      timesPerItem: timesPerItem >= 1 && timesPerItem <= 3 ? timesPerItem : 1,
      gapOffset: [-1, 0, 1, 2].includes(gapOffset) ? gapOffset : 0,
      loopEnabled,
      shuffleEnabled,
      autoRevealOnPlay: Boolean(data.autoRevealOnPlay),
      listenOnly: Boolean(data.listenOnly),
      dimOthersOnPlay: Boolean(data.dimOthersOnPlay),
      longSentenceFocus: Boolean(data.longSentenceFocus),
    };
  } catch {
    return null;
  }
}

export function saveLessonPlaybarSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: preferences are a convenience only.
  }
}

/** Default playback UI flags when nothing is stored yet. */
export const LESSON_PLAYBAR_UI_DEFAULTS = {
  autoRevealOnPlay: false,
  listenOnly: false,
  dimOthersOnPlay: false,
  longSentenceFocus: false,
};
