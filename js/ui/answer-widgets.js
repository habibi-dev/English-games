// Answer widgets. The question's category decides how the answer is entered.
// Every widget exposes the same small interface:
//   element         DOM node to insert
//   getValue()      the learner's answer as a string
//   lock(expected)  disable input, optionally highlighting the expected answer
//   focus()

import { h, toast, keepFocus } from './dom.js';
import { playButton } from './speech-out.js';

export const INSTRUCTIONS = {
  quick_translation: 'جمله را به انگلیسی بنویس.',
  sentence_builder: 'کلمات را به ترتیب درست کنار هم بگذار.',
  grammar_correction: 'جمله‌ی اشتباه را اصلاح کن و کل جمله‌ی درست را بنویس.',
  multiple_choice: 'گزینه‌ی درست را انتخاب کن.',
  positive_negative_question: 'جمله را طبق دستور تبدیل کن و کل جمله را بنویس.',
  voice_translation: 'جمله را با صدا بگو یا تایپ کن.',
  dictation: 'جمله را بشنو و همان‌طور که شنیدی بنویس.',
  vocabulary: 'مترادف یا متضاد بنویس. اگر چند مورد خواسته شده، با ، از هم جدا کن.',
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
      // quick_translation, positive_negative_question and voice_translation all use a text box;
      // the microphone button is available on every text answer.
      return textAnswer(
        onSubmit,
        '',
        question.answer_mode === 'list'
          ? `حداقل ${question.min_items ?? 1} پاسخ؛ با ، یا فاصله جدا کن`
          : undefined,
      );
  }
}

const SpeechRecognitionClass = () => window.SpeechRecognition ?? window.webkitSpeechRecognition;

// Persian messages for the error codes of the Web Speech API (null = stay silent).
const SPEECH_ERRORS = {
  'not-allowed': 'دسترسی به میکروفون داده نشده است. از تنظیمات مرورگر اجازه بده.',
  'service-not-allowed': 'مرورگر اجازه‌ی استفاده از سرویس تشخیص گفتار را نداد.',
  'audio-capture': 'میکروفونی پیدا نشد.',
  'no-speech': 'صدایی شنیده نشد.',
  network: 'سرویس تشخیص گفتار مرورگر در دسترس نیست. این سرویس به اینترنت و سرورهای گوگل وصل می‌شود.',
  'language-not-supported': 'زبان انگلیسی در این مرورگر پشتیبانی نمی‌شود.',
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
    const message = SPEECH_ERRORS[event.error] ?? `خطای تشخیص گفتار: ${event.error}`;
    if (message) toast(`${message} می‌توانی تایپ کنی.`, 'warn');
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
        title: 'صحبت کن',
        'aria-label': 'پاسخ را با صدا وارد کن',
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

function textAnswer(onSubmit, initial = '', placeholder = 'پاسخ انگلیسی') {
  const input = h('input', {
    type: 'text',
    class: 'answer-input',
    dir: 'ltr',
    value: initial,
    placeholder,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        // Enter behaves like the "send" button: it only submits. preventDefault stops the browser
        // from also firing a click on whatever gets focus next.
        event.preventDefault();
        onSubmit();
      }
    },
  });

  const mic = createMicButton(input);

  return {
    element: h(
      'div',
      { class: 'answer-box' },
      h('div', { class: 'input-row' }, input, mic),
      mic
        ? null
        : h(
            'p',
            { class: 'muted small' },
            'تایپ با صدا در این مرورگر در دسترس نیست. می‌توانی از دیکته‌ی کیبورد استفاده کنی (مثلاً Win+H در ویندوز یا میکروفون کیبورد موبایل).',
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
    'پاک کردن',
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
        : [h('span', { class: 'placeholder', dir: 'auto' }, 'کلمات را اینجا بچین')]),
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
    h('div', { class: 'option-row' }, button, playButton(options[index], 'این گزینه را بشنو')),
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
