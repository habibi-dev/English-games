// Progress Tracker: stores one attempt per answered question, on this device (IndexedDB).
// Each attempt keeps a snapshot of the question's metadata, so reports still make sense
// after a question is edited or deleted from the bank.

import * as db from '../storage/db.js';

export async function recordOutcome(outcome) {
  const q = outcome.question;
  return db.addAttempt({
    questionId: q.id,
    topic: q.topic,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    expected_answer: q.expected_answer,
    // The sentence the learner had to correct (grammar questions); null for the other types.
    incorrect_sentence: q.incorrect_sentence ?? null,
    answer: outcome.answer,
    correct: outcome.correct,
    timedOut: outcome.timedOut,
    points: outcome.points,
    elapsedMs: outcome.elapsedMs,
    at: Date.now(),
  });
}

export const loadAttempts = () => db.getAllAttempts();
export const resetProgress = () => db.clearAttempts();
