import { h, fa } from './dom.js';
import { speakButtons } from './speech-out.js';
import { lessonWords, lessonSentences } from '../bank/lesson-vocabulary.js';

/**
 * Under the lesson header: a separator, small buttons for the lesson's Words and Sentences, and the list of the
 * one that is open. Tapping an open button again closes its list. Returns null when the lessons have neither.
 */
export function lessonContentBlock(questions) {
  const words = lessonWords(questions);
  const sentences = lessonSentences(questions);
  const tabs = [
    { key: 'words', label: 'Words', count: words.length, render: () => wordList(words) },
    { key: 'sentences', label: 'Sentences', count: sentences.length, render: () => sentenceList(sentences) },
  ].filter((tab) => tab.count > 0);
  if (tabs.length === 0) return null;

  let open = null;
  const body = h('div', { class: 'lc-body' });
  const buttons = tabs.map((tab) => ({
    tab,
    element: h('button', {
      type: 'button',
      class: 'chip-toggle lc-tab',
      onclick: () => {
        open = open === tab.key ? null : tab.key;
        draw();
      },
    }, `${tab.label} · ${fa(tab.count)}`),
  }));

  const draw = () => {
    for (const { tab, element } of buttons) {
      const active = open === tab.key;
      element.classList.toggle('active', active);
      element.setAttribute('aria-pressed', String(active));
    }
    const current = tabs.find((tab) => tab.key === open);
    body.replaceChildren(...(current ? [current.render()] : []));
  };
  draw();

  return h(
    'div',
    { class: 'lc-block' },
    h('hr', { class: 'lc-sep' }),
    h('div', { class: 'chips lc-tabs' }, ...buttons.map((entry) => entry.element)),
    body,
  );
}

function wordList(words) {
  return h(
    'ul',
    { class: 'lc-list' },
    ...words.map(({ word, meaning }) =>
      h(
        'li',
        { class: 'lc-item' },
        h(
          'span',
          { class: 'lc-main' },
          h('strong', { class: 'lc-word', dir: 'ltr' }, word),
          meaning ? h('span', { class: 'lc-sub', dir: 'rtl' }, meaning) : null,
        ),
        speakButtons(word, { label: `Read ${word} aloud` }),
      ),
    ),
  );
}

function sentenceList(sentences) {
  return h(
    'ul',
    { class: 'lc-list' },
    ...sentences.map(({ english, persian }) =>
      h(
        'li',
        { class: 'lc-item' },
        h(
          'span',
          { class: 'lc-main' },
          h('span', { class: 'lc-word lc-sentence', dir: 'ltr' }, english),
          persian ? h('span', { class: 'lc-sub', dir: 'rtl' }, persian) : null,
        ),
        speakButtons(english, { label: 'Read the sentence aloud' }),
      ),
    ),
  );
}
