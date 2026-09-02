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
- 用户本机回传 `%LOCALAPPDATA%\GreenRhino\greenrhino.log` 里「视频」相关行 → 区分 (a)/(b) 根因，E4 关单
- 若仍黑且日志显示 overlay 未提交但原生兜底未接管 → 评估独立视频 WebView2 表面（最后一招）
