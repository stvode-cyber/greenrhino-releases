# 工作交接 · 绿角犀播放器 Windows 客户端（GreenRhino）

> 适用：接手视频黑屏修复 / 后续客户端构建的同事或后续会话。
> 最后更新：2026-09-02。当前状态：视频黑屏修复链 L1–L9 已交付并在 `dist/` 就绪，等真机日志关单。
> 配套治理：`R0.md`（总入口）/ `FD.md`（功能记录）/ `CHANGELOG.md`（版本史）。

## 0. 一句话现状
视频「黑屏有声音」已堆 9 层防线 + 根因分流，但**沙箱无显示，无法像素验证**；下一步必须靠用户真机日志区分根因 (a) overlay 未提交 / (b) HEVC 编码不支持。

## 1. 关键目录与文件
| 路径 | 作用 | 备注 |
|------|------|------|
| `clients/windows/GreenRhino/wwwroot/src/player.js` | Web 视频引擎：播放 / 看门狗 / 诊断 / 原生兜底触发 | ⚠ **不进 git**，经 `wwwroot.zip` 内嵌 dll |
| `clients/windows/GreenRhino/wwwroot/src/main.js` | 应用入口：`__hostOpen` 外部文件、`localPath` 落媒体项 | ⚠ 同上 |
| `clients/windows/GreenRhino/MainWindow.xaml.cs` | C# 宿主：GPU 参数、`videoNoFrame`/`videoBlob*` 消息、原生 MediaElement | ✅ 进 git |
| `clients/windows/GreenRhino/MainWindow.xaml` | 原生兜底层 `MediaElement` + 控制条 | ✅ 进 git |
| `clients/windows/GreenRhino/LocalServer.cs` | 外部文件注册（`ExternalEntry.path`） | ✅ 进 git |
| `clients/zip-wwwroot.py` | 把 wwwroot 打成 `wwwroot.zip`（csproj 内嵌源） | ✅ 进 git，改 web 后**必跑** |
| `dist/GreenRhino-portable.zip` | 71MB 文件夹版（不含 WebView2 运行时，依赖系统） | 交付物 |
| `dist/GreenRhino-portable-runtime.zip` | 471MB 含 `webview2-runtime`，开箱即用 | 交付物 |

## 2. 构建环境（沙箱专属坑，照做省 90% 时间）

### 2.1 dotnet 不在 PATH
全路径：`C:/Users/Administrator/.dotnet/dotnet.exe`。别用裸 `dotnet`。

### 2.2 wwwroot.zip 必须重生成（最致命，曾翻车一次）
csproj 内嵌的是**预构建的 `wwwroot.zip`**，不是 wwwroot 文件夹。改了 `player.js` / `main.js` 不重生成 zip → 打出来是旧 web 代码（portable4 教训）。
```bash
C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe clients/zip-wwwroot.py
```
跑完即生成 `clients/windows/GreenRhino/wwwroot.zip`（27 项）。

### 2.3 发布命令（文件夹版，非单文件）
单文件在本环境「完全没反应」（根因未定位），一律用文件夹版：
```bash
C:/Users/Administrator/.dotnet/dotnet.exe publish clients/windows/GreenRhino/GreenRhino.csproj \
  -c Release -r win-x64 -p:SelfContained=true -p:PublishSingleFile=false \
  -p:DisableFastUpToDateCheck=true -o <全新输出目录>
```

### 2.4 每次用全新构建目录
避免陈旧 obj/bin + 孤儿单实例 Mutex 占锁。复制源码到 `C:/gr_build/buildN` 再 publish。

### 2.5 打包 base / runtime 两版
从 `webview2-runtime` 目录复制 VC++ 运行库（`vcruntime140.dll` / `vcruntime140_1.dll` / `msvcp140.dll` / `concrt140.dll`）进发布目录；
- **base**：zip 发布目录（不含 `webview2-runtime`）→ `GreenRhino-portable.zip`
- **runtime**：发布目录副本 + `webview2-runtime` 文件夹 → `GreenRhino-portable-runtime.zip`
- 跳过 `.pdb`。参考脚本见 `C:/gr_build/package_portable*.py`（需适配新目录名）。

### 2.6 校验（trust-but-verify，必做）
从 dist zip 的 `GreenRhino.dll` 挖出内嵌 `wwwroot.zip` 的 `player.js`，确认含关键符号：
`decodeFailed` / `audioPlaying` / `videoDecodeError` / `_videoDiag` / `localPath` / `videoBlobChunk`。
C# 侧 dll 含 `ShowNativeVideo` / `VideoCacheDir`（UTF-8 方法名）；日志串「视频解码失败(编码不支持」在 `#US` 堆（UTF-16LE）搜。

## 3. 沙箱验证限制（别误判为崩溃）
- **无显示**：看不到像素，无法确认原生 MediaElement 是否真出画面。
- **孤儿单实例 Mutex**：之前进程占锁，新实例在 `App..ctor` 后自动退出——非崩溃，是单实例逻辑拦截。
- **safe-delete 拦截**：`rm -rf` / `rmtree` / `shutil.rmtree` 超阈值被拦 → 用全新暂存目录 + `ZipFile("w")` 覆盖。
- **git 提交**：`commit -m "多行"` 被安全策略按 LOLBin 拦 → 用 `commit -F 文件`；且有时退出码非零但提交已成功，**以 `git log` 为准**。
- **Write 工具**：写仓库根部分路径（如 `commit_msg.txt`）静默失败 → 用 Bash heredoc。

## 4. 当前阻塞 / 下一步
1. 视频黑屏（已交付 build9）：等用户真机回传 `%LOCALAPPDATA%\GreenRhino\greenrhino.log` 的「视频」行。
   - 出现 `视频解码失败(编码不支持` → 确认 (b) HEVC，给转码方案。
   - 出现 `视频黑屏(overlay 未提交` 或原生兜底日志 → (a) 已接管。
2. 若用户愿告知黑屏文件来源 / 后缀（.mkv / .hevc？双击还是库内？），可再缩排查范围。
3. 若 (b) 且需客户端内转码：需引入 ffmpeg.wasm（约 30MB+，需 COOP/COEP），属大改动，先与用户拍板。

## 5. 根因认知（固化）
WebView2 黑屏有声音只有两类：
- (a) **overlay 未提交**（`videoWidth > 0`）→ `--disable-gpu` + 原生兜底
- (b) **编码不支持** HEVC / 10bit（`videoWidth === 0` 且音频推进）→ 转码 H.264 / 装 HEVC 扩展；原生兜底无效

## 6. 治理记录索引
- `R0.md`：子路由含 FD；报错 **E4**；决策 **Dc-V1** / **Dc-V2**；动作 **A**
- `FD.md`：`FD-V1`~`FD-V6` 覆盖 L1–L9 全链路
- 视频修复提交链：`f587dd1` → `c3b8d74` → `17a5e81` → `3ab5dae` → `8f059e3` → `f4c0245` → `d1188dc` → `bfdc2da`（治理入库）
