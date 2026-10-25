// Play screen: setup (player card + missions) -> question loop (timer, submit, feedback) -> results.
// Only UI logic lives here. Selection, timing and scoring come from the Game Engine,
// answer checks from the Answer Validator, and storage from the Progress Tracker.

import { listQuestions, listLessons } from '../bank/repository.js';
import { CATEGORIES, DIFFICULTIES, topicLabel, lessonKey, unitKey, persianSentence } from '../bank/schema.js';
import { filterQuestions, shuffle, GameSession, PLAY_MODES, applyPlayMode, MAX_MISSION_QUESTIONS } from '../engine/game-engine.js';
import { validateAnswer } from '../engine/validator.js';
import { clearReviewHandoff, hasReviewIntent, requestReview, takeReview } from './review-handoff.js';
import { lessonHub, linesPage, storiesPage, stopStoryReading, stopLinesPlayback, handleCardViewBack } from './lesson-content.js';
import { lessonMaterial, buildWordStudyIndex, wordRows } from '../bank/lesson-vocabulary.js';
import { recordOutcome, loadAttempts } from '../progress/tracker.js';
import { playerProfile, levelFor, starsFor, levelStartXp, resultTier } from '../progress/player.js';
import { doneIds, progressOf } from '../progress/lesson-progress.js';
import { unlockedLessons, previousLesson, reachedShare } from '../progress/lesson-unlock.js';
import { getUnlockedLessons, saveUnlockedLessons } from '../storage/lesson-unlocks.js';
import { scheduleOf, isDue, missionQuestions, nextDueAt } from '../progress/spaced-repetition.js';
import { getSettings, saveSettings, getSoundSettings } from '../storage/settings.js';
import { h, toast, fa, ltr, badge, percent, keepFocus, confirmDialog, scrollToTop } from './dom.js';
import { uiIcon } from './icons.js';
import { mascot } from './mascot.js';
import { dragToScroll } from './drag-scroll.js';
import { createAnswerWidget, instructionFor } from './answer-widgets.js';
import { splitPrompt } from './prompt.js';
import {
  speak,
  stopSpeaking,
  speakButtons,
  speakBar,
  completeSentence,
  contextSentence,
  questionSpeakButton,
} from './speech-out.js';
import { playResultSound, playResultJingleIfEnabled, vibrateFor } from './sounds.js';
import { RESULT_LOOKS, resultStage, countUp } from './result-stage.js';
import { missionReport } from '../progress/mission-report.js';
import { shareResultCard, saveResultCard } from './result-card.js';
import { beginMission, endMission } from '../progress/activity.js';
import { keepScreenOn } from './wake-lock.js';
import { applySpellingMode } from '../engine/spelling.js';

