import http from 'node:http';
import { Readable } from 'node:stream';
import { createSelfHostedApplication } from './application.js';
import { requestScheme } from './http.js';

const application = createSelfHostedApplication();
const env = {
  ...process.env,
  DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD ?? 'password',
  SHAREURL: process.env.SHAREURL ?? 'subscription/',
  BASEURL: process.env.BASEURL ?? '',
};
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method || 'GET';
    const scheme = requestScheme(headers, incoming.socket.remoteAddress, process.env.FORWARDED_ALLOW_IPS);
    const request = new Request(`${scheme}://${incoming.headers.host || 'localhost'}${incoming.url}`, {
      method, headers,
      ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await application.fetch(request, env);
    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) outgoing.setHeader(name, value);
    // Gunicorn's former sync worker also closed each connection. Closing avoids
    // retaining an unread upload when authentication rejects it before parsing.
    outgoing.setHeader('Connection', 'close');
    if (response.body) Readable.fromWeb(response.body).on('error', () => outgoing.destroy()).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(JSON.stringify({ message: 'HTTP request failed', error: error.name }));
    if (!outgoing.headersSent) outgoing.writeHead(400, { 'Connection': 'close' });
    outgoing.end('Bad request');
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 30_000;
server.listen(Number(process.env.PORT || 8000), process.env.HOST || '0.0.0.0', () => console.log('SYVS listening'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
