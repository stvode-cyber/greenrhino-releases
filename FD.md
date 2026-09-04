# 功能开发记录 FD（绿角犀播放器 · 视频黑屏修复链）

> 模板：说明（这功能干嘛的）· 注释（细节·坑）· 目标（↔VG / ↔G）· 关联（↔E / ↔Dc / ↔A）
> 总入口见 R0.md；本文件是 FD 详情，每条一记、可溯源。
> 根因报错统一为 **E4 视频黑屏有声音**，贯穿所有 FD。

---

## FD-V1 视频合成层重建（kick + C# 微抖）
- **说明**：切到视频页时强制重建 WebView2 视频合成层（web 侧 `kick`：`<video>` 先 `display:none` → 强制重排 → 恢复；C# 侧把窗口尺寸微抖 1px 触发宿主重绘），修"切到视频页就黑屏"。
- **注释**：早期 L2/L3 防线。`<video>` 在 `display:none` 子树创建是 WebView2 独立 overlay surface 不提交的温床，kick 提前到切视频页瞬间触发（非仅播放时）。**坑**：对真 overlay 根因只是概率性修复，对 HEVC 编码根因完全无效——属"先挡一层"。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4（视频黑屏有声音）· ↔A（f587dd1 合成层不重建；c3b8d74 kick 提前 + C# 微抖加固）

---

## FD-V2 WebView2 `--disable-gpu` 强制软件合成（主修复）
- **说明**：默认禁用 GPU 硬件合成，强制软件合成，视频帧落到页面软件合成层正常显示，修"黑屏有声音"。这是命中率最高的该症状修法。
- **注释**：`AdditionalBrowserArguments` 加 `--disable-gpu`（17a5e81）。**两个致命坑**：① 发布须用**文件夹版**（非单文件）——单文件在用户机"完全没反应"且抓不到报错，a15bd7a 已改文件夹版根治；② csproj 嵌的是**预构建 `wwwroot.zip`** 而非 wwwroot 文件夹，改 web 源码后必须重生成 zip，否则内嵌旧代码（portable4 踩过，内嵌 player.js 不含新逻辑）。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4 · ↔Dc-V1（采用软件合成为黑屏主修复）· ↔A（17a5e81；a15bd7a 文件夹版发布根治"没反应"）

---

## FD-V3 `--gpu` 命令行开关
- **说明**：默认 `--disable-gpu`，用户可加 `--gpu` / `--enable-gpu` 切回硬件渲染，免重建对比验证（同一 exe 两种模式实测）。
- **注释**：`Environment.GetCommandLineArgs()` 解析；日志写"GPU 模式"行供诊断。无副作用，纯切换 AdditionalBrowserArguments。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔Dc-V1（给用户免重建切换手段）· ↔A（3ab5dae）

---

## FD-V4 原生 MediaElement 兜底（本地文件）
- **说明**：看门狗 2.5s 无帧 → 发 `videoNoFrame` 消息 → C# 用 WPF 原生 `MediaElement` 直接播**本地文件**，绕开 WebView2 overlay surface，是"黑屏有声音"的终极修复。
- **注释**：前提是视频有 `localPath`（双击 / 外部打开场景，C# 端天然握有路径）。`LocalServer.cs` 的 `ExternalEntry.path` + `main.js` 把本地路径存到媒体项；C# `ShowNativeVideo`/`WireNativeVideo` + XAML `NativeVideo` 控制条（播放/进度/关闭）。**坑**：库内 / 拖入的 Blob 视频无 `localPath`，接不上 → FD-V5 补。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4 · ↔A（8f059e3）

---

