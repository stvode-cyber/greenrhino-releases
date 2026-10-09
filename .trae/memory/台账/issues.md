# 🪤 踩坑台账 issues.md

> 记录所有踩过的坑：**问题 / 解决 / 根因 / 预防 / 严重度 / 归类标签 / 关联文件**
> 编号规则：`ISS-YYYYMMDD-NNN`，每天递增。同一坑解决 ≥3 次 且 已入 Skill → 移「📦 归档区」。
> **核心预防规则**会自动写成 `// TODO: [坑标签] 预防：xxx` 注释到关联文件里。
>
> 🆕 **成长型机制**：每条坑带归类标签，同标签 ≥2 条 → 自动归成「🔶 问题群」，≥3 次修复 → 自动升严重度加🔥。

---

## 🔴 活跃坑（按严重度排序）

### P0 — 影响发布/构建/核心功能

#### 🔶 问题群 #css-grid-overflow（🔥 已加级 P0，累计修复 3 次）
> 标签：`#css-grid-overflow #css-layout`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| 🔥 ISS-20261008-001 | 2026-10-08 | `#main` 缺 `overflow:hidden` → 子元素（vp-page width:100%）撑到容器 82 万亿像素宽 → 顶栏底栏被挤没 | `#main { overflow: hidden }` | CSS grid 中，子元素 `width:100%` 会基于「grid 列的 min-width:auto」计算，而不是容器实际宽度 | **grid 布局的中间容器必须加 overflow:hidden；不要依赖 grid-auto-flow 的隐式裁剪** | #css-grid-overflow | src/style.css `#main` |
| 🔥 ISS-20261008-002 | 2026-10-08 | `#app { grid-template-columns: 0 minmax(0, 1fr) }` — 1fr 不带 minmax → 列被内容撑宽 | 所有 1fr 列改写 `minmax(0, 1fr)` | grid 的 1fr 默认 min-width:auto，任何 min-width > 0 的子元素会把列撑到超过可用空间 | **所有 grid-template-columns 里的 1fr 必须写 minmax(0, 1fr)** | #css-grid-overflow | src/style.css `#app` grid |
| ISS-20261008-005 | 2026-10-08 | 视频 `<video>` 元素 `object-fit:contain`（缺省）→ 竖屏播放时黑边 | 沉浸式视频改用 `cover` | contain 保持比例但留黑边；cover 铺满但裁切边角 | **视频播放器提供切换按钮让用户选 contain（完整）/ cover（铺满）/ fill（拉伸）** | #css-video-fit | src/style.css `.vp-stage video` |

#### 🔶 问题群 #android-webview-cache（累计修复 2 次）
> 标签：`#android-webview-cache #android-webview`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| ISS-20261008-003 | 2026-10-08 | WebView 缓存旧 CSS/JS → APK 改了但设备上渲染不变 | ① `adb shell pm clear <pkg>` 清 app 数据 ② index.html 加 `?v=timestamp` cache-busting query string ③ install 后用户手动重新打开 App | WebView 有 disk cache（HTML + JS + CSS 全缓存），install -r 不覆盖已缓存文件，force-stop 也不清 disk cache | **Android WebView debug 迭代必须 cache-busting + pm clear，不要只 install -r + force-stop** | #android-webview-cache | index.html、MainActivity.kt |
| ISS-20261008-004 | 2026-10-08 | gradle `copyPwaAssets` 每次从 release/pwa-site-* 拷到 assets/pwa，覆盖之前手改的文件 | 改 assets 里的文件必须在 `gradlew assembleDebug` 之前改 release 目录，或改 gradle 任务顺序 | copyPwaAssets 是 gradle 的 Copy 任务，每次 build 都执行，覆盖 destDir 里的所有文件 | **改 Android assets/pwa 里的文件，优先改 src/ → build-web → 再 assemble，不要直接改 assets 目录** | #gradle-asset-copy | clients/android-player/app/build.gradle copyPwaAssets |

