// Play screen: setup (player card + missions) -> question loop (timer, submit, feedback) -> results.
// Only UI logic lives here. Selection, timing and scoring come from the Game Engine,
// answer checks from the Answer Validator, and storage from the Progress Tracker.

import { listQuestions, listLessons } from '../bank/repository.js';
import { CATEGORIES, DIFFICULTIES, topicLabel, lessonKey } from '../bank/schema.js';
import { filterQuestions, pickQuestions, GameSession } from '../engine/game-engine.js';
import { recordOutcome, loadAttempts } from '../progress/tracker.js';
import { playerProfile, levelFor, starsFor, XP_PER_LEVEL } from '../progress/player.js';
import { getSettings, saveSettings } from '../storage/settings.js';
import { h, toast, fa, ltr, badge, percent, keepFocus } from './dom.js';
import { createAnswerWidget, INSTRUCTIONS } from './answer-widgets.js';
import { splitPrompt } from './prompt.js';
import { speak, speakButtons, speakBar, completeSentence, contextSentence, questionSpeakButton } from './speech-out.js';

/** True when `word` appears as a whole word in `sentence` (case-insensitive). */
function containsWord(sentence, word) {
  const target = word.toLowerCase();
  return sentence
    .toLowerCase()
    .split(/[^a-z']+/)
    .some((token) => token === target);
}

const COUNTS = [10, 20, 50, 0]; // 0 means "all"
const CATEGORY_ICONS = {
  quick_translation: '🔤',
  sentence_builder: '🧩',
  grammar_correction: '🛠️',
  multiple_choice: '🎯',
  positive_negative_question: '⚖️',
  voice_translation: '🎤',
  dictation: '📝',
  vocabulary: '🔁',
};

// Presentation of the English sentence for a mission: follow each exercise, or force one mode.
const PRESENTATION_CHOICES = [
  ['auto', 'طبق تمرین'],
  ['text', 'همیشه متن'],
  ['audio', 'همیشه فقط صدا'],
];

let timerId = null;
// Removes the result modal of the current question (set by renderQuestion).
let closeModal = () => {};

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
  await showSetup(root);
  return () => {
    stopTimer();
    closeModal();
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
    h('div', { class: 'level-badge', 'aria-label': `سطح ${fa(profile.level)}` }, h('span', {}, 'سطح'), h('strong', {}, fa(profile.level))),
    h(
      'div',
      { class: 'hero-body' },
      h('strong', { class: 'hero-title' }, 'آماده‌ای برای مأموریت بعدی؟'),
      h(
        'div',
        { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
        h('div', { class: 'xp-fill', style: `width: ${pct}%` }),
      ),
      h('span', { class: 'muted small' }, `${fa(profile.xp % XP_PER_LEVEL)} از ${fa(XP_PER_LEVEL)} XP تا سطح بعد`),
    ),
    h(
      'div',
      { class: 'hero-stats' },
      miniStat(fa(profile.answered), 'حل‌شده'),
      miniStat(profile.accuracy == null ? '—' : percent(profile.accuracy), 'دقت'),
      miniStat(fa(profile.bestStreak), 'بهترین زنجیره'),
    ),
  );
}

function stepTitle(number, text) {
  return h('h4', { class: 'step-title' }, h('span', { class: 'step-no' }, fa(number)), text);
}

async function showSetup(root) {
  root.replaceChildren(h('p', { class: 'loading' }, 'در حال آماده‌سازی…'));

  const [questions, lessons, attempts] = await Promise.all([listQuestions(), listLessons(), loadAttempts()]);
  const profile = playerProfile(attempts);
  const saved = getSettings();
  const series = seriesList(lessons);
  const allBooks = series.flatMap((entry) => entry.books);
  const lessonsOf = (bookId) => allBooks.find((book) => book.id === bookId)?.lessons ?? [];
  const seriesOf = (bookId) => series.find((entry) => entry.books.some((book) => book.id === bookId)) ?? null;
  // The book the learner used last. When it still exists, the setup opens inside it.
  const savedBook = allBooks.some((book) => book.id === saved.book) ? saved.book : null;
  const allLessonKeys = lessonsOf(savedBook).map((lesson) => lesson.key);
  const savedLessons = restored(saved.lessons, allLessonKeys, []);

  const state = {
    book: savedBook,
    lessons: savedLessons.length ? savedLessons : allLessonKeys,
    categories: restored(saved.categories, Object.keys(CATEGORIES), Object.keys(CATEGORIES)),
    presentation: [PRESENTATION_CHOICES.some(([value]) => value === saved.presentation) ? saved.presentation : 'auto'],
    count: [COUNTS.includes(saved.count) ? saved.count : 10],
  };

  // Set by the mission step; the book step does not show them.
  let info = null;
  let startButton = null;

  function available() {
    return filterQuestions(questions, { books: [state.book], lessons: state.lessons, categories: state.categories });
  }

  function refresh() {
    saveSettings({
      book: state.book,
      lessons: state.lessons,
      categories: state.categories,
      presentation: state.presentation[0],
      count: state.count[0],
    });
    if (!info) return;
    const count = available().length;
    info.textContent = `${fa(count)} سؤال آماده برای این مأموریت`;
    startButton.disabled = count === 0;
  }

  async function start() {
    const chosen = pickQuestions(questions, { books: [state.book], lessons: state.lessons, categories: state.categories }, {
      count: state.count[0] || Infinity,
    });
    if (chosen.length === 0) {
      toast('سؤالی با این تنظیمات پیدا نشد.', 'warn');
      return;
    }
    // "auto" keeps each exercise's own presentation; the other choices apply to the whole mission.
    const forced = state.presentation[0];
    const pool = forced === 'auto' ? chosen : chosen.map((question) => ({ ...question, presentation: forced }));
    const before = playerProfile(await loadAttempts());
    renderQuestion(root, new GameSession(pool), {
      restart: start,
      home: () => showSetup(root),
      xpBefore: before.xp,
    });
  }

  // Screens of the picker, in order: series -> book -> mission (lessons, exercise types, presentation, length).
  // "Continue" sits directly under the cards it applies to.

  // Step 1: choose the series (for example Evolve).
  function drawSeriesStep() {
    info = null;
    startButton = null;
    let picked = seriesOf(state.book)?.id ?? series[0]?.id ?? null;
    const grid = h('div', { class: 'picker-grid series-grid' });
    const next = h('button', { type: 'button', class: 'btn primary wide continue-btn', onclick: () => drawBookStep(picked) }, 'ادامه ←');
    const paint = () => {
      grid.replaceChildren(
        ...series.map((entry) =>
          pickCard({
            image: entry.logo,
            title: entry.title,
            subtitle: `${fa(entry.books.length)} کتاب`,
            active: entry.id === picked,
            onclick: () => {
              picked = entry.id;
              paint();
            },
          }),
        ),
      );
      next.disabled = !picked;
    };
    paint();

    root.replaceChildren(
      h(
        'section',
        { class: 'card setup game' },
        playerCard(profile),
        series.length
          ? stepTitle(1, 'سری کتاب')
          : h('p', { class: 'empty' }, 'هنوز درسی نصب نشده است. پوشه‌ی content را بررسی کن.'),
        grid,
        series.length ? next : null,
      ),
    );
  }

  // Step 2: choose the book inside the series. Opening it from the mission screen goes back here.
  function drawBookStep(seriesId) {
    info = null;
    startButton = null;
    const entry = series.find((item) => item.id === seriesId) ?? series[0];
    let picked = entry.books.some((book) => book.id === state.book) ? state.book : null;
    const grid = h('div', { class: 'picker-grid book-grid' });
    const next = h(
      'button',
      {
        type: 'button',
        class: 'btn primary wide continue-btn',
        onclick: () => {
          // Remember the book: the next visit opens straight into it.
          state.book = picked;
          // Opening a book starts from the lesson practised last in it, or from its first lesson.
          const chosenBook = allBooks.find((item) => item.id === picked);
          const start = lastPracticedKey(chosenBook) ?? chosenBook?.lessons[0]?.key;
          state.lessons = start ? [start] : [];
          saveSettings({ ...getSettings(), book: state.book, lessons: state.lessons });
          drawMissionStep();
        },
      },
      'ادامه ←',
    );
    const paint = () => {
      grid.replaceChildren(
        ...entry.books.map((book) =>
          pickCard({
            image: book.cover,
            title: book.title,
            subtitle: `${fa(book.lessons.length)} درس`,
            badge: book.level,
            active: book.id === picked,
            onclick: () => {
              picked = book.id;
              paint();
            },
          }),
        ),
      );
      next.disabled = !picked;
    };
    paint();

    root.replaceChildren(
      h(
        'section',
        { class: 'card setup game' },
        playerCard(profile),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => drawSeriesStep() }, `← سری‌ها (${entry.title})`),
        ),
        stepTitle(2, `کتاب‌های ${entry.title}`),
        grid,
        next,
      ),
    );
  }

  // Step 3: inside the chosen book. Lessons (or the whole book), exercise types, presentation and length.
  function drawMissionStep() {
    const book = allBooks.find((entry) => entry.id === state.book);
    const parent = seriesOf(book.id);
    const allKeys = book.lessons.map((lesson) => lesson.key);
    // The lesson list: one row per lesson (tap to add or remove it), plus a row that selects the whole book for review.
    const lessonBox = h('div', { class: 'lesson-list' });
    // "Continue" opens the settings screen; it needs at least one lesson.
    const next = h(
      'button',
      { type: 'button', class: 'btn primary wide continue-btn', onclick: () => drawSettingsStep() },
      'ادامه ←',
    );
    const paintLessons = () => {
      const whole = allKeys.length > 0 && allKeys.every((key) => state.lessons.includes(key));
      const lastKey = lastPracticedKey(book);
      lessonBox.replaceChildren(
        lessonRow({
          title: 'همه‌ی درس‌های کتاب',
          subtitle: `برای مرور · ${fa(allKeys.length)} درس`,
          active: whole,
          dashed: true,
          onclick: () => {
            state.lessons = whole ? [] : [...allKeys];
            paintLessons();
            refresh();
          },
        }),
        ...book.lessons.map((lesson) =>
          lessonRow({
            title: lesson.lessonTitle,
            subtitle: `${fa(lesson.count)} سؤال`,
            active: state.lessons.includes(lesson.key),
            tag: lesson.key === lastKey ? 'آخرین تمرین' : null,
            onclick: () => {
              const index = state.lessons.indexOf(lesson.key);
              if (index >= 0) state.lessons.splice(index, 1);
              else state.lessons.push(lesson.key);
              paintLessons();
              refresh();
            },
          }),
        ),
      );
      next.disabled = state.lessons.length === 0;
    };
    paintLessons();
    info = null;
    startButton = null;

    root.replaceChildren(
      h(
        'section',
        { class: 'card setup game' },
        playerCard(profile),
        bookHeader(book, allKeys.length),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn ghost small', onclick: () => drawBookStep(parent?.id) },
            `← کتاب‌ها (${parent?.title ?? ''})`.trim(),
          ),
        ),
        stepTitle(1, 'درس‌ها'),
        lessonBox,
        next,
      ),
    );
    refresh();
  }

  // Step 4: the rest of the settings, on their own screen: exercise types, presentation and length.
  function drawSettingsStep() {
    const book = allBooks.find((entry) => entry.id === state.book);
    info = h('p', { class: 'muted small info' });
    startButton = h('button', { type: 'button', class: 'btn primary start-btn', onclick: start }, 'شروع مأموریت!');

    root.replaceChildren(
      h(
        'section',
        { class: 'card setup game' },
        playerCard(profile),
        bookHeader(book, book.lessons.length),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn ghost small', onclick: () => drawMissionStep() },
            `← درس‌ها (${fa(state.lessons.length)} انتخاب شده)`,
          ),
        ),
        stepTitle(1, 'نوع تمرین'),
        chipGroup(
          Object.entries(CATEGORIES).map(([key, label]) => [key, `${CATEGORY_ICONS[key] ?? ''} ${label}`.trim()]),
          state.categories,
          { onChange: refresh, className: 'card-options mission-options' },
        ),
        stepTitle(2, 'نمایش جمله'),
        chipGroup(PRESENTATION_CHOICES, state.presentation, {
          multiple: false,
          onChange: refresh,
          className: 'card-options',
        }),
        stepTitle(3, 'طول مأموریت'),
        chipGroup(
          [
            [10, `${fa(10)} سؤال · کوتاه`],
            [20, `${fa(20)} سؤال · متوسط`],
            [50, `${fa(50)} سؤال · بلند`],
            [0, 'همه‌ی سؤال‌ها'],
          ],
          state.count,
          { multiple: false, onChange: refresh, className: 'card-options' },
        ),
        info,
        startButton,
      ),
    );
    refresh();
  }

  // The last book is remembered: the setup opens inside it. Otherwise the learner starts with the series.
  if (state.book) drawMissionStep();
  else drawSeriesStep();
}

