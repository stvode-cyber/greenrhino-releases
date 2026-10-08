# 📋 当前状态 context.md

> **🆕 换电脑交接 TL;DR（2026-10-08 更新）**
> 
> 这是项目最核心的文件。**新电脑上第一步先读这个，再跑 `npm run test:all` 验证环境。**
> 
> | 项 | 值 |
> |---|---|
> | 版本 | v16 |
> | 分支 | main |
> | 最近 commit | `d7fd251` chore: 清理调试垃圾文件 → `df1b9e3` feat: 视频播放全屏/沉浸式/控制条自动隐藏 |
> | 阻塞 | Android 真机视频播放完整验证（CSS grid 溢出坑已修、WebView cache-busting 已加，但真机确认反馈未回） |
> | 核心已知 bug 已修 | ISS-002/003/005（老）+ **ISS-20261008-001/002/003/004**（本轮新：CSS grid 溢出、WebView 缓存、gradle 覆盖） |
> | 铁律 | 资源相对路径、copyPwaAssets 去标准目录、改 PWA 重 build-web + build APK、**台账五步闭环必走**、CSS grid 1fr 必写 `minmax(0,1fr)` |
> | 测试命令 | `npm run test:all`（E2E 依赖 Playwright chromium，新环境可能要重装） |
> | 台账位置 | `.trae/memory/台账/`（context.md 本文件 + decisions.md + issues.md + index.md + daily.md + .session-memory.md） |
> 
> 一句话交接：**视频播放核心功能落地（全屏/沉浸式/控制条 auto-hide/返回按钮/顶栏导入按钮），4 个新坑已进台账，#css-grid-overflow 成问题群🔥。新 AI 先看「最近 5 条动作」区。**
>
> ---
> 
> 完整细则见下。别再问，先读这个。

---

## 🎯 项目一句话

**绿角犀** = 离线优先 PWA 媒体播放器，拆成两个独立 App：🎵 音乐（绿 `#00D8A6`）+ 🎬 播放器（琥珀 `#FFB03A`），共享源码，**三形态发布**：Cloudflare Pages PWA + Windows .NET 8 WebView2 EXE + Android Kotlin WebView 壳（TWA 已放弃，GMS 依赖不可控）。

---

## 📊 当前进度（2026-09-18 换电脑交接版）

> ⚠️ **4 个关键文件改了但还没 commit**：`index.html` / `scripts/build-web.mjs` / `src/main.js` / `clients/android-player/app/build.gradle`

- ✅ **版本**：APP_VERSION = `v16`（cache 桶 `gr-music-v16` / `gr-player-v16`）
- ✅ **PWA 双站点**：Cloudflare Pages v16 已部署（music 61127f3a / player 3eb271a6），线上验证通过
- ✅ **回归测试**：`npm run test:all` = 单元 6/6 + E2E 4/4 全绿（最近一次：2026-09-16 ISS-003 修复后跑过，全绿）
- ✅ **Playwright UX 冒烟**：music 12/13 + player 12/13
- ✅ **Windows 双 EXE**：`release/windows-music/` + `release/windows-player/` 已打包
- ✅ **双 APK 构建链路修完**：
  - ISS-002 修：`src/main.js` L78 video role 同步设 `data-theme='dark'`
  - ISS-005 修：`app/build.gradle` copyPwaAssets destDir 从 `$buildDir/intermediates/merged_assets/...` → `file("$rootDir/app/src/main/assets/pwa")`
  - ISS-003 修：**根目录 index.html 4 处绝对路径 `/src/xxx` → `./src/xxx`** + build-web.mjs L93 regex 同步改
  - 重跑 build-web.mjs → release/pwa-site-{music,player}/ 各 34 files
  - APK clean assembleDebug 通过，APK 内 assets/pwa 完整 34 files 验证
