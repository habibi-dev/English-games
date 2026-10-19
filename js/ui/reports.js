// Reports screen. Every number comes from question metadata or stored attempts.

import { listQuestions } from '../bank/repository.js';
import { CATEGORIES, topicLabel } from '../bank/schema.js';
import { bankSummary, performanceSummary, reviewList } from '../progress/report.js';
import { loadAttempts, resetProgress } from '../progress/tracker.js';
import { loadSessions, msByDay, activityStats, calendarMonth, dayKey, WEEK_STARTS_ON } from '../progress/activity.js';
import { h, fa, percent, toast, badge, confirmDialog } from './dom.js';
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

/** Success tone: green from 75%, amber from 50%, red below that. */
function toneFor(ratio) {
  if (ratio == null) return 'none';
  const pct = Math.round(ratio * 100);
  return pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
}

/** One label over one number, used inside the performance and question bank cards. */
const metric = (label, value, tone = '') =>
  h('div', { class: `perf-metric ${tone}`.trim() }, h('dt', {}, label), h('dd', {}, fa(value)));

/**
 * One result as a card: its name, the success rate with a bar, then the counts.
 * Cards fit a phone screen, where a wide table would need sideways scrolling.
 */
function perfCard(title, subtitle, row) {
  const tone = toneFor(row.successRate);
  const pct = row.successRate == null ? 0 : Math.round(row.successRate * 100);
  return h(
    'article',
    { class: 'perf-card' },
    h(
      'div',
      { class: 'perf-head' },
      h('div', { class: 'perf-titles' }, h('h4', {}, title), subtitle ? h('span', { class: 'perf-sub' }, subtitle) : null),
      h('span', { class: `perf-pill ${tone}` }, percent(row.successRate)),
    ),
    h('span', { class: 'perf-bar', 'aria-hidden': 'true' }, h('span', { class: `perf-fill ${tone}`, style: `width: ${pct}%` })),
    h(
      'dl',
      { class: 'perf-metrics' },
      metric('Answers', row.attempted),
      metric('Correct', row.correct, 'ok'),
      metric('Wrong', row.wrong, 'bad'),
      metric('Timed out', row.timeouts),
    ),
  );
}

/** A topic (or the whole bank) as a card: its counts, then one chip per question type. */
function bankCard(row, title, categoryEntries, isTotal = false) {
  return h(
    'article',
    { class: `perf-card bank-card${isTotal ? ' total' : ''}` },
    h(
      'div',
      { class: 'perf-head' },
      h('div', { class: 'perf-titles' }, h('h4', {}, title)),
      h('span', { class: 'perf-pill info' }, `${fa(row.enabled)} active`),
    ),
    h(
      'dl',
      { class: 'perf-metrics three' },
      metric('Total', row.total),
      metric('Active', row.enabled, 'ok'),
      metric('Inactive', row.disabled),
    ),
    h(
      'div',
      { class: 'bank-chips' },
      categoryEntries.map(([key, label]) =>
        h('span', { class: 'bank-chip' }, `${label} `, h('strong', {}, fa(row.byCategory[key] ?? 0))),
      ),
    ),
  );
}

/** Daily study goal: the target shown in the goal card. */
const DAILY_GOAL_MS = 15 * 60000;

/**
 * The first thing on the reports: today's goal, a message about the next step, and one main action.
 * It tells the learner how close they are, so one more mission feels worth doing.
 */
