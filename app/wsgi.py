import os
import base64
import json
import re
import hashlib
from flask import Flask, request, abort, Response, render_template, redirect
from urllib.parse import unquote

app = Flask(__name__)

# 所有数据保存在一个 JSON 文件中
STORE_FILE = '/home/app/data/data.json'

# 分享链接地址配置（请根据实际情况修改）
SHAREURL = 'subscription'

# 重定向地址，如为空则使用当前 URL
BASEURL = os.environ.get('BASEURL', '')

def load_store():
    if os.path.exists(STORE_FILE):
        with open(STORE_FILE, 'r') as f:
            try:
                data = json.load(f)
            except Exception:
                data = {}
    else:
        data = {}
    # 确保默认项存在
    data.setdefault('accesskey', '')
    data.setdefault('key_md5', '')
    # 默认 groups 为字典，初始包含两个常用组（也可为空，由用户添加）
    if 'groups' not in data or not isinstance(data['groups'], dict):
        data['groups'] = {"普通线路": [], "Premium 线路": []}
    else:
        data['groups'].setdefault('普通线路', [])
        data['groups'].setdefault('Premium 线路', [])
    return data

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

@app.route('/', methods=['GET', 'POST'])
def editor():
    data = load_store()
    baseurl = BASEURL if BASEURL else request.url

    if request.method == 'POST':
        # 修改密钥
        if 'accesskey' in request.form:
            accesskey = request.form.get('accesskey', '')
            dontsavekeytf = request.form.get('dontsavekeytf', '')
            data['accesskey'] = '' if dontsavekeytf == 'yes' else accesskey
            data['key_md5'] = hashlib.md5(accesskey.encode()).hexdigest() if accesskey else ""
            save_store(data)
            return redirect(baseurl)
        # 添加新 group
        if 'add_group' in request.form:
            new_group = request.form.get('new_group_name', '').strip()
            if new_group and new_group not in data['groups']:
                data['groups'][new_group] = [] 
                save_store(data)
            return redirect(baseurl)
        # 删除 group
        if 'delete_group' in request.form:
            group_to_delete = request.form.get('group_name', '').strip()
            if group_to_delete in data['groups']:
                del data['groups'][group_to_delete]
                save_store(data)
            return redirect(baseurl)
        # 保存链接到指定 group（普通线路）
        updated = False
        for key in request.form:
            if key.startswith("links_json_"):
                updated = True
                group = key[len("links_json_"):].strip()
                if group not in data['groups']:
                    data['groups'][group] = []
                links_json = request.form.get(key, '')
                try:
                    links_json_data = json.loads(links_json)
                    data['groups'][group] = process_share_link(links_json_data)
                except Exception as e:
                    print(f"Error processing {key}: {e}")
                    data['groups'][group] = []
        if updated:
            save_store(data)
            return redirect(baseurl)

    sharelink = ""
    sharelink_premium = ""
    if data.get('accesskey'):
        sharelink = baseurl + SHAREURL + "?key=" + data.get('accesskey')
        sharelink_premium = baseurl + SHAREURL + "?key=" + data.get('accesskey') + "&level=premium"

    # 为渲染模板，将 groups 传过去（groups 为一个字典）
    return render_template('editor.html',
                           accesskey=data.get('accesskey'),
                           sharelink=sharelink,
                           sharelink_premium=sharelink_premium,
                           groups=data['groups'])

@app.route('/subscription')
def subscription():
    def remove_vmess(content):
        return re.sub(r'\nvmess://.*', '', content)
    def remove_ss(content):
        return re.sub(r'\nss://.*', '', content)
    
    data = load_store()
    key_from_url = request.args.get('key', '')
    key_md5 = data.get('key_md5', '')
    if key_md5 and key_md5 != hashlib.md5(key_from_url.encode()).hexdigest():
        abort(403, "Invalid key")
    
    # 根据请求中指定的 group 参数获取对应的链接数据，默认为 "links"
    group = request.args.get('group', 'links')
    if group not in data['groups']:
        links = []
    else:
        links = data['groups'][group]
    
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