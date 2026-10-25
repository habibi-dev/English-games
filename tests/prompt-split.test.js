import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitPrompt } from '../js/ui/prompt.js';
import { flattenLesson } from '../js/bank/content.js';

test('Persian after the English stays out of the English box', () => {
  assert.deepEqual(splitPrompt('Brasilia پایتخت کدام کشور است؟'), {
    instruction: 'پایتخت کدام کشور است؟',
    sentence: 'Brasilia',
  });
  assert.deepEqual(splitPrompt('ملیت مربوط به Brazil چیست؟'), {
    instruction: 'ملیت مربوط به … چیست؟',
    sentence: 'Brazil',
  });
});

test('Persian on both sides of the English is joined with an ellipsis, and the English is alone', () => {
  assert.deepEqual(splitPrompt('پاسخ درست به Are you American? کدام است؟'), {
    instruction: 'پاسخ درست به … کدام است؟',
    sentence: 'Are you American?',
  });
  assert.deepEqual(splitPrompt('یک واژهٔ نزدیک به check در یادداشت چیست؟'), {
    instruction: 'یک واژهٔ نزدیک به … در یادداشت چیست؟',
    sentence: 'check',
  });
});

test('a lone question mark after Persian is not English, and a Latin name with an accent is kept whole', () => {
  assert.deepEqual(splitPrompt('کدام گزینه شکل کوتاه you are است?'), {
    instruction: 'کدام گزینه شکل کوتاه … است?',
    sentence: 'you are',
  });
  assert.deepEqual(splitPrompt('I am from Medellín.'), { instruction: '', sentence: 'I am from Medellín.' });
  assert.deepEqual(splitPrompt('کدام واژه نمونهٔ صدای /s/ در یادداشت است؟'), {
    instruction: 'کدام واژه نمونهٔ صدای … در یادداشت است؟',
    sentence: '/s/',
  });
});

test('a Persian number next to a Latin letter stays with it in the English box', () => {
  assert.deepEqual(splitPrompt('آیا من در اتاق ۶B هستم؟'), {
    instruction: 'آیا من در اتاق … هستم؟',
    sentence: '۶B',
  });
});

// Guard for the whole course: the English box never holds Persian letters, so Persian words
// around the English always go to the instruction line above it.
const PERSIAN_LETTER = /(?=\p{Script=Arabic})\p{L}/u;

test('no lesson question puts Persian letters in its English box', () => {
  const lessons = [
    ['evolve-1/lesson-01.json', 'lesson-01'],
    ['evolve-1/lesson-01-01.json', 'lesson-01-01'],
  ];
  for (const [file, lessonKey] of lessons) {
    const lesson = JSON.parse(readFileSync(new URL(`../content/${file}`, import.meta.url), 'utf8'));
    const { questions } = flattenLesson(lesson, { book: 'evolve-1', lesson: lessonKey });
    for (const q of questions) {
      const { sentence } = splitPrompt(q.question);
      assert.ok(!PERSIAN_LETTER.test(sentence), `${q.id}: Persian in the English box: ${JSON.stringify(sentence)}`);
    }
  }
});
