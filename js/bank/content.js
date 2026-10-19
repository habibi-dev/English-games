// Course content: books, lessons and exercises.
// content/index.json lists the books and their lessons. Each lesson is one JSON file that holds
// exercises; an exercise has a type (its question category) and items (its questions).
// flattenLesson turns a lesson file into normalized questions, so the rest of the app only sees questions.
// Pure module (no DOM / storage) so it can be unit-tested in Node.

import { normalizeQuestion, validateQuestion, CATEGORIES } from './schema.js';

export const CONTENT_INDEX_URL = 'content/index.json';

/**
 * Flattens content/index.json (series -> books -> lessons) into one entry per lesson, in course order.
 * Each entry carries the titles, level and images the setup screen needs, so a stored lesson is self-contained.
 * Throws when an id is missing, so the caller can report a broken index instead of loading a half-course.
 */
export function indexLessons(index) {
  const entries = [];
  for (const series of index?.series ?? []) {
    if (!series?.id) throw new Error('هر سری در content/index.json باید id داشته باشد.');
    for (const book of series.books ?? []) {
      if (!book?.id) throw new Error(`کتاب بدون id در سری «${series.id}».`);
      for (const lesson of book.lessons ?? []) {
        if (!lesson?.id || !lesson?.file) throw new Error(`درس بدون id یا file در کتاب «${book.id}».`);
        entries.push({
          series: series.id,
          seriesTitle: series.title ?? series.id,
          seriesLogo: series.logo ?? '',
          book: book.id,
          bookTitle: book.title ?? book.id,
          bookLevel: book.level ?? '',
          bookCover: book.cover ?? '',
          lesson: lesson.id,
          lessonTitle: lesson.title ?? lesson.id,
          file: lesson.file,
          version: String(lesson.version ?? '1'),
        });
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
      invalid: [{ index: null, id: null, errors: ['فایل درس باید آرایه‌ای به نام exercises داشته باشد.'] }],
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
        errors: [`نوع تمرین (type) نامعتبر است: «${type}» در تمرین «${exercise?.id ?? ''}».`],
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
      if (question.id && seen.has(question.id)) errors.push(`شناسه تکراری در همین درس: ${question.id}`);

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
