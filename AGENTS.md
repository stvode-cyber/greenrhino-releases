# AGENTS.md — 绿角犀项目全局规则

> 本文件对所有 AI 员工注入，是跨角色的行为基线。修改代码前必须通读。
> 最后更新：2026-10-17（v16 · 重构瘦身）

---

## 项目定位

绿角犀（GreenRhino）是一个 **离线优先的 PWA 媒体播放器**，拆成两个完全独立的应用：

| App | 主题色 | 包名 | Cloudflare Pages URL | Android 壳 |
|---|---|---|---|---|
| 🎵 音乐（green） | `#00D8A6` | `com.greenrhino.music` | `greenrhino-music.pages.dev` | Kotlin WebView ✅ |
| 🎬 播放器（amber） | `#FFB03A` | `com.greenrhino.player` | `greenrhino-player.pages.dev` | Kotlin WebView ✅ |

共享同一套源码，由 `scripts/build-web.mjs` 按角色裁剪输出到 `release/pwa-site-{music,player}/`。
Android 已弃 TWA（GMS 依赖），改用 Kotlin 原生 WebView 壳（DEC-20260914-001）。

## 技术栈（一页总览）

| 层 | 技术 | 端口 | 说明 |
|---|---|---|---|
| **前端** | 原生 ES Module + IndexedDB + Web Audio | - | 零构建，`src/` 直接浏览器加载 |
| **云端** | 🐍 Python `server/cloud_api.py` | 8787 | 云同步 + LRCLIB 歌词代理 |
| **Windows 侧** | 🟣 .NET 8 内嵌 LocalServer | 8800 | 媒体流式 + /api/lyric |
| **Android 侧** | 🔧 Kotlin MediaHttpServer | 40363 | content:// → HTTP Range 代理 |
| **构建** | `scripts/build-web.mjs` + `clients/build-assets.mjs` | - | 自定义 Node 脚本 |
| **PWA** | 手写 `sw.js`，Manifest v3 | - | Service Worker 预缓存 + 离线 |
| **Windows EXE** | .NET 8 WebView2 | - | `clients/windows/GreenRhino{Music,Player}/` |
| **Android APK** | Kotlin WebView | - | `clients/android-{music,player}/` |
| **部署** | Cloudflare Pages（wrangler）+ GitHub Actions | - | 双站独立 |

## 关键目录

```
src/                     # 前端源码（零构建，运行时 __winRole 裁剪 UI）
scripts/                 # build-web.mjs / preflight.mjs / bump-version.mjs
clients/                 # 壳工程 + build-assets.mjs
  ├── android-music/     # 🎵 Kotlin WebView 壳
  ├── android-player/    # 🎬 Kotlin WebView 壳
  ├── windows/           # .NET 8 WebView2（GreenRhinoMusic / GreenRhinoPlayer）
  ├── huawei*/           # 华为 AppGallery 上架资产
  ├── ios/               # iOS 原生壳（Music / Player）
  └── build-assets.mjs   # 跨平台图标光栅化（⚠️ 在 clients/ 不是 scripts/）
server/                  # 🐍 cloud_api.py + test_cloud.py
release/pwa-site-*/      # build-web.mjs 输出（Cloudflare Pages 部署目录）
.github/workflows/       # ci.yml / build-android.yml / build-huawei.yml / build-windows.yml
icons/                   # icon-music.svg / icon-player.svg（角色专属图标）
test/                    # 单元 + E2E
.trae/memory/台账/      # 项目驾驶舱（context.md / issues.md / decisions.md / index.md / daily.md）
```

## 不可变约束（11 条铁律）

### 1. 版本五落点一致（ISS-20260910-001 已关单）
`scripts/build-web.mjs` 的 `APP_VERSION = 'v16'` 是所有产物的版本基线。五落点必须同步：
- `build-web.mjs` APP_VERSION
- `gr-music-v16` / `gr-player-v16` cache 桶
- `.iss` OutputBaseFilename（GreenRhinoMusic-setup-v16 / GreenRhinoPlayer-setup-v16）
- `android-music/build.gradle` versionName + versionCode
- `android-player/build.gradle` versionName + versionCode
- **工具**：`npm run bump` 一键覆盖五落点；`npm run preflight` 18 项自动验

### 2. Android 包名唯一
两个 App 的 `package_name`（`com.greenrhino.music` / `com.greenrhino.player`）和 `assetlinks.json` 的包名/指纹必须严格对应，不可互换。

### 3. assetlinks.json siteUrl 匹配
`assetlinks.json` 的 `target` 域名必须与 Cloudflare Pages 域名匹配（music → `greenrhino-music.pages.dev`）。

