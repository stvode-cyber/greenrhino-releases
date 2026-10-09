# 🛩️ 绿角犀项目驾驶舱（context.md）

> **新 AI 接手 → 先读本文件头部 TL;DR（30 秒版），再看底部「最近 5 条动作」**
> 最后更新：2026-10-09

---

## 🎯 TL;DR（30 秒版 · 换电脑交接区）

| 项 | 值 |
|---|---|
| 当前版本 | **APP_VERSION = 'v16'**（scripts/build-web.mjs L10） |
| Git 状态 | main 分支干净，3 commits 推不上去（GitHub 超时） |
| 未 push commit | `9af8358` feat: 音乐 App UI 改版 + 导入修复 |
|               | `b1d91ce` fix: 边界过滤大修复（Music MediaStore.Audio + store.js role 分流） |
|               | `dc4b2f7` fix(urgent): buildMusicHome 函数缺失补 stub |
| 测试状态 | ✅ 单元 6/6 + E2E 4/4 = 10/10 全绿 |
| 本地构建 | ✅ release/pwa-site-music/ + release/pwa-site-player/ 已生成 |
| Android APK | ✅ music + player assembleDebug BUILD SUCCESSFUL |
| RhinoBridge (music) | ✅ 已补完整（之前缺失！） |
| 当前进度 | v16 功能基本齐，下一步：真机验证 + UI polish + 推 GitHub + 发布 |
| 阻塞点 | GitHub Connection timed out（300s），等网络恢复再 push |
| 已定规则 | ~25 条（见 AGENTS.md 不可变约束 + issues.md 活跃坑） |
| 真机已装 | ✅ com.greenrhino.music + com.greenrhino.player（adb devices 在线） |

### ⚠️ 新 AI 必做 Checklist

接手第 1 次会话先跑这 5 件事（3 分钟）：

```powershell
# 1) 确认版本号一致
node scripts/build-web.mjs          # 两套 release 产物生成

# 2) 跑测试验证没坏
npm run test:build                  # 单元 6/6 全绿

# 3) 起 server 验证 SW 注册
cd release/pwa-site-music
Start-Process python -ArgumentList "-m","http.server","4173"
Start-Process python -ArgumentList "-m","http.server","4174"
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({channel:'msedge'});const p=await b.newPage();await p.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle',timeout:15000});await new Promise(r=>setTimeout(r,2000));const s=await p.evaluate(async()=>({count:(await navigator.serviceWorker.getRegistrations()).length,names:await caches.keys()}));console.log('SW:',JSON.stringify(s));await b.close()})()"
# 预期: SW: {"count":1,"names":["gr-music-v16"]}

# 4) 重新 build Android APK（可选，改了 Kotlin 才需要）
cd clients/android-music
.\gradlew assembleDebug
# adb install -r app/build/outputs/apk/debug/app-debug.apk

# 5) 看 git push 状态，等网络好推上去
git log --oneline -5; git push origin main
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
- **后端**: Node.js LocalServer（server/）— v16 前端已不依赖，但保留
- **构建**: 仅 `scripts/build-web.mjs` + `scripts/build-assets.mjs`（自定义 Node 脚本）
- **PWA**: 手写 `sw.js`，Manifest v3
- **Android**: WebView 原生壳（Kotlin MainActivity.kt），两个独立 AndroidManifest
- **部署**: Cloudflare Pages（wrangler）+ GitHub Actions（三套 workflow）

### 关键目录

```
src/                     ← 前端源码（两个 App 共享，运行时按 winRole 裁剪 UI）
scripts/                 ← build-web.mjs / build-assets.mjs
clients/
  android-music/         ← 音乐 App Android 壳
  android-player/        ← 播放器 App Android 壳
  windows/               ← GreenRhino{Music,Player} .NET 8 WebView2
release/
  pwa-site-music/        ← build-web.mjs 输出（Cloudflare Pages 部署目录）
  pwa-site-player/       ← 同上
