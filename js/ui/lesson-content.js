import { h, keepFocus } from './dom.js';
import {
  LESSON_PLAYBAR_UI_DEFAULTS,
  loadLessonPlaybarSettings,
  saveLessonPlaybarSettings,
} from '../storage/lesson-playbar.js';
import {
  speak,
  speakButtons,
  speakActionButton,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  canSpeak,
} from './speech-out.js';
import { setLessonWakeLock } from './wake-lock.js';
import { uiIcon } from './icons.js';
import { dragToScroll } from './drag-scroll.js';

const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';

const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/>' +
  '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
  '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// The colour of each stop on the road map (the tile colours in app.css).
const STOP_COLORS = {
  words: '#2563eb',
  grammar: '#d97706',
  sentences: '#059669',
  stories: '#db2777',
};

/**
 * The lesson's choice page as a road map: the stops in order, from top to bottom, one card under the other on a
 * dotted road that runs down the middle. Each tile is { kind, icon, title, subtitle, onclick }.
 * The last tile is the finish (Practice).
 */
export function lessonHub(tiles) {
  const stops = tiles.slice(0, -1);
  const finish = tiles[tiles.length - 1];
  const xOf = (index) => ROAD_X[sideOf(index)];
  return h(
    'div',
    { class: 'road' },
    h('span', { class: 'road-start' }, 'Start here', stops.length ? roadWire(ROAD_X.centre, xOf(0)) : null),
    ...stops.map((tile, index) =>
      roadStop(tile, index, index + 1 < stops.length ? xOf(index + 1) : ROAD_X.centre),
    ),
    roadFinish(finish),
  );
}

/** The stops zigzag: the first is on the left, the next on the right, and so on. */
const sideOf = (index) => (index % 2 === 0 ? 'left' : 'right');

/** Where each side's card is centred on the road (the road is 360px wide, see app.css). */
const ROAD_X = { left: 90, centre: 180, right: 270 };

/**
 * A dotted curve from the card's centre to the centre of the next card (or the finish): the road between stops.
 * The curve is drawn in the same 360px-wide box as the road, so its ends meet the card centres.
 */
function roadWire(fromX, toX) {
  const wire = h('span', { class: 'road-wire', 'aria-hidden': 'true' });
  wire.innerHTML =
    `<svg viewBox="0 0 360 60" fill="none" stroke="#b6c2d4" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 11">` +
    `<path d="M${fromX} 0 C${fromX} 30 ${toX} 30 ${toX} 60"/></svg>`;
  return wire;
}

/** One stop: a card on its side of the road, with its number in the card's corner and the curve to the next stop. */
function roadStop(tile, index, nextX) {
  const side = sideOf(index);
  return h(
    'div',
    { class: `road-stop ${side}` },
    h('div', { class: 'road-slot' }, hubTile({ ...tile, number: index + 1 })),
    roadWire(ROAD_X[side], nextX),
  );
}

/** The finish: the Practice card at the end of the road, with no number. */
function roadFinish(tile) {
  return h(
    'div',
    { class: 'road-stop finish' },
    h('div', { class: 'road-slot road-finish' }, hubTile({ ...tile, wide: true })),
  );
}

function hubIcon(icon) {
  return h('span', { class: 'hub-icon', 'aria-hidden': 'true' }, uiIcon(icon));
}

function hubTile({ kind, icon, title, subtitle, number = null, wide = false, onclick }) {
  return h(
    'button',
    { type: 'button', class: `hub-tile hub-${kind}${wide ? ' hub-wide' : ''}`, onclick },
    number !== null ? h('span', { class: 'hub-num', 'aria-hidden': 'true' }, String(number)) : null,
    hubIcon(icon ?? kind),
    h(
      'span',
      { class: 'hub-text' },
      h('strong', { class: 'hub-title' }, title),
      h('span', { class: 'hub-sub' }, subtitle),
    ),
  );
}

/** Base pause between lines; the delay button adds an offset from −1 to +2 seconds. */
const PLAY_GAP_BASE_SEC = 1;
const PLAY_GAP_OFFSETS = [-1, 0, 1, 2];

let followUiSync = () => {};
let linesAutoplayUiSync = () => {};

/** Active list playback: step by one line in the current order (see beginPlayback). */
let playbackStepRelative = () => {};

const bottomPlaybackPrev = () => document.querySelector('.bottom-playback-prev');
const bottomPlaybackNext = () => document.querySelector('.bottom-playback-next');

function syncBottomPlaybackButtons({ canPrev, canNext }) {
  const prev = bottomPlaybackPrev();
  const next = bottomPlaybackNext();
  if (prev) prev.disabled = !canPrev;
  if (next) next.disabled = !canNext;
}

function notifyLinesPlaybackUi() {
  document.body.classList.toggle('lines-playback-nav', linesIsPlaying);
  linesAutoplayUiSync();
}

if (typeof document !== 'undefined') {
  bottomPlaybackPrev()?.addEventListener('click', () => playbackStepRelative(-1));
  bottomPlaybackNext()?.addEventListener('click', () => playbackStepRelative(1));
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const LONG_SENTENCE_MIN_WORDS = 10;

/** Case-insensitive match on English or Persian row text (words and sentences search). */
function rowMatchesLessonSearch(entry, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const english = String(entry.english ?? '').toLowerCase();
  const persian = String(entry.persian ?? '').toLowerCase();
  return english.includes(q) || persian.includes(q);
}

/** Heuristic clip for the second pass on long sentences (no keyword field in lesson data yet). */
function focusPhraseForSentence(english) {
  const words = english.trim().split(/\s+/).filter(Boolean);
  if (words.length < LONG_SENTENCE_MIN_WORDS) return null;
  const start = Math.max(0, Math.floor(words.length * 0.2));
  const end = Math.min(words.length, start + 8);
  if (end <= start + 1) return null;
  return words.slice(start, end).join(' ');
}

/** Playback order: from `startAt`, then the rest; optional shuffle of the tail. */
function buildPlaybackOrder(length, startAt, shuffle) {
  if (length <= 0) return [];
  const start = Math.min(Math.max(0, startAt), length - 1);
  if (!shuffle) {
    return Array.from({ length }, (_, i) => (start + i) % length);
  }
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== start);
  shuffleInPlace(rest);
  return [start, ...rest];
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
// The words list being read aloud by the play-all toolbar, or null. Only one list at a time.
let stopLinesPlaybackFn = null;
let linesFollowScroll = true;
let linesScrollLock = false;
let linesScrollLockTimer = null;
let linesScrollSpeakTimer = null;
let linesIsPlaying = false;
// Closes the manual card view of the page on screen (see linesPage), or null.
let stopManualFn = null;
// Card view and the browser's back button: opening the card view adds one history entry, so the phone's back
// button closes the card view instead of leaving the lesson (see handleCardViewBack, used by play.js).
let cardViewEntry = false;
// Set while the card view removes its own entry (closed from the header), so the popstate that follows is not a leave.
let cardViewRemovingEntry = false;
// The header back button while the card view is open: it closes the card view. Restored when the card view closes.
let cardViewHeader = null;
// Closes the card view of the page on screen with a reason (see linesPage), or null.
let closeManualFn = null;

const restoreCardViewHeader = () => {
  if (!cardViewHeader) return;
  const { btn, previous, handler } = cardViewHeader;
  cardViewHeader = null;
  // Only put the old handler back if nothing else has taken the header button since.
  if (btn.onclick === handler) btn.onclick = previous;
};

/**
 * Called on every popstate. Returns true when the browser's back button was used to close the card view,
 * so the lesson screen must not also treat it as a step back.
 */
export function handleCardViewBack() {
  if (cardViewRemovingEntry) {
    cardViewRemovingEntry = false;
    return true;
  }
  if (!cardViewEntry) return false;
  cardViewEntry = false;
  closeManualFn?.('back');
  return true;
}

/** After scrollIntoView(smooth), wait before TTS so long lists settle on the current row. */
const PLAY_SCROLL_SETTLE_MS = 500;
const PLAY_SCROLL_ALREADY_MS = 80;

function waitAfterSmoothScroll(targetEl) {
  if (!targetEl || !linesFollowScroll) return Promise.resolve();
  const rect = targetEl.getBoundingClientRect();
  const pad = 72;
  const inView = rect.top >= pad && rect.bottom <= window.innerHeight - pad;
  const ms = inView ? PLAY_SCROLL_ALREADY_MS : PLAY_SCROLL_SETTLE_MS;
  return new Promise((resolve) => {
    clearTimeout(linesScrollSpeakTimer);
    linesScrollSpeakTimer = setTimeout(resolve, ms);
  });
}

if (typeof window !== 'undefined') {
  // Only the learner's own scrolling turns off follow — not scrollIntoView during playback (shuffle jumps a lot).
  const userTurnedOffFollowScroll = () => {
    if (!linesIsPlaying || linesScrollLock) return;
    linesFollowScroll = false;
    followUiSync();
  };
  window.addEventListener('wheel', userTurnedOffFollowScroll, { passive: true });
  window.addEventListener('touchmove', userTurnedOffFollowScroll, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
    ) {
      userTurnedOffFollowScroll();
    }
  });
}

