// Answer widgets. The question's category decides how the answer is entered.
// Every widget exposes the same small interface:
//   element         DOM node to insert
//   getValue()      the learner's answer as a string
//   lock(expected)  disable input, optionally highlighting the expected answer
//   focus()

import { h, toast, keepFocus } from './dom.js';
import { playButton } from './speech-out.js';

export const INSTRUCTIONS = {
  quick_translation: 'به انگلیسی ترجمه کن',
  sentence_builder: 'Put the words together in the correct order.',
  grammar_correction: 'Correct the wrong sentence and write the whole correct sentence.',
  multiple_choice: 'Choose the correct option.',
  positive_negative_question: 'Change the sentence as instructed and write the whole sentence.',
  voice_translation: 'Say the sentence aloud or type it.',
  dictation: 'Listen to the sentence and write it exactly as you hear it.',
  vocabulary: 'Write a synonym or an antonym. If several are asked, separate them with commas.',
};

export function createAnswerWidget(question, { onSubmit }) {
  switch (question.category) {
    case 'sentence_builder':
      return sentenceBuilder(question);
    case 'multiple_choice':
      return multipleChoice(question, onSubmit);
    case 'grammar_correction':
      return textAnswer(onSubmit, question.incorrect_sentence);
    default:
      // quick_translation, positive_negative_question, voice_translation and dictation use a text box.
      // Dictation is about typing what is heard, so it has no voice input.
      return textAnswer(
        onSubmit,
        '',
        question.answer_mode === 'list'
          ? `At least ${question.min_items ?? 1} answers; separate them with commas or spaces`
          : undefined,
        { voice: question.category !== 'dictation' },
      );
  }
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

/**
 * Microphone button that fills `input` with the spoken English text.
 * Returns null when the browser has no speech recognition (the caller shows a fallback hint).
 */
function createMicButton(input) {
  const Recognition = SpeechRecognitionClass();
  if (!Recognition) return null;

  const recognizer = new Recognition();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  let button;
  recognizer.onresult = (event) => {
    input.value = event.results[0][0].transcript.trim();
    input.focus();
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
          try {
            button.classList.add('listening');
            recognizer.start();
          } catch {
            button.classList.remove('listening');
          }
        },
      },
      icon,
    ),
  );
  return button;
}

function textAnswer(onSubmit, initial = '', placeholder = 'English answer', { voice = true } = {}) {
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
        // Enter behaves like the "send" button: it only submits. preventDefault stops the browser
        // from also firing a click on whatever gets focus next.
        event.preventDefault();
        onSubmit();
      }
    },
  });

  const mic = voice ? createMicButton(input) : null;

  return {
    element: h(
      'div',
      { class: 'answer-box' },
      h('div', { class: 'input-row' }, input, mic),
      !voice || mic
        ? null
        : h(
            'p',
            { class: 'muted small' },
            'Voice typing is not available in this browser. You can use keyboard dictation instead (for example Win+H on Windows, or the keyboard microphone on a phone).',
          ),
    ),
    getValue: () => input.value,
    lock() {
      input.disabled = true;
      if (mic) mic.disabled = true;
    },
    focus() {
      input.focus();
    },
  };
}

function chip(text, onClick) {
  return h('button', { type: 'button', class: 'chip', onclick: onClick }, text);
}

function sentenceBuilder(question) {
  const tokens = question.word_bank ?? [];
  const picked = [];
  let locked = false;

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

  function render() {
    answerRow.replaceChildren(
      ...(picked.length
        ? picked.map((tokenIndex, position) =>
            chip(tokens[tokenIndex], () => {
              if (locked) return;
              picked.splice(position, 1);
              render();
            }),
          )
        : [h('span', { class: 'placeholder', dir: 'auto' }, 'Arrange the words here')]),
    );
    bankRow.replaceChildren(
      ...tokens.flatMap((token, tokenIndex) =>
        picked.includes(tokenIndex)
          ? []
          : [
              chip(token, () => {
                if (locked) return;
                picked.push(tokenIndex);
                render();
              }),
            ],
      ),
    );
  }

  render();

  return {
    element: h('div', { class: 'builder' }, answerRow, bankRow, h('div', { class: 'builder-actions' }, clearButton)),
    getValue: () => picked.map((tokenIndex) => tokens[tokenIndex]).join(' '),
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