function goalCard(stats, perf, reviewCount, onReview) {
  const goal = DAILY_GOAL_MS;
  const today = stats.today;
  const pct = Math.min(Math.round((today / goal) * 100), 100);
  let title;
  let text;
  if (stats.allTime === 0) {
    title = 'Start your first mission';
    text = 'Every answer is saved here. Your goal, streak and progress begin with one mission.';
  } else if (today >= 2 * goal) {
    title = 'Outstanding! You are on fire today';
    text = `${durationText(today)} of practice already. Keep going while the momentum is high.`;
  } else if (today >= goal) {
    title = 'Daily goal reached!';
    text = 'Great work. One more mission today makes your progress even stronger.';
  } else if (today > 0) {
    title = `Only ${durationText(goal - today)} to go`;
    text = "Finish today's goal to keep your momentum.";
  } else if (stats.currentStreak > 0) {
    title = `Your ${fa(stats.currentStreak)}-day streak is waiting`;
    text = 'Play one mission today to keep it alive.';
  } else {
    title = 'Time to practise';
    text = 'Short daily practice works better than long breaks. Start a mission now.';
  }

  const accuracy = perf.overall.successRate == null ? '—' : percent(perf.overall.successRate);

  return h(
    'section',
    { class: 'goal-card' },
    h(
      'div',
      { class: 'goal-top' },
      h('span', { class: 'goal-kicker' }, "Today's goal"),
      h('span', { class: 'goal-goal' }, `${durationText(today)} / ${durationText(goal)}`),
    ),
    h('h3', { class: 'goal-title' }, title),
    h('p', { class: 'goal-text' }, text),
    h(
      'div',
      { class: 'goal-bar', role: 'progressbar', 'aria-label': "Today's goal", 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
      h('span', { class: 'goal-fill', style: `width: ${pct}%` }),
    ),
    h(
      'div',
      { class: 'goal-chips' },
      h('span', { class: 'goal-chip' }, `🔥 ${daysText(stats.currentStreak)} streak`),
      h('span', { class: 'goal-chip' }, `🎯 ${accuracy} accuracy`),
      h('span', { class: 'goal-chip' }, `⭐ ${fa(perf.overall.points)} points`),
    ),
    reviewCount > 0
      ? h(
          'button',
          { type: 'button', class: 'btn primary goal-cta', onclick: onReview },
          `▶ Review ${fa(reviewCount)} weak ${reviewCount === 1 ? 'question' : 'questions'}`,
        )
      : h('a', { class: 'btn primary goal-cta', href: '#/play' }, '▶ Start a mission'),
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
  [1, '<15m'],
  [2, '15–30m'],
  [3, '30–60m'],
  [4, '1h+'],
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

/** "1 day", "5 days". */
function daysText(count) {
  return `${fa(count)} ${count === 1 ? 'day' : 'days'}`;
}

/** One labelled row of tiles inside the overview card. The tile count sets the number of columns. */
function overviewGroup(title, tiles) {
  return h(
    'div',
    { class: 'ov-group' },
    h('span', { class: 'ov-title' }, title),
    h('div', { class: 'ov-tiles', style: `--cols: ${tiles.length}` }, tiles),
  );
}

/**
 * The top of the reports: question bank status, study time and streaks, as one card with three rows.
 * Each row is one line of small tiles, so the whole picture is visible at a glance.
 */
function overviewCard(bank, perf, stats) {
  return h(
    'section',
    { class: 'overview' },
    overviewGroup('Progress', [
      statCard('📚', fa(bank.totals.total), 'Total questions', 'blue'),
      statCard('✅', fa(bank.totals.enabled), 'Active questions', 'green'),
      statCard('✍️', fa(perf.overall.attempted), 'Answers', 'indigo'),
      statCard('🎯', percent(perf.overall.successRate), 'Success rate', 'amber'),
      statCard('⭐', fa(perf.overall.points), 'Points earned', 'violet'),
    ]),
    overviewGroup('Study time', [
      statCard('☀️', durationText(stats.today), 'Today', 'amber'),
      statCard('🌙', durationText(stats.yesterday), 'Yesterday', 'indigo'),
      statCard('📅', durationText(stats.week), 'This week', 'blue'),
      statCard('🗓️', durationText(stats.month), 'This month', 'green'),
      statCard('⏳', durationText(stats.allTime), 'All time', 'violet'),
    ]),
    overviewGroup('Streaks & missions', [
      statCard('🔥', daysText(stats.currentStreak), 'Current streak', 'amber'),
      statCard('🏆', daysText(stats.bestStreak), 'Best streak', 'violet'),
      statCard('✅', fa(stats.activeDays), 'Active days', 'green'),
      statCard('🎮', fa(stats.missions), 'Missions played', 'blue'),
      statCard('⚡', durationText(stats.averagePerActiveDay), 'Average per day', 'indigo'),
      statCard('🥇', stats.bestDay ? durationText(stats.bestDay.ms) : '—', 'Best day', 'amber'),
    ]),
  );
}

/** Activity panel: the month calendar coloured by play time, with the selected day's total. */
function activitySection(root, now) {
  const sessions = loadSessions();
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
            class: `cal-cell lvl-${cell.level}${cell.key === todayKey ? ' today' : ''}${cell.key === shownKey ? ' selected' : ''}${cell.key > todayKey ? ' future' : ''}`,
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
        { class: 'cal' },
        h(
          'div',
          { class: 'cal-head' },
          h(
            'button',
            { type: 'button', class: 'cal-nav', 'aria-label': 'Previous month', onclick: () => moveMonth(-1) },
            '‹',
          ),
          // The year is written as a plain number (no thousands separator).
          h('strong', { class: 'cal-title' }, `${MONTH_NAMES[view.month]} ${view.year}`),
          h(
            'button',
            {
              type: 'button',
              class: 'cal-nav',
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

  const stats = activityStats(loadSessions(), Date.now());

  // The same action from the goal card and the review section: start a review game with these questions.
  const startReview = () => {
    requestReview(review.map((row) => row.questionId));
    location.hash = '#/play';
  };

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
      goalCard(stats, perf, review.length, startReview),

      overviewCard(bank, perf, stats),

      activitySection(root, Date.now()),

      section(
        '🗂️',
        'Question bank by topic and type',
        'How many questions are ready for each topic and type.',
        h(
          'div',
          { class: 'perf-list' },
          bankCard(bank.totals, 'All topics', categoryEntries, true),
          bank.byTopic.map((row) => bankCard(row, topicLabel(row.topic), categoryEntries)),
        ),
      ),

      section(
        '📈',
        'Performance by topic',
        null,
        perf.topics.length
          ? h(
              'div',
              { class: 'perf-list' },
              perf.topics.map((row) => perfCard(topicLabel(row.topic), null, row)),
            )
          : emptyNote('No answers recorded yet.'),
      ),

      section(
        '🧭',
        'Performance by topic and type',
        null,
        perf.cells.length
          ? h(
              'div',
              { class: 'perf-list' },
              perf.cells.map((row) => perfCard(topicLabel(row.topic), CATEGORIES[row.category] ?? row.category, row)),
            )
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
                    onclick: startReview,
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