/** Stops the play-all toolbar when the learner leaves the words, sentences or grammar screen. */
export function stopLinesPlayback() {
  stopLinesPlaybackFn?.();
  stopLinesPlaybackFn = null;
  stopManualFn?.();
  playbackStepRelative = () => {};
  linesIsPlaying = false;
  document.body.classList.remove('lc-deck-session-active');
  setLessonWakeLock(false);
  followUiSync();
  syncBottomPlaybackButtons({ canPrev: false, canNext: false });
  notifyLinesPlaybackUi();
}

/**
 * Play / stop, 1–3× per line, loop, sticky bar shared by words, sentences, grammar and stories.
 * `getPlaybackRows()` returns `{ english, index }[]` (only rows to read); `onLine(index|null)` highlights by list index.
 * `onPickIndex(index)` optional: row the learner chose as the start line.
 */
function createLessonPlaybar({
  ariaLabel,
  playTitle,
  getPlaybackRows,
  onLine,
  onPickIndex,
  waitBeforeSpeak,
  // Quiz rows only (see linesPage): playback stops after the line is read, until the learner presses Resume.
  // onGuessWait(index) is called when it stops; onGuessCheck(index) when the learner resumes and the answer shows.
  onGuessWait,
  onGuessCheck,
  shuffle: shuffleOption = false,
  playbarFeatures = {},
  onCardView,
}) {
  const deckPlaybackBar = Boolean(playbarFeatures.deckPlayback);
  const features = {
    autoReveal: Boolean(playbarFeatures.autoReveal),
    listenOnly: Boolean(playbarFeatures.listenOnly) && !deckPlaybackBar,
    dimOthers: Boolean(playbarFeatures.dimOthers) && !deckPlaybackBar,
    longSentence: Boolean(playbarFeatures.longSentence),
    deckPlayback: deckPlaybackBar,
  };

  const saved = loadLessonPlaybarSettings();
  let loopEnabled = saved?.loopEnabled ?? false;
  let shuffleEnabled = shuffleOption ? (saved?.shuffleEnabled ?? false) : false;
  let timesPerItem = saved?.timesPerItem ?? 1;
  let gapOffsetIndex = saved ? PLAY_GAP_OFFSETS.indexOf(saved.gapOffset) : 1;
  if (gapOffsetIndex < 0) gapOffsetIndex = 1;
  let autoRevealOnPlay = saved?.autoRevealOnPlay ?? LESSON_PLAYBAR_UI_DEFAULTS.autoRevealOnPlay;
  let listenOnly = saved?.listenOnly ?? LESSON_PLAYBAR_UI_DEFAULTS.listenOnly;
  let dimOthersOnPlay = saved?.dimOthersOnPlay ?? LESSON_PLAYBAR_UI_DEFAULTS.dimOthersOnPlay;
  let longSentenceFocus = saved?.longSentenceFocus ?? LESSON_PLAYBAR_UI_DEFAULTS.longSentenceFocus;
  let autoSpeakOnCard = saved?.autoSpeakOnCard ?? LESSON_PLAYBAR_UI_DEFAULTS.autoSpeakOnCard;
  // The card view reads each card aloud when it opens (only where the page asks for it, and only with a card view).
  const autoSpeakCardFeature = Boolean(playbarFeatures.autoSpeakCard && onCardView);

  const linePlaybackContext = () => ({
    autoReveal: features.autoReveal && autoRevealOnPlay,
    listenOnly: features.listenOnly && listenOnly,
    dimOthers: features.dimOthers && dimOthersOnPlay,
    longSentence: features.longSentence && longSentenceFocus,
  });

  let startIndex = 0;
  let playingAll = false;
  let paused = false;
  let pausePoint = 'none';
  let session = null;
  let rowsRef = [];
  let orderRef = [];
  let playPosRef = 0;
  let loopEnabledRef = false;

  const playbarTransport = h('div', { class: 'lc-playbar-transport' });
  const playbarOptions = h('div', { class: 'lc-playbar-options' });
  const playbarProgress = h('span', { class: 'lc-playbar-progress', 'aria-live': 'polite' });
  const playbarMeta = h('div', { class: 'lc-playbar-meta' });
  let playbarTop;
  let playbarActions;

  const persistSettings = () => {
    saveLessonPlaybarSettings({
      timesPerItem,
      gapOffset: gapOffset(),
      loopEnabled,
      shuffleEnabled: shuffleOption ? shuffleEnabled : false,
      autoRevealOnPlay,
      listenOnly,
      dimOthersOnPlay,
      longSentenceFocus,
      autoSpeakOnCard,
    });
  };

  const gapOffset = () => PLAY_GAP_OFFSETS[gapOffsetIndex];
  const gapMs = () => Math.max(0, (PLAY_GAP_BASE_SEC + gapOffset()) * 1000);
  const speakSlow = () => gapOffset() > -1;

  const syncProgress = (activePlayPos = null) => {
    const rows = getPlaybackRows();
    const total = rows.length;
    if (!total) {
      playbarProgress.textContent = '';
      return;
    }
    if (playingAll && activePlayPos !== null) {
      playbarProgress.textContent = `${activePlayPos + 1} / ${total}`;
      return;
    }
    const picked = rows.findIndex((row) => row.index === startIndex);
    playbarProgress.textContent = picked >= 0 ? `${picked + 1} / ${total}` : `— / ${total}`;
  };

  const playbarOptStack = (caption, ...value) =>
    h('span', { class: 'lc-playbar-opt-stack' }, h('span', { class: 'lc-playbar-opt-caption' }, caption), ...value);

  const repeatCycleLabel = h('span', { class: 'lc-playbar-cycle-text' }, '1×');

  const syncRepeatCycle = () => {
    repeatCycleLabel.textContent = `${timesPerItem}×`;
    repeatCycleBtn.setAttribute('aria-label', `${timesPerItem} time${timesPerItem === 1 ? '' : 's'} per line`);
    repeatCycleBtn.title = `${timesPerItem}× each line`;
  };

  const repeatCycleBtn = h(
    'button',
    {
      type: 'button',
      class: 'chip-toggle lc-playbar-cycle lc-playbar-opt-btn lc-playbar-repeat-cycle active',
      'aria-pressed': 'true',
      onclick: () => {
        if (playingAll) return;
        timesPerItem = timesPerItem >= 3 ? 1 : timesPerItem + 1;
        syncRepeatCycle();
        persistSettings();
      },
    },
    playbarOptStack('Each', repeatCycleLabel),
  );
  syncRepeatCycle();

  const delayCycleLabel = h('span', { class: 'lc-playbar-cycle-text' }, '0');

  const syncDelayCycle = () => {
    const offset = PLAY_GAP_OFFSETS[gapOffsetIndex];
    const sign = offset > 0 ? '+' : '';
    delayCycleLabel.textContent = `${sign}${offset}`;
    const seconds = PLAY_GAP_BASE_SEC + offset;
    delayCycleBtn.setAttribute(
      'aria-label',
      offset === -1
        ? 'Fast mode: normal speed, no pause between lines'
        : seconds === 0
          ? 'No pause between lines'
          : `${seconds} second pause between lines`,
    );
    delayCycleBtn.title =
      offset === -1
        ? 'Fast: normal speed, no pause between lines'
        : seconds === 0
          ? 'No pause between lines'
          : `${seconds} s pause (tap to change)`;
  };

  const delayCycleBtn = h(
    'button',
    {
      type: 'button',
      class: 'chip-toggle lc-playbar-cycle lc-playbar-opt-btn lc-playbar-delay-cycle active',
      'aria-pressed': 'true',
      onclick: () => {
        if (playingAll) return;
        gapOffsetIndex = (gapOffsetIndex + 1) % PLAY_GAP_OFFSETS.length;
        syncDelayCycle();
        persistSettings();
      },
    },
    playbarOptStack('Pause', delayCycleLabel),
  );
  syncDelayCycle();

  const loopToggle = h(
    'button',
    {
      type: 'button',
      class: `chip-toggle lc-playbar-loop lc-playbar-opt-btn${loopEnabled ? ' active' : ''}`,
      'aria-pressed': String(loopEnabled),
      'aria-label': 'Loop playback',
      title: 'Loop',
      onclick: () => {
        if (playingAll) return;
        loopEnabled = !loopEnabled;
        loopToggle.classList.toggle('active', loopEnabled);
        loopToggle.setAttribute('aria-pressed', String(loopEnabled));
        persistSettings();
      },
    },
    playbarOptStack('Loop', uiIcon('repeat', 'lc-playbar-loop-icon')),
  );

  const shuffleToggle = shuffleOption
    ? h(
        'button',
        {
          type: 'button',
          class: `chip-toggle lc-playbar-loop lc-playbar-opt-btn lc-playbar-shuffle${shuffleEnabled ? ' active' : ''}`,
          'aria-pressed': String(shuffleEnabled),
          'aria-label': 'Shuffle word order',
          title: 'Shuffle',
          onclick: () => {
            if (playingAll) return;
            shuffleEnabled = !shuffleEnabled;
            shuffleToggle.classList.toggle('active', shuffleEnabled);
            shuffleToggle.setAttribute('aria-pressed', String(shuffleEnabled));
            persistSettings();
          },
        },
        playbarOptStack('Mix', uiIcon('shuffle', 'lc-playbar-loop-icon')),
      )
    : null;

  const makeFeatureToggle = ({ getEnabled, setEnabled, caption, icon, label, title }) => {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'chip-toggle lc-playbar-loop lc-playbar-opt-btn lc-playbar-feature',
        'aria-label': label,
        title,
        onclick: () => {
          if (playingAll) return;
          setEnabled(!getEnabled());
          syncFeatureToggle(btn, getEnabled());
          persistSettings();
        },
      },
      playbarOptStack(caption, uiIcon(icon, 'lc-playbar-loop-icon')),
    );
    syncFeatureToggle(btn, getEnabled());
    return btn;
  };

  const syncFeatureToggle = (btn, on) => {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  };

  const autoRevealToggle = features.autoReveal
    ? makeFeatureToggle({
        getEnabled: () => autoRevealOnPlay,
        setEnabled: (value) => {
          autoRevealOnPlay = value;
        },
        caption: 'Show',
        icon: 'eye',
        label: 'Show hidden text while playing',
        title: 'Reveal hidden side on each line',
      })
    : null;

  const listenOnlyToggle = features.listenOnly
    ? makeFeatureToggle({
        getEnabled: () => listenOnly,
        setEnabled: (value) => {
          listenOnly = value;
        },
        caption: 'Listen',
        icon: 'headphones',
        label: 'Listen only: no highlight or scroll',
        title: 'Listen only',
      })
    : null;

  const dimOthersToggle = features.dimOthers
    ? makeFeatureToggle({
        getEnabled: () => dimOthersOnPlay,
        setEnabled: (value) => {
          dimOthersOnPlay = value;
        },
        caption: 'Focus',
        icon: 'focusFrame',
        label: 'Dim other rows while playing',
        title: 'Fade and blur other lines',
      })
    : null;

  const longSentenceToggle = features.longSentence
    ? makeFeatureToggle({
        getEnabled: () => longSentenceFocus,
        setEnabled: (value) => {
          longSentenceFocus = value;
        },
        caption: 'Long',
        icon: 'textLong',
        label: 'Long sentences: full read then key phrase',
        title: 'Long sentences: slow full line, then key phrase',
      })
    : null;

  // Card view only: reads the card's English aloud once, when the card opens or the learner moves to it.
  const autoSpeakToggle = autoSpeakCardFeature
    ? makeFeatureToggle({
        getEnabled: () => autoSpeakOnCard,
        setEnabled: (value) => {
          autoSpeakOnCard = value;
        },
        caption: 'Auto',
        icon: 'volume',
        label: 'Auto read: read each card aloud when it opens',
        title: 'Read each card aloud when it opens in card view',
      })
    : null;

  const featureToggles = [
    autoSpeakToggle,
    autoRevealToggle,
    listenOnlyToggle,
    dimOthersToggle,
    longSentenceToggle,
  ].filter(Boolean);

  const followBtn = h(
    'button',
    {
      type: 'button',
      class: 'lc-playbar-follow',
      hidden: true,
      onclick: () => {
        linesFollowScroll = true;
        syncFollowBtn();
        const lineIndex = session?.currentLineIndex;
        if (lineIndex != null) onLine(lineIndex, linePlaybackContext());
      },
    },
    'Follow',
  );

  const syncFollowBtn = () => {
    if (features.deckPlayback) return;
    followBtn.hidden = !(linesIsPlaying && !linesFollowScroll);
  };
  followUiSync = syncFollowBtn;

  playbarMeta.append(playbarProgress, ...(features.deckPlayback ? [] : [followBtn]));
  playbarTop = h('div', { class: 'lc-playbar-top' }, playbarTransport, playbarMeta);
  playbarActions = h('div', { class: 'lc-playbar-actions' }, playbarTop, playbarOptions);
  dragToScroll(playbarOptions);

  const playAllButton = () =>
    keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'lc-playbar-start',
          'aria-label': playTitle,
          title: playTitle,
          onclick: () => beginPlayback(startIndex),
        },
        (() => {
          const glyph = h('span', { class: 'lc-playbar-start-icon' });
          glyph.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.9-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>';
          return glyph;
        })(),
      ),
    );

  // Opens the card view with the learner in control: the same card, but nothing plays or moves by itself.
  const cardViewButton = () =>
    keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'lc-playbar-card',
          'aria-label': 'Open card view',
          title: 'Card view: move and listen yourself',
          onclick: () => onCardView(),
        },
        (() => {
          const glyph = h('span', { class: 'lc-playbar-card-icon' });
          glyph.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
          return glyph;
        })(),
      ),
    );

  const stopAllButton = () =>
    keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'lc-playbar-stop',
          'aria-label': 'Stop playback',
          title: 'Stop',
          onclick: () => stopLinesPlayback(),
        },
        (() => {
          const glyph = h('span', { class: 'lc-playbar-stop-icon' });
          glyph.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
          return glyph;
        })(),
      ),
    );

  const pauseButton = () =>
    keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'lc-playbar-pause',
          'aria-label': 'Pause playback',
          title: 'Pause',
          onclick: () => pausePlayback(),
        },
        (() => {
          const glyph = h('span', { class: 'lc-playbar-pause-icon' });
          glyph.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
          return glyph;
        })(),
      ),
    );

  const resumeButton = () =>
    keepFocus(
      h(
        'button',
        {
          type: 'button',
          class: 'lc-playbar-start',
          'aria-label': 'Resume playback',
          title: 'Resume',
          onclick: () => resumePlayback(),
        },
        (() => {
          const glyph = h('span', { class: 'lc-playbar-start-icon' });
          glyph.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.9-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>';
          return glyph;
        })(),
      ),
    );

  const pausePlayback = () => {
    if (!playingAll || paused || !session) return;
    paused = true;
    clearTimeout(session.gapTimer);
    session.gapTimer = null;
    if (pauseSpeaking()) pausePoint = 'speech';
    else pausePoint = 'gap';
    drawPlaybar();
  };

  const resumePlayback = () => {
    if (!playingAll || !paused || !session) return;
    paused = false;
    const check = pausePoint === 'guess' ? session.checkGuess : null;
    session.checkGuess = null;
    if (pausePoint === 'speech') resumeSpeaking();
    else if (check) check();
    else session.next();
    pausePoint = 'none';
    drawPlaybar();
  };

  const drawPlaybar = () => {
    repeatCycleBtn.disabled = playingAll;
    delayCycleBtn.disabled = playingAll;
    loopToggle.disabled = playingAll;
    if (shuffleToggle) shuffleToggle.disabled = playingAll;
    for (const toggle of featureToggles) toggle.disabled = playingAll;
    const transport = playingAll
      ? paused
        ? [resumeButton(), stopAllButton()]
        : [pauseButton(), stopAllButton()]
      : [playAllButton(), onCardView ? cardViewButton() : null];
    playbarTransport.replaceChildren(...transport.filter(Boolean));
    playbarOptions.replaceChildren(
      repeatCycleBtn,
      delayCycleBtn,
      ...(shuffleToggle ? [shuffleToggle] : []),
      loopToggle,
      ...featureToggles,
    );
    syncFollowBtn();
  };

  const syncPlaybackTransport = () => {
    const atStart = playPosRef <= 0;
    const atEnd = playPosRef >= orderRef.length - 1;
    syncBottomPlaybackButtons({
      canPrev: loopEnabledRef || !atStart,
      canNext: loopEnabledRef || !atEnd,
    });
  };

  let onPlaybackRowsChanged = () => {};

  const beginPlayback = (fromFlatIndex = startIndex) => {
    stopLinesPlayback();
    let rows = getPlaybackRows();
    if (!rows.length) return;
    let startPos = rows.findIndex((row) => row.index >= fromFlatIndex);
    if (startPos < 0) startPos = 0;
    startIndex = rows[startPos].index;
    onPickIndex?.(startIndex);

    let order = buildPlaybackOrder(rows.length, startPos, shuffleOption && shuffleEnabled);
    let playPos = 0;
    rowsRef = rows;
    orderRef = order;
    playPosRef = playPos;
    loopEnabledRef = loopEnabled;
    let repeatsLeft = timesPerItem;
    let active = true;
    // Bumped when the line changes or speech is cut (prev/next/stop) so stale TTS callbacks cannot advance.
    let speakGeneration = 0;
    linesFollowScroll = true;
    syncFollowBtn();
    setLessonWakeLock(true);
    paused = false;
    pausePoint = 'none';
    session = { gapTimer: null, next: null };

    const invalidateSpeak = () => {
      speakGeneration += 1;
    };

    const stop = () => {
      active = false;
      invalidateSpeak();
      clearTimeout(session.gapTimer);
      clearTimeout(linesScrollLockTimer);
      clearTimeout(linesScrollSpeakTimer);
      stopLinesPlaybackFn = null;
      session = null;
      playbackStepRelative = () => {};
      onPlaybackRowsChanged = () => {};
      rowsRef = [];
      orderRef = [];
      playPosRef = 0;
      linesIsPlaying = false;
      notifyLinesPlaybackUi();
      stopSpeaking();
      playingAll = false;
      paused = false;
      pausePoint = 'none';
      setLessonWakeLock(false);
      onLine(null, linePlaybackContext());
      syncProgress();
      syncFollowBtn();
      syncBottomPlaybackButtons({ canPrev: false, canNext: false });
      drawPlaybar();
    };

    const stepRelative = (delta) => {
      if (!active || !session || !orderRef.length) return;
      invalidateSpeak();
      clearTimeout(session.gapTimer);
      session.gapTimer = null;
      stopSpeaking();
      paused = false;
      pausePoint = 'none';
      let nextPos = playPos + delta;
      if (loopEnabledRef) {
        if (nextPos < 0) nextPos = orderRef.length - 1;
        if (nextPos >= orderRef.length) nextPos = 0;
      } else {
        nextPos = Math.min(Math.max(nextPos, 0), orderRef.length - 1);
      }
      playPos = nextPos;
      playPosRef = playPos;
      repeatsLeft = timesPerItem;
      order = orderRef;
      rows = rowsRef;
      const item = rows[order[playPos]];
      startIndex = item.index;
      onPickIndex?.(startIndex);
      syncPlaybackTransport();
      next();
    };

    playbackStepRelative = stepRelative;

    onPlaybackRowsChanged = () => {
      if (!active) return;
      if (!shuffleOption || !shuffleEnabled) return;
      rows = getPlaybackRows();
      rowsRef = rows;
      if (!rows.length) {
        stop();
        return;
      }
      order = buildPlaybackOrder(rows.length, 0, true);
      orderRef = order;
      playPos = 0;
      playPosRef = 0;
      repeatsLeft = timesPerItem;
      startIndex = rows[order[0]]?.index ?? rows[0].index;
      onPickIndex?.(startIndex);
      invalidateSpeak();
      clearTimeout(session.gapTimer);
      session.gapTimer = null;
      stopSpeaking();
      paused = false;
      pausePoint = 'none';
      syncPlaybackTransport();
      next();
    };

    const buildSpeakParts = (text) => {
      const baseSlow = speakSlow();
      const ctx = linePlaybackContext();
      if (!ctx.longSentence) return [{ text, slow: baseSlow }];
      const focus = focusPhraseForSentence(text);
      if (!focus) return [{ text, slow: baseSlow }];
      return [{ text, slow: true }, { text: focus, slow: true }];
    };

    const finishPass = () => {
      if (loopEnabled && active) {
        order = buildPlaybackOrder(rows.length, 0, shuffleOption && shuffleEnabled);
        orderRef = order;
        playPos = 0;
        playPosRef = playPos;
        startIndex = rows[order[0]]?.index ?? rows[0].index;
        repeatsLeft = timesPerItem;
        onPickIndex?.(startIndex);
        syncPlaybackTransport();
        next();
        return;
      }
      stop();
    };

    const scheduleAfterLine = (advanceToNextRow, gen) => {
      if (!active || paused || gen !== speakGeneration) return;
      if (advanceToNextRow) {
        playPos += 1;
        playPosRef = playPos;
        repeatsLeft = timesPerItem;
        syncPlaybackTransport();
      }
      const wait = gapMs();
      if (wait <= 0) {
        session.gapTimer = null;
        queueMicrotask(() => {
          if (gen !== speakGeneration) return;
          next();
        });
        return;
      }
      session.gapTimer = setTimeout(() => {
        if (!active || paused || gen !== speakGeneration) return;
        next();
      }, wait);
    };

    const next = () => {
      if (!active || paused) return;
      if (playPos >= order.length) return finishPass();
      speakGeneration += 1;
      const gen = speakGeneration;
      playPosRef = playPos;
      orderRef = order;
      rowsRef = rows;
      loopEnabledRef = loopEnabled;
      const item = rows[order[playPos]];
      session.currentLineIndex = item.index;
      syncProgress(playPos);
      syncPlaybackTransport();
      const lineCtx = linePlaybackContext();
      onLine(item.index, lineCtx);
      const parts = buildSpeakParts(item.english);
      let partIndex = 0;

      const afterLineSpoken = () => {
        if (!active || paused || gen !== speakGeneration) return;
        repeatsLeft -= 1;
        if (repeatsLeft > 0) {
          scheduleAfterLine(false, gen);
          return;
        }
        // A quiz row: the capital city has been read, now the learner guesses the answers. Playback waits here.
        if (item.entry?.quiz) {
          paused = true;
          pausePoint = 'guess';
          session.checkGuess = () => {
            onGuessCheck?.(item.index);
            scheduleAfterLine(true, gen);
          };
          onGuessWait?.(item.index);
          drawPlaybar();
          return;
        }
        scheduleAfterLine(true, gen);
      };

      const speakNextPart = () => {
        if (!active || paused || gen !== speakGeneration) return;
        if (partIndex >= parts.length) {
          afterLineSpoken();
          return;
        }
        const part = parts[partIndex];
        partIndex += 1;
        if (
          !speak(part.text, {
            slow: part.slow,
            onEnd: () => {
              if (!active || paused || gen !== speakGeneration) return;
              speakNextPart();
            },
          })
        ) {
          finishPass();
        }
      };

      const startSpeaking = () => {
        if (!active || paused || gen !== speakGeneration) return;
        speakNextPart();
      };

      Promise.resolve(waitBeforeSpeak?.(item.index, lineCtx)).then(() => {
        if (gen !== speakGeneration) return;
        startSpeaking();
      });
    };

    session.next = next;

    stopLinesPlaybackFn = stop;
    playingAll = true;
    linesIsPlaying = true;
    notifyLinesPlaybackUi();
    drawPlaybar();
    syncProgress(playPos);
    syncPlaybackTransport();
    next();
  };

  const pickLine = (flatIndex) => {
    const rows = getPlaybackRows();
    if (!rows.length) return;
    startIndex = flatIndex;
    onPickIndex?.(flatIndex);
    syncProgress();
    if (playingAll) beginPlayback(flatIndex);
  };

  drawPlaybar();
  syncProgress();

  const element = canSpeak()
    ? h(
        'div',
        { class: 'lc-playbar', role: 'toolbar', 'aria-label': ariaLabel },
        h('div', { class: 'lc-playbar-inner' }, playbarActions),
      )
    : null;

  return {
    element,
    pickLine,
    autoSpeakCardOn: () => autoSpeakCardFeature && autoSpeakOnCard,
    // The visible rows changed (a search, a category): the counter follows them. While a playback runs, its own counter stays.
    onPlaybackRowsChanged: () => {
      if (!playingAll) syncProgress();
      onPlaybackRowsChanged();
    },
  };
}

