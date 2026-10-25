"""Exercise a fresh local Worker or Docker instance through its HTTP interface.

Only use on disposable test data: this changes subscriptions and the admin password.
Provide the test password via SYVS_TEST_PASSWORD; secrets are never printed.
"""

import base64
import json
import os
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def smoke(base_url, verify_persisted=False):
    password = os.environ['SYVS_TEST_PASSWORD']
    new_password = password + '-changed'

    def call(path, *, data=None, payload=None, authenticated=True, pwd=None):
        headers = {'X-SYVS-Request': '1', 'User-Agent': 'SYVS-Deployment-Test/3.1'}
        if authenticated:
            token = base64.b64encode(f'user:{pwd or password}'.encode()).decode()
            headers['Authorization'] = 'Basic ' + token
        body = None
        if data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            body = urlencode(data).encode()
        if payload is not None:
            headers['Content-Type'] = 'application/json'
            body = json.dumps(payload).encode()
        try:
            response = urlopen(Request(base_url + path, data=body, headers=headers), timeout=30)
        except HTTPError as error:
            response = error
        return response.status, response.read()

    if verify_persisted:
        assert call('/editor/')[0] == 401
        status, body = call('/editor/api/', pwd=new_password)
        assert status == 200, (status, body[:500])
        state = json.loads(body)
        assert state['groups'][0]['name'] == '测试'
        assert state['accesskey'] == 'rotated-key'
        query = urlencode({'key': 'rotated-key', 'group': '测试'})
        status, body = call('/subscription/?' + query, authenticated=False)
        assert status == 200 and b'vless://' in base64.b64decode(body)
        print('PASS: password and subscription state survived restart/redeployment')
        return

    assert call('/')[0] == 200
    assert call('/editor/', authenticated=False)[0] == 401
    assert call('/editor/', pwd='wrong')[0] == 401
    status, body = call('/editor/?lang=en')
    assert status == 200, (status, body[:500])
    assert b'<html lang="en">' in body
    assert b'<html lang="zh-CN">' in call('/editor/?lang=zh')[1]
    links = ['vless://example#%E9%A6%99%E6%B8%AF', 'ss://example#Test']
    status, body = call('/editor/', payload={
        'groups': [{'name': '测试', 'links': [{'raw': link} for link in links]}]})
    assert status == 200 and json.loads(body)['status'] == 'success', (status, body)
    status, body = call('/editor/', data={'accesskey': 'smoke-key', 'dontsavekeytf': 'yes'})
    assert status == 200 and json.loads(body)['accesskey'] == '', (status, body)
    query = urlencode({'key': 'smoke-key', 'group': '测试'})
    status, body = call('/subscription/?' + query, authenticated=False)
    assert status == 200 and base64.b64decode(body).decode() == '\n'.join(links), (status, body)
    assert call('/subscription/?key=wrong', authenticated=False)[0] == 403
    call('/editor/', data={'accesskey': 'rotated-key'})
    assert call('/subscription/?' + query, authenticated=False)[0] == 403
    status, body = call('/editor/user/', data={'new_password': new_password})
    assert status == 200 and 'success' in json.loads(body), (status, body)
    assert call('/editor/')[0] == 401
    assert call('/editor/', pwd=new_password)[0] == 200
    state = json.loads(call('/editor/api/', pwd=new_password)[1])
    assert state['groups'][0]['links'][0]['comment'] == '香港'
    assert state['accesskey'] == 'rotated-key'
    print('PASS: auth, bilingual templates, groups, Unicode, subscription, key rotation, password change')


if __name__ == '__main__':
    smoke(sys.argv[1].rstrip('/'), '--verify-persisted' in sys.argv[2:])
