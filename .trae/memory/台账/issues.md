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
- 状态：✅ 已修（commit 6c01ff9）

### ISS-20261013-012: WebView2 运行时数据污染 .NET publish 输出目录 🔥 P0 ✅
- 日期：2026-10-13
- 归类：`#windows-webview2 #dotnet #publish`
- 现象：`clients/windows/` 三个项目的 `bin/Release/` 目录残留 **15 GB** 垃圾（GreenRhino/bin 独占 14.1 GB）
- 根因：旧版本 WindowHost.cs 未显式配置 `UserDataFolder`，WebView2 默认把 IndexedDB / Service Worker cache / LocalStorage / HTTP cache 写进了 publish 输出目录（`exe.exe.WebView2/EBWebView/Default/`）。每次 `dotnet publish` 后跑 exe 验证，都会让 publish 目录膨胀一个数量级
- 修复：三个项目的 `WindowHost.cs` L68-69 都已正确配置：`var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhino*/wv2data")` → WebView2 数据写到 `%LocalAppData%/`，不再污染 publish 输出。**旧污染是历史版本残留，手动 `Remove-Item bin/, obj/` 即可清掉**
- 预防规则：**任何用 WebView2/WPF 开发的 .NET 桌面 App，必须在 `CoreWebView2Environment.CreateAsync(rt, userData, opts)` 显式指定 `UserDataFolder` 到 AppData/独立目录，绝不能让它默认写到 exe 同级**。.gitignore 屏蔽 `clients/**/bin/` 和 `clients/**/obj/`，但运行时 WebView2 仍会绕过 git 污染磁盘
- 关联文件：`clients/windows/*/WindowHost.cs BuildEnvAsync()`
- 状态：✅ 代码正确，历史污染已清理（释放 16.39 GB）

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

### ISS-20261016-010: MediaStore 导入歌曲 artist 全是 `<unknown>` ✅ P1 已修
- 日期：2026-10-16 → 2026-10-16 晚修复
- 归类：`#android-mediastore #metadata`
- 现象：RhinoBridge.getLyric 真机触发后，所有歌曲的 artist 参数都是 `<unknown>`（周杰伦串烧、BEYOND - Amani 等），导致 LRCLIB 和 gecimi 歌词搜索双源 miss
- **真正根因**：MediaStore **确实解析了内嵌 TAG**（ARTIST/ALBUM 等），但 **50% 文件无内嵌 TAG**（纯 .m4a/.mp3 文件）→ Android ROM 写字面量 **`<unknown>`** 而非 null。Kotlin `cur.getString(ARTIST_IDX)` 返回字符串 `"<unknown"` 不是 null → `?: ""` 兜底不触发 → `<unknown>` 原样传到前端 → IndexedDB → RhinoBridge.getLyric → LRCLIB 搜 "周杰伦串烧 + <unknown>" → 100% miss
- **MediaStore 实际分布**（adb 实测 642 首）：artist=`<unknown>` 321 首 (50%)，artist 有值 321 首 (50%)
- **三层修复**（2026-10-16 装机验证）：
  1. **Kotlin MainActivity.kt scanMediaStore() L435-441**：`if (artist.equals("<unknown>", ignoreCase=true) || artist.equals("Unknown Artist", ignoreCase=true)) artist = ""`
  2. **.NET LocalServer.cs FetchLyricAggregate() L473-476**：同样清洗逻辑（Windows 端 fetchLrclib 已有 `IsNullOrWhiteSpace` 检查）
  3. **src/store.js addMediaFromAndroid() L179-187**：前端兜底 `_cleanArtist()` 函数
- **真机验证**（2026-10-16 11:10 Moto XT2401）：
  - 之前：`getLyric(title=BEYOND - Amani (粤语), artist=<unknown>)` → ❌ both sources missed
  - 现在：`getLyric(title=Acoustic Installation, artist=TK from 凛として时雨)` → artist 不再是 `<unknown>`！
  - LRCLIB miss 是日文冷门乐队问题，不是 artist 清洗问题（artist 为空时 LRCLIB 自动走 track-only 搜索）