.github/workflows/       ← CI
.wrangler/               ← Cloudflare Pages 部署缓存
```

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

---

## 📊 当前代码规模（src/）

| 文件 | 大小 | 职责 |
|---|---|---|
| player.js | 40 KB | 播放引擎（audio/video，转码，EQ，sleep，进度保存） |
| main.js | 29.6 KB | 应用装配（role 分流 + 页面构建 + 事件接线） |
| store.js | 18.7 KB | IndexedDB 存储 + MediaStore 导入 + 去重 + pruneLost |
| style.css | ? KB | 样式（role 专属：win-music / win-video / hub） |
| index.html | - | 入口（build-web.mjs 注入 winRole + __SW_CACHE__ + title/brand） |

---

## 🔥 本轮 3 个 commit 详情（接手必读）

### commit 1: `9af8358` feat: 音乐 App UI 全面改版 + 导入/扫描/播放大修复

**改动文件**（48 files, +1973/-331）：
- `index.html`: 新增 `#music-nav` 三栏底部导航（发现 / 🎵 mini player / 我的）
- `src/style.css`: +130 行音乐专属样式（大卡片/可折叠 section/全屏播放页）
- `src/main.js`: music role 换浅色主题（win-music → body 白色背景）
- `src/ui/library.js`: 工具栏改双按钮（📥自动扫描 + 📁选择文件）
- `clients/android-player/.../MainActivity.kt`: lookupMediaUri（contentResolver 查 MediaStore.Video 表）+ openFileDescriptor 文件存在性校验
- SAF 文件选择器 MIME 展开（music → 12 种 audio/*；player → 14 种 video/*）
- `store.js`: addMediaFiles 跨来源 name::size 去重 + role 硬过滤 + pruneLost 清僵尸

### commit 2: `b1d91ce` fix: 音乐导入边界过滤大修复

**找到并修了 4 个隐藏漏洞**：

| # | 漏洞 | 根因 | 修复 |
|---|---|---|---|
| 1 | **Music App 完全没有 MediaStore 扫描** | Music MainActivity 是个空壳！只有 SAF onShowFileChooser，没有 RhinoBridge.requestAutoImport / MediaStore.Audio 扫描入口 | 补完整 `scanMediaStore()`（查 MediaStore.Audio.Media + ARTIST/ALBUM 元数据 + MIN_SIZE=1MB）+ `RhinoBridge` inner class + `requestMediaPermission()` |
| 2 | **store.js addMediaFromAndroid 硬编码 VIDEO_EXT + MIN_SIZE=500MB** | 之前只考虑 player role，music role 扫出的 .mp3 全被跳过（VIDEO_EXT 不匹配 + 10MB 也 < 500MB） | 按 GR_ROLE 分流：music → AUDIO_EXT + 1MB，video → VIDEO_EXT + 500MB |
| 3 | **lookupMediaUri 只查 MediaStore.Video** | Music 手动导入音频查不到 URI，只能存 blob | Music 版补 lookupMediaUri → MediaStore.Audio.Media 查询 |
| 4 | **buildMusicHome 函数缺失** | main.js L62 调用 `buildMusicHome(app)` 但没定义 → music role init crash → SW 注册走不到 | 补 stub 函数（搜索框 + 大卡片 + 可折叠 section） |

### commit 3: `dc4b2f7` fix(urgent): buildMusicHome 函数缺失

**这是 commit 2 构建后 E2E 测试暴露的紧急修复**：
- 根因：commit 2 补了 RhinoBridge/store.js role 分流，但没验证 music role main.js 能 init 完
- 现象：Playwright headless 跑 music role → `ReferenceError: buildMusicHome is not defined` → SW 注册走不到 → E2E 3 条全超时
- 教训：UI 大改后必须 `node scripts/build-web.mjs` → `python -m http.server` → Playwright headless smoke test

---

## 🧪 测试体系

### 单元测试（`npm run test:build`）

`test/build-sw-cache.test.js` — 读文件文本验证 build-web.mjs 产物正确
- ✔ sw.js 源码有 __SW_CACHE__ 占位符
- ✔ sw.js 源码没有硬编码 greenrhino-v* 版本号
- ✔ music release cache = gr-music-v16
- ✔ player release cache = gr-player-v16
- ✔ 两个 App cache 严格不同
- ✔ cache 名版本号与 APP_VERSION 同步

### E2E 测试（`npm run test:e2e`）

`test/e2e/sw-cache.spec.js` — Playwright Edge headless 真实浏览器验证 SW 注册
- `playwright.config.js` 自动起 `python -m http.server 4173/4174`（分别对应 music/player release 目录）
- 核心验证：`navigator.serviceWorker.getRegistrations()` count ≥ 1 + `caches.keys()` 包含正确 cache 名
- **注意**：如果 python server 还占着 release 目录，build-web.mjs 的 rmSync 会 EPERM！先 `Get-Process python | Stop-Process -Force`

### 跑全量

```powershell
npm run test:all    # = npm run test + npm run test:e2e
```

---

## 📦 APK 构建 & 安装

```powershell
# 构建两个 APK
cd clients/android-music; .\gradlew assembleDebug
cd ..\android-player; .\gradlew assembleDebug

# 安装到真机
adb install --user 0 -r clients\android-music\app\build\outputs\apk\debug\app-debug.apk
adb install --user 0 -r clients\android-player\app\build\outputs\apk\debug\app-debug.apk

# 启动 + 看日志
adb shell "am start -n com.greenrhino.music/.MainActivity"
adb logcat -d GreenRhino:D *:S | Select-Object -Last 20
# 预期日志: RhinoBridge registered OK (music)
```

---

## 🔧 核心链路速查

### 导入音频文件的两条路径（都要能打通）

```
用户点「📥自动扫描」        用户点「📁选择文件」
      │                           │
RhinoBridge.requestAutoImport()  JS input type=file showPicker()
      │                           │
requestMediaPermission()         SAF Picker (EXTRA_MIME_TYPES)
      │                           │
scanMediaStore()                 文件 URI 返回 onShowFileChooser
MediaStore.Audio 查询              │
MIN_SIZE >= 1MB                   │
openFd 文件存在性校验             │
ARTIST/ALBUM 元数据               │
      │                           │
JSON batch → __mediaBatch()    File[] blob
      │                           │
addMediaFromAndroid()             addMediaFiles()
按 GR_ROLE 分流                  按 GR_ROLE 交叉过滤
AUDIO_EXT + 1MB                  isAudio/isVideo 校验
      │                           │
跨来源 name::size 去重           lookupMediaUri 存 URI 不存 blob
pruneLost 清僵尸条目              │
      └─────────┬─────────────────┘
                │
         IndexedDB dbPut('media')
```

### Role 分流总开关

`window.__winRole` 在 build-web.mjs 里注入 index.html：
```
music 构建:  <script>window.__winRole='music';</script>
player 构建: <script>window.__winRole='video';</script>
hub(浏览器): <script>window.__winRole='hub';</script>（直接跑 src/index.html 时）
```

store.js 里对应:
```js
const GR_ROLE = (typeof window !== 'undefined' && window.__winRole) || 'hub'
// addMediaFromAndroid 里:
//   MIN_SIZE = role === 'music' ? 1 * 1024 * 1024 : 500 * 1024 * 1024
//   isAudio → type='music', isVideo → type='video'
```

### RhinoBridge 三方法

```
window.RhinoBridge.toggleFullscreen()     → 隐藏/显示系统状态栏
window.RhinoBridge.requestAutoImport()    → 触发 MediaStore 自动扫描
window.RhinoBridge.lookupMediaUri(name, size) → 按文件名+体积查 MediaStore URI
```

music 版查 MediaStore.Audio.Media；player 版查 MediaStore.Video.Media。

---

## 📍 关键文件定位（快速 grep 入口）

| 想改什么 | 去哪找 | grep 关键词 |
|---|---|---|
| 角色分流逻辑 | `src/main.js` L40-90 | `ROLE = \| isHub \| isMusic \| win-music \| win-video` |
| 导入/去重/pruneLost | `src/store.js` L75-220 | `addMediaFiles \| addMediaFromAndroid \| pruneLost \| existingKeys` |
| 播放器引擎 | `src/player.js` 全文件 | `this.current \| this.mode \| this.playMode \| emit('trackchanged'` |
| RhinoBridge 注册 | `clients/android-*/MainActivity.kt` | `RhinoBridge() \| scanMediaStore \| lookupMediaUri` |
| MediaStore 扫描阈值 | 同上 | `MIN_SIZE \| selection \| MediaStore.Audio.Media\|Video.Media` |
| SAF MIME 展开 | 同上 | `EXTRA_MIME_TYPES \| audio/\* \| video/\*` |
| SW cache 占位符 | `sw.js` L9 + `scripts/build-web.mjs` | `__SW_CACHE__ \| replace(/'__SW_CACHE__'/` |
| 主题样式 | `src/style.css` | `body.win-music \| body.win-video \| --kg \| --ka` |

---

## 🚨 活跃坑（接手时要知道的）

### ISS-20261009-018: Music App MediaStore 扫描之前完全缺失 ✅ 已修
- 根因：Music MainActivity.kt 是 SAF 文件选择器专用壳，没有 RhinoBridge / MediaStore / requestPermission
- 修复：完整移植 Player 版逻辑，改查 MediaStore.Audio.Media，MIN_SIZE=1MB
- **预防**：新增 Android role 时必须同步 MainActivity 完整实现集（RhinoBridge 3 方法 + 权限请求 + MediaStore 查询 + 文件存在性校验）

### ISS-20261009-019: buildMusicHome 函数缺失导致 music role init crash ✅ 已修
- 根因：UI 重构时 L62 调用了但忘了写函数体
- 修复：补 stub 函数（可继续迭代）
- **预防**：改 main.js 后必须 `python -m http.server` + Playwright headless smoke test

### ISS-20261009-020: addMediaFromAndroid 硬编码 VIDEO_EXT + 500MB ✅ 已修
- 根因：只考虑 player role
- 修复：按 GR_ROLE 分流
- **预防**：所有新 store.js 函数必须先看 GR_ROLE 分流还是写死

---

## 📝 发布 Checklist

推主版本 tag 前：

- [ ] `scripts/build-web.mjs` APP_VERSION 递增
- [ ] `npm run test:all` 全绿（单元 6 + E2E 4）
- [ ] SW cache 名已同步更新
- [ ] Android assembleDebug 本地跑过
- [ ] `wrangler pages deploy release/pwa-site-music --project-name=greenrhino-music`
- [ ] `wrangler pages deploy release/pwa-site-player --project-name=greenrhino-player`
- [ ] Cloudflare Pages CDN 缓存已刷新
- [ ] GitHub Actions 三套 workflow 已手动触发且 SUCCESS

---

## 🆕 新 AI 接手 Step-by-Step

### 第 1 步：30 秒扫描（已在 TL;DR 里）

上面 TL;DR 区已经把最重要的信息挤成了一张表，看完基本知道当前状态。

### 第 2 步：跑 3 分钟验证脚本

就是 TL;DR 里的「新 AI 必做 Checklist」— 5 条 PowerShell 命令全部跑一遍，确认环境能工作。

### 第 3 步：确认 GitHub 连通性

```powershell
git push origin main   # 上次超时了，这次可能好了
```
如果还超时，把这个写进 daily.md 提醒下下次。

### 第 4 步：跟用户确认优先级

当前可做的方向（按优先级排）：
1. **真机验证** — 手动点音乐 App 的 📥 自动扫描，看 MediaStore.Audio 能不能扫出手机里的歌
2. **buildMusicHome 迭代** — 现在是 stub，要做：点击大卡片跳转列表、section 展开/收起动画、真实数量显示、空态提示
3. **全屏播放页** — openMusicFullpage 还没实现（commit 2 只补了 buildMusicHome）
4. **推 GitHub + Cloudflare Pages 部署** + 打 release tag
5. **Windows EXE 构建验证**（.NET 8 WebView2）
6. **发布说明 / 版本号 bump / changelog**

### 第 5 步：开始干活

每改一个文件：
1. 改前扫 `issues.md` 的「关联文件」列 → 看有没有已知坑
2. 改完跑 `node scripts/build-web.mjs` + `npm run test:build`
3. 改 Android 代码还要 `gradlew assembleDebug`
4. 改 SW / store.js 还要 `npm run test:e2e`

---

## 📅 最近 5 条动作

| 时间 | 动作 | commit |
|---|---|---|
| 2026-10-09 下午 | buildMusicHome 补 stub，测试 10/10 全绿，commit 3 个，push GitHub 超时 | dc4b2f7 |
| 2026-10-09 下午 | Music MainActivity 补完整 RhinoBridge + MediaStore.Audio + requestMediaPermission；store.js 按 GR_ROLE 分流 addMediaFromAndroid | b1d91ce |
| 2026-10-09 下午 | 手动 Python server 跑 Playwright headless 验证 SW 注册 ✅ (count=1, caches=['gr-music-v16']) | — |
| 2026-10-09 上午 | store.js addMediaFromAndroid 硬编码 VIDEO_EXT + 500MB 漏洞识别；Music App MediaStore 扫描完全缺失 | — |
| 2026-10-09 上午 | UI 重构（底部导航、新首页、全屏播放页）→ buildMusicHome stub 被 commit 覆盖 | 9af8358 |

---

**好的，这个 context.md 就是项目驾驶舱。换电脑 → 复制整个 `.trae/memory/台账/` 目录过去 → 新 AI 读这个文件头部 30 秒，基本就能上手。**