/**
 * Series -> books -> lessons, in the order of the course index.
 * Every lesson record carries its series and book details (see indexLessons in content.js).
 */
function seriesList(lessons) {
  const series = new Map();
  for (const lesson of [...lessons].sort((a, b) => a.order - b.order)) {
    const seriesId = lesson.series || 'default';
    if (!series.has(seriesId)) {
      series.set(seriesId, { id: seriesId, title: lesson.seriesTitle || 'کتاب‌ها', logo: lesson.seriesLogo || '', books: [] });
    }
    const entry = series.get(seriesId);
    let book = entry.books.find((item) => item.id === lesson.book);
    if (!book) {
      book = { id: lesson.book, title: lesson.bookTitle || lesson.book, level: lesson.bookLevel || '', cover: lesson.bookCover || '', lessons: [] };
      entry.books.push(book);
    }
    book.lessons.push(lesson);
  }
  return [...series.values()];
}

/** A selectable card with an image (series logo or book cover), a title and a subtitle. */
function pickCard({ image, title, subtitle, badge: levelBadge, active, onclick }) {
  return h(
    'button',
    {
      type: 'button',
      class: `pick-card${active ? ' active' : ''}`,
      'aria-pressed': active,
      onclick,
    },
    h('span', { class: `pick-media${image ? '' : ' no-image'}` }, image ? h('img', { src: image, alt: '', loading: 'lazy' }) : h('span', {}, title.slice(0, 2))),
    levelBadge ? h('span', { class: 'pick-level' }, levelBadge) : null,
    h('strong', { class: 'pick-title', dir: 'auto' }, title),
    subtitle ? h('span', { class: 'pick-sub' }, subtitle) : null,
    active ? h('span', { class: 'pick-check', 'aria-hidden': 'true' }, '✓') : null,
  );
}

