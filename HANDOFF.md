# 工作交接 · 绿角犀播放器（GreenRhino）

> 适用：接手本项目的同事 / 后续会话。目标是**一读就懂当前状态、能立刻构建、知道坑在哪**。
> 最后更新：2026-09-04。当前状态：**视频黑屏已关单（E4）**，内置 ffmpeg 转码链路稳定，音乐/视频已完全分成两个页面，最新 exe 已跑在用户桌面。
> 配套治理：`R0.md`（总入口/铁律）/ `FD.md`（功能记录，FD-V1~V10）/ `CHANGELOG.md`（版本史）/ `HELP.md`（用户说明）/ `overview.md`（功能总览）/ `UI-design.md`（界面设计）。

---

## 0. 一句话现状（2026-09-04）

纯前端 PWA 播放器，Windows 用 WebView2 + .NET 8 WPF 壳封装成自包含 exe。**音乐和视频已完全分成两个独立页面**，视频 HEVC/10bit 由内置 ffmpeg 自动转码 H.264 播放，双击 MP4 直达播放，音乐/视频播放模式各自独立（视频默认不循环）。最新构建 `GreenRhino.exe`（sw v9）已覆盖到 `C:\Users\Administrator\Desktop\GreenRhino\` 并在用户机器上运行验证。

## 1. 架构总览

```
┌─ PWA 内核（离线优先，零构建，纯 ES module）─────────────────────┐
│ index.html / sw.js(v9 网络优先) / manifest / src/*.js / icons  │
│   src/main.js      应用装配：路由、导入、外部打开(__hostOpen)   │
│   src/player.js   音频/视频播放引擎：播放模式、转码触发、看门狗  │
│   src/store.js     IndexedDB 数据层 + 设置(playModes 分媒体)    │
│   src/ui/library.js  mediaLibrary(app,type) 按类型拆分媒体库    │
│   src/ui/music.js   音乐页 = 音乐库 + 播放器(频谱/歌词/EQ/睡眠)  │
│   src/ui/video.js   视频页 = 视频库 + 播放器(字幕/音轨/章节/AB)  │
│   src/ui/*.js      bottombar/queue/favorites/playlists/recent/  │
│                     cloud/settings/gestures/spectrum/dom        │
└─────────────────────────────────────────────────────────────────┘
        │ 页面结构：音乐 | 视频 | 最近播放 | 歌单 | 收藏 | 我的云盘 | 设置
        │ （已无合并「媒体库」页；顶栏无模式开关，只走左侧导航）
┌─ Windows 原生壳（WebView2 + WPF，clients/windows/GreenRhino/）─┐
│ MainWindow.xaml.cs  GPU 参数(--disable-gpu)、原生兜底、转码、    │
│                     外部文件注册、单实例/托盘/投屏               │
│ LocalServer.cs     内嵌 HTTP 服务(/api/external /api/lyric       │
│                     云盘 /api/register|login|files /api/cast)   │
│ wwwroot.zip         内嵌资源：发布时从 wwwroot 重打包，运行时     │
│                     **每次启动强制重解压**到 %TEMP%\GreenRhino\  │
│ ffmpeg.exe          内嵌资源(98MB)：HEVC→H.264 转码，懒释放      │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 关键目录与文件

| 路径 | 作用 | git 状态 |
|------|------|---------|
| `src/`（根） | **web 源码（改这里）**：main/player/store/style/dom/ui/* | ✅ 进 git（sw.js 是根，v9） |
| `sw.js`（根） | Service Worker，**网络优先** + v9 缓存桶，activate 自动清旧桶 | ✅ 进 git |
| `index.html` | 页面骨架 + 侧边栏导航（音乐/视频/…） | ✅ 进 git |
| `clients/windows/GreenRhino/wwwroot/` | 构建时 copy-web 生成，**不进 git** | ❌ gitignore |
| `clients/windows/GreenRhino/wwwroot.zip` | **csproj 内嵌资源，改 web 后必须重生成**（否则内嵌旧代码！） | ❌ gitignore |
| `clients/windows/GreenRhino/ffmpeg.exe` | 内嵌转码器（98MB，**构建必需，勿删**；未忽略但未跟踪） | ⚠️ 未跟踪 |
| `clients/windows/GreenRhino/MainWindow.xaml.cs` | C# 宿主：`--disable-gpu`、转码(ffmpeg→H.264)、原生兜底、投屏、外部打开 | ✅ 进 git |
| `clients/windows/GreenRhino/LocalServer.cs` | 内嵌 HTTP 服务 + 外部文件 token + 歌词代理 + 云盘后端 | ✅ 进 git |
| `clients/windows/GreenRhino/publish/` | dotnet publish 输出（gitignore） | ❌ gitignore |
| `C:\Users\Administrator\Desktop\GreenRhino\GreenRhino.exe` | **用户实际运行的 exe（最新交付物）** | 交付物 |

## 3. 构建 / 发布流程（照做，坑全在下面）

前置：Node（有）+ .NET 8 SDK（**不在 PATH**，用全路径 `C:\Users\Administrator\.dotnet\dotnet.exe`）。

1. **改 web 源码**（`src/`、`index.html`、`sw.js`）后：
   - 必须**递增 `sw.js` 版本号**（`const CACHE = 'greenrhino-v9'` → v10…），否则旧 SW 缓存可能锁死旧前端（现为网络优先，兜底更稳但仍按惯例递增）。
   - 必须**重新生成 `wwwroot.zip`**：`node clients/copy-web.mjs`（同步 wwwroot）→ 压缩 wwwroot 内容为 zip。不重生成 = 内嵌旧代码（历史教训，翻车过）。
2. **构建**（可用 `clients/build-windows.bat`，或手动）：
   ```powershell
   node clients/copy-web.mjs
   # 删除旧 zip 后：Compress-Archive -Path clients/windows/GreenRhino/wwwroot/* -DestinationPath clients/windows/GreenRhino/wwwroot.zip -Force
   & "C:\Users\Administrator\.dotnet\dotnet.exe" publish clients/windows/GreenRhino/GreenRhino.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o clients/windows/GreenRhino/publish
   ```
   > 注：当前用 `PublishSingleFile=true` 单文件（旁附少量原生 dll），在用户机上工作正常。旧文档「文件夹版」（单文件没反应）是 9/2 沙箱环境的旧教训，**已被 9/3 之后单文件构建取代**，勿再改回文件夹版。
3. **部署**：把 `publish\GreenRhino.exe` 覆盖到 `C:\Users\Administrator\Desktop\GreenRhino\GreenRhino.exe`（桌面副本必须是**最新版**——双击 MP4 的文件关联指向它）。覆盖前若 exe 在运行需先结束进程。
4. **验证（trust-but-verify）**：启动 exe 后检查 `%TEMP%\GreenRhino\wwwroot\sw.js` 版本号与 `src/ui/music.js` 含 `music-page` 等新符号，确认内嵌的是新前端（每次启动强制重解压，天然防止旧代码）。

## 4. 关键机制（改代码前必读）

- **音乐/视频页面分离**：`showPage(name)` 驱动（`src/main.js`），`app.mode` 跟随页面（music/video）；媒体库用 `mediaLibrary(app, type)` 复用组件；搜索 `app.search` 同时刷两个库。**删除合并媒体库页后，任何地方不得再引用 `library` 页 / `app.filter` / `buildLibrary`**。
- **播放模式独立**：`player.playModes = { music:'loop', video:'order' }`（`store.js` 默认值 + `player.js`）。视频默认「顺序」不循环；音乐默认「列表循环」。底栏徽章跟页面显示。
- **HEVC 转码**：`player.js` 在 `loadedmetadata` 后检测 `videoWidth===0` → 立即 `_startTranscode`（本地文件给路径 / Blob 分片给 C#）→ C# 用 ffmpeg 转 H.264 → `transcodeReady` 回传 URL。同一文件转码去重（字典缓存）。转码产物在 `%TEMP%\GreenRhino\transcode`。
- **SW 网络优先**：静态资源 `fetch` 成功即缓存、失败回退缓存；导航失败回退 index.html。`/api/*` 永不缓存。activate 清旧桶。
- **双击文件直达播放**：`__hostOpen`（`main.js`）设 `window.__hostOpened` 跳过启动恢复，按文件类型切页并播。**文件关联 → 桌面最新 exe**，改动 exe 后桌面副本必须同步。
- **GPU**：WebView2 默认 `--disable-gpu` 纯软件渲染（Intel Arc + 向日葵虚拟显示器下防花屏）；`--gpu` 可切回硬件。

## 5. 构建环境 / 沙箱已知坑（省时间）

- `dotnet` 不在 PATH → 用 `C:\Users\Administrator\.dotnet\dotnet.exe` 全路径。
- `wwwroot.zip` 重生成是**最致命**的坑：改了 web 不重生成，打出来是旧前端。
- ffmpeg.exe（98MB）必须留在 `clients/windows/GreenRhino/`；**未 gitignore、未跟踪**——不要 `git add -A` 把它提交，也不要误删。
- 桌面副本与 publish 输出要同步，否则双击文件仍命中旧 exe。
- SW 版本号每次发布递增；`src/sw.js` 是孤儿文件（未注册、未引用），可删勿用。
- 诊断「花屏/黑屏」先抽源帧对比：若源帧就花、ffmpeg 零报错 → 是文件自带内容，不是渲染问题（test-hevc.mp4 曾含棋盘格/彩虹带误导排查）。
- 播放器窗口最小化到托盘后，SDK 截图会全黑且 UI 树只剩边框——先查 `IsWindowVisible/IsIconic` 再判断是否渲染黑屏。

## 6. 治理文档索引（保持链条）

- `R0.md`：总路由/铁律；报错 **E4（已关单）**；决策 **Dc-V1/V2**；动作记录 A（9/3、9/4 已补）。
- `FD.md`：`FD-V1~V7` 黑屏修复链 + `FD-V8` 内置转码 + `FD-V9` 双击播放 + `FD-V10` 音乐/视频分离。
- `CHANGELOG.md`：版本史（09-03/09-04 已补）。
- `overview.md` / `UI-design.md` / `HELP.md`：功能、界面、用户说明。

## 7. git 现状（重要）

**工作树有未提交变更**（截至 2026-09-04）：`src/main.js`、`src/player.js`、`src/store.js`、`src/ui/{library,music,video,bottombar,gestures}.js`、`src/style.css`、`index.html`、`sw.js`、`FD.md`、`clients/windows/GreenRhino/{csproj,LocalServer.cs,MainWindow.xaml.cs}` 已修改；`clients/windows/GreenRhino/ffmpeg.exe`（98MB，勿提交）、`src/sw.js`（孤儿，建议删）未跟踪。
**建议交接动作**：① 删除孤儿 `src/sw.js`；② 把 ffmpeg.exe 加入 `.gitignore`（避免误提交大二进制）；③ 将本次改版提交入库（含本 HANDOFF 与 CHANGELOG 更新）。

## 8. 下一步（待办）

1. 用户在本机点开新 exe，实际体验音乐页 / 视频页各自媒体库 + 播放，确认分离效果。
2. 若后续反馈视频问题：先取 `%LOCALAPPDATA%\GreenRhino\greenrhino.log` 的「视频」行判断根因（转码失败 / overlay / 其它）。
3. 桌面副本与文件关联保持最新 exe 同步（每次发布必做）。