/** True when `word` appears as a whole word in `sentence` (case-insensitive). */
function containsWord(sentence, word) {
  const target = word.toLowerCase();
  return sentence
    .toLowerCase()
    .split(/[^a-z']+/)
    .some((token) => token === target);
}

const COUNTS = [10, 20, MAX_MISSION_QUESTIONS];
// Missions saved before the "all questions" choice was removed (stored as 0) play the longest length.
const savedCount = (value) => (value === 0 ? MAX_MISSION_QUESTIONS : value);

/** "1 lesson", "3 lessons". */
const plural = (n, word) => `${fa(n)} ${word}${Number(n) === 1 ? '' : 's'}`;

/** When a question is due again, for the setup screen, e.g. "Oct 21, 9:00 AM". */
const dueText = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
// The icon of each exercise type (names in icons.js).
const CATEGORY_ICONS = {
  quick_translation: 'languages',
  sentence_builder: 'layers',
  word_translation: 'quote',
  grammar_correction: 'pencil',
  multiple_choice: 'list',
  positive_negative_question: 'help',
  voice_translation: 'mic',
  dictation: 'file',
  vocabulary: 'refresh',
};

// Presentation of the English sentence for a mission: follow each exercise, or force one mode.
const PRESENTATION_CHOICES = [
  { value: 'auto', title: 'As in the exercise', sub: 'Each exercise decides', icon: 'sparkles' },
  { value: 'text', title: 'Text', sub: 'Always show the words', icon: 'textLong' },
  { value: 'audio', title: 'Listen only', sub: 'Hear it, no text', icon: 'headphones' },
];

// Play modes: the time of each question is split into three steps, and the points grow with the mode.
// `stars` shows how many points the mode gives.
const MODE_CHOICES = [
  { value: 'easy', title: 'Easy', sub: 'Full time to answer', stars: 1 },
  { value: 'medium', title: 'Medium', sub: 'Less time, more points', stars: 2 },
  { value: 'hard', title: 'Hard', sub: 'Least time, most points', stars: 3 },
];

// How the learner gives a text answer: typing (with the mic as an extra), or the mic only.
const ANSWER_INPUT_CHOICES = [
  { value: 'typing', title: 'Type or speak', sub: 'Keyboard, or the mic too', icon: 'keyboard' },
  { value: 'voice', title: 'Voice only', sub: 'Speak every answer', icon: 'mic' },
];

// How many questions one mission has, as big numbers.
const LENGTH_CHOICES = [
  { value: 10, title: 'Short', sub: '10 questions', big: '10' },
  { value: 20, title: 'Medium', sub: '20 questions', big: '20' },
  { value: MAX_MISSION_QUESTIONS, title: 'Long', sub: `${MAX_MISSION_QUESTIONS} questions`, big: String(MAX_MISSION_QUESTIONS) },
];

let timerId = null;
// Removes the result modal of the current question (set by renderQuestion).
let closeModal = () => {};

// True while a mission or review is being played (from its first question until its results).
let gameInProgress = false;
// The flow of the running game (restart and home), so the game can be left from outside its screens.
let currentFlow = null;
// True while the history entry added for the running game is still there (see pushGuard).
let guardPushed = false;
// True while this screen is open (set by renderPlay). Back and forward then move between the setup steps.
let playShowing = false;
let setupRoot = null;
// The next popstate comes from removing the guard: it is not a step of the setup, so it is ignored.
let skipPop = false;
// Set when the game ends through the guard: the setup comes back once the guard's entry is gone.
let pendingHome = false;
// While a review from reports is loading, a second router run must not open the setup on an old history step.
let reviewLoadPromise = null;

/** Same action as the in-page “← Back” button on setup screens; null on the root screen and during a game. */
function setTopbarBack(handler) {
  const btn = document.querySelector('.topbar-back');
  if (!btn) return;
  const show = typeof handler === 'function';
  btn.hidden = !show;
  document.body.classList.toggle('topbar-has-back', show);
  btn.onclick = show ? handler : null;
}

/** Used by the header to ask before leaving a game. */
export const isGameInProgress = () => gameInProgress;

/**
 * The bottom bar. 'play': the Difficulty step, where the bar is one "Play" button that starts the mission (Reports is hidden).
 * 'practice': the lesson's choice page, where the bar is one "Practice" button (it opens the exercise settings).
 * 'lesson': words, sentences, grammar or stories — Home and Reports are hidden (prev/next appear only during list playback).
 * 'home': every other screen, where the first tab reads "Home" and Reports is shown next to it.
 */
export function setTabMode(mode) {
  document.body.classList.toggle('play-step', mode === 'play');
  document.body.classList.toggle('practice-step', mode === 'practice');
  document.body.classList.toggle('lesson-step', mode === 'lesson');
  document.querySelectorAll('[data-nav="play"]').forEach((link) => {
    link.textContent = mode === 'play' ? 'Play' : mode === 'practice' ? 'Practice' : 'Home';
  });
  // The "Practice again" button belongs to the results screen only.
  const again = document.querySelector('.bottom-again');
  if (again) again.hidden = true;
}

/** Sets the game state, and the header button: while a game runs, that button leaves the game. */
function setGameRunning(running) {
  gameInProgress = running;
  document.body.classList.toggle('game-running', running);
  const button = document.querySelector('.topbar-admin');
  const label = running ? 'Leave game' : 'Settings';
  button?.setAttribute('aria-label', label);
  if (button) button.title = label;
}

/** Asks before a running game is left. Resolves to true when it is fine to leave: at once when no game is running. */
export async function confirmLeaveGame() {
  if (!gameInProgress) return true;
  return confirmDialog({
    title: 'Leave this game?',
    message: 'Your answers so far are saved. The rest of this mission will not be played.',
    confirmText: 'Leave game',
    cancelText: 'Keep playing',
  });
}

/**
 * The browser's back button asks before it leaves a game. Starting a game adds one history entry (the guard)
 * with the same address. Back removes that entry: the learner is asked, and "Keep playing" adds it again.
 */
function pushGuard() {
  history.pushState({ game: true }, '', location.href);
  guardPushed = true;
}

/** Removes the guard when the game ends on this screen, so the back button does not show the same screen twice. */
function dropGuard() {
  if (!guardPushed) return;
  guardPushed = false;
  skipPop = true;
  history.back();
}

window.addEventListener('popstate', async () => {
  if (!guardPushed) return;
  guardPushed = false;
  if (!gameInProgress) return;
  if (await confirmLeaveGame()) endGame();
  else if (gameInProgress) pushGuard();
});

// The back and forward buttons between the setup steps (see showSetup: each step is a history entry).
window.addEventListener('popstate', (event) => {
  // The card view of a lesson page (words / sentences) closes on back: that is not a setup step either.
  if (handleCardViewBack()) return;
  if (skipPop) {
    skipPop = false;
    if (pendingHome) {
      pendingHome = false;
      currentFlow?.home();
    } else {
      // The guard's entry was removed while the results stay on screen: they keep the top of the page.
      scrollToTop();
    }
    return;
  }
  // Another kind of entry (for example the game guard) is not a setup step.
  if (event.state && !event.state.setup) return;
  const step = event.state?.setup ?? null;
  // A change of screen fires hashchange right after this event: wait for the router, so only this screen's steps are drawn here.
  setTimeout(() => {
    if (!playShowing || gameInProgress || !setupRoot) return;
    showSetup(setupRoot, step);
  }, 0);
});

/**
 * Ends the running game on this screen: its time is saved and the setup screen comes back.
 * The caller asks the learner first (see confirmLeaveGame).
 */
export function endGame() {
  if (!gameInProgress) return;
  stopTimer();
  closeModal();
  endMission();
  setGameRunning(false);
  keepScreenOn(false);
  if (guardPushed) {
    // The guard's entry is removed first; the setup is drawn then, so the entry it lands on is the setup's own.
    pendingHome = true;
    dropGuard();
  } else {
    currentFlow?.home();
  }
}

// The start action of the settings screen (null on every other screen). Set by drawSettingsStep.
let settingsStart = null;

/**
 * The bottom Play tab, while the settings screen is open: starts the mission (there is no Start button).
 * Returns false when that does not apply, so the tab is handled as usual.
 */
export function startFromNav() {
  if (!settingsStart) return false;
  settingsStart();
  return true;
}

const CONFETTI_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#c77dff'];

/** Colored paper that falls when the answer is correct. */
function confettiPieces() {
  return Array.from({ length: 70 }, (_, i) => {
    const piece = h('span', { class: 'confetti-piece' });
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    return piece;
  });
}

/** Slow blue drops that fall when the answer is wrong or the time ran out. */
function rainDrops() {
  return Array.from({ length: 45 }, () => {
    const drop = h('span', { class: 'rain-drop' });
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.animationDelay = `${Math.random() * 1.5}s`;
    drop.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    return drop;
  });
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/** Route entry point. Returns a cleanup function that the router calls when leaving the view. */
export async function renderPlay(root) {
  playShowing = true;
  setupRoot = root;
  // Opened from the reports screen with questions to review: start that game right away.
  const reviewIds = takeReview();
  if (reviewIds?.length && !reviewLoadPromise) {
    clearReviewHandoff();
    reviewLoadPromise = startReview(root, reviewIds).finally(() => {
      reviewLoadPromise = null;
    });
  }
  if (reviewLoadPromise) await reviewLoadPromise;
  // A second route while a review is loading must not reopen the book picker from an old history step.
  else if (!gameInProgress) {
    const restore = hasReviewIntent() ? null : (history.state?.setup ?? null);
    clearReviewHandoff();
    await showSetup(root, restore);
  }
  return () => {
    playShowing = false;
    setupRoot = null;
    stopTimer();
    closeModal();
    stopStoryReading();
    // Leaving the screen ends any study or mission time in progress.
    endMission();
    setGameRunning(false);
    keepScreenOn(false);
    settingsStart = null;
    setTopbarBack(null);
  };
}

// Chip group. `selected` is an array that is mutated in place.
function chipGroup(options, selected, { multiple = true, onChange, className = '' }) {
  const box = h('div', { class: `chips ${className}`.trim() });
  const draw = () =>
    box.replaceChildren(
      ...options.map(([value, label]) => {
        const active = selected.includes(value);
        return h(
          'button',
          {
            type: 'button',
            class: `chip-toggle${active ? ' active' : ''}`,
            'aria-pressed': active,
            onclick: () => {
              if (multiple) {
                const index = selected.indexOf(value);
                if (index >= 0) selected.splice(index, 1);
                else selected.push(value);
              } else {
                selected.splice(0, selected.length, value);
              }
              draw();
              onChange?.();
            },
          },
          label,
        );
      }),
    );
  draw();
  return box;
}

/** Stars that show how many points a choice gives: `count` filled stars out of `total`. */
function starRow(count, total = 3) {
  return h(
    'span',
    { class: 'choice-stars', 'aria-label': `${count} of ${total} stars` },
    Array.from({ length: total }, (_, index) => uiIcon('star', index < count ? 'choice-star on' : 'choice-star')),
  );
}

/**
 * Setup choices as picture cards: an icon (or stars, or a big number), a short title and one plain line.
 * Same rules as chipGroup: `selected` is mutated in place, and onChange runs after each tap.
 */
function choiceCards(options, selected, { multiple = false, onChange, className = '' }) {
  const box = h('div', { class: `choice-grid ${className}`.trim() });
  const draw = () =>
    box.replaceChildren(
      ...options.map(({ value, title, sub = '', icon = null, stars = null, big = null }) => {
        const active = selected.includes(value);
        return h(
          'button',
          {
            type: 'button',
            class: `choice-card${active ? ' active' : ''}`,
            'aria-pressed': active,
            onclick: () => {
              if (multiple) {
                const index = selected.indexOf(value);
                if (index >= 0) selected.splice(index, 1);
                else selected.push(value);
              } else {
                selected.splice(0, selected.length, value);
              }
              draw();
              onChange?.();
            },
          },
          h(
            'span',
            { class: 'choice-visual' },
            big ? h('span', { class: 'choice-big' }, big) : stars ? starRow(stars) : icon ? uiIcon(icon) : null,
          ),
          h('span', { class: 'choice-text' }, h('strong', {}, title), sub ? h('span', { class: 'choice-sub' }, sub) : null),
          h('span', { class: 'choice-check' }, uiIcon('check')),
        );
      }),
    );
  draw();
  return box;
}

/** A numbered part of the setup: a round number, a title, one short hint, then the choices. */
function setupSection(number, title, hint, body) {
  return h(
    'section',
    { class: 'setup-section' },
    h(
      'div',
      { class: 'setup-section-head' },
      h('span', { class: 'section-badge', 'aria-hidden': 'true' }, String(number)),
      h('div', { class: 'section-heading' }, h('h4', { class: 'section-title' }, title), h('p', { class: 'section-hint' }, hint)),
    ),
    body,
  );
}

/** Keeps only saved values that still exist; falls back when nothing was saved. */
function restored(value, valid, fallback) {
  return Array.isArray(value) ? value.filter((item) => valid.includes(item)) : fallback;
}

function miniStat(value, label) {
  return h('div', { class: 'mini-stat' }, h('strong', {}, value), h('span', {}, label));
}

/** Level, XP progress and lifetime numbers at the top of the setup screen. */
function playerCard(profile) {
  const pct = Math.round(profile.levelProgress * 100);
  return h(
    'div',
    { class: 'hero' },
    h(
      'div',
      { class: 'level-badge', dir: 'ltr', 'aria-label': `Level ${profile.level}` },
      h('span', {}, 'Level'),
      h('strong', {}, String(profile.level)),
    ),
    h(
      'div',
      { class: 'hero-body' },
      h('strong', { class: 'hero-title' }, 'Ready for your next mission?'),
      h(
        'div',
        { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
        h('div', { class: 'xp-fill', style: `width: ${pct}%` }),
      ),
      h('span', { class: 'muted small' }, `${fa(profile.xp - levelStartXp(profile.level))} of ${fa(levelStartXp(profile.level + 1) - levelStartXp(profile.level))} XP to the next level`),
    ),
    h(
      'div',
      { class: 'hero-stats' },
      miniStat(fa(profile.answered), 'Answered'),
      miniStat(profile.accuracy == null ? '—' : percent(profile.accuracy), 'Accuracy'),
      miniStat(fa(profile.bestStreak), 'Best streak'),
    ),
  );
}

function stepTitle(text) {
  return h('h4', { class: 'step-title' }, text);
}

/**
 * A review game: the questions that were answered wrong, in random order, with the same
 * timer, points and results as a normal game. Review asks for these questions whether or not they are due.
 */
async function startReview(root, ids) {
  root.replaceChildren(h('p', { class: 'loading' }, 'Getting ready…'));
  const [questions, lessons, attempts] = await Promise.all([listQuestions(), listLessons(), loadAttempts()]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const saved = getSettings();
  const voiceOnly = saved.answerInput === 'voice';
  const pool = shuffle(
    ids
      .map((id) => byId.get(id))
      .filter((q) => q && q.enabled !== false)
      .map((q) => {
        const spelled = applySpellingMode(q);
        return applyPlayMode(voiceOnly ? { ...spelled, answer_input: 'voice' } : spelled, saved.mode);
      }),
  ).slice(0, MAX_MISSION_QUESTIONS);
  if (pool.length === 0) {
    requestReview(ids);
    toast('No questions to review are left.', 'warn');
    if (!gameInProgress) await showSetup(root);
    return;
  }
  const before = playerProfile(attempts);
  // A question pays points once, on its first correct answer ever; a review of it pays nothing.
  const alreadyScored = attempts.filter((a) => a.correct).map((a) => a.questionId);
  // What the result card needs about this game: the lessons, and what was done before it started.
  const report = { lessons, questions, doneBefore: doneIds(questions, attempts), mode: saved.mode, startedAt: Date.now() };
  beginMission();
  renderQuestion(root, new GameSession(pool, { alreadyScored }), {
    restart: () => startReview(root, ids),
    home: () => showSetup(root),
    xpBefore: before.xp,
    report,
  });
}

/**
 * The setup screen. `restore` is the step that the back or forward button came to (see the popstate listener);
 * without it the setup opens on the book the learner used last.
 */
async function showSetup(root, restore = null) {
  setTabMode('home');
  scrollToTop();
  root.replaceChildren(h('p', { class: 'loading' }, 'Getting ready…'));

  const [questions, lessons, attempts] = await Promise.all([listQuestions(), listLessons(), loadAttempts()]);
  const profile = playerProfile(attempts);
  // A question answered correctly is done until its interval expires, then it is due again (see spaced-repetition.js).
  const now = Date.now();
  const schedule = scheduleOf(attempts);
  const done = doneIds(questions, attempts, now);
  const progressOfLessons = (keys) =>
    progressOf(
      questions.filter((q) => keys.includes(lessonKey(q.book, q.lesson))),
      done,
    );
  // Which lessons of a book are open (see lesson-unlock.js). The unlocks are stored, so they last.
  const openLessonsOf = (book) => {
    const keys = book.lessons.map((lesson) => lesson.key);
    const stored = getUnlockedLessons();
    const open = unlockedLessons(keys, (key) => progressOfLessons([key]), stored);
    if (open.size !== stored.size) saveUnlockedLessons(open);
    return { isOpen: (key) => open.has(key) };
  };
  // A locked lesson: a card says which lesson has to be finished first.
  const showLocked = (book, lesson) => {
    const previousKey = previousLesson(
      book.lessons.map((item) => item.key),
      lesson.key,
    );
    const previous = book.lessons.find((item) => item.key === previousKey);
    return confirmDialog({
      title: 'Lesson locked',
      message: `Finish at least 75% of "${previous?.lessonTitle ?? ''}" first. Then "${lesson.lessonTitle}" will open.`,
      confirmText: 'OK',
      cancelText: 'Close',
    });
  };
  // The "All lessons" rows show only when every lesson of the scope is at least 75% done and none is locked.
  const allRowShown = (lessons, open) =>
    lessons.every((lesson) => open.isOpen(lesson.key) && reachedShare(progressOfLessons([lesson.key])));
  const saved = getSettings();
  const series = seriesList(lessons);
  const allBooks = series.flatMap((entry) => entry.books);
  const lessonsOf = (bookId) => allBooks.find((book) => book.id === bookId)?.lessons ?? [];
  const seriesOf = (bookId) => series.find((entry) => entry.books.some((book) => book.id === bookId)) ?? null;
  // The book the learner used last. When it still exists, the setup opens inside it.
  const savedBook = allBooks.some((book) => book.id === saved.book) ? saved.book : null;
  const allLessonKeys = lessonsOf(savedBook).map((lesson) => lesson.key);
  const savedLessons = restored(saved.lessons, allLessonKeys, []);
  // The unit the learner was in, when it still belongs to the saved book (null for the whole book).
  const savedUnit = allBooks.find((book) => book.id === savedBook)?.units.find((unit) => unit.key === saved.unit)?.key ?? null;

  const state = {
    book: savedBook,
    unit: savedUnit,
    lessons: savedLessons.length ? savedLessons : allLessonKeys,
    categories: restored(saved.categories, Object.keys(CATEGORIES), Object.keys(CATEGORIES)),
    // One practice group ('all' for every question). A group that the chosen lessons do not have is reset in the settings step.
    group: [typeof saved.group === 'string' && saved.group ? saved.group : 'all'],
    presentation: [PRESENTATION_CHOICES.some((choice) => choice.value === saved.presentation) ? saved.presentation : 'auto'],
    input: [saved.answerInput === 'voice' ? 'voice' : 'typing'],
    mode: [Object.hasOwn(PLAY_MODES, saved.mode) ? saved.mode : 'easy'],
    count: [COUNTS.includes(savedCount(saved.count)) ? savedCount(saved.count) : 10],
  };

  // Set by the mission step; the book step does not show them.
  let info = null;

  // Questions of the chosen book, lessons and exercise types (enabled ones).
  function selectedQuestions() {
    return filterQuestions(questions, {
      books: [state.book],
      lessons: state.lessons,
      groups: state.group[0] === 'all' ? undefined : [state.group[0]],
      categories: state.categories,
    });
  }

  // Questions the mission can offer now: the selected ones that are due.
  function available() {
    return selectedQuestions().filter((q) => isDue(schedule, q.id, now));
  }

  function refresh() {
    saveSettings({
      book: state.book,
      unit: state.unit,
      lessons: state.lessons,
      categories: state.categories,
      group: state.group[0],
      presentation: state.presentation[0],
      answerInput: state.input[0],
      mode: state.mode[0],
      count: state.count[0],
    });
    if (!info) return;
    const count = available().length;
    if (count) {
      info.textContent = `${plural(count, 'question')} due for this mission`;
    } else {
      const next = nextDueAt(selectedQuestions(), schedule, now);
      info.textContent = next
        ? `Nothing is due yet. The next question is due ${dueText(next)}.`
        : 'No questions match these settings.';
    }
  }

  async function start() {
    // Read the attempts again: a game that just ended may have changed the schedule.
    const fresh = await loadAttempts();
    const freshNow = Date.now();
    const freshSchedule = scheduleOf(fresh);
    const chosen = missionQuestions(selectedQuestions(), freshSchedule, freshNow, {
      count: state.count[0],
    });
    if (chosen.length === 0) {
      const next = nextDueAt(selectedQuestions(), freshSchedule, freshNow);
      toast(
        next ? `Nothing is due yet. The next question is due ${dueText(next)}.` : 'No questions match these settings.',
        'warn',
      );
      return;
    }
    // "auto" keeps each exercise's own presentation; the other choices apply to the whole mission.
    const forced = state.presentation[0];
    const voiceOnly = state.input[0] === 'voice';
    const picked = chosen.map((question) => {
      // A dictation word picks its spelling mode (audio, meaning or letters) when the exercise keeps its own presentation.
      const next = forced === 'auto' ? applySpellingMode(question) : { ...question, presentation: forced };
      const withInput = voiceOnly ? { ...next, answer_input: 'voice' } : next;
      return applyPlayMode(withInput, state.mode[0]);
    });
    const before = playerProfile(fresh);
    // A question pays points once, on its first correct answer ever; asking it again pays nothing.
    const alreadyScored = fresh.filter((a) => a.correct).map((a) => a.questionId);
    // What the result card needs about this mission: the lessons, and what was done before it started.
    const report = {
      lessons,
      questions,
      doneBefore: doneIds(questions, fresh, freshNow),
      mode: state.mode[0],
      startedAt: Date.now(),
    };
    // The mission's time starts now and ends on the results screen, or when the learner leaves.
    beginMission();
    renderQuestion(root, new GameSession(picked, { alreadyScored }), {
      restart: start,
      home: () => showSetup(root),
      xpBefore: before.xp,
      report,
    });
  }

  // Every step the learner opens is a history entry. A step is { name, series?, book?, unit?, lessons?, depth }:
  // name is series, book, unit, lesson or settings; the entry's depth counts the steps before it in this visit.
  // So the back button (phone or in-app) returns to the step before, and the forward button goes on again.
  function show(step) {
    // A story or play-all list stops when the learner goes to another step.
    stopStoryReading();
    stopLinesPlayback();
    if (step.name === 'series') return drawSeriesStep();
    if (step.name === 'book') return drawBookStep(step.series);
    state.book = step.book;
    if (step.name === 'unit') return drawUnitStep();
    if (step.name === 'lesson') return drawLessonStep(step.unit);
    state.unit = step.unit ?? null;
    state.lessons = [...step.lessons];
    if (LESSON_PAGES.includes(step.name)) return drawLessonPage(step);
    setLessonStudy(false);
    return drawSettingsStep();
  }

  // Identifies the screen of a step (its name, series, book and unit). Lessons and depth do not change the screen.
  function stepKey(step) {
    return step ? [step.name, step.series ?? '', step.book ?? '', step.unit ?? ''].join('|') : '';
  }

  // Opens a step one level deeper, as a new history entry. The entry records the screen it came from (`from`).
  function go(step) {
    const current = history.state?.setup ?? null;
    const depth = (current?.depth ?? 0) + 1;
    history.pushState({ setup: { ...step, depth, from: stepKey(current) } }, '', location.href);
    show(step);
  }

  // Header back (setTopbarBack) uses the same rules: history back when the entry below matches, otherwise replaceState.
  function back(parent) {
    const current = history.state?.setup ?? null;
    if (current?.depth > 0 && current.from === stepKey(parent)) {
      history.back();
      return;
    }
    const depth = Math.max((current?.depth ?? 1) - 1, 0);
    history.replaceState({ setup: { ...parent, depth, from: null } }, '', location.href);
    show(parent);
  }

  // Screens of the picker, in order: series -> book -> unit -> lessons -> settings (exercise types, presentation, length).
  // "Continue" sits directly under the cards it applies to.

  // Step 1: choose the series (for example Evolve).
  function drawSeriesStep() {
    settingsStart = null;
    setTabMode('home');
    setTopbarBack(null);
    info = null;
    // Tapping a series opens its books at once.
    const grid = h(
      'div',
      { class: 'picker-grid series-grid' },
      series.map((entry) =>
        pickCard({
          image: entry.logo,
          title: entry.title,
          subtitle: plural(entry.books.length, 'book'),
          onclick: () => go({ name: 'book', series: entry.id }),
        }),
      ),
    );

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        series.length
          ? stepTitle('Book series')
          : h('p', { class: 'empty' }, 'No lessons installed yet. Check the content folder.'),
        grid,
      ),
    );
  }

  // Step 2: choose the book inside the series. Opening it from the mission screen goes back here.
  function drawBookStep(seriesId) {
    settingsStart = null;
    setTabMode('home');
    setTopbarBack(() => back({ name: 'series' }));
    info = null;
    const entry = series.find((item) => item.id === seriesId) ?? series[0];
    // Tapping a book opens its lessons at once. The book is remembered for the next visit.
    const grid = h(
      'div',
      { class: 'picker-grid book-grid' },
      entry.books.map((book) =>
        pickCard({
          image: book.cover,
          title: book.title,
          subtitle: plural(book.units.length, 'unit'),
          badge: book.level,
          onclick: () => {
            state.book = book.id;
            state.unit = null;
            state.lessons = [];
            saveSettings({ ...getSettings(), book: state.book, unit: null, lessons: [] });
            go({ name: 'unit', book: book.id });
          },
        }),
      ),
    );

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        stepTitle(`Books in ${entry.title}`),
        grid,
      ),
    );
  }

  // Step 3: inside the chosen book, its units. Opening a unit lists its lessons. The whole book stays
  // available for review, so the learner can still practise every lesson at once.
  function drawUnitStep() {
    settingsStart = null;
    setTabMode('home');
    const book = allBooks.find((entry) => entry.id === state.book);
    const parent = seriesOf(book.id);
    setTopbarBack(() => back({ name: 'book', series: parent?.id }));
    const allKeys = book.lessons.map((lesson) => lesson.key);
    const lastKey = lastPracticedKey(book);
    const open = openLessonsOf(book);
    const unitBox = h('div', { class: 'lesson-list' });
    unitBox.replaceChildren(
      ...(allRowShown(book.lessons, open)
        ? [
            lessonRow({
              title: 'All lessons in this book',
              subtitle: `For review · ${plural(allKeys.length, 'lesson')}`,
              dashed: true,
              progress: progressOfLessons(allKeys),
              onclick: () => go({ name: 'hub', book: state.book, unit: null, lessons: [...allKeys] }),
            }),
          ]
        : []),
      ...book.units.map((unit) => {
        const keys = unit.lessons.map((lesson) => lesson.key);
        const progress = progressOfLessons(keys);
        return lessonRow({
          title: unit.title,
          subtitle: plural(keys.length, 'lesson'),
          tag: progress.complete ? 'Completed' : keys.includes(lastKey) ? 'Last practised' : null,
          progress,
          onclick: () => go({ name: 'lesson', book: state.book, unit: unit.key }),
        });
      }),
    );
    info = null;

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        bookHeader(book, progressOfLessons(allKeys)),
        stepTitle('Units'),
        unitBox,
      ),
    );
    refresh();
  }

  // Step 4: inside one unit. One row per lesson, plus a row for the whole unit.
  function drawLessonStep(unitKeyValue) {
    settingsStart = null;
    setTabMode('home');
    const book = allBooks.find((entry) => entry.id === state.book);
    const unit = book.units.find((item) => item.key === unitKeyValue);
    if (!unit) return drawUnitStep();
    setTopbarBack(() => back({ name: 'unit', book: state.book }));
    const allKeys = unit.lessons.map((lesson) => lesson.key);
    const lastKey = lastPracticedKey(book);
    const open = openLessonsOf(book);
    const lessonBox = h('div', { class: 'lesson-list' });
    lessonBox.replaceChildren(
      ...(allRowShown(unit.lessons, open)
        ? [
            lessonRow({
              title: `All lessons in ${unit.title}`,
              subtitle: `For review · ${plural(allKeys.length, 'lesson')}`,
              dashed: true,
              progress: progressOfLessons(allKeys),
              onclick: () => go({ name: 'hub', book: state.book, unit: unit.key, lessons: [...allKeys] }),
            }),
          ]
        : []),
      ...unit.lessons.map((lesson) => {
        const progress = progressOfLessons([lesson.key]);
        const locked = !open.isOpen(lesson.key);
        return lessonRow({
          title: lesson.lessonTitle,
          subtitle: plural(lesson.count, 'question'),
          tag: progress.complete ? 'Completed' : lesson.key === lastKey ? 'Last practised' : null,
          progress,
          locked,
          onclick: locked
            ? () => showLocked(book, lesson)
            : () => go({ name: 'hub', book: state.book, unit: unit.key, lessons: [lesson.key] }),
        });
      }),
    );
    info = null;

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        unitHeader(book, unit, progressOfLessons(allKeys)),
        stepTitle(unit.title),
        lessonBox,
      ),
    );
    refresh();
  }

  // The lesson's own pages: the hub, and the pages it leads to (see drawLessonPage).
  const LESSON_PAGES = ['hub', 'words', 'sentences', 'grammar', 'stories'];
  const LESSON_CONTENT_PAGES = new Set(['words', 'sentences', 'grammar', 'stories']);
  let lessonStudyActive = false;

  /** Words / sentences / grammar / stories: keep the screen on and count time like a mission until the learner leaves. */
  function setLessonStudy(active) {
    if (active === lessonStudyActive) return;
    lessonStudyActive = active;
    if (active) {
      beginMission();
      keepScreenOn(true);
      return;
    }
    endMission();
    if (!gameInProgress) keepScreenOn(false);
  }

  // The screens between the lesson and the settings. The hub gives three choices: Words and Sentences (each a page
  // of its own) and Practice (the settings step). Every page is a history entry, so the back buttons return to the
  // page before it.
  function drawLessonPage(step) {
    setLessonStudy(LESSON_CONTENT_PAGES.has(step.name));
    settingsStart = null;
    setTabMode(LESSON_CONTENT_PAGES.has(step.name) ? 'lesson' : 'home');
    info = null;
    const book = allBooks.find((entry) => entry.id === state.book);
    const unit = step.unit ? book.units.find((item) => item.key === step.unit) ?? null : null;
    const chosenLessons = book.lessons.filter((lesson) => state.lessons.includes(lesson.key));
    const chosenQuestions = questions.filter((q) => state.lessons.includes(lessonKey(q.book, q.lesson)));
    const material = lessonMaterial(
      chosenQuestions,
      lessons.filter((lesson) => state.lessons.includes(lesson.key)).map((lesson) => lesson.content),
    );
    const hubStep = { name: 'hub', book: state.book, unit: step.unit ?? null, lessons: [...state.lessons] };

    let backTo = hubStep;
    let body;
    if (step.name === 'hub') {
      backTo = unit ? { name: 'lesson', book: state.book, unit: unit.key } : { name: 'book', series: seriesOf(state.book)?.id };
      // The road, in the learning order: read the words, learn the grammar, practise the sentences, read a story,
      // then practise the exercises (the finish).
      const tiles = [
        {
          kind: 'words',
          title: 'Words',
          subtitle: `${plural(material.words.length, 'word')} · meaning and sound`,
          onclick: () => go({ ...hubStep, name: 'words' }),
        },
      ];
      if (material.grammar.length) {
        tiles.push({
          kind: 'grammar',
          title: 'Grammar',
          subtitle: `${plural(material.grammar.length, 'rule')} · with examples`,
          onclick: () => go({ ...hubStep, name: 'grammar' }),
        });
      }
      tiles.push({
        kind: 'sentences',
        title: 'Sentences',
        subtitle: `${plural(material.sentences.length, 'sentence')} · tap to translate`,
        onclick: () => go({ ...hubStep, name: 'sentences' }),
      });
      if (material.stories.length) {
        tiles.push({
          kind: 'stories',
          title: 'Stories',
          subtitle: `${fa(material.stories.length)} ${material.stories.length === 1 ? 'story' : 'stories'} · from this lesson`,
          onclick: () => go({ ...hubStep, name: 'stories' }),
        });
      }
      tiles.push({
        kind: 'practice',
        icon: 'trophy',
        title: 'Practice',
        subtitle: `${plural(chosenQuestions.length, 'question')} · the finish line`,
        onclick: () => go({ name: 'settings', book: state.book, unit: hubStep.unit, lessons: [...state.lessons] }),
      });
      body = h('div', {}, stepTitle('What do you want to do?'), lessonHub(tiles));
      // No bottom bar on the road: Home and Reports are only on the main page. Practice is the last stop of the road.
      setTabMode('lesson');
    } else if (step.name === 'words') {
      // A synonym or opposite can come from an earlier lesson of the book, so its pronunciation and meaning are
      // looked up in every lesson of this book (the chosen lessons first).
      const bookWords = lessonMaterial(
        [],
        lessons.filter((lesson) => book.lessons.some((entry) => entry.key === lesson.key)).map((lesson) => lesson.content),
      ).words;
      const wordStudy = buildWordStudyIndex(chosenQuestions, material.sentences, {
        vocabulary: [...material.words, ...bookWords],
      });
      body = h(
        'div',
        {},
        stepTitle('Words'),
        linesPage({
          groups: [
            {
              rows: wordRows(material).map((w) => {
                // A quiz row shows only its capital city. It has no synonyms or examples: an example sentence
                // with the capital city would give the country away.
                if (w.quiz) {
                  return {
                    english: w.word,
                    persian: '',
                    ipa: w.ipa,
                    category: w.category,
                    synonyms: [],
                    antonyms: [],
                    examples: [],
                    quiz: w.quiz,
                  };
                }
                const extra = wordStudy(w.word);
                return {
                  english: w.word,
                  persian: w.meaning,
                  ipa: w.ipa,
                  category: w.category,
                  synonyms: extra.synonyms,
                  antonyms: extra.antonyms,
                  examples: extra.examples,
                };
              }),
            },
          ],
          speakLabel: 'Read the word aloud',
          playbarLabel: 'Listen to all words',
          playTitle: 'Play all words slowly',
          shuffle: true,
          search: true,
          categories: true,
          playbarFeatures: { autoReveal: true, autoSpeakCard: true, deckPlayback: true, deckRich: true },
        }),
      );
    } else if (step.name === 'sentences') {
      body = h(
        'div',
        {},
        stepTitle('Sentences'),
        linesPage({
          groups: [{ rows: material.sentences }],
          speakLabel: 'Read the sentence aloud',
          playbarLabel: 'Listen to all sentences',
          playTitle: 'Play all sentences slowly',
          shuffle: true,
          search: true,
          playbarFeatures: {
            autoReveal: true,
            longSentence: true,
            deckPlayback: true,
          },
        }),
      );
    } else if (step.name === 'grammar') {
      body = h(
        'div',
        {},
        stepTitle('Grammar'),
        linesPage({
          groups: material.grammar.map((rule) => ({
            title: rule.title,
            explanation: rule.explanation,
            rows: rule.examples,
          })),
          speakLabel: 'Read the example aloud',
          playbar: false,
          modeSwitch: false,
          note: 'Read the rule first, then its examples. Each example shows its English and its Persian together.',
        }),
      );
    } else {
      body = h('div', {}, stepTitle('Stories'), storiesPage(material.stories));
    }

    setTopbarBack(() => back(backTo));

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        selectionHeader(book, unit, chosenLessons, progressOfLessons(state.lessons)),
        body,
      ),
    );
  }

  // Done / total of one exercise type in the chosen lessons and the chosen group, counted the same way as the lesson tiles.
  const inChosenLessons = (q) => state.lessons.includes(lessonKey(q.book, q.lesson));
  const inChosenGroup = (q) => state.group[0] === 'all' || q.group === state.group[0];
  function categoryProgress(category) {
    return progressOf(
      questions.filter((q) => q.category === category && inChosenLessons(q) && inChosenGroup(q)),
      done,
    );
  }

  // The practice groups of the chosen lessons (e.g. "Countries"), in the order they first appear in the lesson files.
  function groupNames() {
    const names = [];
    for (const q of questions) {
      if (q.group && inChosenLessons(q) && !names.includes(q.group)) names.push(q.group);
    }
    return names;
  }

  // Done / total of one group ('all' for every question) in the chosen lessons.
  function groupProgress(group) {
    return progressOf(
      questions.filter((q) => inChosenLessons(q) && (group === 'all' || q.group === group)),
      done,
    );
  }

  // Step 4: the rest of the settings, on their own screen: exercise types, presentation and length.
  function drawSettingsStep() {
    settingsStart = null;
    const book = allBooks.find((entry) => entry.id === state.book);
    // A group the chosen lessons do not have (for example after the lessons changed) goes back to All.
    const names = groupNames();
    if (state.group[0] !== 'all' && !names.includes(state.group[0])) state.group.splice(0, 1, 'all');
    // The exercise types and their counts follow the chosen group, so only this part is drawn again on a change.
    const typeChips = h('div', {});
    const drawTypeChips = () =>
      typeChips.replaceChildren(
        chipGroup(
          // Only the exercise types that have questions in the chosen lessons and group are offered.
          Object.entries(CATEGORIES)
            .map(([key, label]) => [key, label, categoryProgress(key)])
            .filter(([, , progress]) => progress.total > 0)
            .map(([key, label, progress]) => [
              key,
              categoryChip(label, progress, CATEGORY_ICONS[key]),
            ]),
          state.categories,
          { onChange: refresh, className: 'card-options mission-options' },
        ),
      );
    drawTypeChips();
    info = h('p', { class: 'setup-info muted small info' });
    // The Difficulty step: the bottom bar is one Play button, and it starts the mission (there is no Start button).
    settingsStart = () => {
      start();
      return true;
    };
    setTabMode('play');
    setTopbarBack(() =>
      back({ name: 'hub', book: state.book, unit: state.unit, lessons: [...state.lessons] }),
    );

    scrollToTop();
    root.replaceChildren(
      playerCard(profile),
      h(
        'section',
        { class: 'card setup game' },
        selectionHeader(
          book,
          state.unit ? book.units.find((item) => item.key === state.unit) ?? null : null,
          book.lessons.filter((lesson) => state.lessons.includes(lesson.key)),
          progressOfLessons(state.lessons),
        ),
        setupTip(),
        setupSection(1, 'Choose your level', 'Harder levels give you less time and more points.', choiceCards(MODE_CHOICES, state.mode, {
          onChange: refresh,
          className: 'mode-grid',
        })),
        setupSection(
          2,
          'Pick what to practise',
          'Tap each exercise type you want. The bar shows how much you have done.',
          h(
            'div',
            { class: 'setup-subsection' },
            // The group (e.g. Countries) practises one part of the lessons on its own. Shown only when the lessons have groups.
            names.length ? h('h5', { class: 'sub-title' }, 'Group') : null,
            names.length
              ? chipGroup(
                  [
                    ['all', categoryChip('All', groupProgress('all'))],
                    ...names.map((name) => [name, categoryChip(name, groupProgress(name))]),
                  ],
                  state.group,
                  {
                    multiple: false,
                    onChange: () => {
                      drawTypeChips();
                      refresh();
                    },
                    className: 'card-options mission-options',
                  },
                )
              : null,
            names.length ? h('h5', { class: 'sub-title' }, 'Exercise type') : null,
            typeChips,
          ),
        ),
        setupSection(
          3,
          'How to play',
          'Choose how the sentence is shown and how you answer.',
          h(
            'div',
            { class: 'setup-subsection' },
            h('h5', { class: 'sub-title' }, 'Sentence display'),
            choiceCards(PRESENTATION_CHOICES, state.presentation, { onChange: refresh, className: 'list-grid' }),
            h('h5', { class: 'sub-title' }, 'Answer input'),
            choiceCards(ANSWER_INPUT_CHOICES, state.input, { onChange: refresh, className: 'list-grid' }),
          ),
        ),
        setupSection(4, 'How many questions', 'Shorter missions are quicker to finish.', choiceCards(LENGTH_CHOICES, state.count, {
          onChange: refresh,
          className: 'length-grid',
        })),
        info,
      ),
    );
    refresh();
  }

  // A saved step of a book that is no longer installed is not restored: the setup opens on its default step.
  if (restore && restore.name !== 'series' && restore.name !== 'book' && !allBooks.some((book) => book.id === restore.book)) {
    restore = null;
  }
  // The back or forward button brought the learner to a step: draw that step, the history entry is already there.
  if (restore) return show(restore);

  // The last book is remembered: the setup opens inside it (inside the last unit, when there was one).
  // Otherwise the learner starts with the series.
  const first = !state.book
    ? { name: 'series' }
    : state.unit
      ? { name: 'lesson', book: state.book, unit: state.unit }
      : { name: 'unit', book: state.book };
  // The opening step is the first entry of the setup (depth 0). It replaces the current entry, so each entry always
  // shows the screen it was saved for (a reload, or the Home tab, does not add a duplicate back entry).
  history.replaceState({ setup: { ...first, depth: 0 } }, '', location.href);
  show(first);
}

