// Game Engine: question selection, step flow, timer and score.
// It does not render anything and does not check grammar itself.
// Answers are checked by the Answer Validator, and results are stored by the Progress Tracker.
// Pure module with an injectable clock, so it can be unit-tested.

import { validateAnswer } from './validator.js';

const allows = (list, value) => list === undefined || list.includes(value);

/**
 * Returns enabled questions that match the filters.
 * An undefined filter means "no restriction"; an empty array means "match nothing".
 */
export function filterQuestions(questions, { banks, topics, categories, difficulties, includeDisabled = false } = {}) {
  return questions.filter(
    (q) =>
      (includeDisabled || q.enabled !== false) &&
      // Questions without a bank (added by hand) are always part of the selection.
      (!q.bank || allows(banks, q.bank)) &&
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

export function pickQuestions(questions, filters = {}, { count = Infinity, random = Math.random } = {}) {
  return shuffle(filterQuestions(questions, filters), random).slice(0, count);
}

/**
 * One practice run over a fixed list of questions.
 * Flow: current() -> submit(answer) or timeout() -> next() -> ... until finished.
 */
export class GameSession {
  #questions;
  #clock;
  #index = 0;
  #startedAt;
  #outcomes = [];
  #answered = false;

  constructor(questions, { clock = () => Date.now() } = {}) {
    this.#questions = [...questions];
    this.#clock = clock;
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
      throw new Error('ابتدا به سؤال فعلی پاسخ بده.');
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
    if (this.finished) throw new Error('این تمرین تمام شده است.');
    if (this.#answered) throw new Error('به این سؤال قبلاً پاسخ داده شده است.');
  }

  #record(data) {
    const elapsedMs = this.#clock() - this.#startedAt;
    const points = data.correct ? data.question.points ?? 0 : 0;
    const outcome = { ...data, points, elapsedMs };
    this.#outcomes.push(outcome);
    this.#answered = true;
    return outcome;
  }
}
