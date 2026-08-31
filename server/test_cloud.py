#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""绿角犀云盘 MVP 后端全链路冒烟测试（零依赖，stdlib urllib）。
用法：python server/test_cloud.py   （需先启动 cloud_api.py 于 8787）
每次跑用唯一用户名，避免与历史残留 alice 冲突。"""
import json, urllib.request, urllib.error, os, time

BASE = os.environ.get("CLOUD_BASE", "http://127.0.0.1:8787")

def req(method, path, body=None, headers=None, raw=False):
    data = None
    h = dict(headers or {})
    if isinstance(body, dict):
        data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    elif isinstance(body, bytes):
        data = body
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r)
        if raw:
            return resp.status, resp.read()
        return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

ok = True
def check(step, cond, extra=""):
    global ok
    mark = "PASS" if cond else "FAIL"
    if not cond:
        ok = False
    print(f"[{mark}] {step}  {extra}")

# 唯一用户名，避免与历史残留冲突
uname = "gruser_%d" % int(time.time())
pw = "pw123456"

# register
s, tok = req("POST", "/api/register", {"username": uname, "password": pw})
check("register", s == 200 and isinstance(tok, dict) and tok.get("token"),
      f"status={s} quota={tok.get('quota') if isinstance(tok, dict) else tok}")
token = tok.get("token") if isinstance(tok, dict) else None
if not token:
    print("register 失败，终止"); raise SystemExit(1)
H = {"Authorization": "Bearer " + token}

# upload
boundary = "----grb" + os.urandom(8).hex()
content = b"hello greenrhino cloud 12345"
def mp(name, c, fname):
    return (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{fname}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + c + b'\r\n--' + boundary.encode() + b'--\r\n'
body = mp("file", content, "up.txt")
s, up = req("POST", "/api/files", body,
            {"Authorization": "Bearer " + token, "Content-Type": "multipart/form-data; boundary=" + boundary})
check("upload", s == 200 and isinstance(up, dict) and up.get("id"), f"status={s} {up}")
fid = up.get("id") if isinstance(up, dict) else None

# list
s, ls = req("GET", "/api/files", headers=H)
check("list", s == 200 and isinstance(ls, dict) and len(ls.get("files", [])) >= 1,
      f"status={s} count={len(ls.get('files', [])) if isinstance(ls, dict) else 0}")

# quota
s, q = req("GET", "/api/quota", headers=H)
check("quota=5GB", s == 200 and q.get("quota") == 5 * 1024 ** 3,
      f"status={s} quota={q.get('quota') if isinstance(q, dict) else q}")

# download
s, d = req("GET", "/api/files/" + fid, headers=H, raw=True)
check("download", s == 200 and d == content, f"status={s} match={d == content}")

# delete
s, de = req("DELETE", "/api/files/" + fid, headers=H)
check("delete", s == 200 and de.get("ok"), f"status={s} {de}")

# quota 回退
s, q2 = req("GET", "/api/quota", headers=H)
check("quota回退(used=0)", s == 200 and q2.get("used") == 0,
      f"status={s} used={q2.get('used') if isinstance(q2, dict) else q2}")

# bad login
s, bl = req("POST", "/api/login", {"username": uname, "password": "x"})
check("bad login 拦截", s == 400 and bl.get("error"), f"status={s} {bl}")

# 无 token 上传拦截
s, nt = req("POST", "/api/files", body, {"Content-Type": "multipart/form-data; boundary=" + boundary})
check("无token上传拦截", s == 401, f"status={s} {nt}")

print("\n==== 结果:", "全部通过 ✅" if ok else "存在失败 ❌", "====")
raise SystemExit(0 if ok else 1)
