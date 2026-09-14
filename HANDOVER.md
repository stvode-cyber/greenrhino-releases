# 绿角犀 Android WebView 壳 — 交接文档

> **日期**：2026-09-14
> **状态**：🔶 music APK 构建通过，真机 USB 断开待回归测试；player APK 待构建
> **当前 HEAD**：`5db47b2` — `feat(android): TWA → 原生 WebView 壳（路线 A）`
> **未提交变更**：2 个文件（`MainActivity.kt` + `index.html`），见 §3.1

---

## 0. TL;DR（新 AI 3 分钟上手）

**我要做什么**：把绿角犀的 Android App 从 TWA（浏览器壳）改成**原生 WebView 壳**，PWA 资源打包进 APK 的 `assets/pwa/`，实现**完全离线 + 真 App 感（无 URL bar）**。

**已完成**：
- ✅ music App WebView 壳完整实现（Kotlin 210 行）
- ✅ APK 构建通过（3.44 MB，34 个 PWA 文件全进 `assets/pwa/`）
- ✅ **关键 Bug 已定位修复**：`index.html` 里 `/src/style.css` 这种绝对路径在 WebView `file:///android_asset/` 下解析错误 → 改成 `./src/style.css`（相对路径）
- ✅ console 桥接已加：JS `console.log` → logcat `GreenRhino/JS`

**当前卡点**：USB 数据线断开，还没在真机上完成「导入媒体 → 播放」的回归测试。

**接手后第一件事**：
1. 重连 USB（开发者选项 → USB 调试）
2. 跑命令（见 §5）
3. 真机上点「＋ 添加文件」→ 选 mp3 → 看能不能播
4. 抓 logcat 看有没有 `GreenRhino/JS` 或 `chromium ERROR`

---

## 1. 项目背景

### 1.1 为什么要换壳

| | 旧 TWA 壳 | 新 WebView 壳（本次） |
|---|---|---|
| 启动体验 | 弹华为浏览器 Custom Tab → 有 URL bar | 直接进全屏 App，无浏览器痕迹 |
| 离线能力 | 每次启动拉 Cloudflare Pages | PWA 资源在 APK 里，**完全离线** |
| 依赖 | 必须有 Chrome/华为浏览器 | 系统 WebView（Android 5+ 都有） |
| 包大小 | 0.24 MB（空壳） | 3.44 MB（含 Kotlin 运行时 + PWA 资源） |
| 原生能力 | 只能走 Custom Tab 限制 | WebView + `WebChromeClient`，可桥接文件选择/JS 对话框/全屏 |

### 1.2 项目全局约束（来自 AGENTS.md）

```
双 App 分离：
  🎵 music   → 包名 com.greenrhino.music   → 主题色 #00D8A6（青绿）
  🎬 player  → 包名 com.greenrhino.player  → 主题色 #FFB03A（琥珀）

版本号：scripts/build-web.mjs 的 APP_VERSION = 'v16'（所有产物基线）
PWA 构建：scripts/build-web.mjs 把 src/ 裁剪输出到 release/pwa-site-{music,player}/
源码零构建：src/ 是原生 ES Module，不要加 bundler
SW cache：sw.js 里 '__SW_CACHE__' 是占位符，由 build-web.mjs 替换
```

### 1.3 技术栈速查

```
前端 PWA：原生 ES Module（零构建）+ IndexedDB + HTML5 Audio
Android 壳：Kotlin 1.9.24 + WebView + Gradle 8.11.1 + compileSdk 34
构建：scripts/build-web.mjs → release/pwa-site-*/ → 拷进 Android assets/pwa/
```

---

## 2. 环境配置（接手先确认这些）

### 2.1 本机路径

