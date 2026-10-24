// Answer widgets. The question's category decides how the answer is entered.
// Every widget exposes the same small interface:
//   element         DOM node to insert
//   getValue()      the learner's answer as a string
//   lock(expected)  disable input, optionally highlighting the expected answer
//   focus()

import { h, toast, keepFocus, confirmDialog, fa } from './dom.js';
import { uiIcon } from './icons.js';
import { playButton } from './speech-out.js';
import { validateAnswer } from '../engine/validator.js';
import { scrambleLetters } from '../engine/spelling.js';
import { typingQuota, spendTypingQuota } from '../storage/typing-quota.js';

export const INSTRUCTIONS = {
  quick_translation: 'Translate into English.',
  sentence_builder: 'Put the words together in the correct order.',
  word_translation: 'Translate these Persian words into one English sentence.',
  grammar_correction: 'Correct the wrong sentence and write the whole correct sentence.',
  multiple_choice: 'Choose the correct option.',
  positive_negative_question: 'Change the sentence as instructed and write the whole sentence.',
  voice_translation: 'Say this sentence in English.',
  dictation: 'Listen to the sentence and write it exactly as you hear it.',
  vocabulary: 'Write a synonym or an antonym. If several are asked, separate them with commas.',
};

/** The instruction line for a question. Dictation words have one per spelling mode. */
export function instructionFor(question) {
  if (question.category === 'dictation') {
    if (question.presentation === 'meaning') return 'Write the English word for this meaning.';
    if (question.presentation === 'letters') return 'Tap the letters in the right order to spell the word.';
  }
  return INSTRUCTIONS[question.category] ?? '';
}

export function createAnswerWidget(question, { onSubmit }) {
  // Letters mode of spelling: the learner builds the word from letter tiles.
  if (question.category === 'dictation' && question.presentation === 'letters') {
    return spellingLetters(question, onSubmit);
  }
  switch (question.category) {
    case 'sentence_builder':
      return sentenceBuilder(question, onSubmit);
    case 'multiple_choice':
      return multipleChoice(question, onSubmit);
    case 'grammar_correction':
      return textAnswer(onSubmit, question.incorrect_sentence, undefined, {
        voice: true,
        voiceOnly: isVoiceOnly(question),
        question,
      });
    default:
      // quick_translation, positive_negative_question, voice_translation and dictation use a text box.
      // Dictation is about typing what is heard, so it has no voice input, unless the mission is voice only.
      // Audio translation is always spoken: the box is read-only and only the mic fills it.
      return textAnswer(
        onSubmit,
        '',
        question.answer_mode === 'list'
          ? `At least ${question.min_items ?? 1} answers; separate them with commas or spaces`
          : undefined,
        // Only a heard-only word (audio) has no mic in normal missions; meaning and text items can use it.
        {
          voice: isVoiceTranslation(question) || question.presentation !== 'audio' || isVoiceOnly(question),
          voiceOnly: isVoiceTranslation(question) || isVoiceOnly(question),
          question,
        },
      );
  }
}

/** Voice-only missions: the answer is spoken, never typed. */
function isVoiceOnly(question) {
  return question.answer_input === 'voice';
}

/** Audio translation is always answered by voice, whatever the mission's input setting. */
function isVoiceTranslation(question) {
  return question.category === 'voice_translation';
}

/**
 * Picks the transcript to fill in: the first recognised alternative that is a correct answer, otherwise the top one.
 * Only the words are judged (the validator ignores case and final punctuation), so pronunciation does not matter.
 */
export function pickTranscript(alternatives, question = null) {
  const options = alternatives.map((text) => String(text ?? '').trim()).filter(Boolean);
  if (options.length === 0) return '';
  if (question) {
    const correct = options.find((text) => validateAnswer(question, text).correct);
    if (correct) return correct;
  }
  return options[0];
}

const SpeechRecognitionClass = () => window.SpeechRecognition ?? window.webkitSpeechRecognition;

// English messages for the error codes of the Web Speech API (null = stay silent).
const SPEECH_ERRORS = {
  'not-allowed': 'Microphone access was not granted. Allow it in your browser settings.',
  'service-not-allowed': 'The browser did not allow the speech recognition service.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'No speech was heard.',
  network: 'The browser speech recognition service is unavailable. It connects to the internet and Google servers.',
  'language-not-supported': 'English is not supported in this browser.',
  aborted: null,
};

// Static SVG (no user input), so setting it as innerHTML is safe.
const MIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8.5" y1="22" x2="15.5" y2="22"/></svg>`;

/** Voice-only answers: start the mic without a tap so the learner can speak right away. */
const AUTO_MIC_DELAY_MS = 2000;

/**
 * Microphone button that fills `input` with the spoken English text.
 * Returns null when the browser has no speech recognition (the caller shows a fallback hint).
 */
