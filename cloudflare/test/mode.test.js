import assert from 'node:assert/strict';
import test from 'node:test';
import { workerMode, modeLimits } from '../src/mode.js';
import { FREE_LIMITS, PAID_LIMITS, SELF_HOSTED_LIMITS } from '../../shared/limits.js';

test('defaults to Free and accepts only explicit free/paid modes', () => {
  assert.equal(workerMode(), 'free');
  assert.equal(workerMode(' PAID '), 'paid');
  for (const value of ['', 'automatic', '__proto__', 'enterprise']) assert.throws(() => workerMode(value));
});

test('selects finite capacity policies without changing the billing plan', () => {
  assert.equal(modeLimits('free'), FREE_LIMITS);
  assert.equal(modeLimits('paid'), PAID_LIMITS);
  assert.equal(FREE_LIMITS.bodyBytes, 16 * 1024);
  assert.equal(PAID_LIMITS.bodyBytes, 256 * 1024);
  for (const value of Object.values(PAID_LIMITS)) assert.equal(Number.isFinite(value), true);
  assert.equal(SELF_HOSTED_LIMITS.bodyBytes, Infinity);
});
