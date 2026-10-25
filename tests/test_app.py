"""Self-hosted regressions; smoke_http.py checks both deployment targets."""

import base64
import json
import importlib.util
import os
import uuid
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests' / 'legacy'))

from werkzeug.security import generate_password_hash


class AppContract:
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = {'TESTING': True, 'DEFAULT_PASSWORD': 'test-password'}
        self.client = self.app().test_client()

    def app(self, **overrides):
        config = {**self.config, **overrides}
        name = 'syvs_test_' + uuid.uuid4().hex
        spec = importlib.util.spec_from_file_location(name, ROOT / 'tests' / 'legacy' / 'wsgi.py')
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        self.addCleanup(sys.modules.pop, name, None)
        with patch.dict(os.environ, {key: str(value) for key, value in config.items()}):
            spec.loader.exec_module(module)
        module.STORE_FILE = str(Path(self.directory.name) / 'data.json')
        module.STORE_USER = str(Path(self.directory.name) / 'users.json')
        module.app.config['TESTING'] = True
        module.app.template_folder = str(ROOT / 'app' / 'templates')
        return module.app

    def auth(self, password='test-password'):
        return {'Authorization': 'Basic ' + base64.b64encode(
            f'user:{password}'.encode()).decode()}

    def test_authentication(self):
        for path in ('/editor/', '/editor/api/', '/editor/user/'):
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.get(path, headers=self.auth('wrong')).status_code, 401)
            self.assertEqual(self.client.get(path, headers=self.auth()).status_code, 200)

    def test_bilingual_template_and_language_cookie(self):
        response = self.client.get('/editor/?lang=en', headers=self.auth())
        self.assertIn(b'<html lang="en">', response.data)
        self.assertIn('language=en', response.headers['Set-Cookie'])
        response = self.client.get('/editor/', headers=self.auth())
        self.assertIn(b'<html lang="en">', response.data)
        response = self.client.get('/editor/?lang=zh', headers=self.auth())
        self.assertIn(b'<html lang="zh-CN">', response.data)

    def test_groups_unicode_and_subscription(self):
        vmess = 'vmess://' + base64.b64encode(json.dumps({'ps': '日本'}).encode()).decode()
        links = [vmess, 'vless://example#%E9%A6%99%E6%B8%AF', 'ss://example#SS',
                 'trojan://example#Other']
        response = self.client.post('/editor/', headers=self.auth(), json={
            'groups': [{'name': '测试 / 日本', 'links': [{'raw': link} for link in links]}]
        })
        self.assertEqual(response.json['status'], 'success')
        data = self.client.get('/editor/api/', headers=self.auth()).json
        self.assertEqual(data['groups'][0]['links'][0]['comment'], '日本')
        self.assertEqual(data['groups'][0]['links'][1]['comment'], '香港')
        response = self.client.get('/subscription/', query_string={'group': '测试 / 日本'})
        self.assertEqual(base64.b64decode(response.data).decode(), '\n'.join(links))

    def test_share_key_rotation_and_no_plaintext(self):
        response = self.client.post('/editor/', headers=self.auth(), data={
            'accesskey': 'first', 'dontsavekeytf': 'yes'})
        self.assertEqual(response.json['accesskey'], '')
        self.assertEqual(self.client.get('/subscription/?key=first').status_code, 200)
        self.assertEqual(self.client.get('/subscription/?key=wrong').status_code, 403)
        self.client.post('/editor/', headers=self.auth(), data={'accesskey': 'second'})
        self.assertEqual(self.client.get('/subscription/?key=first').status_code, 403)
        self.assertEqual(self.client.get('/subscription/?key=second').status_code, 200)

    def test_password_change_survives_app_recreation(self):
        self.client.post('/editor/user/', headers=self.auth(), data={'new_password': 'changed'})
        client = self.app(DEFAULT_PASSWORD='different-bootstrap-password').test_client()
        self.assertEqual(client.get('/editor/', headers=self.auth()).status_code, 401)
        self.assertEqual(client.get('/editor/', headers=self.auth('changed')).status_code, 200)
        self.assertNotIn('changed', (Path(self.directory.name) / 'users.json').read_text())

    def test_settings_updates_preserve_other_fields(self):
        self.client.post('/editor/', headers=self.auth(), data={'accesskey': 'keep'})
        self.client.post('/editor/', headers=self.auth(), json={'groups': []})
        data = self.client.get('/editor/api/', headers=self.auth()).json
        self.assertEqual(data['accesskey'], 'keep')
        self.assertEqual(data['groups'], [])
        self.client.post('/editor/', headers=self.auth(), data={'accesskey': 'new'})
        self.assertEqual(json.loads((Path(self.directory.name) / 'data.json').read_text())['groups'], [])

    def test_custom_url_and_isolated_configuration(self):
        client = self.app(SHAREURL='custom/sub/', BASEURL='https://example.test/').test_client()
        self.assertEqual(client.get('/custom/sub/').status_code, 200)
        self.assertEqual(client.get('/subscription/').status_code, 404)
        data = client.get('/editor/api/', headers=self.auth()).json
        self.assertEqual(data['baseurl'], 'https://example.test/')
        self.assertEqual(data['shareurl'], 'custom/sub/')
        self.assertEqual(self.client.get('/subscription/').status_code, 200)


class JSONAppTests(AppContract, unittest.TestCase):
    def test_existing_volume_format_is_read_without_migration(self):
        path = Path(self.directory.name)
        (path / 'users.json').write_text(json.dumps({
            'user': generate_password_hash('legacy-password')}))
        (path / 'data.json').write_text(json.dumps({
            'groups': [{'name': 'legacy', 'links': [{'raw': 'ss://old'}]}],
            'accesskey': '', 'key_md5': '', 'extra': 'preserved'}))
        response = self.client.get('/editor/api/', headers=self.auth('legacy-password'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['groups'][0]['name'], 'legacy')
        self.client.post('/editor/', headers=self.auth('legacy-password'),
                         data={'accesskey': 'new'})
        self.assertEqual(json.loads((path / 'data.json').read_text())['extra'], 'preserved')


if __name__ == '__main__':
    unittest.main()