function createMicButton(input, question = null, onAnswerChange = null, onManualStart = null) {
  const Recognition = SpeechRecognitionClass();
  if (!Recognition) return null;

  const recognizer = new Recognition();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  // Several candidates, so a correct answer heard in one of them is not lost to the top guess.
  recognizer.maxAlternatives = 5;

  let button;

  function startListening() {
    if (button.disabled) return;
    try {
      button.classList.add('listening');
      recognizer.start();
    } catch {
      button.classList.remove('listening');
    }
  }

  recognizer.onresult = (event) => {
    const alternatives = Array.from(event.results[0] ?? [], (alternative) => alternative.transcript);
    input.value = pickTranscript(alternatives, question);
    input.focus();
    onAnswerChange?.();
  };
  recognizer.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    const message = SPEECH_ERRORS[event.error] ?? `Speech recognition error: ${event.error}`;
    if (message) toast(`${message} You can type instead.`, 'warn');
  };
  recognizer.onend = () => button.classList.remove('listening');

  const icon = h('span', { class: 'mic-icon' });
  icon.innerHTML = MIC_ICON;

  button = keepFocus(
    h(
      'button',
      {
        type: 'button',
        class: 'btn ghost mic',
        title: 'Speak',
        'aria-label': 'Enter the answer by voice',
        onclick: () => {
          onManualStart?.();
          startListening();
        },
      },
      icon,
    ),
  );
  return { button, startListening };
}

/**
 * "Type instead" for a voice-only answer: a few typed answers a day. The learner is asked first,
 * and each confirmed use takes one of the day's allowance (see storage/typing-quota.js).
 */
function typeInstead(input, placeholder, onUnlock) {
  const count = h('span', { class: 'typing-quota muted small', dir: 'ltr' });
  const button = h(
    'button',
    { type: 'button', class: 'btn ghost small type-instead-btn', title: 'Type this answer instead of saying it', onclick: askToType },
    uiIcon('keyboard'),
    ' Type instead',
  );
  const element = h('div', { class: 'type-instead' }, button, count);

  function showQuota() {
    const quota = typingQuota();
    count.textContent = `${fa(quota.left)} of ${fa(quota.limit)} typed answers left today`;
    button.disabled = quota.left === 0;
  }

  async function askToType() {
    const before = typingQuota();
    const confirmed = await confirmDialog({
      title: 'Type this answer?',
      message: `You can type up to ${fa(before.limit)} answers a day. ${fa(before.left)} of ${fa(before.limit)} are left today, and this answer uses one of them.`,
      confirmText: 'Type it',
      cancelText: 'Keep using voice',
    });
    if (!confirmed || input.disabled) return;
    if (!spendTypingQuota()) {
      showQuota();
      toast('No typed answers are left today.', 'warn');
      return;
    }
    input.readOnly = false;
    input.removeAttribute('inputmode');
    input.placeholder = placeholder;
    onUnlock();
    button.hidden = true;
    showQuota();
    input.focus();
  }

  showQuota();
  return {
    element,
    lock() {
      button.disabled = true;
    },
  };
}

function textAnswer(onSubmit, initial = '', placeholder = 'English answer', { voice = true, voiceOnly = false, question = null } = {}) {
  const tryAutoSubmit = onSubmit;
  const input = h('input', {
    type: 'text',
    class: 'answer-input',
    dir: 'ltr',
    value: initial,
    placeholder,
    // No suggestions, corrections or completions: the learner must type the sentence from memory.
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    name: 'answer-text',
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        // Enter tries an automatic submit when the answer is already correct.
        event.preventDefault();
        tryAutoSubmit?.();
      }
    },
    oninput: () => tryAutoSubmit?.(),
  });

  let autoMicTimer = null;
  let retired = false;
  const cancelAutoMic = () => {
    if (autoMicTimer !== null) {
      clearTimeout(autoMicTimer);
      autoMicTimer = null;
    }
  };

  const micControl = voice ? createMicButton(input, question, tryAutoSubmit, cancelAutoMic) : null;
  const mic = micControl?.button ?? null;
  // Voice only: the answer is spoken, so the box cannot be typed in. Without speech recognition the learner can still type.
  const voiceMode = voiceOnly && micControl !== null;
  if (voiceMode) {
    input.readOnly = true;
    input.inputMode = 'none';
    input.placeholder = 'Press the mic and say the answer';
    autoMicTimer = setTimeout(() => {
      autoMicTimer = null;
      if (!retired) micControl.startListening();
    }, AUTO_MIC_DELAY_MS);
  }

  let note = null;
  if (voice && !micControl) {
    note = voiceOnly
      ? 'Speech recognition is not available in this browser, so you can type the answer instead.'
      : 'Voice typing is not available in this browser. You can use keyboard dictation instead (for example Win+H on Windows, or the keyboard microphone on a phone).';
  }

  const label = h('span', { class: 'answer-label' }, voiceMode ? 'Your answer · say it' : 'Your answer');
  const typing = voiceMode
    ? typeInstead(input, placeholder, () => {
        cancelAutoMic();
        box.classList.remove('voice-only');
        label.textContent = 'Your answer';
      })
    : null;
  const box = h(
    'div',
    { class: `answer-box${voiceMode ? ' voice-only' : ''}` },
    label,
    h('div', { class: 'input-row' }, input, mic),
    typing?.element,
    note ? h('p', { class: 'muted small' }, note) : null,
  );

  return {
    element: box,
    getValue: () => input.value,
    lock() {
      retired = true;
      cancelAutoMic();
      input.disabled = true;
      if (mic) mic.disabled = true;
      typing?.lock();
    },
    focus() {
      input.focus();
    },
  };
}

