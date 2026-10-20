// Activity time: how long the learner played. A mission counts from its start (the Start button, or a review)
// until it ends (the results screen) or until the learner leaves it. Not just the time the page is open.
// Sessions are kept on this device in localStorage. The calculations below are pure, so they can be tested.

const KEY = 'grammar-quest.activity.v1';

/** Day the week starts on, as in Date.getDay(): 6 = Saturday (the start of the Persian week). */
export const WEEK_STARTS_ON = 6;

// Shorter sessions are accidental taps and are not counted.
const MIN_SESSION_MS = 1000;

const pad = (n) => String(n).padStart(2, '0');

const isSession = (s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start;

export function loadSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isSession) : [];
  } catch {
    return [];
  }
}

export function clearActivity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage disabled: nothing was saved.
  }
}

export function recordSession(start, end) {
  if (!(end - start >= MIN_SESSION_MS)) return;
  const sessions = loadSessions();
  sessions.push({ start, end });
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    // Storage full or disabled: this session is not kept.
  }
}

/** Adds the sessions of an imported backup that this device does not have yet. Returns how many were added. */
export function addSessions(incoming) {
  const existing = loadSessions();
  const seen = new Set(existing.map((s) => `${s.start}|${s.end}`));
  const fresh = incoming.filter(isSession).filter((s) => {
    const key = `${s.start}|${s.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length === 0) return 0;
  try {
    localStorage.setItem(KEY, JSON.stringify([...existing, ...fresh]));
    return fresh.length;
  } catch {
    // Storage full or disabled: nothing was added.
    return 0;
  }
}

// The mission in progress, if any. Set when it starts, cleared when it ends.
let missionStart = null;

/** A mission has started. A second call while one is running changes nothing. */
export function beginMission(at = Date.now()) {
  missionStart ??= at;
}

/** The mission has ended (or the learner left it). Saves its time. Does nothing when no mission is running. */
export function endMission(at = Date.now()) {
  if (missionStart == null) return;
  const start = missionStart;
  missionStart = null;
  recordSession(start, at);
}

/** Local calendar day as a key, e.g. "2026-10-19". Keys sort in date order. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const keyOf = (year, monthIndex, day) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

/** The moment `n` calendar days after `ms` (same time of day; daylight saving changes are handled by Date). */
function addDays(ms, n) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Milliseconds played per calendar day. A session that crosses midnight is split between the two days.
 * Returns a Map: day key -> ms. Only days with time in them are in the map.
 */
export function msByDay(sessions) {
  const totals = new Map();
  for (const { start, end } of sessions) {
    let cursor = start;
    while (cursor < end) {
      const nextDay = startOfDay(addDays(cursor, 1));
      const part = Math.min(end, nextDay) - cursor;
      const key = dayKey(cursor);
      totals.set(key, (totals.get(key) ?? 0) + part);
      cursor = nextDay;
    }
  }
  return totals;
}

/**
 * The numbers shown on the activity panel, all in ms unless stated otherwise.
 *  - today, yesterday, week (since WEEK_STARTS_ON), month (this calendar month), allTime
 *  - currentStreak / bestStreak: consecutive active days, in days. The current one may end yesterday.
 *  - activeDays: days with any play; missions: sessions; longestMission; bestDay: { key, ms } or null
 */
export function activityStats(sessions, now = Date.now()) {
  const totals = msByDay(sessions);
  const today = dayKey(now);
  const yesterday = dayKey(addDays(startOfDay(now), -1));

  const weekStartDate = new Date(startOfDay(now));
  weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() - WEEK_STARTS_ON + 7) % 7));
  const weekStart = dayKey(weekStartDate.getTime());
  const monthPrefix = today.slice(0, 8); // "YYYY-MM-"

  let week = 0;
  let month = 0;
  for (const [key, ms] of totals) {
    if (key >= weekStart && key <= today) week += ms;
    if (key.startsWith(monthPrefix)) month += ms;
  }

  // Current streak: counted back from today, or from yesterday when today has no time yet.
  let currentStreak = 0;
  let cursor = totals.has(today) ? now : addDays(startOfDay(now), -1);
  while (totals.has(dayKey(cursor))) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  // Best streak: longest run of consecutive days in the history.
  const keys = [...totals.keys()].sort();
  let bestStreak = 0;
  let run = 0;
  let previous = null;
  for (const key of keys) {
    run = previous && dayKey(addDays(keyTime(previous), 1)) === key ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = key;
  }

  let bestDay = null;
  for (const [key, ms] of totals) {
    if (!bestDay || ms > bestDay.ms) bestDay = { key, ms };
  }

  const allTime = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
  const activeDays = totals.size;

  return {
    today: totals.get(today) ?? 0,
    yesterday: totals.get(yesterday) ?? 0,
    week,
    month,
    allTime,
    currentStreak,
    bestStreak,
    activeDays,
    averagePerActiveDay: activeDays ? Math.round(allTime / activeDays) : 0,
    missions: sessions.length,
    longestMission: sessions.reduce((max, s) => Math.max(max, s.end - s.start), 0),
    bestDay,
  };
}

/** The local midnight of a day key ("2026-10-19"). */
function keyTime(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Daily study goal: one hour of play. A lesson has hundreds of questions, so a short session is not enough. */
export const DAILY_GOAL_MS = 60 * 60000;

/**
 * Upper limits of the calendar colour bands, in minutes: under the first limit is level 1, under the second
 * is level 2, under the third is level 3, and from the third on is level 4 (3 hours or more).
 */
export const LEVEL_LIMITS_MIN = Object.freeze([30, 60, 180]);

/** Activity level for a day, 0 (no time) to 4 (the top band). Used to pick the calendar colour. */
export function levelFor(ms) {
  const minutes = ms / 60000;
  if (minutes <= 0) return 0;
  const band = LEVEL_LIMITS_MIN.findIndex((limit) => minutes < limit);
  return band === -1 ? LEVEL_LIMITS_MIN.length + 1 : band + 1;
}

/**
 * One month as a flat list of cells, Monday-to-Sunday style rows of 7 (starting on WEEK_STARTS_ON).
 * Empty entries (null) pad the first and last week. Each day cell has its key, number, ms and level.
 */
export function calendarMonth(year, monthIndex, totals) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array(((firstWeekday - WEEK_STARTS_ON + 7) % 7)).fill(null);
  for (let day = 1; day <= days; day++) {
    const key = keyOf(year, monthIndex, day);
    const ms = totals.get(key) ?? 0;
    cells.push({ key, day, ms, level: levelFor(ms) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
