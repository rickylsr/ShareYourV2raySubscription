from flask import Flask, request, abort, Response, render_template, redirect
import base64
import re
import os
import hashlib
import json
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
    data.setdefault('links', [])           # 普通线路链接列表（字典列表）
    data.setdefault('links_premium', [])   # Premium 线路链接列表（字典列表）
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
        entry = {}  # 创建新的字典
        entry["raw"] = raw
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
    """将链接字典列表转换为多行文本，便于在 textarea 中显示（备用）"""
    return "\n".join(link["raw"] for link in links)

def remove_comment(content):
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r'<!--[\w\W\r\n]*?-->', '', content)

@app.route('/', methods=['GET', 'POST'])
def editor():
    data = load_store()
    baseurl = BASEURL if BASEURL else request.url
    if request.method == 'POST':
        # 更新密钥
        if 'accesskey' in request.form:
            accesskey = request.form.get('accesskey', '')
            dontsavekeytf = request.form.get('dontsavekeytf', '')
            data['accesskey'] = '' if dontsavekeytf == 'yes' else accesskey
            data['key_md5'] = hashlib.md5(accesskey.encode()).hexdigest() if accesskey else ""
            save_store(data)
            return redirect(baseurl)
        # 保存普通线路链接（JSON数据）
        if 'links_json' in request.form:
            links_json = request.form.get('links_json', '')
            try:
                links_json_data = json.loads(links_json)
                data['links'] = process_share_link(links_json_data)
            except Exception as e:
                print(f"Error processing links_json: {e}")
                data['links'] = []
            save_store(data)
            return redirect(baseurl)
        # 保存 Premium 线路链接（JSON数据）
        if 'links_json_premium' in request.form:
            links_json_premium = request.form.get('links_json_premium', '')
            try:
                links_json_premium_data = json.loads(links_json_premium)
                data['links_premium'] = process_share_link(links_json_premium_data)
            except Exception as e:
                print(f"Error processing links_json_premium: {e}")
                data['links_premium'] = []
            save_store(data)
            return redirect(baseurl)
    
    sharelink = ""
    sharelink_premium = ""
    if data.get('accesskey'):
        sharelink = baseurl + SHAREURL + "?key=" + data.get('accesskey')
        sharelink_premium = baseurl + SHAREURL + "?key=" + data.get('accesskey') + "&level=premium"
    
    return render_template('editor.html',
                           accesskey=data.get('accesskey'),
                           sharelink=sharelink,
                           sharelink_premium=sharelink_premium,
                           links=data.get('links', []),
                           links_premium=data.get('links_premium', []))

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
    
    level = request.args.get('level', '')
    if level == 'premium':
        links = data.get('links_premium', [])
    else:
        links = data.get('links', [])
    
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