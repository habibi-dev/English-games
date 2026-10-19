import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { typingQuota, spendTypingQuota, dayOf, DAILY_TYPING_LIMIT } from '../js/storage/typing-quota.js';

// A tiny in-memory localStorage, so the quota can run under Node.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const KEY = 'grammar-quest.typing-quota.v1';
const noon = new Date(2026, 9, 19, 12, 0).getTime();
const nextDay = new Date(2026, 9, 20, 9, 0).getTime();

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
});

test('the allowance is five typed answers a day', () => {
  assert.equal(DAILY_TYPING_LIMIT, 5);
  assert.deepEqual(typingQuota(noon), { limit: 5, used: 0, left: 5 });
});

test('each use takes one answer from the day, until none are left', () => {
  assert.deepEqual(spendTypingQuota(noon), { limit: 5, used: 1, left: 4 });
  for (let i = 0; i < 4; i += 1) spendTypingQuota(noon);
  assert.deepEqual(typingQuota(noon), { limit: 5, used: 5, left: 0 });
  assert.equal(spendTypingQuota(noon), null);
  assert.equal(typingQuota(noon).used, 5);
});

test('the allowance starts again on the next day', () => {
  for (let i = 0; i < 5; i += 1) spendTypingQuota(noon);
  assert.equal(typingQuota(noon).left, 0);
  assert.deepEqual(typingQuota(nextDay), { limit: 5, used: 0, left: 5 });
  assert.deepEqual(spendTypingQuota(nextDay), { limit: 5, used: 1, left: 4 });
});

test('the day is the local calendar day', () => {
  assert.equal(dayOf(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(dayOf(new Date(2026, 0, 6, 0, 1).getTime()), '2026-01-06');
});

test('a value that is not a number is treated as nothing used', () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ day: dayOf(noon), used: 'many' }));
  assert.equal(typingQuota(noon).used, 0);
});

test('a stored count above the limit cannot go past zero left', () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ day: dayOf(noon), used: 99 }));
  assert.deepEqual(typingQuota(noon), { limit: 5, used: 5, left: 0 });
  assert.equal(spendTypingQuota(noon), null);
});

test('an unreadable stored value counts as a fresh allowance', () => {
  globalThis.localStorage.setItem(KEY, '{not json');
  assert.deepEqual(typingQuota(noon), { limit: 5, used: 0, left: 5 });
});
