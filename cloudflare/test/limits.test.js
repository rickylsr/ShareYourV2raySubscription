import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_BODY_BYTES, MAX_BODY_CHUNKS, readBody, requireBytes } from '../../shared/limits.js';

test('accepts the exact body limit and rejects a larger declared body', async () => {
  const exact = new Request('https://test/', { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES) });
  assert.equal((await readBody(exact)).byteLength, MAX_BODY_BYTES);
  const large = new Request('https://test/', { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1),
    headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) } });
  await assert.rejects(readBody(large), error => error.status === 413);
});

test('bounds chunked bodies even without Content-Length and cancels the stream', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { canceled = true; },
  });
  const request = new Request('https://test/', { method: 'POST', body, duplex: 'half' });
  await assert.rejects(readBody(request), error => error.status === 413);
  assert.equal(canceled, true);
});

test('counts UTF-8 bytes rather than JavaScript string length', () => {
  assert.doesNotThrow(() => requireBytes('😀', 4, 'value'));
  assert.throws(() => requireBytes('😀', 3, 'value'), error => error.status === 400);
  assert.throws(() => requireBytes({}, 100, 'value'), error => error.status === 400);
});

test('bounds stream iteration cost for many tiny chunks', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      for (let index = 0; index <= MAX_BODY_CHUNKS; index++) controller.enqueue(new Uint8Array(1));
    },
    cancel() { canceled = true; },
  });
  const request = new Request('https://test/', { method: 'POST', body, duplex: 'half' });
  await assert.rejects(readBody(request), error => error.status === 413);
  assert.equal(canceled, true);
});
