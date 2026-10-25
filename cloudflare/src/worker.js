import pages from '../generated/pages.js';
import { createApplication } from '../../shared/application.js';
import { checkPassword, hashPassword, validAuthSecret } from '../../shared/passwords.js';
import { RequestError } from '../../shared/limits.js';
import { D1Store } from './d1-store.js';
import { workerMode, modeLimits } from './mode.js';

const encoder = new TextEncoder();
function application(mode) {
  const limits = modeLimits(mode);
  return createApplication({
    pages: pages[mode], limits,
    createStore: (env, initial, metadata) => new D1Store(env.DB, initial, metadata, limits.storeBytes),
    userAllowed: username => username === 'user',
    allowEmptyPassword: false,
    preserveGroupExtras: false,
    fullKeyResponse: false,
    secureCookies: true,
    validShareUrl: value => typeof value === 'string' && value && !value.startsWith('/') && value.split('/')[0] !== 'editor',
    validate(env) {
      if (typeof env.DEFAULT_PASSWORD !== 'string' || !env.DEFAULT_PASSWORD || encoder.encode(env.DEFAULT_PASSWORD).length > limits.passwordBytes) {
        throw new RequestError(503, 'Configure DEFAULT_PASSWORD with 1–1024 UTF-8 bytes before using SYVS.');
      }
      if (!validAuthSecret(env.AUTH_SECRET)) throw new RequestError(503, 'Configure AUTH_SECRET as 64 random hexadecimal characters before using SYVS.');
    },
    async equal(left, right) {
      const [a, b] = await Promise.all([left, right].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
      return crypto.subtle.timingSafeEqual(a, b);
    },
    async md5(value) {
      return [...new Uint8Array(await crypto.subtle.digest('MD5', encoder.encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    },
    passwords: {
      hash: (password, env) => hashPassword(password, env.AUTH_SECRET),
      verify(record, password, env) {
        if (typeof record !== 'string') return false;
        if (record.startsWith('pbkdf2:')) throw new RequestError(503, 'Reset or migrate the legacy password record outside Workers before using this Worker.');
        return checkPassword(record, password, env.AUTH_SECRET);
      },
    },
  });
}

const applications = { free: application('free'), paid: application('paid') };
export default {
  fetch(request, env) {
    let mode;
    try { mode = workerMode(env.WORKERS_MODE); }
    catch { return new Response('Set WORKERS_MODE to free or paid.', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    return applications[mode].fetch(request, env);
  },
};
