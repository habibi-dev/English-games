// Play screen: setup (player card + missions) -> question loop (timer, submit, feedback) -> results.
// Only UI logic lives here. Selection, timing and scoring come from the Game Engine,
// answer checks from the Answer Validator, and storage from the Progress Tracker.

import { listQuestions, listBanks } from '../bank/repository.js';
import { CATEGORIES, DIFFICULTIES, topicLabel } from '../bank/schema.js';
import { filterQuestions, pickQuestions, GameSession } from '../engine/game-engine.js';
import { recordOutcome, loadAttempts } from '../progress/tracker.js';
import { playerProfile, levelFor, starsFor, XP_PER_LEVEL } from '../progress/player.js';
import { getSettings, saveSettings } from '../storage/settings.js';
import { h, toast, fa, ltr, badge, percent, keepFocus } from './dom.js';
import { createAnswerWidget, INSTRUCTIONS } from './answer-widgets.js';
import { speak, speakButtons, completeSentence, contextSentence } from './speech-out.js';

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
};

let timerId = null;

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/** Route entry point. Returns a cleanup function that the router calls when leaving the view. */
export async function renderPlay(root) {
  await showSetup(root);
  return stopTimer;
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

  const [questions, banks, attempts] = await Promise.all([listQuestions(), listBanks(), loadAttempts()]);
  const profile = playerProfile(attempts);
  const saved = getSettings();

  const topicOptions = [...new Set(questions.map((q) => q.topic))].map((topic) => [topic, topicLabel(topic)]);
  const bankOptions = banks.map((bank) => [bank.id, bank.name]);
  const defaultBanks = banks.filter((bank) => bank.default).map((bank) => bank.id);
  const allBanks = banks.map((bank) => bank.id);
  const allTopics = topicOptions.map(([topic]) => topic);
  const allCategories = Object.keys(CATEGORIES);
  const allDifficulties = Object.keys(DIFFICULTIES);

  const state = {
    banks: restored(saved.banks, allBanks, defaultBanks.length ? defaultBanks : allBanks),
    topics: restored(saved.topics, allTopics, allTopics),
    categories: restored(saved.categories, allCategories, allCategories),
    difficulties: restored(saved.difficulties, allDifficulties, allDifficulties),
    count: [COUNTS.includes(saved.count) ? saved.count : 10],
  };

  const info = h('p', { class: 'muted small info' });
  const startButton = h('button', { type: 'button', class: 'btn primary start-btn', onclick: start }, 'شروع مأموریت!');

  function available() {
    return filterQuestions(questions, state);
  }

  function refresh() {
    saveSettings({
      banks: state.banks,
      topics: state.topics,
      categories: state.categories,
      difficulties: state.difficulties,
      count: state.count[0],
    });
    const count = available().length;
    info.textContent = `${fa(count)} سؤال آماده برای این مأموریت`;
    startButton.disabled = count === 0;
  }

  async function start() {
    const pool = pickQuestions(questions, state, { count: state.count[0] || Infinity });
    if (pool.length === 0) {
      toast('سؤالی با این تنظیمات پیدا نشد.', 'warn');
      return;
    }
    const before = playerProfile(await loadAttempts());
    renderQuestion(root, new GameSession(pool), {
      restart: start,
      home: () => showSetup(root),
      xpBefore: before.xp,
    });
  }

  root.replaceChildren(
    h(
      'section',
      { class: 'card setup game' },
      playerCard(profile),
      bankOptions.length ? stepTitle(1, 'بانک سؤال') : null,
      bankOptions.length
        ? chipGroup(bankOptions, state.banks, { onChange: refresh, className: 'card-options' })
        : null,
      stepTitle(2, 'موضوع'),
      chipGroup(topicOptions, state.topics, { onChange: refresh, className: 'card-options' }),
      stepTitle(3, 'نوع مأموریت'),
      chipGroup(
        Object.entries(CATEGORIES).map(([key, label]) => [key, `${CATEGORY_ICONS[key] ?? ''} ${label}`.trim()]),
        state.categories,
        { onChange: refresh, className: 'card-options mission-options' },
      ),
      stepTitle(4, 'سختی'),
      chipGroup(Object.entries(DIFFICULTIES), state.difficulties, { onChange: refresh, className: 'card-options' }),
      stepTitle(5, 'طول مأموریت'),
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
  const { question: q, index, total } = session.current;

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

  function tick() {
    const remaining = session.remainingMs();
    const limit = q.time_limit * 1000;
    timerFill.style.width = `${(remaining / limit) * 100}%`;
    timerFill.classList.toggle('low', remaining <= limit * 0.25);
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
    feedback.replaceChildren(
      ...[
        h(
          'div',
          { class: 'fb-head' },
          h('span', { class: 'fb-icon', 'aria-hidden': 'true' }, icon),
          h('strong', { class: 'fb-title' }, headline),
        ),
        h(
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
  }

  function next() {
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
      // Top bar: where the learner is, score and streak, then the mission progress track.
      h(
        'div',
        { class: 'hud' },
        h(
          'div',
          { class: 'hud-top' },
          h('span', { class: 'hud-count' }, `سؤال ${fa(index + 1)} از ${fa(total)}`),
          h('div', { class: 'hud-chips' }, scoreEl, streakEl),
        ),
        progressEl,
      ),
      h('div', { class: 'timer' }, h('div', { class: 'timer-track' }, timerFill), timerText),
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
      feedback,
      h('div', { class: 'actions play-actions' }, submitButton, nextButton),
    ),
  );

  tick();
  timerId = setInterval(tick, 250);
  widget.focus();
}

/**
 * The question text plus its glossary. Tapping a glossary word, either in the text or in the
 * chip list below it, shows the Persian meaning and says the word aloud.
 */
function questionBlock(q) {
  const glossary = q.glossary ?? [];
  if (glossary.length === 0) {
    return h('p', { class: 'question', dir: 'auto' }, q.question);
  }

  const tip = h('div', { class: 'gloss-tip', dir: 'auto', hidden: true });
  const sentence = contextSentence(q);
  const show = (entry) => {
    // Spoken inside its sentence so the pronunciation matches how it sounds in context.
    // The isolated word is offered separately, since a single word can be pronounced differently.
    const inContext = Boolean(sentence) && containsWord(sentence, entry.word);
    tip.hidden = false;
    tip.replaceChildren(
      ...[
        h(
          'div',
          { class: 'tip-head' },
          h('strong', { class: 'tip-word', dir: 'ltr' }, entry.word),
          h('span', { class: 'tip-meaning' }, entry.meaning),
        ),
        h(
          'span',
          { class: 'speak-buttons' },
          inContext
            ? keepFocus(h('button', { type: 'button', class: 'btn ghost small speak', onclick: () => speak(sentence) }, '🔊 در جمله'))
            : null,
          keepFocus(h('button', { type: 'button', class: 'btn ghost small speak', onclick: () => speak(entry.word) }, '🔊 کلمه‌ی تنها')),
        ),
      ].filter(Boolean),
    );
    speak(inContext ? sentence : entry.word);
  };

  const byWord = new Map(glossary.map((entry) => [entry.word.toLowerCase(), entry]));
  const words = q.question.split(/(\s+)/).map((part) => {
    const entry = byWord.get(part.replace(/[^\p{L}']/gu, '').toLowerCase());
    return entry
      ? keepFocus(h('span', { class: 'gloss-word', role: 'button', onclick: () => show(entry) }, part))
      : part;
  });

  return h(
    'div',
    { class: 'question-block' },
    h('p', { class: 'question', dir: 'auto' }, ...words),
    h(
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
    ),
    tip,
  );
}

const RESULT_TITLES = ['دفعه‌ی بعد بهتر می‌شود!', 'خوب شروع کردی!', 'خیلی خوب بود!', 'عالی! ستاره‌ی کامل!'];

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
        { class: 'stats-grid' },
        miniStat(`${fa(summary.score)} از ${fa(summary.maxScore)}`, 'امتیاز'),
        miniStat(fa(summary.correct), 'درست'),
        miniStat(fa(summary.wrong), 'اشتباه'),
        miniStat(fa(summary.timeouts), 'زمان تمام شد'),
      ),
      h('h3', {}, mistakes.length ? 'مرور اشتباه‌ها' : 'عالی! هیچ اشتباهی نبود.'),
      ...mistakes.map((o) =>
        h(
          'div',
          { class: 'mistake' },
          h('p', { dir: 'auto' }, o.question.question),
          h('p', { class: 'answer-line' }, h('span', {}, 'جمله‌ی کامل: '), ltr(completeSentence(o.question)), speakButtons(completeSentence(o.question))),
          o.question.explanation ? h('p', { class: 'explanation', dir: 'auto' }, o.question.explanation) : null,
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
