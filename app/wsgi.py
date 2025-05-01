import os
import base64
import json
import re
import hashlib
from flask import Flask, request, abort, Response, render_template, redirect
from urllib.parse import unquote
from flask_httpauth import HTTPBasicAuth
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
auth = HTTPBasicAuth()

# 所有数据保存在一个 JSON 文件中
STORE_FILE = '/home/app/data/data.json'
STORE_USER = '/home/app/data/users.json'

# 分享链接地址配置（请根据实际情况修改）
SHAREURL = os.environ.get('SHAREURL', 'subscription/')

# 重定向地址，如为空则使用当前 URL
BASEURL = os.environ.get('BASEURL', '')
DEFAULT_PASSWORD = os.environ.get('DEFAULT_PASSWORD', 'password')

def load_users():
    # 从文件加载用户信息
    if os.path.exists(STORE_USER):
        with open(STORE_USER, 'r') as f:
            data = json.load(f)
            data.setdefault('user', generate_password_hash(DEFAULT_PASSWORD))
            return data
    else:
        data = {}
        # 创建默认用户
        data['user'] = generate_password_hash(DEFAULT_PASSWORD)
        return data

def save_users(users):
    # 保存用户信息到文件
    with open(STORE_USER, 'w') as f:
        json.dump(users, f, ensure_ascii=False, indent=4)

@auth.verify_password
def verify_password(username, password):
    users = load_users()
    if username in users and \
            check_password_hash(users.get(username), password):
        return username

def load_store():
    is_newuser = False
    if os.path.exists(STORE_FILE):
        with open(STORE_FILE, 'r') as f:
            try:
                data = json.load(f)
            except Exception:
                data = {}
    else:
        data = {}
        is_newuser = True
    # 确保默认项存在
    data.setdefault('accesskey', '')
    data.setdefault('key_md5', '')
    # 默认 groups 为列表，初始包含两个常用组（也可为空，由用户添加）
    if 'groups' not in data or not isinstance(data['groups'], list):
        data['groups'] = [
            {"name": "普通线路", "links": []},
            {"name": "Premium线路", "links": []}
        ]
    else:
        # 确保每个分组至少包含 name 和 links 属性
        for group in data['groups']:
            group.setdefault("name", "")
            group.setdefault("links", [])
    return data, is_newuser

def save_store(data):
    with open(STORE_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def process_share_link(url_list):
    """
    将每行链接（字典）解析为字典：
      - raw: 原始链接
      - type: "vmess"、"ss" 或 "other"
      - comment: 从链接中提取的备注信息
    """
    if not url_list:
        return []
    links = []
    for line in url_list:
        raw = line.get('raw', '')
        entry = {"raw": raw}
        if raw.startswith("vmess://"):
            entry["type"] = "vmess"
            try:
                b64data = raw[8:]  # 去掉 "vmess://"
                decoded = base64.b64decode(b64data).decode('utf-8')
                obj = json.loads(decoded)
                entry["comment"] = obj.get("ps", "")
            except Exception:
                entry["comment"] = "Invalid vmess"
        elif raw.startswith("ss://"):
            entry["type"] = "ss"
            parts = raw.rsplit('#', 1)
            entry["comment"] = unquote(parts[1]) if len(parts) == 2 else ""
        else:
            entry["type"] = "other"
            parts = raw.rsplit('#', 1)
            entry["comment"] = unquote(parts[1]) if len(parts) == 2 else ""
        links.append(entry)
    return links

def links_to_text(links):
    """将链接字典列表转换为多行文本（备用）"""
    return "\n".join(link["raw"] for link in links)

def remove_comment(content):
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r'<!--[\w\W\r\n]*?-->', '', content)

@app.route('/')
def home():
    return 'SYVS - Share Your V2ray Subscriptions'

@app.route('/editor/', methods=['GET', 'POST'])
@auth.login_required
def editor():
    data, is_newuser = load_store()
    baseurl = BASEURL if BASEURL else request.host_url.rstrip('/') + '/'

    if request.method == 'POST':
        # 修改密钥
        if 'accesskey' in request.form:
            accesskey = request.form.get('accesskey', '')
            dontsavekeytf = request.form.get('dontsavekeytf', '')
            data['accesskey'] = '' if dontsavekeytf == 'yes' else accesskey
            data['key_md5'] = hashlib.md5(accesskey.encode()).hexdigest() if accesskey else ''
            save_store(data)
            return data

        
        # 处理通过 JS POST 的数据
        if 'groups' in request.json:
            try:
                groups_data = request.json.get('groups', [])
                if isinstance(groups_data, list):
                    # 确保每个分组包含 name 和 links 属性
                    for group in groups_data:
                        group.setdefault("name", "")
                        group.setdefault("links", [])
                        group["links"] = process_share_link(group["links"])
                    data['groups'] = groups_data
                    save_store(data)
                    return {"status": "success", "message": "Groups updated successfully"}
                else:
                    return {"status": "error", "message": "Invalid groups format"}
            except Exception as e:
                print(f"Error processing groups: {e}")
                return {"status": "error", "message": "Failed to process groups"}


    # 为渲染模板，将 groups 传过去（groups 为一个字典）
    return render_template('editor.html',
                           baseurl=baseurl,
                           shareurl=SHAREURL,
                           accesskey=data.get('accesskey'),
                           is_newuser=is_newuser,
                           groups=data.get('groups'))

@app.route('/editor/api/', methods=['GET', 'POST'])
@auth.login_required
def api_editor():
    data, _ = load_store()
    baseurl = BASEURL if BASEURL else request.host_url.rstrip('/') + '/'
    return {
        'accesskey': data.get('accesskey'),
        'shareurl': SHAREURL,
        'baseurl': baseurl,
        'key_md5': data.get('key_md5'),
        'groups': data['groups']
    }


@app.route('/editor/user/', methods=['GET', 'POST'])
@auth.login_required
def api_user_pwd_reset():
    # 重置用户密码
    users = load_users()
    if request.method == 'POST':
        new_password = request.form.get('new_password', '')
        if new_password:
            users['user'] = generate_password_hash(new_password)
            save_users(users)
            return {"success": "Password updated successfully"}
        else:
            return {"error": "Invalid password format"}

    # 返回当前用户信息
    return {"message": "No action taken"}


@app.route('/' + SHAREURL)
def subscription():
    def remove_vmess(content):
        return re.sub(r'\nvmess://.*', '', content)

    def remove_ss(content):
        return re.sub(r'\nss://.*', '', content)

    data, _ = load_store()
    key_from_url = request.args.get('key', '')
    key_md5 = data.get('key_md5', '')
    if key_md5 and key_md5 != hashlib.md5(key_from_url.encode()).hexdigest():
        abort(403, "Invalid key")

    # 根据请求中指定的 group 参数获取对应的分组数据
    group_name = request.args.get('group', '')
    group = next((g for g in data['groups'] if g['name'] == group_name), None)

    if not group:
        links = []
    else:
        links = group['links']

    content = "\n".join(link["raw"] for link in links)
    content = remove_comment(content)

    type_param = request.args.get('type', '')
    if type_param == 'ss':
        content = remove_vmess(content)
    elif type_param == 'vmess':
        content = remove_ss(content)

    encoded_content = base64.b64encode(content.encode()).decode()
    return Response(encoded_content, mimetype='text/plain')

if __name__ == '__main__':
    app.run()