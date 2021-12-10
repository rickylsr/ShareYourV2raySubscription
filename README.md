# ShareYourV2raySubscription

自托管的V2ray订阅链接与节点管理器。

Self-hosted V2ray subscription.

## 功能 Features

- 生成属于自己的 V2ray 订阅链接 
- 在网页上编辑存储多个 VMESS 和 Shadowsocks 分享链接
- 整洁的 bootstrap 自适应页面 
- 自动提取分享链接中每一个节点的别名  


- Generate your own V2ray subscription links
- Edit and store multiple VMESS and Shadowsocks share links simply on a web page
- Bootstrap adaptive pages
- Automatic extraction of the alias of each node in the share link


## 截图 Screenshot

![image](https://github.com/rickylsr/ShareYourV2raySubscription/blob/main/Screenshot.png)


## 配置向导 Quick Start

### 运行环境 Environment

- php 8.0
- nginx or apache （为安全起见，建议设置好目录权限以防未经授权的访问）

### 配置步骤 Configuration

在网站目录内新建一个目录，作为编辑器目录，并在 nginx 或 apache 中设置好访问目录的用户名、密码。

打包下载本 repository，将 bootstrap 文件夹和 index 放入编辑器目录。

在编辑器目录中新建两个空 txt 文件，用于存储普通线路订阅源文件和存储 premium 线路订阅源文件；并修改 index.php 中的路径和 url 设置：

```
$url = ''; //在这里填写 index.php 所在的网页 url，例如 https://example.com/editor/index.php
$file = ''; //在这里填写存储普通线路订阅源文件的绝对路径，例如 /www/example.com/editor/sub.txt
$file_premium = '';//在这里填写存储 premium 线路订阅源文件的绝对路径，例如 /www/example.com/editor/sub2.txt
```

在网站目录内新建另一个目录作为订阅链接目录，名称尽量复杂。可以使用密码生成器生成一个复杂的目录名称。将sub.php拷贝进该目录，并修改 sub.php 中的路径设置

```
$file = ''; //在这里填写存储普通线路订阅源文件的绝对路径，例如 /www/example.com/editor/sub.txt
$file_premium = '';//在这里填写存储 premium 线路订阅源文件的绝对路径，例如 /www/example.com/editor/sub2.txt
```

## 使用

### 添加和编辑节点

访问index.php，在文本框中填写 `vmess://` 或 `ss://` 链接，每行填写一个。例如：

```
vmess://xxxxxxxxxxxxxxxxxxxxxxxxx
ss://xxxxxxxxxxxxxxxxxxxxxxxx
vmess://xxxxxxxxxxxxxxxxxxxxxxxxxxx
```

如果不需要 premium 功能，可以任意填写两个文本框中的一个。点击提交，网页将**自动**提取各个节点的别名，并**自动**以html注释符包裹置于每条链接之前，例如：

```
<!--节点1名称--->
vmess://xxxxxxxxxxxxxxxxxxxxxxxxx

<!--节点2名称--->
ss://xxxxxxxxxxxxxxxxxxxxxxxx

<!--节点3名称--->
vmess://xxxxxxxxxxxxxxxxxxxxxxxxxxx
```

编辑或删除链接，点击提交即可。不要编辑 ```<!--节点1名称--->``` 部分。删除或编辑链接时最好整行编辑，以避免未知错误。

既编辑premium又编辑了普通线路的，点击提交按钮只会提交对应单个文本框内的更改。（比如点 premium 下面的提交按钮，普通文本框内的更改将会丢失。）

### 订阅链接

Premium线路：sub.php 的网页链接，并附加参数 `level=premium`，例如
```
https://example.com/sdfawfadcva/sub.php?level=premium
```

普通线路：sub.php 的网页链接，例如
```
https://example.com/sdfawfadcva/sub.php
```

如果只需要 Vmess 而不需要其他链接，加上 `type=vmess` 参数：
```
https://example.com/sdfawfadcva/sub.php?type=vmess
https://example.com/sdfawfadcva/sub.php?level=premium&type=vmess
```
或者加上 `type=ss` 参数，只获取Shadowsocks链接：
```
https://example.com/sdfawfadcva/sub.php?type=ss
https://example.com/sdfawfadcva/sub.php?level=premium&type=ss
```
