// Settings screen (opened from the gear in the header). Two sections:
//   Sounds: the win and lose sound effects, each on or off, with a volume and a preview;
//           the spoken English that is read aloud after each answer, and the voice order for that speech.
//   Progress: export all progress as a signed text, import it on another device, or clear it all.

import {
  getSoundSettings,
  saveSoundSettings,
  getVoicePriority,
  saveVoicePriority,
  getHiddenVoices,
  saveHiddenVoices,
  DEFAULT_VOICE_PRIORITY,
} from '../storage/settings.js';
import { canSpeak, matchesEntry, speak, voiceCandidates, voiceChain } from './speech-out.js';
import { uiIcon } from './icons.js';
import { getUnlockedLessons, saveUnlockedLessons } from '../storage/lesson-unlocks.js';
import { loadAttempts, importAttempts, resetProgress } from '../progress/tracker.js';
import { loadSessions, addSessions } from '../progress/activity.js';
import { encodeBackup, decodeBackup } from '../progress/backup.js';
import { playWinSound, playLoseSound, playTimeoutSound, playResultJingle } from './sounds.js';
import { h, fa, toast, download, confirmDialog } from './dom.js';

const SECTIONS = [
  ['sounds', 'Sounds'],
  ['progress', 'Progress'],
];

// The section shown on the settings screen. Kept while the app runs, so re-rendering keeps the same section.
let activeSection = 'sounds';

export async function renderAdmin(root) {
  const body = activeSection === 'sounds' ? soundsSection() : progressSection();

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

  return h('div', { class: 'settings-section' }, effects, spoken, canSpeak() ? voiceCard() : null);
}

// One short sentence, so the learner hears how each voice says English words.
const VOICE_SAMPLE = 'The weather is nice today.';

/**
 * The voice list for the spoken English. It shows the English voices this device has, under their real names,
 * in the order they are tried. Removed voices are hidden and can be added back.
 */