| 项 | 路径 | 验证 |
|---|---|---|
| **JDK 17** | `C:\greenrhino-tools\jdk17` | ✅ 已存在 |
| **Android SDK** | `C:\Users\Administrator\.android-sdk` | ✅ 已存在 |
| **adb** | `C:\Users\Administrator\.android-sdk\platform-tools\adb.exe` | ✅ |
| **aapt** | `C:\Users\Administrator\.android-sdk\build-tools\34.0.0\aapt.exe` | ✅ |
| **Gradle Wrapper** | `clients/android-music\gradlew.bat` | ✅ |

### 2.2 必须设置的环境变量（构建前）

```powershell
$env:JAVA_HOME = "C:\greenrhino-tools\jdk17"
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
```

> ⚠️ **每次开新终端都要设**。Gradle 会读这两个变量，缺了构建直接挂。

### 2.3 Gradle Wrapper 版本

Gradle 8.11.1。之前手动下载放到了 `~/.gradle/wrapper/dists/`（因为在线下载超时）。

### 2.4 Android 签名（debug 用）

`clients/android-music/local.properties` 里写了：
```
storeFile=upload-keystore.jks
storePassword=android
keyAlias=upload
keyPassword=android
sdk.dir=C:\\Users\\Administrator\\.android-sdk
```

release 构建用同一个 keystore，在 `app/build.gradle` 的 `release signingConfig` 里。

---

## 3. 本次改动清单

### 3.1 Git 提交状态

```
HEAD: 5db47b2 feat(android): TWA → 原生 WebView 壳（路线 A）  ← 已推 GitHub
     │
     ├─ clients/android-music/ （完整改造，已构建）
     ├─ clients/android-player/ （镜像改造，待构建）
     └─ release/pwa-site-*/ → 拷入 assets/pwa/ 34 个文件
```

**未提交的改动（2 个文件）**：
```
 M clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt   ← console 桥接 + onReceivedError
 M clients/android-music/app/src/main/assets/pwa/index.html                        ← 绝对路径修复 + webkitdirectory 检测
```
→ **重连 USB 测试过没问题后记得 commit + push**。

### 3.2 改动文件详情（music App）

| 文件 | 变化 | 作用 |
|---|---|---|
| `clients/android-music/build.gradle` | 重写 | 加 Kotlin plugin 1.9.24 |
| `clients/android-music/app/build.gradle` | 重写 | 去掉 `browser-helper` 依赖 → 换成 Kotlin/WebView |
| `app/src/main/AndroidManifest.xml` | 重写 | 去掉 TWA `LauncherActivity` → 自定义 `.MainActivity` |
| `app/src/main/java/.../MainActivity.kt` | **新建 210 行** | WebView 壳核心，见 §4 |
| `app/src/main/assets/pwa/*` | **34 个文件** | 从 `release/pwa-site-music/` 拷来的 |
| `app/src/main/res/values/colors.xml` | 新建 | `colorPrimary=#00D8A6`, `splash_background=#0E1116` |
| `app/src/main/res/values/themes.xml` | 新建 | NoActionBar + 全屏沉浸式 |
| `app/src/main/res/drawable/splash_gradient.xml` | 新建 | 原生启动画面 |
| `app/src/main/res/values/strings.xml` | 修改 | `winRole='hub'` / 去掉 TWA `app_url` |

### 3.3 player App 镜像改动

`clients/android-player/` 做了完全一样的改造，只是：
- 包名 `com.greenrhino.player`
- 主题色 `#FFB03A`
- `assets/pwa/` 拷的是 `release/pwa-site-player/`

**⚠️ player 的 index.html 也有同样的 `/` 绝对路径问题，还没修！** 见 §7 Todo #2。

---

## 4. MainActivity.kt 架构（核心代码）

