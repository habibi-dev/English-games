// Settings screen (opened from the gear in the header). Three sections:
//   Sounds: the win and lose sound effects, each on or off, with a volume and a preview;
//           and the spoken English that is read aloud after each answer.
//   Progress: export the answers so far as a signed text, import it on another device, or clear it all.
//   Question bank: import and export, plus a guide and prompt for writing questions with an AI.
// Questions are written in files and imported here. The game code is never touched here.

import { listQuestions, importIntoStore } from '../bank/repository.js';
import { serializeQuestions } from '../bank/importer.js';
import { QUESTION_PROMPT } from '../bank/question-prompt.js';
import { getSoundSettings, saveSoundSettings } from '../storage/settings.js';
import { loadAttempts, importAttempts, resetProgress } from '../progress/tracker.js';
import { loadSessions, addSessions } from '../progress/activity.js';
import { encodeBackup, decodeBackup } from '../progress/backup.js';
import { playWinSound, playLoseSound, playTimeoutSound, playResultJingle } from './sounds.js';
import { h, fa, toast, download, confirmDialog } from './dom.js';

const SECTIONS = [
  ['sounds', 'Sounds'],
  ['progress', 'Progress'],
  ['questions', 'Question bank'],
];

// The section shown on the settings screen. Kept while the app runs, so re-rendering keeps the same section.
let activeSection = 'sounds';

// Result of the last import, shown until it is closed.
let importReport = null;

export async function renderAdmin(root) {
  const body =
    activeSection === 'sounds'
      ? soundsSection()
      : activeSection === 'progress'
        ? progressSection()
        : await questionBankSection(root);

  root.replaceChildren(
    h(
      'section',
      { class: 'admin' },
      h('h2', {}, 'Settings'),
      h(
        'div',
        { class: 'settings-tabs', role: 'tablist' },
        SECTIONS.map(([key, label]) =>
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: key === activeSection ? 'settings-tab active' : 'settings-tab',
              'aria-selected': key === activeSection ? 'true' : 'false',
              onclick: () => {
                activeSection = key;
                renderAdmin(root);
              },
            },
            label,
          ),
        ),
      ),
      body,
    ),
  );
}

/** Sound effects: the win and lose sounds, each with its own switch, and one master switch above them. */
function soundsSection() {
  const settings = getSoundSettings();

  const toggle = (key, label, hint) =>
    h(
      'label',
      { class: 'sound-row' },
      h('input', {
        type: 'checkbox',
        checked: settings[key],
        onchange: (event) => saveSoundSettings({ [key]: event.target.checked }),
      }),
      h('span', { class: 'sound-row-text' }, h('strong', {}, label), h('small', { class: 'muted' }, hint)),
    );

  const volumeLabel = h('span', { class: 'muted small' }, `${fa(Math.round(settings.volume * 100))}%`);

  const effects = h(
    'section',
    { class: 'card admin-card' },
    h('h3', {}, 'Sound effects'),
    h(
      'p',
      { class: 'muted small' },
      'A right answer plays the win sound. A wrong answer plays the lose sound. A time-out plays the time-up sound.',
    ),
    toggle('enabled', 'Sound effects', 'Turns all sounds on or off.'),
    toggle('win', 'Win sound', 'A soft rising chime.'),
    toggle('lose', 'Lose sound', 'A soft, slow "aww" from a small group.'),
    toggle('timeout', 'Time-up sound', 'Two short falling blips when the time runs out.'),
    toggle('vibrate', 'Vibration', 'A long buzz for a wrong answer or time-up, one short tap for a right answer, and a pattern at the end of a game. Phones only.'),
    h(
      'label',
      { class: 'sound-volume' },
      h('span', { class: 'sound-row-text' }, h('strong', {}, 'Volume'), volumeLabel),
      h('input', {
        type: 'range',
        min: '0',
        max: '100',
        step: '5',
        value: String(Math.round(settings.volume * 100)),
        'aria-label': 'Sound volume',
        oninput: (event) => {
          const volume = Number(event.target.value) / 100;
          saveSoundSettings({ volume });
          volumeLabel.textContent = `${fa(Math.round(volume * 100))}%`;
        },
      }),
    ),
    h(
      'div',
      { class: 'toolbar-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => playWinSound() }, '▶ Play win sound'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => playLoseSound() }, '▶ Play lose sound'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => playTimeoutSound() }, '▶ Play time-up sound'),
    ),
    // One jingle per result look, from the lowest (Keep going) to the top (Perfect score).
    h('p', { class: 'muted small' }, 'Results jingles, one for each result look:'),
    h(
      'div',
      { class: 'toolbar-actions' },
      ['Keep going', 'Getting there', 'Good work', 'Excellent', 'Perfect score'].map((label, tier) =>
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => playResultJingle(tier) }, `▶ ${label}`),
      ),
    ),
    h('p', { class: 'muted small' }, 'The preview plays even when sound effects are off.'),
  );

  const spoken = h(
    'section',
    { class: 'card admin-card' },
    h('h3', {}, 'Spoken English'),
    h(
      'p',
      { class: 'muted small' },
      'The English sentence in the result window can be read aloud after each answer, slowly. Nothing plays after a time-out.',
    ),
    toggle('autoSpeak', 'Read the sentence after the answer', 'Plays slowly when a right or wrong answer is shown.'),
  );

  return h('div', { class: 'settings-section' }, effects, spoken);
}

