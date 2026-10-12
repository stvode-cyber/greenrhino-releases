# 🐛 踩坑记录（issues.md）

> 每条坑必须带归类标签（#label），已修的移归档区
> 最后更新：2026-10-12

---

## 🔥 活跃坑

### ISS-20261012-008: com.sun.net.httpserver.HttpServer 在 Android 上不存在 P0 ✅
- 日期：2026-10-12
- 归类：`#android-api #api-mismatch`
- 现象：MediaHttpServer.kt 首次实现用 `HttpServer.create(InetSocketAddress, backlog)` 编译报 `Unresolved reference: sun`
- 根因：`com.sun.net.httpserver.HttpServer` 是 **Java SE API**（JDK 6+），Android 从未实现这个包。Android 只有 `android.net.Uri`、`java.net.ServerSocket`、`java.net.HttpURLConnection` 等标准库
- 修复：全重写为纯 `java.net.ServerSocket` + 手写 HTTP/1.1 解析（236 行零依赖）
- 预防规则：**Android 上凡是 `com.sun.` 开头的 Java SE API 一律不存在！不确定就先查 Android Developers 文档**
- 关联文件：`clients/android-music/.../MediaHttpServer.kt`
- 状态：✅ 已修（commit 519a7ee）

### ISS-20261012-009: Android 13+ 动态注册 BroadcastReceiver 崩溃 P1 ✅
- 日期：2026-10-12
- 归类：`#android-13 #receiver`
- 现象：`setupDebugReceiver()` 里 `registerReceiver(receiver, filter)` 直接崩溃 `SecurityException: One of RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED should be specified`
- 根因：Android 13 (API 33) 起动态注册 receiver 必须显式指定 flag，不指定默认拒绝
- 修复：`if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)`
- 预防规则：**Android 13+ 所有 `registerReceiver()` 必须加版本 guard + flag 参数；Manifest 静态注册不受影响**
- 关联文件：`clients/android-music/.../MainActivity.kt setupDebugReceiver()`
- 状态：✅ 已修（commit bb16d41）

### ISS-20261012-010: Moto 量产版 Log.d/Log.i 全被过滤 P2 ✅
- 日期：2026-10-12
- 归类：`#android-logcat #moto`
- 现象：App 内 `Log.d("GreenRhino", "...")` 和 `Log.i(...)` 完全看不到，但 `Log.e(...)` 也偶尔被过滤；只有系统 tag 可见
- 根因：Moto 量产版（XT2401）加了 App 日志过滤策略，非系统 tag 的 Debug/Info 级日志默认不输出
- 修复：改用 **BroadcastReceiver 触发 + netstat + curl 网络验证**——绕开日志层，直接验证 ServerSocket 监听和 HTTP 流是否通
- 预防规则：**Moto 量产版上调试 App，优先用 BroadcastReceiver / ContentObserver / LocalSocket 等绕过 logcat**
- 关联文件：`clients/android-music/.../MainActivity.kt setupDebugReceiver()`
- 状态：✅ 已修（commit bb16d41）

### ISS-20261012-011: Android SSDP 多播必须持 WifiManager.MulticastLock P1 ✅
- 日期：2026-10-12
- 归类：`#android-multicast #ssdp`
- 现象：DlnaCaster.discover() 发了 SSDP M-SEARCH 但永远收到 0 台设备
- 根因：Android 默认省电策略**丢弃所有 WiFi 多播包**，除非持 MulticastLock。M-SEARCH 发得出去（UDP send 不需要锁），但电视回复的 UDP 包被系统静默丢弃
- 修复：`wifi.createMulticastLock("GreenRhino-DLNA").apply { setReferenceCounted(false); acquire() }` 在 SSDP 扫描前获取，try/finally 释放。**Manifest 必须有 CHANGE_WIFI_MULTICAST_STATE 权限**
- 预防规则：**Android 上任何 UDP 多播（SSDP/mDNS/Chromecast discovery）必须先拿 MulticastLock，否则发了等于白发**
- 关联文件：`clients/android-music/.../DlnaCaster.kt discover()`
- 状态：✅ 已修（commit 6c01ff9，本地待 push）