/** Key of the lesson practised last, when it belongs to this book; otherwise null. */
function lastPracticedKey(book) {
  const last = getSettings().lastLesson;
  return book?.lessons.some((lesson) => lesson.key === last) ? last : null;
}

/** One row of the lesson list: a check, the title, a subtitle and an optional tag. */
function lessonRow({ title, subtitle, active, dashed = false, tag = null, onclick }) {
  return h(
    'button',
    {
      type: 'button',
      class: `lesson-row${active ? ' active' : ''}${dashed ? ' all-row' : ''}`,
      'aria-pressed': active,
      onclick,
    },
    h('span', { class: 'lesson-check', 'aria-hidden': 'true' }, active ? '✓' : ''),
    h('span', { class: 'lesson-main' }, h('strong', { dir: 'auto' }, title), h('span', { class: 'muted small' }, subtitle)),
    tag ? h('span', { class: 'lesson-tag' }, tag) : null,
  );
}

/** The chosen book as a card: its cover, a small label, the title, and the level and lesson count as pills. */
function bookHeader(book, lessonCount) {
  return h(
    'div',
    { class: 'book-head' },
    coverThumb(book.cover),
    h(
      'div',
      { class: 'book-head-text' },
      h('span', { class: 'book-kicker' }, 'کتاب انتخاب‌شده'),
      h('strong', { class: 'book-title', dir: 'auto' }, book.title),
      h(
        'span',
        { class: 'book-meta' },
        book.level ? h('span', { class: 'meta-pill level' }, book.level) : null,
        h('span', { class: 'meta-pill' }, `${fa(lessonCount)} درس`),
      ),
    ),
  );
}

