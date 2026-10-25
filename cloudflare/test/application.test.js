import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../../shared/application.js';
import { FREE_LIMITS, PAID_LIMITS, SELF_HOSTED_LIMITS } from '../../shared/limits.js';

function harness(limits = FREE_LIMITS, SHAREURL = 'subscription/') {
  const saved = { groups: [{ name: '中文组', links: [{ raw: 'ss://example' }] }], accesskey: 'original', key_md5: '' };
  let stores = 0;
  const app = createApplication({
    limits, pages: { 'zh:existing': '<html></html>' },
    validate() {}, validShareUrl: () => true, userAllowed: name => name === 'user',
    equal: async (a, b) => a === b, md5: async value => `md5:${value}`,
    passwords: { hash: async value => `test:${value}`, verify: async (record, value) => record === `test:${value}` },
    createStore() {
      stores++;
      return {
        read: async keys => Object.fromEntries(keys.filter(key => key in saved).map(key => [key, saved[key]])),
        update: async changes => Object.assign(saved, changes),
        isNew: async () => false,
        state: async () => ({ data: saved }),
        subscription: async group => ({ key_md5: saved.key_md5, links: saved.groups.find(item => item.name === group)?.links || [] }),
      };
    },
  });
  return {
    saved, stores: () => stores,
    call(path, options = {}) {
      const { headers, ...init } = options;
      return app.fetch(new Request(`https://syvs.example${path}`, {
        ...init, headers: { Authorization: 'Basic ' + btoa('user:dummy'), ...headers },
      }), { DEFAULT_PASSWORD: 'dummy', SHAREURL });
    },
  };
}

for (const [profile, limits] of Object.entries({ free: FREE_LIMITS, paid: PAID_LIMITS, docker: SELF_HOSTED_LIMITS })) {
  test(`${profile}: rejects forged writes before authentication, storage or password work`, async () => {
    const app = harness(limits);
    const before = JSON.stringify(app.saved);
    for (const path of ['/editor/', '/editor/user/', '/editor/api/']) {
      for (const headers of [
        {},
        { Origin: 'https://evil.example' },
        { 'Sec-Fetch-Site': 'cross-site' },
        { 'X-SYVS-Request': '1', Origin: 'https://evil.example' },
        { 'X-SYVS-Request': '1', Origin: 'null' },
        { 'X-SYVS-Request': '1', 'Sec-Fetch-Site': 'same-site' },
        { 'X-SYVS-Request': '1', 'Sec-Fetch-Site': 'cross-site', Origin: 'https://syvs.example' },
        { Origin: 'https://syvs.example', 'Sec-Fetch-Site': 'same-origin' },
      ]) {
        const response = await app.call(path, { method: 'POST', headers, body: 'new_password=attacker&accesskey=attacker' });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      }
    }
    assert.equal(app.stores(), 0);
    assert.equal(JSON.stringify(app.saved), before);
    assert.equal((await app.call('/editor/user/', { method: 'OPTIONS' })).status, 405);
  });

  test(`${profile}: accepts same-origin editor and explicit non-browser writes`, async () => {
    const app = harness(limits);
    const headers = { 'X-SYVS-Request': '1', Origin: 'https://syvs.example', 'Sec-Fetch-Site': 'same-origin' };
    const groups = [{ name: 'new', links: [{ raw: 'ss://changed' }] }];
    assert.equal((await app.call('/editor/', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ groups }) })).status, 200);
    assert.equal(app.saved.groups[0].links[0].raw, 'ss://changed');
    assert.equal((await app.call('/editor/', { method: 'POST', headers: { 'X-SYVS-Request': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'accesskey=changed' })).status, 200);
    assert.equal(app.saved.accesskey, 'changed');
    assert.equal((await app.call('/editor/user/', { method: 'POST', headers, body: new URLSearchParams({ new_password: 'changed' }) })).status, 200);
    assert.equal(app.saved.users.user, 'test:changed');
  });
}

test('subscription routes decode Unicode, spaces and literal percent signs exactly once', async () => {
  for (const shareurl of ['订阅/子目录/', 'custom/sub/', 'space path/', '100%/', '%E8%AE%A2/']) {
    const app = harness(SELF_HOSTED_LIMITS, shareurl);
    const pathname = '/' + shareurl.split('/').map(encodeURIComponent).join('/');
    const response = await app.call(pathname + '?group=' + encodeURIComponent('中文组'));
    assert.equal(response.status, 200, shareurl);
    assert.equal(atob(await response.text()), 'ss://example');
    const redirect = await app.call(pathname.slice(0, -1));
    assert.equal(redirect.status, 308);
    assert.equal(new URL(redirect.headers.get('Location')).pathname, pathname);
  }
  assert.equal((await harness(SELF_HOSTED_LIMITS, '订阅/').call('/%25E8%25AE%25A2%25E9%2598%2585/')).status, 404);
  assert.equal((await harness().call('/%GG/')).status, 400);
  // Keep private endpoint spelling canonical for edge path rules.
  assert.equal((await harness().call('/%65ditor/')).status, 404);
  assert.equal((await harness().call('/editor%2Fapi/')).status, 404);
});
