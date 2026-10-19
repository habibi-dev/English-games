// Player profile for the game feel: XP, level, accuracy and best streak.
// Pure functions over attempts (no storage access), so they are easy to test.

export const XP_PER_LEVEL = 100;

/** XP = points earned on correct answers. */
export function totalXp(attempts) {
  return attempts.filter((a) => a.correct).reduce((sum, a) => sum + (Number(a.points) || 0), 0);
}

export function levelFor(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** Share of the way to the next level, from 0 to 1. */
export function levelProgress(xp) {
  return (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
}

/** Longest run of consecutive correct answers, in the order they were answered. */
export function bestStreak(attempts) {
  const ordered = [...attempts].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  let best = 0;
  let run = 0;
  for (const attempt of ordered) {
    run = attempt.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Profile from the scored attempts only: practice attempts (of a reset lesson) add no XP or stats. */
export function playerProfile(attempts) {
  const scored = attempts.filter((a) => !a.practice);
  const xp = totalXp(scored);
  const correct = scored.filter((a) => a.correct).length;
  return {
    xp,
    level: levelFor(xp),
    levelProgress: levelProgress(xp),
    answered: scored.length,
    accuracy: scored.length ? correct / scored.length : null,
    bestStreak: bestStreak(scored),
  };
}

/** Stars for one session: 3 at 90% or more, 2 at 70% or more, 1 at 40% or more, otherwise 0. */
export function starsFor(correct, total) {
  if (!total) return 0;
  const ratio = correct / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
}