#### 🔶 问题群 #android-webview（🔥 已加级 P0，累计修复 4 次）
> 标签：`#android-webview #relative-path #feature-detection`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| 🔥 ISS-20260914-001 | 2026-09-14 | Android WebView 加载 index.html 时 `/src/style.css` 等 404 | 全部改为相对路径 `./src/style.css` | 浏览器 dev server 下绝对路径指向 dev server 根（正确），但 WebView 加载本地 assets 时绝对路径指向设备根（错误） | **所有资源引用用相对路径，绝对路径只在 HTML import 极少数场景用** | #relative-path #android-webview | release/pwa-site-*/index.html |
| ISS-20260913-001 | 2026-09-13 | SW cache 名硬编码 `greenrhino-v14` + build-web.mjs 隐式正则替换 → 版本号漂移 | sw.js 改为 `'__SW_CACHE__'` 占位符，build-web.mjs 用 `replace(/'__SW_CACHE__'/, cfg.cache)` 精确替换 | 隐式正则 `greenrhino-v\d+` 在版本号格式变化时可能漏掉，且源码里版本号不可见 | **SW cache 必须用显式占位符，禁止硬编码版本号，替换必须用精确正则** | #version-sync #sw-cache | sw.js、scripts/build-web.mjs |

#### 🔶 问题群 #twa-gms（累计修复 2 次）
> 标签：`#twa-gms #android-dependency`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| ISS-20260914-002 | 2026-09-14 | Android TWA 用了错误依赖 `androidx.browser.trusted.LauncherActivity` → 崩溃 | 改用 `com.google.androidbrowserhelper.trusted.LauncherActivity`（来自 `android-browser-helper` 库） | AndroidX browser 库不包含 LauncherActivity，它是独立的 android-browser-helper 组件 | **TWA 必须依赖 com.google.androidbrowserhelper:androidbrowserhelper，不要找错包** | #twa-gms #android-dependency | clients/android-music/app/build.gradle |
| ISS-20260914-003 | 2026-09-14 | TWA 依赖 Google Play Services 和 Chrome → 华为设备（无 GMS）无法全屏，显示浏览器地址栏 | 迁移到 WebView 原生壳 | 华为设备缺 GMS，TWA fallback 到 Custom Tab 会显示浏览器 UI | **TWA 方案必须验证无 GMS 设备的表现，或者直接用 WebView 壳** | #twa-gms #android-dependency | clients/android-music/ |
| ISS-20260914-004 | 2026-09-14 | assetlinks.json 里用占位符域名 | 改为真实域名 `greenrhino-music.pages.dev` 和 `greenrhino-player.pages.dev` | 复制模板时忘记替换 | **assetlinks.json 的 target 域名必须与 Cloudflare Pages 域名严格匹配** | #assetlinks #android | clients/android-*/app/src/main/assets/assetlinks.json |

### P1 — 影响体验/构建效率

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| ISS-20260914-005 | 2026-09-14 | `copy-web.mjs` 没重跑 → Windows EXE 内嵌资源与线上版本不一致 | 改完 PWA 后必须重跑 `scripts/copy-web.mjs` 再 `dotnet publish` | Windows 壳内嵌 PWA 资源是静态复制的，不是运行时加载 | **改了 PWA 任何文件后，Windows EXE 必须重新跑 copy-web + dotnet publish** | #pwa-rebuild #windows-exe | scripts/copy-web.mjs、clients/windows/ |
| ISS-20260914-006 | 2026-09-14 | `library.js` 的 `refresh()` 并发调用 → 媒体库重复条目 | 加锁防止并发 refresh | 快速连续刷新时代码没做防抖/去重 | **异步列表刷新必须加锁或防抖，同一时刻只允许一个 refresh 在跑** | #concurrent #library | src/library.js |
| ISS-20260914-007 | 2026-09-14 | Huawei AppGallery 截图用 390×800 → 比例不达标被拒 | 改用符合 0.75~1.77 比例的截图 | 截图前没查华为商店截图规范 | **每个应用商店的截图规范要先查再出图，不要凭感觉** | #appstore-screenshot | clients/huawei-music/listing/ |
| ISS-20260914-008 | 2026-09-14 | GitHub Actions 残留废弃 workflow（build-ios.yml）→ 仓库首页显示红叉 | 删除未使用的 workflow | 早期方案废弃了但忘记删 CI | **废弃方案的配套 CI/配置一并删除，别留尾巴** | #ci-cleanup | .github/workflows/ |
| ISS-20260914-009 | 2026-09-14 | koa-connect wrapper 导致 auth middleware 迁移时 ctx 泄漏 | 放弃 wrapper，原生 Koa 重写 | Express 和 Koa 的 ctx 模型不兼容，wrapper 无法完整桥接 | **跨框架迁移时不要用 wrapper 偷懒，原生重写更可靠** | #frame-dont-use-wrapper | server/auth.js |
| ISS-20261009-021 | 2026-10-09 | SAF 弹窗混所有文件类型（图片/视频/音频/文档 tab 全出），用户抱怨"导入打开混太多文件" | 绕开 `params.createIntent()`，完全手动构建 `Intent(ACTION_OPEN_DOCUMENT)`：`type="audio/*"`+15 种音频 MIME 白名单（音乐）/ `type="video/*"`+12 种视频 MIME 白名单（播放器），保留 `EXTRA_ALLOW_MULTIPLE`，加 acceptTypes 诊断日志 | WebView `FileChooserParams.createIntent()` 只按 accept 字符串粗略映射 type 且不传 EXTRA_MIME_TYPES，SAF 拿到 `*/*` 就展示全部文档 root | **SAF Intent 必须手动构建：type 锁定大分类 + EXTRA_MIME_TYPES 精确白名单；禁止直接用 params.createIntent() 默认产物。验证方法：开抽屉看分类列表是否只剩目标类型** | #saf-mime-filter #android-webview | clients/android-music/.../MainActivity.kt onShowFileChooser、clients/android-player/.../MainActivity.kt onShowFileChooser |

