# ShareYourV2raySubscription 2.0

自托管的V2ray订阅链接与节点管理器2.0。

Self-hosted V2ray subscription 2.0.

## 功能

- 生成属于自己的 V2ray 订阅链接 
- 在网页上编辑存储多个 VMESS 和 Shadowsocks 分享链接
- 整洁的 bootstrap 自适应页面 
- 自动提取分享链接中每一个节点的别名
- 订阅分享页面通过url key进行验证 (新功能！)
- 在编辑器中编辑accesskey并决定是否明文储存（可选仅md5存储）(新功能！)
- 在编辑器中直接复制可以用于各种客户端软件的订阅链接 (新功能！)

### 长期规划

- [ ] 使用url key加密节点信息
- [ ] 升级index.php的验证

## 支持协议

- [x] VMESS / VLESS
- [x] Shadowsocks

## 截图 

![image](https://github.com/rickylsr/ShareYourV2raySubscription/blob/main/SYVS.2.0.png)


## 配置向导

### 运行环境 

- php 8.0
- nginx or apache 

### 配置步骤

在网站目录内新建一个目录，作为编辑器目录，并在 nginx 或 apache 中设置好访问目录的用户名、密码。

打包下载本 repository，将 admin 文件夹和 public 文件夹放入网站目录内的某个地方。

在 admin 目录中新建 4 个空 txt 文件，它们分别用于： 
- 存储普通线路订阅源文件
- 存储 premium 线路订阅源文件
- 存储AccessKey明文及
- AccessKey密文；

用文本编辑器修改 admin/index.php 中的路径和 url 设置：

```
$url = ''; //在这里填写 index.php 所在的网页 url，例如 https://example.com/admin/index.php
$file = ''; //在这里填写存储普通线路订阅源文件的绝对路径，例如 /www/example.com/admin/sub.txt
$file_premium = '';//在这里填写存储 premium 线路订阅源文件的绝对路径，例如 /www/example.com/admin/sub2.txt
$key = '';//在这里填写存储AccessKey明文的txt文件绝对路径，例如 /www/example.com/admin/key.txt
$key_md5 = '';//在这里填写存储AccessKey密文的txt文件的绝对路径，例如 /www/example.com/admin/md5.txt
$shareurl = '';//在这里填写sub.php所在的网页 url，例如 https://example.com/public/sub.php
```

用文本编辑器编辑修改 public/sub.php中的路径设置

```
    $key_md5 = '';//在这里填写存储AccessKey MD5文件的绝对路径，例如 /www/example.com/admin/md5.txt
    $file = '';//在这里填写存储普通线路订阅源文件的绝对路径，例如 /www/example.com/admin/sub.txt
    $file_premium = '';//在这里填写存储 premium 线路订阅源文件的绝对路径，例如 /www/example.com/admin/sub2.txt
```
你可以更改sub.php和各种路径的名字，但请记得同时更改在配置文件里的路径

## 使用

### 添加和编辑节点

访问 index.php，在文本框中填写 `vmess://` 或 `ss://` 链接，每行填写一个。例如：

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

> **Warning**

> 目前只有V2rayN生成的vmess和ss链接经过测试，详见 [Issue 2](https://github.com/rickylsr/ShareYourV2raySubscription/issues/3)

编辑或删除链接，点击提交即可。不要编辑 ```<!--节点1名称--->``` 部分。删除或编辑链接时最好整行编辑，以避免未知错误。

既编辑premium又编辑了普通线路的，点击提交按钮只会提交对应单个文本框内的更改。（比如点 premium 下面的提交按钮，普通文本框内的更改将会丢失。）

### 订阅链接

#### 首次使用

- 生成订阅链接（以下方法二选一）
-   点击“一键生成密钥”（推荐）
-   手动在上面文本框中输入密钥并点击生成分享链接
- 点击按钮直接复制或手动复制
- 根据需要勾选是否明文保存密码（若勾选，则在忘记密码时下一次只能重新生成新的access key）
- 点击立即保存

#### 再次使用

忘记订阅链接时，重新生成或设置access key，并复制订阅链接

#### 手动设置

Premium线路：sub.php 的网页链接，并附加参数 `key=【你的access key】&level=premium`，例如
```
https://example.com/sub.php?key=【你的access key】&level=premium
```

普通线路：sub.php 的网页链接，并附加参数 `key=【你的access key】`，例如
```
https://example.com/sub.php?key=【你的access key】
```

如果只需要 Vmess 而不需要其他链接，加上 `type=vmess` 参数：
```
https://example.com/sdfawfadcva/sub.php?key=【你的access key】&type=vmess
https://example.com/sdfawfadcva/sub.php??key=【你的access key】&level=premium&type=vmess
```
或者加上 `type=ss` 参数，只获取Shadowsocks链接：
```
https://example.com/sdfawfadcva/sub.php?key=【你的access key】&type=ss
https://example.com/sdfawfadcva/sub.php?key=【你的access key】&level=premium&type=ss
```
### 从旧版本升级

只需要备份四个txt文件，删除整个文件夹，重新填写一下php文件里的几个路径和url即可