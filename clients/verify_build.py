import sys, zipfile, io, re

EXE = sys.argv[1] if len(sys.argv) > 1 else r"C:\gr_build\publish\GreenRhino.exe"

def u16(s): return s.encode('utf-16-le')

# C# 方法/类型名（#Strings, UTF-8 存储）
checks_asm = ["HandleLyric", "FetchLyricAggregate", "FetchTextAutoEnc", "PickLrc", "gecimi",
              "SetupTray", "OnClosing", "NotifyIcon", "canPlayType"]
# 字符串字面量 / web 标记（UTF-16LE 存储）
checks_u16 = ["歌词迷", "/api/lyric", "guessFromFilename"]

data = open(EXE, 'rb').read()
print(f"exe 大小: {len(data)} 字节")

ok = True
for c in checks_asm:
    hit = c.encode('utf-8') in data
    print(f"  [asm] {c:20} {'PASS' if hit else 'FAIL'}")
    ok = ok and hit
for c in checks_u16:
    hit = u16(c) in data
    print(f"  [u16] {c:18} {'PASS' if hit else 'FAIL'}")
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
    for need in ["src/id3.js", "src/metadata.js", "src/ui/music.js", "src/main.js", "src/player.js", "src/store.js"]:
        print(f"  [zip] {need:20} {'PASS' if need in names else 'FAIL'}")
        ok = ok and (need in names)
    for entry, pat in [
        ("src/metadata.js", b"guessFromFilename"),
        ("src/ui/music.js", b"/api/lyric"),
        ("src/ui/music.js", b"fetchLrclib"),
        ("src/ui/music.js", b"doSearch"),
        ("src/ui/music.js", b"toggleSearch"),
        ("src/ui/music.js", b"offsetSlider"),
        ("src/ui/music.js", b"fetchOnlineLyric(item"),
        ("src/main.js", b"guessFromFilename"),
        ("src/player.js", b"canPlayType"),
    ]:
        if entry in names:
            txt = z.read(entry)
            hit = pat in txt
            print(f"  [src] {entry:18} ~ {pat.decode('utf-8','replace'):16} {'PASS' if hit else 'FAIL'}")
            ok = ok and hit

print("\n结果:", "ALL PASS ✅" if ok else "有 FAIL ❌")
sys.exit(0 if ok else 2)
