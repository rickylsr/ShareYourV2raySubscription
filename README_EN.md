# ShareYourV2raySubscription 3.0

English | [简体中文](README.md)

A self-hosted V2ray subscription link and node manager using a shared JavaScript core for Docker and Cloudflare Workers.

![screenshot](/Screenshot.png)

## Features

- Shared JavaScript business core for Docker and Cloudflare
- Easy self-hosting with Docker
- Support for managing multiple groups of subscription links
- Chinese and English interfaces with an in-editor language switcher
- Support for nearly all protocols, including V2ray and Shadowsocks
  - A subscription link is essentially a Base64-encoded collection of links that use different proxy protocols. Even if this tool cannot recognize a link's alias or protocol type, the link will still work normally.

## Requirements

The v3.1 development branch adds a [Cloudflare Workers + D1 deployment preview](cloudflare/README.md)
with a Deploy to Cloudflare entry point. The Docker instructions below still apply;
existing mounted data requires no migration.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rickylsr/ShareYourV2raySubscription/tree/v3.1-dev)

- Docker (Docker 20.10 or later is recommended)

## Quick Start

### 1. Pull and run the Docker image

```shell
docker run -d -p 8123:8000 ghcr.io/rickylsr/shareyourv2raysubscription:latest
```

Once the container is running, open `http://<server_ip>:8123/editor` to access the subscription management system.

### 2. Run with persistent storage

By default, all data is stored inside the container and will be lost when the container is deleted. To persist your data, mount a host directory into the container.

For example, assume you have created `/home/ubuntu/syvs/config` on the host and expose the service through a reverse proxy at `https://your.domain.com/subdomain/`. Run:

```shell
docker run -d \
  -v /home/ubuntu/syvs/config:/home/app/data \
  -p 8123:8000 \
  -e BASEURL=https://your.domain.com/subdomain/ \
  ghcr.io/rickylsr/shareyourv2raysubscription
```

The container stores its data in `/home/app/data/data.json`. Because `/home/app/data` is mapped to `/home/ubuntu/syvs/config` on the host, the data will remain available even if the container is deleted.

## Notes

- **Port mapping:** By default, port 8000 in the container is mapped to port 8123 on the host. Adjust the `-p` option as needed.
- **Reverse proxy:** Set `BASEURL` correctly so that shared links are displayed properly.
- **Persistent storage:** Mounting a data directory is recommended to prevent data loss.
- **Resetting settings:** To reset the subscription settings, clear the data files in the mounted directory.
- **Security:** The editor page uses HTTP Basic Authentication. The username is always `user`, and the default password is `password` unless configured otherwise. Set the `DEFAULT_PASSWORD` environment variable when running the container to use a different password. Credentials are stored in `/home/app/data/users.json`; delete this file at any time to reset them. The password can also be changed from the editor page.
- **Advanced configuration:** Set the Docker container environment variable `SHAREURL` to customize the shared-link prefix. Its default value is `subscription/`.

## v3.1 Docker compatibility

The image now runs the same JavaScript business core as Cloudflare on Node.js.
Keep the standard Docker/Compose command, port, `/home/app/data` volume and existing
environment variables. Old JSON and Werkzeug passwords require no conversion.
Docker does not require `AUTH_SECRET` or inherit the Cloudflare Free data limits.
See [Docker upgrade notes](docker/README.md).

## Maintenance and Updates

- Pull the latest image:

  ```shell
  docker pull ghcr.io/rickylsr/shareyourv2raysubscription:latest
  ```

- Delete the current container, then run it again by following step 1 or step 2 above.

## Contributing and Feedback

If you have any suggestions or encounter any problems, please [open an issue](https://github.com/rickylsr/ShareYourV2raySubscription/issues) or [submit a pull request](https://github.com/rickylsr/ShareYourV2raySubscription/pulls).

---

Enjoy!