## FD-V5 通用原生兜底（Blob 视频分片传 C#）
- **说明**：库内 / 拖入的 Blob 视频无本地路径时，web 把视频字节分片（256KB/片 base64）经 webview 消息传给 C#，C# 写入 `%LOCALAPPDATA%\GreenRhino\video-cache\<id>.<ext>`，收齐后 `ShowNativeVideo` 接管，覆盖所有视频源。
- **注释**：`videoBlobChunk` / `videoBlobEnd` 消息；C# `_videoBlobWriters` 字典 + `VideoCacheDir()`；`OnClosed` 释放未写完流。**坑**：HEVC 这类 C# 的 `MediaElement` 同样解不了，会白传 ~120s 再失败 → FD-V6 补根因分流。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4 · ↔A（f4c0245）

---

## FD-V6 黑屏根因分流 + 诊断闭环（含 HEVC 检测修正）
- **说明**：看门狗无帧先判根因——`v.error`（真解码失败，如 HEVC）→ 直接提示转码，**不走**原生兜底（救不了）；否则（overlay 未提交）→ 走 FD-V4/V5 原生兜底。两种场景都回传视频诊断（readyState / networkState / videoWidth / errorCode / canPlayType）写日志，下次反馈一锤定音。
- **注释**：**盲点修正**——HEVC 在 Chromium 常不报 `error`（仅视频无帧、videoWidth=0、音频 currentTime 持续推进），升级判定为 `v.error || (videoWidth===0 && audioPlaying)`（audioPlaying = currentTime>0.5），精准命中"有声音无画面"。仅改 web（`player.js`），不进 git（走 wwwroot.zip 内嵌），故无独立 commit，随 build9 重生成 zip + portable9 构建交付。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4 · ↔Dc-V2（根因分两类；解码失败直接提示转码不浪费兜底）· ↔A（d1188dc C# 分支；build9 重生成 wwwroot.zip）

---

## FD-V7 视频循环重播重复转码修复
- **说明**：转码后的 HEVC 视频播完循环时，`_playVideo` 会把 `src` 重置回不兼容的 HEVC blob，再次触发「解码失败→转码」，导致每轮循环卡顿重载（8s 短片日志表现为 `vw=0 → decodeFailed → transcode` 循环）。修复：`_playVideo` 在非切换（同一 item）且已有 `_transcodedUrl` 时直接复用转码 URL 从头播，循环零重载。
- **注释**：仅改 web（`src/player.js`），随 v5 重生成 wwwroot.zip 内嵌；`--disable-gpu` 下实测循环 2 轮全程 `vw=720 vh=1248`、无重复转码。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4 · ↔A（循环重播复用转码 URL；greenrhino-v5）

---

## FD-V8 内置 ffmpeg 转码（HEVC/10bit → H.264，E4 关单核心）
- **说明**：E4 实测根因为 (b) 编码不支持——真实 HEVC（微信视频）转码 H.264 后正常渲染（`vw=720 vh=1248`、FFmpeg 824 帧零错误）。内置 `ffmpeg.exe`（98MB 嵌入资源，首次转码懒释放到 `%TEMP%\GreenRhino\ffmpeg.exe`）把不兼容编码转成 H.264 后由 web `<video>` 播放。
- **注释**：本地文件直接给路径转码；库内 Blob 走 `videoBlobChunk/End`（带 `transcode:true`）分片传 C# 落盘再转码；完成回 `transcodeReady {url,path}`、失败回 `transcodeFailed` 并提示改用 H.264。转码去重：同一文件并发请求合并（字典缓存），避免每消息启一个 ffmpeg 进程 CPU 拉满。产物缓存 `%TEMP%\GreenRhino\transcode`。**坑**：`test-hevc.mp4` / `clean-test-hevc.mp4` 自带棋盘格/彩虹带/彩条，曾多次误导「花屏=渲染问题」——排查先抽源帧对比 + ffmpeg -v error 解码零报错即证明文件健康。
- **目标**：↔VG（离线看片）· ↔G（视频本地播放出画面）
- **关联**：↔E4（关单 2026-09-03）· ↔Dc-V2 · ↔A（csproj 嵌入 ffmpeg.exe；MainWindow.xaml.cs 转码分支）

---

