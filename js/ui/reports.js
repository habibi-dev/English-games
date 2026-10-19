// Reports screen. Every number comes from question metadata or stored attempts.

import { listQuestions } from '../bank/repository.js';
import { CATEGORIES, topicLabel } from '../bank/schema.js';
import { bankSummary, performanceSummary, reviewList } from '../progress/report.js';
import { loadAttempts, resetProgress } from '../progress/tracker.js';
import { loadSessions, msByDay, activityStats, calendarMonth, dayKey, WEEK_STARTS_ON } from '../progress/activity.js';
import { h, fa, percent, table, toast, badge, confirmDialog } from './dom.js';
import { speakButtons, questionSpeakButton } from './speech-out.js';
import { splitPrompt } from './prompt.js';
import { requestReview } from './review-handoff.js';
/** A summary number on a tinted tile: icon, value and label. */
function statCard(icon, value, label, tone) {
  return h(
    'div',
    { class: `report-stat ${tone}` },
    h('span', { class: 'report-stat-icon', 'aria-hidden': 'true' }, icon),
    h('strong', {}, value),
    h('span', { class: 'report-stat-label' }, label),
  );
}

/** A section: a title with an icon, an optional hint, and its table or note inside a card. */
function section(icon, title, hint, content) {
  return h(
    'section',
    { class: 'report-section' },
    h(
      'header',
      { class: 'report-section-head' },
      h('span', { class: 'report-section-icon', 'aria-hidden': 'true' }, icon),
      h('div', {}, h('h3', {}, title), hint ? h('p', { class: 'muted small' }, hint) : null),
    ),
    h('div', { class: 'report-card' }, content),
  );
}

/** Success rate as a number with a bar: green from 75%, amber from 50%, red below that. */
function rateCell(ratio) {
  if (ratio == null) return h('span', { class: 'muted' }, '—');
  const pct = Math.round(ratio * 100);
  const tone = pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
  return h(
    'span',
    { class: 'rate' },
    h('span', { class: 'rate-bar' }, h('span', { class: `rate-fill ${tone}`, style: `width: ${pct}%` })),
    h('strong', {}, percent(ratio)),
  );
}

const emptyNote = (text) => h('p', { class: 'report-empty' }, text);

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Activity calendar state: the month on screen and the tapped day. null = this month / today.
let calendarView = null;
let selectedDay = null;

// Legend for the calendar colours, matching levelFor() in js/progress/activity.js.
const LEGEND = [
  [0, 'None'],
  [1, '< 15 min'],
  [2, '15–30 min'],
  [3, '30–60 min'],
  [4, '1 h+'],
];

