import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, lstat, symlink, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { JsonStore } from '../docker/json-store.js';
import { createApplication } from '../shared/application.js';
import { SELF_HOSTED_LIMITS } from '../shared/limits.js';
import { checkPassword, hashPassword, equal } from '../docker/passwords.js';
import { requestScheme } from '../docker/http.js';

test('JSON reads preserve legacy bytes and unknown fields; writes merge current data', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'syvs-json-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const initial = JSON.stringify({ accesskey: 'old', key_md5: 'hash', groups: [{ name: '旧分组', links: [] }], extra: 'keep' }, null, 4);
  await writeFile(path.join(directory, 'data.json'), initial);
  await chmod(path.join(directory, 'data.json'), 0o640);
  const store = new JsonStore(directory);
  assert.equal((await store.state()).data.groups[0].name, '旧分组');
  assert.equal(await readFile(path.join(directory, 'data.json'), 'utf8'), initial);
  await Promise.all([
    new JsonStore(directory).update({ groups: [{ name: 'changed', links: [] }] }),
    new JsonStore(directory).update({ accesskey: 'new' }),
  ]);
  const data = JSON.parse(await readFile(path.join(directory, 'data.json'), 'utf8'));
  assert.equal(data.groups[0].name, 'changed');
  assert.equal(data.accesskey, 'new');
  assert.equal(data.extra, 'keep');
  assert.equal((await stat(path.join(directory, 'data.json'))).mode & 0o777, 0o640);
});

test('users updates preserve other accounts; corrupt users never fall back to default', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'syvs-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'users.json'), JSON.stringify({ user: 'old', another: 'preserved' }));
  const store = new JsonStore(directory);
  await store.update({ users: { user: 'new' } });
  assert.deepEqual((await store.read(['users'])).users, { user: 'new', another: 'preserved' });
  await writeFile(path.join(directory, 'users.json'), '{');
  await assert.rejects(store.read(['users']), SyntaxError);
  await writeFile(path.join(directory, 'data.json'), '{');
  assert.equal(await store.isNew(), false);
  assert.equal((await store.state()).data.groups.length, 2);
});

test('Node and real Werkzeug password records are interoperable', async () => {
  const script = "from werkzeug.security import generate_password_hash; import json; p='旧密码:$😀'; print(json.dumps({'password':p,'records':[generate_password_hash(p,method=m) for m in ['scrypt:32768:8:1','scrypt:1024:128:1','pbkdf2:sha256:600000','pbkdf2:sha512:210000']]}))";
  const fixture = spawnSync(process.env.PYTHON || 'python3', ['-c', script], { encoding: 'utf8' });
  assert.equal(fixture.status, 0, fixture.stderr);
  const data = JSON.parse(fixture.stdout);
  for (const record of data.records) {
    assert.equal(await checkPassword(record, data.password), true);
    assert.equal(await checkPassword(record, data.password + 'wrong'), false);
  }
  const record = await hashPassword(data.password);
  const verify = spawnSync(process.env.PYTHON || 'python3', ['-c', "import sys,json; from werkzeug.security import check_password_hash; f=json.load(sys.stdin); assert check_password_hash(f['record'],f['password'])"],
    { input: JSON.stringify({ record, password: data.password }), encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr);
});

test('preserves trusted-proxy HTTPS handling without trusting arbitrary clients', () => {
  const headers = new Headers({ 'X-Forwarded-Proto': 'https' });
  assert.equal(requestScheme(headers, '127.0.0.1'), 'https');
  assert.equal(requestScheme(headers, '::ffff:127.0.0.1'), 'https');
  assert.equal(requestScheme(headers, '203.0.113.1'), 'http');
  assert.equal(requestScheme(headers, '203.0.113.1', '*'), 'https');
  assert.throws(() => requestScheme(new Headers({ 'X-Forwarded-Proto': 'https', 'X-Forwarded-SSL': 'off' }), '127.0.0.1'));
});

test('writes through legacy symlinked configuration files without replacing the link', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'syvs-symlink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'actual.json'), JSON.stringify({ groups: [], marker: 'keep' }));
  await symlink('actual.json', path.join(directory, 'data.json'));
  await new JsonStore(directory).update({ accesskey: 'changed' });
  assert.equal((await lstat(path.join(directory, 'data.json'))).isSymbolicLink(), true);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'actual.json'), 'utf8')).accesskey, 'changed');
  const groups = Array.from({ length: 100 }, (_, index) => ({ name: `group-${index}`, links: [] }));
  await new JsonStore(directory).update({ groups });
  await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const store = new JsonStore(directory);
    if (index % 2) assert.equal((await store.state()).data.groups.length, 100);
    else await store.update({ accesskey: String(index) });
  }));
});

test('file-backed sessions respect cookie scope, expiry, credential reset and concurrent login limits', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'syvs-sessions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = createApplication({
    createStore: () => new JsonStore(directory), pages: {}, limits: SELF_HOSTED_LIMITS,
    validate() {}, validShareUrl: () => true, userAllowed: name => name === 'user', equal,
  });
  const env = { DEFAULT_PASSWORD: 'initial', BASEURL: 'https://example.test/prefix/', DATA_DIR: directory };
  const call = (route, init) => app.fetch(new Request('https://example.test/editor/' + route, init), env);
  const login = () => call('login/', { method: 'POST', headers: { 'X-SYVS-Request': '1' },
    body: new URLSearchParams({ username: 'user', password: 'initial' }) });
  const response = await login();
  assert.equal(response.status, 204);
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /Path=\/prefix\/editor\/;/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await call('api/', { headers })).status, 200);
  env.DEFAULT_PASSWORD = 'reset';
  assert.equal((await call('api/', { headers })).status, 401);
  env.DEFAULT_PASSWORD = 'initial';
  const file = path.join(directory, 'sessions.json');
  const sessions = JSON.parse(await readFile(file));
  Object.values(sessions)[0].expires = Date.now() - 1;
  await writeFile(file, JSON.stringify(sessions));
  assert.equal((await call('api/', { headers })).status, 401);
  const batch = await Promise.all(Array.from({ length: 12 }, login));
  assert.equal(batch.filter(reply => reply.status === 204).length, 11);
  assert.equal(batch.filter(reply => reply.status === 429).length, 1);
});
