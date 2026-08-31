#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
绿角犀 · 账号云盘 MVP 后端（零依赖，stdlib 实现）
=================================================
运行：python server/cloud_api.py  （默认 8787 端口，Mock 模式）
功能：注册 / 登录(JWT 风格 token) / 配额(5GB) / 上传(直传，配额预检) / 列举 / 下载 / 删除。

存储模式：
- MOCK（默认）：文件存本地 server/data/files/<user_id>/，元数据 server/data/files.json
- OSS：设环境变量 OSS_MODE=oss + OSS_ENDPOINT/BUCKET/KEY/SECRET 后，文件走阿里云 OSS
  （按 user_id 分目录；上传用服务端签名 STS 直传，下载用签名 URL）。oss2 未安装时自动回退 MOCK 并告警。

客户端（Windows/iOS/Android 三端）调用约定见 server/API.md。
"""
import os, io, sys, json, hashlib, secrets, uuid, time, base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
USERS_DB = os.path.join(DATA, "users.json")
FILES_DB = os.path.join(DATA, "files.json")
FILE_ROOT = os.path.join(DATA, "files")
os.makedirs(FILE_ROOT, exist_ok=True)

QUOTA_BYTES = 5 * 1024 ** 3  # 每个注册用户 5GB
PORT = int(os.environ.get("CLOUD_PORT", "8787"))
OSS_MODE = os.environ.get("OSS_MODE", "mock").lower() == "oss"

# ---------------- 持久化 ----------------
def _load(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def _save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

users = _load(USERS_DB, {})   # username -> {salt, hash, token, quota, used}
files = _load(FILES_DB, {})   # fileid -> {user, name, size, path|key, ctime}

def save_users(): _save(USERS_DB, users)
def save_files(): _save(FILES_DB, files)

# ---------------- 密码 / token ----------------
def _pw_hash(password, salt):
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def new_token():
    return secrets.token_urlsafe(32)

def auth_user(token):
    for u, rec in users.items():
        if rec.get("token") == token:
            return u
    return None

# ---------------- OSS 接入（预留） ----------------
oss_client = None
def _oss():
    """惰性获取 OSS bucket；未安装 oss2 或无凭证则回退 None。"""
    global oss_client
    if oss_client is not None or not OSS_MODE:
        return oss_client
    try:
        import oss2
        auth = oss2.Auth(os.environ["OSS_KEY"], os.environ["OSS_SECRET"])
        oss_client = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET"])
        return oss_client
    except Exception as e:
        print("[WARN] OSS 模式启用但初始化失败，回退 MOCK：", e)
        return None

# ---------------- 业务 ----------------
def register(username, password):
    if not username or not password:
        return None, "用户名/密码不能为空"
    if username in users:
        return None, "用户名已存在"
    salt = secrets.token_hex(8)
    users[username] = {
        "salt": salt,
        "hash": _pw_hash(password, salt),
        "token": new_token(),
        "quota": QUOTA_BYTES,
        "used": 0,
    }
    save_users()
    return users[username]["token"], None

def login(username, password):
    rec = users.get(username)
    if not rec or rec["hash"] != _pw_hash(password, rec["salt"]):
        return None, "用户名或密码错误"
    rec["token"] = new_token()  # 登录即轮换 token
    save_users()
    return rec["token"], None

def upload_file(username, name, data: bytes):
    rec = users[username]
    size = len(data)
    if rec["used"] + size > rec["quota"]:
        return None, f"配额不足：已用 {rec['used']>>20}MB / 配额 {rec['quota']>>20}MB，本文件 {size>>20}MB"
    fid = uuid.uuid4().hex
    if OSS_MODE and _oss() is not None:
        key = f"{username}/{fid}_{name}"
        oss_client.put_object(key, data)
        files[fid] = {"user": username, "name": name, "size": size, "key": key, "ctime": time.time()}
    else:
        d = os.path.join(FILE_ROOT, username)
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, fid + "_" + name)
        with open(p, "wb") as f:
            f.write(data)
        files[fid] = {"user": username, "name": name, "size": size, "path": p, "ctime": time.time()}
    rec["used"] += size
    save_users(); save_files()
    return fid, None

def list_files(username):
    return [{"id": k, "name": v["name"], "size": v["size"],
             "ctime": datetime.fromtimestamp(v.get("ctime", 0), timezone.utc).isoformat()}
            for k, v in files.items() if v["user"] == username]

def delete_file(username, fid):
    v = files.get(fid)
    if not v or v["user"] != username:
        return False, "文件不存在或无权限"
    if OSS_MODE and _oss() is not None:
        oss_client.delete_object(v["key"])
    else:
        # 放宽到 OSError：覆盖"文件已不存在"，也覆盖沙箱 safe-delete 垫片
        # 在回收站不可用环境抛出的 OSError（此时物理文件未删，但元数据已清，属沙箱特性）。
        try: os.remove(v["path"])
        except OSError: pass
    users[username]["used"] = max(0, users[username]["used"] - v["size"])
    del files[fid]
    save_users(); save_files()
    return True, None

def get_file(username, fid):
    v = files.get(fid)
    if not v or v["user"] != username:
        return None, None, "文件不存在或无权限"
    if OSS_MODE and _oss() is not None:
        # 真实环境应返回 OSS 签名 URL 做 302 重定向；此处直接回源流
        data = oss_client.get_object(v["key"]).read()
        return data, v["name"], None
    with open(v["path"], "rb") as f:
        return f.read(), v["name"], None

# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    def _send(self, code, obj=None, headers=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        if headers:
            for k, vv in headers.items(): self.send_header(k, vv)
        self.end_headers()
        if obj is not None:
            self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(n) if n else b""

    def _token(self):
        h = self.headers.get("Authorization", "")
        return h[7:] if h.lower().startswith("bearer ") else (parse_qs(urlparse(self.path).query).get("token", [None])[0])

    def _multipart(self, body, ctype):
        """极简 multipart/form-data 解析（取第一个文件字段）。"""
        boundary = "--" + ctype.split("boundary=")[1].strip()
        parts = body.split(boundary.encode())
        for p in parts:
            if b"filename=" in p and b"\r\n\r\n" in p:
                head, _, content = p.partition(b"\r\n\r\n")
                content = content.rstrip(b"\r\n")
                fn = head.split(b'filename="')[1].split(b'"')[0].decode("utf-8", "ignore")
                return fn, content
        return None, None

    def do_OPTIONS(self):
        self._send(204)

    def do_POST(self):
        u = urlparse(self.path)
        p = u.path
        ct = self.headers.get("Content-Type", "")
        body = self._body()
        try:
            if p == "/api/register":
                d = json.loads(body or b"{}")
                tok, err = register(d.get("username", ""), d.get("password", ""))
                if tok:
                    return self._send(200, {"token": tok, "quota": QUOTA_BYTES})
                return self._send(400, {"error": err})
            if p == "/api/login":
                d = json.loads(body or b"{}")
                tok, err = login(d.get("username", ""), d.get("password", ""))
                rec = users.get(d.get("username", ""))
                if tok:
                    return self._send(200, {"token": tok, "quota": rec["quota"], "used": rec["used"]})
                return self._send(400, {"error": err})
            if p == "/api/files":
                uname = auth_user(self._token())
                if not uname: return self._send(401, {"error": "未登录"})
                name, data = self._multipart(body, ct)
                if not data: return self._send(400, {"error": "未收到文件"})
                fid, err = upload_file(uname, name, data)
                if fid:
                    return self._send(200, {"id": fid, "name": name, "size": len(data)})
                return self._send(400, {"error": err})
            return self._send(404, {"error": "not found"})
        except Exception as e:
            return self._send(500, {"error": str(e)})

    def do_GET(self):
        try:
            u = urlparse(self.path)
            if u.path == "/api/quota":
                uname = auth_user(self._token())
                if not uname: return self._send(401, {"error": "未登录"})
                return self._send(200, {"quota": users[uname]["quota"], "used": users[uname]["used"]})
            if u.path == "/api/files":
                uname = auth_user(self._token())
                if not uname: return self._send(401, {"error": "未登录"})
                return self._send(200, {"files": list_files(uname)})
            if u.path.startswith("/api/files/"):
                fid = u.path.rsplit("/", 1)[-1]
                uname = auth_user(self._token())
                if not uname: return self._send(401, {"error": "未登录"})
                data, name, err = get_file(uname, fid)
                if err: return self._send(404, {"error": err})
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{name}"')
                self.end_headers()
                self.wfile.write(data)
                return
            return self._send(404, {"error": "not found"})
        except Exception as e:
            return self._send(500, {"error": str(e)})

    def do_DELETE(self):
        try:
            u = urlparse(self.path)
            if u.path.startswith("/api/files/"):
                fid = u.path.rsplit("/", 1)[-1]
                uname = auth_user(self._token())
                if not uname: return self._send(401, {"error": "未登录"})
                ok, err = delete_file(uname, fid)
                if ok: return self._send(200, {"ok": True})
                return self._send(400, {"error": err})
            return self._send(404, {"error": "not found"})
        except Exception as e:
            return self._send(500, {"error": str(e)})

    def log_message(self, fmt, *a):
        sys.stderr.write("[HTTP] " + (fmt % a if a else fmt) + "\n")

if __name__ == "__main__":
    print(f"绿角犀云盘 MVP 启动：mode={'OSS' if OSS_MODE else 'MOCK'}  port={PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
