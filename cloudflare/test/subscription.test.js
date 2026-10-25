import assert from 'node:assert/strict';
import test from 'node:test';
import { removeComments } from '../../shared/subscription.js';

test('removes closed multiline comments and preserves unclosed input', () => {
  assert.equal(removeComments('ss://a<!-- first\nsecond -->\nvless://b'), 'ss://a\nvless://b');
  assert.equal(removeComments('a<!--first-->b<!--unclosed'), 'ab<!--unclosed');
  assert.equal(removeComments('<!--outer<!--inner-->tail'), 'tail');
});

test('handles many unmatched comment openers without changing content', () => {
  const content = '<!--'.repeat(8000);
  assert.equal(removeComments(content), content);
});