```kotlin
// 启动入口
onCreate → 沉浸式全屏 → FrameLayout 容器 → WebView → loadUrl("file:///android_asset/pwa/index.html")

// WebView 设置
settings {
    javaScriptEnabled = true
    domStorageEnabled = true
    allowFileAccess = true
    allowContentAccess = true
    allowFileAccessFromFileURLs = true      // ES Module 加载 file:// 资源必需
    allowUniversalAccessFromFileURLs = true  // fetch/XMLHttpRequest 在 file:// 下必需
    mediaPlaybackRequiresUserGesture = false // 自动播放音频
    userAgentString += " GreenRhino/16"      // 让 JS 知道跑在壳里
}

// 外部 URL 拦截 → 用系统浏览器打开
shouldOverrideUrlLoading → http/https 且非 android_asset → startActivity(ACTION_VIEW)

// 文件选择桥接
WebChromeClient.onShowFileChooser → params.createIntent() → startActivityForResult → onActivityResult → callback.onReceiveValue(result)

// Console 桥接（调试关键！）
onConsoleMessage → Log.println(tag="GreenRhino/JS")
onReceivedError → Log.e(tag="GreenRhino")

// 生命周期
onPause → webView.onPause + pauseTimers（后台停音）
onResume → webView.onResume + resumeTimers
onDestroy → webView.destroy()

// 返回键
onBackPressed → webView.canGoBack → goBack() → super（退出）
```

### 4.1 为什么用 startActivityForResult 而不是 ActivityResultLauncher

Kotlin 版本低（1.9.24 + AGP 8.x）。WebChromeClient.FileChooserParams 这个 API 跟旧签名最兼容。后续可以升到 ActivityResultLauncher。

---

## 5. 构建与安装命令（接手直接跑）

### 5.1 构建 debug APK

```powershell
# 每次开新终端先设环境变量
$env:JAVA_HOME = "C:\greenrhino-tools\jdk17"
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"

cd "d:\源码存档\音乐影视播放器\clients\android-music"
.\gradlew.bat assembleDebug --no-daemon
# 产物: app\build\outputs\apk\debug\app-debug.apk (3.44 MB)
```

### 5.2 安装到手机

```powershell
$adb = "C:\Users\Administrator\.android-sdk\platform-tools\adb.exe"
& $adb devices           # 确认设备在线
& $adb install -r -t "d:\源码存档\音乐影视播放器\clients\android-music\app\build\outputs\apk\debug\app-debug.apk"
```

### 5.3 构建 release APK

```powershell
.\gradlew.bat assembleRelease --no-daemon
# 产物: app\build\outputs\apk\release\app-release.apk
```

### 5.4 抓 logcat（调试神器）

```powershell
$adb = "C:\Users\Administrator\.android-sdk\platform-tools\adb.exe"
& $adb logcat -c                                                    # 清空旧日志
& $adb shell am start -n com.greenrhino.music/.MainActivity          # 启动
Start-Sleep -Seconds 6                                               # 等 JS 加载
& $adb logcat -d 2>&1 | Select-String "GreenRhino|chromium.*ERROR|TypeError|ReferenceError"
```

### 5.5 验证 APK 内容（aapt）

```powershell
$aapt = "C:\Users\Administrator\.android-sdk\build-tools\34.0.0\aapt.exe"
& $aapt list "path\to\apk" 2>&1 | Select-String "assets/pwa/"        # 确认 PWA 文件在
& $aapt dump xmltree "path\to\apk" AndroidManifest.xml              # 看 Activity/权限
```

---

## 6. 已发现的坑与解决

### 6.1 ❌ index.html 绝对路径 → 裸 HTML

**现象**：页面渲染出来是裸 HTML，无样式。

**根因**：`index.html` 里 `<link rel="stylesheet" href="/src/style.css" />` 用了 `/` 开头。
WebView 加载 `file:///android_asset/pwa/index.html` 时，`/src/style.css` 被解析成 **`file:///src/style.css`**（文件系统根），不是 `file:///android_asset/pwa/src/style.css`。**CSS 全 404 → 裸 HTML。**

**修复**：`release/pwa-site-music/index.html` → 正则替换 `(href|src)="/(?!/)` → `$1="./"`
```
href="/src/style.css"   →  href="./src/style.css"   ✅
src="/src/main.js"      →  src="./src/main.js"      ✅
```

**教训**：WebView 加载 file:// 资源时，**所有静态资源引用必须用相对路径（./ 或 ../），绝对路径 / 一律不要用**。

