// Question bank screen: import and export only, plus a guide and prompt for writing questions with an AI.
// Questions are written in files and imported here. The game code is never touched here.

import { listQuestions, importIntoStore } from '../bank/repository.js';
import { serializeQuestions } from '../bank/importer.js';
import { QUESTION_PROMPT } from '../bank/question-prompt.js';
import { h, fa, toast, download } from './dom.js';

// Result of the last import, shown until it is closed.
let importReport = null;

export async function renderAdmin(root) {
  const questions = await listQuestions();

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,.csv,application/json,text/csv',
    class: 'hidden-input',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await handleImport(file, root);
    },
  });

  root.replaceChildren(
    h(
      'section',
      { class: 'admin' },
      h('h2', {}, 'Question bank'),
      h('p', { class: 'muted small' }, `${fa(questions.length)} questions are stored on this device.`),

      h(
        'div',
        { class: 'card admin-card' },
        h('h3', {}, 'Import'),
        h(
          'p',
          { class: 'muted small' },
          'Import questions from a JSON or CSV file. Questions whose id already exists are updated, and the rest are added.',
        ),
        h(
          'div',
          { class: 'toolbar-actions' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => fileInput.click() }, 'Import JSON / CSV'),
        ),
        importReport ? importReportBox(root) : null,
        fileInput,
      ),

      h(
        'div',
        { class: 'card admin-card' },
        h('h3', {}, 'Export'),
        h('p', { class: 'muted small' }, 'Download every question in the bank.'),
        h(
          'div',
          { class: 'toolbar-actions' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => exportAll('json') }, 'Export JSON'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => exportAll('csv') }, 'Export CSV'),
        ),
      ),

      h(
        'div',
        { class: 'card admin-card' },
        h('h3', {}, 'Guide: writing questions with AI'),
        h(
          'p',
          { class: 'muted small' },
          'Copy this prompt into an AI assistant and tell it which book, lesson and topic to write, how many questions you want and which exercise types to use. Save its answer as a .json file and import it above.',
        ),
        h('pre', { class: 'prompt-box' }, QUESTION_PROMPT),
        h(
          'div',
          { class: 'toolbar-actions' },
          h('button', { type: 'button', class: 'btn primary', onclick: copyPrompt }, 'Copy prompt'),
        ),
      ),
    ),
  );
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(QUESTION_PROMPT);
    toast('Prompt copied.');
  } catch {
    toast('Copying is not available here. Select the prompt text and copy it manually.', 'warn');
  }
}

function importReportBox(root) {
  const report = importReport;
  return h(
    'div',
    { class: 'import-report' },
    h('strong', {}, `Import result for "${report.fileName}"`),
    h(
      'p',
      {},
      `${fa(report.total)} records in the file; ${fa(report.added)} questions saved and ${fa(report.invalid.length)} invalid records rejected.`,
    ),
    report.invalid.length
      ? h(
          'ul',
          { class: 'error-list' },
          ...report.invalid
            .slice(0, 30)
            .map((item) =>
              h('li', {}, `Row ${fa(item.index + 1)}${item.id ? ` (${item.id})` : ''}: ${item.errors.join(' ')}`),
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
          renderAdmin(root);
        },
      },
      'Close',
    ),
  );
}

async function handleImport(file, root) {
  try {
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : undefined;
    const result = await importIntoStore(await file.text(), format);
    importReport = {
      fileName: file.name,
      total: result.total,
      added: result.questions.length,
      invalid: result.invalid,
    };
    toast(`${fa(result.questions.length)} questions saved.`);
  } catch (error) {
    toast(`Could not read file: ${error.message}`, 'error');
  }
  await renderAdmin(root);
}

async function exportAll(format) {
  const questions = await listQuestions();
  if (questions.length === 0) {
    toast('The question bank is empty.', 'warn');
    return;
  }
  questions.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const stamp = new Date().toISOString().slice(0, 10);
  download(
    `english-grammar-questions-${stamp}.${format}`,
    serializeQuestions(questions, format),
    format === 'csv' ? 'text/csv' : 'application/json',
  );
}