function chip(text, onClick, extraClass = '') {
  return h('button', { type: 'button', class: extraClass ? `chip ${extraClass}` : 'chip', onclick: onClick }, text);
}

function sentenceBuilder(question, onSubmit) {
  return tokenBuilder(question.word_bank ?? [], {
    joiner: ' ',
    placeholder: 'Arrange the words here',
    onChange: onSubmit,
  });
}

/**
 * Letters of a dictation word, as tiles to tap into order (the letters mode of spelling).
 * The tiles start shuffled, so the learner has to rebuild the spelling from memory.
 */
function spellingLetters(question, onSubmit) {
  return tokenBuilder(scrambleLetters(question.expected_answer), {
    joiner: '',
    placeholder: 'Tap the letters here, in order',
    tileClass: 'letter',
    onChange: onSubmit,
  });
}

/**
 * Tiles the learner taps into order. The answer is the picked tiles joined with `joiner`:
 * a space for words (sentence building), nothing for letters (spelling).
 */
function tokenBuilder(tokens, { joiner = ' ', placeholder = 'Arrange the words here', tileClass = '', onChange } = {}) {
  const picked = [];
  let locked = false;
  const tile = (text, onClick) => chip(text, onClick, tileClass);

  const answerRow = h('div', { class: 'token-row answer-row', dir: 'ltr' });
  const bankRow = h('div', { class: 'token-row bank-row', dir: 'ltr' });
  const clearButton = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        if (locked) return;
        picked.length = 0;
        render();
      },
    },
    'Clear',
  );

  function render(notify = true) {
    answerRow.replaceChildren(
      ...(picked.length
        ? picked.map((tokenIndex, position) =>
            tile(tokens[tokenIndex], () => {
              if (locked) return;
              picked.splice(position, 1);
              render();
            }),
          )
        : [h('span', { class: 'placeholder', dir: 'auto' }, placeholder)]),
    );
    bankRow.replaceChildren(
      ...tokens.flatMap((token, tokenIndex) =>
        picked.includes(tokenIndex)
          ? []
          : [
              tile(token, () => {
                if (locked) return;
                picked.push(tokenIndex);
                render();
              }),
            ],
      ),
    );
    if (notify) onChange?.();
  }

  // First paint only: do not call onSubmit — play.js passes a callback that reads the widget, which is not ready yet.
  render(false);

  return {
    element: h('div', { class: 'builder' }, answerRow, bankRow, h('div', { class: 'builder-actions' }, clearButton)),
    getValue: () => picked.map((tokenIndex) => tokens[tokenIndex]).join(joiner),
    lock() {
      locked = true;
      clearButton.disabled = true;
      bankRow.classList.add('locked');
    },
    focus() {},
  };
}

// Choosing an option is the answer: it is submitted right away, so there is no send button.
function multipleChoice(question, onSubmit) {
  let selected = null;
  let locked = false;

  function choose(option) {
    if (locked) return;
    selected = option;
    for (const button of buttons) {
      button.classList.toggle('selected', button.dataset.value === option);
    }
    onSubmit?.();
  }

  // Audio presentation: the options are only heard, so each shows a letter instead of its text.
  const options = question.options ?? [];
  const audioOnly = question.presentation === 'audio';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const buttons = options.map((option, index) =>
    h(
      'button',
      {
        type: 'button',
        class: audioOnly ? 'option letter' : 'option',
        dir: 'ltr',
        dataset: { value: option },
        'aria-label': audioOnly ? option : undefined,
        onclick: () => choose(option),
      },
      audioOnly ? (LETTERS[index] ?? String(index + 1)) : option,
    ),
  );
  // Each option has its own play button: it only speaks the option, and choosing is a separate click.
  const rows = buttons.map((button, index) =>
    h('div', { class: 'option-row' }, button, playButton(options[index], 'Listen to this option')),
  );

  return {
    element: h('div', { class: 'options' }, rows),
    getValue: () => selected ?? '',
    lock(expected) {
      locked = true;
      for (const button of buttons) {
        button.disabled = true;
        if (button.dataset.value === expected) button.classList.add('correct');
        else if (button.dataset.value === selected) button.classList.add('wrong');
      }
    },
    focus() {},
  };
}
