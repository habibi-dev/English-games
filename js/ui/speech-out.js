// Text-to-speech with the browser's built-in English voices (no server, no API key).
// Works offline once the device has an English voice; quality depends on the device.
//
// Pronunciation depends on context: "live" is /lɪv/ in "They live here" but /laɪv/ alone.
// So words are spoken inside their sentence whenever possible, and never cut into single words.

import { h, keepFocus } from './dom.js';
import { splitPrompt } from './prompt.js';

// Controls that read something aloud. Pressing one of them shows the loading cursor until the sound starts.
const SPEAK_TRIGGER = '.speak, .q-speak, .gloss-word, .gloss-chip';
const LOADING_LIMIT_MS = 6000;
let pendingTrigger = null;

if (typeof document !== 'undefined') {
  // Runs before the button's own click handler, which calls speak() synchronously.
  // The mark is cleared right after the click, so a speak call from anywhere else never uses it.
  document.addEventListener(
    'click',
    (event) => {
      const trigger = event.target instanceof Element ? event.target.closest(SPEAK_TRIGGER) : null;
      pendingTrigger = trigger;
      setTimeout(() => {
        if (pendingTrigger === trigger) pendingTrigger = null;
      }, 0);
    },
    true,
  );
}

const NORMAL_RATE = 0.9;
const SLOW_RATE = 0.55;

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

// Picks a voice for `lang` (for example 'en-US' or 'fa-IR'). Only voices of that language are
// considered, so a Persian sentence is never read by an English voice. Null when none is installed.
function pickVoice(lang = 'en-US') {
  const prefix = lang.slice(0, 2).toLowerCase();
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith(prefix));
  // Prefer an installed (local) voice of the exact locale: network voices do not always respect the speed setting.
  return (
    voices.find((v) => v.lang === lang && v.localService) ??
    voices.find((v) => v.lang === lang) ??
    voices[0] ??
    null
  );
}

/** True when the device has a voice for `lang`. Persian voices are not installed everywhere. */
export function hasSpeechVoice(lang) {
  return canSpeak() && pickVoice(lang) !== null;
}

/**
 * Reads `text` aloud as one utterance. `slow` lowers the speed but keeps the words together.
 * `onStart` / `onEnd` let the caller show a "speaking" state on its button.
 */
export function speak(text, { slow = false, onStart, onEnd, lang = 'en-US' } = {}) {
  if (!canSpeak() || !text) return false;

  const synth = window.speechSynthesis;
  synth.cancel(); // do not queue several readings when the learner taps quickly

  // The control the learner just pressed (if any). It shows a loading cursor until the sound starts.
  const trigger = pendingTrigger;
  pendingTrigger = null;
  let loadingTimer = null;
  const stopLoading = () => {
    clearTimeout(loadingTimer);
    trigger?.classList.remove('loading');
  };
  trigger?.classList.add('loading');
  // Safety net: if the browser never reports the start, the cursor must not stay in loading state.
  loadingTimer = setTimeout(stopLoading, LOADING_LIMIT_MS);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = slow ? SLOW_RATE : NORMAL_RATE;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    stopLoading();
    onStart?.();
  };
  utterance.onend = () => {
    stopLoading();
    onEnd?.();
  };
  utterance.onerror = (event) => {
    stopLoading();
    onEnd?.();
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      console.warn('Speech synthesis error:', event.error);
    }
  };

  synth.speak(utterance);
  return true;
}

/** Stops any reading in progress, for example when the learner leaves the result window. */
export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

// Static SVG markup (no user input), so setting it as innerHTML is safe.
const SPEAKER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const SLOW_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 2h12"/><path d="M6 22h12"/><path d="M7 2v4a5 5 0 0 0 2.5 4.33L12 12l2.5-1.67A5 5 0 0 0 17 6V2"/><path d="M7 22v-4a5 5 0 0 1 2.5-4.33L12 12l2.5 1.67A5 5 0 0 1 17 18v4"/></svg>`;

function speakIconButton(label, icon, onclick, variant) {
  const glyph = h('span', { class: 'speak-glyph' });
  glyph.innerHTML = icon;
  return keepFocus(
    h(
      'button',
      {
        type: 'button',
        class: `btn ghost small speak speak-icon ${variant}`,
        title: label,
        'aria-label': label,
        onclick,
      },
      glyph,
    ),
  );
}

// Filled play triangle, for listening questions.
// The viewBox is shifted so the triangle's own box (x 8 to 20.4) is centred in the icon.
const PLAY_ICON = `<svg viewBox="2.2 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.9-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>`;

