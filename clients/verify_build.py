#!/usr/bin/env python3
"""校验新构建的 GreenRhino.exe 是否包含本轮功能标记。
用法：python clients/verify_build.py <path-to-exe>
"""
import sys, zipfile, io

EXE = sys.argv[1] if len(sys.argv) > 1 else r"C:\gr_build\publish\GreenRhino.exe"

def u16(s): return s.encode('utf-16-le')

checks_ascii = ["SetupTray", "OnClosing", "NotifyIcon"]            # C# 方法/类型名（#Strings, UTF-8）
checks_u16 = ["最小化到后台", "退出", "显示窗口"]                  # C# 字符串字面量（#US, UTF-16LE）

data = open(EXE, 'rb').read()
print(f"exe 大小: {len(data)} 字节")

ok = True
for c in checks_ascii:
    hit = c.encode('utf-8') in data
    print(f"  [asm] {c:12} {'PASS' if hit else 'FAIL'}")
    ok = ok and hit

for c in checks_u16:
    hit = u16(c) in data
    print(f"  [u16] {c:12} {'PASS' if hit else 'FAIL'}")
    ok = ok and hit

# 提取内嵌 wwwroot.zip：找 PK\x03\x04，向后有限窗口定位 EOCD(PK\x05\x06)
idx = data.find(b'PK\x03\x04')
print(f"  PK\\x03\\x04 偏移: {idx}")
if idx < 0:
    print("无法定位内嵌 zip"); sys.exit(1)
eocd = data.rfind(b'PK\x05\x06', idx, idx + 4_000_000)
if eocd < 0:
    print("无法定位 EOCD"); sys.exit(1)
zbuf = data[idx:eocd + 22]
with zipfile.ZipFile(io.BytesIO(zbuf)) as z:
    names = z.namelist()
    for need in ["src/id3.js", "src/metadata.js", "src/ui/music.js", "src/main.js"]:
        print(f"  [zip] {need:20} {'PASS' if need in names else 'FAIL'}")
        ok = ok and (need in names)
    # 在 web 源码里再确认关键逻辑
    for entry, pat in [("src/id3.js", b"parseID3"), ("src/id3.js", b"deUnsync"),
                        ("src/ui/music.js", b"track_name"), ("src/metadata.js", b"parseID3"),
                        ("src/main.js", b"Object.assign(it, upd)")]:
        if entry in names:
            txt = z.read(entry)
            hit = pat in txt
            print(f"  [src] {entry:18} ~ {pat.decode():18} {'PASS' if hit else 'FAIL'}")
            ok = ok and hit

print("\n结果:", "ALL PASS ✅" if ok else "有 FAIL ❌")
sys.exit(0 if ok else 2)
