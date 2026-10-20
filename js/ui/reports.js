// Reports screen. Every number comes from question metadata or stored attempts.
// Five tabs, so each view shows one kind of information:
// Home (today's goal and the last seven days), Activity (calendar and play time), Results (by topic and type),
// Questions (the question bank) and Review (answers to look at again).

import { listQuestions } from '../bank/repository.js';
import { CATEGORIES, topicLabel } from '../bank/schema.js';
import { bankSummary, performanceSummary, reviewList } from '../progress/report.js';
import { loadAttempts } from '../progress/tracker.js';
import {
  loadSessions,
  msByDay,
  activityStats,
  calendarMonth,
  dayKey,
  WEEK_STARTS_ON,
  DAILY_GOAL_MS,
  LEVEL_LIMITS_MIN,
} from '../progress/activity.js';
import { h, fa, percent, badge, scrollToTop } from './dom.js';
import { speakButtons, questionSpeakButton } from './speech-out.js';
import { splitPrompt } from './prompt.js';
import { requestReview } from './review-handoff.js';

// The tabs: key, icon and label. One is shown at a time.
const TABS = [
  ['home', '🏠', 'Home'],
  ['activity', '📅', 'Activity'],
  ['results', '📈', 'Results'],
  ['questions', '🗂️', 'Questions'],
  ['review', '🔁', 'Review'],
];

// The tab on screen and the calendar state. Kept while the app runs, so a re-render stays on the same view.
let activeTab = 'home';
let calendarView = null;
let selectedDay = null;

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Legend for the calendar colours, built from the same limits as levelFor() in js/progress/activity.js.
const [lowLimit, midLimit, highLimit] = LEVEL_LIMITS_MIN;
const LEGEND = [
  [0, 'None'],
  [1, `<${lowLimit}m`],
  [2, `${lowLimit}–${midLimit}m`],
  [3, `${midLimit / 60}–${highLimit / 60}h`],
  [4, `${highLimit / 60}h+`],
];

/** Success tone: green from 75%, amber from 50%, red below that. */
function toneFor(ratio) {
  if (ratio == null) return 'none';
  const pct = Math.round(ratio * 100);
  return pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
}

