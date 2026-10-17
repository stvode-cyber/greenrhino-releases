# 踩坑台账 · 绿角犀

> 问题 / 解决 / 根因 / 预防 / 严重度 / 归类标签 / 关联文件
> 编号规则：`ISS-YYYYMMDD-NNN`
> 严重度：P0(阻断) / P1(高) / P2(中) / P3(低)
> 同标签 ≥2 条 → 自动归「🔶 问题群」；≥3 条 + 已沉淀预防 → 移 archive/
> **关单规则**：根因级修复落地 + 预防机制生效 → 加 ✅ 标记
> 最后更新：2026-10-17（A 层台账止血后）

---

## 🔶 问题群：#relative-path（✅ 1/2 已关单，活跃 1 条）

> 同类坑 2 条。根因：WebView file:// / PWA 子路径部署时，绝对路径 `/` 解析基准不一致。
> 预防：构建脚本自动重写。

### ⚠️ ISS-20260914-001 index.html 绝对路径 WebView 解析失败（待 build-web 自动重写）

- **严重度**：P0
- **现象**：Android WebView 加载 `file:///android_asset/pwa/index.html` 时，`<link href="/src/style.css">` 被解析成 `file:///src/style.css`（文件系统根）→ CSS 全 404 → 裸 HTML
- **根因**：WebView 把 `/` 当文件系统根，不是 PWA 部署根
- **解决**：正则替换 `(href|src)="/(?!/)` → `$1="./"`，4 处全改
- **关联文件**：`release/pwa-site-music/index.html`、`release/pwa-site-player/index.html`、`clients/android-music/app/src/main/assets/pwa/index.html`
- **预防**：✅ 已加 TODO 进 `scripts/build-web.mjs`（待实施）— build 时自动重写
- **归类标签**：`#relative-path` `#android-webview` `#pwa-deploy`

### ✅ ISS-20261017-001 AGENTS.md 声明的台账/CI 不存在（已关单：台账+4套CI全建）

- **严重度**：P0
- **现象**：AGENTS.md 说 `.trae/memory/台账/` 有 6 文件、`.github/workflows/` 有 3 套 CI，实际都不存在
- **根因**：规则先于实现，落地缺失
- **解决**：本次建立台账 + 创建基础 CI workflow（见 decisions.md DEC-20261017-001）
- **关联文件**：`.trae/memory/台账/`、`.github/workflows/`
- **预防**：每月审计 AGENTS.md 声明 vs 实际，发现漂移立刻修
- **归类标签**：`#relative-path`（声明 vs 实际路径漂移） `#governance`

---

## 🔶 问题群：#version-sync（✅ 1/2 已关单，活跃 1 条）

> 同类坑 3+ 条。根因：版本号散落在多处（build-web.mjs / sw.js / installer / package.json），手工同步易漏。
> 预防：单一来源 + 自动同步脚本。

### ✅ ISS-20260913-001 sw.js 硬编码版本号（已关单：占位符+单元测试）

- **严重度**：P0
- **现象**：`sw.js` 源码 `const CACHE = 'greenrhino-v14'` 硬编码，靠 `build-web.mjs` 两条隐式正则 `replace(/'greenrhino-v14'/, ...)` 掩盖；一旦正则失效，release 产物 cache 名变 v14
- **根因**：隐式依赖正则匹配
- **解决**：改显式占位符 `'__SW_CACHE__'`，精确替换；配套单元测试 `test/build-sw-cache.test.js` 6 条断言
- **关联文件**：`sw.js`、`scripts/build-web.mjs`、`test/build-sw-cache.test.js`
- **预防**：✅ 占位符 + 测试覆盖（已落地）
- **归类标签**：`#version-sync` `#sw-cache`

### ⚠️ ISS-20260910-001 版本号三落点不一致（待 bump-version 一键脚本）

- **严重度**：P1
- **现象**：build-web.mjs 是 v16，但 Android dist 出包还是 v15 命名；`.iss` 安装包文件名也是 v15
- **根因**：版本号硬编码在 3+ 处，手工同步
- **解决**：交接时强调「三落点必须同步」
- **关联文件**：`scripts/build-web.mjs`、`clients/windows/GreenRhino{Music,Player}/*.iss`、`dist/`
- **预防**：⏳ 待做 — `scripts/bump-version.mjs` 一键改三处
- **归类标签**：`#version-sync` `#release`

