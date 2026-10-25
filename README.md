# ShareYourV2raySubscription 3.0

[English](README_EN.md) | 简体中文

使用共享 JavaScript 核心的自托管 V2ray 订阅链接与节点管理器，支持 Docker 和 Cloudflare Workers。  
Self-hosted V2ray subscription system.

![screenshot](/Screenshot.png)

## 特性

- Docker 与 Cloudflare 共用 JavaScript 业务核心
- Docker 部署，轻松自托管
- 支持多组订阅链接管理
- 支持中文和英文界面，可在编辑器中切换语言
- 几乎支持所有的协议（v2ray, shadowsocks等）
  - 订阅链接本质是将多个不同的代理协议的链接以base64编码提供给客户端。即使本工具无法识别链接的别名或者协议种类，也不影响实际使用。

## 环境要求

v3.1 开发版新增 [Cloudflare Workers + D1 部署预览](cloudflare/README_ZH.md)，
提供 Deploy to Cloudflare 入口。以下 Docker 自托管方式继续可用，原有挂载数据无需迁移。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rickylsr/ShareYourV2raySubscription/tree/v3.1-dev)

- Docker（建议 Docker 20.10+）

## 快速开始

### 1. 拉取 Docker 镜像并运行

```shell
docker run -d -p 8123:8000 ghcr.io/rickylsr/shareyourv2raysubscription:latest
```

完成后，你可通过 http://<server_ip>:8123/editor 访问订阅管理系统。

### 2. 数据持久化部署

默认情况下，所有数据保存在容器内，当容器被删除后数据也会丢失。为持久化数据，你可以挂载主机目录到容器中。

假设你在主机上创建了 `/home/ubuntu/syvs/config` 目录，并且通过反向代理到域名 `https://your.domain.com/subdomain/` 提供服务,运行以下命令：

```shell
docker run -d \
  -v /home/ubuntu/syvs/config:/home/app/data \
  -p 8123:8000 \
  -e BASEURL=https://your.domain.com/subdomain/ \
  ghcr.io/rickylsr/shareyourv2raysubscription
```

容器内的数据将保存在 `/home/app/data/data.json`，同时映射到主机的 `/home/ubuntu/syvs/config`，这样即使容器被删除，数据也能保留。

## 说明

- **访问端口**：默认映射容器的 8000 端口到主机的 8123 端口，可根据需要调整 `-p` 参数。  
- **反向代理**：正确设置 `BASEURL` 以正确显示共享链接。
- **持久化存储**：建议使用数据挂载方式确保数据安全。  
- **重置设置**：如果需要重置订阅设置，只需清空挂载目录中的数据文件。
- **安全问题**: editor页面使用了HTTP Basic Auth，用户名固定为`user`，如果没有特别设置，默认密码为 `password`。您可以通过在 `docker run` 时设置环境变量 `DEFAULT_PASSWORD` 以使用不同的密码。密码存储在容器的`/home/app/data/users.json` 可以随时通过删除重置。密码也可以在editor页面随时重设。
- **高级设置**：可以通过设置docker容器环境变量 `SHAREURL` （默认为： `subscription/` ）自定义分享链接的前缀

## v3.1 Docker 升级兼容

Docker 镜像改用 Node.js 运行与 Cloudflare 相同的业务核心。标准 `docker run` / Compose
配置继续使用原端口、`/home/app/data` 数据卷和原有环境变量，无需转换旧 JSON 或重置密码。
Docker 不需要 `AUTH_SECRET`，也不受 Cloudflare Free 的节点数和保存大小限制。
旧 Werkzeug scrypt / PBKDF2 密码继续可用，新密码仍保存为旧版可读取的 scrypt 格式。
更多说明和测试范围见 [Docker 升级说明](docker/README.md)。

## 维护与更新

- 拉取最新镜像 
  ```shell
  docker pull ghcr.io/rickylsr/shareyourv2raysubscription:latest
  ```
- 删除当前容器后，重新按照步骤1（或者2）运行容器即可 
  
## 贡献与反馈

如果你有任何建议或问题，请 [提交 issue](https://github.com/rickylsr/ShareYourV2raySubscription/issues) 或者 [发起 PR](https://github.com/rickylsr/ShareYourV2raySubscription/pulls)。

---

Enjoy!
