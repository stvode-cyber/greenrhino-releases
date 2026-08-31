import sys, zipfile, re, io

EXE = sys.argv[1] if len(sys.argv) > 1 else r"C:\gr_build\publish\GreenRhino.exe"
OUT = r"C:\Users\Administrator\gr_verify.json"

def u16(s): return s.encode('utf-16-le')

# C# 方法/类型名（#Strings, UTF-8）
checks_asm = ["SetupTray", "OnClosing", "NotifyIcon", "RegisterExternalFiles"]
# 字符串字面量 / web 标记（#US UTF-16）
checks_u16 = ["最小化到后台", "退出", "显示窗口", "audio/x-ape", "canPlayType"]

data = open(EXE, 'rb').read()
report = {"exe_size": len(data), "asm": {}, "u16": {}, "zip_files": [], "src": {}, "ok": True}

for c in checks_asm:
    hit = c.encode('utf-8') in data
    report["asm"][c] = hit
    report["ok"] = report["ok"] and hit

for c in checks_u16:
    hit = u16(c) in data
    report["u16"][c] = hit
    report["ok"] = report["ok"] and hit

idx = data.find(b'PK\x03\x04')
if idx < 0:
    report["ok"] = False
else:
    eocd = data.rfind(b'PK\x05\x06', idx, idx + 4_000_000)
    if eocd < 0:
        report["ok"] = False
    else:
        zbuf = data[idx:eocd + 22]
        with zipfile.ZipFile(io.BytesIO(zbuf)) as z:
            names = z.namelist()
            for need in ["src/id3.js", "src/metadata.js", "src/ui/music.js",
                         "src/main.js", "src/player.js", "src/store.js"]:
                present = need in names
                report["zip_files"].append((need, present))
                report["ok"] = report["ok"] and present
            src_patterns = [
                ("src/id3.js", b"parseID3"),
                ("src/id3.js", b"deUnsync"),
                ("src/ui/music.js", b"track_name"),
                ("src/metadata.js", b"parseID3"),
                ("src/main.js", b"Object.assign(it, upd)"),
                ("src/player.js", b"canPlayType"),
                ("src/player.js", b"guessMime"),
                ("src/store.js", b"ape"),
            ]
            for entry, pat in src_patterns:
                if entry in names:
                    hit = pat in z.read(entry)
                    report["src"][f"{entry}:{pat.decode('utf-8','ignore')}"] = hit
                    report["ok"] = report["ok"] and hit

with open(OUT, 'w', encoding='utf-8') as f:
    import json
    json.dump(report, f, ensure_ascii=False, indent=2)
print("OK" if report["ok"] else "FAIL", "->", OUT)