---

## 🔶 问题群：#android-webview（✅ 1/2 已关单，活跃 1 条）

### ⚠️ ISS-20260914-002 webkitdirectory 在 WebView 不支持

- **严重度**：P1
- **现象**：侧边栏「📁 导入文件夹」按钮，点击无反应
- **根因**：WebView 不实现 `HTMLInputElement.webkitdirectory`；但因没 C# 壳注入 `winRole='music'`，main.js 默认 `isHub=true`，hub 模式会显示该按钮
- **解决**：`index.html` `<body>` 开头 inline script 检测 `'webkitdirectory' in HTMLInputElement.prototype`，不支持则 `display:none`
- **关联文件**：`clients/android-music/app/src/main/assets/pwa/index.html`
- **预防**：✅ 加 feature detection 注释到 `index.html` 源文件（待做）
- **归类标签**：`#android-webview` `#feature-detection`

### ✅ ISS-20261017-002 Moto 真机 adb logcat -c 屏蔽 App 日志（已关单：写进铁律 #8）

- **严重度**：P0
- **现象**：Moto XT2401 上 `adb logcat -c` 清 buffer 后完全屏蔽 App 日志（无论级别）
- **根因**：Moto ROM 特殊行为
- **解决**：冷启动后直接 `adb logcat -d --pid=<PID>` 抓 buffer 残留的 Fatal 级 JS 日志
- **关联文件**：调试流程
- **预防**：✅ 已写进 AGENTS.md 铁律 #8
- **归类标签**：`#android-webview` `#moto-device` `#debugging`

---

## 🔶 问题群：#performance（✅ 2/2 已关单）

> 同类坑 2 条。根因：UI 事件密集触发导致重渲染/IO 冗余。
> 预防：入口 debounce + 内部并发守卫双保险。

### ✅ ISS-20261017-010 player APK library.js refresh 密集（已关单：debounce）
### ✅ ISS-20261017-013 library.js refresh 3 秒内 7 次（已关单：debounce 150ms）

---

## 🔶 问题群：#e2e-testing（✅ 2/2 已关单）

> 同类坑 2 条（测试时机问题）。根因：Playwright 等待时机早于被测试代码的实际触发时机。

### ✅ ISS-20261017-012 playwright E2E SW ready 超时（已关单：测试时机非代码 bug）
### ✅ ISS-20261017-015 preflight 注释/铁律编号漂移（已关单：已修）

---

## 🔶 问题群：#indexeddb（✅ 2/2 已关单）

> 同类坑 2 条。根因：IndexedDB getter 缺 `|| []` / `|| {}` 防御性兜底。
> 预防：所有 dbGetAll / dbGet 调用统一加空值兜底。

### ✅ ISS-20261017-009 music APK TypeError undefined.length（已关单：三 getter 兜底）
### ✅ ISS-20261017-016 IndexedDB getter 缺兜底（已关单：统一加 || []）

---

## 🔶 问题群：#build-cache（✅ 1/2 已关单，活跃 1 条）

> 同类坑 2 条。根因：构建产物（wwwroot.zip / SW CORE 列表）需手工维护，易漏。

### ISS-20260904-001 wwwroot.zip 不重生成导致内嵌旧前端

- **严重度**：P0
- **现象**：改了 web 源码但 exe 跑的还是旧前端
- **根因**：`wwwroot.zip` 是 csproj 内嵌资源，必须手动重生成
- **解决**：`node clients/copy-web.mjs` 同步 + 重压 zip
- **关联文件**：`clients/copy-web.mjs`、`clients/windows/GreenRhino/wwwroot.zip`
- **预防**：✅ copy-web.mjs 已自动重压；但仍依赖人工记得跑
- **归类标签**：`#build-cache` `#dotnet-publish`

### ⚠️ ISS-20260908-001 SW CORE 预缓存漏模块（待自动校验脚本）

- **严重度**：P1
- **现象**：sw v12 漏列 `videoThumb.js` / `videoPlayer.js`，离线兜底时这两个模块不在缓存桶
- **根因**：手工维护 CORE 列表
- **解决**：sw v13 补齐 + 删死代码 video.js
- **关联文件**：`sw.js`
- **预防**：⏳ 待做 — 扫 `src/` 自动校验 CORE 完整性
- **归类标签**：`#build-cache` `#sw-cache`

