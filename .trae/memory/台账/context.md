# 🛩️ 绿角犀项目驾驶舱（context.md）

> **新 AI 接手 → 先读本文件头部 TL;DR（30 秒版），再看底部「最近 5 条动作」**
> 最后更新：2026-10-12（DLNA 投屏 content://→HTTP 代理 真机验证通过）

---

## 🎯 TL;DR（30 秒版 · 换电脑交接区）

| 项 | 值 |
|---|---|
| 当前版本 | **APP_VERSION = 'v16'**（scripts/build-web.mjs L10） |
| Git 状态 | ⚠️ main 分支 ahead 1（bb16d41 GitHub 断网未 push，本地安全） |
| 测试状态 | ✅ 单元 6/6 + E2E 4/4 = 10/10 全绿 |
| Android 真机 | ✅ moto XT2401_2, profile 904 专属（`pm disable-user --user 0/900-903`） |
| RhinoBridge | ✅ **9 方法**：toggleFullscreen / setPlaying / requestAutoImport / lookupMediaUri / getLyric / castScan / castPlay / castStop / castPause |
| 已定规则 | ~32 条（见 AGENTS.md + DEC-20261012-001/002 新增 MediaHttpServer + Debug Receiver） |
| 云同步后端 | ✅ server/cloud_api.py localhost:8787 |
| 🆕 DLNA 投屏 | ✅ **全链路真机验证通过**：content:// → MediaHttpServer → HTTP 代理 → curl 200 + Range 206 ✅ |

### 📱 Android 真机快速验证命令

```powershell
# 看 GreenRhino 所有日志（含所有 tag）
adb logcat -d | Select-String "greenrhino|GreenRhino" | Select-Object -Last 30

# 专门找 getLyric 调用
adb logcat -d -s GreenRhino:D GreenRhino:E 2>&1 | Select-String "getLyric|🎤|RhinoBridge"

# 看是否还有 /api/lyric fetch 报错（应该没有！）
adb logcat -d -s GreenRhino/JS:F 2>&1 | Select-String "/api/lyric"
```

### 构建链路（改前端后 Android APK 不会自动更新 assets！）

```powershell
# 1. 改 src/ 源码
# 2. build-web.mjs → 生成 release/pwa-site-music/
cd d:\源码存档\音乐影视播放器
node scripts/build-web.mjs

# 3. 手动 robocopy → Android assets 目录（不要等 gradle copyPwaAssets，有时 UP-TO-DATE 不复制！）
robocopy release\pwa-site-music clients\android-music\app\src\main\assets\pwa /MIR /NFL /NDL /NJH /NJS /NP

# 4. 强制 clean build（不要用 --rerun-tasks，直接 clean + assembleDebug）
cd clients\android-music
.\gradlew.bat clean assembleDebug

# 5. 卸载重装（覆盖旧 dex 缓存）
adb uninstall com.greenrhino.music
adb install app\build\outputs\apk\debug\app-debug.apk

# 6. 启动
adb logcat -c
adb shell am start -n com.greenrhino.music/.MainActivity
```

### ⚠️ 新 AI 必做 Checklist（3 分钟版）

```powershell
# 1) 确认版本号一致
node scripts/build-web.mjs

# 2) 跑测试验证没坏
npm run test:all    # 单元 6/6 + E2E 4/4

# 3) 起云同步后端（需要时）
cd server; python cloud_api.py

# 4) 起 Windows 绿角犀音乐（需要时）
Start-Process "d:\源码存档\音乐影视播放器\clients\windows\GreenRhinoMusic\publish\GreenRhinoMusic.exe"

# 5) 检查 Android 设备
adb devices -l

# 6) 看 Windows LocalServer 状态（嵌入 GreenRhinoMusic 的 8800 端口）
```

---

## 📋 项目总览

### 两个 App

| App | 主题色 | 包名 | winRole | SW Cache | Cloudflare |
|---|---|---|---|---|---|
| 🎵 音乐 | `#00D8A6` | `com.greenrhino.music` | `'music'` | `gr-music-v16` | greenrhino-music.pages.dev |
| 🎬 播放器 | `#FFB03A` | `com.greenrhino.player` | `'video'` | `gr-player-v16` | greenrhino-player.pages.dev |

### 技术栈

