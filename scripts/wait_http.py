"""Wait up to 120 seconds for a local test server's expected HTTP status."""

import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

deadline = time.monotonic() + 120
expected = int(sys.argv[2]) if len(sys.argv) > 2 else 200
while time.monotonic() < deadline:
    try:
        with urlopen(Request(sys.argv[1], headers={'User-Agent': 'SYVS-Deployment-Test/3.1'}),
                     timeout=2) as response:
            if response.status == expected:
                break
    except HTTPError as error:
        if error.code == expected:
            break
    except (URLError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise SystemExit('Test server did not become ready within 120 seconds')
