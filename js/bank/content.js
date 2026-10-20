// Course content: books, lessons and exercises.
// content/index.json lists the books and their lessons. Each lesson is one JSON file that holds
// exercises; an exercise has a type (its question category) and items (its questions).
// flattenLesson turns a lesson file into normalized questions, so the rest of the app only sees questions.
// Pure module (no DOM / storage) so it can be unit-tested in Node.

import { normalizeQuestion, validateQuestion, CATEGORIES } from './schema.js';

export const CONTENT_INDEX_URL = 'content/index.json';

/**
 * Flattens content/index.json (series -> books -> units -> lessons) into one entry per lesson, in course order.
 * Each entry carries the titles, level, images and unit the setup screen needs, so a stored lesson is self-contained.
 * Throws when an id is missing, or when a book still lists its lessons without units, so the caller can report a
 * broken index instead of loading a half-course.
 */
export function indexLessons(index) {
  const entries = [];
  for (const series of index?.series ?? []) {
    if (!series?.id) throw new Error('Every series in content/index.json must have an id.');
    for (const book of series.books ?? []) {
      if (!book?.id) throw new Error(`Book without an id in series "${series.id}".`);
      if (!Array.isArray(book.units)) {
        throw new Error(`Book "${book.id}" must list its units in a "units" array (each unit has its own "lessons").`);
      }
      for (const unit of book.units) {
        if (!unit?.id) throw new Error(`Unit without an id in book "${book.id}".`);
        for (const lesson of unit.lessons ?? []) {
          if (!lesson?.id || !lesson?.file) throw new Error(`Lesson without an id or file in unit "${unit.id}".`);
          entries.push({
            series: series.id,
            seriesTitle: series.title ?? series.id,
            seriesLogo: series.logo ?? '',
            book: book.id,
            bookTitle: book.title ?? book.id,
            bookLevel: book.level ?? '',
            bookCover: book.cover ?? '',
            unit: unit.id,
            unitTitle: unit.title ?? unit.id,
            lesson: lesson.id,
            lessonTitle: lesson.title ?? lesson.id,
            file: lesson.file,
            version: String(lesson.version ?? '1'),
          });
        }
      }
    }
  }
  return entries;
}

/**
 * @param {object} data parsed lesson file: { exercises: [...] }
 * @param {{book: string, lesson: string}} position where the lesson sits in the course
 * @returns {{questions: object[], invalid: object[], warnings: object[], total: number}}
 *   Same shape as importQuestions, so the loader and the admin can report it the same way.
 */
export function flattenLesson(data, { book, lesson }) {
  const questions = [];
  const invalid = [];
  const warnings = [];
  const seen = new Set();
  let total = 0;

  if (!Array.isArray(data?.exercises)) {
    return {
      questions,
      invalid: [{ index: null, id: null, errors: ['Lesson file must contain an array named exercises.'] }],
      warnings,
      total,
    };
  }

  for (const exercise of data.exercises) {
    const type = String(exercise?.type ?? '');
    const items = Array.isArray(exercise?.items) ? exercise.items : [];

    if (!CATEGORIES[type]) {
      invalid.push({
        index: null,
        id: exercise?.id ?? null,
        errors: [`Exercise type (type) is invalid: "${type}" in exercise "${exercise?.id ?? ''}".`],
      });
      total += items.length;
      continue;
    }

    for (const item of items) {
      const raw = {
        ...(item ?? {}),
        category: type,
        book,
        lesson,
        exercise: exercise.id,
        // Values come from the item first, then from its exercise, then from a default.
        topic: item?.topic ?? exercise.topic ?? lesson,
        difficulty: item?.difficulty ?? exercise.difficulty ?? 'easy',
        presentation: item?.presentation ?? exercise.presentation ?? (type === 'dictation' ? 'audio' : 'text'),
        operation: item?.operation ?? exercise.operation,
        answer_mode: item?.answer_mode ?? exercise.answer_mode,
        min_items: item?.min_items ?? exercise.min_items,
      };

      const question = normalizeQuestion(raw);
      const { errors, warnings: notes } = validateQuestion(question);
      if (question.id && seen.has(question.id)) errors.push(`Duplicate id in this lesson: ${question.id}`);

      if (errors.length > 0) {
        invalid.push({ index: total, id: question.id || null, errors });
      } else {
        seen.add(question.id);
        questions.push(question);
        if (notes.length > 0) warnings.push({ id: question.id, messages: notes });
      }
      total += 1;
    }
  }

  return { questions, invalid, warnings, total };
}
