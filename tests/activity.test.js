import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordSession,
  loadSessions,
  clearActivity,
  beginMission,
  endMission,
  msByDay,
  activityStats,
  calendarMonth,
  levelFor,
  dayKey,
} from '../js/progress/activity.js';

const MIN = 60000;
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

// A tiny in-memory localStorage, so the recording functions run under Node.
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  endMission(); // no mission carries over from a previous test
});

test('a mission is recorded from its start until its end', () => {
  beginMission(at(2026, 10, 19, 10));
  endMission(at(2026, 10, 19, 10, 25));
  assert.deepEqual(loadSessions(), [{ start: at(2026, 10, 19, 10), end: at(2026, 10, 19, 10, 25) }]);
});

test('ending a mission that never started saves nothing', () => {
  endMission(at(2026, 10, 19, 10, 25));
  assert.equal(loadSessions().length, 0);
});

test('a second start does not move the start of a running mission', () => {
  beginMission(at(2026, 10, 19, 10));
  beginMission(at(2026, 10, 19, 11));
  endMission(at(2026, 10, 19, 10, 30));
  assert.equal(loadSessions()[0].start, at(2026, 10, 19, 10));
});

test('taps shorter than a second are not counted, and clearing removes everything', () => {
  recordSession(at(2026, 10, 19, 10), at(2026, 10, 19, 10) + 300);
  assert.equal(loadSessions().length, 0);
  recordSession(at(2026, 10, 19, 10), at(2026, 10, 19, 10, 5));
  assert.equal(loadSessions().length, 1);
  clearActivity();
  assert.equal(loadSessions().length, 0);
});

test('a session across midnight is split between the two days', () => {
  const totals = msByDay([{ start: at(2026, 10, 18, 23, 0), end: at(2026, 10, 19, 1, 0) }]);
  assert.equal(totals.get('2026-10-18'), 60 * MIN);
  assert.equal(totals.get('2026-10-19'), 60 * MIN);
});

test('period totals: today, yesterday, this week, this month and all time', () => {
  const now = at(2026, 10, 19, 12); // Monday
  const sessions = [
    { start: at(2026, 10, 19, 9), end: at(2026, 10, 19, 9, 30) }, // today: 30 min
    { start: at(2026, 10, 18, 20), end: at(2026, 10, 18, 21) }, // yesterday: 60 min
    { start: at(2026, 10, 17, 10), end: at(2026, 10, 17, 10, 20) }, // Saturday (week start): 20 min
    { start: at(2026, 10, 3, 10), end: at(2026, 10, 3, 10, 10) }, // earlier this month: 10 min
    { start: at(2026, 9, 30, 10), end: at(2026, 9, 30, 10, 40) }, // last month: 40 min
  ];
  const stats = activityStats(sessions, now);
  assert.equal(stats.today, 30 * MIN);
  assert.equal(stats.yesterday, 60 * MIN);
  assert.equal(stats.week, (30 + 60 + 20) * MIN);
  assert.equal(stats.month, (30 + 60 + 20 + 10) * MIN);
  assert.equal(stats.allTime, (30 + 60 + 20 + 10 + 40) * MIN);
  assert.equal(stats.missions, 5);
  assert.equal(stats.activeDays, 5);
});

test('the week starts on Saturday: Friday before it is not in this week', () => {
  const now = at(2026, 10, 19, 12);
  const stats = activityStats([{ start: at(2026, 10, 16, 10), end: at(2026, 10, 16, 10, 30) }], now);
  assert.equal(stats.week, 0);
  assert.equal(stats.month, 30 * MIN);
});

test('current and best streaks count consecutive days', () => {
  const day = (d) => ({ start: at(2026, 10, d, 10), end: at(2026, 10, d, 10, 5) });
  const now = at(2026, 10, 19, 12);
  const stats = activityStats([day(10), day(11), day(12), day(16), day(17), day(18), day(19)], now);
  assert.equal(stats.currentStreak, 4); // 16, 17, 18, 19
  assert.equal(stats.bestStreak, 4);
});

test('the current streak may end yesterday, but a gap before that breaks it', () => {
  const day = (d) => ({ start: at(2026, 10, d, 10), end: at(2026, 10, d, 10, 5) });
  const now = at(2026, 10, 19, 12); // nothing today yet
  assert.equal(activityStats([day(17), day(18)], now).currentStreak, 2);
  assert.equal(activityStats([day(16)], now).currentStreak, 0);
});

test('no sessions give zero everywhere and no best day', () => {
  const stats = activityStats([], at(2026, 10, 19, 12));
  assert.equal(stats.allTime, 0);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestDay, null);
  assert.equal(stats.averagePerActiveDay, 0);
});

test('the best day is the day with the most time', () => {
  const stats = activityStats(
    [
      { start: at(2026, 10, 5, 10), end: at(2026, 10, 5, 10, 20) },
      { start: at(2026, 10, 6, 10), end: at(2026, 10, 6, 11) },
    ],
    at(2026, 10, 19, 12),
  );
  assert.deepEqual(stats.bestDay, { key: '2026-10-06', ms: 60 * MIN });
});

test('the calendar month starts on the right weekday and is padded to whole weeks', () => {
  // October 2026 starts on a Thursday. With weeks starting on Saturday, 5 blanks come first.
  const cells = calendarMonth(2026, 9, new Map());
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.slice(0, 5).every((cell) => cell === null), true);
  assert.equal(cells[5].day, 1);
  assert.equal(cells[5].key, '2026-10-01');
  assert.equal(cells.filter((cell) => cell && cell.day).length, 31);
});

test('calendar cells carry their time and colour level', () => {
  const totals = new Map([['2026-10-19', 45 * MIN]]);
  const cell = calendarMonth(2026, 9, totals).find((c) => c && c.key === '2026-10-19');
  assert.equal(cell.ms, 45 * MIN);
  assert.equal(cell.level, 3); // under an hour
});

test('colour levels follow the minutes', () => {
  assert.equal(levelFor(0), 0);
  assert.equal(levelFor(10 * MIN), 1);
  assert.equal(levelFor(20 * MIN), 2);
  assert.equal(levelFor(45 * MIN), 3);
  assert.equal(levelFor(90 * MIN), 4);
});

test('day keys are local dates', () => {
  assert.equal(dayKey(at(2026, 10, 9, 23, 59)), '2026-10-09');
});
