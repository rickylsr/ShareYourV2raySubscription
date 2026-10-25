// Match Gunicorn's documented default trusted-forwarder scheme handling.
export function requestScheme(headers, address, allowed = '127.0.0.1,::1') {
  if (address?.startsWith('::ffff:')) address = address.slice(7);
  const trusted = allowed.split(',').map(value => value.trim());
  if (!trusted.includes('*') && !trusted.includes(address)) return 'http';
  let secure;
  for (const [name, expected] of [
    ['x-forwarded-protocol', 'ssl'], ['x-forwarded-proto', 'https'], ['x-forwarded-ssl', 'on'],
  ]) {
    const value = headers.get(name);
    if (value === null) continue;
    const matches = value === expected;
    if (secure !== undefined && secure !== matches) throw new Error('Conflicting forwarded scheme headers');
    secure = matches;
  }
  return secure ? 'https' : 'http';
}