/** Cover image of a book (or a placeholder when the book has none). */
function coverThumb(src) {
  return h('span', { class: `book-thumb${src ? '' : ' no-image'}` }, src ? h('img', { src, alt: '' }) : '📘');
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
  return question.answer_mode === 'list' ? acceptedItems(question).join(' ، ') : completeSentence(question);
}

/**
 * Feedback box for list answers (synonyms, for example): every good answer, each with its own speak
 * buttons, so the learner sees all of them and can hear each word.
 */
function acceptedAnswersBox(question) {
  return h(
    'div',
    { class: 'fb-box fb-sentence' },
    h('span', { class: 'fb-label' }, 'همه‌ی پاسخ‌های درست'),
    h(
      'div',
      { class: 'accepted-list' },
      acceptedItems(question).map((item) =>
        h('span', { class: 'accepted-item' }, h('bdi', { class: 'ltr', dir: 'ltr' }, item), speakButtons(item)),
      ),
    ),
  );
}

/** One dot per question of the mission: green = correct, red = wrong, pulsing = current. */
function progressTrack(session) {
  return h(
    'div',
    { class: 'progress-track', role: 'img', 'aria-label': `پیشرفت: ${fa(session.index + 1)} از ${fa(session.total)}` },
    Array.from({ length: session.total }, (_, i) => {
      const outcome = session.outcomes[i];
      let state = 'todo';
      if (outcome) state = outcome.correct ? 'ok' : 'bad';
      else if (i === session.index) state = 'current';
      return h('span', { class: `dot ${state}` });
    }),
  );
}