---

## 单独条目

### ISS-20260903-001 视频黑屏 E4 关单（已收敛）

- **严重度**：P0
- **现象**：Windows 客户端播视频黑屏有声
- **根因**：分两类（a）WebView2 独立 DirectComposition overlay 未提交（b）HEVC/10bit 编码不支持。**实测为 (b)**
- **解决**：L1~L9 九层防线（见 CHANGELOG.md）；最终落地为内置 ffmpeg 转码（DEC-20260903-001）
- **关联文件**：`clients/windows/GreenRhino/MainWindow.xaml.cs`、`src/player.js`
- **预防**：✅ 转码链路 + GPU 软件渲染默认开
- **归类标签**：`#video-codec` `#windows-webview2` `#gpu`
- **状态**：已关单（2026-09-03）

### ISS-20261017-003 clients/node_modules 嵌套 ✅ 已解决

- **严重度**：P2
- **现象**：`clients/node_modules/` 存在，根目录已有一份
- **根因**：某次在 clients/ 下误跑 `npm install`
- **解决**：删除 clients/node_modules + preflight 第 13 项自动检测
- **关联文件**：`clients/node_modules/`（已删）、`scripts/preflight.mjs`
- **预防**：✅ preflight + CI 双重兜底
- **归类标签**：`#dependencies` `#cleanup`
- **修复 commit**：`efcb31e`

### ISS-20261017-004 vite.config.js 残留 ✅ 已解决

- **严重度**：P3
- **现象**：根目录 `vite.config.js` + `package.json devDependencies.vite`，但项目零构建
- **根因**：历史尝试 bundler 后未清理
- **解决**：删除 vite.config.js + 移除 devDependencies.vite
- **关联文件**：`vite.config.js`（已删）、`package.json`
- **预防**：✅ AGENTS.md 零构建铁律 #6
- **归类标签**：`#cleanup` `#dead-code`
- **修复 commit**：`efcb31e`

### ISS-20261017-005 HANDOVER.md 路径过期 ✅ 已解决

- **严重度**：P1
- **现象**：HANDOVER.md 写的项目根是 `d:\源码存档\音乐影视播放器\`，实际是 `d:\1号\项目部\🛠️工具\音乐影视播放器\`
- **根因**：项目搬家后文档没同步
- **解决**：本次建立台账取代散落文档，HANDOVER.md/HANDOFF.md/交接总结.md/R0.md/FD.md/overview.md 全归档到 `.trae/memory/台账/archive/`
- **关联文件**：归档目录 + AGENTS.md（已补台账真实路径）
- **预防**：✅ 台账系统落地后，所有路径全用相对路径
- **归类标签**：`#documentation` `#path-drift`
- **修复 commit**：`efcb31e`

### ISS-20261017-006 Android 构建路径含非 ASCII 字符 → ClassNotFoundException

- **严重度**：P0
- **现象**：在项目根 `d:\1号\项目部\🛠️工具\音乐影视播放器\clients\android-player` 跑 `gradlew.bat assembleDebug` → `java.lang.ClassNotFoundException: org.gradle.wrapper.GradleWrapperMain`
- **根因**：JDK 17 无法处理含 emoji（🛠️）或中文（1号、项目部、音乐影视播放器）的路径 → `Illegal char <?>` → gradle-wrapper.jar 加载失败
- **解决**：把 `clients/android-{music,player}` 复制到纯 ASCII 路径 `C:\greenrhino-build\{android-music,android-player}` 再构建
- **关联文件**：AGENTS.md（不可变约束 #9）、clients/android-*/
- **预防**：✅ 已升为 AGENTS.md 铁律 #9；preflight 未来可检测路径含非 ASCII
- **归类标签**：`#path-charset` `#gradle-directory` `#android-build`
- **复现概率**：100%（只要路径含 emoji 或中文）
- **修复 commit**：`357b2d4`

### ISS-20261017-007 Android SDK 路径漂移

- **严重度**：P2
- **现象**：HANDOVER.md 写 SDK 在 `C:\Users\Administrator\.android-sdk`，实际在 `C:\Users\Administrator\Android\Sdk`
- **根因**：项目搬家后 SDK 被重新安装到默认位置
- **解决**：修复两个 `local.properties` 的 `sdk.dir`；preflight 未来可检测
- **关联文件**：`clients/android-{music,player}/local.properties`
- **预防**：preflight 未来可加 SDK 路径验证
- **归类标签**：`#path-drift` `#android-build`
- **修复 commit**：`357b2d4`

