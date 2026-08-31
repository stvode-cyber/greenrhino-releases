#!/usr/bin/env python3
"""把 windows/GreenRhino/wwwroot 压缩为 wwwroot.zip（exe 的嵌入资源）。

为什么需要这个脚本
------------------
GreenRhino.csproj 里写着 <EmbeddedResource Include="wwwroot.zip" />，
exe 运行时会解压它来托管 PWA。**但 MSBuild 不会自动生成这个 zip**：
build-windows.bat 是用 PowerShell 的 Compress-Archive 生成的。
一旦只跑了 copy-web.mjs 就直接 dotnet publish，打进去的就是**旧 zip**，
新写的 web 代码根本不会进 exe（症状：功能"明明写了却不生效"）。

正确的压缩包布局
----------------
必须是 wwwroot 的**内容**在 zip 根（index.html / sw.js / src/ ...），
不能带 wwwroot/ 前缀，否则运行时解压后路径对不上、页面打不开。

用法（任意目录均可，路径按脚本位置推导）：
    python clients/zip-wwwroot.py
"""

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # 项目根（clients 的上一级）

WWWROOT = os.path.join(ROOT, "clients", "windows", "GreenRhino", "wwwroot")
OUT = os.path.join(ROOT, "clients", "windows", "GreenRhino", "wwwroot.zip")

if not os.path.isdir(WWWROOT):
    sys.exit(f"错误：找不到 {WWWROOT}\n请先执行：node clients/copy-web.mjs")

# 注：ZipFile 以 'w' 模式打开会直接覆盖目标文件，无需先 os.remove
# （os.remove 会被安全删除钩子拦截，反而导致打包失败）。
count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _dirs, files in os.walk(WWWROOT):
        for name in files:
            full = os.path.join(dirpath, name)
            # 相对 wwwroot，保证压缩包根就是站点内容
            z.write(full, os.path.relpath(full, WWWROOT))
            count += 1

size = os.path.getsize(OUT)
print(f"已生成 {OUT}")
print(f"  {count} 个文件，{size} 字节")