/** Consecutive correct answers at the end of the session. */
function currentStreak(outcomes) {
  let streak = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i].correct; i -= 1) streak += 1;
  return streak;
}

function renderQuestion(root, session, flow) {
  stopTimer();
  closeModal();
  // Every new question starts at the top of the page.
  window.scrollTo(0, 0);
  const { question: q, index, total } = session.current;
  // The lesson being practised is remembered: the next visit to its book starts from it.
  saveSettings({ ...getSettings(), lastLesson: lessonKey(q.book, q.lesson) });

  const scoreEl = h('span', { class: 'hud-chip score' }, `⭐ ${fa(session.summary().score)}`);
  const streakEl = h('span', { class: 'hud-chip streak', 'aria-live': 'polite' }, `🔥 ${fa(currentStreak(session.outcomes))}`);
  let progressEl = progressTrack(session);
  const timerFill = h('div', { class: 'timer-fill' });
  const timerText = h('span', { class: 'timer-text' });
  const feedback = h('div', { class: 'feedback', hidden: true, role: 'alert' });
  const hintText = q.hint ? h('p', { class: 'hint', dir: 'auto', hidden: true }, q.hint) : null;
  const submitButton = h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'ارسال پاسخ');
  const nextButton = h('button', { type: 'button', class: 'btn primary', hidden: true, onclick: next });

  const widget = createAnswerWidget(q, { onSubmit: submit });

  // The result pops up as a modal card: a celebration when correct, falling rain when not.
  const resultMood = h('div', { class: 'result-mood', 'aria-hidden': 'true' });
  const resultEffect = h('div', { class: 'fx', 'aria-hidden': 'true' });
  const resultOverlay = h(
    'div',
    { class: 'result-overlay' },
    resultEffect,
    h('div', { class: 'result-card', role: 'dialog', 'aria-modal': 'true' }, resultMood, feedback, nextButton),
  );
  closeModal = () => resultOverlay.remove();

  function tick() {
    const remaining = session.remainingMs();
    const limit = q.time_limit * 1000;
    timerFill.style.width = `${(remaining / limit) * 100}%`;
    timerFill.classList.toggle('low', remaining <= limit * 0.25);
    timerText.classList.toggle('low', remaining <= limit * 0.25);
    timerText.textContent = `${fa(Math.ceil(remaining / 1000))} ثانیه`;
    if (remaining <= 0 && !session.answered) {
      finish(session.timeout());
    }
  }

  function submit() {
    if (session.answered) return;
    if (!String(widget.getValue()).trim()) {
      toast('ابتدا پاسخ را وارد کن.', 'warn');
      return;
    }
    finish(session.submit(widget.getValue()));
  }

  function finish(outcome) {
    stopTimer();
    widget.lock(q.expected_answer);
    submitButton.hidden = true;
    scoreEl.textContent = `⭐ ${fa(session.summary().score)}`;
    streakEl.textContent = `🔥 ${fa(currentStreak(session.outcomes))}`;
    const freshTrack = progressTrack(session);
    progressEl.replaceWith(freshTrack);
    progressEl = freshTrack;
    showFeedback(outcome);
    nextButton.hidden = false;
    nextButton.textContent = session.index + 1 < session.total ? 'سؤال بعدی' : 'پایان و نتیجه';
    // Focus is intentionally not moved to the next button: pressing Enter in the answer box
    // only submits the answer, and the learner moves on with the button.
    recordOutcome(outcome).catch(() => toast('ذخیره‌ی نتیجه انجام نشد.', 'error'));
  }

  function showFeedback(outcome) {
    const fullSentence = completeSentence(q);
    const headline = outcome.correct
      ? `درست! +${fa(outcome.points)} امتیاز`
      : outcome.timedOut
        ? 'زمان تمام شد.'
        : 'اشتباه بود.';

    const icon = outcome.correct ? '✓' : outcome.timedOut ? '⏱' : '✕';
    feedback.hidden = false;
    feedback.className = `feedback ${outcome.correct ? 'ok' : 'bad'}`;
    resultOverlay.className = `result-overlay ${outcome.correct ? 'ok' : 'bad'}`;
    resultMood.textContent = outcome.correct ? '🎉' : outcome.timedOut ? '⏱' : '😢';
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
          : h(
          'div',
          { class: 'fb-box fb-sentence' },
          h('span', { class: 'fb-label' }, 'جمله‌ی کامل'),
          h('p', { class: 'fb-text' }, ltr(fullSentence)),
          speakButtons(fullSentence),
        ),
        outcome.correct || outcome.timedOut
          ? null
          : h('div', { class: 'fb-box fb-yours' }, h('span', { class: 'fb-label' }, 'پاسخ تو'), h('p', { class: 'fb-text' }, ltr(outcome.answer))),
        outcome.correct || !q.explanation
          ? null
          : h('div', { class: 'fb-box fb-note', dir: 'auto' }, h('span', { class: 'fb-label' }, 'نکته'), h('p', { class: 'fb-text-sm' }, q.explanation)),
      ].filter(Boolean),
    );
    document.body.append(resultOverlay);
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

  root.replaceChildren(
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
          h('span', { class: 'hud-count' }, `سؤال ${fa(index + 1)} از ${fa(total)}`),
        ),
        h(
          'div',
          { class: 'timer' },
          h('span', { class: 'timer-icon', 'aria-hidden': 'true' }, '⏱️'),
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
        h('p', { class: 'instruction' }, INSTRUCTIONS[q.category] ?? ''),
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
              keepFocus(h('button', { type: 'button', class: 'btn ghost small', onclick: () => (hintText.hidden = false) }, 'راهنما')),
              hintText,
            )
          : null,
      ),
      // Multiple choice submits on click, so it has no send button.
      q.category === 'multiple_choice' ? null : h('div', { class: 'actions play-actions' }, submitButton),
      // Footer: score, streak, and the path so far (one dot per question).
      h(
        'div',
        { class: 'play-footer' },
        // First in the row, so it sits on the start (right) side; the counters sit on the other side.
        h('div', { class: 'footer-path' }, progressEl),
        h('div', { class: 'hud-chips' }, scoreEl, streakEl),
      ),
    ),
  );

  tick();
  timerId = setInterval(tick, 250);
  widget.focus();
}