### 4. Manifest 主题色绑定
`manifest.theme_color` 和 `<meta theme-color>` 必须与角色图标颜色一致：
- 🎵 音乐 `#00D8A6`
- 🎬 播放器 `#FFB03A`

### 5. SW cache 桶隔离 + 占位符约束
两个 App 用不同 cache 名（`gr-music-v16` vs `gr-player-v16`），源码里 **必须** 用显式占位符：
```javascript
// sw.js — 禁止硬编码版本号
const CACHE = '__SW_CACHE__'
```
替换逻辑：`build-web.mjs` 里 `replace(/'__SW_CACHE__'/, cfg.cache)`。
改 sw.js 或 build-web.mjs 后必须跑 `npm run test:all`（单元 6 条 + E2E）。

### 6. 源码零构建
`src/` 目录在运行时由浏览器原生 ES Module 加载。**禁止** 引入 bundler 除非明确批准。

### 7. Android MediaStore `<unknown>` 字面量三层清洗
`Cursor.getString()` 对无 TAG 文件返回字面量 `<unknown>`（**不是 null**，`?: ""` 无效），必须显式清洗：
```kotlin
if (artist.equals("<unknown>", ignoreCase=true) || artist.equals("Unknown Artist", ignoreCase=true)) artist = ""
```
三层必须全做：Kotlin MainActivity.scanMediaStore() + .NET LocalServer.FetchLyricAggregate() + 前端 store.js addMediaFromAndroid()。
（LRCLIB 对空 artist 自动走 track-only 搜索，所以 artist 空 = 搜索更宽松）

### 8. Moto XT2401 真机调试铁律（本项目唯一真机）
- **绝对不要 `adb logcat -c`！** Moto 清 buffer 后完全屏蔽 App 日志
- 装机必须 `adb install -r`（覆盖，**不要** `adb uninstall` → 清 IndexedDB 633 首歌没了 → 空库死锁）
- ResolverActivity 绕过：`adb shell input tap 610 2251`（1220×2712 屏 center，已验证）
- 必须 `adb shell pm grant 4 权限`：READ_MEDIA_AUDIO + READ_MEDIA_IMAGES + READ_MEDIA_VIDEO + READ_EXTERNAL_STORAGE

### 9. Android 构建必须在纯 ASCII 目录
项目根含 emoji（🛠️）+ 中文 → JDK 17 `Illegal char <?>` → `ClassNotFoundException GradleWrapperMain`。
构建前必须复制到纯 ASCII 路径：
```powershell
Copy-Item clients\android-{music,player} C:\greenrhino-build\ -Recurse -Force -Exclude build,.gradle
```
然后在 `C:\greenrhino-build\android-{player,music}` 下跑 `gradlew.bat assembleDebug`。

### 10. build-assets.mjs 位置约束
图标光栅化脚本 `build-assets.mjs` 在 `clients/` 下（不是 `scripts/`），CI 里引用路径要对。

### 11. 角色隔离铁律（ISS-20261017-008 / ISS-20261017-009）
音乐（music）和播放器（player）是**两个完全独立的 App**，绝不能混。
- `main.js` 侧栏导航项必须按 `ROLE` 裁剪：player 只留 `home/video/settings`，music 只留 `home/music/playlists/favorites/cloud/settings`
- 拆分代码后，`player.js` 如果从子模块 re-export（如 `EQ_FREQS`），**必须显式 `export { ... }` 透传**，否则 `settings.js` 等下游文件会 SyntaxError
- CSS 禁止用原生 `@import`（`file://` 协议的 Android WebView 下存在兼容性风险），必须**单文件内联**或改 bundler（需批准）
- build-web.mjs 注入 `window.__winRole='video'/'music'` 后，运行时仍需 JS 层二次裁剪（`allowedViews` + `body.win-video/music` class）

---

## 📚 台账系统（成长型·五步闭环）

> 台账目录：`.trae/memory/台账/`
> 核心思想：**随时换电脑，新 AI 进门 30 秒开工**

### 台账文件

| 文件 | 管什么 | 编号规则 |
|---|---|---|
| `context.md` | 🆕 **驾驶舱**：版本/进度/阻塞/最近 5 条动作/常用命令 | 日期戳更新 |
| `decisions.md` | 关键决策（选了啥/为啥/备选/关联/相关坑） | `DEC-YYYYMMDD-NNN` |
| `issues.md` | 踩坑记录（现象/根因/解决/预防/严重度/标签） | `ISS-YYYYMMDD-NNN` |
| `index.md` | 模块索引（改某模块前先查关联坑） | 指针条目 |
| `daily.md` | 每日流水（当天干了啥、改了哪些文件、跑了啥命令） | 日期分行 |
| `.session-memory.md` | **本次会话**临时区（草稿，结束前清空） | - |
| `archive/` | 已沉淀归档（同标签 ≥3 条 + 预防规则落地） | - |

