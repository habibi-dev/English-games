import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuestions } from '../js/engine/game-engine.js';

const qs = [
  { id: 'a', bank: 'beginner', topic: 'to_be', category: 'quick_translation', difficulty: 'easy' },
  { id: 'b', bank: 'grammar-1000', topic: 'to_be', category: 'quick_translation', difficulty: 'easy' },
  { id: 'c', topic: 'to_be', category: 'quick_translation', difficulty: 'easy' },
];

test('bank filter keeps only selected banks, always keeps questions without a bank', () => {
  assert.deepEqual(filterQuestions(qs, { banks: ['beginner'] }).map((q) => q.id), ['a', 'c']);
  assert.deepEqual(filterQuestions(qs, { banks: ['grammar-1000'] }).map((q) => q.id), ['b', 'c']);
});

test('undefined bank filter means no restriction; empty array matches no banked question', () => {
  assert.equal(filterQuestions(qs).length, 3);
  assert.deepEqual(filterQuestions(qs, { banks: [] }).map((q) => q.id), ['c']);
});
