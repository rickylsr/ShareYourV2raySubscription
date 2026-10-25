# Cloudflare 部署（v3.1 开发预览）

简体中文 | [English](README.md)

Cloudflare 版本使用 JavaScript Worker 和 D1，构建时将现有编辑器模板和翻译生成静态 HTML，节点由浏览器通过鉴权 API 加载。
Docker 版本使用相同 JavaScript 核心与 JSON 适配层，保留 `data.json`、`users.json` 文件及挂载目录。
两种部署的数据互相独立，不会自动迁移或同步。

## 一键部署

按钮使用 `v3.1-dev` 开发分支。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rickylsr/ShareYourV2raySubscription/tree/v3.1-dev)

1. 登录 Cloudflare，按提示关联 GitHub/GitLab 账户。
2. 设置 Worker 名称和 D1 数据库名称，数据库绑定名保持为 `DB`。
3. 设置两个 Worker secrets：`DEFAULT_PASSWORD` 为登录密码；`AUTH_SECRET` 为独立随机的 64 个十六进制字符的密钥（256 位），可用 `openssl rand -hex 32` 生成。
4. 项目根目录选择仓库根目录（`/`），构建命令为 `npm run build`，部署命令为
   `npm run deploy`。此部署目标只需要 Node.js/npm。
5. `WORKERS_MODE` 默认 `free`；已开通 Workers Paid 的账户可改为 `paid`，具体见下方切换说明。
6. 部署完成后访问 `https://<worker>.workers.dev/editor/`，用户名为 `user`。

未配置两个 secrets 时服务返回 503，不会使用 Docker 的默认密码。
`npm run deploy` 会在上传后幂等初始化 D1 设置表，HTTP 请求内不再建表或运行迁移。
部署按钮可根据配置自动创建并绑定 D1。

编辑器模板由 Nunjucks 在构建时生成 HTML，Worker 不运行模板引擎，也不逐节点生成 HTML。
我们验证过 Python Workers，但最小官方示例在云端测试中也返回 1101，因此此部署目标采用
JavaScript。参见 [部署按钮文档](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。

## 本地开发与手动部署

需要 Node.js 22+ 和 npm；可选的测试脚本需要 Python。

```sh
npm ci
npm run db:local
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中填写 DEFAULT_PASSWORD 和独立随机的 AUTH_SECRET，然后启动：
npm run dev
```

访问 `http://localhost:8787/editor/`。本地 D1 数据保存在 `.wrangler/`，不会操作远程数据库。
`npm run check` 只检查打包，不上传。开发服务器会监控 Worker 源码、共享模板和翻译文件并重新构建。

以下命令均在仓库根目录运行。手动部署时，先运行：

```sh
npm exec --prefix cloudflare -- wrangler login
npm exec --prefix cloudflare -- wrangler d1 create syvs
```

将返回的数据库 ID 填入仓库根目录的 `wrangler.jsonc`，绑定名保持为 `DB`。
在仓库外的私有文件中设置 `DEFAULT_PASSWORD=你的密码` 和 `AUTH_SECRET=随机密钥`，再同时上传代码和两个 secrets：

```sh
npm run deploy -- --secrets-file /absolute/path/to/private.env
```

后续运行 `npm run deploy` 会保留已有 secrets；保持数据库 ID 不变即可保留数据。
Worker 的 `SHAREURL` 和 `BASEURL` 与 Docker 设置含义一致。
`SHAREURL` 必须是非空路径，且不能占用 `/editor`。

## 选择与切换 Free / Paid

`WORKERS_MODE=free|paid` 是应用的容量策略，默认 `free`。它不会修改 Cloudflare 账户的套餐、开通付费或取消订阅。使用 `paid` 前，需由账户所有者自行在 Cloudflare 开通 Workers Paid；付费账户也可使用 `free` 策略，但这不会取消付费。参见 [官方计费说明](https://developers.cloudflare.com/workers/platform/pricing/)。

首次部署可在仓库根目录 `wrangler.jsonc` 的 `vars.WORKERS_MODE` 中选择。后续修改这个值并重新部署，即可切换策略；保留相同的 D1 数据库和 `AUTH_SECRET`，原订阅与网页修改后的密码会继续使用。也可在 Cloudflare 控制台修改变量并部署，但应同步仓库配置，避免下次发布覆盖。

Paid 切回 Free 前，先在 Paid 下把数据缩到 Free 上限。若误切后已有单条记录超过 32 KiB，读取会返回 413，并提示切回原模式缩减数据；应用不会截断或删除记录。切换应用策略后，账户计费套餐仍需用户单独处理。Docker 不使用这个变量，继续使用原有自托管容量策略。

## 容量与密码校验

Cloudflare 使用带随机盐的 HMAC-SHA256 校验值，密钥来自独立的 256 位 `AUTH_SECRET`。
密钥只保存在 Cloudflare secrets 中，D1 只保存校验值。网页改密和 HTTP Basic Auth 保留，
包括首次请求在内均不执行 PBKDF2；Docker 适配层继续验证旧密码，并保留旧文件格式。

此方案依赖随机密钥与数据库分开保管：仅 D1 泄露时无法离线猜测密码；若 D1 和
`AUTH_SECRET` 同时泄露，猜测成本低于慢哈希。更新时保持 `AUTH_SECRET` 不变。
更换或丢失它会使已有登录校验值失效。重置时，保持有效密钥、更新 `DEFAULT_PASSWORD`，
再仅删除 D1 `settings` 表中的 `users` 行即可，订阅不受影响。
旧开发版 PBKDF2 记录须在部署前离线迁移或重置，Worker 不执行慢哈希迁移。

为约束每次请求的 CPU 和内存，Cloudflare 版本设置以下上限：

| 项目 | Free（默认） | Paid |
| --- | --- | --- |
| 单次保存 | 16 KiB / 最多 64 个读取分块 | 256 KiB / 最多 256 个读取分块 |
| 保存分组 / 节点总数 | 32 组 / 256 个节点 | 256 组 / 4096 个节点 |
| 单条节点链接 | 4096 UTF-8 字节 | 16 KiB |
| 处理后的单条设置记录 | 32 KiB | 512 KiB |
| 登录密码 / 分组名称 / 分享密钥 | 1024 / 256 / 512 UTF-8 字节 | 相同 |

无 Content-Length 时也检查保存大小。Paid 的上限是应用容量设置，不代表这些请求在 10ms CPU 内；原 Free CPU 实测仅适用于 Free 策略。

超限操作返回 400/413。编辑器使用静态 HTML，节点控件由浏览器生成，避免服务端页面渲染
随节点数量增长。Free 策略的历史实测以 Workers Free 的每次请求 10ms CPU 为目标，覆盖 Free 边界。
Cloudflare 的调度、冷启动和执行环境不由项目控制，有限实测不能构成任意负载下的绝对保证。
参见 [官方限制](https://developers.cloudflare.com/workers/platform/limits/) 和 [实测记录](VALIDATION.md)。

开发者回归测试与可重复运行的 HTTP 验收命令见 [英文说明的 Verification](README.md#verification)。
HTTP 验收会修改密码和订阅，只能用于可丢弃的测试实例。

Free 边界验收脚本为 `scripts/free_budget_http.py`，只能用于可丢弃测试实例；
`benchmark_http.py` 生成重复读取流量，`summarize_cpu.py` 根据真实 tail CPU 指标检查 10ms 门槛。
最终脱敏样本见 [CPU_RESULTS.csv](CPU_RESULTS.csv)。每天免费请求数和 D1 配额仍然适用，
应用不会自动升级套餐。
