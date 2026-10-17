# 项目驾驶舱 · 绿角犀（GreenRhino）

> **TL;DR**：新 AI 进门 30 秒上手。每次任务前必读。
> 最后更新：2026-10-17

---

## 🎯 当前状态

| 项 | 值 |
|---|---|
| **版本** | `v16`（`scripts/build-web.mjs` 的 `APP_VERSION`） |
| **SW cache 桶** | `gr-music-v16` / `gr-player-v16` |
| **双站** | https://greenrhino-music.pages.dev / https://greenrhino-player.pages.dev |
| **包名** | `com.greenrhino.music` / `com.greenrhino.player` |
| **主题色** | 音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A` |
| **当前卡点** | Android 真机（Moto XT2401）回归测试未完成；`.github/workflows/` 不存在 |
| **未提交变更** | 待 `git status` 验证 |

---

## 🗺️ 项目地图（新 AI 秒定位）

```
d:\1号\项目部\🛠️工具\音乐影视播放器\
├── src/                  # 前端源码（零构建 ES Module，浏览器直接加载）
│   ├── main.js (48KB)    # 应用装配 + 路由 + 导入
│   ├── player.js (41KB)  # 播放引擎（音频/视频/转码触发）
│   ├── store.js (20KB)   # IndexedDB 数据层
│   ├── style.css (73KB)  # 全量样式
│   └── ui/               # 15 个组件（bottombar/library/music/videoPlayer/queue/settings...）
├── scripts/
│   └── build-web.mjs     # 拆双 App 站点（核心！改版本号在这里）
├── server/
│   └── cloud_api.py      # Python 云同步 + LRCLIB 代理（8787 端口）
├── clients/
│   ├── android-music/    # 原生 WebView 壳（Kotlin）
│   ├── android-player/   # 同上
│   ├── windows/          # .NET 8 WebView2 WPF 壳（含 ffmpeg.exe 98MB）
│   ├── huawei*/          # AppGallery 上架资料（暂搁置）
│   └── ios/              # Xcode 工程（未实机验证）
├── test/
│   ├── build-sw-cache.test.js  # 6 条单元断言（SW 占位符回归）
│   └── e2e/sw-cache.spec.js    # Playwright E2E
├── release/
│   ├── pwa-site-music/   # Cloudflare Pages 部署产物（gitignore）
│   └── pwa-site-player/  # 同上
├── docs/screenshots/     # 60+ 张历史截图（已归档至此）
└── .trae/memory/台账/    # ← 你在这里
```

---

## 🚨 当前阻塞

1. **Android 真机回归**：Moto XT2401 USB 断开未重连（2026-09-14 遗留）
2. **player APK 未构建**：music 已构建，player 镜像改造完成但未构建
3. **CI 缺失**：`.github/workflows/` 不存在，发布全靠手动

---

## 📏 已定规则（22 条铁律，违反 = P0 Bug）

详见 [AGENTS.md](../../../AGENTS.md)。关键提炼：

1. 版本号三落点一致：`build-web.mjs APP_VERSION` + `sw.js cache 桶名` + `installer 文件名`
2. SW 占位符 `'__SW_CACHE__'` 禁止硬编码版本号
3. 双 App cache 桶严格隔离（`gr-music-v16` ≠ `gr-player-v16`）
4. 主题色、包名、assetlinks.json 严格对应
5. `src/` 零构建，禁引入 bundler
6. Android MediaStore `<unknown>` 字面量三层清洗（Kotlin/.NET/前端）
7. Moto 真机调试：不要 `adb logcat -c`、装机必须 `install -r`、必须 `pm grant 4 权限`
8. 改 web 必须重跑 `clients/copy-web.mjs` 重压 `wwwroot.zip`（否则 exe 内嵌旧前端）
9. ffmpeg.exe（98MB）在 `clients/windows/GreenRhino/`，勿删勿提交

---

## 🕐 最近 5 条动作

| 时间 | 动作 | 文件 |
|---|---|---|
| 2026-10-17 | 建立台账系统 `.trae/memory/台账/`（本目录） | 6 个新文件 |
| 2026-10-17 | 归档根目录 64 张 PNG 到 `docs/screenshots/` | 见 daily.md |
| 2026-10-16 | 审计会话归档到 `.session-memory.md`（旧位置） | 旧路径 |
| 2026-10-14 | lyricFetch.js / store.js 歌词聚合相关改动 | src/ |
| 2026-10-13 | DLNA 投屏测试报告归档 | release/DLNA投屏测试报告_20261013.md |

---

## 🔗 关键工具全路径（都不在 PATH）

| 工具 | 路径 |
|---|---|
| dotnet 8 | `C:\greenrhino-tools\dotnet\dotnet.exe` |
| Inno Setup | `C:\greenrhino-tools\Inno Setup 6\ISCC.exe` |
| JDK 17 | `C:\greenrhino-tools\jdk17` |
| Android SDK | `C:\Users\Administrator\.android-sdk` |
| adb | `C:\Users\Administrator\.android-sdk\platform-tools\adb.exe` |
| aapt | `C:\Users\Administrator\.android-sdk\build-tools\34.0.0\aapt.exe` |

每次新终端构建 Android 前必须：
```powershell
$env:JAVA_HOME = "C:\greenrhino-tools\jdk17"
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
```

---

## 📚 台账导航

- [decisions.md](./decisions.md) — 关键决策记录
- [issues.md](./issues.md) — 踩坑记录（含归类标签）
- [index.md](./index.md) — 模块索引
- [daily.md](./daily.md) — 每日工作流水
- [archive/](./archive/) — 已归档（同标签 ≥3 条且预防规则已沉淀）
