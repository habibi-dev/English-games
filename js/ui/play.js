// Play screen: setup -> question loop (timer, submit, feedback) -> results.
// Only UI logic lives here. Selection, timing and scoring come from the Game Engine,
// answer checks from the Answer Validator, and storage from the Progress Tracker.

import { listQuestions, listBanks } from '../bank/repository.js';
import { CATEGORIES, DIFFICULTIES, topicLabel } from '../bank/schema.js';
import { filterQuestions, pickQuestions, GameSession } from '../engine/game-engine.js';
import { recordOutcome } from '../progress/tracker.js';
import { h, toast, fa, ltr, badge, stat } from './dom.js';
import { createAnswerWidget, INSTRUCTIONS } from './answer-widgets.js';

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
function chipGroup(options, selected, { multiple = true, onChange }) {
  const box = h('div', { class: 'chips' });
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

async function showSetup(root) {
  const questions = await listQuestions();
  const topicOptions = [...new Set(questions.map((q) => q.topic))].map((topic) => [topic, topicLabel(topic)]);

  const banks = await listBanks();
  const bankOptions = banks.map((bank) => [bank.id, bank.name]);
  const defaultBanks = banks.filter((bank) => bank.default).map((bank) => bank.id);

  const state = {
    banks: defaultBanks.length ? defaultBanks : banks.map((bank) => bank.id),
    topics: topicOptions.map(([topic]) => topic),
    categories: Object.keys(CATEGORIES),
    difficulties: Object.keys(DIFFICULTIES),
    count: [10],
  };

  const info = h('p', { class: 'muted small' });
  const startButton = h('button', { type: 'button', class: 'btn primary wide', onclick: start }, 'شروع تمرین');

  function available() {
    return filterQuestions(questions, state);
  }

  function refresh() {
    const count = available().length;
    info.textContent = `${fa(count)} سؤال فعال با تنظیمات انتخابی`;
    startButton.disabled = count === 0;
  }

  function start() {
    const pool = pickQuestions(questions, state, { count: state.count[0] || Infinity });
    if (pool.length === 0) {
      toast('سؤالی با این تنظیمات پیدا نشد.', 'warn');
      return;
    }
    renderQuestion(root, new GameSession(pool));
  }

  root.replaceChildren(
    h(
      'section',
      { class: 'card setup' },
      h('h2', {}, 'تمرین گرامر'),
      h('p', { class: 'muted' }, 'بانک، موضوع، نوع سؤال و سطح را انتخاب کن.'),
      bankOptions.length ? h('h4', {}, 'بانک سؤال') : null,
      bankOptions.length ? chipGroup(bankOptions, state.banks, { onChange: refresh }) : null,
      h('h4', {}, 'موضوع'),
      chipGroup(topicOptions, state.topics, { onChange: refresh }),
      h('h4', {}, 'نوع سؤال'),
      chipGroup(Object.entries(CATEGORIES), state.categories, { onChange: refresh }),
      h('h4', {}, 'سطح'),
      chipGroup(Object.entries(DIFFICULTIES), state.difficulties, { onChange: refresh }),
      h('h4', {}, 'تعداد سؤال'),
      chipGroup(
        [
          [10, `${fa(10)} سؤال`],
          [20, `${fa(20)} سؤال`],
          [50, `${fa(50)} سؤال`],
          [0, 'همه'],
        ],
        state.count,
        { multiple: false, onChange: refresh },
      ),
      info,
      startButton,
    ),
  );
  refresh();
}

function renderQuestion(root, session) {
  stopTimer();
  const { question: q, index, total } = session.current;

  const scoreEl = h('span', { class: 'score' }, `امتیاز: ${fa(session.summary().score)}`);
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
    scoreEl.textContent = `امتیاز: ${fa(session.summary().score)}`;
    showFeedback(outcome);
    nextButton.hidden = false;
    nextButton.textContent = session.index + 1 < session.total ? 'سؤال بعدی' : 'پایان و نتیجه';
    nextButton.focus();
    recordOutcome(outcome).catch(() => toast('ذخیره‌ی نتیجه انجام نشد.', 'error'));
  }

  function showFeedback(outcome) {
    const headline = outcome.correct
      ? `درست! +${fa(outcome.points)} امتیاز`
      : outcome.timedOut
        ? 'زمان تمام شد.'
        : 'اشتباه بود.';

    feedback.hidden = false;
    feedback.className = `feedback ${outcome.correct ? 'ok' : 'bad'}`;
    feedback.replaceChildren(
      ...[
        h('strong', {}, headline),
        outcome.correct
          ? null
          : h('p', { class: 'answer-line' }, h('span', {}, 'پاسخ صحیح: '), ltr(q.expected_answer)),
        outcome.correct || outcome.timedOut
          ? null
          : h('p', { class: 'answer-line' }, h('span', {}, 'پاسخ تو: '), ltr(outcome.answer)),
        outcome.correct || !q.explanation ? null : h('p', { class: 'explanation', dir: 'auto' }, q.explanation),
      ].filter(Boolean),
    );
  }

  function next() {
    session.next();
    if (session.finished) {
      renderResults(root, session);
    } else {
      renderQuestion(root, session);
    }
  }

  root.replaceChildren(
    h(
      'section',
      { class: 'card play' },
      h('div', { class: 'play-meta' }, h('span', {}, `سؤال ${fa(index + 1)} از ${fa(total)}`), scoreEl),
      h('div', { class: 'timer' }, h('div', { class: 'timer-track' }, timerFill), timerText),
      h(
        'div',
        { class: 'badges' },
        badge(CATEGORIES[q.category] ?? q.category, 'accent'),
        badge(topicLabel(q.topic)),
        badge(DIFFICULTIES[q.difficulty] ?? q.difficulty),
      ),
      h('p', { class: 'instruction' }, INSTRUCTIONS[q.category] ?? ''),
      questionBlock(q),
      widget.element,
      hintText ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => (hintText.hidden = false) }, 'راهنما') : null,
      hintText,
      feedback,
      h('div', { class: 'actions' }, submitButton, nextButton),
    ),
  );

  tick();
  timerId = setInterval(tick, 250);
  widget.focus();
}

