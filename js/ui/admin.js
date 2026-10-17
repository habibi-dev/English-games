// Admin screen (question bank management): list, filters, enable/disable, add/edit/delete,
// JSON/CSV import and export, reset from the bank files. The game code is never touched here.

import {
  listQuestions,
  listBanks,
  saveQuestion,
  removeQuestion,
  getQuestion,
  importIntoStore,
  syncBanks,
} from '../bank/repository.js';
import {
  CATEGORIES,
  DIFFICULTIES,
  OPERATIONS,
  normalizeQuestion,
  validateQuestion,
  topicLabel,
} from '../bank/schema.js';
import { serializeQuestions } from '../bank/importer.js';
import { h, fa, toast, download, badge } from './dom.js';

const PAGE_SIZE = 60;
const filters = { topic: '', category: '', status: '', search: '' };
let limit = PAGE_SIZE;
let importReport = null;

export async function renderAdmin(root, rest = []) {
  if (rest[0] === 'new') return renderEditor(root, null);
  if (rest[0] === 'edit' && rest[1]) {
    const question = await getQuestion(decodeURIComponent(rest[1]));
    if (!question) {
      toast('سؤال پیدا نشد.', 'error');
      location.hash = '#/admin';
      return undefined;
    }
    return renderEditor(root, question);
  }
  return renderList(root);
}

// ---------- List ----------

async function renderList(root) {
  const body = h('div', { class: 'admin-body' });
  const ctx = {
    questions: [],
    banks: [],
    issues: new Map(),
    topicSelect: null,
    draw: () => body.replaceChildren(...listContent(ctx).filter(Boolean)),
    reload: null,
  };

  ctx.reload = async () => {
    const [questions, banks] = await Promise.all([listQuestions(), listBanks()]);
    ctx.questions = questions.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    ctx.banks = banks;
    ctx.issues = new Map(
      ctx.questions.flatMap((q) => {
        const { errors, warnings } = validateQuestion(q);
        const messages = [...errors, ...warnings];
        return messages.length ? [[q.id, messages]] : [];
      }),
    );
    fillTopicOptions(ctx);
    ctx.draw();
  };

  root.replaceChildren(
    h('section', { class: 'admin' }, h('h2', {}, 'بانک سؤال'), toolbar(ctx), body),
  );
  await ctx.reload();
}

function fillTopicOptions(ctx) {
  if (!ctx.topicSelect) return;
  const topics = [...new Set(ctx.questions.map((q) => q.topic))].sort();
  ctx.topicSelect.replaceChildren(
    h('option', { value: '' }, 'همه موضوع‌ها'),
    ...topics.map((topic) => h('option', { value: topic }, topicLabel(topic))),
  );
  ctx.topicSelect.value = filters.topic;
}

function toolbar(ctx) {
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,.csv,application/json,text/csv',
    class: 'hidden-input',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await handleImport(file, ctx);
    },
  });

  ctx.topicSelect = h('select', {
    'aria-label': 'موضوع',
    onchange: (event) => {
      filters.topic = event.target.value;
      limit = PAGE_SIZE;
      ctx.draw();
    },
  });

  const categorySelect = h(
    'select',
    {
      'aria-label': 'نوع سؤال',
      onchange: (event) => {
        filters.category = event.target.value;
        limit = PAGE_SIZE;
        ctx.draw();
      },
    },
    h('option', { value: '' }, 'همه نوع‌ها'),
    Object.entries(CATEGORIES).map(([value, label]) => h('option', { value, selected: filters.category === value }, label)),
  );

  const statusSelect = h(
    'select',
    {
      'aria-label': 'وضعیت',
      onchange: (event) => {
        filters.status = event.target.value;
        limit = PAGE_SIZE;
        ctx.draw();
      },
    },
    h('option', { value: '' }, 'فعال و غیرفعال'),
    h('option', { value: 'enabled', selected: filters.status === 'enabled' }, 'فقط فعال'),
    h('option', { value: 'disabled', selected: filters.status === 'disabled' }, 'فقط غیرفعال'),
  );

  const search = h('input', {
    type: 'search',
    placeholder: 'جستجو در شناسه، متن یا پاسخ',
    'aria-label': 'جستجو',
    value: filters.search,
    oninput: (event) => {
      filters.search = event.target.value.trim().toLowerCase();
      limit = PAGE_SIZE;
      ctx.draw();
    },
  });

  return h(
    'div',
    { class: 'card toolbar' },
    h('div', { class: 'filters' }, ctx.topicSelect, categorySelect, statusSelect, search),
    h(
      'div',
      { class: 'toolbar-actions' },
      h('a', { class: 'btn primary', href: '#/admin/new' }, 'سؤال جدید'),
      h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'ایمپورت JSON / CSV'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => exportAll(ctx, 'json') }, 'خروجی JSON'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => exportAll(ctx, 'csv') }, 'خروجی CSV'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => resetFromBanks(ctx) }, 'بازگردانی از فایل‌های بانک'),
    ),
    h(
      'p',
      { class: 'muted small' },
      'ایمپورت: سؤال‌هایی که شناسه‌شان در بانک هست به‌روز می‌شوند و بقیه اضافه می‌شوند. هر فایل را می‌توانی به صورت JSON یا CSV بدهی.',
    ),
    fileInput,
  );
}