/**
 * Speak button for the question sentence. Returns null when the browser cannot speak.
 * It reads the sentence in its context (never the blank, see contextSentence).
 * `big` is the play button of a listening question (the only thing the learner sees).
 */
export function questionSpeakButton(text, { big = false, lang = 'en-US', label } = {}) {
  if (!canSpeak() || !text) return null;
  // A non-English sentence needs an installed voice of its own; otherwise the button is not offered.
  if (lang !== 'en-US' && !hasSpeechVoice(lang)) return null;
  const glyph = h('span', { class: 'speak-glyph' });
  glyph.innerHTML = big ? PLAY_ICON : SPEAKER_ICON;
  const button = keepFocus(
    h(
      'button',
      {
        type: 'button',
        class: big ? 'q-speak q-speak-big' : 'q-speak',
        title: label ?? (big ? 'Play' : 'Read aloud'),
        'aria-label': label ?? (big ? 'Play sentence' : 'Read the sentence aloud'),
        onclick: () =>
          speak(text, {
            lang,
            onStart: () => button.classList.add('speaking'),
            onEnd: () => button.classList.remove('speaking'),
          }),
      },
      glyph,
    ),
  );
  return button;
}

/**
 * Small play button that only speaks `text`. It never submits anything, so the learner can listen to
 * every option and then choose. Returns null when the browser cannot speak.
 */
export function playButton(text, label = 'Play') {
  if (!canSpeak() || !text) return null;
  // Same look as the sentence's read-aloud button, so every audio control in a question matches.
  const glyph = h('span', { class: 'speak-glyph' });
  glyph.innerHTML = SPEAKER_ICON;
  const button = keepFocus(
    h(
      'button',
      {
        type: 'button',
        class: 'q-speak',
        title: label,
        'aria-label': label,
        onclick: () =>
          speak(text, {
            onStart: () => button.classList.add('speaking'),
            onEnd: () => button.classList.remove('speaking'),
          }),
      },
      glyph,
    ),
  );
  return button;
}

// Speech bubble: "say it inside the sentence".
const SENTENCE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const KIND_ICON = { normal: SPEAKER_ICON, slow: SLOW_ICON, sentence: SENTENCE_ICON };

/**
 * A control bar of icon buttons with a "Play audio" label, used under a word tip.
 * Each action: { kind: 'normal' | 'slow' | 'sentence', label, onclick }. Null actions are skipped.
 * Returns null when the browser cannot speak.
 */
export function speakBar(actions) {
  if (!canSpeak()) return null;
  return h(
    'span',
    { class: 'speak-buttons speak-bar' },
    ...actions.filter(Boolean).map(({ kind, label, onclick }) => speakIconButton(label, KIND_ICON[kind], onclick, kind)),
  );
}

/** Normal and slow read-aloud buttons (icon only, with tooltips). Returns null when the browser cannot speak. */
export function speakButtons(text, { label = 'Read aloud' } = {}) {
  if (!canSpeak() || !text) return null;
  return h(
    'span',
    { class: 'speak-buttons' },
    speakIconButton(label, SPEAKER_ICON, () => speak(text), 'normal'),
    speakIconButton('Read slowly', SLOW_ICON, () => speak(text, { slow: true }), 'slow'),
  );
}

/**
 * The English sentence a glossary word sits in, as the learner sees it on screen.
 * Returns null when there is no English on screen, or when a blank ("___") is still in it,
 * because speaking that would give the answer away.
 */
export function contextSentence(question) {
  const text = String(question.question ?? '');
  if (text.includes('___')) return null;
  const start = text.search(/[A-Za-z]/);
  if (start < 0) return null;
  return text.slice(start).trim();
}

/**
 * The complete English sentence of a question, once it is answered.
 * For a fill-in-the-blank item ("I ___ a student."), the blank is filled with the expected answer.
 * Only the English part is used: the Persian instruction ("جای خالی را کامل کن: ") is not part of the sentence.
 * Otherwise the expected answer is already the full sentence.
 */
export function completeSentence(question) {
  const expected = String(question.expected_answer ?? '').trim();
  const english = splitPrompt(String(question.question ?? '')).sentence;
  if (!english.includes('___')) return expected;
  // "It ___ ." becomes "It eats." (no space before the final punctuation).
  return english.replace('___', expected).replace(/\s+([.!?,;:])/g, '$1').trim();
}
