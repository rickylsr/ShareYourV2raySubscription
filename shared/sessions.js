const encoder = new TextEncoder();
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const LOGIN_WINDOW_MS = 60000;
export const LOGIN_ATTEMPTS = 12;

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export function credentialVersion(token, username, users, env) {
  const record = Object.hasOwn(users, username) ? ['saved', users[username]] : ['default', env.DEFAULT_PASSWORD];
  return digest(JSON.stringify([token, username, record, env.AUTH_SECRET ?? '']));
}

export function sessionCookie(url, env, token = '') {
  const base = new URL(env.BASEURL || '/', url);
  const prefix = base.host === url.host ? base.pathname.replace(/\/?$/, '/') : '/';
  const secure = url.protocol === 'https:' || (base.host === url.host && base.protocol === 'https:');
  return `syvs_session=${token}; Path=${prefix.replaceAll(';', '%3B')}editor/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`;
}

export async function authenticatedSession(request, store, env) {
  const token = /(?:^|;\s*)syvs_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!token) return null;
  const id = await digest(token);
  const session = await store.session(id);
  if (!session || session.expires <= Date.now()) return null;
  const { users = {} } = await store.read(['users']);
  if (session.version !== await credentialVersion(token, session.username, users, env)) return null;
  return { id, username: session.username };
}
