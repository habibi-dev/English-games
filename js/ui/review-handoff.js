// Hands question ids from the reports screen to the play screen, which starts a review game with them.
// Ids stay in memory and sessionStorage until the play screen consumes them or clears the handoff,
// so a duplicate router run does not lose them before the review starts.

const STORAGE_KEY = 'egq.pendingReview';

let pending = null;
let reviewIntent = false;

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.length ? ids : null;
  } catch {
    return null;
  }
}

function writeStorage(ids) {
  try {
    if (ids?.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or disabled storage: memory-only handoff.
  }
}

export function requestReview(ids) {
  pending = ids?.length ? [...ids] : null;
  reviewIntent = Boolean(pending);
  writeStorage(pending);
}

/** Pending review question ids, without clearing (used before the play screen commits to a review). */
export function peekReview() {
  return pending ?? readStorage();
}

/** True after reports requests a review, until the handoff is taken or cleared. */
export function hasReviewIntent() {
  return reviewIntent || Boolean(readStorage());
}

export function clearReviewHandoff() {
  pending = null;
  reviewIntent = false;
  writeStorage(null);
}

export function takeReview() {
  const ids = peekReview();
  pending = null;
  reviewIntent = false;
  writeStorage(null);
  return ids;
}