/** Progress: the answers so far as one signed text, to move to another device, and the import of such a text. */
function progressSection() {
  const fileInput = h('input', {
    type: 'file',
    accept: '.txt,text/plain',
    class: 'hidden-input',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await handleProgressImport(file);
    },
  });

  return h(
    'section',
    { class: 'settings-section' },
    h(
      'div',
      { class: 'card admin-card' },
      h('h3', {}, 'Export progress'),
      h(
        'p',
        { class: 'muted small' },
        'Save every answer and the activity time (the calendar) so far as one text file. Open the app on another device and import that file there. The file is signed, so a changed file is refused.',
      ),
      h(
        'div',
        { class: 'toolbar-actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: exportProgress }, 'Export progress'),
      ),
    ),
    h(
      'div',
      { class: 'card admin-card' },
      h('h3', {}, 'Import progress'),
      h(
        'p',
        { class: 'muted small' },
        'Add the answers and the activity time from a progress file. What this device already has is skipped, so importing the same file twice changes nothing.',
      ),
      h(
        'div',
        { class: 'toolbar-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => fileInput.click() }, 'Import progress file'),
      ),
      fileInput,
    ),
    clearProgressCard(),
  );
}

/** Clears all the progress on this device, after two confirmations. The question bank is kept. */
function clearProgressCard() {
  return h(
    'div',
    { class: 'card admin-card' },
    h('h3', {}, 'Clear progress'),
    h(
      'p',
      { class: 'muted small' },
      'Deletes every answer, your points, XP, level, stars, lesson progress, play time and calendar on this device. This cannot be undone. The question bank is not changed.',
    ),
    h(
      'div',
      { class: 'toolbar-actions' },
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
          },
        },
        'Clear progress',
      ),
    ),
  );
}

async function exportProgress() {
  const attempts = await loadAttempts();
  const sessions = loadSessions();
  if (attempts.length === 0 && sessions.length === 0) {
    toast('There is no progress to export yet.', 'warn');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  download(`grammar-quest-progress-${stamp}.txt`, await encodeBackup({ attempts, sessions }), 'text/plain');
}

async function handleProgressImport(file) {
  try {
    const { attempts, sessions } = await decodeBackup(await file.text());
    const answers = await importAttempts(attempts);
    const days = addSessions(sessions);
    toast(
      `${fa(answers.added)} answers and ${fa(days)} activity sessions added. ${fa(answers.skipped)} answers were already here.`,
    );
  } catch (error) {
    toast(error.message, 'error');
  }
}

/** Question bank: the stored count, import, export and the AI guide. */
async function questionBankSection(root) {
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

  return h(
    'section',
    { class: 'settings-section' },
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
