// Game Engine: question selection, step flow, timer and score.
// It does not render anything and does not check grammar itself.
// Answers are checked by the Answer Validator, and results are stored by the Progress Tracker.
// Pure module with an injectable clock, so it can be unit-tested.

import { validateAnswer } from './validator.js';
import { lessonKey } from '../bank/schema.js';

const allows = (list, value) => list === undefined || list.includes(value);

/**
 * Returns enabled questions that match the filters.
 * An undefined filter means "no restriction"; an empty array means "match nothing".
 */
export function filterQuestions(
  questions,
  { books, lessons, topics, categories, difficulties, includeDisabled = false } = {},
) {
  return questions.filter(
    (q) =>
      (includeDisabled || q.enabled !== false) &&
      allows(books, q.book) &&
      // lessons are "book/lesson" keys (see lessonKey), so the same lesson number in two books stays apart.
      allows(lessons, lessonKey(q.book, q.lesson)) &&
      allows(topics, q.topic) &&
      allows(categories, q.category) &&
      allows(difficulties, q.difficulty),
  );
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// The most questions one mission (or review game) holds. Longer lists make the progress strip and the session too long.
export const MAX_MISSION_QUESTIONS = 50;

export function pickQuestions(questions, filters = {}, { count = Infinity, random = Math.random } = {}) {
  return shuffle(filterQuestions(questions, filters), random).slice(0, count);
}

/**
 * Play modes of a mission. The time limit is split into three steps (full, two thirds, one third),
 * and the points grow with the harder mode.
 */
export const PLAY_MODES = Object.freeze({
  easy: Object.freeze({ time: 1, points: 1 }),
  medium: Object.freeze({ time: 2 / 3, points: 1.25 }),
  hard: Object.freeze({ time: 1 / 3, points: 1.5 }),
});

/** A copy of the question with its time limit and points scaled by the mode. Unknown modes count as easy. */
export function applyPlayMode(question, mode = 'easy') {
  const rule = PLAY_MODES[mode] ?? PLAY_MODES.easy;
  if (rule.time === 1 && rule.points === 1) return question;
  return {
    ...question,
    time_limit: Math.max(5, Math.round((question.time_limit ?? 20) * rule.time)),
    points: Math.round((question.points ?? 0) * rule.points),
  };
}

/**
 * One mission over a fixed list of questions.
 * Flow: current() -> submit(answer) or timeout() -> next() -> ... until finished.
 */
export class GameSession {
  #questions;
  #clock;
  #index = 0;
  #startedAt;
  #outcomes = [];
  #answered = false;
  // Questions that already gave points (earlier missions or this one). They score nothing again.
  #scored;

  constructor(questions, { clock = () => Date.now(), alreadyScored = [] } = {}) {
    this.#questions = [...questions];
    this.#clock = clock;
    this.#scored = new Set(alreadyScored);
    this.#startedAt = clock();
  }

  get total() {
    return this.#questions.length;
  }

  get index() {
    return this.#index;
  }

  get finished() {
    return this.#index >= this.#questions.length;
  }

  get answered() {
    return this.#answered;
  }

  get current() {
    if (this.finished) return null;
    return {
      question: this.#questions[this.#index],
      index: this.#index,
      total: this.#questions.length,
    };
  }

  remainingMs(now = this.#clock()) {
    if (this.finished) return 0;
    const limitMs = this.#questions[this.#index].time_limit * 1000;
    return Math.max(0, this.#startedAt + limitMs - now);
  }

  /** Checks the learner's answer against the accepted answers of the current question. */
  submit(answer) {
    this.#assertOpen();
    const question = this.#questions[this.#index];
    const verdict = validateAnswer(question, answer);
    return this.#record({
      question,
      answer: String(answer ?? ''),
      correct: verdict.correct,
      matched: verdict.matched,
      timedOut: false,
    });
  }

  /** Called when the time limit runs out before an answer is submitted. */
  timeout() {
    this.#assertOpen();
    return this.#record({
      question: this.#questions[this.#index],
      answer: '',
      correct: false,
      matched: null,
      timedOut: true,
    });
  }

  next() {
    if (!this.#answered) {
      throw new Error('Answer the current question first.');
    }
    this.#index++;
    this.#answered = false;
    this.#startedAt = this.#clock();
    return this.current;
  }

  get outcomes() {
    return [...this.#outcomes];
  }

  summary() {
    const correct = this.#outcomes.filter((o) => o.correct).length;
    const timeouts = this.#outcomes.filter((o) => o.timedOut).length;
    return {
      answered: this.#outcomes.length,
      correct,
      wrong: this.#outcomes.length - correct,
      timeouts,
      score: this.#outcomes.reduce((sum, o) => sum + o.points, 0),
      maxScore: this.#questions.reduce((sum, q) => sum + (q.points ?? 0), 0),
    };
  }

  #assertOpen() {
    if (this.finished) throw new Error('This exercise is already finished.');
    if (this.#answered) throw new Error('This question has already been answered.');
  }

  #record(data) {
    const elapsedMs = this.#clock() - this.#startedAt;
    // A question pays its points only on its first correct answer ever. Repeats are still recorded and still count for the streak.
    const id = data.question.id;
    const pays = data.correct && !this.#scored.has(id);
    const points = pays ? data.question.points ?? 0 : 0;
    if (data.correct) this.#scored.add(id);
    const outcome = { ...data, points, elapsedMs };
    this.#outcomes.push(outcome);
    this.#answered = true;
    return outcome;
  }
}
