import { h } from './dom.js';
import { speak, speakActionButton, speakButtons, stopSpeaking } from './speech-out.js';
import { uiIcon } from './icons.js';

const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';

const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/>' +
  '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
  '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/**
 * The lesson's choice page: one coloured tile per page. Each tile is { kind, icon, title, subtitle, onclick }.
 */
export function lessonHub(tiles) {
  return h('div', { class: 'hub-grid' }, ...tiles.map(hubTile));
}

function hubIcon(kind) {
  return h('span', { class: 'hub-icon', 'aria-hidden': 'true' }, uiIcon(kind));
}

function hubTile({ kind, title, subtitle, onclick }) {
  return h(
    'button',
    { type: 'button', class: `hub-tile hub-${kind}`, onclick },
    hubIcon(kind),
    h(
      'span',
      { class: 'hub-text' },
      h('strong', { class: 'hub-title' }, title),
      h('span', { class: 'hub-sub' }, subtitle),
    ),
  );
}

// Which side is shown: 'english' (Persian hidden), 'persian' (English hidden) or 'both'.
const MODES = [
  ['english', 'English only'],
  ['persian', 'Persian only'],
  ['both', 'English + Persian'],
];

/**
 * A page of lines. `groups` is [{ title?, explanation?, rows: [{ english, persian, ipa? }] }]: a grammar rule is one
 * group with its explanation; the words and sentences are one group.
 * The switch chooses which side is shown. The eye on a row shows its hidden side and taps again to hide it.
 * The speak buttons only work once the English is on screen, so a hidden English word cannot be heard.
 */
export function linesPage({ groups, speakLabel = 'Read aloud', note = true }) {
  let mode = 'english';
  const revealed = new Set();
  const body = h('div', { class: 'lc-groups' });

  const modeButtons = MODES.map(([value, label]) => ({
    value,
    element: h(
      'button',
      {
        type: 'button',
        class: `chip-toggle lc-mode lc-mode-${value}`,
        onclick: () => {
          mode = value;
          revealed.clear();
          draw();
        },
      },
      label,
    ),
  }));

  const row = (entry, key) => {
    const englishShown = mode !== 'persian' || revealed.has(key);
    const persianShown = mode !== 'english' || revealed.has(key);
    // The eye is only useful when something is hidden for this row.
    const hasHidden = mode === 'persian' || (mode === 'english' && Boolean(entry.persian));
    const isRevealed = revealed.has(key);

    const eyeGlyph = h('span', { class: 'lc-eye-glyph' });
    eyeGlyph.innerHTML = isRevealed ? EYE_OFF_ICON : EYE_ICON;
    const eye = hasHidden
      ? h(
          'button',
          {
            type: 'button',
            class: `lc-eye${isRevealed ? ' on' : ''}`,
            'aria-pressed': String(isRevealed),
            'aria-label': isRevealed ? 'Hide' : 'Show the hidden text',
            title: isRevealed ? 'Hide' : 'Show the hidden text',
            onclick: () => {
              if (isRevealed) revealed.delete(key);
              else revealed.add(key);
              draw();
            },
          },
          eyeGlyph,
        )
      : null;

    return h(
      'li',
      { class: 'lc-item' },
      h(
        'span',
        { class: 'lc-main' },
        englishShown
          ? h('strong', { class: 'lc-word', dir: 'ltr' }, entry.english)
          : h('span', { class: 'lc-hidden', dir: 'ltr' }, '• • • • • •'),
        englishShown && entry.ipa ? h('span', { class: 'lc-ipa', dir: 'ltr' }, entry.ipa) : null,
        entry.persian
          ? persianShown
            ? h('span', { class: 'lc-sub', dir: 'rtl' }, entry.persian)
            : h('span', { class: 'lc-hidden lc-sub', dir: 'rtl' }, '• • • • •')
          : null,
      ),
      h(
        'span',
        { class: 'lc-actions' },
        eye,
        englishShown ? speakButtons(entry.english, { label: speakLabel }) : null,
      ),
    );
  };

  // Each group's list is made once. A redraw only swaps its rows, so the list keeps the scroll position the reader
  // had when they tapped an eye or a mode.
  const shown = groups.filter((group) => group.rows.length > 0);
  const lists = shown.map(() => h('ul', { class: 'lc-list' }));
  body.replaceChildren(
    ...shown.map((group, groupIndex) =>
      h(
        'section',
        { class: 'lc-group' },
        group.title ? h('h4', { class: 'lc-group-title', dir: 'auto' }, group.title) : null,
        group.explanation ? h('p', { class: 'lc-explain', dir: 'auto' }, group.explanation) : null,
        lists[groupIndex],
      ),
    ),
  );

  const draw = () => {
    for (const { value, element } of modeButtons) {
      element.classList.toggle('active', value === mode);
      element.setAttribute('aria-pressed', String(value === mode));
    }
    shown.forEach((group, groupIndex) => {
      lists[groupIndex].replaceChildren(
        ...group.rows.map((entry, rowIndex) => row(entry, `${groupIndex}:${rowIndex}`)),
      );
    });
  };
  draw();

  return h(
    'div',
    { class: 'lc-page' },
    note ? h('p', { class: 'muted small lc-note' }, 'Choose what to see. Tap the eye to show the hidden side of a row.') : null,
    h('div', { class: 'chips lc-modes' }, ...modeButtons.map((entry) => entry.element)),
    body,
  );
}