// Translation questions show a Persian sentence to translate. The learner can hear it read in Persian,
// when the device has a Persian voice (the button is not shown otherwise).
const PERSIAN_SPEAK_CATEGORIES = new Set(['quick_translation', 'voice_translation']);

function persianPrompt(q, text, wordNodes) {
  const line = h('p', { class: 'question', dir: 'auto' }, ...wordNodes(text));
  const button = PERSIAN_SPEAK_CATEGORIES.has(q.category)
    ? questionSpeakButton(text, { lang: 'fa-IR', label: 'جمله‌ی فارسی را بخوان' })
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
          { kind: 'slow', label: 'کلمه را آهسته بخوان', onclick: () => speak(entry.word, { slow: true }) },
          { kind: 'normal', label: 'کلمه را بخوان', onclick: () => speak(entry.word) },
          inContext ? { kind: 'sentence', label: 'کلمه را در جمله بخوان', onclick: () => speak(sentence) } : null,
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

  // Listening question: the English text stays hidden, only the play button is shown (no glossary either,
  // since it would show the words). The learner answers from what they hear.
  if (q.presentation === 'audio' && sentence) {
    const play = questionSpeakButton(sentence, { big: true });
    return h(
      'div',
      { class: 'question-block listen-only' },
      instruction ? h('p', { class: 'q-instruction', dir: 'rtl' }, instruction) : null,
      h('div', { class: 'listen-block' }, play ?? h('p', { class: 'muted small' }, 'پخش صدا در این مرورگر در دسترس نیست.')),
    );
  }

  const lines = englishLine
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
          h('span', { class: 'gloss-label' }, 'کلمه‌های کلیدی · روی هر کدام بزن:'),
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

const RESULT_TITLES = ['دفعه‌ی بعد بهتر می‌شود!', 'خوب شروع کردی!', 'خیلی خوب بود!', 'عالی! ستاره‌ی کامل!'];

/** One number of the results screen: an icon, the value and its label, on a tinted tile. */
function resultTile(icon, value, label, tone) {
  return h(
    'div',
    { class: `result-tile ${tone}` },
    h('span', { class: 'result-tile-icon', 'aria-hidden': 'true' }, icon),
    h('strong', {}, value),
    h('span', { class: 'result-tile-label' }, label),
  );
}

function renderResults(root, session, flow) {
  const summary = session.summary();
  const mistakes = session.outcomes.filter((o) => !o.correct);
  const xpGained = session.outcomes.filter((o) => o.correct).reduce((sum, o) => sum + (Number(o.points) || 0), 0);
  const stars = starsFor(summary.correct, summary.answered);

  const xpBefore = flow.xpBefore ?? 0;
  const levelBefore = levelFor(xpBefore);
  const levelAfter = levelFor(xpBefore + xpGained);

  root.replaceChildren(
    h(
      'section',
      { class: 'card results game' },
      h(
        'div',
        { class: 'result-hero' },
        h(
          'div',
          { class: 'stars', role: 'img', 'aria-label': `${fa(stars)} ستاره از ۳` },
          [1, 2, 3].map((n) => h('span', { class: n <= stars ? 'star on' : 'star' }, '★')),
        ),
        h('h2', {}, RESULT_TITLES[stars]),
        h('p', { class: 'xp-gain' }, `+${fa(xpGained)} XP`),
        levelAfter > levelBefore ? h('p', { class: 'level-up' }, `سطح جدید! حالا سطح ${fa(levelAfter)}`) : null,
      ),
      h(
        'div',
        { class: 'result-tiles' },
        resultTile('⭐', `${fa(summary.score)} از ${fa(summary.maxScore)}`, 'امتیاز', 'gold'),
        resultTile('✓', fa(summary.correct), 'درست', 'ok'),
        resultTile('✕', fa(summary.wrong), 'اشتباه', 'bad'),
        resultTile('⏱', fa(summary.timeouts), 'زمان تمام شد', 'time'),
      ),
      mistakes.length
        ? h(
            'div',
            { class: 'mistakes-head' },
            h('h3', {}, 'مرور اشتباه‌ها'),
            h('span', { class: 'mistakes-count' }, fa(mistakes.length)),
          )
        : h('div', { class: 'all-correct' }, '🎉 عالی! هیچ اشتباهی نبود.'),
      ...mistakes.map((o) =>
        h(
          'article',
          { class: 'mistake-card' },
          h('p', { class: 'mistake-q', dir: 'auto' }, o.question.question),
          h(
            'div',
            { class: 'mistake-answer' },
            h('span', { class: 'mistake-label' }, 'جواب درست'),
            h('bdi', { class: 'ltr', dir: 'ltr' }, answerText(o.question)),
            speakButtons(answerText(o.question)),
          ),
          o.question.explanation ? h('p', { class: 'mistake-note', dir: 'auto' }, o.question.explanation) : null,
        ),
      ),
      h(
        'div',
        { class: 'actions results-actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => flow.restart() }, '↻ بازی دوباره'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => flow.home() }, 'صفحه‌ی اول'),
        h('a', { class: 'btn ghost', href: '#/reports' }, 'گزارش‌ها'),
      ),
    ),
  );
}
