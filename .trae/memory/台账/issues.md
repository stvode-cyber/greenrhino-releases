# 🐛 踩坑记录（issues.md）

> 每条坑必须带归类标签（#label），已修的移归档区
> 最后更新：2026-10-12

---

## 🔥 活跃坑

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

### ISS-20261012-001: Android RhinoBridge.getLyric 前端调不通 🔥🔥🔥 P0
- 日期：2026-10-12
- 归类：`#android-webview #javascriptinterface #lyric-proxy`
- 关联文件：
  - `clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt` L476-570
  - `src/lyricFetch.js` L19-25
  - `src/ui/music.js` L181-187
  - `src/main.js` L741-744
- 现象：前端代码检测到 `window.RhinoBridge` 存在（requestAutoImport 已在用），但 `typeof RhinoBridge.getLyric !== 'function'`，导致歌词搜索走第二级 `/api/lyric` fetch（在 WebView file:// 下报 404）
- 已验证：
  - ✅ Kotlin RhinoBridge.getLyric 有 `@android.webkit.JavascriptInterface` 注解
  - ✅ addJavascriptInterface(RhinoBridge(), "RhinoBridge") 在 L287
  - ✅ APK 解压 classes3.dex 里有 `getLyric`, `fetchLrclib`, `fetchGecimi`, `RB1` 字符串
  - ✅ RhinoBridge 注册日志正常：`RhinoBridge registered OK (music)`
  - ✅ `fun getLyric` 和 `fun lookupMediaUri` 在同一个 inner class RhinoBridge 里
  - ❌ evaluateJavascript 同步检测 RhinoBridge 方法列表时崩溃（多次调用导致 app 秒退）
- 根因猜测（3 种可能）：
  1. Android WebView `for(var k in bridgeObj)` 只能枚举被 @JavascriptInterface 标注的方法，但 `typeof bridgeObj.getLyric` 应该能检测——除非方法没被正确暴露
  2. Kotlin 的 CompletableFuture + Thread + 网络请求 在 @JavascriptInterface 方法里可能触发 SecurityException 或 Threading 限制？但 lookupMediaUri 也做 contentResolver 查询（同步），没问题
  3. 前端检测到 RhinoBridge 但 `typeof RhinoBridge.getLyric` 是 undefined 或 string（WebView 把返回 String 的方法包装成什么了？）
- 预防规则：**改 Android @JavascriptInterface 方法后，必须在 evaluateJavascript 同步验证 `JSON.stringify({keys:Object.keys(RhinoBridge)})`**
- 修复方向：新 AI 接手第一件事——在 addJavascriptInterface 之后同步 evaluateJavascript 检测 RhinoBridge 实际暴露的方法列表

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