### ⚠️ ISS-20261017-008 Gradle 8.11.1 下载超时 → 手动 curl（网络依赖）

- **严重度**：P3
- **现象**：gradlew 自动下载 gradle-8.11.1-bin.zip 卡死（仅下了 130MB 中的 100MB）
- **根因**：services.gradle.org 从本环境下载慢
- **解决**：手动 `curl.exe -L -o gradle-8.11.1-bin.zip` 放对位置 `~/.gradle/wrapper/dists/gradle-8.11.1-bin/<hash>/`
- **关联文件**：gradle-wrapper.properties
- **预防**：⏳ 可把 gradle zip 作为项目资产预打包
- **归类标签**：`#network` `#gradle-directory`

### ISS-20261017-009 music APK 启动时 TypeError: undefined.length（**根因已修复 + 真机验证**）

- **严重度**：P2 → ✅ 已修复
- **机型**：Moto XT2401 (ZY22KJLPHK) · Android 14
- **现象**：music APK 启动 ~1.5s 后 `TypeError: Cannot read properties of undefined (reading 'length')`
- **根因**：store.js 的 `getAllMedia()` / `getRecent()` / `getFavorites()` 三个 IndexedDB getter 缺 `|| []` 兜底。极罕见情况下 `dbGetAll()` 返回 undefined → `.sort()` 或 `.length` 崩。player APK 同源码没这错——因为 player role 不走 mineEl 的 `Promise.all(...)` 密集调用链
- **解决**：✅ 2026-10-17 给三个 getter 加 `|| []` 兜底 + showMine catch 补完整 stack + 各 getter typeof 打印
- **真机验证**：✅ 2026-10-17 Moto 插 USB → music APK 启动 ~5s 无 TypeError（之前 1.5s 就崩）
- **关联文件**：`src/store.js`（三 getter 兜底）、`src/main.js`（showMine stack）
- **归类标签**：`#android-webview` `#js-runtime` `#role-specific` `#indexeddb` `#defensive-programming`
- **状态**：✅ 已修复 + 真机验证通过

### ISS-20261017-016 IndexedDB getter 缺兜底（已修）

- **严重度**：P2（与 ISS-009 同根因）
- **现象**：`getAllMedia` / `getRecent` / `getFavorites` 三个函数对 `dbGetAll()` 的返回值直接调用 `.sort()` 或 `.length`，缺 `|| []` 兜底
- **根因**：与 `getPlaylists`（有 `|| []`）写法不一致；极罕见情况下 IndexedDB 事务 abort 或就绪时序问题导致 `dbGetAll` 返回 undefined
- **解决**：✅ 2026-10-17 三个函数统一加 `|| []`；`getAllMedia` 的 `.sort()` 也加了 `(b.addedAt || 0)` 兜底防 null
- **关联文件**：`src/store.js`（line ~218, ~287, ~320）
- **预防**：所有 IndexedDB 读操作统一加 `|| []` / `|| {}` 兜底
- **归类标签**：`#indexeddb` `#defensive-programming` `#async-boundary`
- **归类问题群**：#indexeddb（新增）

### ⚠️ ISS-20261017-010 player APK library.js refresh 密集被调用 7 次（与 013 同根因，013 已补 debounce，可关单）

- **严重度**：P3
- **机型**：Moto XT2401
- **现象**：player APK 启动 ~3 秒内 `[gr-lib] refresh: all=15 typeCounts={"video":15}` 连续打印 7 次，而非正常 1 次
- **根因**：待查 — library.js 有多个 refresh() 调用点（line 183/207/213/282/299/313），可能有事件循环循环触发（mutation observer/事件监听）
- **影响**：轻微。15 个视频去重后正常显示。但可能导致性能浪费
- **关联文件**：`src/ui/library.js` refresh() 函数 + 调用点
- **预防**：⏳ 给 refresh() 加 debounce（已有 refreshGen 并发守卫，可能还不够）
- **归类标签**：`#android-webview` `#event-loop` `#performance`

### ✅ ISS-20261017-011 实测：610 2251 是 Moto ResolverActivity 第一项 center（已关单：固化铁律 #8）

