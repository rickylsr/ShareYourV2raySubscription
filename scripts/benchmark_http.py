"""Read-only HTTP workload for a disposable, smoke-tested Cloudflare instance.

CPU is measured by Workers tail, not by client elapsed time. Provide the current
password via SYVS_TEST_PASSWORD. Requests carry only non-secret case labels.
"""

import base64
import os
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

base = sys.argv[1].rstrip('/')
prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''
authorization = 'Basic ' + base64.b64encode(
    ('user:' + os.environ['SYVS_TEST_PASSWORD']).encode()).decode()
cases = [
    ('api-warm', '/editor/api/', {}),
    ('editor-warm', '/editor/', {}),
    ('subscription-warm', '/subscription/', {'group': '测试', 'key': 'rotated-key'}),
]
for name, path, query in cases:
    name = prefix + name
    # Keep the first authentication/render separate from the repeated samples.
    prime_url = base + path + '?' + urlencode({**query, 'cpu_case': name + '-prime'})
    with urlopen(Request(prime_url, headers={
        'Authorization': authorization, 'User-Agent': 'SYVS-CPU-Test/3.1',
    }), timeout=30) as response:
        assert response.status == 200, response.status
        response.read()
    for _ in range(30):
        url = base + path + '?' + urlencode({**query, 'cpu_case': name})
        with urlopen(Request(url, headers={
            'Authorization': authorization, 'User-Agent': 'SYVS-CPU-Test/3.1',
        }), timeout=30) as response:
            assert response.status == 200, response.status
            response.read()
    print(f'PASS: {name}, 30 successful requests (CPU figures come from Workers tail)')
