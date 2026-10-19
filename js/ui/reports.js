// Reports screen. Every number comes from question metadata or stored attempts.

import { listQuestions } from '../bank/repository.js';
import { CATEGORIES, topicLabel } from '../bank/schema.js';
import { bankSummary, performanceSummary, reviewList } from '../progress/report.js';
import { loadAttempts, resetProgress } from '../progress/tracker.js';
import { h, fa, percent, table, toast, badge } from './dom.js';
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
              if (!confirm('Clear all progress and answer history? The question bank will not change.')) return;
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
