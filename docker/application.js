import pages from './generated/pages.js';
import { createApplication } from '../shared/application.js';
import { SELF_HOSTED_LIMITS } from '../shared/limits.js';
import { JsonStore } from './json-store.js';
import { checkPassword, hashPassword, equal, md5 } from './passwords.js';

export function createSelfHostedApplication() {
  return createApplication({
    pages, limits: SELF_HOSTED_LIMITS,
    createStore: env => new JsonStore(env.DATA_DIR || '/home/app/data'),
    validate() {},
    validShareUrl: value => typeof value === 'string',
    userAllowed: username => Boolean(username),
    allowEmptyPassword: true,
    preserveGroupExtras: true,
    fullKeyResponse: true,
    secureCookies: false,
    equal, md5,
    passwords: { hash: hashPassword, verify: checkPassword },
  });
}