/**
 * Series -> books -> units -> lessons, in the order of the course index.
 * Every lesson record carries its series, book and unit details (see indexLessons in content.js).
 * A book also keeps all its lessons in one list (`lessons`), for the whole-book review.
 */
function seriesList(lessons) {
  const series = new Map();
  for (const lesson of [...lessons].sort((a, b) => a.order - b.order)) {
    const seriesId = lesson.series || 'default';
    if (!series.has(seriesId)) {
      series.set(seriesId, { id: seriesId, title: lesson.seriesTitle || 'Books', logo: lesson.seriesLogo || '', books: [] });
    }
    const entry = series.get(seriesId);
    let book = entry.books.find((item) => item.id === lesson.book);
    if (!book) {
      book = {
        id: lesson.book,
        title: lesson.bookTitle || lesson.book,
        level: lesson.bookLevel || '',
        cover: lesson.bookCover || '',
        units: [],
        lessons: [],
      };
      entry.books.push(book);
    }
    book.lessons.push(lesson);

    const unitId = lesson.unit || 'unassigned';
    let unit = book.units.find((item) => item.id === unitId);
    if (!unit) {
      unit = {
        id: unitId,
        key: unitKey(lesson.book, unitId),
        title: lesson.unitTitle || 'Lessons',
        lessons: [],
      };
      book.units.push(unit);
    }
    unit.lessons.push(lesson);
  }
  return [...series.values()];
}

