// Question repository: the only place that touches the stored questions.
// The course is listed in content/index.json (series, books and lessons). Each lesson is a JSON file that is
// loaded when it is new or its version changed. See content.js for the file format.

import { importQuestions } from './importer.js';
import { flattenLesson, indexLessons, CONTENT_INDEX_URL } from './content.js';
import { lessonKey } from './schema.js';
import * as db from '../storage/db.js';

export const listQuestions = () => db.getAllQuestions();
export const getQuestion = (id) => db.getQuestion(id);
export const saveQuestion = (question) => db.putQuestion(question);
export const removeQuestion = (id) => db.deleteQuestion(id);
export const listLessons = () => db.getAllLessonMeta();

/** Imports JSON/CSV text into the store (insert or update by id). */
export async function importIntoStore(text, format) {
  const result = importQuestions(text, format);
  if (result.questions.length > 0) {
    await db.putQuestions(result.questions);
  }
  return result;
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`File ${url} not found (HTTP ${response.status}).`);
  }
  return response.text();
}

const belongsTo = (question, book, lesson) => question.book === book && question.lesson === lesson;

/**
 * Loads every lesson listed in content/index.json that is new or whose version changed.
 * With force=true every lesson is reloaded (questions are overwritten by id).
 * Returns what was loaded and any per-lesson errors, so one broken file does not block the rest.
 */
export async function syncContent({ force = false } = {}) {
  const entries = indexLessons(JSON.parse(await fetchText(CONTENT_INDEX_URL)));
  const known = new Map((await db.getAllLessonMeta()).map((meta) => [meta.key, meta]));
  const loaded = [];
  const errors = [];
  const listed = new Set();

  for (const [position, item] of entries.entries()) {
    const key = lessonKey(item.book, item.lesson);
    // Titles, images and order come from the index every time; the lesson file only when it changed.
    const info = { key, ...item, order: position };
    listed.add(key);
    const meta = known.get(key);

    if (!force && meta && meta.version === info.version && meta.file === info.file) {
      const changed = Object.keys(info).some((field) => meta[field] !== info[field]);
      if (changed) await db.putLessonMeta({ ...meta, ...info });
      continue;
    }

    try {
      const result = flattenLesson(JSON.parse(await fetchText(info.file)), { book: info.book, lesson: info.lesson });
      if (result.questions.length === 0) {
        throw new Error(`No valid exercises found in ${info.file}.`);
      }
      await db.putQuestions(result.questions);

      // The file is the source of truth for its lesson: questions removed from it are removed here too.
      // This runs only after the new file loaded, so a failed download never empties a lesson.
      const incomingIds = new Set(result.questions.map((question) => question.id));
      const stale = (await db.getAllQuestions()).filter(
        (question) => belongsTo(question, info.book, info.lesson) && !incomingIds.has(question.id),
      );
      for (const question of stale) await db.deleteQuestion(question.id);

      const entry = {
        ...info,
        count: result.questions.length,
        invalid: result.invalid.length,
        warnings: result.warnings.length,
        importedAt: new Date().toISOString(),
      };
      await db.putLessonMeta(entry);
      loaded.push(entry);
      if (result.invalid.length) console.warn(`[lesson ${key}] invalid records:`, result.invalid);
    } catch (error) {
      errors.push({ lesson: key, message: error.message });
    }
  }

  // Lessons removed from the index: their questions and metadata are removed too.
  for (const [key, meta] of known) {
    if (listed.has(key)) continue;
    for (const question of (await db.getAllQuestions()).filter((q) => belongsTo(q, meta.book, meta.lesson))) {
      await db.deleteQuestion(question.id);
    }
    await db.deleteLessonMeta(key);
  }

  return { loaded, errors };
}