### 五步闭环（每次工作必走）

1. **启动先看**：读 context.md TL;DR → index.md → 扫关联坑 → 提醒用户
2. **改前扫坑**：issues.md 关联文件匹配 → 命中时提醒确认
3. **动作即记**：踩坑/决策立刻写 `.session-memory.md`（别等任务结束）
4. **完成总汇**：口头大白话汇总 + 自动归档进正式台账 + `.session-memory.md` 清空
5. **索引同步**：台账动了 → index.md 跟着更新

### 📈 成长型归类加级

- 每条坑必须带 `#标签1 #标签2` 归类
- 同标签 ≥2 条 → 自动归「🔶 问题群」
- 同标签 ≥3 条 + 预防规则落地 → 移 `📦 archive/`
- 活跃坑的 P0/P1 → 自动写成 `// TODO: [坑标签] 预防：xxx` 注释到关联文件

### 🔬 进程跟踪（本轮新增）

> 每个任务带唯一编号 + 动作清单 + 完成进度

- **格式**：任务编号 → 动作列表 → 每完成一个打 ✅ → 最后汇总
- **触发**：每次用户下达大任务时，先在 daily.md 开任务区块
- **示例**：
  ```markdown
  ## 任务 T20261017-01 设定体系升级
  - [x] A0 基线建立（preflight/test:all）
  - [x] A1 AGENTS.md 瘦身重构
  - [ ] A2 漂移修复
  - [ ] A3 台账优化
  - [ ] A4 小稳修复
  - [ ] A5 回归验证
  - [ ] A6 归档
  - [ ] A7 汇报
  ```

---

## 安全基线

- Android keystore / 证书密码存 GitHub Secrets，**绝不**出现在源码或日志里
- `.secrets.env` 在 `.gitignore` 中，本地临时用
- `assetlinks.json` SHA256 指纹必须从真实 keystore 生成，**不要手写**
- `ffmpeg.exe`（98MB）必须被 gitignore

## 🧑‍💼 用户行为偏好（v16 精简版）

> 1号的行为偏好，换 AI 自动遵守。**三句话总结**：

**① 我只说「同意/否决/改这里」，其他全自动** — 别让我跑命令、改配置、选路径，AI 自己干自己验证，干完汇报。

**② 需要我动手的直接说大白话** — 「插 USB」「点 UI 第3个按钮」「登录」，别绕弯解释为什么，直接说要做啥。

**③ 质量优先不计成本** — 最强最稳方案，不惜工时；代码/台账持续瘦身，新 AI 进门 30 秒能开工。

### 执行细则（3 句话的展开）

| 细则 | 说明 |
|---|---|
| 大白话回复 | 不用术语，一句话就一句话 |
| 不输出运行指令 | `npm run dev`、`adb install -r` 这种 AI 自己执行，别让我跑 |
| 大任务先报理解 | 说清楚我要做啥（脑图格式），我点头了再动手 |
| 不越界 | 跟绿角犀无关的别瞎搞，发现不对直接问 |
| 件件记到查 | 每次任务自动写台账，可追溯 |
| 自动闭环 | 做完 → 归档台账 → 汇报，不用我催 |

---

## 🚀 快速参考（速查表）

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 构建双 PWA 站点 |
| `npm run build:android` | 构建 + 同步到 Android assets |
| `npm run preflight` | 发布前 **18 项** 自动检查 |
| `npm run bump` | 一键版本升级 |
| `npm run test` / `test:all` | 单元 / 单元+E2E |
| `git push origin main` | 推远程 |

### Android 构建速查（铁律 #9 强制 ASCII 路径）

```powershell
Copy-Item clients\android-{music,player} C:\greenrhino-build\ -Recurse -Force -Exclude build,.gradle
Copy-Item release\pwa-site-* C:\greenrhino-build\android-*\app\src\main\assets\pwa\ -Recurse -Force
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\Administrator\Android\Sdk"
cd C:\greenrhino-build\android-player; .\gradlew.bat assembleDebug --no-daemon
```

### 台账导航

`.trae/memory/台账/` → `context.md`(驾驶舱) / `issues.md`(活跃坑) / `decisions.md`(决策) / `index.md`(模块索引) / `daily.md`(流水)

### SKILL 核心 5 个

`.trae/skills/` → frontend-component-spec / code-review-checklist / unit-test-spec / docker-deploy-guide / security-audit-guide