/** A selectable card with an image (series logo or book cover), a title and a subtitle. */
function pickCard({ image, title, subtitle, badge: levelBadge, onclick }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'pick-card',
      onclick,
    },
    h('span', { class: `pick-media${image ? '' : ' no-image'}` }, image ? h('img', { src: image, alt: '', loading: 'lazy' }) : h('span', {}, title.slice(0, 2))),
    levelBadge ? h('span', { class: 'pick-level' }, levelBadge) : null,
    h('strong', { class: 'pick-title', dir: 'auto' }, title),
    subtitle ? h('span', { class: 'pick-sub' }, subtitle) : null,
  );
}

/** Key of the lesson practised last, when it belongs to this book; otherwise null. */
function lastPracticedKey(book) {
  const last = getSettings().lastLesson;
  return book?.lessons.some((lesson) => lesson.key === last) ? last : null;
}

/** A thin bar with the done / total numbers and the percent. `progress` comes from progressOf. */
function progressLine(progress) {
  return h(
    'span',
    { class: 'progress-line' },
    h(
      'span',
      { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress.percent },
      h('span', { class: 'progress-fill', style: `width: ${progress.percent}%` }),
    ),
    h('span', { class: 'muted small', dir: 'ltr' }, `${fa(progress.done)} of ${fa(progress.total)} done · ${fa(progress.percent)}%`),
  );
}