- ✅ **HUAWEI JAD-AL00 (P50 Pro) 真机**：music ✅ 全绿（启动 518ms / 深色主题 / WebView console 零错误）；player 当时首帧白屏（ISS-002），**现在三个问题都修完了（ISS-002/003/005），但还没在这台设备重测**
- ⚠️ **Motorola XT2401-2 (Android 15)**：APK 已装（3.44 MB × 2），但 launcher ResolverActivity 弹 4+ 个绿角犀选项挡路（ISS-006）；**核心修复（ISS-003/005）已进 APK 但还没在这台设备看到完整渲染**
- ⏳ **Android 增强**：原生媒体通知 + 前台服务后台播放（真机渲染验证全绿后再做）
- ⏳ **华为 AppGallery**：上架准备中

---

## 🏁 下一步（新电脑接手第一件事）

### 0. 新电脑环境准备（必须先做）
```powershell
# 1. 装 Node.js（18+）、Android Studio（SDK 34+）、ADB
# 2. 进项目目录：d:\源码存档\音乐影视播放器
# 3. 首次 install：
npm install
# 4. 国内 Playwright 镜像（必设）：
$env:PLAYWRIGHT_DOWNLOAD_HOST = "https://cdn.npmmirror.com/binaries/playwright"
npx playwright install chromium
# 5. 验证环境：
npm run test:all
# 预期：单元 6/6 + E2E 4/4 全绿
```

### 1. 确认未提交改动（4 个文件）
```powershell
git status --short
# 预期看到：
# M index.html                              ← ISS-003 相对路径
# M scripts/build-web.mjs                   ← ISS-003 regex 同步改
# M src/main.js                             ← ISS-002 video role 同步 data-theme
# M clients/android-player/app/build.gradle ← ISS-005 destDir 改标准目录
# （还有很多 untracked：release/windows-*/、test/smoke-*.mjs、HANDOVER-TEST-GUIDE.md、.trae/memory/ 等）
```

### 2. 真机验证（核心任务）
当前 USB 设备：Motorola XT2401-2 (Android 15)，包名 `com.greenrhino.player` / `com.greenrhino.music`
```powershell
# 2a. 确认设备连上：
adb devices
# 预期输出：ZY22KJLPHK    device

# 2b. 清 launcher 残留 + 重装（ISS-006 要求每次 install 前先 uninstall）：
adb uninstall com.greenrhino.player
adb uninstall com.greenrhino.music
# 如果上面命令挂起或没反应 → 设备上可能弹了"卸载确认"，点一下
adb install clients/android-music/app/build/outputs/apk/debug/app-debug.apk
adb install clients/android-player/app/build/outputs/apk/debug/app-debug.apk
adb shell pm clear com.motorola.launcher3

# 2c. 验证 APK 内路径（必查，白屏就是因为这个）：
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("clients/android-player/app/build/outputs/apk/debug/app-debug.apk")
$zip.Entries | Where-Object { $_.FullName -like "assets/pwa/index.html" } | ForEach-Object {
    $sr = New-Object System.IO.StreamReader($_.Open())
    $c = $sr.ReadToEnd(); $sr.Close()
    if ($c -match 'src="/') { "❌ 还有绝对路径！重新 build-web + 重装" } else { "✅ 全相对路径" }
}
$zip.Dispose()

# 2d. 启动 App（Resolver 可能弹，ISS-006）：
adb shell am start -n com.greenrhino.player/.MainActivity
# 如果弹 ResolverActivity 让选应用 → 手动点屏幕上的「绿角犀播放器」
# 绕过技巧：adb shell pm clear com.motorola.launcher3 然后立刻启动

# 2e. 验证渲染（应该是琥珀深色主题，不是白屏）：
# - 顶部导航按钮全齐
# - 深色背景 #0E1116 / #1a1d23
# - 搜索框 / 导入按钮都有
# 抓 console log：
adb logcat -c
# 手动操作 App 后：
adb logcat -d -v time | Select-String "console\.|GreenRhino|onReceivedError|ERR_"
# 预期：零 net::ERR_FILE_NOT_FOUND、零 onReceivedError

# 2f. 如果 HUAWEI P50 Pro 也在 → 同样流程，pm install 会挂起等屏幕确认（ISS-20260915-003）
```

