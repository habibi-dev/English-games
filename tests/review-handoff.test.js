import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestReview, takeReview } from '../js/ui/review-handoff.js';

test('a requested review is handed over once', () => {
  requestReview(['a', 'b']);
  assert.deepEqual(takeReview(), ['a', 'b']);
  assert.equal(takeReview(), null);
});