/** An exercise-type tile: its name, and a small bar with done / total when the chosen lessons have that type. */
function categoryChip(label, progress, iconName) {
  return h(
    'span',
    { class: 'cat-chip' },
    h('span', { class: 'cat-name' }, iconName ? uiIcon(iconName, 'cat-icon') : null, label),
    progress.total
      ? h(
          'span',
          { class: 'cat-progress' },
          h(
            'span',
            { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress.percent },
            h('span', { class: 'progress-fill', style: `width: ${progress.percent}%` }),
          ),
          h('span', { class: 'cat-count', dir: 'ltr' }, `${fa(progress.done)}/${fa(progress.total)} · ${fa(progress.percent)}%`),
        )
      : null,
  );
}

/**
 * One tile of the lesson grid: the title, a subtitle, an optional tag and the progress.
 * Tapping it chooses it.
 */
function lessonRow({ title, subtitle, dashed = false, tag = null, progress = null, locked = false, onclick }) {
  return h(
    'button',
    {
      type: 'button',
      class: `lesson-row${dashed ? ' all-row' : ''}${locked ? ' locked' : ''}`,
      onclick,
    },
    h(
      'span',
      { class: 'lesson-main' },
      h('strong', { dir: 'auto' }, title),
      h('span', { class: 'muted small' }, subtitle),
      progress ? progressLine(progress) : null,
    ),
    locked ? uiIcon('lock', 'lesson-lock') : tag ? h('span', { class: 'lesson-tag' }, tag) : null,
  );
}

/** Where the learner stands in a book, unit or selection: not started, in progress, or completed. Null when there are no questions. */
function bookStatus(progress) {
  if (!progress || progress.total === 0) return null;
  if (progress.done >= progress.total) return { key: 'complete', label: 'Completed ✓' };
  if (progress.done === 0) return { key: 'new', label: 'Not started' };
  return { key: 'active', label: 'In progress' };
}

/** Total questions in a list of lessons. */
function questionsIn(lessons) {
  return lessons.reduce((sum, lesson) => sum + (Number(lesson.count) || 0), 0);
}

/**
 * The compact header of the Play setup: a small cover, what is being played (kicker and title), one line of
 * counts, and one progress line. The tint and status label follow the learner's progress.
 */
function setupHeader({ kicker, title, meta = '', cover = '', level = '', progress = null }) {
  const status = bookStatus(progress);
  return h(
    'div',
    { class: `setup-head${status ? ` ${status.key}` : ''}` },
    coverThumb(cover),
    h(
      'div',
      { class: 'setup-head-text' },
      h(
        'div',
        { class: 'setup-head-top' },
        h('span', { class: 'setup-kicker' }, kicker),
      ),
      h(
        'div',
        { class: 'setup-title-row' },
        h('strong', { class: 'setup-title', dir: 'auto' }, title),
        level ? h('span', { class: 'meta-pill level' }, level) : null,
      ),
      meta ? h('span', { class: 'setup-meta' }, meta) : null,
      progress && progress.total > 0 ? setupProgress(progress) : null,
    ),
    // The ring, with the status ("In progress", "Completed") under the percentage.
    progress && progress.total > 0
      ? h('div', { class: 'setup-side' }, progressRing(progress), status ? h('span', { class: `setup-status ${status.key}` }, status.label) : null)
      : null,
  );
}

/** The done count, in plain words: "6 of 449 questions done". */
function setupProgress(progress) {
  return h(
    'span',
    { class: 'setup-progress' },
    h('span', { class: 'setup-progress-text', dir: 'ltr' }, `${fa(progress.done)} of ${fa(progress.total)} questions done`),
  );
}

/** A round progress ring with the percent in the middle. The fill follows the --pct variable in CSS. */
function progressRing(progress) {
  return h(
    'span',
    {
      class: 'progress-ring',
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': progress.percent,
      'aria-label': `${progress.percent}% done`,
      style: `--pct: ${progress.percent}`,
    },
    h('span', { class: 'progress-ring-text', dir: 'ltr' }, `${fa(progress.percent)}%`),
  );
}

/** One line at the top of the setup: what to do, in short plain words. */
function setupTip() {
  return h('p', { class: 'setup-tip' }, uiIcon('lightbulb'), h('span', {}, 'Pick your settings below, then tap Play at the bottom.'));
}

