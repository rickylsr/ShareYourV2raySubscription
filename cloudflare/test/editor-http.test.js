import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Execute the actual browser helpers from the shared template.
const html = await readFile(new URL('../../app/templates/editor.html', import.meta.url), 'utf8');
const helpers = html.split('// BEGIN SYVS HTTP HELPERS')[1].split('// END SYVS HTTP HELPERS')[0];
const context = vm.createContext({ t: key => key });
vm.runInContext(helpers, context);

test('editor preserves JSON errors, plain-text failures and HTTP status', async () => {
  for (const [status, body, type, expected] of [
    [400, '{"message":"Invalid groups"}', 'application/json', 'Invalid groups'],
    [403, '{"error":"Forbidden"}', 'application/json', 'Forbidden'],
    [401, 'Unauthorized', 'text/plain', 'Unauthorized'],
    [500, 'Internal server error', 'text/plain; charset=utf-8', 'Internal server error'],
    [429, '', 'text/plain', 'Too Many Requests'],
    [502, '<html>proxy error</html>', 'text/html', 'Bad Gateway'],
    [503, '{broken', 'application/json', 'Service Unavailable'],
  ]) {
    await assert.rejects(context.readEditorResponse(new Response(body, { status, statusText: expected, headers: { 'Content-Type': type } })),
      error => error.message.startsWith(`HTTP ${status}:`) && error.message.includes(expected) && !error.message.includes('<html>'));
  }
});

test('editor rejects invalid successful JSON and escapes hostile error text', async () => {
  assert.equal((await context.readEditorResponse(Response.json({ success: true }))).success, true);
  await assert.rejects(context.readEditorResponse(new Response('not JSON')), /HTTP 200: invalid_server_response/);
  const hostile = '<img src=x onerror=alert(1)>';
  assert.equal(context.syvsEscapeHtml(hostile), '&lt;img src=x onerror=alert(1)&gt;');
});