/** Play time in hours and minutes, e.g. "2 h 15 min", "45 min". */
function durationText(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${fa(minutes)} min` : `${fa(hours)} h ${fa(minutes)} min`;
}

/** "Thu, Oct 15, 2026" for a day key such as "2026-10-15". */
function dayLabel(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Activity panel: period totals, streaks, and a month calendar coloured by play time. */
function activitySection(root, now) {
  const sessions = loadSessions();
  const stats = activityStats(sessions, now);
  const totals = msByDay(sessions);
  const current = new Date(now);
  const todayKey = dayKey(now);
  const view = calendarView ?? { year: current.getFullYear(), month: current.getMonth() };
  const isCurrentMonth = view.year === current.getFullYear() && view.month === current.getMonth();
  const shownKey = selectedDay ?? todayKey;

  const moveMonth = (delta) => {
    let month = view.month + delta;
    let year = view.year;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    calendarView = { year, month };
    renderReports(root);
  };

  const cells = calendarMonth(view.year, view.month, totals).map((cell) =>
    cell
      ? h(
          'button',
          {
            type: 'button',
            class: `cal-cell lvl-${cell.level}${cell.key === todayKey ? ' today' : ''}${cell.key === shownKey ? ' selected' : ''}`,
            title: `${dayLabel(cell.key)}: ${durationText(cell.ms)}`,
            'aria-label': `${dayLabel(cell.key)}: ${durationText(cell.ms)}`,
            onclick: () => {
              selectedDay = cell.key;
              renderReports(root);
            },
          },
          fa(cell.day),
        )
      : h('span', { class: 'cal-cell empty', 'aria-hidden': 'true' }),
  );

  return section(
    '⏱️',
    'Your activity',
    'Time counts from the start of a mission until it ends, or until you leave it.',
    h(
      'div',
      { class: 'activity' },
      sessions.length === 0 ? emptyNote('No play time yet. Start a mission and it will show here.') : null,
      h(
        'div',
        { class: 'report-stats activity-tiles activity-row activity-periods' },
        statCard('☀️', durationText(stats.today), 'Today', 'amber'),
        statCard('🌙', durationText(stats.yesterday), 'Yesterday', 'indigo'),
        statCard('📅', durationText(stats.week), 'This week', 'blue'),
        statCard('🗓️', durationText(stats.month), 'This month', 'green'),
        statCard('⏳', durationText(stats.allTime), 'All time', 'violet'),
      ),
      h(
        'div',
        { class: 'report-stats activity-tiles activity-row activity-stats' },
        statCard('🔥', `${fa(stats.currentStreak)} days`, 'Current streak', 'amber'),
        statCard('🏆', `${fa(stats.bestStreak)} days`, 'Best streak', 'violet'),
        statCard('✅', fa(stats.activeDays), 'Active days', 'green'),
        statCard('🎮', fa(stats.missions), 'Missions played', 'blue'),
        statCard('⚡', durationText(stats.averagePerActiveDay), 'Average per active day', 'indigo'),
        statCard('🥇', stats.bestDay ? durationText(stats.bestDay.ms) : '—', 'Best day', 'amber'),
      ),
      h(
        'div',
        { class: 'cal' },
        h(
          'div',
          { class: 'cal-head' },
          h(
            'button',
            { type: 'button', class: 'btn ghost small', 'aria-label': 'Previous month', onclick: () => moveMonth(-1) },
            '‹',
          ),
          h('strong', {}, `${MONTH_NAMES[view.month]} ${fa(view.year)}`),
          h(
            'button',
            {
              type: 'button',
              class: 'btn ghost small',
              'aria-label': 'Next month',
              disabled: isCurrentMonth,
              onclick: () => moveMonth(1),
            },
            '›',
          ),
        ),
        h(
          'div',
          { class: 'cal-grid cal-weekdays', 'aria-hidden': 'true' },
          // Columns start on WEEK_STARTS_ON, the same as the calendar cells.
          Array.from({ length: 7 }, (_, i) => h('span', { class: 'cal-weekday' }, WEEKDAY_NAMES[(WEEK_STARTS_ON + i) % 7])),
        ),
        h('div', { class: 'cal-grid' }, cells),
        h(
          'div',
          { class: 'cal-legend' },
          // Each colour is a band of play time per day, so the legend shows the hours it stands for.
          LEGEND.map(([level, label]) =>
            h('span', { class: 'cal-legend-item' }, h('span', { class: `cal-swatch lvl-${level}` }), label),
          ),
        ),
        h('p', { class: 'cal-selected' }, `${dayLabel(shownKey)}: ${durationText(totals.get(shownKey) ?? 0)}`),
      ),
    ),
  );
}

// Calendar colours: 0 = no time, 1 = under 15 min, 2 = under 30 min, 3 = under an hour, 4 = an hour or more.

export async function renderReports(root) {
  const [questions, attempts] = await Promise.all([listQuestions(), loadAttempts()]);
  const bank = bankSummary(questions);
  const perf = performanceSummary(attempts);
  const review = reviewList(attempts);
  const categoryEntries = Object.entries(CATEGORIES);
  // Older attempts were saved without the sentence, so it is also read from the question bank.
  const sentenceById = new Map(questions.map((q) => [q.id, q.incorrect_sentence]));

  const bankRows = [...bank.byTopic, { topic: 'totals', label: 'Total', ...bank.totals }].map((row) => [
    row.label ?? topicLabel(row.topic),
    fa(row.total),
    fa(row.enabled),
    fa(row.disabled),
    ...categoryEntries.map(([key]) => fa(row.byCategory[key] ?? 0)),
  ]);

  const topicRows = perf.topics.map((row) => [
    topicLabel(row.topic),
    fa(row.attempted),
    fa(row.correct),
    fa(row.wrong),
    fa(row.timeouts),
    rateCell(row.successRate),
  ]);

  const cellRows = perf.cells.map((row) => [
    topicLabel(row.topic),
    CATEGORIES[row.category] ?? row.category,
    fa(row.attempted),
    fa(row.correct),
    fa(row.wrong),
    rateCell(row.successRate),
  ]);

  // Review items are shown as cards, not table rows: a question and its answer read better in full width.
  // The sentence to correct is shown first. The answer stays hidden until the learner asks for it.
  const reviewCards = review.map((row) => {
    const { instruction, sentence: questionSentence } = splitPrompt(row.question);
    // A grammar correction shows its incorrect sentence; other exercises show the English part of the question.
    const english = row.incorrect_sentence || sentenceById.get(row.questionId) || questionSentence;
    // Dictation is listening only: its sentence is the answer, so only the play button is shown.
    const listenOnly = row.category === 'dictation';
    const answer = h(
      'div',
      { class: 'review-answer fb-box', hidden: true },
      h('span', { class: 'fb-label' }, 'Correct answer'),
      h('p', { class: 'fb-text' }, h('bdi', { class: 'ltr', dir: 'ltr' }, row.expected_answer)),
      speakButtons(row.expected_answer),
    );
    // Same layout as the question screen: the instruction line, then the English sentence with its speak button.
    const questionBlock = h(
      'div',
      { class: 'question-block' },
      instruction ? h('p', { class: 'q-instruction', dir: 'rtl' }, instruction) : null,
      english
        ? h(
            'div',
            { class: 'q-english-row', dir: 'ltr' },
            listenOnly ? null : h('p', { class: 'question q-english', dir: 'ltr' }, english),
            questionSpeakButton(english),
          )
        : null,
    );
    const revealButton = h(
      'button',
      {
        type: 'button',
        class: 'btn ghost small',
        onclick: () => {
          answer.hidden = false;
          revealButton.hidden = true;
        },
      },
      'Show answer',
    );
    return h(
      'article',
      { class: 'review-item' },
      questionBlock,
      answer,
      h(
        'div',
        { class: 'review-meta' },
        badge(topicLabel(row.topic)),
        badge(CATEGORIES[row.category] ?? row.category, 'accent'),
        badge(`Wrong ${fa(row.wrong)} of ${fa(row.attempted)}`, 'bad'),
        badge(row.lastCorrect ? 'Last answer: correct' : 'Last answer: wrong', row.lastCorrect ? 'ok' : 'bad'),
      ),
      h('div', { class: 'review-actions' }, revealButton),
    );
  });

  root.replaceChildren(
    h(
      'section',
      { class: 'reports' },
      h(
        'header',
        { class: 'reports-head' },
        h('h2', {}, 'Reports'),
        h('p', { class: 'muted small' }, 'Your progress and the question bank status'),
      ),
      h(
        'div',
        { class: 'report-stats' },
        statCard('📚', fa(bank.totals.total), 'Total questions', 'blue'),
        statCard('✅', fa(bank.totals.enabled), 'Active questions', 'green'),
        statCard('✍️', fa(perf.overall.attempted), 'Answers', 'indigo'),
        statCard('🎯', percent(perf.overall.successRate), 'Success rate', 'amber'),
        statCard('⭐', fa(perf.overall.points), 'Points earned', 'violet'),
      ),

      activitySection(root, Date.now()),

      section(
        '🗂️',
        'Question bank by topic and type',
        'How many questions are ready for each topic and type.',
        table(['Topic', 'Total', 'Active', 'Inactive', ...categoryEntries.map(([, label]) => label)], bankRows),
      ),

      section(
        '📈',
        'Performance by topic',
        null,
        perf.topics.length
          ? table(['Topic', 'Answers', 'Correct', 'Wrong', 'Timed out', 'Success'], topicRows)
          : emptyNote('No answers recorded yet.'),
      ),

      section(
        '🧭',
        'Performance by topic and type',
        null,
        perf.cells.length
          ? table(['Topic', 'Type', 'Answers', 'Correct', 'Wrong', 'Success'], cellRows)
          : emptyNote('No answers recorded yet.'),
      ),

      section(
        '🔁',
        `Questions to review again (${fa(review.length)})`,
        'Questions whose last answer was wrong, or that were answered wrong at least twice with more than half of the answers wrong.',
        review.length
          ? h(
              'div',
              {},
              h(
                'div',
                { class: 'review-start' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn primary',
                    onclick: () => {
                      requestReview(review.map((row) => row.questionId));
                      location.hash = '#/play';
                    },
                  },
                  `▶ Start review (${fa(review.length)})`,
                ),
              ),
              h('div', { class: 'review-list' }, reviewCards),
            )
          : emptyNote('No questions to review for now.'),
      ),

      h(
        'div',
        { class: 'actions reports-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn danger',
            onclick: async () => {
              // Two steps: the first says exactly what is deleted, the second is the final check.
              const first = await confirmDialog({
                title: 'Clear all progress?',
                message:
                  'All your history on this device will be deleted: every answer you have given, your points, XP, level, stars, lesson progress, your play time and your calendar. This cannot be undone. The question bank will not change.',
                confirmText: 'Continue',
                cancelText: 'Cancel',
              });
              if (!first) return;
              const second = await confirmDialog({
                title: 'Are you sure?',
                message: 'This is the last step. Your history will be permanently erased from this device.',
                confirmText: 'Delete everything',
                cancelText: 'Keep my progress',
                danger: true,
              });
              if (!second) return;
              await resetProgress();
              toast('Progress cleared.');
              renderReports(root);
            },
          },
          'Clear progress',
        ),
      ),
    ),
  );
}