### 6.2 ❌ webkitdirectory 在 WebView 不支持

**现象**：侧边栏显示「📁 导入文件夹」按钮，点击无反应。

**根因**：WebView 不实现 `HTMLInputElement.webkitdirectory`。但因为没有 C# 壳注入 `winRole='music'`，main.js 默认走 `isHub=true`，hub 模式下会显示文件夹导入按钮。

**修复**：在 `index.html` 的 `<body>` 开头加 inline script 检测：
```javascript
var hasFolderInput = 'webkitdirectory' in HTMLInputElement.prototype;
if (!hasFolderInput) document.getElementById('import-folder').style.display = 'none';
```

### 6.3 ❌ Gradle 在线下载超时

**现象**：第一次跑 `gradlew.bat` 卡在下载 Gradle 8.11.1。

**解决**：手动下载 Gradle binary 放到 `~/.gradle/wrapper/dists/gradle-8.11.1-bin/` 下。

### 6.4 ❌ `colorSplashBg` / `ic_launcher_background` 资源缺失

**现象**：构建报找不到主题色资源。

**解决**：在 `colors.xml` 里定义了 `colorSplashBg = #0E1116`，并提供 `ic_launcher_background` 别名。

### 6.5 ❌ Kotlin `ConsoleMessage.MessageLevel.INFO` 不存在

**现象**：编译报 `Unresolved reference: INFO`。

**解决**：Android ConsoleMessage 只有 ERROR/WARNING/DEBUG 三个枚举。去掉 INFO，else 分支兜底。

---

## 7. Todo 清单（接手按顺序做）

### 🔴 P0 — 真机回归（当前卡点）

- [ ] **7.1 重连 USB**，确认手机开发者选项 → USB 调试开
- [ ] **7.2 跑构建 + 安装**（§5.1 + §5.2）
- [ ] **7.3 真机测试三件事**：
  - [ ] 导入：点「＋ 添加文件」→ 选 mp3 → 进度条走 → 导入完成
  - [ ] 播放：点歌曲 → 底部播放条出现 → 有声音
  - [ ] logcat：实时看 `GreenRhino/JS` 有没有报错
- [ ] **7.4 如果 logcat 有报错**，根据错误定位修 MainActivity 或 JS
- [ ] **7.5 commit push** 未提交的 2 个文件（见 §3.1）

### 🟡 P1 — player APK 构建（镜像工作量）

- [ ] **7.6 修 player 的 index.html**：把 `release/pwa-site-player/index.html` 里的 `/src/xxx` 改成 `./src/xxx`（4 处，同 music）
- [ ] **7.7 拷修过的 index.html + 重拷全部 PWA 资源**到 `clients/android-player/app/src/main/assets/pwa/`
- [ ] **7.8 MainActivity.kt 里的 console 桥接 + onReceivedError 同步到 player**
- [ ] **7.9 player APK 构建 + 安装 + 测试**
- [ ] **7.10 commit push player 完整改动**

### 🟢 P2 — 体验增强（路线 B，可缓）

- [ ] **7.11 原生媒体通知**（锁屏显示正在播放的歌曲）
  - 需要 `MediaSession` + `NotificationCompat.Builder` + `MediaStyle`
  - Android 13+ 需要 `POST_NOTIFICATIONS` 运行时权限
- [ ] **7.12 前台服务**（切到后台继续播放）
  - `startForeground()` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限
  - 需要 WakeLock 防止 CPU 休眠
- [ ] **7.13 桌面快捷方式**（Android Oreo +）
  - `ShortcutManager` + `ShortcutInfo.Builder`
- [ ] **7.14 原生 ExoPlayer 替换 WebView Audio**（大改动，可放到未来）
  - 目前 `player.js` 用的是 `new Audio()` + Web Audio API（AudioContext + createMediaElementSource）
  - 换成 ExoPlayer 可以支持更多格式（不依赖 WebView 解码能力）

