// Keeps the screen on while a game is being played (Screen Wake Lock API).
// Browsers release the lock when the page is hidden, so it is requested again when the page is shown.
// Where the API is missing (or the page is not in a secure context) nothing happens.

let sentinel = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible') return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // The game may have ended while the request was pending.
    if (!wanted) {
      lock.release().catch(() => {});
      return;
    }
    sentinel = lock;
    lock.addEventListener('release', () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    // Refused (for example battery saver): the screen will sleep as usual.
    sentinel = null;
  }
}

/** Keeps the screen on (`on` = true) or lets it sleep again (`on` = false). */
export function keepScreenOn(on) {
  wanted = Boolean(on);
  if (wanted) {
    acquire();
    return;
  }
  const lock = sentinel;
  sentinel = null;
  lock?.release().catch(() => {});
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquire();
  });
}