### 3. 部署（可选，真机验证全绿后）
```powershell
# 重 build PWA（确保相对路径进去了）：
node scripts/build-web.mjs
# 部署双站点：
wrangler pages deploy release/pwa-site-music --project-name=greenrhino-music
wrangler pages deploy release/pwa-site-player --project-name=greenrhino-player
# 验证线上：
curl -s https://greenrhino-music.pages.dev/index.html | Select-String 'src=|href='
# 预期：全 ./xxx 相对路径
```

### 4. 后续任务
- [ ] Android 增强：原生媒体通知 + 前台服务后台播放
- [ ] 华为 AppGallery 上架

---

## 🧱 已定规则（铁律，改需专门确认）

| 规则 | 来源 | 说明 |
|---|---|---|
| **version 全链路一致** | AGENTS.md §不可变约束 | APP_VERSION = v16，所有落点（cache 名、manifest、package、显示）必须同步 |
| **SW cache 占位符** | AGENTS.md §5 | `sw.js` 里必须是 `const CACHE = '__SW_CACHE__'`，禁止硬编码版本号 |
| **双 App 隔离** | AGENTS.md | package_name、cache 桶、manifest 主题色、Cloudflare Pages 项目均独立 |
| **源码零构建** | AGENTS.md | `src/` 浏览器原生 ES Module 加载，禁 bundler |
| **TWA 正确依赖** | issues ISS-002 | 必须 `com.google.androidbrowserhelper:androidbrowserhelper`，不要找错包 |
| **assetlinks 真实域名** | issues ISS-004 | target 必须与 Cloudflare Pages 域名严格匹配 |
| **资源用相对路径（PWA 打包 Android APK 必守）** | **ISS-20260916-003** | index.html 内资源引用一律 `./src/...`、`./manifest.webmanifest`、`./favicon.svg`。**绝对路径 `/xxx` 在 Android WebView 上指向文件系统根目录（不存在）→ 白屏**。Cloudflare Pages 和 Android WebView 双端兼容。**根因**：WebView loadUrl("file:///android_asset/pwa/index.html") 时绝对路径不回落到 assets 目录 |
| **改 PWA 后必须重 build-web + build APK** | ISS-20260916-003/005 | 改 index.html / src/ / build-web.mjs → 重 `node scripts/build-web.mjs` → 重拷到 `app/src/main/assets/pwa/` → clean assembleDebug → adb install |
| **copyPwaAssets 不能往 merged_assets 中间目录写** | **ISS-20260916-001** | 必须往 `app/src/main/assets/pwa/`（Android 标准目录），否则 compressDebugAssets 丢 src/ 子目录 → APK 里没 main.js/style.css → WebView 白屏 |
| **改 PWA 后 Windows 重打包** | issues ISS-005 | 改 PWA → 重跑 copy-web.mjs → dotnet publish |
| **library refresh 加锁** | issues ISS-006 | 异步列表刷新防并发 |
| **废弃方案配一起删** | issues ISS-008 | 别留红叉 workflow |
| **跨框架迁移原生写** | issues ISS-009 | Express→Koa 别用 wrapper |
| **Feature detection 隐藏按钮** | issues ISS-010 | webkitdirectory 按钮 WebView 下隐藏 |
| **台账系统三层组织** | AGENTS.md §📚台账系统 | 项目级台账（decisions/issues/context/index）+ 会话临时层（.session-memory.md）+ 用户级共享层（shared-*） |
| **台账 6 条自动触发** | AGENTS.md §📚台账系统 | 新对话读台账、改文件前扫坑、20 条/「记台账」自动归档、≥3 次同坑归档、预防规则写 TODO 注释、每周一周报 |
| **Android 交接文档 HANDOVER.md** | DEC-20260914-005 | Android 壳交接入口，含 TL;DR + 技术栈 + 测试流程 |
| **Gradle build.gradle 无 BOM** | ISS-011 | build.gradle 必须 UTF-8 无 BOM；记事本保存时注意 |
| **Android themes.xml 两层结构** | ISS-012 | 基础主题 Theme.GreenRhino + Launcher 子主题，manifest 必须引用 Launcher |
| **publish.ps1 路径 + PATH 兜底** | ISS-013/014 | csproj 用各自文件名；dotnet 不在 PATH 时脚本里加兜底 |
| **Playwright 镜像（国内）** | ISS-015 / SHARED-012 | 设 `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright` 再 `npx playwright install` |
| **player role 内部代号是 video** | ISS-20260915-001 | build-web.mjs L47 写的 `winRole: 'video'`，不是 `'player'`。写条件分支时注意 `if (winRole === 'video')` 对应 🎬 player 站点 |
| **所有 role 必须同步设 data-theme** | ISS-20260915-002 | music role 有 2 步（加 class + 同步设深色），video role 之前漏了同步设主题 → HarmonyOS 首帧浅色白屏 |
| **HarmonyOS pm install 挂起** | ISS-20260915-003 | HarmonyOS JAD-AL00 上 `pm install` / `cmd package install` 挂起无输出 → 等用户在**手机屏幕上点安装确认弹窗** |
| **HarmonyOS SELinux /sdcard 装不了** | ISS-20260915-003 | `/sdcard/` 被 SELinux 拒绝 fuse 权限 → 用 `/data/local/tmp/` |
| **adb daemon 重启才能认设备** | ISS-20260915-004 | Windows 上 USB 插好但 `adb devices` 空 → `adb kill-server; adb start-server` |
| **copyPwaAssets 不能往 merged_assets 中间目录写** | ISS-20260916-001 | 必须往 `app/src/main/assets/pwa/`（Android 标准目录），否则 compressDebugAssets 丢 src/ 子目录 → WebView 白屏 |
| **Motorola launcher install 会堆快捷方式残留** | ISS-20260916-002 | install 前先 `adb uninstall` 干净；install 后可 `adb shell pm clear com.motorola.launcher3` 清残留，但下次 install 又复现 |
| **CSS grid 1fr 必须写 minmax(0,1fr)** | **ISS-20261008-001/002** | grid-template-columns 里的 1fr 默认 min-width:auto，子元素 width:100% 会把列撑到无限宽。**必须**写 `minmax(0, 1fr)`；中间容器 `#main` 也必须 `overflow:hidden` |
| **WebView 缓存旧 CSS/JS 坑** | **ISS-20261008-003** | debug 迭代时：① `adb shell pm clear <pkg>` ② index.html 加 `?v=timestamp` cache-busting ③ install 后**用户必须手动重新打开 App**（force-stop + monkey 不能清 WebView disk cache） |
| **gradle copyPwaAssets 会覆盖 assets/pwa 里的手改** | **ISS-20261008-004** | copyPwaAssets 从 release/pwa-site-* 拷到 assets/pwa，会覆盖之前 inject 的 marker 或手动改的文件。改 assets 里的文件**必须**在 `gradlew assembleDebug` **之前**改 release 目录，或者改 gradle 任务顺序 |