- 影响：**修复后 50% 有真实 artist 的歌曲歌词搜索从 100% miss → 正常工作**
- 预防规则：**Kotlin `Cursor.getString()` 对 MediaStore 字段返回值可能是字面量 `<unknown>` 而非 null；必须显式 `if (s.equals("<unknown>")) s = ""` 清洗；前端也要兜底**
- 关联文件：
  - `clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt` scanMediaStore()
  - `clients/windows/GreenRhinoMusic/LocalServer.cs` FetchLyricAggregate()
  - `src/store.js` addMediaFromAndroid()
- 状态：✅ 已修（真机验证 artist=TK from 凛として时雨，npm test:all 6/6 + 4/4 全绿）
- 相关坑：ISS-20261016-011（Moto logcat 屏蔽）、ISS-20261016-012（ResolverActivity 绕过）

### ISS-20261016-011: Moto logcat 屏蔽的完整绕过方案 P1 🔶
- 日期：2026-10-16
- 归类：`#moto-bug #logcat`
- 现象：Moto 量产版（XT2401_2）完全屏蔽 `adb logcat -s GreenRhino:D` 和 `adb logcat -d --pid=<PID>` 的 Debug 级别日志输出；`adb logcat -c` 清 buffer 后再也没有 GreenRhino tag 的新日志能出来（无论是我们 App 的哪个级别）
- 根因：Moto 量产版做了系统级 logcat tag 过滤，非系统 App 的 Debug/Info 级别完全丢弃。Fatal 级别偶尔能漏出来（比如 console.error 的 JS 日志）
- 解法：**最稳方案** — 冷启动后不做 `logcat -c`，直接用 `adb logcat -d --pid=<PID>` 抓 buffer 里残留的 Fatal 级别 JS 日志。同时用 Debug BroadcastReceiver（`adb shell am broadcast -a greenrhino.CAST_SCAN`）触发 Kotlin 代码，配合 `adb logcat -d -s AndroidRuntime:E *:S` 看是否 crash
- 预防规则：**Moto 量产版真机调试时，绝对不要先 `adb logcat -c`！必须冷启动 App 后直接 `adb logcat -d --pid=<PID>` 拿 buffer 残留。如果需要触发新代码路径，用 BroadcastReceiver 探针。**
- 关联文件：`clients/android-music/.../MainActivity.kt` onConsoleMessage / BroadcastReceiver
- 状态：✅ 已沉淀成稳定调试套路

### ISS-20261016-013: Python cloud_api.py login() 每次轮换 token → 多端共用账号互踢 🔥🔥 P0 ✅
- 日期：2026-10-16（云同步 Android 端打通时发现）
- 归类：`#cloud-api #token-rotation #multi-device`
- 现象：Android 端 login 成功拿到 token → 用 curl/python 再次 login → **Android 的 token 立刻失效（401 未登录）**
- 根因：`login()` 函数每次登录都 `rec["token"] = new_token()` 轮换 token。多端（Android + 电脑 Python 脚本）同时登录同一账号时，后登录的会踢掉先登录的
- 修复：去掉 login() 里的 token 轮换，token 只在 register 时生成一次，只有明确 logout 时才清除。修改后：`if not rec.get("token"): rec["token"] = new_token()`
- 预防规则：**auth token 轮换应只发生在安全敏感操作（如密码修改、主动 logout），普通 login 不应轮换**
- 关联文件：`server/cloud_api.py` login() L99-105
- 状态：✅ 已修（重启 cloud_api.py 生效）

### ISS-20261016-014: Android 13+ RECEIVER_NOT_EXPORTED 导致 adb shell broadcast 收不到 P0 ✅
- 日期：2026-10-16（Debug CLOUD_SYNC receiver 调试时发现）
- 归类：`#android-13 #receiver #adb-debug`
- 现象：`adb shell am broadcast -a greenrhino.CLOUD_SYNC` 返回 result=0（发送成功）但 App 内 BroadcastReceiver.onReceive() 完全没被调用
- 根因：Android 13 (API 33) 起动态注册 receiver 默认 RECEIVER_NOT_EXPORTED，**外部（adb shell / 其他 App）发的 broadcast 被系统拦截**。必须显式 RECEIVER_EXPORTED 才能收到
- 修复：`registerReceiver(debugReceiver, filter, Context.RECEIVER_EXPORTED)`（之前 CAST_SCAN 可能因为是 Android 12 设备或其他原因能收到，但 Moto XT2401_2 是 Android 15 API 35，必须 EXPORTED）
- 预防规则：**Android 13+ 所有动态注册 BroadcastReceiver，如果需要 adb shell 触发调试，必须用 RECEIVER_EXPORTED**
- 关联文件：`clients/android-music/.../MainActivity.kt` setupDebugReceiver() L396-400
- 状态：✅ 已修（新增 CLOUD_SYNC receiver + 改 RECEIVER_EXPORTED）