/**
 * The question text plus its glossary. Tapping a glossary word, either in the text or in the
 * chip list below it, shows the Persian meaning.
 */
function questionBlock(q) {
  const glossary = q.glossary ?? [];
  if (glossary.length === 0) {
    return h('p', { class: 'question', dir: 'auto' }, q.question);
  }

  const tip = h('p', { class: 'gloss-tip', dir: 'auto', hidden: true });
  const show = (entry) => {
    tip.hidden = false;
    tip.replaceChildren(h('strong', { dir: 'ltr' }, entry.word), ` = ${entry.meaning}`);
  };

  const byWord = new Map(glossary.map((entry) => [entry.word.toLowerCase(), entry]));
  const words = q.question.split(/(\s+)/).map((part) => {
    const entry = byWord.get(part.replace(/[^\p{L}']/gu, '').toLowerCase());
    return entry
      ? h('span', { class: 'gloss-word', role: 'button', onclick: () => show(entry) }, part)
      : part;
  });

  return h(
    'div',
    { class: 'question-block' },
    h('p', { class: 'question', dir: 'auto' }, ...words),
    h(
      'div',
      { class: 'glossary' },
      h('span', { class: 'muted small' }, 'کلمات کلیدی (روی هر کدام بزن تا معنی‌اش را ببینی):'),
      h(
        'div',
        { class: 'chips' },
        glossary.map((entry) =>
          h('button', { type: 'button', class: 'chip gloss-chip', dir: 'ltr', onclick: () => show(entry) }, entry.word),
        ),
      ),
    ),
    tip,
  );
}

function renderResults(root, session) {
  const summary = session.summary();
  const mistakes = session.outcomes.filter((o) => !o.correct);

  root.replaceChildren(
    h(
      'section',
      { class: 'card results' },
      h('h2', {}, 'نتیجه تمرین'),
      h(
        'div',
        { class: 'stats-grid' },
        stat('امتیاز', `${fa(summary.score)} از ${fa(summary.maxScore)}`),
        stat('درست', fa(summary.correct)),
        stat('اشتباه', fa(summary.wrong)),
        stat('زمان تمام شد', fa(summary.timeouts)),
      ),
      h('h3', {}, mistakes.length ? 'مرور اشتباه‌ها' : 'عالی! هیچ اشتباهی نبود.'),
      ...mistakes.map((o) =>
        h(
          'div',
          { class: 'mistake' },
          h('p', { dir: 'auto' }, o.question.question),
          h('p', { class: 'answer-line' }, h('span', {}, 'پاسخ صحیح: '), ltr(o.question.expected_answer)),
          o.question.explanation ? h('p', { class: 'explanation', dir: 'auto' }, o.question.explanation) : null,
        ),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => showSetup(root) }, 'تمرین جدید'),
        h('a', { class: 'btn ghost', href: '#/reports' }, 'گزارش‌ها'),
      ),
    ),
  );
}