"""Session cookies for the repository's HTTP test clients."""
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def login_cookie(base, password, username='user', open_request=urlopen):
    request = Request(base + '/editor/login/',
                      data=urlencode({'username': username, 'password': password}).encode(),
                      headers={'X-SYVS-Request': '1'})
    with open_request(request, timeout=30) as response:
        assert response.status == 204, response.status
        return response.headers['Set-Cookie'].split(';', 1)[0]
