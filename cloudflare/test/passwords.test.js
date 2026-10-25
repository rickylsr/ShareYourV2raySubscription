import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, checkPassword, validAuthSecret } from '../../shared/passwords.js';

const secret = 'a1'.repeat(32);
const otherSecret = 'b2'.repeat(32);

test('accepts only the correct password and independent secret', async () => {
  const record = await hashPassword('correct', secret);
  assert.equal(await checkPassword(record, 'correct', secret), true);
  assert.equal(await checkPassword(record, 'wrong', secret), false);
  assert.equal(await checkPassword(record, 'correct', otherSecret), false);
});

test('uses a fresh salt and stores neither plaintext passwords nor the secret', async () => {
  const first = await hashPassword('test-password', secret);
  const second = await hashPassword('test-password', secret);
  assert.notEqual(first, second);
  assert.match(first, /^hmac-sha256:v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(first.includes('test-password'), false);
  assert.equal(first.includes(secret), false);
  assert.equal(await checkPassword(second, 'test-password', secret), true);
});

test('rejects malformed and tampered records', async () => {
  const record = await hashPassword('password', secret);
  for (const value of ['', null, 'pbkdf2:sha256:100000$x$y', record + 'a', record.replace('$', '!')]) {
    assert.equal(await checkPassword(value, 'password', secret), false);
  }
  const last = record.at(-1) === '0' ? '1' : '0';
  assert.equal(await checkPassword(record.slice(0, -1) + last, 'password', secret), false);
});

test('supports Unicode and delimiter characters', async () => {
  const password = '中文:日本$\\"😀';
  const record = await hashPassword(password, secret);
  assert.equal(await checkPassword(record, password, secret), true);
  assert.equal(await checkPassword(record, password + 'x', secret), false);
});

test('rejects missing, short and malformed deployment secrets', async () => {
  for (const value of ['', undefined, 'password', 'z'.repeat(64)]) {
    assert.equal(validAuthSecret(value), false);
    await assert.rejects(hashPassword('password', value), /AUTH_SECRET/);
  }
  assert.equal(validAuthSecret(secret.toUpperCase()), true);
});