/** Inside the book (its unit list): the book, how many units, lessons and questions it has, and its progress. */
function bookHeader(book, progress) {
  return setupHeader({
    kicker: 'Book',
    title: book.title,
    meta: [plural(book.units.length, 'unit'), plural(book.lessons.length, 'lesson'), plural(questionsIn(book.lessons), 'question')].join(' · '),
    cover: book.cover,
    level: book.level,
    progress,
  });
}

/** Inside one unit (its lesson list): the unit's position in the book, and its lessons and questions. */
function unitHeader(book, unit, progress) {
  const position = book.units.indexOf(unit) + 1;
  return setupHeader({
    kicker: `Unit ${fa(position)} of ${fa(book.units.length)}`,
    title: unit.title,
    meta: [plural(unit.lessons.length, 'lesson'), plural(questionsIn(unit.lessons), 'question')].join(' · '),
    cover: book.cover,
    level: book.level,
    progress,
  });
}

/**
 * The settings step: what will be played. One lesson, a whole unit, the whole book, or a custom set of lessons.
 */
function selectionHeader(book, unit, lessons, progress) {
  const inUnit = unit && lessons.length === unit.lessons.length;
  const wholeBook = lessons.length === book.lessons.length;
  let kicker = 'Playing';
  let title = plural(lessons.length, 'selected lesson');
  if (lessons.length === 1) {
    kicker = 'Lesson';
    title = lessons[0].lessonTitle;
  } else if (inUnit) {
    kicker = 'Unit';
    title = unit.title;
  } else if (wholeBook) {
    kicker = 'Whole book';
    title = book.title;
  }
  const questions = plural(questionsIn(lessons), 'question');
  return setupHeader({
    kicker,
    title,
    meta: lessons.length === 1 ? questions : [plural(lessons.length, 'lesson'), questions].join(' · '),
    cover: book.cover,
    level: book.level,
    progress,
  });
}

/** Cover image of a book (or a placeholder when the book has none). */
function coverThumb(src) {
  return h('span', { class: `book-thumb${src ? '' : ' no-image'}` }, src ? h('img', { src, alt: '' }) : uiIcon('book'));
}

/** The good answers of a question, expected answer first, without repeats. */
function acceptedItems(question) {
  const seen = new Set();
  const items = [];
  for (const text of [question.expected_answer, ...(question.accepted_answers ?? [])]) {
    const clean = String(text ?? '').trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      items.push(clean);
    }
  }
  return items;
}

/** The full answer as text: the sentence, or for a list question all good items joined. */
function answerText(question) {
  return question.answer_mode === 'list' ? acceptedItems(question).join(', ') : completeSentence(question);
}

const TRANSLATE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>' +
  '</svg>';

/**
 * The full answer sentence, its read-aloud buttons, and (when the question has one) a Persian
 * translation that the learner opens with a third button.
 */
function sentenceBox(q, fullSentence) {
  const translation = q.translation
    ? h('p', { class: 'fb-translation', dir: 'rtl', hidden: true }, q.translation)
    : null;
  // The translate button sits in the read-aloud bar, next to the two speak buttons.
  const bar = speakButtons(fullSentence) || (translation ? h('span', { class: 'speak-buttons' }) : null);
  if (translation && bar) {
    const button = keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'translate-btn',
          title: 'Show Persian translation',
          'aria-label': 'Show Persian translation',
          'aria-expanded': 'false',
          onclick: () => {
            translation.hidden = !translation.hidden;
            button.setAttribute('aria-expanded', String(!translation.hidden));
            button.classList.toggle('on', !translation.hidden);
          },
        },
        Object.assign(h('span', { class: 'translate-glyph' }), { innerHTML: TRANSLATE_ICON }),
      ),
    );
    bar.append(button);
  }
  return h(
    'div',
    { class: 'fb-box fb-sentence' },
    h('span', { class: 'fb-label' }, 'Full sentence'),
    h('p', { class: 'fb-text' }, ltr(fullSentence)),
    bar,
    translation,
  );
}

/**
 * Feedback box for list answers (synonyms, for example): every good answer, each with its own speak
 * buttons, so the learner sees all of them and can hear each word.
 */
function acceptedAnswersBox(question) {
  return h(
    'div',
    { class: 'fb-box fb-sentence' },
    h('span', { class: 'fb-label' }, 'All correct answers'),
    h(
      'div',
      { class: 'accepted-list' },
      acceptedItems(question).map((item) =>
        h('span', { class: 'accepted-item' }, h('bdi', { class: 'ltr', dir: 'ltr' }, item), speakButtons(item)),
      ),
    ),
  );
}

/**
 * Listening (dictation) items: the hint holds the word's meaning, so the final answer shows it too,
 * not just the bare word. Null for every other item.
 */
function meaningBox(q) {
  if (q.category !== 'dictation' || !q.hint) return null;
  return h(
    'div',
    { class: 'fb-box fb-note', dir: 'rtl' },
    h('span', { class: 'fb-label' }, 'Meaning'),
    h('p', { class: 'fb-text-sm', dir: 'rtl' }, q.hint),
  );
}

/** Moves the strip sideways so its current dot is in view. Only the strip scrolls, not the page. */
function keepCurrentDotVisible(track) {
  const dot = track.querySelector('.dot.current');
  if (!dot) return;
  const trackBox = track.getBoundingClientRect();
  const dotBox = dot.getBoundingClientRect();
  track.scrollLeft += dotBox.left - trackBox.left - (trackBox.width - dotBox.width) / 2;
}

/** One dot per question of the mission: green = correct, red = wrong, pulsing = current. */
function progressTrack(session) {
  // A long mission scrolls this row sideways; a mouse can drag it (the scrollbar is hidden).
  return dragToScroll(
    h(
      'div',
      { class: 'progress-track', role: 'img', 'aria-label': `Progress: ${fa(session.index + 1)} of ${fa(session.total)}` },
      Array.from({ length: session.total }, (_, i) => {
        const outcome = session.outcomes[i];
        let state = 'todo';
        if (outcome) state = outcome.correct ? 'ok' : 'bad';
        else if (i === session.index) state = 'current';
        return h('span', { class: `dot ${state}` });
      }),
    ),
  );
}

// After the result window opens, the sentence is read aloud once the win or lose sound has had a moment.
const AUTO_SPEAK_DELAY_MS = 700;
/** After each answer, go to the next question unless the learner uses read-aloud or translation. */
const AUTO_NEXT_SECONDS = 5;

/** Consecutive correct answers at the end of the session. */
function currentStreak(outcomes) {
  let streak = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i].correct; i -= 1) streak += 1;
  return streak;
}

