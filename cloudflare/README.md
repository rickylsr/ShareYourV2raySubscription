# Cloudflare deployment (v3.1 development preview)

[简体中文](README_ZH.md) | English

This target runs a JavaScript Worker with D1 storage. It renders the existing editor template and translations into static HTML at build time. The browser loads node data through the authenticated API. Docker uses the same JavaScript core with a JSON-file and legacy-password adapter, preserving the `data.json` / `users.json` volume format. Deploying either target does not migrate or synchronize the other.

## Deploy button

The button uses the `v3.1-dev` development branch.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rickylsr/ShareYourV2raySubscription/tree/v3.1-dev)

1. Sign in to Cloudflare and connect GitHub/GitLab as requested.
2. Choose a Worker name and D1 database name. Keep `DB` as the binding name.
3. Set `DEFAULT_PASSWORD` to a unique administrator password and `AUTH_SECRET` to an independent, randomly generated 64-character hexadecimal key (for example, `openssl rand -hex 32`). Both must be Worker secrets.
4. Use the repository root (`/`), build command `npm run build`, and deploy command
   `npm run deploy`. Only Node.js/npm is required for this target.
5. Leave `WORKERS_MODE=free` by default, or select `paid` for an account with Workers Paid enabled (see switching below).
6. Open `https://<worker>.workers.dev/editor/`. The username is `user`.

The Worker returns HTTP 503 until both secrets are configured. It never falls
back to Docker's default password. `npm run deploy` initializes the D1 settings table idempotently after uploading. HTTP requests never create tables or run migrations.

The button can provision D1 from `wrangler.jsonc`. Templates are rendered by Nunjucks at build time; no template engine or per-node HTML generation runs in the Worker. Python Workers was evaluated locally but the official minimal Python
example returned 1101 in cloud testing, so this target uses JavaScript. See the
[deploy button documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

## Local development

Requirements: Node.js 22+ and npm. Python is only needed for the optional test scripts.

```sh
npm ci
npm run db:local
cp .dev.vars.example .dev.vars
# Set DEFAULT_PASSWORD and a random 64-hex-character AUTH_SECRET before starting.
npm run dev
```

Open `http://localhost:8787/editor/`. The D1 emulator stores local data under
`.wrangler/`; it does not use your remote database. `npm run check` checks packaging
without deployment. The development server watches Worker source, shared templates and translations.

## Manual deployment

From the repository root, run:

```sh
npm ci
npm exec --prefix cloudflare -- wrangler login
npm exec --prefix cloudflare -- wrangler d1 create syvs
```

Copy the returned database ID into the root `wrangler.jsonc`, keeping the binding named `DB`.
Save a unique password in a private `.env` file outside the repository, in the form
`DEFAULT_PASSWORD=...` and `AUTH_SECRET=...`, then deploy code and both secrets together:

```sh
npm run deploy -- --secrets-file /absolute/path/to/private.env
```

Subsequent `npm run deploy` calls preserve existing secrets and D1 data. Keep the
same database ID when updating. Optional Worker variables `SHAREURL` (default
`subscription/`) and `BASEURL` (default empty, using the request origin) match the
self-hosted settings. `SHAREURL` must be a non-empty path outside `/editor`.

## Select and switch Free / Paid

`WORKERS_MODE=free|paid` selects the application's capacity policy; the default is `free`. It does not change the Cloudflare account plan, subscribe to Paid, or cancel a subscription. The account owner must enable Workers Paid separately before selecting `paid`. Paid accounts can also use the `free` policy without cancelling their subscription. See [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Choose `vars.WORKERS_MODE` in the root `wrangler.jsonc` before deployment. To switch later, change the value and redeploy while keeping the same D1 database and `AUTH_SECRET`; subscriptions and passwords changed through the editor remain valid. You can also edit the variable in the Cloudflare dashboard and deploy, but keep the repository configuration in sync to avoid overwriting it on the next release.

Before switching down, reduce the data to Free limits while still in Paid mode. If a stored record exceeds 32 KiB after an accidental switch, reads return 413 with instructions to restore the previous mode and reduce the data. Records are never truncated or deleted. Account billing changes remain separate. Docker ignores this variable and retains its self-hosted capacity policy.

## Capacity and password verification

The Worker uses salted HMAC-SHA256 verifiers keyed by the independent 256-bit
`AUTH_SECRET`. The key stays in Cloudflare secrets; D1 contains only the verifier.
It retains Basic Auth and in-editor password changes without PBKDF2, including on
cold requests. Docker's adapter preserves legacy password verification and file compatibility.

This design depends on keeping the random key separate from the database. A D1
leak alone does not permit offline password guesses; if both D1 and `AUTH_SECRET`
leak, guesses are much cheaper than with a slow password hash. Keep the same
`AUTH_SECRET` on updates. Rotating or losing it invalidates saved login verifiers.
To reset login, keep a valid key, update `DEFAULT_PASSWORD`, and delete only the
`users` row in D1's `settings` table; subscriptions are preserved.

Old development PBKDF2 records must be reset or migrated **outside Workers** before
upgrade. The Worker rejects them instead of running a slow one-time migration.

To bound CPU and memory, this target supports:

| Item | Free (default) | Paid |
| --- | --- | --- |
| One save request | 16 KiB / at most 64 chunks | 256 KiB / at most 256 chunks |
| Groups / nodes per save | 32 groups / 256 total nodes | 256 groups / 4096 total nodes |
| One node link | 4096 UTF-8 bytes | 16 KiB |
| Processed stored settings | 32 KiB per record | 512 KiB per record |
| Login password / group name / share key | 1024 / 256 / 512 UTF-8 bytes | Same |

Body size is checked even without Content-Length. Paid limits are application capacity settings, not a 10 ms CPU target; existing Free CPU measurements apply only to the Free policy.

Oversize operations receive 400/413 before expensive processing. The editor is
static HTML and builds node controls in the browser, so page rendering does not
scale with node count in the Worker. Requests within the Free bounds were tested on
Workers Free against the 10 ms CPU target. Cloudflare still controls scheduling,
cold starts and enforcement; finite measurements cannot guarantee an absolute CPU
upper bound for every possible request or load level. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and the actual samples in [VALIDATION.md](VALIDATION.md). Daily Free request and D1 quotas still apply; the application does not upgrade your plan.

## Verification

From the repository root, after installing dependencies and building:

```sh
npm test
python3 scripts/workers_modes_local.py
python3 -m pip install -r tests/legacy/requirements.txt
python3 -m unittest discover -s tests -v
```

For a **disposable** local Worker or Docker instance, set `SYVS_TEST_PASSWORD` in
your shell and run:

```sh
python3 scripts/smoke_http.py http://127.0.0.1:8787
# Restart the instance using the same database/volume, then:
python3 scripts/smoke_http.py http://127.0.0.1:8787 --verify-persisted
```

The smoke test changes subscriptions, rotates the share key and changes the login
password. Never run it on an instance containing real subscription data.

For the disposable Free-target boundary workload, use the current password and run
`scripts/free_budget_http.py`; it restores the test groups and password afterward.
`benchmark_http.py` supplies repeat-read workloads. `summarize_cpu.py` checks real
Workers tail `cpuTime` samples against the 10 ms target. See [CPU_RESULTS.csv](CPU_RESULTS.csv)
for the sanitized final sample set (no credentials or request URLs).