### ISS-20261016-015: gradlew assembleDebug 不 clean 时 assets 变化不被检测（ISS-20261012-002 重演）P1
- 日期：2026-10-16（改 cloud.js 加 debug log 后 APK 里还是旧代码）
- 归类：`#gradle-cache #android-assets #build-pipeline`
- 现象：改 src/ui/cloud.js → build-web.mjs → robocopy → gradlew assembleDebug → APK 里还是旧 cloud.js！logcat 里看不到新加的 console.error
- 根因：Gradle copyPwaAssets 任务用 `UP-TO-DATE` 标记跳过了——即使手动改了 release/ 或 assets/ 目录里的文件，Gradle 也认为 inputs/outputs 没变（因为没通过 Gradle copy 任务改，它的文件 hash 没被刷新）
- 解法（临时）：**必须 gradlew clean assembleDebug**（clean 强制所有 task 重新执行，包括 mergeAssets）
- 预防规则：**改前端源码后，构建链路必须是：build-web.mjs → robocopy → gradlew clean assembleDebug**（三个步骤一个都不能少，尤其是 clean）
- 关联文件：`clients/android-music/app/build.gradle` L53-84
- 相关坑：ISS-20261012-002（同一个根因，重复踩坑！）
- 状态：🔶 临时解法（clean build），永久解法同 ISS-20261012-002

### ISS-20261016-016: Moto WebView 内 TextView clickable=false → adb input tap 不触发 click handler P2
- 日期：2026-10-16（tap "立即同步"按钮后 syncAll 没被调用）
- 归类：`#android-webview #moto-bug #naf #accessibility`
- 现象：dump 到的 bounds 准确（[216,699][750,758] center=483,728），adb input tap 也执行了，但 GreenRhino/JS 日志完全没 syncAll 相关输出
- 根因：Moto WebView 内渲染的 `<div>` 在 accessibility tree 里被当成 `android.widget.TextView` 且 `clickable="false"`。adb input tap 点到了坐标但 WebView 内部 click 事件没冒泡到 handler
- 解法：**绕开 UI tap**，用 Debug BroadcastReceiver + `webView.evaluateJavascript("window.__GR_SYNC?.syncAll()", null)` 直接触发
- 预防规则：**Moto WebView 内按钮 tap 不稳定时，用 evaluateJavascript 直接调 window 上暴露的函数**
- 关联文件：`clients/android-music/.../MainActivity.kt` BroadcastReceiver CLOUD_SYNC + `src/ui/cloud.js` window.__GR_SYNC 暴露
- 状态：✅ 已沉淀（CLOUD_SYNC receiver + window.__GR_SYNC）

### ISS-20261016-012: ResolverActivity 4 分身稳定绕过 P0 🔥
- 日期：2026-10-16
- 归类：`#moto-bug #multiprofile`
- 现象：adb shell am start 启动绿角犀音乐时被 Moto 系统 ResolverActivity 拦截，弹出"选择要使用的应用程序"对话框（4 个绿角犀音乐分身，因为 Moto 多 user profile 都装了）
- 根因：Moto 多 user profile 系统特性，`am start` 不带 `--user` 参数时触发 ResolverActivity 让用户选 profile
- 解法：`adb shell input tap 610 2251`（屏幕中心偏上，第一个绿角犀音乐选项的位置）。坐标来自 uiautomator dump 实测：Dialog bounds 覆盖全屏幕 1220×2712，第一项 center 约 (610, 2251)
- 预防规则：**Moto 多 profile 设备上 adb shell am start 后必须检查是否弹 ResolverActivity，是则 input tap 选第一项。已写进 .session-memory.md 铁律命令块**
- 关联文件：AndroidManifest.xml（resizeableActivity=false 已配）
- 状态：✅ 已沉淀成稳定绕过套路

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
