import { createHash, pbkdf2, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveScrypt = promisify(scrypt);
const derivePbkdf2 = promisify(pbkdf2);
let queue = Promise.resolve();

async function serialKdf(operation) {
  const previous = queue;
  let release;
  queue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
}

export function equal(left, right) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

export function md5(value) { return createHash('md5').update(value).digest('hex'); }

export async function checkPassword(record, password) {
  if (typeof record !== 'string') return false;
  const [method, salt, expected, extra] = record.split('$');
  if (extra !== undefined || salt === undefined || !expected || !/^[a-f0-9]+$/i.test(expected) || expected.length % 2) return false;
  const [algorithm, ...parameters] = method.split(':');
  try {
    return await serialKdf(async () => {
      let actual;
      if (algorithm === 'scrypt') {
        const [N = 32768, r = 8, p = 1] = parameters.map(Number);
        if (!Number.isSafeInteger(N) || N < 2 || !Number.isSafeInteger(r) || r < 1 || !Number.isSafeInteger(p) || p < 1) return false;
        actual = await deriveScrypt(password, salt, 64, { N, r, p, maxmem: Math.max(67108864, 128 * N * r + 128 * r * p + 1048576) });
      } else if (algorithm === 'pbkdf2') {
        const digest = (parameters[0] || 'sha256').replace(/^sha3_/, 'sha3-').replace(/^sha512_/, 'sha512-');
        const count = Number(parameters[1] || 1000000);
        if (!Number.isInteger(count) || count < 1 || count > 2147483647) return false;
        actual = await derivePbkdf2(password, salt, count, createHash(digest).digest().length, digest);
      } else return false;
      const wanted = Buffer.from(expected, 'hex');
      return actual.length === wanted.length && timingSafeEqual(actual, wanted);
    });
  } catch { return false; }
}

export async function hashPassword(password) {
  const salt = randomBytes(12).toString('base64url');
  const result = await serialKdf(() => deriveScrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 67108864 }));
  return `scrypt:32768:8:1$${salt}$${result.toString('hex')}`;
}
