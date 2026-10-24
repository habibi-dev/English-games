// Typed answers allowed in voice-only questions. A few per day, kept on this device (localStorage).
// The count starts again on each local calendar day.

const KEY = 'grammar-quest.typing-quota.v1';
export const DAILY_TYPING_LIMIT = 10;

const pad = (n) => String(n).padStart(2, '0');

/** The local calendar day of `now`, for example "2026-10-19". */
export function dayOf(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function storedUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function quotaWith(used) {
  return { limit: DAILY_TYPING_LIMIT, used, left: DAILY_TYPING_LIMIT - used };
}

/** Typed answers used today and still left, for example { limit: 5, used: 2, left: 3 }. */
export function typingQuota(now = Date.now()) {
  const stored = storedUsage();
  if (stored.day !== dayOf(now)) return quotaWith(0);
  const used = Math.min(DAILY_TYPING_LIMIT, Math.max(0, Math.floor(Number(stored.used)) || 0));
  return quotaWith(used);
}

/** Uses one of today's typed answers. Returns the quota after it, or null when none is left. */
export function spendTypingQuota(now = Date.now()) {
  const current = typingQuota(now);
  if (current.left <= 0) return null;
  const next = quotaWith(current.used + 1);
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: dayOf(now), used: next.used }));
  } catch {
    // Storage full or disabled: the allowance then lasts only for this visit.
  }
  return next;
}