### ISS-20261012-005: Windows git credential 配置混乱导致 push 失败 P1
- 日期：2026-10-12
- 归类：`#git-credential #windows`
- 现象：`git push origin main` 报 `Authentication failed`，但 Windows 凭据管理器里有 `stvode-cyber` 条目
- 根因：git config 里同时配了两条冲突的 credential helper——一条指向 `gh.exe auth git-credential`（gh 没登录等于死路），一条指向 `git-credential-manager.exe`（正确）
- 修复：`git config --global --unset credential.https://github.com.helper` 删掉死路那条，`git config --global credential.helper manager` 保留 git-credential-manager
- 预防规则：**换新机器 / 装新工具后，跑 `git config --list --show-origin | Select-String credential` 检查有没有冲突条目**
- 状态：✅ 已修
- 相关坑：—

### ISS-20261012-004: Kotlin DatagramSocket.soReuseAddress 属性名错误 P2
- 日期：2026-10-12
- 归类：`#kotlin #android-compile`
- 现象：`gradlew assembleDebug` 报 `Unresolved reference: soReuseAddress`
- 根因：Java 的 `socket.setReuseAddress(true)` 在 Kotlin 里对应属性是 `socket.reuseAddress = true`，不是 `socket.soReuseAddress`
- 修复：`udp.soReuseAddress = true` → `udp.reuseAddress = true`
- 预防规则：**Kotlin 调 Java socket 属性时先在 Android Studio 里看一下自动补全的名字**
- 状态：✅ 已修（commit 5072aad）
- 相关坑：—

### ISS-20261012-001: Android RhinoBridge.getLyric 前端调不通 🔥🔥🔥 P0 → ✅ 已修
- 日期：2026-10-12 → 2026-10-12 晚修复
- 归类：`#android-webview #javascriptinterface #lyric-proxy`
- 关联文件：
  - `clients/android-music/.../MainActivity.kt` L476-570（RhinoBridge.getLyric + fetchLrclib + fetchGecimi）
  - `src/lyricFetch.js` L19-25（前端 RhinoBridge 检测）
  - `src/ui/music.js` L181-187
- 现象：前端代码检测到 `window.RhinoBridge` 存在但 `typeof RhinoBridge.getLyric !== 'function'`
- **真正根因**：之前 AI 测试时 `adb uninstall + install` 清了 IndexedDB → 媒体库空 → 没歌可播 → **根本没触发 fetchOnlineLyric 链路**！不是 Bridge 有问题。**同时 Moto ResolverActivity 弹窗（profile 选择）挡着导致 App 没启动 → onPageFinished 没执行 → 探针没输出**，双重误判
- **实测验证**（2026-10-12 晚，commit 674546e）：
  - ✅ RhinoBridge 完整暴露 9 方法：castPause, castPlay, castScan, castStop, getLyric, lookupMediaUri, requestAutoImport, setPlaying, toggleFullscreen
  - ✅ JS eval `RhinoBridge.getLyric('晴天','周杰伦')` → **1088 chars LRC**（`[00:29.36] 故事的小黃花...`），耗时 1134ms
  - ✅ LRCLIB 网络请求在 Android WebView @JavascriptInterface 里完全正常（CompletableFuture + 8s 超时够用）
- 修复动作：保留简化版 onPageFinished 方法列表探针（单次 evaluateJavascript，不触发 ISS-004 秒退），去掉调试用的串行 getLyric 调用
- commit: 674546e
- 预防规则：
  - **Android 端新增 @JavascriptInterface 方法后**：uninstall+install 冷启动 → 看 logcat `🔧 RB PROBE` 确认方法在 rbKeys 里且 typeof=function
  - **Moto 测试必做**：先 `pm disable-user --user 0/900-903 com.greenrhino.music` 只留 904，避免 ResolverActivity 弹窗挡着
  - **uninstall 会清 IndexedDB**，重测前别依赖之前的媒体库数据
- 状态：✅ 已修
- 相关坑：ISS-20261012-004（evaluateJavascript 秒退）、ISS-20261012-002（file:// fetch 不支持）

