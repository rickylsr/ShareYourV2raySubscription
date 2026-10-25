export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_BODY_CHUNKS = 64;
export const MAX_STORE_BYTES = 32 * 1024;
export const MAX_GROUPS = 32;
export const MAX_LINKS = 256;
export const MAX_LINK_BYTES = 4096;
export const MAX_PASSWORD_BYTES = 1024;

export const FREE_LIMITS = Object.freeze({
  bodyBytes: MAX_BODY_BYTES, bodyChunks: MAX_BODY_CHUNKS, storeBytes: MAX_STORE_BYTES,
  groups: MAX_GROUPS, links: MAX_LINKS, linkBytes: MAX_LINK_BYTES,
  passwordBytes: MAX_PASSWORD_BYTES, groupNameBytes: 256, shareKeyBytes: 512,
  urlLength: 8192, authHeaderLength: 4096, contentTypeLength: 256, acceptLanguageLength: 256,
});
export const PAID_LIMITS = Object.freeze({
  ...FREE_LIMITS,
  bodyBytes: 256 * 1024, bodyChunks: 256, storeBytes: 512 * 1024,
  groups: 256, links: 4096, linkBytes: 16 * 1024,
});
export const SELF_HOSTED_LIMITS = Object.freeze(Object.fromEntries(
  Object.keys(FREE_LIMITS).map(key => [key, Infinity]),
));

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function requireBytes(value, maximum, name) {
  if (typeof value !== 'string' || (Number.isFinite(maximum) && new TextEncoder().encode(value).length > maximum)) {
    throw new RequestError(400, `${name} is too long or has the wrong type.`);
  }
}

export async function readBody(request, limits = FREE_LIMITS) {
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > limits.bodyBytes) throw new RequestError(413, `Save at most ${limits.bodyBytes / 1024} KiB per request.`);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limits.bodyBytes || parts.length >= limits.bodyChunks) {
        await reader.cancel();
        throw new RequestError(413, total > limits.bodyBytes
          ? `Save at most ${limits.bodyBytes / 1024} KiB per request.` : 'Upload is too fragmented. Retry with a buffered request.');
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return body;
}
