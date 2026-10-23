import { h, keepFocus } from './dom.js';
import {
  LESSON_PLAYBAR_UI_DEFAULTS,
  loadLessonPlaybarSettings,
  saveLessonPlaybarSettings,
} from '../storage/lesson-playbar.js';
import { speak, speakButtons, stopSpeaking, pauseSpeaking, resumeSpeaking, canSpeak } from './speech-out.js';
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

/**
 * The lesson's choice page: one coloured tile per page. Each tile is { kind, icon, title, subtitle, onclick }.
 */
export function lessonHub(tiles) {
  const grid = h('div', { class: 'hub-grid' }, ...tiles.map(hubTile));
  dragToScroll(grid);
  return grid;
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
  playbackStepRelative = () => {};
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
  shuffle: shuffleOption = false,
  playbarFeatures = {},
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

  const featureToggles = [autoRevealToggle, listenOnlyToggle, dimOthersToggle, longSentenceToggle].filter(Boolean);

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
    if (pausePoint === 'speech') resumeSpeaking();
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
      : [playAllButton()];
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

  return { element, pickLine, onPlaybackRowsChanged: () => onPlaybackRowsChanged() };
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
  playbar: showPlaybar = true,
}) {
  const deckPlayback = Boolean(playbarFeatures.deckPlayback);
  let mode = 'english';
  let searchQuery = '';
  let deckLastIndex = null;
  const revealed = new Set();
  const body = h('div', { class: 'lc-groups' });
  const itemByKey = new Map();
  let highlightKey = null;
  let activePlayKey = null;
  let pickIndex = 0;
  let lastAutoRevealedKey = null;
  let playbarPickLine = () => {};
  let playbarOnRowsChanged = () => {};
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

  const row = (entry, key, flatIndex) => {
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
      {
        class: `lc-item${highlightKey === key ? ' is-reading' : ''}${activePlayKey === key ? ' is-active-play' : ''}${pickIndex === flatIndex && !linesIsPlaying ? ' is-pick' : ''}`,
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
    itemByKey.clear();
    let visibleRowCount = 0;
    shown.forEach((group, groupIndex) => {
      const items = [];
      group.rows.forEach((entry, rowIndex) => {
        if (!rowMatchesLessonSearch(entry, searchQuery)) return;
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

  const getPlaybackRows = () =>
    flatRows
      .map((row, flatIndex) => ({ english: row.entry.english, index: flatIndex, key: row.key, entry: row.entry }))
      .filter((row) => isEnglishVisible(row.key) && rowMatchesLessonSearch(row.entry, searchQuery));

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
  const deckWrap = deckPlayback ? h('div', { class: 'lc-deck' }, deckStage) : null;

  const scrollDeckIntoView = () => {
    if (!deckWrap) return;
    window.requestAnimationFrame(() => {
      deckWrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let refreshDeckCard = () => {};

  const buildDeckCard = (entry, key, flatIndex) => {
    const englishShown = mode !== 'persian' || revealed.has(key);
    const persianShown = mode !== 'english' || revealed.has(key);
    const persianHiddenByMode = Boolean(entry.persian) && mode === 'english';
    const isRevealed = revealed.has(key);

    const eyeGlyph = h('span', { class: 'lc-eye-glyph' });
    eyeGlyph.innerHTML = isRevealed ? EYE_OFF_ICON : EYE_ICON;
    const deckEye = persianHiddenByMode
      ? keepFocus(
          h(
            'button',
            {
              type: 'button',
              class: `lc-deck-eye${isRevealed ? ' on' : ''}`,
              'aria-pressed': String(isRevealed),
              'aria-label': isRevealed ? 'Hide translation' : 'Show translation',
              title: isRevealed ? 'Hide translation' : 'Show translation',
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
        : null;

    return h(
      'div',
      { class: 'lc-deck-card', role: 'status', 'aria-live': 'polite' },
      h(
        'div',
        { class: 'lc-deck-card-inner' },
        h('div', { class: 'lc-deck-en-block' }, h('div', { class: 'lc-deck-main-row' }, deckEye, enContent)),
        faBlock,
      ),
    );
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
    getPlaybackRows,
    onLine: (index, ctx) => {
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
      const { key } = flatRows[index];
      if (ctx?.autoReveal) {
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
  playbarPickLine = playbarApi.pickLine;
  playbarOnRowsChanged = playbarApi.onPlaybackRowsChanged;
  playbackRowsFingerprint = getPlaybackRows().map((row) => row.key).join('\0');
  if (playbarEl) playbarEl.hidden = !getPlaybackRows().length;
  playbar = flatRows.length ? playbarEl : null;
  } else {
    playbarPickLine = pickRowOnly;
  }

  const pageEl = h('div', { class: `lc-page${search ? ' lc-page-search' : ''}` });
  linesAutoplayUiSync = () => {
    pageEl.classList.toggle('lc-autoplay-active', linesIsPlaying);
    pageEl.classList.toggle('lc-deck-active', deckPlayback && linesIsPlaying);
    if (searchBar) searchBar.hidden = Boolean(deckPlayback && linesIsPlaying);
    if (searchEmpty) {
      if (deckPlayback && linesIsPlaying) searchEmpty.hidden = true;
      else {
        const visible = flatRows.some((row) => rowMatchesLessonSearch(row.entry, searchQuery));
        searchEmpty.hidden = !searchQuery.trim() || visible;
      }
    }
    if (deckPlayback && linesIsPlaying) {
      linesFollowScroll = false;
      deckStage.hidden = false;
      scrollDeckIntoView();
    } else if (deckPlayback) {
      deckLastIndex = null;
      clearDeckStage();
    }
  };
  notifyLinesPlaybackUi();
  pageEl.append(
    ...(note
      ? [
          h(
            'p',
            { class: 'muted small lc-note' },
            'Choose what to see. Tap the eye to show the hidden side of a row. Tap a row to play from there. Play skips rows whose English is hidden.',
          ),
        ]
      : []),
    h('div', { class: 'chips lc-modes' }, ...modeButtons.map((entry) => entry.element)),
    ...(playbar ? [playbar] : []),
    ...(deckWrap ? [deckWrap] : []),
    ...(searchBar ? [searchBar] : []),
    ...(searchEmpty ? [searchEmpty] : []),
    body,
  );
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