export function linesPage({
  groups,
  speakLabel = 'Read aloud',
  note = true,
  playbarLabel = 'Listen to all lines',
  playTitle = 'Play all lines slowly',
  shuffle = false,
  playbarFeatures = {},
  search = false,
  // Category chips under the search (words): a row with a `category` is filtered by its chip. "All" shows every row.
  categories = false,
  playbar: showPlaybar = true,
  // false: no English / Persian switch; both sides are always shown (grammar pages).
  modeSwitch = true,
}) {
  const deckPlayback = Boolean(playbarFeatures.deckPlayback);
  const deckFullscreen = deckPlayback && playbarFeatures.deckFullscreen !== false;
  const deckRich = deckPlayback && Boolean(playbarFeatures.deckRich);
  let mode = modeSwitch ? 'english' : 'both';
  let searchQuery = '';
  let categoryFilter = 'all';
  let deckLastIndex = null;
  const revealed = new Set();
  const body = h('div', { class: 'lc-groups' });
  const itemByKey = new Map();
  let highlightKey = null;
  let activePlayKey = null;
  // The quiz row playback is waiting on (its answers are guessed, not yet checked), or null.
  let guessKey = null;
  let pickIndex = 0;
  let lastAutoRevealedKey = null;
  let playbarPickLine = () => {};
  let playbarOnRowsChanged = () => {};
  let playbarAutoSpeakCardOn = () => false;
  let playbarEl = null;
  let playbackRowsFingerprint = '';

  const modeButtons = MODES.map(([value, label]) => ({
    value,
    element: h(
      'button',
      {
        type: 'button',
        class: `chip-toggle lc-mode lc-mode-${value}`,
        onclick: () => {
          stopLinesPlayback();
          mode = value;
          revealed.clear();
          draw();
        },
      },
      label,
    ),
  }));

  const syncPickMarkers = () => {
    const key = flatRows[pickIndex]?.key;
    for (const [rowKey, li] of itemByKey) {
      li.classList.toggle('is-pick', rowKey === key && !linesIsPlaying);
    }
  };

  // A quiz row (see quiz in lesson_content): its capital city is always shown. Its answers (country, nationality)
  // stay hidden until the eye or the playback check shows them. Returns null for other rows.
  const quizAnswers = (entry, key) => {
    if (!entry.quiz) return null;
    const isRevealed = revealed.has(key);
    const guessing = guessKey === key;
    return h(
      'div',
      { class: `lc-quiz${guessing ? ' is-guessing' : ''}` },
      ...entry.quiz.map((answer) =>
        h(
          'div',
          { class: 'lc-quiz-line' },
          h('span', { class: 'lc-quiz-label' }, answer.label),
          isRevealed
            ? h(
                'span',
                { class: 'lc-quiz-answer' },
                h('strong', { class: 'lc-word', dir: 'ltr' }, answer.word),
                answer.ipa ? h('span', { class: 'lc-ipa', dir: 'ltr' }, answer.ipa) : null,
                answer.meaning ? h('span', { class: 'lc-sub', dir: 'rtl' }, answer.meaning) : null,
                speakButtons(answer.word, { label: speakLabel }),
              )
            : h('span', { class: 'lc-hidden', dir: 'ltr' }, '• • • • • •'),
        ),
      ),
      guessing ? h('p', { class: 'lc-quiz-hint' }, 'Guess the answers, then press Play to check.') : null,
    );
  };

  const row = (entry, key, flatIndex) => {
    const englishShown = Boolean(entry.quiz) || mode !== 'persian' || revealed.has(key);
    const persianShown = mode !== 'english' || revealed.has(key);
    // The eye is only useful when something is hidden for this row. A quiz row's eye shows its answers.
    const hasHidden = Boolean(entry.quiz) || mode === 'persian' || (mode === 'english' && Boolean(entry.persian));
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

    // Word rows always get the same two lines (Synonyms, Opposite); a line with nothing in this lesson shows a dash.
    const isWordRow = entry.synonyms !== undefined || entry.antonyms !== undefined;
    const relationLine = (label, words, kind) =>
      h(
        'div',
        { class: `lc-rel-line lc-rel-line-${kind}` },
        h('span', { class: 'lc-rel-label' }, label),
        words?.length
          ? h(
              'span',
              { class: 'lc-rel-chips', dir: 'ltr' },
              ...words.map((word) => h('span', { class: `lc-rel-chip lc-rel-chip-${kind}` }, word)),
            )
          : h('span', { class: 'lc-rel-empty' }, '—'),
      );
    // Only the relations this word really has are shown: no empty "Synonyms —" or "Opposite —" line.
    const relationLines = [
      entry.synonyms?.length ? relationLine('Synonyms', entry.synonyms, 'syn') : null,
      entry.antonyms?.length ? relationLine('Opposite', entry.antonyms, 'ant') : null,
    ].filter(Boolean);
    const relations =
      isWordRow && englishShown && relationLines.length
        ? h('div', { class: 'lc-relations' }, ...relationLines)
        : null;

    return h(
      'li',
      {
        class: `lc-item${isWordRow ? ' lc-item-rich' : ''}${highlightKey === key ? ' is-reading' : ''}${activePlayKey === key ? ' is-active-play' : ''}${pickIndex === flatIndex && !linesIsPlaying ? ' is-pick' : ''}`,
        onclick: (event) => {
          if (event.target.closest('button')) return;
          playbarPickLine(flatIndex);
        },
      },
      h(
        'span',
        { class: 'lc-main' },
        englishShown
          ? h('strong', { class: 'lc-word', dir: 'ltr' }, entry.english)
          : h('span', { class: 'lc-hidden', dir: 'ltr' }, '• • • • • •'),
        englishShown && entry.ipa ? h('span', { class: 'lc-ipa', dir: 'ltr' }, entry.ipa) : null,
        // Word rows keep the Persian meaning under the word; sentences and rules get their own box below.
        isWordRow && entry.persian
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
      relations,
      quizAnswers(entry, key),
      !isWordRow && entry.persian
        ? h(
            'div',
            { class: 'lc-trans', dir: 'rtl' },
            persianShown
              ? h('span', { class: 'lc-trans-text' }, entry.persian)
              : h('span', { class: 'lc-hidden' }, '• • • • •'),
          )
        : null,
    );
  };

  // Each group's list is made once. A redraw only swaps its rows, so the list keeps the scroll position the reader
  // had when they tapped an eye or a mode.
  const shown = groups.filter((group) => group.rows.length > 0);
  const lists = shown.map(() => h('ul', { class: 'lc-list' }));
  const groupSections = shown.map((group, groupIndex) =>
    h(
      'section',
      { class: 'lc-group' },
      group.title ? h('h4', { class: 'lc-group-title', dir: 'auto' }, group.title) : null,
      group.explanation ? h('p', { class: 'lc-explain', dir: 'auto' }, group.explanation) : null,
      lists[groupIndex],
    ),
  );
  body.replaceChildren(...groupSections);

  const setHighlight = (key) => {
    highlightKey = key;
    for (const [rowKey, li] of itemByKey) {
      li.classList.toggle('is-reading', rowKey === key);
    }
  };

  const setActivePlay = (key) => {
    activePlayKey = key;
    for (const [rowKey, li] of itemByKey) {
      li.classList.toggle('is-active-play', rowKey === key);
    }
  };

  const syncFocusDim = (ctx, playing) => {
    const dim = Boolean(playing && ctx?.dimOthers);
    lists.forEach((ul) => ul.classList.toggle('lc-focus-playback', dim));
  };

  const refreshRow = (key) => {
    const flatIndex = flatRows.findIndex((row) => row.key === key);
    if (flatIndex < 0) return;
    const { entry } = flatRows[flatIndex];
    const newLi = row(entry, key, flatIndex);
    const oldLi = itemByKey.get(key);
    if (oldLi?.parentNode) {
      oldLi.replaceWith(newLi);
      itemByKey.set(key, newLi);
    }
  };

  const hidePlaybackReveal = (key) => {
    if (!key) return;
    if (revealed.delete(key)) refreshRow(key);
  };

  const notifyPlaybackRowsMaybeChanged = () => {
    const fingerprint = getPlaybackRows().map((row) => row.key).join('\0');
    if (fingerprint === playbackRowsFingerprint) return;
    playbackRowsFingerprint = fingerprint;
    playbarOnRowsChanged();
  };

  const draw = () => {
    for (const { value, element } of modeButtons) {
      element.classList.toggle('active', value === mode);
      element.setAttribute('aria-pressed', String(value === mode));
    }
    for (const { value, element } of categoryButtons) {
      element.classList.toggle('active', value === categoryFilter);
      element.setAttribute('aria-pressed', String(value === categoryFilter));
    }
    itemByKey.clear();
    let visibleRowCount = 0;
    shown.forEach((group, groupIndex) => {
      const items = [];
      group.rows.forEach((entry, rowIndex) => {
        if (!matchesFilters(entry)) return;
        visibleRowCount += 1;
        const key = `${groupIndex}:${rowIndex}`;
        const flatIndex = flatRows.findIndex((row) => row.key === key);
        const li = row(entry, key, flatIndex);
        itemByKey.set(key, li);
        items.push(li);
      });
      lists[groupIndex].replaceChildren(...items);
      groupSections[groupIndex].hidden = items.length === 0;
    });
    if (searchEmpty) {
      searchEmpty.hidden = !searchQuery.trim() || visibleRowCount > 0;
    }
    syncPickMarkers();
    if (playbarEl) playbarEl.hidden = !getPlaybackRows().length;
    notifyPlaybackRowsMaybeChanged();
  };

  const flatRows = shown.flatMap((group, groupIndex) =>
    group.rows.map((entry, rowIndex) => ({ entry, key: `${groupIndex}:${rowIndex}` })),
  );

  const isEnglishVisible = (key) => mode !== 'persian' || revealed.has(key);

  // A quiz row's capital city is always shown, so it is always read (see isEnglishVisible).
  const getPlaybackRows = () =>
    flatRows
      .map((row, flatIndex) => ({ english: row.entry.english, index: flatIndex, key: row.key, entry: row.entry }))
      .filter((row) => (row.entry.quiz || isEnglishVisible(row.key)) && matchesFilters(row.entry));

  // The one rule for which rows show. The category, the search and the list, the play bar and the card view all use it.
  const matchesFilters = (entry) =>
    (categoryFilter === 'all' || entry.category === categoryFilter) && rowMatchesLessonSearch(entry, searchQuery);

  let categoryBar = null;
  let categoryButtons = [];
  const categoryNames = categories
    ? [...new Set(groups.flatMap((group) => group.rows.map((row) => row.category)).filter(Boolean))]
    : [];
  if (categoryNames.length) {
    categoryButtons = [['all', 'All'], ...categoryNames.map((name) => [name, name])].map(([value, label]) => ({
      value,
      element: h(
        'button',
        {
          type: 'button',
          class: 'chip-toggle lc-cat-btn',
          onclick: () => {
            stopLinesPlayback();
            categoryFilter = value;
            draw();
          },
        },
        label,
      ),
    }));
    categoryBar = h(
      'div',
      { class: 'chips lc-cats', role: 'group', 'aria-label': 'Filter the list by category' },
      ...categoryButtons.map((entry) => entry.element),
    );
  }

  let searchBar = null;
  let searchEmpty = null;
  if (search) {
    const searchInput = h('input', {
      type: 'search',
      class: 'lc-search-input',
      placeholder: 'Search English or Persian…',
      'aria-label': 'Search the list',
      autocomplete: 'off',
      enterkeyhint: 'search',
      oninput: (event) => {
        searchQuery = event.target.value;
        draw();
      },
    });
    searchBar = h('div', { class: 'lc-search' }, searchInput);
    searchEmpty = h('p', { class: 'lc-search-empty muted small', hidden: true }, 'No matches for your search.');
  }

  draw();

  const scrollToRow = (key) => {
    if (deckPlayback && linesIsPlaying) return;
    if (!linesFollowScroll) return;
    const li = itemByKey.get(key);
    if (!li) return;
    linesScrollLock = true;
    clearTimeout(linesScrollLockTimer);
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    linesScrollLockTimer = setTimeout(() => {
      linesScrollLock = false;
    }, 1000);
  };

  const deckStage = h('div', { class: 'lc-deck-stage', hidden: true });
  const playbarHome = h('div', { class: 'lc-playbar-home' });
  let deckPlaybarFooter = null;
  let deckSession = null;
  let deckWrap = null;
  // Card view: the learner opens the card and moves/listens by hand. Nothing advances by itself.
  let manualOpen = false;
  let manualIndex = null;
  let manualPrevBtn = null;
  let manualNextBtn = null;
  let manualBar = null;
  if (deckPlayback && deckFullscreen) {
    deckPlaybarFooter = h('div', { class: 'lc-deck-session-footer' });
    manualPrevBtn = h(
      'button',
      { type: 'button', class: 'lc-manual-btn', onclick: () => manualStep(-1) },
      h('span', { class: 'lc-manual-icon' }, '‹'),
      'Previous',
    );
    manualNextBtn = h(
      'button',
      { type: 'button', class: 'lc-manual-btn', onclick: () => manualStep(1) },
      'Next',
      h('span', { class: 'lc-manual-icon' }, '›'),
    );
    manualBar = h(
      'div',
      { class: 'lc-manual-bar', hidden: true },
      manualPrevBtn,
      manualNextBtn,
    );
    deckPlaybarFooter.append(manualBar);
    deckSession = h(
      'div',
      { class: 'lc-deck-session', hidden: true },
      h('div', { class: 'lc-deck-session-main' }, deckStage),
      deckPlaybarFooter,
    );
    // In the card view a horizontal swipe moves to the next (swipe left) or the previous (swipe right) word.
    // Vertical movement is left to the page's scrolling, and the buttons keep their own taps.
    let swipeStart = null;
    deckSession.addEventListener('pointerdown', (event) => {
      if (!manualOpen || event.button > 0 || event.target.closest('button, a, input, textarea')) {
        swipeStart = null;
        return;
      }
      swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    deckSession.addEventListener('pointerup', (event) => {
      if (!swipeStart || event.pointerId !== swipeStart.id) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      manualStep(dx < 0 ? 1 : -1);
    });
    deckSession.addEventListener('pointercancel', () => {
      swipeStart = null;
    });
  } else if (deckPlayback) {
    deckWrap = h('div', { class: 'lc-deck' }, deckStage);
  }

  // The footer shows the playbar while the list plays, and the manual controls in the card view.
  // The counter ("1 / 201") lives beside the search. It moves into the playbar only while the playbar is in the footer.
  let playbarMetaEl = null;

  const dockPlaybar = (inSession) => {
    if (!deckPlaybarFooter) return;
    const playing = linesIsPlaying;
    const showPlaybar = inSession && playing && playbarEl;
    if (playbarEl) {
      (showPlaybar ? deckPlaybarFooter : playbarHome).append(playbarEl);
      playbarEl.classList.toggle('lc-playbar-docked', Boolean(showPlaybar));
      if (playbarMetaEl) {
        if (showPlaybar) playbarEl.querySelector('.lc-playbar-top')?.append(playbarMetaEl);
        else searchBar?.append(playbarMetaEl);
      }
    }
    if (manualBar) manualBar.hidden = !(inSession && manualOpen && !playing);
  };

  // The card view walks every row (only the search applies), so hiding or revealing a translation never
  // removes the current card from the walk. The learner reveals by hand inside the card.
  const manualRows = () =>
    flatRows
      .map((row, flatIndex) => ({ index: flatIndex, key: row.key, entry: row.entry }))
      .filter((row) => matchesFilters(row.entry));

  // Position of the current card and the neighbouring rows. If the current card is not in the walk
  // (for example after a search change), the neighbours are the rows just before and just after it.
  const manualNeighbours = (rows) => {
    const pos = rows.findIndex((row) => row.index === manualIndex);
    if (pos >= 0) return { pos, prev: pos - 1, next: pos + 1 };
    const after = rows.findIndex((row) => row.index > manualIndex);
    const insertAt = after < 0 ? rows.length : after;
    return { pos: -1, prev: insertAt - 1, next: insertAt };
  };

  const syncManualButtons = () => {
    const rows = manualRows();
    const { prev, next } = manualNeighbours(rows);
    if (manualPrevBtn) manualPrevBtn.disabled = prev < 0;
    if (manualNextBtn) manualNextBtn.disabled = next >= rows.length;
  };

  const manualStep = (delta) => {
    const rows = manualRows();
    if (!rows.length) return;
    const { prev, next } = manualNeighbours(rows);
    const target = delta < 0 ? prev : next;
    if (target < 0 || target >= rows.length) return;
    manualIndex = rows[target].index;
    pickIndex = manualIndex;
    syncPickMarkers();
    showDeckLine(manualIndex, 'initial');
    readManualCard();
    syncManualButtons();
  };

  // Auto read (card view): the card's English is read once when the learner arrives at it.
  // Only navigation calls this, so turning the eye on or off on the same card does not read it again.
  const readManualCard = () => {
    if (!playbarAutoSpeakCardOn() || manualIndex === null) return;
    const row = flatRows[manualIndex];
    if (row) speak(row.entry.english);
  };

  const openManual = () => {
    if (linesIsPlaying || !deckFullscreen || manualOpen) return;
    const rows = manualRows();
    if (!rows.length) return;
    manualIndex = rows.some((row) => row.index === pickIndex) ? pickIndex : rows[0].index;
    manualOpen = true;
    deckLastIndex = null;
    if (!cardViewEntry) {
      history.pushState({ cardView: true }, '', location.href);
      cardViewEntry = true;
    }
    // While the card view is open, the header back button closes it (instead of leaving the lesson).
    const btn = document.querySelector('.topbar-back');
    if (btn && !btn.hidden) {
      const handler = () => closeManual('header');
      cardViewHeader = { btn, previous: btn.onclick, handler };
      btn.onclick = handler;
    }
    showDeckLine(manualIndex, 'initial');
    readManualCard();
    linesAutoplayUiSync();
    syncManualButtons();
  };

  /**
   * reason: 'header' (the header back button: the history entry is removed here), 'back' (the browser's back
   * button already removed it), or 'leave' (the page is left: nothing in the history is touched).
   */
  const closeManual = (reason = 'leave') => {
    restoreCardViewHeader();
    const hadEntry = cardViewEntry;
    cardViewEntry = false;
    if (!manualOpen) return;
    manualOpen = false;
    manualIndex = null;
    deckLastIndex = null;
    stopSpeaking(); // a card still being read aloud must not go on after the card view is closed
    clearDeckStage();
    linesAutoplayUiSync();
    if (reason === 'header' && hadEntry) {
      cardViewRemovingEntry = true;
      history.back();
    }
  };

  stopManualFn = () => closeManual('leave');
  closeManualFn = closeManual;

  const scrollDeckIntoView = () => {
    if (deckFullscreen || !deckWrap) return;
    window.requestAnimationFrame(() => {
      deckWrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let refreshDeckCard = () => {};

  // A synonym or opposite: the word with its own speaker (normal and slow), as a sentence has in the list.
  // Same card as a sentence (see deckExampleRow): the word, and its speakers floating at the top-right.
  const deckWordChip = (word) => {
    const buttons = [
      speakActionButton('normal', 'Read aloud', () => speak(word)),
      speakActionButton('slow', 'Read slowly', () => speak(word, { slow: true })),
    ].filter(Boolean);
    return h(
      'div',
      { class: 'lc-deck-example' },
      h(
        'div',
        { class: 'lc-deck-en-actions lc-deck-example-actions' },
        h('span', { class: 'speak-buttons' }, ...buttons),
      ),
      h('p', { class: 'lc-deck-example-en', dir: 'ltr' }, word),
    );
  };

  const deckChipRow = (title, items) => {
    if (!items?.length) return null;
    return h(
      'div',
      { class: 'lc-deck-section' },
      h('h5', { class: 'lc-deck-section-title' }, title),
      h('div', { class: 'lc-deck-chips', dir: 'ltr' }, ...items.map((word) => deckWordChip(word))),
    );
  };

  // One example sentence: the same row as a sentence in the list (English with a floating speaker and eye,
  // the translation in its own box under it). The eye and the mode work the same way as on the list.
  const deckExampleRow = (line, exKey) => {
    let node = null;
    const build = () => {
      const englishShown = mode !== 'persian' || revealed.has(exKey);
      const persianShown = mode !== 'english' || revealed.has(exKey);
      const isRevealed = revealed.has(exKey);
      const hasHidden = mode === 'persian' || (mode === 'english' && Boolean(line.persian));
      const eyeGlyph = h('span', { class: 'lc-eye-glyph' });
      eyeGlyph.innerHTML = isRevealed ? EYE_OFF_ICON : EYE_ICON;
      const eye = hasHidden
        ? keepFocus(
            h(
              'button',
              {
                type: 'button',
                class: `lc-deck-eye${isRevealed ? ' on' : ''}`,
                'aria-pressed': String(isRevealed),
                'aria-label': isRevealed ? 'Hide' : 'Show the hidden text',
                title: isRevealed ? 'Hide' : 'Show the hidden text',
                onclick: () => {
                  if (isRevealed) revealed.delete(exKey);
                  else revealed.add(exKey);
                  // Only this sentence is redrawn, so the card keeps its scroll position.
                  const next = build();
                  node?.replaceWith(next);
                  node = next;
                },
              },
              eyeGlyph,
            ),
          )
        : null;
      return h(
        'li',
        { class: 'lc-deck-example' },
        h(
          'div',
          { class: 'lc-deck-en-actions lc-deck-example-actions' },
          eye,
          englishShown ? speakButtons(line.english, { label: speakLabel }) : null,
        ),
        englishShown
          ? h('p', { class: 'lc-deck-example-en', dir: 'ltr' }, line.english)
          : h('p', { class: 'lc-deck-example-en lc-deck-hidden', dir: 'ltr' }, '• • • • • •'),
        line.persian
          ? persianShown
            ? h('div', { class: 'lc-deck-example-fa', dir: 'rtl' }, line.persian)
            : h('div', { class: 'lc-deck-example-fa lc-deck-hidden', dir: 'rtl' }, '• • • • •')
          : null,
      );
    };
    node = build();
    return node;
  };

  const deckExamplesBlock = (examples, key) => {
    if (!examples?.length) return null;
    return h(
      'div',
      { class: 'lc-deck-section lc-deck-examples' },
      h('h5', { class: 'lc-deck-section-title' }, 'In sentences'),
      h(
        'ul',
        { class: 'lc-deck-example-list' },
        ...examples.map((line, i) => deckExampleRow(line, `${key}#${i}`)),
      ),
    );
  };

  const buildDeckCard = (entry, key, flatIndex) => {
    const englishShown = Boolean(entry.quiz) || mode !== 'persian' || revealed.has(key);
    const persianShown = mode !== 'english' || revealed.has(key);
    const persianHiddenByMode = Boolean(entry.persian) && mode === 'english';
    const isRevealed = revealed.has(key);

    const eyeGlyph = h('span', { class: 'lc-eye-glyph' });
    eyeGlyph.innerHTML = isRevealed ? EYE_OFF_ICON : EYE_ICON;
    // The playback screen has no eye or speaker on the card: the line is read and revealed by playback itself.
    // A quiz row's eye shows its answers, not a translation.
    const quizEye = Boolean(entry.quiz) && (!deckFullscreen || manualOpen);
    const deckEye = quizEye || (persianHiddenByMode && (!deckFullscreen || manualOpen))
      ? keepFocus(
          h(
            'button',
            {
              type: 'button',
              class: `lc-deck-eye${isRevealed ? ' on' : ''}`,
              'aria-pressed': String(isRevealed),
              'aria-label': entry.quiz
                ? isRevealed ? 'Hide the answers' : 'Show the answers'
                : isRevealed ? 'Hide translation' : 'Show translation',
              title: entry.quiz
                ? isRevealed ? 'Hide the answers' : 'Show the answers'
                : isRevealed ? 'Hide translation' : 'Show translation',
              onclick: () => {
                if (isRevealed) revealed.delete(key);
                else revealed.add(key);
                refreshRow(key);
                refreshDeckCard(flatIndex);
              },
            },
            eyeGlyph,
          ),
        )
      : null;

    const enContent = h(
      'div',
      { class: 'lc-deck-content', dir: 'ltr' },
      englishShown
        ? h('p', { class: 'lc-deck-en' }, entry.english)
        : h('p', { class: 'lc-deck-en lc-deck-hidden' }, '• • • • • •'),
      englishShown && entry.ipa ? h('span', { class: 'lc-deck-ipa' }, entry.ipa) : null,
    );

    const faBlock =
      entry.persian && persianShown
        ? h('div', { class: 'lc-deck-fa-block', dir: 'rtl' }, h('p', { class: 'lc-deck-fa' }, entry.persian))
        : entry.persian && persianHiddenByMode && !persianShown
          ? h('div', { class: 'lc-deck-fa-block lc-deck-fa-hidden', dir: 'rtl' }, h('p', { class: 'lc-deck-fa lc-deck-hidden' }, '• • • • •'))
          : null;

    const enActions = deckFullscreen && !manualOpen
      ? null
      : h(
          'div',
          { class: 'lc-deck-en-actions' },
          deckEye,
          englishShown ? speakButtons(entry.english, { label: speakLabel }) : null,
        );

    const richSections = deckRich
      ? [
          deckChipRow('Synonyms', entry.synonyms),
          deckChipRow('Opposite', entry.antonyms),
          deckExamplesBlock(entry.examples, key),
        ].filter(Boolean)
      : [];

    // In the card view the buttons sit in a footer band at the bottom of the card, apart from the English and the translation.
    // The position in the list ("3 / 170"), small, at the bottom-left of the card footer.
    let cardCount = null;
    if (enActions) {
      // Same walk as the card view's Previous/Next (every row, only the search applies).
      const rows = flatRows
        .map((row, index) => ({ index, entry: row.entry }))
        .filter((row) => matchesFilters(row.entry));
      const pos = rows.findIndex((row) => row.index === flatIndex);
      cardCount = h('span', { class: 'lc-deck-count' }, pos >= 0 ? `${pos + 1} / ${rows.length}` : '');
    }
    const cardFooter = enActions ? h('div', { class: 'lc-deck-card-footer' }, cardCount, enActions) : null;
    // In the card view the sections (synonyms, opposite, sentences) are not inside the card: they come below it,
    // so the card with its buttons stays at the top and the sections scroll under it.
    const sections = deckFullscreen && richSections.length ? h('div', { class: 'lc-deck-sections' }, ...richSections) : null;
    const inner = deckFullscreen
      ? h(
          'div',
          { class: 'lc-deck-card-inner' },
          h('div', { class: 'lc-deck-hero' }, h('div', { class: 'lc-deck-main-row' }, enContent)),
          faBlock,
          quizAnswers(entry, key),
          cardFooter,
        )
      : h(
          'div',
          { class: 'lc-deck-card-inner' },
          h('div', { class: 'lc-deck-en-block' }, h('div', { class: 'lc-deck-main-row' }, deckEye, enContent)),
          faBlock,
          quizAnswers(entry, key),
        );

    const card = h(
      'div',
      {
        class: `lc-deck-card${deckRich ? ' lc-deck-card-rich' : ''}${deckFullscreen ? ' lc-deck-card-fs' : ''}`,
        role: 'status',
        'aria-live': 'polite',
      },
      inner,
    );
    // The wrapper carries the card-view class too: the buttons and sections are styled by it (see app.css).
    return deckFullscreen ? h('div', { class: 'lc-deck-fs-wrap lc-deck-card-fs' }, card, sections) : card;
  };

  refreshDeckCard = (flatIndex) => {
    const row = flatRows[flatIndex];
    if (!row || !deckStage) return;
    deckStage.replaceChildren(buildDeckCard(row.entry, row.key, flatIndex));
  };

  const clearDeckStage = () => {
    deckStage.replaceChildren();
    deckStage.hidden = true;
  };

  const showDeckLine = (flatIndex, motion) => {
    const { entry, key } = flatRows[flatIndex];
    const incoming = buildDeckCard(entry, key, flatIndex);
    deckStage.hidden = false;

    if (deckFullscreen) {
      deckStage.replaceChildren(incoming);
      return;
    }

    const current = deckStage.querySelector('.lc-deck-card');
    const reduced = prefersReducedMotion();

    if (!current || motion === 'initial' || reduced) {
      deckStage.replaceChildren(incoming);
      if (!reduced) incoming.classList.add('lc-deck-enter');
      scrollDeckIntoView();
      return;
    }

    const exitClass = motion === 'back' ? 'lc-deck-exit-restore' : 'lc-deck-exit';
    current.classList.add(exitClass);
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      if (current.isConnected) current.remove();
      incoming.classList.add(motion === 'back' ? 'lc-deck-enter-back' : 'lc-deck-enter');
      deckStage.append(incoming);
      scrollDeckIntoView();
    };
    current.addEventListener('animationend', swap, { once: true });
    window.setTimeout(swap, 380);
  };

  const pickRowOnly = (flatIndex) => {
    pickIndex = flatIndex;
    syncPickMarkers();
    const key = flatRows[flatIndex]?.key;
    if (key) scrollToRow(key);
  };

  let playbar = null;
  if (showPlaybar) {
  const playbarApi = createLessonPlaybar({
    ariaLabel: playbarLabel,
    playTitle,
    shuffle,
    playbarFeatures,
    onCardView: deckFullscreen ? () => openManual() : null,
    getPlaybackRows,
    onLine: (index, ctx) => {
      // A guess that is not checked any more (the playback moved on or stopped) goes back to hidden.
      if (guessKey && (index === null || flatRows[index]?.key !== guessKey)) {
        const stale = guessKey;
        guessKey = null;
        refreshRow(stale);
      }
      if (index === null) {
        if (lastAutoRevealedKey) {
          hidePlaybackReveal(lastAutoRevealedKey);
          lastAutoRevealedKey = null;
        }
        setHighlight(null);
        setActivePlay(null);
        syncFocusDim(ctx, false);
        syncPickMarkers();
        if (deckPlayback) {
          deckLastIndex = null;
          clearDeckStage();
        }
        return;
      }
      const prevDeck = deckLastIndex;
      let deckMotion = 'initial';
      if (deckPlayback && prevDeck !== null && index !== prevDeck) {
        deckMotion = index > prevDeck ? 'forward' : 'back';
      }
      const { key, entry } = flatRows[index];
      // A quiz row starts with its answers hidden, even if the learner showed them before, so the guess is fair.
      // They are shown when the playback checks them (see onGuessCheck).
      if (entry.quiz && revealed.delete(key)) refreshRow(key);
      if (ctx?.autoReveal && !entry.quiz) {
        if (lastAutoRevealedKey && lastAutoRevealedKey !== key) {
          hidePlaybackReveal(lastAutoRevealedKey);
        }
        lastAutoRevealedKey = key;
        const had = revealed.has(key);
        revealed.add(key);
        if (!had) refreshRow(key);
      }
      if (deckPlayback) {
        // Repeats (2×, 3× per line) call onLine again for the same index — keep the card, no enter animation.
        if (index !== prevDeck) {
          showDeckLine(index, deckMotion);
        }
        deckLastIndex = index;
        return;
      }
      if (ctx?.listenOnly) {
        setHighlight(null);
      } else {
        setHighlight(key);
        scrollToRow(key);
      }
      setActivePlay(key);
      syncFocusDim(ctx, true);
    },
    // A quiz row: the capital is read, the answers are guessed. The row says so until the learner resumes.
    onGuessWait: (index) => {
      const key = flatRows[index]?.key;
      if (!key) return;
      guessKey = key;
      refreshRow(key);
      if (deckPlayback) refreshDeckCard(index);
    },
    onGuessCheck: (index) => {
      const key = flatRows[index]?.key;
      if (!key) return;
      guessKey = null;
      revealed.add(key);
      refreshRow(key);
      if (deckPlayback) refreshDeckCard(index);
    },
    onPickIndex: (index) => {
      pickIndex = index;
      syncPickMarkers();
      if (deckPlayback && linesIsPlaying) return;
      const { key } = flatRows[index];
      if (key) scrollToRow(key);
    },
    waitBeforeSpeak: (index, ctx) => {
      if (deckPlayback) return;
      if (ctx?.listenOnly || !linesFollowScroll) return;
      const key = flatRows[index]?.key;
      if (!key) return;
      return waitAfterSmoothScroll(itemByKey.get(key));
    },
  });
  playbarEl = playbarApi.element;
  // The counter moves from the playbar to the search row (see dockPlaybar for the footer case).
  playbarMetaEl = playbarEl?.querySelector('.lc-playbar-meta') ?? null;
  if (playbarMetaEl && searchBar) searchBar.append(playbarMetaEl);
  playbarPickLine = playbarApi.pickLine;
  playbarOnRowsChanged = playbarApi.onPlaybackRowsChanged;
  playbarAutoSpeakCardOn = playbarApi.autoSpeakCardOn;
  playbackRowsFingerprint = getPlaybackRows().map((row) => row.key).join('\0');
  if (playbarEl) {
    playbarHome.append(playbarEl);
    playbarEl.hidden = !getPlaybackRows().length;
  }
  playbar = flatRows.length ? playbarHome : null;
  } else {
    playbarPickLine = pickRowOnly;
  }

  const listShell = h('div', { class: 'lc-list-shell' });
  const pageEl = h('div', { class: `lc-page${search ? ' lc-page-search' : ''}` });
  linesAutoplayUiSync = () => {
    const deckPlaying = deckPlayback && linesIsPlaying;
    const inDeckSession = deckFullscreen && (deckPlaying || manualOpen);
    pageEl.classList.toggle('lc-autoplay-active', linesIsPlaying);
    pageEl.classList.toggle('lc-deck-active', deckPlaying && !deckFullscreen);
    pageEl.classList.toggle('lc-deck-session-page', inDeckSession);
    pageEl.classList.toggle('lc-deck-manual', Boolean(inDeckSession && manualOpen && !linesIsPlaying));
    document.body.classList.toggle('lc-deck-session-active', inDeckSession);
    if (deckSession) deckSession.hidden = !inDeckSession;
    if (listShell) listShell.hidden = inDeckSession;
    dockPlaybar(inDeckSession);
    if (searchBar) searchBar.hidden = Boolean(deckPlayback && linesIsPlaying);
    if (categoryBar) categoryBar.hidden = Boolean(deckPlayback && linesIsPlaying);
    if (searchEmpty) {
      if (deckPlayback && linesIsPlaying) searchEmpty.hidden = true;
      else {
        const visible = flatRows.some((row) => matchesFilters(row.entry));
        searchEmpty.hidden = !searchQuery.trim() || visible;
      }
    }
    if (deckPlayback && linesIsPlaying) {
      linesFollowScroll = false;
      if (!deckFullscreen) scrollDeckIntoView();
    } else if (deckPlayback && !manualOpen) {
      deckLastIndex = null;
      clearDeckStage();
    }
    if (manualOpen) syncManualButtons();
  };
  notifyLinesPlaybackUi();
  listShell.append(
    ...(note
      ? [
          h(
            'p',
            { class: 'muted small lc-note' },
            'Choose what to see. Tap the eye to show the hidden side of a row. Tap a row to play from there. Play skips rows whose English is hidden.',
          ),
        ]
      : []),
    ...(modeSwitch ? [h('div', { class: 'chips lc-modes' }, ...modeButtons.map((entry) => entry.element))] : []),
    // The play bar and the search stay under the header while the list scrolls, in one compact strip.
    ...(playbar || searchBar || categoryBar
      ? [
          h(
            'div',
            { class: 'lc-sticky-bar' },
            ...(playbar ? [playbar] : []),
            ...(searchBar ? [searchBar] : []),
            ...(categoryBar ? [categoryBar] : []),
          ),
        ]
      : []),
    ...(deckWrap ? [deckWrap] : []),
    ...(searchEmpty ? [searchEmpty] : []),
    body,
  );
  pageEl.append(...(deckSession ? [deckSession] : []), listShell);
  return pageEl;
}

/** Stops story playback (same toolbar as words and sentences). */
export function stopStoryReading() {
  stopLinesPlayback();
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
  let activeCard = null;
  const body = h('div', { class: 'lc-story-body' });

  let storyPickLine = () => {};
  const { element: storyPlaybar, pickLine } = createLessonPlaybar({
    ariaLabel: 'Listen to the story',
    playTitle: 'Play the story slowly',
    playbarFeatures: { listenOnly: true },
    getPlaybackRows: () =>
      (stories[current]?.lines ?? []).map((line, index) => ({ english: line.english, index })),
    onLine: (index, ctx) => {
      if (ctx?.listenOnly) activeCard?.show(null);
      else activeCard?.show(index);
    },
    onPickIndex: (index) => activeCard?.markPick(index),
    waitBeforeSpeak: (index, ctx) => {
      if (ctx?.listenOnly) return;
      return activeCard?.waitBeforeSpeakLine(index);
    },
  });
  storyPickLine = pickLine;

  const draw = () => {
    const story = stories[current];
    const card = storyCard(story, view, {
      onView: (value) => {
        stopStoryReading();
        view = value;
        draw();
      },
      onPickLine: (index) => storyPickLine(index),
    });
    activeCard = card;
    body.replaceChildren(card.element);
  };

  const tabs = stories.map((story, index) =>
    h(
      'button',
      {
        type: 'button',
        class: 'lc-story-tab',
        onclick: () => {
          stopStoryReading();
          current = index;
          tabsState(index);
          draw();
          pickLine(0);
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

  const playbar = stories.length ? storyPlaybar : null;

  return h('div', { class: 'lc-stories' }, h('div', { class: 'lc-story-tabs' }, ...tabs), playbar, body);
}

/**
 * One story as a card: its title, the listen controls, the view switch, then the English and/or Persian text.
 * Each line is its own span, so the line being read aloud can be highlighted (in both languages).
 * Returns { element, show(index) }: show(i) highlights line i, show(null) clears the highlight and the Stop button.
 */
function storyCard(story, view, { onView, onPickLine }) {
  // The lines come from lessonMaterial: { english, persian } per line.
  const showEnglish = view !== 'persian';
  const showPersian = view !== 'english';
  let pickIndex = 0;
  const englishLines = story.lines.map((line, index) => {
    const span = h('span', { class: 'lc-line lc-line-tap', dir: 'ltr', lang: 'en' }, line.english);
    span.onclick = (event) => {
      event.stopPropagation();
      onPickLine?.(index);
    };
    return span;
  });
  const persianLines = story.lines.map((line, index) => {
    const span = h('span', { class: 'lc-line lc-line-tap', dir: 'rtl', lang: 'fa' }, line.persian);
    span.onclick = (event) => {
      event.stopPropagation();
      onPickLine?.(index);
    };
    return span;
  });
  const withSpaces = (spans) => spans.flatMap((span, index) => (index ? [' ', span] : [span]));

  const markPick = (index) => {
    pickIndex = index;
    englishLines.forEach((span, i) => span.classList.toggle('is-pick', i === index && !linesIsPlaying));
    persianLines.forEach((span, i) => span.classList.toggle('is-pick', i === index && !linesIsPlaying));
  };

  const element = h(
    'article',
    { class: 'lc-story' },
    h(
      'header',
      { class: 'lc-story-head' },
      h('h4', { class: 'lc-story-title', dir: 'auto' }, story.title),
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

  const show = (index) => {
    englishLines.forEach((span, i) => span.classList.toggle('is-reading', i === index));
    persianLines.forEach((span, i) => span.classList.toggle('is-reading', i === index));
    if (index === null) {
      markPick(pickIndex);
      return;
    }
    if (!linesFollowScroll) return;
    const target = englishLines[index] ?? persianLines[index];
    if (!target) return;
    linesScrollLock = true;
    clearTimeout(linesScrollLockTimer);
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    linesScrollLockTimer = setTimeout(() => {
      linesScrollLock = false;
    }, 1000);
  };

  const waitBeforeSpeakLine = (index) => {
    if (index === null) return Promise.resolve();
    const target = englishLines[index] ?? persianLines[index];
    return waitAfterSmoothScroll(target);
  };

  return { element, show, markPick, waitBeforeSpeakLine };
}
