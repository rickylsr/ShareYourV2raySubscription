"""Real image/volume upgrade test. Creates and removes only its own containers/volumes.

Usage: python3 tests/upgrade_docker.py [old-image] [new-image]
"""
import base64
import json
import secrets
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

old_image = sys.argv[1] if len(sys.argv) > 1 else 'syvs:legacy-fixture'
new_image = sys.argv[2] if len(sys.argv) > 2 else 'syvs:shared-test'
label = 'syvs-upgrade-' + secrets.token_hex(8)
containers = set()
volumes = set()
directories = []


def docker(*args):
    result = subprocess.run(['docker', *args], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def call(url, password, path='/editor/api/', *, username='user', payload=None, form=None):
    headers = {'Authorization': 'Basic ' + base64.b64encode(f'{username}:{password}'.encode()).decode()}
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        headers['Content-Type'] = 'application/json'
    if form is not None:
        body = urlencode(form).encode()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        response = urlopen(Request(url + path, data=body, headers=headers), timeout=30)
    except HTTPError as error:
        response = error
    return response.status, response.read()


def start(image, volume, suffix, default='changed-bootstrap', *, file_directory=None):
    name = label + '-' + suffix
    mounts = ['-v', volume + ':/home/app/data'] if file_directory is None else [
        '-v', file_directory + '/data.json:/home/app/data/data.json',
        '-v', file_directory + '/users.json:/home/app/data/users.json',
    ]
    docker('run', '-d', '--name', name, '-p', '127.0.0.1::8000', *mounts,
           '-e', 'DEFAULT_PASSWORD=' + default, '-e', 'SHAREURL=legacy/sub/',
           '-e', 'BASEURL=https://example.test/subdomain/', image)
    containers.add(name)
    url = 'http://' + docker('port', name, '8000/tcp').splitlines()[0]
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urlopen(url + '/', timeout=1) as response:
                if response.status == 200:
                    return name, url
        except (URLError, TimeoutError, OSError):
            time.sleep(.1)
    raise RuntimeError('Container failed to start: ' + name + '\n' + docker('logs', name))


def stop(name):
    docker('rm', '-f', name)
    containers.discard(name)


def files(name, runtime):
    if runtime == 'python':
        script = "import hashlib,json; from pathlib import Path; print(json.dumps({n:hashlib.sha256(Path('/home/app/data/'+n).read_bytes()).hexdigest() for n in ['data.json','users.json']}))"
        return json.loads(docker('exec', name, 'python', '-c', script))
    script = "const fs=require('node:fs'),c=require('node:crypto'); console.log(JSON.stringify(Object.fromEntries(['data.json','users.json'].map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/home/app/data/'+n)).digest('hex')]))));"
    return json.loads(docker('exec', name, 'node', '-e', script))


try:
    volume = label + '-data'
    docker('volume', 'create', volume)
    volumes.add(volume)
    name, url = start(old_image, volume, 'old', 'bootstrap-before-upgrade')
    vmess = 'vmess://' + base64.b64encode(json.dumps({'ps': '日本线路'}).encode()).decode()
    long_name = '旧分组' + '线' * 90
    long_link = 'vless://' + 'x' * 6000 + '#legacy-long'
    links = ['vless://id@node.example:443?path=' + 'x' * 120 + f'#node-{i}' for i in range(300)]
    groups = [{'name': long_name, 'links': [{'raw': vmess}, {'raw': long_link}, {'raw': 'ss://x#香港'}]},
              {'name': 'Large', 'links': [{'raw': raw} for raw in links]}]
    assert len(json.dumps({'groups': groups}).encode()) > 32768
    assert call(url, 'bootstrap-before-upgrade', '/editor/', payload={'groups': groups})[0] == 200
    assert call(url, 'bootstrap-before-upgrade', '/editor/', form={'accesskey': 'legacy-share-key'})[0] == 200
    assert call(url, 'bootstrap-before-upgrade', '/editor/user/', form={'new_password': 'legacy-password'})[0] == 200
    docker('exec', name, 'python', '-c', """
import json,os
from pathlib import Path
from werkzeug.security import generate_password_hash
p=Path('/home/app/data')
data=json.loads((p/'data.json').read_text());data['upgrade_marker']='preserve-me';data['groups'][0]['legacy_group_marker']='preserve-group';(p/'data.json').write_text(json.dumps(data,ensure_ascii=False,indent=4))
users=json.loads((p/'users.json').read_text());users['another']=generate_password_hash('other-password',method='pbkdf2:sha256:600000');(p/'users.json').write_text(json.dumps(users,indent=4))
for n in ['data.json','users.json']: os.chmod(p/n,0o640);os.chown(p/n,1000,1000)
""")
    before = files(name, 'python')
    reference = call(url, 'legacy-password', '/legacy/sub/?key=legacy-share-key&group=Large')[1]
    stop(name)

    name, url = start(new_image, volume, 'new')
    assert call(url, 'legacy-password')[0] == 200
    assert call(url, 'changed-bootstrap')[0] == 401
    assert call(url, 'other-password', username='another')[0] == 200
    data = json.loads(call(url, 'legacy-password')[1])
    assert data['baseurl'] == 'https://example.test/subdomain/'
    assert data['shareurl'] == 'legacy/sub/'
    assert len(data['groups'][1]['links']) == 300
    assert data['groups'][0]['links'][1]['raw'] == long_link
    assert call(url, 'legacy-password', '/legacy/sub/?key=legacy-share-key&group=Large')[1] == reference
    assert files(name, 'node') == before, 'Starting and reading must not rewrite old files'
    response = json.loads(call(url, 'legacy-password', '/editor/', form={'accesskey': 'upgraded-share-key'})[1])
    assert len(response['groups'][1]['links']) == 300, 'Legacy key-save response still contains groups'
    data['groups'][1]['links'].append({'raw': 'ss://new#升级'})
    assert json.loads(call(url, 'legacy-password', '/editor/', payload={'groups': data['groups']})[1])['status'] == 'success'
    assert call(url, 'legacy-password', '/editor/user/', form={'new_password': 'node-password😀:$'})[0] == 200
    assert call(url, 'legacy-password')[0] == 401
    assert call(url, 'node-password😀:$')[0] == 200
    persisted = call(url, 'node-password😀:$', '/legacy/sub/?key=upgraded-share-key&group=Large')[1]
    stop(name)

    name, url = start(new_image, volume, 'restart', 'different-again')
    assert call(url, 'node-password😀:$')[0] == 200
    assert call(url, 'other-password', username='another')[0] == 200
    stop(name)
    name, url = start(old_image, volume, 'rollback', 'unused-bootstrap')
    assert call(url, 'node-password😀:$')[0] == 200, 'Old Werkzeug must read newly written Node passwords'
    assert call(url, 'node-password😀:$', '/legacy/sub/?key=upgraded-share-key&group=Large')[1] == persisted
    docker('exec', name, 'python', '-c', """
import json,os,stat
from pathlib import Path
p=Path('/home/app/data');d=json.loads((p/'data.json').read_text());u=json.loads((p/'users.json').read_text())
assert d['upgrade_marker']=='preserve-me' and d['groups'][0]['legacy_group_marker']=='preserve-group'
assert len(d['groups'][1]['links'])==301 and 'another' in u
for n in ['data.json','users.json']:
 s=(p/n).stat();assert s.st_uid==1000 and s.st_gid==1000 and stat.S_IMODE(s.st_mode)==0o640
""")
    stop(name)
    print('PASS: old scrypt volume -> shared Node image -> restart -> old Python image; files, permissions, users and large configurations compatible')

    pb_volume = label + '-pbkdf2'
    docker('volume', 'create', pb_volume)
    volumes.add(pb_volume)
    docker('run', '--rm', '-v', pb_volume + ':/home/app/data', '--entrypoint', 'python', old_image, '-c', """
import json
from pathlib import Path
from werkzeug.security import generate_password_hash
p=Path('/home/app/data');(p/'users.json').write_text(json.dumps({'user':generate_password_hash('旧密码😀:$',method='pbkdf2:sha256:600000')}));(p/'data.json').write_text('{}')
""")
    name, url = start(new_image, pb_volume, 'pbkdf2')
    assert call(url, '旧密码😀:$')[0] == 200
    assert call(url, 'wrong')[0] == 401
    assert call(url, '旧密码😀:$', '/editor/user/', form={'new_password': 'new-pbkdf2-user'})[0] == 200
    stop(name)
    name, url = start(old_image, pb_volume, 'pbkdf2-rollback')
    assert call(url, 'new-pbkdf2-user')[0] == 200
    stop(name)
    print('PASS: old PBKDF2 volume upgrades without password reset; new writes remain readable by old image')

    directory = tempfile.TemporaryDirectory(prefix=label + '-files-')
    directories.append(directory)
    docker('run', '--rm', '-v', directory.name + ':/home/app/data', '--entrypoint', 'python', old_image, '-c', """
import json
from pathlib import Path
from werkzeug.security import generate_password_hash
p=Path('/home/app/data');(p/'users.json').write_text(json.dumps({'user':generate_password_hash('bind-password')}));(p/'data.json').write_text(json.dumps({'groups':[],'bind_marker':'preserve'}))
""")
    inode = {n: (Path(directory.name)/n).stat().st_ino for n in ('data.json', 'users.json')}
    name, url = start(new_image, None, 'file-mounts', file_directory=directory.name)
    assert call(url, 'bind-password')[0] == 200
    assert call(url, 'bind-password', '/editor/', payload={'groups': [{'name': '单文件挂载', 'links': [{'raw': 'ss://file#test'}]}]})[0] == 200
    assert call(url, 'bind-password', '/editor/', form={'accesskey': 'file-key'})[0] == 200
    assert call(url, 'bind-password', '/editor/user/', form={'new_password': 'bind-password-new'})[0] == 200
    assert call(url, 'bind-password-new')[0] == 200
    assert call(url, 'bind-password')[0] == 401
    stop(name)
    for n in ('data.json', 'users.json'):
        assert (Path(directory.name)/n).stat().st_ino == inode[n], 'Single-file bind mounts must be written in place'
    saved = json.loads((Path(directory.name)/'data.json').read_text())
    assert saved['bind_marker'] == 'preserve' and saved['accesskey'] == 'file-key'
    name, url = start(old_image, None, 'file-mounts-rollback', file_directory=directory.name)
    assert call(url, 'bind-password-new')[0] == 200
    assert json.loads(call(url, 'bind-password-new')[1])['groups'][0]['name'] == '单文件挂载'
    stop(name)
    print('PASS: separately bind-mounted JSON files save successfully, retain their inodes, and remain readable by the old image')
finally:
    for name in list(containers):
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
    for volume in list(volumes):
        subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True)
    for directory in directories:
        directory.cleanup()
