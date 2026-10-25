"""Destructive Free-target acceptance workload: use ONLY disposable test data.

Exercises reads, writes, password changes, configured maximum data sizes and
rejections. Measure cpuTime from Workers tail; client latency is not CPU time.
"""

import base64
import json
import os
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

base = sys.argv[1].rstrip('/')
password = os.environ['SYVS_TEST_PASSWORD']
prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else 'free-'


def call(case, path, expected=200, *, payload=None, form=None, raw=None, content_type=None, method=None, credential=None):
    headers = {'User-Agent': 'SYVS-Free-Budget-Test/3.1', 'Authorization': 'Basic ' + base64.b64encode(
        ('user:' + (password if credential is None else credential)).encode()).decode()}
    body = raw
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
        content_type = 'application/json'
    if form is not None:
        body = urlencode(form).encode()
        content_type = 'application/x-www-form-urlencoded'
    if content_type:
        headers['Content-Type'] = content_type
    url = base + path + ('&' if '?' in path else '?') + urlencode({'cpu_case': prefix + case})
    try:
        response = urlopen(Request(url, data=body, headers=headers, method=method), timeout=30)
    except HTTPError as error:
        response = error
    data = response.read()
    assert response.status == expected, (case, response.status, data[:150])
    print(f'PASS: {case} -> {expected}')
    return data


original = json.loads(call('api-initial', '/editor/api/'))
groups = original['groups']
initial_password = password
try:
    call('wrong-password', '/editor/api/', 401, credential=password + '-wrong')
    call('password-change', '/editor/user/', form={'new_password': password + '-budget'})
    previous = password
    password += '-budget'
    call('revoked-password', '/editor/api/', 401, credential=previous)
    call('new-password', '/editor/api/')
    maximum = [{'name': f'group-{g}', 'links': [{'raw': 'vless://' + 'x' * 16 + f'#{g}-{i}'} for i in range(8)]} for g in range(32)]
    call('save-256-nodes-32-groups', '/editor/', payload={'groups': maximum})
    call('api-256-nodes', '/editor/api/')
    page = call('editor-256-nodes', '/editor/')
    assert ('vless://' + 'x' * 16).encode() not in page, 'Nodes must be loaded by the browser, not server-rendered'
    call('subscription-256-nodes', '/subscription/?' + urlencode({'group': 'group-31', 'key': 'rotated-key'}))

    link_payload = {'ps': 'p' * 2850, 'x': ''}
    size = len(json.dumps(link_payload, separators=(',', ':')).encode())
    link_payload['x'] = 'x' * (3066 - size)
    link = 'vmess://' + base64.b64encode(json.dumps(link_payload, separators=(',', ':')).encode()).decode()
    assert len(link) == 4096
    maximum_links = {'groups': [{'name': 'long', 'links': [{'raw': link} for _ in range(3)]}]}
    call('save-max-link-size', '/editor/', payload=maximum_links)
    call('api-max-metadata', '/editor/api/')
    call('editor-max-metadata', '/editor/')
    encoded = call('subscription-max-link-size', '/subscription/?group=long&key=rotated-key')
    assert len(base64.b64decode(encoded).decode().split('\n')) == 3

    openers = 'ss://' + '<!--' * 995
    call('save-unclosed-comments', '/editor/', payload={'groups': [{'name': 'comments', 'links': [{'raw': openers} for _ in range(3)]}]})
    encoded = call('subscription-unclosed-comments', '/subscription/?group=comments&key=rotated-key')
    assert base64.b64decode(encoded).decode() == '\n'.join([openers] * 3)

    exact = {'groups': [{'name': 'exact', 'links': []}], 'padding': ''}
    exact['padding'] = 'x' * (16384 - len(json.dumps(exact, separators=(',', ':')).encode()))
    body = json.dumps(exact, separators=(',', ':')).encode()
    assert len(body) == 16384
    call('save-exact-16-kib', '/editor/', raw=body, content_type='application/json')
    call('reject-16-kib-plus-one', '/editor/', 413, raw=body + b' ', content_type='application/json')
    call('reject-33-groups', '/editor/', 413, payload={'groups': [{'name': str(i), 'links': []} for i in range(33)]})
    call('reject-257-nodes', '/editor/', 413, payload={'groups': [{'name': 'many', 'links': [{'raw': 'ss://x'} for _ in range(257)]}]})
    call('reject-link-too-long', '/editor/', 400, payload={'groups': [{'name': 'long', 'links': [{'raw': 'x' * 4097}]}]})
    call('reject-password-too-long', '/editor/user/', 400, form={'new_password': 'x' * 1025})
    call('reject-group-name-too-long', '/editor/', 400, payload={'groups': [{'name': 'x' * 257, 'links': []}]})
    call('reject-malformed-json', '/editor/', 400, raw=b'{', content_type='application/json')
    call('reject-unsupported-form', '/editor/', 400, raw=b'{}', content_type='application/octet-stream')
    call('head', '/subscription/?key=rotated-key', method='HEAD')
    call('not-found', '/not-a-route', 404)
    call('method-not-allowed', '/subscription/', 405, method='POST')
finally:
    call('restore-groups', '/editor/', payload={'groups': groups})
    if password != initial_password:
        call('restore-password', '/editor/user/', form={'new_password': initial_password})
        password = initial_password
print('PASS: all Free-target functional and boundary cases')