// The story being read aloud: its stop function, or null. Only one story is read at a time.
let stopCurrentReading = null;

/** Stops the story being read aloud (also when the learner leaves the stories). */
export function stopStoryReading() {
  stopCurrentReading?.();
  stopCurrentReading = null;
}

// How a story is read: English, Persian, or both. Its own switch, not the words and sentences switch.
const STORY_VIEWS = [
  ['english', 'English'],
  ['persian', 'Persian'],
  ['both', 'English + Persian'],
];

/**
 * The stories page: one tab per story. A story is shown as running text (its lines joined into paragraphs, not
 * line by line), with one listen button for the whole story and a view switch for the English and the Persian.
 */
export function storiesPage(stories) {
  let current = 0;
  let view = 'english';
  const body = h('div', { class: 'lc-story-body' });

  const stopReading = stopStoryReading;

  // Reads the story one line at a time: each line is spoken, then the next one is highlighted and spoken.
  const readAloud = (card, story, slow) => {
    stopStoryReading();
    let index = 0;
    let active = true;
    const stop = () => {
      active = false;
      stopCurrentReading = null;
      stopSpeaking();
      card.show(null);
    };
    const finish = () => {
      active = false;
      stopCurrentReading = null;
      card.show(null);
    };
    const next = () => {
      if (!active) return;
      if (index >= story.lines.length) return finish();
      const i = index++;
      card.show(i);
      if (!speak(story.lines[i].english, { slow, onEnd: next })) finish();
    };
    stopCurrentReading = stop;
    next();
  };

  const draw = () => {
    const story = stories[current];
    const card = storyCard(story, view, {
      onView: (value) => {
        stopReading();
        view = value;
        draw();
      },
      onPlay: (slow) => readAloud(card, story, slow),
      onStop: stopReading,
    });
    body.replaceChildren(card.element);
  };

  const tabs = stories.map((story, index) =>
    h(
      'button',
      {
        type: 'button',
        class: 'lc-story-tab',
        onclick: () => {
          stopReading();
          current = index;
          tabsState(index);
          draw();
        },
      },
      story.title,
    ),
  );
  const tabsState = (active) =>
    tabs.forEach((tab, index) => {
      tab.classList.toggle('active', index === active);
      tab.setAttribute('aria-pressed', String(index === active));
    });
  tabsState(current);
  draw();

  return h('div', { class: 'lc-stories' }, h('div', { class: 'lc-story-tabs' }, ...tabs), body);
}

/**
 * One story as a card: its title, the listen controls, the view switch, then the English and/or Persian text.
 * Each line is its own span, so the line being read aloud can be highlighted (in both languages).
 * Returns { element, show(index) }: show(i) highlights line i, show(null) clears the highlight and the Stop button.
 */
function storyCard(story, view, { onView, onPlay, onStop }) {
  // The lines come from lessonMaterial: { english, persian } per line.
  const showEnglish = view !== 'persian';
  const showPersian = view !== 'english';
  const englishLines = story.lines.map((line) => h('span', { class: 'lc-line', dir: 'ltr', lang: 'en' }, line.english));
  const persianLines = story.lines.map((line) => h('span', { class: 'lc-line', dir: 'rtl', lang: 'fa' }, line.persian));
  const withSpaces = (spans) => spans.flatMap((span, index) => (index ? [' ', span] : [span]));

  // The listen controls use the same speaker buttons as the rest of the lesson: normal and slow, or Stop while reading.
  let playing = false;
  const controls = h('span', { class: 'speak-buttons' });
  const drawControls = () => {
    controls.replaceChildren(
      ...(playing
        ? [speakActionButton('stop', 'Stop reading', onStop)]
        : [
            speakActionButton('normal', 'Read the story aloud', () => onPlay(false)),
            speakActionButton('slow', 'Read the story slowly', () => onPlay(true)),
          ]).filter(Boolean),
    );
  };

  const element = h(
    'article',
    { class: 'lc-story' },
    h(
      'header',
      { class: 'lc-story-head' },
      h('h4', { class: 'lc-story-title', dir: 'auto' }, story.title),
      showEnglish ? controls : null,
    ),
    h(
      'div',
      { class: 'lc-view-bar' },
      h(
        'div',
        { class: 'lc-view', role: 'group', 'aria-label': 'How to read the story' },
        STORY_VIEWS.map(([value, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: `lc-view-btn${value === view ? ' active' : ''}`,
            'aria-pressed': String(value === view),
            onclick: () => onView(value),
          },
          label,
        ),
      ),
      ),
    ),
    showEnglish ? h('p', { class: 'lc-story-text', dir: 'ltr', lang: 'en' }, ...withSpaces(englishLines)) : null,
    showEnglish && showPersian ? h('hr', { class: 'lc-story-sep' }) : null,
    showPersian ? h('p', { class: 'lc-story-text lc-story-fa', dir: 'rtl', lang: 'fa' }, ...withSpaces(persianLines)) : null,
  );

  drawControls();

  const show = (index) => {
    playing = index !== null;
    drawControls();
    englishLines.forEach((span, i) => span.classList.toggle('is-reading', i === index));
    persianLines.forEach((span, i) => span.classList.toggle('is-reading', i === index));
    const current = index === null ? null : englishLines[index];
    current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  return { element, show };
}