/** Play time in hours and minutes, e.g. "2 h 15 min", "1 h", "45 min". */
function durationText(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${fa(minutes)} min`;
  return minutes === 0 ? `${fa(hours)} h` : `${fa(hours)} h ${fa(minutes)} min`;
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

const emptyNote = (text) => h('p', { class: 'report-empty' }, text);

/** A card: an optional title and hint, then its content. */
function card(title, hint, ...content) {
  return h(
    'section',
    { class: 'rp-card' },
    title
      ? h('header', { class: 'rp-card-head' }, h('h3', {}, title), hint ? h('p', { class: 'muted small' }, hint) : null)
      : null,
    ...content,
  );
}

/** One big number with its label, in a tile. */
function tile(icon, value, label) {
  return h(
    'div',
    { class: 'rp-tile' },
    h('span', { class: 'rp-tile-icon', 'aria-hidden': 'true' }, icon),
    h('strong', {}, value),
    h('span', { class: 'rp-tile-label' }, label),
  );
}

/** Label and value rows, one per line, the label on the left and the value on the right. */
function statList(rows) {
  return h(
    'dl',
    { class: 'rp-list' },
    rows.map(([label, value]) => h('div', { class: 'rp-row' }, h('dt', {}, label), h('dd', {}, value))),
  );
}

/** One label over one number inside the results and bank cards. */
const metric = (label, value, tone = '') =>
  h('div', { class: `perf-metric ${tone}`.trim() }, h('dt', {}, label), h('dd', {}, fa(value)));

/** The top of a result row: its name, the success pill, and the bar under it. */
function rateHead(title, sub, row) {
  const tone = toneFor(row.successRate);
  const pct = row.successRate == null ? 0 : Math.round(row.successRate * 100);
  return [
    h(
      'span',
      { class: 'perf-head' },
      h('span', { class: 'perf-titles' }, h('strong', {}, title), sub ? h('span', { class: 'perf-sub' }, sub) : null),
      h('span', { class: `perf-pill ${tone}` }, percent(row.successRate)),
    ),
    h('span', { class: 'perf-bar', 'aria-hidden': 'true' }, h('span', { class: `perf-fill ${tone}`, style: `width: ${pct}%` })),
  ];
}

/** The tab bar. The review tab also shows how many questions are waiting. */
function tabBar(reviewCount, onSelect) {
  return h(
    'nav',
    { class: 'rp-tabs', 'aria-label': 'Report sections' },
    TABS.map(([key, icon, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: `rp-tab${key === activeTab ? ' active' : ''}`,
          'aria-pressed': key === activeTab ? 'true' : 'false',
          onclick: () => onSelect(key),
        },
        h('span', { class: 'rp-tab-icon', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'rp-tab-label' }, label),
        key === 'review' && reviewCount > 0 ? h('span', { class: 'rp-tab-count' }, fa(reviewCount)) : null,
      ),
    ),
  );
}

/** Today's goal: the hero card with the progress bar, the main numbers, and one main action. */
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

/** The last seven calendar days, oldest first, each with its play time. */
function lastSevenDays(totals, now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() - (6 - i));
    const key = dayKey(day.getTime());
    return { key, weekday: WEEKDAY_NAMES[day.getDay()], ms: totals.get(key) ?? 0, isToday: i === 6 };
  });
}

/** One circle per day: a ring that fills towards the daily goal, and a tick once the goal is reached. */
function weekCard(totals, now) {
  const days = lastSevenDays(totals, now);
  const reached = days.filter((day) => day.ms >= DAILY_GOAL_MS).length;
  const total = days.reduce((sum, day) => sum + day.ms, 0);
  return card(
    'Last 7 days',
    `${fa(reached)} of 7 days reached the goal, ${durationText(total)} in total`,
    h(
      'div',
      { class: 'rp-week' },
      days.map((day) => {
        const done = day.ms >= DAILY_GOAL_MS;
        const pct = Math.min(Math.round((day.ms / DAILY_GOAL_MS) * 100), 100);
        const minutes = Math.round(day.ms / 60000);
        return h(
          'div',
          {
            class: `rp-day${done ? ' done' : ''}${day.isToday ? ' today' : ''}`,
            title: `${dayLabel(day.key)}: ${durationText(day.ms)}`,
          },
          h('span', { class: 'rp-day-name' }, day.weekday),
          h(
            'span',
            { class: 'rp-day-ring', style: `--p: ${pct}%` },
            h('span', { class: 'rp-day-core' }, done ? '✓' : minutes > 0 ? fa(minutes) : '–'),
          ),
        );
      }),
    ),
  );
}

/** Home: the goal, the last seven days, and the totals. */
function homeView(ctx) {
  return h(
    'div',
    { class: 'rp-view' },
    goalCard(ctx.stats, ctx.perf, ctx.reviewCount, ctx.startReview),
    card(
      'Totals',
      null,
      h(
        'div',
        { class: 'rp-tiles' },
        tile('✍️', fa(ctx.perf.overall.attempted), 'Answers'),
        tile('🎮', fa(ctx.stats.missions), 'Missions'),
        tile('📅', fa(ctx.stats.activeDays), 'Active days'),
        tile('🏆', daysText(ctx.stats.bestStreak), 'Best streak'),
      ),
    ),
    weekCard(ctx.totals, ctx.now),
  );
}

/** The month calendar, coloured by play time. Tap a day to see its total. */
function calendarCard(root, totals, sessions, now) {
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

  return card(
    'Calendar',
    'Each day is coloured by its play time. Tap a day to see it.',
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
  );
}

/** Activity: the calendar, then study time and streaks as short lists. */
function activityView(ctx) {
  const { stats } = ctx;
  return h(
    'div',
    { class: 'rp-view' },
    calendarCard(ctx.root, ctx.totals, ctx.sessions, ctx.now),
    card(
      'Study time',
      'Time counts from the start of a mission until it ends, or until you leave it.',
      statList([
        ['Today', durationText(stats.today)],
        ['Yesterday', durationText(stats.yesterday)],
        ['This week', durationText(stats.week)],
        ['This month', durationText(stats.month)],
        ['All time', durationText(stats.allTime)],
        ['Average per active day', durationText(stats.averagePerActiveDay)],
        ['Best day', stats.bestDay ? `${dayLabel(stats.bestDay.key)}, ${durationText(stats.bestDay.ms)}` : '—'],
      ]),
    ),
    card(
      'Streaks and missions',
      null,
      statList([
        ['Current streak', daysText(stats.currentStreak)],
        ['Best streak', daysText(stats.bestStreak)],
        ['Active days', fa(stats.activeDays)],
        ['Missions played', fa(stats.missions)],
        ['Longest mission', durationText(stats.longestMission)],
      ]),
    ),
  );
}

/** One question type inside a topic: its success rate, and the counts behind it. */
function typeRow(row) {
  return h(
    'li',
    { class: 'rp-type' },
    ...rateHead(CATEGORIES[row.category] ?? row.category, null, row),
    h('span', { class: 'rp-type-meta' }, `${fa(row.attempted)} answers · ${fa(row.correct)} correct · ${fa(row.wrong)} wrong`),
  );
}

/** One topic as a collapsible group: its success rate on the summary, the question types inside. */
function topicGroup(row, types, open) {
  return h(
    'details',
    { class: 'rp-group', open },
    h('summary', { class: 'rp-group-summary' }, ...rateHead(topicLabel(row.topic), `${fa(row.attempted)} answers`, row)),
    h('ul', { class: 'rp-types' }, types.map((type) => typeRow(type))),
  );
}

/** Results: the overall rate, then one group per topic with its question types. */
function resultsView(perf) {
  if (perf.overall.attempted === 0) {
    return h('div', { class: 'rp-view' }, emptyNote('No answers recorded yet. Your results appear here after your first mission.'));
  }
  const topics = [...perf.topics].sort((a, b) => b.attempted - a.attempted);
  return h(
    'div',
    { class: 'rp-view' },
    card(
      null,
      null,
      h(
        'div',
        { class: 'rp-overall' },
        ...rateHead('All topics', 'Success rate', perf.overall),
        h(
          'dl',
          { class: 'perf-metrics' },
          metric('Answers', perf.overall.attempted),
          metric('Correct', perf.overall.correct, 'ok'),
          metric('Wrong', perf.overall.wrong, 'bad'),
          metric('Timed out', perf.overall.timeouts),
        ),
      ),
    ),
    card(
      'By topic',
      'Tap a topic to see how each question type is going.',
      h(
        'div',
        { class: 'rp-groups' },
        topics.map((row, i) =>
          topicGroup(
            row,
            perf.cells.filter((cell) => cell.topic === row.topic).sort((a, b) => b.attempted - a.attempted),
            i === 0,
          ),
        ),
      ),
    ),
  );
}

/** The question types of a topic (or of the whole bank) as chips, skipping the types with no questions. */
function bankChips(row, categoryEntries) {
  const shown = categoryEntries.filter(([key]) => (row.byCategory[key] ?? 0) > 0);
  return shown.length
    ? h(
        'div',
        { class: 'bank-chips' },
        shown.map(([key, label]) => h('span', { class: 'bank-chip' }, `${label} `, h('strong', {}, fa(row.byCategory[key])))),
      )
    : emptyNote('No questions yet.');
}

/** One topic of the bank as a collapsible group: its active count on the summary, the types inside. */
function bankGroup(row, categoryEntries, open) {
  return h(
    'details',
    { class: 'rp-group', open },
    h(
      'summary',
      { class: 'rp-group-summary' },
      h(
        'span',
        { class: 'perf-head' },
        h('span', { class: 'perf-titles' }, h('strong', {}, topicLabel(row.topic)), h('span', { class: 'perf-sub' }, `${fa(row.total)} questions`)),
        h('span', { class: 'perf-pill info' }, `${fa(row.enabled)} active`),
      ),
    ),
    h('div', { class: 'rp-types' }, bankChips(row, categoryEntries)),
  );
}

/** Questions: the bank totals, then one group per topic. */
function questionsView(bank) {
  const categoryEntries = Object.entries(CATEGORIES);
  return h(
    'div',
    { class: 'rp-view' },
    card(
      'All topics',
      'How many questions are ready for each topic and type.',
      h(
        'dl',
        { class: 'perf-metrics three' },
        metric('Total', bank.totals.total),
        metric('Active', bank.totals.enabled, 'ok'),
        metric('Inactive', bank.totals.disabled),
      ),
      bankChips(bank.totals, categoryEntries),
    ),
    card(
      'By topic',
      'Tap a topic to see its question types.',
      h(
        'div',
        { class: 'rp-groups' },
        bank.byTopic.map((row, i) => bankGroup(row, categoryEntries, i === 0)),
      ),
    ),
  );
}

/** The review cards: one per question that needs another look. */
function reviewCards(review, sentenceById) {
  return review.map((row) => {
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
}

/** Review: the questions whose answers need another look, with a button to practise them all. */
function reviewView(review, cards, startReview) {
  return h(
    'div',
    { class: 'rp-view' },
    card(
      `Questions to review again (${fa(review.length)})`,
      'Questions whose last answer was wrong, or that were answered wrong at least twice with more than half of the answers wrong.',
      review.length
        ? h(
            'div',
            { class: 'rp-review' },
            h('button', { type: 'button', class: 'btn primary', onclick: startReview }, `▶ Start review (${fa(review.length)})`),
            h('div', { class: 'review-list' }, cards),
          )
        : emptyNote('No questions to review for now.'),
    ),
  );
}

export async function renderReports(root) {
  const [questions, attempts] = await Promise.all([listQuestions(), loadAttempts()]);
  const now = Date.now();
  const sessions = loadSessions();
  const totals = msByDay(sessions);
  const stats = activityStats(sessions, now);
  const bank = bankSummary(questions);
  const perf = performanceSummary(attempts);
  const review = reviewList(attempts);
  // Older attempts were saved without the sentence, so it is also read from the question bank.
  const sentenceById = new Map(questions.map((q) => [q.id, q.incorrect_sentence]));

  // The same action from the goal card and the review tab: start a review game with these questions.
  const startReview = () => {
    requestReview(review.map((row) => row.questionId));
    location.hash = '#/play';
  };
  const selectTab = (key) => {
    activeTab = key;
    // A new tab is a new page of content: it opens at the top.
    scrollToTop();
    renderReports(root);
  };

  const ctx = { root, now, sessions, totals, stats, perf, reviewCount: review.length, startReview };
  const views = {
    home: () => homeView(ctx),
    activity: () => activityView(ctx),
    results: () => resultsView(perf),
    questions: () => questionsView(bank),
    review: () => reviewView(review, reviewCards(review, sentenceById), startReview),
  };
  const view = (views[activeTab] ?? views.home)();

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
      tabBar(review.length, selectTab),
      view,
    ),
  );
}