### P2 — 次要/偶发

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 |
|---|---|---|---|---|---|---|---|
| ISS-20260914-010 | 2026-09-14 | WebView 不支持 `webkitdirectory`（文件夹导入） | 在 index.html 中隐藏文件夹导入按钮 | webkitdirectory 是 Chrome/Edge 特性，Android System WebView 可能不完整支持 | **Feature detection 后隐藏不支持的按钮** | #feature-detection #android-webview | src/index.html |

---

## 📦 归档区

> 同一坑被引用 ≥3 次 且 预防规则已沉淀进 Skill → 移至此处，附归档原因

### 🔶 问题群 #gradle-directory（累计修复 2 次，待沉淀进 Skill 后全群归档）
> 标签：`#gradle-directory #path-charset #build-assets`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 | 归档原因 |
|---|---|---|---|---|---|---|---|---|
| ISS-20260914-011 | 2026-09-14 | Gradle build.gradle 含 UTF-8 BOM → `Unexpected character '?' @ line 1` | 用 PowerShell 去掉前 3 字节 BOM | 用 Windows 记事本保存时自动加 BOM，Groovy/Gradle 不识别 | **build.gradle 必须用 UTF-8 无 BOM 编码** | #gradle-directory #path-charset | clients/android-player/app/build.gradle | 单次修复 |
| ISS-20260916-001 | 2026-09-16 | **build.gradle assets 拷贝到错误目录**导致 APK 丢 src/ | copyPwaAssets destDir 从 `$buildDir/intermediates/merged_assets/...` → `file("$rootDir/app/src/main/assets/pwa")` | Gradle 的 compressDebugAssets 只处理 src/main/assets 里的顶层文件，中间产物目录的文件会被丢 | **copyPwaAssets 必须往 app/src/main/assets/pwa/（Android 标准目录）写，不能往 merged_assets 中间目录追加** | #gradle-directory #build-assets | clients/android-*/app/build.gradle | 单次修复 |

### 🔶 问题群 #relative-path（🔥 同群活跃坑 ISS-20260914-001 已 P0 加级，本群归档条目为补充记录）
> 标签：`#relative-path #android-webview`

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 | 归档原因 |
|---|---|---|---|---|---|---|---|---|
| 🔥 ISS-20260916-003 | 2026-09-16 | **index.html 绝对路径在 Android WebView 上白屏** | index.html 4 处绝对路径 → 相对路径；build-web.mjs L93 regex 同步改 | WebView 加载 file:///android_asset/pwa/index.html 时，绝对路径 /xxx 指向文件系统根目录（不存在）→ JS/CSS 不加载 → 白屏 | **index.html 资源引用必须全部用 ./ 相对路径** | #relative-path #android-webview | index.html、scripts/build-web.mjs L93 | 与 ISS-20260914-001 同群，已沉淀进预防规则，归档 |

### P1 — 影响体验/构建效率（续）

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 | 归档原因 |
|---|---|---|---|---|---|---|---|---|
| ISS-20260914-012 | 2026-09-14 | Android themes.xml 缺子主题 Theme.GreenRhino.Launcher → manifest 引用但资源不存在 | 复制 music 的完整 themes.xml（含基础主题 + Launcher 子主题两层） | 复制 music 的 themes.xml 到 player 时只保留了基础主题，忘了 Launcher 子主题 | **复制 Android 资源文件时要完整复制，不要手动裁剪** | #android-themes #resource-copy | clients/android-player/app/src/main/res/values/themes.xml | 单次修复 |
| ISS-20260914-013 | 2026-09-14 | publish.ps1 里 dotnet publish 指向错误 csproj | 改成各自的 csproj（GreenRhinoMusic.csproj / GreenRhinoPlayer.csproj） | 从 GreenRhino/publish.ps1 复制时忘了改 csproj 文件名 | **复制 publish.ps1 时必须改 csproj 路径** | #publish-script #csproj-path | clients/windows/GreenRhinoMusic/publish.ps1 | 单次修复 |
| ISS-20260914-014 | 2026-09-14 | dotnet 不在 PATH → PowerShell 直接跑找不到 | publish.ps1 开头加 PATH 兜底：检测 `C:\greenrhino-tools\dotnet\dotnet.exe` 存在时加入 env:Path | dotnet SDK 装在非系统 PATH 的自定义位置 | **工具链在非标准路径时，脚本里加 PATH 兜底** | #dotnet-path #publish-script | clients/windows/GreenRhinoMusic/publish.ps1 | 单次修复 |

