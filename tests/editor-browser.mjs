// Optional end-to-end checks. Requires Playwright + Chromium; all traffic stays local.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.SYVS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'syvs-browser-'));
const password = 'local-browser-password';
const authorization = 'Basic ' + Buffer.from(`user:${password}`).toString('base64');
const listener = http.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
await writeFile(path.join(directory, 'data.json'), JSON.stringify({ accesskey: 'initial', key_md5: '', groups: [{ name: '中文组', links: [{ raw: 'ss://dummy' }] }] }));
const runtime = spawn(process.execPath, ['docker/server.js'], {
  cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory,
    DEFAULT_PASSWORD: password, SHAREURL: '订阅/子目录/' }, stdio: 'ignore',
});
const attacker = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(`<iframe name="sink"></iframe><form id="attack" method="POST" target="sink" action="${origin}/editor/user/"><input name="new_password" value="attacker-password"><input name="accesskey" value="attacker-key"></form>`);
});
let browser;
try {
  const deadline = Date.now() + 15000;
  while (true) {
    if (runtime.exitCode !== null) throw new Error('Local Docker adapter exited');
    try { if ((await fetch(origin)).status === 200) break; } catch {}
    if (Date.now() > deadline) throw new Error('Local Docker adapter did not start');
    await delay(100);
  }
  await new Promise(resolve => attacker.listen(0, '127.0.0.1', resolve));
  const evilOrigin = `http://127.0.0.1:${attacker.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(process.env.SYVS_CHROMIUM_PATH ? { executablePath: process.env.SYVS_CHROMIUM_PATH } : {}),
    ...(process.env.SYVS_BROWSER_NO_SANDBOX === '1' ? { args: ['--no-sandbox'] } : {}),
  });
  const context = await browser.newContext({ httpCredentials: { origin, username: 'user', password }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ([origin, evilOrigin].includes(url.origin)) return route.continue();
    // Avoid CDN traffic: UI-library stubs are sufficient for editor behavior.
    return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
  });
  await context.addInitScript(() => {
    window.bootstrap = { Toast: class { show() {} }, Collapse: class { show() {} hide() {} }, Modal: class { show() {} hide() {} } };
    window.Sortable = { create() {} };
    window.driver = { js: { driver: () => ({ drive() {} }) } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(origin + '/editor/?lang=en');
  await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 10000 }).catch(async error => {
    throw new Error(`${error.message}; page errors: ${errors.join('; ')}; loading: ${await page.locator('#loading').textContent()}`);
  });
  await page.locator('.groupNameInput').first().fill('browser-group');
  const save = async action => {
    const response = page.waitForResponse(response => response.request().method() === 'POST');
    await action();
    return response;
  };
  let response = await save(() => page.locator('#saveLinksBtn').click());
  assert.equal(response.status(), 200);
  assert.equal(response.request().headers()['x-syvs-request'], '1');
  await page.locator('#accesskey').fill('browser-key');
  response = await save(() => page.locator('#accesskeyForm').evaluate(form => form.requestSubmit()));
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.getElementById('accesskey').value === 'browser-key');
  const state = () => fetch(origin + '/editor/api/', { headers: { Authorization: authorization } }).then(response => response.json());
  const before = await state();
  const evil = await context.newPage();
  await evil.goto(evilOrigin);
  for (const endpoint of ['/editor/user/', '/editor/']) {
    const blocked = evil.waitForResponse(response => response.url() === origin + endpoint && response.request().method() === 'POST');
    await evil.evaluate(url => { const form = document.getElementById('attack'); form.action = url; form.requestSubmit(); }, origin + endpoint);
    assert.equal((await blocked).status(), 403);
  }
  assert.deepEqual(await state(), before);
  await evil.close();
  const subscription = await fetch(origin + '/%E8%AE%A2%E9%98%85/%E5%AD%90%E7%9B%AE%E5%BD%95/?group=browser-group&key=browser-key');
  assert.equal(subscription.status, 200);
  assert.equal(Buffer.from(await subscription.text(), 'base64').toString(), 'ss://dummy');
  await page.locator('#newPassword').fill('local-browser-changed');
  for (const [status, contentType, body, message] of [
    [401, 'text/plain', 'Unauthorized', 'Unauthorized'],
    [500, 'text/plain', 'Internal server error', 'Internal server error'],
    [413, 'application/json', JSON.stringify({ message: '<img src=x onerror=window.injected=1>Too large' }), 'Too large'],
  ]) {
    const intercept = route => route.request().method() === 'POST'
      ? route.fulfill({ status, contentType, body }) : route.continue();
    await page.route(origin + '/editor/**', intercept);
    for (const action of [
      () => page.locator('#saveLinksBtn').click(),
      () => page.locator('#accesskeyForm').evaluate(form => form.requestSubmit()),
      () => page.locator('#resetPasswordForm').evaluate(form => form.requestSubmit()),
    ]) {
      await page.locator('#toast').evaluate(element => element.replaceChildren());
      await save(action);
      await page.waitForFunction(({ status, message }) => document.querySelector('#toast .toast-body')?.textContent.includes(`HTTP ${status}:`) && document.querySelector('#toast .toast-body').textContent.includes(message), { status, message });
      assert.equal(await page.locator('#toast img').count(), 0);
      assert.equal(await page.locator('#toast .text-bg-success').count(), 0);
    }
    await page.unroute(origin + '/editor/**', intercept);
  }
  response = await save(() => page.locator('#resetPasswordForm').evaluate(form => form.requestSubmit()));
  assert.equal(response.status(), 200);
  assert.equal((await fetch(origin + '/editor/api/', { headers: { Authorization: authorization } })).status, 401);
  const changed = 'Basic ' + Buffer.from('user:local-browser-changed').toString('base64');
  assert.equal((await fetch(origin + '/editor/api/', { headers: { Authorization: changed } })).status, 200);
  assert.deepEqual(errors, []);
  console.log('PASS: real browser saves, cross-origin form rejection, Unicode SHAREURL, password change, JSON/text errors for all three saves, HTML escaping');
} finally {
  if (browser) await browser.close();
  attacker.closeAllConnections();
  await new Promise(resolve => attacker.close(resolve));
  const ended = new Promise(resolve => runtime.once('exit', resolve));
  if (runtime.exitCode === null) { runtime.kill('SIGTERM'); await ended; }
  await rm(directory, { recursive: true, force: true });
}