function voiceCard() {
  const list = h('ol', { class: 'voice-list' });
  const addSelect = h('select', { class: 'voice-add-select', 'aria-label': 'Voice to add' });
  const addButton = h('button', { type: 'button', class: 'btn ghost small' }, 'Add voice');
  const inUse = h('p', { class: 'muted small' });

  const tagFor = (candidate) => (candidate.online ? 'Online (needs internet)' : 'On this device');

  // Every English voice of this device, in the order they are tried (hidden ones are left out).
  const visibleVoices = () => {
    const hidden = getHiddenVoices();
    const all = voiceCandidates('en-US');
    const ranked = [];
    for (const entry of getVoicePriority()) {
      const found = all.find((c) => !ranked.includes(c) && matchesEntry(c, entry));
      if (found) ranked.push(found);
    }
    return [...ranked, ...all.filter((c) => !ranked.includes(c))].filter(
      (c) => !hidden.some((entry) => matchesEntry(c, entry)),
    );
  };
  // Saves a new order of the visible voices (by name). Saved entries this device does not have keep their place.
  const saveOrder = (names) => {
    const all = voiceCandidates('en-US');
    const others = getVoicePriority().filter((entry) => !all.some((c) => matchesEntry(c, entry)));
    saveVoicePriority([...names, ...others]);
  };

  // Drag a row by its handle (mouse, touch or pen). A copy of the row follows the pointer, and the row's place in
  // the list moves to where the pointer is. The new order is saved when the pointer is released.
  // The listeners are on the document, so they keep working while the row moves in the list.
  let drag = null;
  const onDragMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
    const before = [...list.querySelectorAll('.voice-row')].find((row) => {
      if (row === drag.row) return false;
      const box = row.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    if (before) list.insertBefore(drag.row, before);
    else list.appendChild(drag.row);
  };
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { row, ghost } = drag;
    drag = null;
    ghost.remove();
    row.classList.remove('dragging');
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    const order = [...list.querySelectorAll('.voice-row')].map((el) => el.dataset.name);
    if (order.join('\n') !== visibleVoices().map((c) => c.name).join('\n')) saveOrder(order);
    render();
  };
  const startDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const row = event.currentTarget.closest('.voice-row');
    const box = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add('voice-ghost');
    ghost.style.top = `${box.top}px`;
    ghost.style.left = `${box.left}px`;
    ghost.style.width = `${box.width}px`;
    document.body.appendChild(ghost);
    row.classList.add('dragging');
    drag = { row, ghost, offsetY: event.clientY - box.top, pointerId: event.pointerId };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  };

  const render = (focusName = null) => {
    const shown = visibleVoices();

    const rows = shown.map((candidate, index) => {
      const name = candidate.name;

      const handle = h(
        'button',
        {
          type: 'button',
          class: 'voice-handle',
          'aria-label': `Move ${name}. Press the up or down arrow key to move it.`,
          title: 'Drag to move',
          onpointerdown: startDrag,
          onkeydown: (event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const to = index + (event.key === 'ArrowUp' ? -1 : 1);
            if (to < 0 || to >= shown.length) return;
            const next = shown.map((c) => c.name);
            [next[index], next[to]] = [next[to], next[index]];
            saveOrder(next);
            render(name);
          },
        },
        uiIcon('grip'),
      );

      return h(
        'li',
        { class: 'voice-row', dataset: { name } },
        handle,
        h(
          'span',
          { class: 'sound-row-text' },
          h('strong', {}, name),
          h('small', { class: 'muted' }, tagFor(candidate)),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost small voice-icon-btn',
            'aria-label': `Play a sample in ${name}`,
            title: 'Play a sample in this voice',
            onclick: () => speak(VOICE_SAMPLE, { candidate }),
          },
          uiIcon('play'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost small voice-icon-btn danger',
            'aria-label': `Remove ${name}`,
            title: 'Remove',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Remove this voice?',
                message: `${name} will not be used. You can add it again later.`,
                confirmText: 'Remove',
                cancelText: 'Cancel',
                danger: true,
              });
              if (!ok) return;
              saveHiddenVoices([...getHiddenVoices(), name]);
              render();
            },
          },
          uiIcon('trash'),
        ),
      );
    });
    list.replaceChildren(
      ...(rows.length > 0
        ? rows
        : [h('li', { class: 'muted small' }, 'No English voice was found on this device. The browser default is used.')]),
    );
    if (focusName) {
      list.querySelector(`.voice-row[data-name="${CSS.escape(focusName)}"] .voice-handle`)?.focus();
    }

    // Add: the voices that were removed from the list.
    const hidden = getHiddenVoices();
    const removed = voiceCandidates('en-US').filter((c) => hidden.some((entry) => matchesEntry(c, entry)));
    addSelect.replaceChildren(...removed.map((c) => h('option', { value: c.name }, `${c.name} (${tagFor(c)})`)));
    addSelect.disabled = removed.length === 0;
    addButton.disabled = removed.length === 0;
    addButton.onclick = () => {
      const picked = removed.find((c) => c.name === addSelect.value);
      if (!picked) return;
      const order = visibleVoices().map((c) => c.name);
      saveHiddenVoices(getHiddenVoices().filter((entry) => !matchesEntry(picked, entry)));
      saveOrder([...order, picked.name]);
      render();
    };

    inUse.textContent = `Voice in use now: ${voiceChain('en-US')[0].name}`;
  };

  if (canSpeak()) {
    // Browsers load their voice list later, so the card is updated when the list arrives.
    window.speechSynthesis.onvoiceschanged = () => render();
  }
  render();

  return h(
    'section',
    { class: 'card admin-card' },
    h('h3', {}, 'Voice order'),
    h(
      'p',
      { class: 'muted small' },
      'Spoken English tries the voices in this list from the top. These are the English voices this device has. Drag a voice to change its place. Slow reading uses the same order.',
    ),
    list,
    h('div', { class: 'voice-add' }, addSelect, addButton),
    inUse,
    h(
      'div',
      { class: 'toolbar-actions' },
      h(
        'button',
        { type: 'button', class: 'btn ghost', onclick: () => speak(VOICE_SAMPLE) },
        '▶ Play sample',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost',
          onclick: () => {
            saveVoicePriority([...DEFAULT_VOICE_PRIORITY]);
            saveHiddenVoices([]);
            render();
          },
        },
        'Reset list',
      ),
    ),
  );
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
        'Save all your progress as one text file: every answer, the activity time (the calendar), and the lessons you have unlocked. Open the app on another device and import that file there. The file is signed, so a changed file is refused.',
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

/** Clears all the progress on this device, after two confirmations. */
function clearProgressCard() {
  return h(
    'div',
    { class: 'card admin-card' },
    h('h3', {}, 'Clear progress'),
    h(
      'p',
      { class: 'muted small' },
      'Deletes every answer, your points, XP, level, stars, lesson progress, unlocked lessons, play time and calendar on this device. This cannot be undone.',
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
                'All your history on this device will be deleted: every answer you have given, your points, XP, level, stars, lesson progress, unlocked lessons, your play time and your calendar. This cannot be undone.',
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
  const unlocked = [...getUnlockedLessons()];
  if (attempts.length === 0 && sessions.length === 0 && unlocked.length === 0) {
    toast('There is no progress to export yet.', 'warn');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  download(
    `grammar-quest-progress-${stamp}.txt`,
    await encodeBackup({ attempts, sessions, unlocked }),
    'text/plain',
  );
}

/** Adds the unlocked lessons of a backup to this device. Nothing that is unlocked here is lost. Returns how many were new. */
function importUnlockedLessons(keys) {
  const current = getUnlockedLessons();
  const added = keys.filter((key) => !current.has(key)).length;
  saveUnlockedLessons(new Set([...current, ...keys]));
  return added;
}

async function handleProgressImport(file) {
  try {
    const { attempts, sessions, unlocked } = await decodeBackup(await file.text());
    const answers = await importAttempts(attempts);
    const days = addSessions(sessions);
    const lessons = importUnlockedLessons(unlocked);
    toast(
      `${fa(answers.added)} answers, ${fa(days)} activity sessions and ${fa(lessons)} unlocked lessons added. ${fa(answers.skipped)} answers were already here.`,
    );
  } catch (error) {
    toast(error.message, 'error');
  }
}
