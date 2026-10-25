import { removeComments } from './subscription.js';
import { RequestError, requireBytes, readBody } from './limits.js';

export function createApplication(platform) {
  const { limits, pages, equal } = platform;
  const MAX_STORE_BYTES = limits.storeBytes;
  const MAX_GROUPS = limits.groups;
  const MAX_LINKS = limits.links;
  const MAX_LINK_BYTES = limits.linkBytes;
  const MAX_PASSWORD_BYTES = limits.passwordBytes;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function reply(body, status = 200, headers = {}) {
    return new Response(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
  }

  function json(body, status = 200) {
    return reply(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8' });
  }

  async function parseForm(request, body) {
    try {
      return await new Response(body, {
        headers: { 'Content-Type': request.headers.get('Content-Type') || '' },
      }).formData();
    } catch { throw new RequestError(400, 'Use a JSON or form request.'); }
  }


  function decodeBase64(value) {
    if (typeof Uint8Array.fromBase64 === 'function') return decoder.decode(Uint8Array.fromBase64(value));
    return decoder.decode(Uint8Array.from(atob(value), character => character.charCodeAt(0)));
  }

  function encodeBase64(value) {
    // Chunk the conversion to avoid argument/stack limits with large subscriptions.
    const bytes = encoder.encode(value);
    if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
    let text = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(text);
  }

  async function authorized(request, store, env) {
    const header = request.headers.get('Authorization') || '';
    if (!/^Basic /i.test(header) || header.length > limits.authHeaderLength) return false;
    let credentials;
    try { credentials = decodeBase64(header.slice(6)); } catch { return false; }
    const colon = credentials.indexOf(':');
    if (colon < 0) return false;
    const username = credentials.slice(0, colon);
    const supplied = credentials.slice(colon + 1);
    if (!platform.userAllowed(username) || (!supplied && !platform.allowEmptyPassword)) return false;
    if (encoder.encode(supplied).length > MAX_PASSWORD_BYTES) return false;
    const { users = {} } = await store.read(['users']);
    if (!Object.hasOwn(users, username)) return username === 'user' && equal(env.DEFAULT_PASSWORD, supplied);
    return platform.passwords.verify(users[username], supplied, env, username);
  }

  function normalizeLanguage(value = '') {
    value = value.toLowerCase();
    return value.startsWith('zh') ? 'zh' : value.startsWith('en') ? 'en' : null;
  }

  function languageFor(request, url) {
    const query = normalizeLanguage(url.searchParams.get('lang') || '');
    if (query) return query;
    const cookie = /(?:^|;\s*)language=([^;]*)/.exec(request.headers.get('Cookie') || '');
    if (cookie) {
      const language = normalizeLanguage(cookie[1]);
      if (language) return language;
    }
    const accepted = (request.headers.get('Accept-Language') || '').slice(0, limits.acceptLanguageLength).split(',').map(part => {
      const [name, quality] = part.trim().split(';q=');
      return { language: normalizeLanguage(name), quality: quality === undefined ? 1 : Number(quality) };
    }).filter(item => item.language && item.quality > 0).sort((a, b) => b.quality - a.quality);
    return accepted[0]?.language || 'zh';
  }

  function processLinks(links) {
    if (!Array.isArray(links)) throw new TypeError('Invalid links');
    return links.map(link => {
      if (!link || typeof link.raw !== 'string') throw new TypeError('Invalid link');
      const raw = link.raw;
      requireBytes(raw, MAX_LINK_BYTES, 'Node link');
      let type = 'other';
      let comment = '';
      if (raw.startsWith('vmess://')) {
        type = 'vmess';
        try { const ps = JSON.parse(decodeBase64(raw.slice(8))).ps; comment = typeof ps === 'string' ? ps : ''; }
        catch { comment = 'Invalid vmess link'; }
      } else {
        if (raw.startsWith('vless://')) type = 'vless';
        if (raw.startsWith('ss://')) type = 'ss';
        if (raw.includes('#')) {
          try { comment = decodeURIComponent(raw.slice(raw.lastIndexOf('#') + 1)); }
          catch { comment = raw.slice(raw.lastIndexOf('#') + 1); }
        }
      }
      return { raw, type, comment };
    });
  }

  async function handle(request, env) {
    if (request.url.length > limits.urlLength) return reply('Request URL is too long.', 414);
    platform.validate(env);
    const url = new URL(request.url);
    const shareurl = env.SHAREURL ?? 'subscription/';
    if (!platform.validShareUrl(shareurl)) {
      return reply('Configure a non-empty SHAREURL path outside /editor.', 503);
    }
    const path = url.pathname;
    let subscriptionPath;
    try { subscriptionPath = decodeURIComponent(path); }
    catch { throw new RequestError(400, 'Invalid request path encoding.'); }
    if (path === '/' && ['GET', 'HEAD'].includes(request.method)) {
      return reply('SYVS - Share Your V2ray Subscriptions');
    }
    const editorPaths = ['/editor/', '/editor/api/', '/editor/user/'];
    if (editorPaths.includes(path + '/') || subscriptionPath + '/' === '/' + shareurl) {
      url.pathname += '/';
      return reply(null, 308, { Location: url.toString() });
    }
    const isEditor = editorPaths.includes(path);
    if (!isEditor && subscriptionPath !== '/' + shareurl) return reply('Not found', 404);
    const allowed = isEditor ? ['GET', 'HEAD', 'POST'] : ['GET', 'HEAD'];
    if (!allowed.includes(request.method)) return reply('Method not allowed', 405, { Allow: allowed.join(', ') });
    if (request.method === 'POST') {
      const origin = request.headers.get('Origin');
      const site = request.headers.get('Sec-Fetch-Site');
      if (request.headers.get('X-SYVS-Request') !== '1' ||
          (origin !== null && origin !== url.origin) ||
          (site !== null && site !== 'same-origin' && site !== 'none')) {
        throw new RequestError(403, 'Request blocked. Reload the editor and try again.');
      }
    }
    if (request.method === 'POST' && (request.headers.get('Content-Type') || '').length > limits.contentTypeLength) {
      throw new RequestError(400, 'Content-Type is too long.');
    }
    const metadata = ['accesskey', 'key_md5', 'groups'];
    const apiRead = path === '/editor/api/';
    const pageRead = path === '/editor/' && request.method !== 'POST';
    const store = platform.createStore(env, isEditor ? ['users', ...((apiRead || pageRead) ? metadata : [])] : [], pageRead ? metadata : []);
    if (isEditor && !await authorized(request, store, env)) {
      return reply('Unauthorized', 401, { 'WWW-Authenticate': 'Basic realm="Authentication Required", charset="UTF-8"' });
    }
    if (path === '/editor/user/') {
      if (request.method !== 'POST') return json({ message: 'No action taken' });
      const form = await parseForm(request, await readBody(request, limits));
      const password = form.get('new_password');
      if (typeof password !== 'string' || !password) return json({ error: 'Invalid password format' });
      requireBytes(password, MAX_PASSWORD_BYTES, 'Password');
      const record = await platform.passwords.hash(password, env);
      await store.update({ users: { user: record } });
      return json({ success: 'Password updated successfully' });
    }
    if (path === '/editor/' && request.method !== 'POST') {
      const language = languageFor(request, url);
      const isNew = await store.isNew();
      return reply(pages[`${language}:${isNew ? 'new' : 'existing'}`], 200, {
        'Content-Type': 'text/html; charset=utf-8',
        ...(url.searchParams.get('lang') ? { 'Set-Cookie': `language=${language}; Max-Age=31536000; Path=/; SameSite=Lax${platform.secureCookies ? '; Secure' : ''}` } : {}),
      });
    }
    const body = request.method === 'POST' ? await readBody(request, limits) : null;
    const state = path === '/editor/api/' ? await store.state() : null;
    const { data } = state || {};
    const baseurl = env.BASEURL || url.origin + '/';
    if (path === '/editor/api/') return json({ ...data, shareurl, baseurl });
    if (path === '/editor/') {
      if (request.method === 'POST') {
        if (/^application\/json(?:;|$)/i.test((request.headers.get('Content-Type') || '').trim())) {
          let payload;
          try { payload = JSON.parse(decoder.decode(body)); } catch { return json({ status: 'error', message: 'Invalid JSON' }, 400); }
          if (!Array.isArray(payload?.groups)) return json({ status: 'error', message: 'Invalid groups format' });
          if (payload.groups.length > MAX_GROUPS) throw new RequestError(413, `Use at most ${MAX_GROUPS} groups.`);
          try {
            let count = 0;
            const groups = payload.groups.map(group => {
              if (!group || !Array.isArray(group.links ?? [])) throw new RequestError(400, 'Each group needs a name and node list.');
              const name = group.name ?? '';
              requireBytes(name, limits.groupNameBytes, 'Group name');
              count += (group.links ?? []).length;
              if (count > MAX_LINKS) throw new RequestError(413, `Use at most ${MAX_LINKS} nodes.`);
              return { ...(platform.preserveGroupExtras ? group : {}), name, links: processLinks(group.links ?? []) };
            });
            if (Number.isFinite(MAX_STORE_BYTES) && encoder.encode(JSON.stringify(groups)).length > MAX_STORE_BYTES) throw new RequestError(413, 'Processed data exceeds the platform size limit.');
            await store.update({ groups });
            return json({ status: 'success', message: 'Groups updated successfully' });
          } catch (error) {
            if (error instanceof RequestError) throw error;
            return json({ status: 'error', message: 'Failed to process groups' }, 400);
          }
        }
        const form = await parseForm(request, body);
        if (form.has('accesskey')) {
          const key = String(form.get('accesskey'));
          requireBytes(key, limits.shareKeyBytes, 'Share key');
          const changes = {
            accesskey: form.get('dontsavekeytf') === 'yes' ? '' : key,
            key_md5: key ? await platform.md5(key) : '',
          };
          await store.update(changes);
          return json(platform.fullKeyResponse ? { ...(await store.state()).data, ...changes } : changes);
        }
      }
      return json({ status: 'error', message: 'Choose groups or a share key to save.' }, 400);
    }
    const key = url.searchParams.get('key') || '';
    requireBytes(key, limits.shareKeyBytes, 'Share key');
    requireBytes(url.searchParams.get('group') || '', limits.groupNameBytes, 'Group name');
    const subscription = await store.subscription(url.searchParams.get('group') || '');
    if (subscription.key_md5 && !await equal(subscription.key_md5, await platform.md5(key))) {
      return reply('Invalid key', 403);
    }
    let content = subscription.links.map(link => link.raw).join('\n');
    content = removeComments(content.replace(/\r\n?/g, '\n'));
    // Preserve the existing self-hosted protocol filter behavior.
    if (url.searchParams.get('type') === 'ss') content = content.replace(/\nvmess:\/\/[^\n]*/g, '');
    if (url.searchParams.get('type') === 'vmess') content = content.replace(/\nss:\/\/[^\n]*/g, '');
    return reply(encodeBase64(content), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  return {
    async fetch(request, env) {
      try {
        const response = await handle(request, env);
        return request.method === 'HEAD' ? new Response(null, response) : response;
      } catch (error) {
        if (error instanceof RequestError) return json({ status: 'error', message: error.message }, error.status);
        console.error(JSON.stringify({ message: 'SYVS request failed', error: error.name }));
        return reply('Internal server error', 500);
      }
    },
  };

}