function matches(question) {
  if (filters.topic && question.topic !== filters.topic) return false;
  if (filters.category && question.category !== filters.category) return false;
  if (filters.status === 'enabled' && question.enabled === false) return false;
  if (filters.status === 'disabled' && question.enabled !== false) return false;
  if (filters.search) {
    const haystack = `${question.id} ${question.question} ${question.expected_answer}`.toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

function listContent(ctx) {
  const filtered = ctx.questions.filter(matches);
  const shown = filtered.slice(0, limit);
  const enabledCount = ctx.questions.filter((q) => q.enabled !== false).length;

  const parts = [
    h(
      'p',
      { class: 'muted small' },
      `کل: ${fa(ctx.questions.length)} · فعال: ${fa(enabledCount)} · غیرفعال: ${fa(ctx.questions.length - enabledCount)} · ` +
        `نمایش: ${fa(filtered.length)} · دارای هشدار: ${fa(ctx.issues.size)}`,
    ),
  ];

  if (ctx.banks.length) {
    parts.push(
      h(
        'p',
        { class: 'muted small' },
        'بانک‌های نصب‌شده: ' +
          ctx.banks
            .map((b) => `${b.name} (نسخه ${b.version}، ${fa(b.count)} سؤال${b.invalid ? `، ${fa(b.invalid)} رد شده` : ''})`)
            .join(' · '),
      ),
    );
  }

  if (importReport) parts.push(importReportBox(ctx));
  if (!shown.length) parts.push(h('p', { class: 'empty' }, 'سؤالی با این فیلترها پیدا نشد.'));
  parts.push(...shown.map((q) => questionCard(q, ctx)));

  if (filtered.length > shown.length) {
    parts.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost wide',
          onclick: () => {
            limit += PAGE_SIZE;
            ctx.draw();
          },
        },
        `نمایش بیشتر (${fa(filtered.length - shown.length)} باقی‌مانده)`,
      ),
    );
  }
  return parts;
}

function questionCard(q, ctx) {
  const issues = ctx.issues.get(q.id);
  const enabled = q.enabled !== false;

  return h(
    'article',
    { class: `q-card${enabled ? '' : ' is-disabled'}` },
    h(
      'div',
      { class: 'q-head' },
      h('code', { class: 'q-id' }, q.id),
      badge(CATEGORIES[q.category] ?? q.category, 'accent'),
      badge(topicLabel(q.topic)),
      badge(DIFFICULTIES[q.difficulty] ?? q.difficulty),
      badge(`${fa(q.points)} امتیاز`),
    ),
    h('p', { class: 'q-text', dir: 'auto' }, q.question),
    h('p', { class: 'q-answer', dir: 'ltr' }, q.expected_answer),
    issues ? h('p', { class: 'warn-text', dir: 'auto' }, `هشدار: ${issues.join(' ')}`) : null,
    h(
      'div',
      { class: 'q-actions' },
      h(
        'label',
        { class: 'switch' },
        h('input', {
          type: 'checkbox',
          checked: enabled,
          onchange: (event) => toggleEnabled(q, event.target.checked, ctx),
        }),
        h('span', {}, enabled ? 'فعال' : 'غیرفعال'),
      ),
      h('a', { class: 'btn small', href: `#/admin/edit/${encodeURIComponent(q.id)}` }, 'ویرایش'),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => removeWithConfirm(q, ctx) }, 'حذف'),
    ),
  );
}

function importReportBox(ctx) {
  const report = importReport;
  return h(
    'div',
    { class: 'import-report' },
    h('strong', {}, `نتیجه‌ی ایمپورت «${report.fileName}»`),
    h(
      'p',
      {},
      `${fa(report.total)} رکورد در فایل بود؛ ${fa(report.added)} سؤال ذخیره شد و ${fa(report.invalid.length)} رکورد نامعتبر رد شد.`,
    ),
    report.invalid.length
      ? h(
          'ul',
          { class: 'error-list' },
          ...report.invalid
            .slice(0, 30)
            .map((item) =>
              h('li', {}, `ردیف ${fa(item.index + 1)}${item.id ? ` (${item.id})` : ''}: ${item.errors.join(' ')}`),
            ),
        )
      : null,
    h(
      'button',
      {
        type: 'button',
        class: 'btn ghost small',
        onclick: () => {
          importReport = null;
          ctx.draw();
        },
      },
      'بستن',
    ),
  );
}

