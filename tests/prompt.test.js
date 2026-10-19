import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPrompt } from '../js/ui/prompt.js';

test('Persian instruction and English sentence are split into two parts', () => {
  assert.deepEqual(splitPrompt('جمله را سؤالی کن: The students like tea.'), {
    instruction: 'جمله را سؤالی کن',
    sentence: 'The students like tea.',
  });
  assert.deepEqual(splitPrompt('جمله‌ی اشتباه را درست کن: I is a teacher.'), {
    instruction: 'جمله‌ی اشتباه را درست کن',
    sentence: 'I is a teacher.',
  });
});

test('a prompt with no English stays whole as the instruction', () => {
  assert.deepEqual(splitPrompt('من معلم هستم.'), { instruction: 'من معلم هستم.', sentence: '' });
});

test('a prompt that starts with English has no instruction line', () => {
  assert.deepEqual(splitPrompt('I ___ a student.'), { instruction: '', sentence: 'I ___ a student.' });
});

test('a sentence that opens with a blank keeps the blank in the English line', () => {
  assert.deepEqual(splitPrompt('___ my aunt cook dinner?'), {
    instruction: '',
    sentence: '___ my aunt cook dinner?',
  });
  assert.deepEqual(splitPrompt('گزینه‌ی درست را انتخاب کن: ___ my aunt cook dinner?'), {
    instruction: 'گزینه‌ی درست را انتخاب کن',
    sentence: '___ my aunt cook dinner?',
  });
});