### 🔵 P3 — 构建流水线自动化

- [ ] **7.15 修 Gradle copyPwaAssets 任务**：之前写的 `copyPwaAssets` 拷到 `merged_assets/debug/out/pwa/` 但被 mergeDebugAssets 覆盖了。现在是手动拷到 `src/main/assets/pwa/`。可以改成正确的 Gradle Copy task。
- [ ] **7.16 修 scripts/build-web.mjs**：让它同时输出一份 `assets/pwa-ready/index.html`（已把绝对路径改成相对路径），Android 构建时直接用。
- [ ] **7.17 加 GitHub Actions workflow**：新增 `build-android-music.yml` + `build-android-player.yml`，push tag 自动出 release APK。

---

## 8. 关键文件速查表

| 文件 | 说明 | 改哪里 |
|---|---|---|
| [MainActivity.kt](file:///d:/源码存档/音乐影视播放器/clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt) | WebView 壳，210 行 | 加 console 桥接/文件选择/全屏逻辑 |
| [AndroidManifest.xml](file:///d:/源码存档/音乐影视播放器/clients/android-music/app/src/main/AndroidManifest.xml) | 权限 + Activity 声明 | 不要加 TWA 组件 |
| [app/build.gradle](file:///d:/源码存档/音乐影视播放器/clients/android-music/app/build.gradle) | Kotlin + WebView 依赖 + 签名 | 不要加 browser-helper |
| [colors.xml](file:///d:/源码存档/音乐影视播放器/clients/android-music/app/src/main/res/values/colors.xml) | 主题色 | music=#00D8A6, player=#FFB03A |
| [assets/pwa/index.html](file:///d:/源码存档/音乐影视播放器/clients/android-music/app/src/main/assets/pwa/index.html) | PWA 入口，已改相对路径 | 新改动从 release/pwa-site-*/ 拷来后必须重改！ |
| [AGENTS.md](file:///d:/源码存档/音乐影视播放器/AGENTS.md) | 项目全局规则 | 版本号/包名/主题色约束都在这里 |
| [HANDOVER.md](file:///d:/源码存档/音乐影视播放器/HANDOVER.md) | 本文档 | 交接时更新 |

---

## 9. 常见问题速查

**Q: 构建报 `Unresolved reference` 某个 Android API？**
A: 看是编译 SDK 版本不匹配还是 Gradle 没同步。先 `gradlew.bat clean` 再重建。

**Q: APK 里 assets/pwa 文件缺失？**
A: 看 aapt 输出（§5.5）。如果缺失 → assets/pwa 目录没拷全。用 robocopy：
```powershell
robocopy "release\pwa-site-music" "clients\android-music\app\src\main\assets\pwa" /E
```

**Q: 真机打开 App 白屏？**
A: 1) 先抓 logcat 看有没有 `onReceivedError`；2) 大概率是 index.html 里还有 `/` 绝对路径没改；3) ES Module import 路径问题。

**Q: 文件选择器不弹？**
A: `onShowFileChooser` 里的 `startActivityForResult` 是否抛异常（catch 里有日志）。确认 `params.createIntent()` 不为 null。

**Q: 导入完媒体但点歌曲不播放？**
A: 1) logcat 看有没有 JS error；2) IndexedDB 里有没有 blob 存进去；3) `URL.createObjectURL(blob)` 返回了什么。

**Q: WebView 不支持哪些 HTML5 API？**
A: `webkitdirectory`（文件夹选择）❌、`navigator.share`（Web Share API）部分支持、Service Worker 在 `file://` 下不允许注册。其他基本都有。

---

## 10. git 快速命令

```powershell
# 查看这次改了什么
git diff HEAD --stat

# 提交 music 的未提交改动
git add clients/android-music/
git commit -m "fix(android): console 桥接 + index.html 相对路径 + webkitdirectory 检测"
git push origin main

# 查看 player 和 music 有没有差异
git diff clients/android-music/ clients/android-player/
```