async function toggleEnabled(question, enabled, ctx) {
  await saveQuestion({ ...question, enabled });
  toast(enabled ? 'سؤال فعال شد.' : 'سؤال غیرفعال شد.');
  await ctx.reload();
}

async function removeWithConfirm(question, ctx) {
  if (!confirm(`سؤال ${question.id} حذف شود؟ (اگر فقط می‌خواهی موقتاً کنار گذاشته شود، غیرفعالش کن.)`)) return;
  await removeQuestion(question.id);
  toast('سؤال حذف شد.');
  await ctx.reload();
}

async function handleImport(file, ctx) {
  try {
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : undefined;
    const result = await importIntoStore(await file.text(), format);
    importReport = {
      fileName: file.name,
      total: result.total,
      added: result.questions.length,
      invalid: result.invalid,
    };
    toast(`${fa(result.questions.length)} سؤال ذخیره شد.`);
  } catch (error) {
    toast(`فایل خوانده نشد: ${error.message}`, 'error');
  }
  await ctx.reload();
}

function exportAll(ctx, format) {
  const stamp = new Date().toISOString().slice(0, 10);
  download(
    `english-grammar-questions-${stamp}.${format}`,
    serializeQuestions(ctx.questions, format),
    format === 'csv' ? 'text/csv' : 'application/json',
  );
}

async function resetFromBanks(ctx) {
  if (!confirm('سؤال‌ها از روی فایل‌های بانک دوباره نوشته می‌شوند (بر اساس شناسه). ویرایش‌های همان سؤال‌ها از بین می‌رود. ادامه می‌دهی؟')) {
    return;
  }
  const { loaded, errors } = await syncBanks({ force: true });
  errors.forEach((e) => toast(`بانک ${e.bank}: ${e.message}`, 'error'));
  const total = loaded.reduce((sum, bank) => sum + bank.count, 0);
  toast(`${fa(total)} سؤال از فایل‌های بانک بارگذاری شد.`);
  await ctx.reload();
}

// ---------- Editor ----------

