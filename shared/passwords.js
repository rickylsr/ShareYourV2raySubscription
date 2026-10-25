const encoder = new TextEncoder();
const recordPattern = /^hmac-sha256:v1\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
const keys = new Map();

export function validAuthSecret(secret) {
  return typeof secret === 'string' && /^[0-9a-f]{64}$/i.test(secret);
}

function bytes(hex) {
  return Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function key(secret) {
  if (!validAuthSecret(secret)) throw new TypeError('AUTH_SECRET must contain 64 random hexadecimal characters');
  const id = secret.toLowerCase();
  if (keys.has(id)) return keys.get(id);
  const imported = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  // Only completed immutable keys are shared, never a request or in-flight I/O.
  if (keys.size >= 2) keys.delete(keys.keys().next().value);
  keys.set(id, imported);
  return imported;
}

function message(password, salt) {
  return encoder.encode(JSON.stringify(['syvs-admin-password', 'v1', 'user', salt, password]));
}

export async function hashPassword(password, secret) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), message(password, salt));
  return `hmac-sha256:v1$${salt}$${hex(signature)}`;
}

export async function checkPassword(record, password, secret) {
  const match = typeof record === 'string' && recordPattern.exec(record);
  if (!match || !validAuthSecret(secret)) return false;
  return crypto.subtle.verify('HMAC', await key(secret), bytes(match[2]), message(password, match[1]));
}