---

## 🧪 测试命令速查

```bash
npm run test:all        # 单元 6 条 + E2E 4 条（改 sw.js / build-web.mjs 后必跑）
node test/build-sw-cache.test.js     # 单元测试
npx playwright test test/e2e/        # Playwright E2E（SW cache 隔离）
node test/smoke-playwright.mjs       # Playwright 冒烟（完整浏览器渲染层，13 项）
```

### 国内 Playwright 下载（首次/升级时必设）

```powershell
$env:PLAYWRIGHT_DOWNLOAD_HOST = "https://cdn.npmmirror.com/binaries/playwright"
npx playwright install chromium
```

---

## 📁 关键路径速查

| 做什么 | 去哪改 |
|---|---|
| 改版本号 | `scripts/build-web.mjs` → `APP_VERSION = 'v16'` |
| 改 SW cache 名 | 同上自动注入；源码占位符 `sw.js` 里别动 |
| 改主题色 | `build-web.mjs` 第 4.5 步 + `icons/icon-{music,player}.svg` |
| 改 manifest | `build-web.mjs` 第 4 步（模板在 scripts/ 里） |
| 新增前端 UI | `src/` 下原生 ES Module |
| 改 Android 壳 | `clients/android-music/` / `clients/android-player/` |
| 改 Windows 壳 | `clients/windows/GreenRhino{Music,Player}/` |
| 跑构建 | `scripts/build-web.mjs` + `scripts/build-assets.mjs` |
| 部署 | `wrangler pages deploy release/pwa-site-{music,player}` |
| Android 壳交接 | 先读 `HANDOVER.md` |
| 查决策/踩坑 | `.trae/memory/台账/decisions.md` / `issues.md` / `index.md` |