## FD-V9 双击 MP4 直达播放（覆盖旧 exe + 跳过启动恢复）
- **说明**：修复「双击 MP4 没有直接播放」。根因：文件关联指向桌面 8/31 旧 exe（无双击播放逻辑）+ 前端启动恢复逻辑（`resumeEnabled`）抢先顶掉双击文件。
- **注释**：`__hostOpen`（`src/main.js`）设 `window.__hostOpened` 跳过启动恢复；按 `list[0].type` 立即切页；导入后 `localPath` 落媒体项、立即 `playList` 播放。桌面副本必须每次发布同步最新 exe（文件关联命中它）。`__hostOpen` 与 `getSettings` 恢复存在竞态，用 `__hostOpened` 标志位仲裁。
- **目标**：↔VG · ↔G（双击即播）
- **关联**：↔A（重建 exe 覆盖桌面副本；sw v6→v8）

---

## FD-V10 音乐 / 视频完全分离成两个页面
- **说明**：删除合并「媒体库」页与顶栏过滤标签，改为**音乐页 = 音乐库 + 播放器**、**视频页 = 视频库 + 播放器**两个独立页面，侧边栏直接切换。
- **注释**：`src/ui/library.js` 重构为复用组件 `mediaLibrary(app, type)`（按类型过滤 + 多选/查重/拖拽/空态）；`music.js`/`video.js` 各自嵌入一个 `mediaLibrary` 并拼上播放器区（双栏 grid：左库右播）；`main.js` 移除 `library` 页引用，`app.mode` 随页面切换，搜索同时刷两库，导入后跳到导入内容所属页，续播时切到所播媒体页。播放模式独立：`playModes={music:'loop',video:'order'}`。**坑**：任何地方不得再引用 `library` 页 / `app.filter` / `buildLibrary`；sw v8→v9。
- **目标**：↔VG · ↔G（音乐/视频界面彻底分开）
- **关联**：↔A（2026-09-04 界面重构）

---

## 根因认知固化（收口结论）
WebView2「黑屏有声音」只有两类根因，分别对症：
```
(a) overlay 未提交    视频已解码但没显示（videoWidth>0）
    → 修法：--disable-gpu 软件合成(FD-V2) + 原生 MediaElement 兜底(FD-V4/V5)
(b) 编码不支持         HEVC/10bit，视频轨根本没解出（videoWidth=0 且音频推进）
    → 修法：转码 H.264 MP4，或装 Microsoft Store「HEVC 视频扩展」
            （原生兜底无效：C# 的 MediaElement 同样解不了 HEVC，FD-V6 已分流避坑）
```

## 信任验证（trust-but-verify）
- dll 含 `ShowNativeVideo`/`VideoCacheDir`/`WireNativeVideo`/`videoDecodeError` + 日志串「视频解码失败(编码不支持」✓
- 内嵌 `wwwroot.zip` 的 `player.js` 含 `videoBlobChunk`/`videoBlobEnd`/`_startBlobFallback`/`videoDecodeError`/`_videoDiag`/`decodeFailed`/`audioPlaying`/`localPath` ✓
- 交付 `dist/` 两版：base 476 项 / 71MB、runtime 1256 项 / 471MB（2026-09-02 校验）
- 沙箱限制：无显示 + 孤儿单实例 Mutex 锁，无法像素级验证原生播放；MediaElement 为标准 WPF 能力，风险低

## 待办（关单前置）
- ✅ **E4 关单（2026-09-03 已收口）**：本机实测日志确认根因 (b) 编码不支持——真实 HEVC 视频（微信 a47c88b….mp4）转码 H.264 后正常渲染（`vw=720 vh=1248`、进度推进、循环零重载）；FFmpeg 完整解码 824 帧零错误证明文件本身健康。前期「花屏/色条」均为**测试文件自带内容**（test-hevc.mp4 含棋盘格/彩虹带；clean-test-hevc.mp4 为 SMPTE 彩条）误导，非渲染问题。
- 若后续某视频仍黑且日志显示 overlay 未提交但原生兜底未接管 → 评估独立视频 WebView2 表面（最后一招，暂不需）
