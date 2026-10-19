import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexLessons } from '../js/bank/content.js';

const index = {
  schema_version: '3.0',
  series: [
    {
      id: 'evolve',
      title: 'Evolve',
      logo: 'content/covers/evolve-logo.png',
      books: [
        {
          id: 'evolve-1',
          title: 'Evolve 1',
          level: 'A1',
          cover: 'content/covers/evolve-1.png',
          lessons: [
            { id: 'lesson-01', title: 'درس ۱', file: 'content/evolve-1/lesson-01.json', version: 2 },
            { id: 'lesson-02', file: 'content/evolve-1/lesson-02.json' },
          ],
        },
      ],
    },
  ],
};

test('the index is flattened to one entry per lesson, in course order, with series and book details', () => {
  const [first, second] = indexLessons(index);
  assert.deepEqual(first, {
    series: 'evolve',
    seriesTitle: 'Evolve',
    seriesLogo: 'content/covers/evolve-logo.png',
    book: 'evolve-1',
    bookTitle: 'Evolve 1',
    bookLevel: 'A1',
    bookCover: 'content/covers/evolve-1.png',
    lesson: 'lesson-01',
    lessonTitle: 'درس ۱',
    file: 'content/evolve-1/lesson-01.json',
    version: '2',
  });
  // Missing titles fall back to the id, and a missing version becomes '1'.
  assert.equal(second.lessonTitle, 'lesson-02');
  assert.equal(second.version, '1');
  assert.equal(second.bookLevel, 'A1');
});

test('an empty or missing index gives no lessons', () => {
  assert.deepEqual(indexLessons({}), []);
  assert.deepEqual(indexLessons(null), []);
});

test('a series, book or lesson without an id is reported', () => {
  assert.throws(() => indexLessons({ series: [{ title: 'x', books: [] }] }), /series/);
  assert.throws(() => indexLessons({ series: [{ id: 's', books: [{ title: 'x', lessons: [] }] }] }), /Book without an id/);
  assert.throws(
    () => indexLessons({ series: [{ id: 's', books: [{ id: 'b', lessons: [{ id: 'l' }] }] }] }),
    /Lesson without an id/,
  );
});