function renderQuestion(root, session, flow) {
  stopTimer();
  closeModal();
  // The first question of a game adds the back-button guard; later questions of the same game do not.
  if (!gameInProgress) pushGuard();
  setGameRunning(true);
  currentFlow = flow;
  // The screen stays on for the whole game, so it does not sleep between questions.
  keepScreenOn(true);
  settingsStart = null;
  setTabMode('home');
  setTopbarBack(null);
  // Every new question starts at the top of the page.
  scrollToTop();
  const { question: q, index, total } = session.current;
  // The lesson being practised is remembered: the next visit to its book starts from it.
  saveSettings({ ...getSettings(), lastLesson: lessonKey(q.book, q.lesson) });

  const scoreEl = h('span', { class: 'hud-chip score' }, uiIcon('star'), ` ${fa(session.summary().score)}`);
  const streakEl = h(
    'span',
    { class: 'hud-chip streak', 'aria-live': 'polite' },
    uiIcon('flame'),
    ` ${fa(currentStreak(session.outcomes))}`,
  );
  let progressEl = progressTrack(session);
  const timerFill = h('div', { class: 'timer-fill' });
  const timerIcon = h('span', { class: 'timer-icon', 'aria-hidden': 'true' }, uiIcon('clock'));
  const timerText = h('span', { class: 'timer-text' });
  const feedback = h('div', { class: 'feedback', hidden: true, role: 'alert' });
  // In meaning mode the hint is already the question, so there is no hint button.
  const hintText = q.hint && q.presentation !== 'meaning' ? h('p', { class: 'hint', dir: 'rtl', hidden: true }, q.hint) : null;
  const submitButton = h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Submit answer');
  // Small red button beside Submit: gives up on the question. It counts as a wrong answer, and the correct answer is shown.
  const skipButton = h('button', { type: 'button', class: 'btn danger skip-btn', onclick: skip }, 'Skip');
  const nextButton = h('button', { type: 'button', class: 'btn primary', hidden: true, onclick: next });
  const autoNextText = h('span', { class: 'result-auto-next-text' });
  const autoNextBadge = h(
    'span',
    { class: 'result-auto-next', hidden: true, 'aria-live': 'polite', title: 'Next question in a few seconds' },
    autoNextText,
  );
  const nextRow = h('div', { class: 'result-next-row', hidden: true }, nextButton, autoNextBadge);

  /** Multiple choice submits the picked option; other widgets auto-submit only when correct. */
  function submitIfCorrect() {
    if (session.answered) return;
    const value = String(widget.getValue()).trim();
    if (!value) return;
    if (q.category !== 'multiple_choice' && !validateAnswer(q, value).correct) return;
    finish(session.submit(value));
  }

  const widget = createAnswerWidget(q, { onSubmit: submitIfCorrect });

  // The result pops up as a modal card: a celebration when correct, falling rain when not.
  let autoSpeakTimer = null;
  let autoNextTimer = null;
  const resultMood = h('div', { class: 'result-mood', 'aria-hidden': 'true' });
  const resultEffect = h('div', { class: 'fx', 'aria-hidden': 'true' });
  const resultOverlay = h(
    'div',
    { class: 'result-overlay' },
    resultEffect,
    h('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true' }, resultMood, feedback, nextRow),
  );

  function cancelAutoNext() {
    clearInterval(autoNextTimer);
    autoNextTimer = null;
    autoNextBadge.hidden = true;
  }

  function startAutoNext() {
    cancelAutoNext();
    let left = AUTO_NEXT_SECONDS;
    autoNextBadge.hidden = false;
    autoNextText.textContent = `${fa(left)} s`;
    autoNextTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        cancelAutoNext();
        next();
        return;
      }
      autoNextText.textContent = `${fa(left)} s`;
    }, 1000);
  }

  // Learners who open translation or tap read-aloud need more time; the countdown stops.
  resultOverlay.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('.speak, .translate-btn') : null;
      if (target) cancelAutoNext();
    },
    true,
  );

  closeModal = () => {
    clearTimeout(autoSpeakTimer);
    cancelAutoNext();
    stopSpeaking();
    resultOverlay.remove();
  };

  function tick() {
    const remaining = session.remainingMs();
    const limit = q.time_limit * 1000;
    timerFill.style.width = `${(remaining / limit) * 100}%`;
    timerFill.classList.toggle('low', remaining <= limit * 0.25);
    timerText.classList.toggle('low', remaining <= limit * 0.25);
    timerIcon.classList.toggle('low', remaining <= limit * 0.25);
    timerText.textContent = `${fa(Math.ceil(remaining / 1000))} s`;
    if (remaining <= 0 && !session.answered) {
      finish(session.timeout());
    }
  }

  function submit() {
    if (session.answered) return;
    if (!String(widget.getValue()).trim()) {
      toast('Enter an answer first.', 'warn');
      return;
    }
    finish(session.submit(widget.getValue()));
  }

  // Skip: an empty answer, so it is a wrong answer; the feedback then shows the correct answer.
  function skip() {
    if (session.answered) return;
    finish(session.submit(''));
  }

  function finish(outcome) {
    stopTimer();
    widget.lock(q.expected_answer);
    submitButton.hidden = true;
    skipButton.hidden = true;
    scoreEl.replaceChildren(uiIcon('star'), ` ${fa(session.summary().score)}`);
    streakEl.replaceChildren(uiIcon('flame'), ` ${fa(currentStreak(session.outcomes))}`);
    const freshTrack = progressTrack(session);
    progressEl.replaceWith(freshTrack);
    progressEl = freshTrack;
    keepCurrentDotVisible(freshTrack);
    showFeedback(outcome);
    // The result pops up now, so its sound plays now: win for a right answer, lose for a wrong or late one.
    playResultSound(outcome.correct, outcome.timedOut);
    nextButton.hidden = false;
    nextRow.hidden = false;
    nextButton.textContent = session.index + 1 < session.total ? 'Next question' : 'Finish and see results';
    // Focus is intentionally not moved to the next button: pressing Enter in the answer box
    // only submits the answer, and the learner moves on with the button.
    recordOutcome(outcome).catch(() => toast('Could not save the result.', 'error'));
  }

  function showFeedback(outcome) {
    const fullSentence = completeSentence(q);
    const headline = outcome.correct
      ? outcome.points
        ? `Correct! +${fa(outcome.points)} points`
        : 'Correct! This question already gave points.'
      : outcome.timedOut
        ? 'Time is up.'
        : 'Wrong answer.';

    const icon = outcome.correct ? '✓' : outcome.timedOut ? uiIcon('clock') : '✕';
    feedback.hidden = false;
    feedback.className = `feedback ${outcome.correct ? 'ok' : 'bad'}`;
    resultOverlay.className = `result-overlay ${outcome.correct ? 'ok' : 'bad'}`;
    resultMood.replaceChildren(mascot(outcome.correct ? 'cheer' : outcome.timedOut ? 'surprised' : 'sad'));
    resultEffect.replaceChildren(...(outcome.correct ? confettiPieces() : rainDrops()));
    feedback.replaceChildren(
      ...[
        h(
          'div',
          { class: 'fb-head' },
          h('span', { class: 'fb-icon', 'aria-hidden': 'true' }, icon),
          h('strong', { class: 'fb-title' }, headline),
        ),
        q.answer_mode === 'list'
          ? acceptedAnswersBox(q)
          : sentenceBox(q, fullSentence),
        meaningBox(q),
        outcome.correct || outcome.timedOut || !outcome.answer
          ? null
          : h('div', { class: 'fb-box fb-yours' }, h('span', { class: 'fb-label' }, 'Your answer'), h('p', { class: 'fb-text' }, ltr(outcome.answer))),
        outcome.correct || !q.explanation
          ? null
          : h(
              'div',
              { class: 'fb-box fb-note', dir: 'ltr' },
              h('span', { class: 'fb-label' }, 'Note'),
              // Explanations are written in Persian, with English words inside them: right-to-left.
              h('p', { class: 'fb-text-sm', dir: 'rtl' }, q.explanation),
            ),
      ].filter(Boolean),
    );
    document.body.append(resultOverlay);
    // Settings > Sounds: a right or wrong answer reads the full English sentence slowly. A time-out is not an answer,
    // and list answers have several items, so neither is read.
    if (getSoundSettings().autoSpeak && !outcome.timedOut && q.answer_mode !== 'list' && fullSentence) {
      autoSpeakTimer = setTimeout(() => speak(fullSentence, { slow: true }), AUTO_SPEAK_DELAY_MS);
    }
    startAutoNext();
  }

  function next() {
    closeModal();
    session.next();
    if (session.finished) {
      renderResults(root, session, flow);
    } else {
      renderQuestion(root, session, flow);
    }
  }

  // Status above the card, outside it: the path so far (one dot per question), with the score and streak.
  const footer = h(
    'div',
    { class: 'play-footer' },
    // First in the row, so it sits on the start (right) side; the counters sit on the other side.
    h('div', { class: 'footer-path' }, progressEl),
    h('div', { class: 'hud-chips' }, scoreEl, streakEl),
  );

  root.replaceChildren(
    footer,
    h(
      'section',
      { class: 'card play' },
      // Top bar: which question this is, and the time left for it.
      h(
        'div',
        { class: 'hud' },
        h(
          'div',
          { class: 'hud-top' },
          h('span', { class: 'hud-count' }, `${fa(index + 1)} of ${fa(total)}`),
        ),
        h(
          'div',
          { class: 'timer' },
          timerIcon,
          h('div', { class: 'timer-track' }, timerFill),
          timerText,
        ),
      ),
      // Stage: the question itself, with its type and level tags above it.
      h(
        'div',
        { class: 'stage' },
        h(
          'div',
          { class: 'stage-tags' },
          badge(CATEGORIES[q.category] ?? q.category, 'accent'),
          badge(topicLabel(q.topic)),
          badge(DIFFICULTIES[q.difficulty] ?? q.difficulty),
        ),
        h('p', { class: 'instruction', dir: 'auto' }, instructionFor(q)),
        questionBlock(q),
      ),
      // Answer zone: the input (or choices) and the optional hint.
      h(
        'div',
        { class: 'answer-zone' },
        widget.element,
        hintText
          ? h(
              'div',
              { class: 'hint-row' },
              keepFocus(h('button', { type: 'button', class: 'btn ghost small hint-btn', onclick: () => (hintText.hidden = false) }, uiIcon('lightbulb'), ' Hint')),
              hintText,
            )
          : null,
      ),
      // The action dock is always shown: Skip is needed on every question type.
      // Multiple choice submits on click, so it has no Submit button; its dock holds Skip alone.
      h(
        'div',
        { class: `actions play-actions${q.category === 'multiple_choice' ? ' skip-only' : ''}` },
        q.category === 'multiple_choice' ? null : submitButton,
        skipButton,
      ),
    ),
  );
  keepCurrentDotVisible(progressEl);

  tick();
  timerId = setInterval(tick, 250);
}

// Translation questions show a Persian sentence to translate. The learner can hear it read in Persian,
// when the device has a Persian voice (the button is not shown otherwise).
const PERSIAN_SPEAK_CATEGORIES = new Set(['quick_translation', 'voice_translation']);

function persianPrompt(q, text, wordNodes) {
  const line = h('p', { class: 'question', dir: 'auto' }, ...wordNodes(text));
  const button = PERSIAN_SPEAK_CATEGORIES.has(q.category)
    ? questionSpeakButton(text, { lang: 'fa-IR', label: 'Read the Persian sentence aloud' })
    : null;
  return button ? h('div', { class: 'q-english-row', dir: 'rtl' }, line, button) : line;
}

/**
 * The question text plus its glossary. Tapping a glossary word, either in the text or in the
 * chip list below it, shows the Persian meaning and says the word aloud.
 */
