import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexLessons } from '../js/bank/content.js';

const COURSE_INDEX = new URL('../content/index.json', import.meta.url);

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
          units: [
            {
              id: 'unit-01',
              title: 'Unit 01',
              lessons: [
                { id: 'lesson-01', title: 'درس ۱', file: 'content/evolve-1/lesson-01.json', version: 2 },
                { id: 'lesson-02', file: 'content/evolve-1/lesson-02.json' },
              ],
            },
            {
              id: 'unit-02',
              lessons: [{ id: 'lesson-03', file: 'content/evolve-1/lesson-03.json' }],
            },
          ],
        },
      ],
    },
  ],
};

test('the index is flattened to one entry per lesson, in course order, with series, book and unit details', () => {
  const [first, second, third] = indexLessons(index);
  assert.deepEqual(first, {
    series: 'evolve',
    seriesTitle: 'Evolve',
    seriesLogo: 'content/covers/evolve-logo.png',
    book: 'evolve-1',
    bookTitle: 'Evolve 1',
    bookLevel: 'A1',
    bookCover: 'content/covers/evolve-1.png',
    unit: 'unit-01',
    unitTitle: 'Unit 01',
    lesson: 'lesson-01',
    lessonTitle: 'درس ۱',
    file: 'content/evolve-1/lesson-01.json',
    version: '2',
  });
  // Missing titles fall back to the id, and a missing version becomes '1'.
  assert.equal(second.lessonTitle, 'lesson-02');
  assert.equal(second.version, '1');
  assert.equal(second.bookLevel, 'A1');
  // A lesson of the next unit carries that unit, and a unit without a title uses its id.
  assert.equal(third.unit, 'unit-02');
  assert.equal(third.unitTitle, 'unit-02');
  assert.equal(third.lesson, 'lesson-03');
});

test('an empty or missing index gives no lessons', () => {
  assert.deepEqual(indexLessons({}), []);
  assert.deepEqual(indexLessons(null), []);
});

test('a book without units is reported, so a flat lesson list cannot slip through', () => {
  assert.throws(
    () => indexLessons({ series: [{ id: 's', books: [{ id: 'b', lessons: [{ id: 'l', file: 'f.json' }] }] }] }),
    /must list its units/,
  );
});

test('the real course index lists every lesson under a unit, and every lesson file exists', () => {
  const entries = indexLessons(JSON.parse(readFileSync(COURSE_INDEX, 'utf8')));
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.ok(entry.unit, `lesson ${entry.lesson} has no unit`);
    assert.ok(entry.unitTitle, `unit ${entry.unit} has no title`);
    readFileSync(new URL(`../${entry.file}`, import.meta.url));
  }
});

test('a series, book, unit or lesson without an id is reported', () => {
  assert.throws(() => indexLessons({ series: [{ title: 'x', books: [] }] }), /series/);
  assert.throws(() => indexLessons({ series: [{ id: 's', books: [{ title: 'x', units: [] }] }] }), /Book without an id/);
  assert.throws(
    () => indexLessons({ series: [{ id: 's', books: [{ id: 'b', units: [{ title: 'u', lessons: [] }] }] }] }),
    /Unit without an id/,
  );
  assert.throws(
    () => indexLessons({ series: [{ id: 's', books: [{ id: 'b', units: [{ id: 'u', lessons: [{ id: 'l' }] }] }] }] }),
    /Lesson without an id/,
  );
});