### P2 — 次要/偶发（续）

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 | 归档原因 |
|---|---|---|---|---|---|---|---|---|
| ISS-20260914-015 | 2026-09-14 | Playwright install chromium 超时无进展 | 设置正确的 PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright | 国内网络直连 playwright 官方 CDN 极慢；只有 cdn.npmmirror.com/binaries/playwright 格式才生效 | **国内跑 Playwright 前设 PLAYWRIGHT_DOWNLOAD_HOST 环境变量** | #playwright-mirror #network-cn | test/smoke-playwright.mjs | 已沉淀进 user shared-issues |

### 其他归档

| 编号 | 日期 | 问题 | 解决方法 | 根因 | 预防规则 | 归类标签 | 关联文件 | 归档原因 |
|---|---|---|---|---|---|---|---|---|
| ISS-20260915-001 | 2026-09-15 | player 的 __winRole 内部值是 video 不是 player | 测试脚本期望值改成 video；源码保持不变 | 项目演进中 player 站点的功能从"播放器"变成侧重"视频"，内部 role 代号跟随功能 | **写条件分支时注意：if (winRole === 'video') 对应 🎬 player 站点** | #role-naming #video-vs-player | scripts/build-web.mjs | 单次修复 |
| ISS-20260915-002 | 2026-09-15 | player APK 首帧白屏（HarmonyOS WebView） | main.js L78-80 video role 也同步设 `data-theme='dark'` | music role 有 2 步（加 class + 同步设主题），video role 只做了第 1 步 | **所有 role 必须同步设 data-theme** | #android-theme #harmonyos-webview | src/main.js | 单次修复 |
| ISS-20260915-003 | 2026-09-15 | HarmonyOS pm install 卡住无输出 | 让用户手动点屏幕上的安装确认弹窗；或 push 到 /data/local/tmp/ 后用文件管理器装 | HarmonyOS 安全扫描机制；首次安装需要用户侧屏幕确认 | **HarmonyOS pm install 挂起 → push 到 /data/local/tmp/ 后让用户点屏幕弹窗** | #harmonyos-install #adb | 所有 adb install 命令 | 单次修复 |
| ISS-20260915-004 | 2026-09-15 | Windows 上 USB 已插但 adb devices 空 | `adb kill-server; adb start-server` 重启 daemon 后才认到设备 | ADB daemon 竞态，不重启不认新插的设备 | **USB 插上后 adb devices 空 → 先 kill/start server** | #adb-daemon #windows-usb | 所有 adb 命令 | 单次修复 |
| ISS-20260916-002 | 2026-09-16 | Motorola launcher 快捷方式残留成山 | install 前先 uninstall 干净；install 后 `pm clear launcher3` 清残留 | Android App Shortcuts 机制，uninstall 也不清理 | **install 前先 uninstall；install 后 pm clear com.motorola.launcher3** | #motorola-launcher #android-install | 所有 Android install 命令 | 单次修复 |

---

### 📈 成长型问题群汇总

| 问题群标签 | 活跃坑数 | 归档坑数 | 累计修复次数 | 当前严重度 | 状态 |
|---|---|---|---|---|---|
| `#android-webview` | 2 | 2 | 4 | 🔴 P0 🔥加级 | 活跃，待全群归档 |
| `#relative-path` | 1 | 1 | 3 | 🔴 P0 🔥加级 | 活跃，已沉淀进预防规则 |
| `#gradle-directory` | 0 | 2 | 2 | 🟠 P1 | 归档，待沉淀 Skill |
| `#twa-gms` | 2 | 0 | 2 | 🔴 P0 | 活跃 |
| `#playwright-mirror` | 0 | 1 | 1 | 🟡 P2 | 已提升到 user shared |
| `#harmonyos-install` | 0 | 1 | 1 | 🟠 P1 | 归档 |
