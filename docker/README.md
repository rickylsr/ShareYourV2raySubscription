# Docker: shared core and upgrade compatibility

Docker and Cloudflare both run [the shared application](../shared/application.js):
routes, group/node parsing, subscriptions, share-key handling, language selection
and the browser editor are maintained once. The Python implementation is retained
only under `tests/legacy/` as a compatibility reference, not shipped as a second
production backend.

| Platform adapter | Storage | Password records | Data limits |
| --- | --- | --- | --- |
| Docker / Node.js | Existing JSON files | Existing Werkzeug scrypt/PBKDF2; new records use compatible scrypt | Host resources; no Cloudflare Free limits |
| Workers | D1 | Independent-secret HMAC verifiers | Explicit Free CPU/data bounds |

## Existing installations

Keep the same normal Docker/Compose invocation:

```sh
docker run -d \
  -v /your/existing/config:/home/app/data \
  -p 8123:8000 \
  ghcr.io/rickylsr/shareyourv2raysubscription:latest
```

The image still listens on port **8000** and reads:

- `/home/app/data/data.json`: `accesskey`, `key_md5`, `groups`, raw node links and metadata.
- `/home/app/data/users.json`: existing password records and accounts.
- `DEFAULT_PASSWORD`, `SHAREURL`, `BASEURL`: same meanings and defaults. Docker
  does **not** require the Cloudflare-only `AUTH_SECRET`.

Starting or reading an old volume does not rewrite it. Updates preserve unknown
JSON fields and other accounts. Ordinary writes use a temporary file and rename,
retaining file permissions and ownership when permitted. Separately bind-mounted
files and symbolic links use compatible in-place writes, with reads and writes
serialized so a request cannot observe a partial JSON file. Normal installations need no
conversion, password reset, extra secret or new volume.

The original default password remains `password` if there is no saved user record
and `DEFAULT_PASSWORD` is unset. Deleting `users.json` still resets login to the
configured default. A saved password takes precedence over a changed default.
New password writes remain readable by the tested old Flask image, allowing a
rollback with the same data volume.

The runtime is Node.js 24. Custom entrypoints that explicitly invoke Python or
Gunicorn must be adjusted; the standard image entrypoint and published deployment
commands require no changes. `/home/app/data` remains the persistent interface.

## POST clients and reverse proxies

The editor includes CSRF protection automatically. Custom scripts that write to
`/editor/`, `/editor/user/` or `/editor/api/` must send `X-SYVS-Request: 1`.
Browser POSTs must come from the same origin; cross-origin requests return 403.
Reverse proxies must preserve the external Host and configure trusted HTTPS
forwarding (`FORWARDED_ALLOW_IPS`) correctly. BASEURL does not override the
request origin. Public installations should also limit attempts to all `/editor`
paths at their reverse proxy; Basic Auth checks GET requests as well as POSTs.

## Development

The shared editor pages are generated at build time:

```sh
cd cloudflare
npm ci
npm run build
cd ..
DATA_DIR=/tmp/syvs-dev DEFAULT_PASSWORD=local-password node docker/server.js
```

`DATA_DIR`, `PORT` and `HOST` are optional self-hosted overrides. Defaults are
`/home/app/data`, `8000` and `0.0.0.0`.

## Upgrade tests

```sh
docker build -f tests/legacy/Dockerfile -t syvs:legacy-fixture .
docker build -t syvs:shared-test .
python3 tests/upgrade_docker.py syvs:legacy-fixture syvs:shared-test
```

The test creates its own temporary containers and volumes, then removes them. It
checks an actual old-image volume through Node upgrade, restart, and Python-image
rollback. Coverage includes scrypt, PBKDF2, Unicode passwords, additional users,
file permissions/ownership, unknown JSON fields, custom URLs, more than 256 nodes,
large configuration saves and links exceeding the Cloudflare-only size limits.
It also mounts `data.json` and `users.json` as two individual files, verifies that
saves retain the original inodes, and rolls back to the old image using those files.

For host-side adapter tests, install `tests/legacy/requirements.txt` in a Python
virtual environment and run `node tests/node-adapters.test.mjs`. `PYTHON` can point
to that virtual environment's executable. Production Docker requires no Python.

Optional browser regression (after building pages): install Playwright/Chromium
in your development environment and run `node tests/editor-browser.mjs`.
`SYVS_PLAYWRIGHT_MODULE` and `SYVS_CHROMIUM_PATH` can select an existing installation.
The test creates only temporary loopback servers and data, blocks external
browser requests, and uses local UI-library stubs. It checks browser saves,
cross-origin form rejection, Unicode share URLs and error displays.
