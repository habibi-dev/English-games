// Text-to-speech with the browser's built-in English voices (no server, no API key).
// Works offline once the device has an English voice; quality depends on the device.
//
// Pronunciation depends on context: "live" is /lɪv/ in "They live here" but /laɪv/ alone.
// So words are spoken inside their sentence whenever possible, and never cut into single words.

import { h, keepFocus } from './dom.js';

const NORMAL_RATE = 0.9;
const SLOW_RATE = 0.55;

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'));
  // Prefer an installed (local) US voice: network voices do not always respect the speed setting.
  return (
    voices.find((v) => v.lang === 'en-US' && v.localService) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices[0] ??
    null
  );
}

/** Reads `text` aloud as one utterance. `slow` lowers the speed but keeps the words together. */
export function speak(text, { slow = false } = {}) {
  if (!canSpeak() || !text) return false;

  const synth = window.speechSynthesis;
  synth.cancel(); // do not queue several readings when the learner taps quickly

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = slow ? SLOW_RATE : NORMAL_RATE;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.onerror = (event) => {
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      console.warn('Speech synthesis error:', event.error);
    }
  };

  synth.speak(utterance);
  return true;
}

/** Normal and slow buttons for a sentence. Returns null when the browser cannot speak. */
export function speakButtons(text, { label = 'بخوان' } = {}) {
  if (!canSpeak() || !text) return null;
  return h(
    'span',
    { class: 'speak-buttons' },
    keepFocus(h('button', { type: 'button', class: 'btn ghost small speak', onclick: () => speak(text) }, `🔊 ${label}`)),
    keepFocus(
      h('button', { type: 'button', class: 'btn ghost small speak', onclick: () => speak(text, { slow: true }) }, '🐢 آهسته'),
    ),
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
 * Otherwise the expected answer is already the full sentence.
 */
export function completeSentence(question) {
  const expected = String(question.expected_answer ?? '').trim();
  const text = String(question.question ?? '');
  return text.includes('___') ? text.replace('___', expected).trim() : expected;
}