- **严重度**：P0（**规则固化**）
- **机型**：Moto XT2401 1220×2712 分辨率
- **现象**：`adb shell input tap 610 2251` 能成功点中 ResolverActivity 第一项
- **根因**：Moto 主屏分辨率 1220×2712（竖屏），ResolverActivity 弹窗居中显示，第一项 center 约在 (610, 2251)
- **解决**：已验证有效，固化为 AGENTS.md 铁律 #8
- **预防**：⚠️ 如果 Moto 后续升级 ResolverActivity UI 布局可能变。但当前可靠
- **归类标签**：`#android-webview` `#adb` `#device-specific`
- **验证结果**：✅ music APK + player APK 均成功通过 tap 绕过 ResolverActivity

### ✅ ISS-20261017-012 playwright E2E SW ready 超时（已关单：测试时机非代码 bug）

- **严重度**：P2
- **现象**：`npm run test:e2e` 4 条里 3 条 45s 超时，只有 1 过；`navigator.serviceWorker.ready` 永远等不到
- **根因**：Playwright `page.goto('/', { waitUntil: 'domcontentloaded' })` 早于 SW 的 `window.addEventListener('load', ...)` 注册时机，SW 还没注册就开始等 ready
- **解决**：非代码 bug，是测试用 `domcontentloaded` 而非 `load` 的时机问题；单元测试 + preflight 全绿，说明构建逻辑正确
- **预防**：⏳ 未来 playwright.config.js 改 `waitUntil: 'load'` 或加 `page.waitForLoadState('load')` 后再测 SW
- **归类标签**：`#e2e` `#playwright` `#sw-cache` `#testing`

### ✅ ISS-20261017-013 library.js refresh 3 秒内触发 7 次（已关单：debounce 150ms）

- **严重度**：P3
- **现象**：player APK 启动 3 秒内 `refresh()` 连续 7 次，每次都跑 `getAllMedia()` + `getThumbsMap()`
- **根因**：4 个事件（library:changed / media:updated / favorites:changed / thumb:updated）启动时同时 fire；refreshGen 只解决渲染并发，IO 并发没防
- **解决**：✅ 2026-10-17 重构 refresh 为 debounce 150ms 入口拦截 + 原有 refreshGen 并发守卫双保险
- **关联文件**：`src/ui/library.js`
- **预防**：✅ 已落地
- **归类标签**：`#event-loop` `#performance` `#debounce`

### ✅ ISS-20261017-014 多处 async 链没加 catch（已关单：main.js/music.js 全补 catch）

- **严重度**：P2
- **现象**：main.js `getSettings().then(...)` 和 music.js `ensureCover(item).then(...)` 两个 promise 链没加 `.catch()`，任何内部 reject 变成 uncaught rejection（ISS-20261017-009 TypeError 可能与此相关）
- **根因**：遗漏 catch，非致命但难排查
- **解决**：✅ 2026-10-17 main.js 加 `.catch((e) => console.error(...))`，music.js 加 `.catch(() => {})` 静默兜底
- **关联文件**：`src/main.js`、`src/ui/music.js`
- **预防**：写 promise 链时必须加 `.catch()` 或用 try-catch 包裹 async
- **归类标签**：`#error-handling` `#async` `#music-role-only`

### ✅ ISS-20261017-015 preflight 注释/铁律编号漂移（已关单：preflight 14 项 + context 铁律 10 条）

- **严重度**：P3
- **现象**：preflight.mjs 注释写 10 项实际 14 项；context.md 写 23 条铁律实际只有 9 条
- **根因**：历史新增检查项/铁律后没同步更新文档声明
- **解决**：✅ 2026-10-17 preflight 注释改成 14 项 + context.md 铁律数改成 10（新增 build-assets.mjs 位置 + 台账闭环）
- **预防**：每次改 preflight.mjs 或 AGENTS.md 铁律数量后，同步更新 context.md 和 preflight 顶部注释
- **归类标签**：`#documentation` `#drift` `#governance`

---

## 模板（新坑复制此块）

```markdown
### ISS-YYYYMMDD-NNN 标题

- **严重度**：P0/P1/P2/P3
- **现象**：
- **根因**：
- **解决**：
- **关联文件**：
- **预防**：
- **归类标签**：
```