### ISS-20261012-002: gradlew copyPwaAssets UP-TO-DATE 但 assets/pwa 是旧前端 🔥🔥 P0
- 日期：2026-10-12
- 归类：`#gradle-cache #android-assets #build-pipeline`
- 关联文件：`clients/android-music/app/build.gradle` L53-84
- 现象：改 src/lyricFetch.js 加 RhinoBridge 三级优先级 → build-web.mjs 生成 release/pwa-site-music → gradlew assembleDebug 显示 `copyPwaAssets UP-TO-DATE` → APK 里 /api/lyric fetch 错误（旧前端）
- 根因：Gradle copy 任务的 inputs/outputs 缓存机制。copyPwaAssets 配置了 `from("$rootDir/../../release/pwa-site-music")` 但没正确监听 release/ 目录变化，导致即使手动改了 release/ 里的文件，Gradle 也认为"没变化"跳过复制
- 解法（临时）：**手动 robocopy** — `robocopy release\pwa-site-music clients\android-music\app\src\main\assets\pwa /MIR /NFL /NDL /NJH /NJS /NP`
- 解法（永久）：改 build.gradle 的 copyPwaAssets 配置，用 `inputs.dir` 明确监听 `release/pwa-site-music/**` 所有文件变化
- 预防规则：**改前端后 → build-web.mjs → 手动 robocopy → gradlew clean assembleDebug**，三个步骤一个都不能少

### ISS-20261012-003: WebView onConsoleMessage priority 计算 bug 🔥 P1
- 日期：2026-10-12
- 归类：`#android-webview #debug #logcat`
- 关联文件：`clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt` L191-207
- 现象：console.log / console.error 的日志在 logcat 里不显示或级别不对
- 根因：
  ```kotlin
  val level = when (consoleMessage.messageLevel()) {
      ConsoleMessage.MessageLevel.ERROR -> "E"
      ...
  }
  Log.println(level[0].code, "GreenRhino/JS", msg)
  //              ^^^^^^^^^^^
  // 'D'.code = 68 ≠ Log.DEBUG = 3！
  // 'E'.code = 69 ≠ Log.ERROR = 6！
  ```
- 解法：用 `Log.d()` / `Log.e()` 直接调用，不要用 `Log.println(charCode)`
- 预防规则：**Android Log 调试只用 Log.d / Log.e / Log.w / Log.i，不要用 Log.println**

### ISS-20261012-004: 多次 evaluateJavascript 调用导致 app 秒退 🔥 P1
- 日期：2026-10-12
- 归类：`#android-webview #evaluateJavascript #app-crash`
- 关联文件：`clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt` onPageFinished
- 现象：onPageFinished 里连续 3-4 个 evaluateJavascript 调用 → APK 装机后启动秒退，没有任何 crash 日志（Process died）
- 根因猜测：多次 evaluateJavascript 同时调 → WebView 内部线程竞争 / OOM / evaluateJavascript callback 异常吞掉
- 解法：**onPageFinished 里最多 1 个 evaluateJavascript，调试代码写 src/ 里的 JS console.error**
- 预防规则：**WebView onPageFinished 里只写 1 个 evaluateJavascript，调试用前端 JS 的 console.error**

### ISS-20261012-005: Android WebView file:// 下 fetch('/api/lyric') 报 scheme not supported 🔥 P1
- 日期：2026-10-12（首次在旧版歌词自动搜索时暴露）
- 归类：`#android-webview #cors #fetch-api #lyric-proxy`
- 现象：`Fetch API cannot load file:///api/lyric?title=xxx. URL scheme "file" is not supported.`
- 根因：Android WebView loadUrl("file:///android_asset/index.html") 加载，前端 fetch('/api/lyric') 相对 URL 变成 `file:///api/lyric` → WebView 的 fetch 不支持 file:// scheme
- 解法：前端第一级检测 `window.RhinoBridge.getLyric` 原生桥（已写 ✅）；兜底直连 `https://lrclib.net/api/search`（跨域友好）
- 预防规则：**Android WebView 下所有 fetch('/xxx') 相对路径请求都会变成 file:// → 要么用 RhinoBridge 原生桥，要么用完整 HTTPS URL**

---

## 📦 归档区（已修）

### ISS-20261009-021: SAF drawer 分类过滤不彻底 ✅ P2 → 📦 归档
### ISS-20261009-020: addMediaFromAndroid 硬编码 VIDEO_EXT + 500MB ✅ P2 → 📦 归档
### ISS-20261009-019: buildMusicHome 函数缺失导致 music role init crash ✅ P2 → 📦 归档
### ISS-20261009-018: Music App MediaStore 扫描完全缺失 ✅ P2 → 📦 归档

---

## 🔶 问题群

### `#android-webview`（4 条活跃 + 1 条归档）🔥🔥🔥 高优先
ISS-001 / ISS-003 / ISS-004 / ISS-005 都是 Android WebView 相关，值得统一解决后写 Skill
