import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peekReview, requestReview, takeReview } from '../js/ui/review-handoff.js';

test('a requested review is handed over once', () => {
  requestReview(['a', 'b']);
  assert.deepEqual(takeReview(), ['a', 'b']);
  assert.equal(takeReview(), null);
});

test('peekReview reads pending ids without clearing them', () => {
  requestReview(['a']);
  assert.deepEqual(peekReview(), ['a']);
  assert.deepEqual(takeReview(), ['a']);
});

test('an empty review request clears the handoff', () => {
  requestReview(['a']);
  requestReview([]);
  assert.equal(peekReview(), null);
});
