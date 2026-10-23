// Keep the screen awake (Screen Wake Lock API) during play and lesson listen mode.

let sentinel = null;
let gameWantsLock = false;
let lessonWantsLock = false;

function wantsLock() {
  return gameWantsLock || lessonWantsLock;
}

async function acquire() {
  if (!wantsLock() || typeof navigator === 'undefined' || !navigator.wakeLock) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (wantsLock()) acquire();
    });
  } catch {
    // Not allowed (battery saver, background tab, unsupported).
  }
}

async function release() {
  try {
    await sentinel?.release();
  } catch {
    // Already released.
  }
  sentinel = null;
}

async function sync() {
  if (wantsLock()) return acquire();
  return release();
}

/** Play screen and missions: keep the display on while a game is in progress. */
export function keepScreenOn(active) {
  gameWantsLock = Boolean(active);
  return sync();
}

/** Lesson play-all toolbar: same lock, tracked separately from the game. */
export function setLessonWakeLock(active) {
  lessonWantsLock = Boolean(active);
  return sync();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantsLock()) acquire();
  });
}