async function suggestId() {
  const all = await listQuestions();
  const max = all.reduce((highest, q) => {
    const n = parseInt(String(q.id).replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > highest ? n : highest;
  }, 0);
  return `q${String(max + 1).padStart(4, '0')}`;
}

const splitLines = (text) =>
  String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

async function renderEditor(root, existing) {
  const isNew = !existing;
  const data = existing ?? {};
  const suggestedId = isNew ? await suggestId() : '';
  const errorBox = h('ul', { class: 'error-list', hidden: true, role: 'alert' });
  const typedFields = [];

  const select = (options, value) =>
    h(
      'select',
      {},
      options.map(([optionValue, label]) => h('option', { value: optionValue, selected: optionValue === value }, label)),
    );
  const textarea = (value, { rows = 2, ltr = false } = {}) =>
    h('textarea', { rows, value: value ?? '', dir: ltr ? 'ltr' : 'auto' });
  const textInput = (value, { ltr = false } = {}) =>
    h('input', { type: 'text', value: value ?? '', dir: ltr ? 'ltr' : 'auto', autocomplete: 'off' });

  const f = {
    id: h('input', { type: 'text', value: data.id ?? suggestedId, readOnly: !isNew, dir: 'ltr', autocomplete: 'off' }),
    category: select(Object.entries(CATEGORIES), data.category ?? 'quick_translation'),
    topic: textInput(data.topic ?? 'to_be', { ltr: true }),
    difficulty: select(Object.entries(DIFFICULTIES), data.difficulty ?? 'easy'),
    question: textarea(data.question, { rows: 2 }),
    expected: textInput(data.expected_answer, { ltr: true }),
    accepted: textarea((data.accepted_answers ?? []).join('\n'), { rows: 3, ltr: true }),
    explanation: textarea(data.explanation, { rows: 2 }),
    hint: textInput(data.hint),
    glossary: textarea((data.glossary ?? []).map((e) => `${e.word} = ${e.meaning}`).join('\n'), { rows: 3 }),
    points: h('input', { type: 'number', min: 1, value: data.points ?? 10 }),
    time_limit: h('input', { type: 'number', min: 1, value: data.time_limit ?? 20 }),
    enabled: h('input', { type: 'checkbox', checked: data.enabled !== false }),
    word_bank: textarea((data.word_bank ?? []).join('\n'), { rows: 6, ltr: true }),
    incorrect: textInput(data.incorrect_sentence, { ltr: true }),
    options: textarea((data.options ?? []).join('\n'), { rows: 4, ltr: true }),
    operation: select(Object.entries(OPERATIONS), data.operation ?? 'negative'),
  };

  const field = (labelText, control, { wide = false, only = null, note = null } = {}) => {
    const wrapper = h(
      'div',
      { class: `field${wide ? ' wide' : ''}` },
      h('span', { class: 'field-label' }, labelText),
      control,
      note ? h('small', { class: 'muted' }, note) : null,
    );
    if (only) typedFields.push({ wrapper, only });
    return wrapper;
  };

  const updateVisibility = () => {
    for (const { wrapper, only } of typedFields) wrapper.hidden = only !== f.category.value;
  };
  f.category.addEventListener('change', updateVisibility);

  const save = async () => {
    const question = normalizeQuestion({
      id: f.id.value,
      category: f.category.value,
      topic: f.topic.value,
      difficulty: f.difficulty.value,
      question: f.question.value,
      expected_answer: f.expected.value,
      accepted_answers: splitLines(f.accepted.value),
      explanation: f.explanation.value,
      hint: f.hint.value,
      glossary: splitLines(f.glossary.value),
      // Keep the bank the question came from, so it stays in its bank after editing.
      bank: data.bank,
      points: f.points.value,
      time_limit: f.time_limit.value,
      enabled: f.enabled.checked,
      word_bank: splitLines(f.word_bank.value),
      incorrect_sentence: f.incorrect.value,
      options: splitLines(f.options.value),
      operation: f.operation.value,
    });

    const { errors, warnings } = validateQuestion(question);
    if (isNew && (await getQuestion(question.id))) {
      errors.push(`شناسه «${question.id}» از قبل وجود دارد.`);
    }
    if (errors.length > 0) {
      errorBox.hidden = false;
      errorBox.replaceChildren(...errors.map((message) => h('li', {}, message)));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    await saveQuestion(question);
    toast(
      warnings.length ? `ذخیره شد؛ هشدار: ${warnings.join(' ')}` : 'سؤال ذخیره شد.',
      warnings.length ? 'warn' : 'info',
    );
    location.hash = '#/admin';
  };

  const remove = async () => {
    if (!confirm(`سؤال ${data.id} حذف شود؟`)) return;
    await removeQuestion(data.id);
    toast('سؤال حذف شد.');
    location.hash = '#/admin';
  };

  root.replaceChildren(
    h(
      'section',
      { class: 'card editor' },
      h('h2', {}, isNew ? 'سؤال جدید' : `ویرایش ${data.id}`),
      h('p', { class: 'muted small' }, 'فیلدهایی که مخصوص نوع سؤال نیستند پنهان می‌شوند و ذخیره نمی‌شوند.'),
      errorBox,
      h(
        'div',
        { class: 'form-grid' },
        field('شناسه (id)', f.id, { note: isNew ? 'یکتا باشد؛ پیشنهادی است.' : 'شناسه قابل تغییر نیست.' }),
        field('نوع سؤال (category)', f.category),
        field('موضوع (topic)', f.topic, { note: 'مثلاً to_be یا do_does؛ موضوع جدید هم قابل قبول است.' }),
        field('سطح (difficulty)', f.difficulty),
        field('متن سؤال', f.question, { wide: true }),
        field('پاسخ اصلی (expected_answer)', f.expected, { wide: true }),
        field('پاسخ‌های قابل قبول (هر خط یکی)', f.accepted, {
          wide: true,
          note: 'پاسخ اصلی خودکار اضافه می‌شود. هیچ پاسخی غیر از این‌ها پذیرفته نمی‌شود.',
        }),
        field('توضیح (explanation)', f.explanation, { wide: true, note: 'در پاسخ اشتباه نمایش داده می‌شود.' }),
        field('راهنما (hint)', f.hint, { wide: true }),
        field('کلمات کلیدی و معنی (هر خط: word = معنی)', f.glossary, {
          wide: true,
          note: 'کلمه‌ای که اینجا بیاید در متن سؤال قابل لمس می‌شود و معنی‌اش نشان داده می‌شود.',
        }),
        field('امتیاز (points)', f.points),
        field('زمان (time_limit، ثانیه)', f.time_limit),
        field('وضعیت', h('label', { class: 'switch' }, f.enabled, h('span', {}, 'فعال'))),
        field('کلمات جمله (هر خط یک کلمه)', f.word_bank, { wide: true, only: 'sentence_builder' }),
        field('جمله‌ی اشتباه (incorrect_sentence)', f.incorrect, { wide: true, only: 'grammar_correction' }),
        field('گزینه‌ها (هر خط یکی)', f.options, { wide: true, only: 'multiple_choice' }),
        field('نوع تبدیل (operation)', f.operation, { only: 'positive_negative_question' }),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: save }, 'ذخیره'),
        h('a', { class: 'btn ghost', href: '#/admin' }, 'انصراف'),
        isNew ? null : h('button', { type: 'button', class: 'btn danger', onclick: remove }, 'حذف'),
      ),
    ),
  );

  updateVisibility();
}
