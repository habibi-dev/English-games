// Reports screen. Every number comes from question metadata or stored attempts.

import { listQuestions } from '../bank/repository.js';
import { CATEGORIES, topicLabel } from '../bank/schema.js';
import { bankSummary, performanceSummary, reviewList } from '../progress/report.js';
import { loadAttempts, resetProgress } from '../progress/tracker.js';
import { h, fa, percent, table, stat, toast, ltr } from './dom.js';

export async function renderReports(root) {
  const [questions, attempts] = await Promise.all([listQuestions(), loadAttempts()]);
  const bank = bankSummary(questions);
  const perf = performanceSummary(attempts);
  const review = reviewList(attempts);
  const categoryEntries = Object.entries(CATEGORIES);

  const bankRows = [...bank.byTopic, { topic: 'totals', label: 'جمع کل', ...bank.totals }].map((row) => [
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
    percent(row.successRate),
  ]);

  const cellRows = perf.cells.map((row) => [
    topicLabel(row.topic),
    CATEGORIES[row.category] ?? row.category,
    fa(row.attempted),
    fa(row.correct),
    fa(row.wrong),
    percent(row.successRate),
  ]);

  const reviewRows = review.map((row) => [
    h('span', { dir: 'auto' }, row.question),
    ltr(row.expected_answer),
    topicLabel(row.topic),
    CATEGORIES[row.category] ?? row.category,
    fa(row.wrong) + ' / ' + fa(row.attempted),
    row.lastCorrect ? 'درست' : 'غلط',
  ]);

  root.replaceChildren(
    h(
      'section',
      { class: 'reports' },
      h('h2', {}, 'گزارش‌ها'),
      h(
        'div',
        { class: 'stats-grid' },
        stat('کل سؤال‌ها', fa(bank.totals.total)),
        stat('سؤال فعال', fa(bank.totals.enabled)),
        stat('پاسخ‌ها', fa(perf.overall.attempted)),
        stat('درصد موفقیت', percent(perf.overall.successRate)),
        stat('امتیاز کسب‌شده', fa(perf.overall.points)),
      ),

      h('h3', {}, 'بانک سؤال بر اساس موضوع و نوع'),
      table(['موضوع', 'کل', 'فعال', 'غیرفعال', ...categoryEntries.map(([, label]) => label)], bankRows),

      h('h3', {}, 'عملکرد بر اساس موضوع'),
      perf.topics.length
        ? table(['موضوع', 'پاسخ', 'درست', 'اشتباه', 'زمان تمام شد', 'موفقیت'], topicRows)
        : h('p', { class: 'muted' }, 'هنوز پاسخی ثبت نشده است.'),

      h('h3', {}, 'عملکرد بر اساس موضوع و نوع'),
      perf.cells.length
        ? table(['موضوع', 'نوع', 'پاسخ', 'درست', 'اشتباه', 'موفقیت'], cellRows)
        : h('p', { class: 'muted' }, 'هنوز پاسخی ثبت نشده است.'),

      h('h3', {}, `سؤال‌های نیازمند مرور مجدد (${fa(review.length)})`),
      h(
        'p',
        { class: 'muted small' },
        'سؤالی که آخرین بار اشتباه بوده، یا دو بار و بیشتر اشتباه شده و بیش از نیمی از پاسخ‌هایش غلط بوده است.',
      ),
      review.length
        ? table(['سؤال', 'پاسخ صحیح', 'موضوع', 'نوع', 'اشتباه / کل', 'آخرین پاسخ'], reviewRows)
        : h('p', { class: 'muted' }, 'فعلاً سؤالی برای مرور نداریم.'),

      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn danger',
            onclick: async () => {
              if (!confirm('تمام پیشرفت و تاریخچه‌ی پاسخ‌ها پاک شود؟ بانک سؤال تغییری نمی‌کند.')) return;
              await resetProgress();
              toast('پیشرفت پاک شد.');
              renderReports(root);
            },
          },
          'پاک کردن پیشرفت',
        ),
      ),
    ),
  );
}