### 🔑 role 命名备注
- music 站点 __winRole = 'music' → 🎵 绿角犀音乐
- player 站点 __winRole = 'video' → 🎬 绿角犀播放器（**内部代号 video，不是 player**）

### 🪜 HarmonyOS adb 安装绕路
```powershell
# 设备已连但 adb devices 空 → 重启 daemon
adb kill-server; adb start-server

# HarmonyOS pm install 挂起 → push 到 /data/local/tmp/ 后让用户点屏幕弹窗
adb push your.apk "/data/local/tmp/your.apk"
# 然后用户在手机屏幕上点「安装应用」确认
```

### 🪜 Motorola Android 15 launcher Resolver 绕路
```powershell
# install 前先卸载干净（否则 launcher 堆一堆残留快捷方式）
adb uninstall com.greenrhino.player
adb install your.apk

# 如果 ResolverActivity 弹多选项挡路 → 清 launcher 数据
adb shell pm clear com.motorola.launcher3

# 绕过 Resolver：用显式 ComponentName 启动
adb shell am start -n com.greenrhino.player/.MainActivity
# 注意：有时 am start 的 Activity 输出还是 ResolverActivity 但实际 topResumedActivity 已经是我们的 App
```

---

## 🕐 最近 5 条动作（新 AI 进门先看这里）

> 按时间倒序，最多保留 5 条。每次任务结束更新。
> 过期（>3 天）自动清理。

| # | 日期 | 做了啥 | 改了哪些文件 | 跑了啥命令 | 关联决策/坑 |
|---|---|---|---|---|---|
| 1 | 2026-10-08 | **视频播放核心功能落地**：CSS grid 溢出根因修复（#main overflow:hidden + minmax(0,1fr)）+ 视频沉浸式（顶栏底栏侧栏全隐藏）+ 控制条 3s 自动淡出 + 点画面温柔唤起 + 返回按钮 + 顶栏导入按钮 + MainActivity 清理调试代码 + cache-busting query string 防 WebView 缓存 | src/style.css、src/ui/videoPlayer.js、index.html、src/main.js、MainActivity.kt | build-web.mjs / gradlew assembleDebug / adb shell pm clear / adb install | ISS-20261008-001/002/003/004、DEC-20261008-001/002/003 |
| 2 | 2026-09-30 | **台账系统全面升级**：AGENTS.md → 五步闭环 + 成长型归类加级 | AGENTS.md、context.md、decisions.md、issues.md、index.md、daily.md | — | DEC-20260914-004 |
| 3 | 2026-09-18 | Android 壳交接文档 HANDOVER.md 完成 | context.md、HANDOVER.md | — | DEC-20260914-005 |
| 4 | 2026-09-16 | 修 3 层白屏问题（ISS-002/003/005） | index.html、build-web.mjs、main.js、build.gradle | build-web + assembleDebug | ISS-20260916-001/002/003 |
| 5 | 2026-09-15 | HarmonyOS P50 Pro 真机验证 music ✅ 全绿 | main.js（加 data-theme） | adb install | ISS-20260915-002/003/004 |

---

**⚠️ 最近动作更新规则**：每次完成一个任务后，自动在本条目的最顶部追加新动作，挤掉最老的那条（超过 5 条时）。
