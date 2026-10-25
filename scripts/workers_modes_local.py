"""Check capacity-mode changes using isolated local workerd/D1, with no cloud access.

Run after npm ci && npm run build from the repository root. Uses dummy secrets,
loopback HTTP and a temporary database; never reads the deployment credentials.
"""
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / 'cloudflare/node_modules/wrangler/bin/wrangler.js'


def main():
    with tempfile.TemporaryDirectory(prefix='syvs-modes-local-') as directory:
        scratch = Path(directory)
        env = dict(os.environ)
        for key in list(env):
            if key.startswith(('CLOUDFLARE_', 'CF_')):
                env.pop(key)
        env.update(CLOUDFLARE_API_TOKEN='local-tests-no-cloud-access',
                   WRANGLER_SEND_METRICS='false', WRANGLER_LOG_PATH=str(scratch / 'wrangler.log'),
                   HTTP_PROXY='http://127.0.0.1:9', HTTPS_PROXY='http://127.0.0.1:9',
                   ALL_PROXY='http://127.0.0.1:9', NO_PROXY='127.0.0.1,localhost,::1',
                   NODE_USE_ENV_PROXY='1')
        password = 'local-mode-test-password'
        (scratch / '.dev.vars').write_text(f'DEFAULT_PASSWORD={password}\nAUTH_SECRET={secrets.token_hex(32)}\n')
        config = {
            'name': 'syvs-local-modes',
            'main': str(ROOT / 'cloudflare/src/worker.js'),
            'compatibility_date': '2026-10-19', 'compatibility_flags': [],
            'vars': {'SHAREURL': 'subscription/', 'BASEURL': '', 'WORKERS_MODE': 'free'},
            'd1_databases': [{'binding': 'DB', 'database_name': 'local-test',
                              'database_id': '00000000-0000-0000-0000-000000000000'}],
        }
        config_path = scratch / 'wrangler.jsonc'
        config_path.write_text(json.dumps(config))
        command = [shutil.which('node'), str(WRANGLER)]
        common = ['--config', str(config_path), '--persist-to', str(scratch / 'state')]
        with (scratch / 'runtime.log').open('w+') as log:
            result = subprocess.run(command + ['d1', 'execute', 'DB', '--local', '--file',
                                    str(ROOT / 'cloudflare/schema.sql'), '--yes'] + common,
                                    cwd=scratch, env=env, stdout=log, stderr=log)
            if result.returncode:
                raise RuntimeError('Local D1 initialization failed: ' + (scratch / 'runtime.log').read_text()[-3000:])
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            origin = f'http://127.0.0.1:{port}'
            opener = build_opener(ProxyHandler({}))
            process = None

            def request(path, payload=None, content_type='application/json', authenticated=True):
                headers = {'X-SYVS-Request': '1'}
                if authenticated:
                    headers['Authorization'] = 'Basic ' + base64.b64encode(f'user:{password}'.encode()).decode()
                if payload is not None:
                    headers['Content-Type'] = content_type
                    if not isinstance(payload, bytes):
                        payload = json.dumps(payload).encode()
                req = Request(origin + path, data=payload, headers=headers)
                try:
                    with opener.open(req, timeout=10) as response:
                        return response.status, response.read()
                except HTTPError as error:
                    return error.code, error.read()

            def stop():
                nonlocal process
                if process is not None:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    process = None

            def start(mode, expected=200):
                nonlocal process
                stop()
                config['vars']['WORKERS_MODE'] = mode
                config_path.write_text(json.dumps(config))
                process = subprocess.Popen(command + ['dev', '--local', '--ip', '127.0.0.1',
                                           '--port', str(port)] + common,
                                           cwd=scratch, env=env, stdout=log, stderr=log, start_new_session=True)
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        break
                    try:
                        if request('/', authenticated=False)[0] == expected:
                            return
                    except (URLError, ConnectionError, TimeoutError):
                        pass
                    time.sleep(0.2)
                raise RuntimeError('Local runtime failed to start: ' + (scratch / 'runtime.log').read_text()[-3000:])

            try:
                start('free')
                small = {'groups': [{'name': 'local-only', 'links': [{'raw': 'ss://dummy#local'}]}]}
                assert request('/editor/', small)[0] == 200
                assert request('/editor/', b'x' * (16 * 1024 + 1))[0] == 413
                assert request('/editor/', b'accesskey=local-key', 'application/x-www-form-urlencoded')[0] == 200
                assert request('/editor/user/', b'new_password=local-changed-password', 'application/x-www-form-urlencoded')[0] == 200
                password = 'local-changed-password'
                initial = json.loads(request('/editor/api/')[1])
                assert b'Free capacity policy' in request('/editor/?lang=en')[1]
                start('paid')
                assert json.loads(request('/editor/api/')[1]) == initial
                assert b'Paid capacity policy' in request('/editor/?lang=en')[1]
                large = {'groups': [{'name': f'group-{i}', 'links': [{'raw': 'ss://' + 'x' * 100} for _ in range(10)]} for i in range(40)]}
                assert request('/editor/', large)[0] == 200
                assert request('/editor/', b'x' * (256 * 1024 + 1))[0] == 413
                paid_status, paid_body = request('/editor/api/')
                paid_state = json.loads(paid_body)
                assert paid_status == 200 and len(paid_body) > 32 * 1024
                assert sum(len(group['links']) for group in paid_state['groups']) == 400
                start('free')
                status, body = request('/editor/api/')
                assert status == 413 and b'No data was deleted' in body
                assert request('/subscription/?group=group-0&key=local-key', authenticated=False)[0] == 413
                assert request('/editor/')[0] == 200
                start('paid')
                assert json.loads(request('/editor/api/')[1]) == paid_state
                assert request('/editor/', small)[0] == 200
                start('free')
                assert json.loads(request('/editor/api/')[1]) == initial
                assert request('/subscription/?group=local-only&key=local-key', authenticated=False)[0] == 200
                start('invalid', 503)
                assert request('/editor/')[0] == 503
                print('PASS: local Free/Paid switching, changed password, shared database, capacity guards, safe downgrade recovery, invalid mode')
            finally:
                stop()


if __name__ == '__main__':
    main()
