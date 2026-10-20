// Player profile for the game feel: XP, level, accuracy and best streak.
// Pure functions over attempts (no storage access), so they are easy to test.

// Level L starts at XP_BASE * (L - 1)^2 XP. Each level costs more XP than the one before,
// so the early levels come quickly and the later ones take many more games (level 8 needs 2940 XP).
export const XP_BASE = 60;

/** The XP at which `level` starts. */
export function levelStartXp(level) {
  return XP_BASE * (level - 1) ** 2;
}

/** XP = points earned on correct answers. */
export function totalXp(attempts) {
  return attempts.filter((a) => a.correct).reduce((sum, a) => sum + (Number(a.points) || 0), 0);
}

export function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / XP_BASE)) + 1;
}

/** Share of the way from the current level to the next one, from 0 to 1. */
export function levelProgress(xp) {
  const level = levelFor(xp);
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return (xp - start) / (next - start);
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

/**
 * The look of a session's results, from 0 to 4 (see result-stage.js):
 * 4 = every answer right, 3 = 90% or more, 2 = 70% or more, 1 = 40% or more, 0 = less.
 */
export function resultTier(correct, total) {
  if (!total) return 0;
  if (correct === total) return 4;
  const ratio = correct / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
}

/** Stars for one session: 3 at 90% or more, 2 at 70% or more, 1 at 40% or more, otherwise 0. */
export function starsFor(correct, total) {
  // A perfect session is still three stars: the top tier is the only one beyond the stars.
  return Math.min(3, resultTier(correct, total));
}