function questionBlock(q) {
  const glossary = q.glossary ?? [];

  const tip = h('div', { class: 'gloss-tip', dir: 'auto', hidden: true });
  const sentence = contextSentence(q);
  const show = (entry) => {
    // Spoken inside its sentence so the pronunciation matches how it sounds in context.
    // The isolated word is offered separately, since a single word can be pronounced differently.
    const inContext = Boolean(sentence) && containsWord(sentence, entry.word);
    tip.hidden = false;
    // Same control bar as the feedback sentence: slow word, normal word, and the word in its sentence.
    tip.replaceChildren(
      ...[
        h(
          'div',
          { class: 'tip-head' },
          h('strong', { class: 'tip-word', dir: 'ltr' }, entry.word),
          h('span', { class: 'tip-meaning' }, entry.meaning),
        ),
        speakBar([
          { kind: 'slow', label: 'Read the word slowly', onclick: () => speak(entry.word, { slow: true }) },
          { kind: 'normal', label: 'Read the word', onclick: () => speak(entry.word) },
          inContext ? { kind: 'sentence', label: 'Read the word in the sentence', onclick: () => speak(sentence) } : null,
        ]),
      ].filter(Boolean),
    );
    speak(inContext ? sentence : entry.word);
  };

  const byWord = new Map(glossary.map((entry) => [entry.word.toLowerCase(), entry]));
  // Glossary words become tappable spans; everything else is plain text.
  const wordNodes = (text) =>
    text.split(/(\s+)/).map((part) => {
      const entry = byWord.get(part.replace(/[^\p{L}']/gu, '').toLowerCase());
      return entry
        ? keepFocus(h('span', { class: 'gloss-word', role: 'button', onclick: () => show(entry) }, part))
        : part;
    });

  // Two separate lines: the Persian instruction (right-to-left) and the English sentence (left-to-right).
  const { instruction, sentence: englishLine } = splitPrompt(q.question);

  // Meaning mode (dictation): the Persian meaning is the question, and the learner writes the English word.
  if (q.presentation === 'meaning') {
    return h('div', { class: 'question-block' }, h('p', { class: 'question meaning-question', dir: 'rtl' }, q.hint));
  }

  // Letters mode (dictation): the letter tiles are the answer, built by the answer widget.
  // The Persian meaning is shown above them, so the learner knows which word to spell.
  if (q.presentation === 'letters') {
    return h(
      'div',
      { class: 'question-block letters-only' },
      q.hint ? h('p', { class: 'question meaning-question', dir: 'rtl' }, q.hint) : null,
    );
  }

  // Listening question: the English text stays hidden, only the play button is shown (no glossary either,
  // since it would show the words). The learner answers from what they hear.
  if (q.presentation === 'audio' && sentence) {
    const play = questionSpeakButton(sentence, { big: true });
    // Played once by itself when the question appears. The pulse shows that it is playing; the button replays it.
    if (play) {
      speak(sentence, {
        onStart: () => play.classList.add('speaking'),
        onEnd: () => play.classList.remove('speaking'),
      });
    }
    return h(
      'div',
      { class: 'question-block listen-only' },
      instruction ? h('p', { class: 'q-instruction', dir: 'rtl' }, instruction) : null,
      h('div', { class: 'listen-block' }, play ?? h('p', { class: 'muted small' }, 'Audio playback is not available in this browser.')),
    );
  }

  // Word translation: the whole Persian sentence on one line, to be written in English.
  // No read-aloud button here: this is a sentence to translate, the same as the other translation questions.
  const lines = q.category === 'word_translation'
    ? [h('p', { class: 'question word-sentence', dir: 'rtl' }, persianSentence(q.word_bank))]
    // Translation questions are one Persian line, even when an English word is in it ("کلمه teacher ...?").
    // The whole line stays together, and no read-aloud button is added to its English part.
    // Audio translation is the same kind of question, so it follows the same rule.
    : (q.category === 'quick_translation' || q.category === 'voice_translation') && englishLine
    ? [h('p', { class: 'question', dir: 'auto' }, ...wordNodes(q.question))]
    : englishLine
    ? [
        instruction ? h('p', { class: 'q-instruction', dir: 'rtl' }, instruction) : null,
        // Read-aloud for the sentence. No button while a blank is still in it (contextSentence is null then).
        h(
          'div',
          { class: 'q-english-row', dir: 'ltr' },
          h('p', { class: 'question q-english', dir: 'ltr' }, ...wordNodes(englishLine)),
          sentence ? questionSpeakButton(sentence) : null,
        ),
      ]
    : [persianPrompt(q, instruction, wordNodes)];

  return h(
    'div',
    { class: 'question-block' },
    lines,
    glossary.length
      ? h(
          'div',
          { class: 'glossary' },
          h('span', { class: 'gloss-label' }, 'Key words · tap one to hear it:'),
          h(
            'div',
            { class: 'chips' },
            glossary.map((entry) =>
              keepFocus(h('button', { type: 'button', class: 'chip gloss-chip', dir: 'ltr', onclick: () => show(entry) }, entry.word)),
            ),
          ),
        )
      : null,
    tip,
  );
}

/**
 * Share and save buttons of the results: they make the result card as an image (see result-card.js).
 * Sharing opens the device's share sheet where there is one; otherwise the image is saved.
 */
const SHARE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>' +
  '</svg>';

const SAVE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
  '</svg>';

/**
 * Share and save the result card as an image. Two round icon buttons in the top corner of the results card.
 * Sharing opens the device's share sheet with the image; saving downloads the PNG.
 */
function resultActions(card) {
  const glyph = (svg) => Object.assign(h('span', { class: 'round-glyph' }), { innerHTML: svg });
  const share = h('button', { type: 'button', class: 'round-action primary-action', 'aria-label': 'Share result', title: 'Share result' }, glyph(SHARE_ICON));
  const save = h('button', { type: 'button', class: 'round-action', 'aria-label': 'Save image', title: 'Save image' }, glyph(SAVE_ICON));
  const run = (button, task) => async () => {
    button.disabled = true;
    try {
      const outcome = await task();
      if (outcome === 'saved') toast('Image saved. You can send it to your friends.');
    } catch (error) {
      if (error?.name === 'ShareUnsupported') toast('This device cannot share images. Use the save button instead.', 'warn');
      else if (error?.name !== 'AbortError') toast('Could not make the image. Try again.', 'error');
    } finally {
      button.disabled = false;
    }
  };
  share.onclick = run(share, () => shareResultCard(card));
  save.onclick = run(save, () => saveResultCard(card));
  return h('div', { class: 'result-actions' }, share, save);
}

// Icons of the result tiles (drawn as SVG, so they stay crisp at every size).
const TILE_ICONS = {
  star: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

/** The round coloured badge with the icon of a result tile. */
function tileIcon(svg) {
  return Object.assign(h('span', { class: 'rt-icon', 'aria-hidden': 'true' }), { innerHTML: svg });
}

/** The points of the mission: a wide tile with a bar that shows how much of the maximum was won. */
function pointsTile(score, maxScore, index) {
  const ratio = maxScore > 0 ? Math.min(1, score / maxScore) : 0;
  return h(
    'div',
    { class: 'result-tile points', style: `--i:${index}` },
    tileIcon(TILE_ICONS.star),
    h(
      'div',
      { class: 'rt-body' },
      h('span', { class: 'rt-label' }, 'Points'),
      h('strong', { class: 'rt-value' }, fa(score), h('small', {}, ` of ${fa(maxScore)}`)),
    ),
    h(
      'span',
      { class: 'rt-bar', role: 'img', 'aria-label': `${percent(ratio)} of the points` },
      h('span', { class: 'rt-fill', style: `width:${Math.round(ratio * 100)}%` }),
    ),
  );
}

/** One count of the results screen (correct, wrong, timed out): an icon, the number and its label. */
function statTile(svg, value, label, tone, index) {
  return h(
    'div',
    { class: `result-tile ${tone}`, style: `--i:${index}` },
    tileIcon(svg),
    h('strong', { class: 'rt-value' }, value),
    h('span', { class: 'rt-label' }, label),
  );
}

/** One mistake: the question, the correct answer in a green band, and the note. */
function mistakeCard(outcome) {
  const q = outcome.question;
  return h(
    'article',
    { class: 'mistake-card' },
    h('p', { class: 'mistake-q', dir: 'auto' }, q.question),
    h(
      'div',
      { class: 'mistake-answer' },
      h('span', { class: 'mistake-label' }, 'Correct answer'),
      h('bdi', { class: 'ltr', dir: 'ltr' }, answerText(q)),
      speakButtons(answerText(q)),
    ),
    q.explanation ? h('p', { class: 'mistake-note', dir: 'auto' }, q.explanation) : null,
    q.category === 'dictation' && q.hint ? h('p', { class: 'mistake-note', dir: 'rtl' }, `Meaning: ${q.hint}`) : null,
  );
}

/**
 * The mistakes of the mission, folded away: a header with the count that opens the list.
 * The list is closed when the results open, so the page stays short; the learner opens it when wanted.
 */
function mistakesBlock(mistakes) {
  if (!mistakes.length) return h('div', { class: 'all-correct' }, uiIcon('sparkles'), ' Perfect! No mistakes.');
  const list = h('div', { class: 'mistakes-list', hidden: true }, ...mistakes.map(mistakeCard));
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'mistakes-toggle',
      'aria-expanded': 'false',
      onclick: () => {
        list.hidden = !list.hidden;
        toggle.setAttribute('aria-expanded', String(!list.hidden));
      },
    },
    h('span', {}, 'Review your mistakes'),
    h('span', { class: 'mistakes-count' }, fa(mistakes.length)),
    h('span', { class: 'mistakes-chevron', 'aria-hidden': 'true' }, '▾'),
  );
  return h('div', { class: 'mistakes-block' }, toggle, list);
}

function renderResults(root, session, flow) {
  setGameRunning(false);
  dropGuard();
  keepScreenOn(false);
  // The end of the game has its own vibration pattern.
  vibrateFor('end');
  // The mission is over: its time is saved now.
  endMission();
  const summary = session.summary();
  const mistakes = session.outcomes.filter((o) => !o.correct);
  const xpGained = session.outcomes.filter((o) => o.correct).reduce((sum, o) => sum + (Number(o.points) || 0), 0);
  const stars = starsFor(summary.correct, summary.answered);
  // The look of the screen follows the accuracy of the mission (five tiers, see resultTier).
  const tier = resultTier(summary.correct, summary.answered);
  const look = RESULT_LOOKS[tier];

  const xpBefore = flow.xpBefore ?? 0;
  const levelBefore = levelFor(xpBefore);
  const levelAfter = levelFor(xpBefore + xpGained);

  // The facts of the mission, for the shareable result card (what was finished, and how far it moved things).
  const endedAt = Date.now();
  const card = {
    tier,
    look,
    stars,
    correct: summary.correct,
    answered: summary.answered,
    accuracy: summary.answered ? summary.correct / summary.answered : 0,
    levelBefore,
    levelAfter,
    dateText: new Date(endedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    endedAt,
    report: missionReport({ ...flow.report, outcomes: session.outcomes, endedAt }),
  };

  // The bottom bar gets a "Practice again" button in the middle: the same kind of game, with new questions.
  const again = document.querySelector('.bottom-again');
  if (again) {
    again.onclick = () => flow.restart();
    again.hidden = false;
  }

  const xpLine = h('p', { class: 'xp-gain' }, '+0 XP');
  root.replaceChildren(
    h(
      'section',
      { class: `card results game tier-${tier}` },
      // Share and save sit in the top corner of the card, above the hero.
      resultActions(card),
      h(
        'div',
        { class: `result-hero tier-${tier}` },
        resultStage(tier),
        h('span', { class: 'rs-badge', 'aria-hidden': 'true' }, mascot(look.mood)),
        h(
          'div',
          { class: 'stars', role: 'img', 'aria-label': `${fa(stars)} of 3 stars` },
          [1, 2, 3].map((n) => h('span', { class: n <= stars ? 'star on' : 'star' }, '★')),
        ),
        h('h2', {}, look.title),
        h('p', { class: 'rs-text' }, look.text),
        xpLine,
        levelAfter > levelBefore ? h('p', { class: 'level-up' }, `New level! You are now level ${fa(levelAfter)}`) : null,
      ),
      h(
        'div',
        { class: 'result-tiles' },
        pointsTile(summary.score, summary.maxScore, 0),
        statTile(TILE_ICONS.check, fa(summary.correct), 'Correct', 'ok', 1),
        statTile(TILE_ICONS.cross, fa(summary.wrong), 'Wrong', 'bad', 2),
        statTile(TILE_ICONS.clock, fa(summary.timeouts), 'Timed out', 'time', 3),
      ),
      mistakesBlock(mistakes),
    ),
  );
  // The XP counts up from zero once the screen is shown.
  countUp(xpLine, xpGained);
  // Each result look has its own jingle (see playResultJingle in sounds.js).
  playResultJingleIfEnabled(tier);
  // The results start at the top of the page, whatever the scroll was during the mission.
  scrollToTop();
}