- **前端**: 原生 ES Module（零构建，无 framework），`src/` 直接浏览器加载
- **后端**: Node.js LocalServer（server/）— 含 `/api/sync` GET/POST + `/api/lyric` 代理
- **构建**: 仅 `scripts/build-web.mjs` + `scripts/build-assets.mjs`（自定义 Node 脚本）
- **PWA**: 手写 `sw.js`，Manifest v3
- **Android**: WebView 原生壳（Kotlin MainActivity.kt），两个独立 AndroidManifest
- **Windows**: .NET 8 WebView2 `clients/windows/GreenRhino{Music,Player}`（已 build publish）
- **部署**: Cloudflare Pages（wrangler）+ GitHub Actions（三套 workflow）

---

## 🔐 不可变约束（绝对不能改）

| # | 约束 | 验证方法 |
|---|---|---|
| 1 | version 一致：`scripts/build-web.mjs` APP_VERSION 是所有产物基线 | `node scripts/build-web.mjs` 后查 release/*/index.html |
| 2 | androidPackage 唯一 | music=com.greenrhino.music，player=com.greenrhino.player |
| 3 | siteUrl 唯一 | assetlinks.json target 必须匹配 Cloudflare Pages 域名 |
| 4 | manifest 主题色绑定 | 主题色 = App 主题色 |
| 5 | SW cache 桶隔离 | 占位符 `__SW_CACHE__` 禁止改成硬编码！build-web.mjs 用正则替换 |
| 6 | 源码零构建 | 不要引 bundler |
| 7 | Android profile 分身 | 默认全部禁用，只留 904：`pm disable-user --user 900/901/902/903/0 com.greenrhino.music` |
| 8 | IndexedDB 隔离 | music DB = `gr-music-v1`，player DB = `gr-player-v1`，**两 App 本地数据绝不合并**，只通过云同步打通 |

---

## 🎤 Android 本地歌词代理（已写代码但未验证成功）

### 架构

```
前端 fetchOnlineLyric(item)
  → 三级优先级：
    ① window.RhinoBridge.getLyric(title, artist)   ← Android 原生桥（🆕 刚加的）
    ② fetch('/api/lyric?title=...')                 ← Windows LocalServer 同源代理
    ③ fetch('https://lrclib.net/api/search?...')    ← 纯 PWA 兜底（跨域友好）
  → 命中后 parseLRC() + updateMedia(id, {lyric: lrc}) → IndexedDB 缓存

Kotlin RhinoBridge.getLyric(title, artist): String
  → 后台线程（CompletableFuture 8s 超时）
    ① fetchLrclib()  → https://lrclib.net/api/search  → syncedLyrics 或 plainLyrics
    ② fetchGecimi()  → http://gecimi.com/api/lyric/   → lrc URL → 下载 → UTF-8 优先 + GBK fallback
  → 返回 LRC 纯文本
```

### 改动文件（已完成）

| 文件 | 改动 |
|---|---|
| `clients/android-music/.../MainActivity.kt` | RhinoBridge 加 `getLyric(title, artist)` + `fetchLrclib()` + `fetchGecimi()` + `httpGetText()` + `httpGetJsonArray()` + `httpGetJsonObject()` |
| `src/lyricFetch.js` | fetchOnlineLyric 加 RhinoBridge 三级优先级（第一级） |
| `src/ui/music.js` | fetchOnlineLyric（手动搜歌词版）同样加 RhinoBridge 三级优先级 |
| `src/main.js` | playItem() 里后台调用 fetchOnlineLyric(item)（不等进全屏） |

### 已踩的坑

| # | 坑 | 根因 | 解法 |
|---|---|---|---|
| 1 | /api/lyric fetch 在 WebView 里报错 `file://` | Android WebView loadUrl("file:///android_asset/index.html")，相对 URL `/api/lyric` 变成 `file:///api/lyric`，WebView 不支持 | ✅ 前端第一级检测 RhinoBridge，有就跳过 fetch |
| 2 | gradlew assembleDebug 说 copyPwaAssets UP-TO-DATE 但 assets 里是旧代码 | Gradle 缓存机制——没检测到 src/ 改动（src 不在 Gradle 监听范围内！） | ✅ **手动 robocopy** release/pwa-site-music → assets/pwa；改前端后必须手动复制 |
| 3 | evaluateJavascript 回调里 Log.println 崩溃 | Log.println(priority, ...) 的 priority 是 char，不是 int！`'D'.code = 68`，但 Android Log 常量是 `Log.DEBUG = 3` → int 值错 | ✅ 用 `Log.d()` / `Log.e()` 直接调用 |
| 4 | onConsoleMessage 调试不可靠 | 同样 priority 计算 bug：`when (messageLevel) { DEBUG -> "D" }` 然后 `level[0].code` → 68，不是 3 | ✅ console.log 调试时要用 `console.error`（Fatal 级别）或直接用 Kotlin Log.e |
| 5 | RhinoBridge inner class 必须用 inner class | 匿名 object 的 @JavascriptInterface 在 targetSdk 34+ 某些设备不生效 | ✅ 代码已是 inner class |

### 🚨 待解问题

**为什么 RhinoBridge.getLyric 没被前端调用到？**

可能原因：
1. Android WebView 里 `for(var k in window.RhinoBridge)` 不能枚举 Java 桥对象的方法（只暴露 prototype 上的，不暴露 own properties）→ 但 `typeof RhinoBridge.getLyric` 应该能检测
2. WebView 版本太旧不支持 ES2020 可选链 `?.`（但 fetchOnlineLyric 里没用可选链，music.js 里也没用）
3. 前端检测时机不对——RhinoBridge 在 addJavascriptInterface 时还没创建好？
4. APK 里其实还是旧前端（robocopy 漏了或 Gradle 又覆盖回去）

**新 AI 要做的验证：**
```kotlin
// 在 addJavascriptInterface 之后立刻调用：
webView.evaluateJavascript(
    "(function(){console.error('🔧 RB exists:', !!window.RhinoBridge, 'getLyric:', typeof window.RhinoBridge?.getLyric);})()",
    null
)
// 或者直接同步检测：
val result = webView.evaluateJavascriptSync("JSON.stringify({exists:!!window.RhinoBridge, type:typeof window.RhinoBridge?.getLyric})")
Log.e("GreenRhino", "🔧 RB check: $result")
```

---

## 🎵 账号 + 云同步（已完成但没跟 Android 歌词代理一起测）

### 同步链路

```
server/cloud_api.py（Node.js，跑 8787）
  POST /api/register  → {username, password} → users.json[username] = {salt, hash, token, quota, used, data:{}, data_ts:0}
  POST /api/login     → 返回 token + quota + used
  GET  /api/sync      → {data: {...}, server_ts: 1728500000000}
  POST /api/sync      → {client_ts, data: {favorites, playlists, progress, settings, queue}} → last-writer-wins

前端 syncAll()（src/ui/cloud.js）
  syncPull() → GET /api/sync → merge 到 IndexedDB（逐条 last-writer-wins）
  syncExport() → 导出 media.favorites + playlists + progress + settings + queue 五张表
  syncPush() → POST /api/sync {client_ts, data}

Android Kotlin bridge cloudBase: http://192.168.1.132:8787（MainActivity.kt L108）
  前端 localStorage.__GR_CLOUD_BASE__ → URL ?cloud= → window.GR_CLOUD_BASE 注入
```

### 打通测试流程（等 RhinoBridge.getLyric 通了再一起测）

1. **电脑**：`cd server; python cloud_api.py` → 8787 端口
2. **手机 + 电脑同 WiFi**：手机连 WiFi 看 IP，电脑 IP = `ipconfig | findstr IPv4`
3. **Android 歌词代理通了后**：MainActivity.kt cloudBase 改成电脑 IP → assembleDebug → adb install
4. **Windows 绿角犀音乐** → 进「我的」→ 注册/登录 → 点同步 → 收藏/歌单/续播进度 → IndexedDB → POST 8787/api/sync
5. **Android 绿角犀音乐** → 进「我的」→ 登录同一账号 → 点同步 → GET 8787/api/sync → 看到 Windows 同步来的收藏/歌单/续播

---

## 📍 关键文件定位

| 想改什么 | 去哪找 | grep 关键词 |
|---|---|---|
| Android RhinoBridge | `clients/android-music/.../MainActivity.kt` L408-570 | `inner class RhinoBridge \| getLyric \| fetchLrclib \| fetchGecimi` |
| 前端歌词（自动搜） | `src/lyricFetch.js` | `fetchOnlineLyric \| RhinoBridge \| fetchLrclib` |
| 前端歌词（手动搜） | `src/ui/music.js` L168-212 | `fetchOnlineLyric \| RhinoBridge` |
| 播放时触发搜歌词 | `src/main.js` playItem() | `fetchOnlineLyric(item)` |
| 云同步后端 | `server/cloud_api.py` | `/api/sync \| sync_pull \| sync_push \| users.json` |
| 前端云同步 | `src/ui/cloud.js` | `syncAll \| syncExport \| syncImport \| SYNC_TABLES` |
| mineEl 账号入口 | `src/main.js` showMine() | `gr_cloud_session \| fmtQuota \| 🔄` |
| build-web 版本号 | `scripts/build-web.mjs` | `APP_VERSION = 'v16'` |

---

## 🚨 活跃坑（接手必读）

### ISS-20261012-001: Android RhinoBridge.getLyric 前端调不通 🔥🔥🔥 P0
- 根因：**未知**（Kotlin 代码编进去了，RhinoBridge 注册了，但前端检测不到 getLyric）
- 现象：`/api/lyric` fetch 报 `file://` 错误（应该被 RhinoBridge 检测跳过）
- 验证：APK 解压 classes3.dex 有 `getLyric \| fetchLrclib \| fetchGecimi \| RB1` 字符串 → Kotlin 代码在
- 预防：每次改 Android Kotlin 后 → clean → assembleDebug → uninstall → install（不要 -r 覆盖）
- **新 AI 第一件事：加 `Log.e("GreenRhino", "🔧 RB1: $result")` 同步检测，确认 window.RhinoBridge.getLyric 到底有没有**

### ISS-20261012-002: gradlew copyPwaAssets UP-TO-DATE 但 assets/pwa 是旧前端 🔥🔥 P0
- 根因：Gradle 缓存机制，没检测到 src/ 目录改动
- 现象：前端改了 RhinoBridge 三级优先级，APK 里还是旧代码
- 预防：**改前端后必须手动 robocopy release\pwa-site-music → clients\android-music\app\src\main\assets\pwa /MIR**，不要等 gradlew copyPwaAssets

### ISS-20261012-003: WebView onConsoleMessage + evaluateJavascript priority bug 🔥 P1
- 根因：`Log.println(level[0].code, tag, msg)` — `'D'.code = 68` ≠ `Log.DEBUG = 3`
- 现象：console.log 调试日志不显示或显示在错误级别
- 预防：调试时用 `console.error`（Fatal = Error level），或直接 Kotlin Log.d/Log.e

### ISS-20261009-021: SAF 抽屉分类过滤 ✅ 已修
### ISS-20261009-020: addMediaFromAndroid 硬编码 VIDEO_EXT ✅ 已修
### ISS-20261009-019: buildMusicHome 函数缺失 ✅ 已修
### ISS-20261009-018: Music App MediaStore 扫描缺失 ✅ 已修

---

## 📅 最近 5 条动作

| 时间 | 动作 | 状态 |
|---|---|---|
| 2026-10-13 下午 | 🧹 **失效文件清理**：删除 15 GB WebView2 污染 + .NET obj/bin，回收 16.4 GB | ✅ 项目从 17.5 GB → 1.3 GB |
| 2026-10-13 下午 | 📥 **Android 播放器安装**：android-player assembleDebug + adb install，两个 App 都在 Moto 上 | ✅ 前台跑着 |
| 2026-10-13 下午 | 📄 **DLNA 测试报告** 生成（release/DLNA投屏测试报告_20261013.md，17.9 KB） | ✅ |
| 2026-10-13 凌晨 | 🎥 **content://→HTTP 代理全链路真机验证**：MediaHttpServer 200 OK + Range 206 + MulticastLock 修复 | ✅ commit 83e5651 push 完成 |
| 2026-10-12 深夜 | 🛠️ **Debug BroadcastReceiver + profile 904 + ISS-008/009/010** | ✅ commit bb16d41 |

### 🔴 已知 TODO（接手可以接着做）

```
# SSDP castScan 真机发现 TV（MulticastLock 已加，但需要真实 DLNA 电视在同一局域网）
# 前端投屏按钮 UI（cast.js 已支持但播放器界面没加投屏入口）
# Windows 端 DLNA 代理（.NET WebView2 + LocalServer，还没做）
# onDestroy MediaHttpServer.stop() 已加
```

---

**好的，这个 context.md 就是项目驾驶舱。新 AI 读 TL;DR + ISS-001 问题描述 → 立刻知道要干嘛。**
