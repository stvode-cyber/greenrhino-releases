# 拆分计划：绿角犀 → 绿角犀音乐 + 绿角犀播放器（全平台）

## Context（为什么做）

当前「绿角犀播放器」是**一个应用双模式**：单页 PWA 内同时含音乐/视频，Windows 端已有 Hub 主窗 + 独立音乐/视频窗的多窗口机制，Android/华为/iOS 也共用同一套合一资源。用户认为该设计不合理，决定**彻底拆成两个完全独立的 App**：

1. **绿角犀音乐**：专注音乐（曲库/歌单/收藏/EQ/歌词/频谱/睡眠/在线曲库），**不含任何视频 UI/功能**
2. **绿角犀播放器**：专注视频（字幕/音轨切换/画中画/AB循环/章节/截图/旋转），**不含任何音乐 UI/功能**

用户已确认三项决策：
- **全平台一次拆完**：Web/PWA、Windows 双 exe、Android 双包、华为双条目、iOS 双壳
- **命名**：绿角犀音乐（music）+ 绿角犀播放器（player/video）
- **数据各自独立**：两 App 独立 IndexedDB 存储域，互不可见

**现有可复用基础**（已探明，勿重复发明）：
- `src/main.js:40-44` 已有角色机制 `ROLE = window.__winRole || 'hub'`，`isMusic`/`isVideo` 按角色裁剪页面与侧栏（`allowedViews`），`ROLE==='video'` 加 `win-video` body 类
- `src/store.js:4` `DB_NAME='offline-player'`——改成按角色选 DB 名即可隔离数据
- Windows `MainWindow.xaml.cs:175-177` 已注入 `__winRole`（由 `WindowRole` 枚举驱动）
- `clients/copy-web.mjs` 复制 web 到 windows/ios 的 wwwroot

## 实施步骤

### 1. Web/PWA 拆分（核心，先做）

**1a. `src/store.js`**：`DB_NAME` 按角色隔离（运行时判断，无需构建替换）：
```js
const ROLE = (window.__winRole || 'hub')
const DB_NAME = ROLE === 'music' ? 'gr-music-v1' : ROLE === 'video' ? 'gr-player-v1' : 'offline-player'
```
（`window.__winRole` 由 index.html 注入的内联 script 设置，早于 module 执行，安全）

**1b. `src/main.js`**：删/收敛 hub 专属逻辑。拆后两构建均 `isHub=false`，`home/recent/stats/cloud` 不构建、侧栏只留各自项。`openRoleWindow()`（L75-79）在无 hub 场景纯浏览器下已无跨窗意义，保留无碍（`pages[role]` 不存在时静默），暂不动减少回归面；仅确认 hub 专属 `buildHome/buildRecent/buildStats/buildCloud` 在非 hub 角色下不实例化（现有代码已满足）。

**1c. 新增 `scripts/build-web.mjs`**（或改造 copy-web.mjs，二选一，建议新增独立脚本避免破坏现有桌面流程）：
- 输入：web 根；参数 `--role=music|player`
- 输出：`dist/web/music/`、`dist/web/player/`（或 `release/pwa-site-music/`、`release/pwa-site-player/`）
- 每套生成：
  - `index.html`：`<head>` 注入 `<script>window.__winRole='music'</script>`（在 module script 之前）；title 分别「绿角犀音乐」「绿角犀播放器」；brand 文案同步
  - `manifest.webmanifest`：name/short_name/description 各自（绿角犀音乐/绿角犀播放器），start_url=`/`、scope=`/` 不变
  - `sw.js`：`CACHE` 前缀 `gr-music-v15` / `gr-player-v15`，CORE 列表按角色精简（music 去掉 videoPlayer.js/videoThumb.js 等；player 去掉 music.js/spectrum.js/lrc.js/onlinesearch.js 等——注意 main.js/player.js/store.js 是共享核心，**必须保留**；如某 UI 模块仅被裁剪角色引用，可整体从 CORE 移除）
  - `icons/`：各自图标（复用现有 icon.svg 即可，或按需生成区分色）
  - `src/`：全量复制（角色裁剪靠 index.html 注入的 ROLE 运行时生效，非删文件——删文件会导致 import 缺失崩溃，务必保留共享模块）
- `.well-known/assetlinks.json`：music 站放 `com.greenrhino.music` 指纹，player 站放 `com.greenrhino.player` 指纹（同一 keystore，指纹值相同 `0fec2838…0c77e`）

### 2. Cloudflare Pages 部署（两个独立项目）

- 新项目 **greenrhino-music** → `https://greenrhino-music.pages.dev`（上传 music 站全量）
- 新项目 **greenrhino-player** → `https://greenrhino-player.pages.dev`（上传 player 站全量）
- 根路径部署，避开子路径 scope 坑
- 旧 `greenrhino.pages.dev` 保留（hub 版存档/跳转），不删
- 部署后 curl 验证：manifest / sw.js / assetlinks 均正确

### 3. Windows 双 exe

- 复制 `clients/windows/GreenRhino/` → `GreenRhinoMusic/`、`GreenRhinoPlayer/` 两个独立 csproj（C# 代码量小，直接各自持有，不做链接共享）
- 各 csproj：`AssemblyName`/`Title`/`ApplicationIcon` 各自（GreenRhinoMusic.exe / GreenRhinoPlayer.exe）
- `MainWindow.xaml.cs:175-177`：注入固定 `__winRole`（Music→'music'，Player→'video'）
- **ffmpeg 只 Player 带**（Music 无视频转码，省 ~500MB runtime）——从 csproj 中移除 Music 的 ffmpeg 嵌入项
- `WindowHost.cs`：user-data-folder / LocalServer 端口 / 注册表键按 exe 名区分，防两 exe 共享 IndexedDB origin 与互抢默认播放器
- wwwroot 由 `copy-web.mjs`（或 build-web.mjs）分别复制两份

### 4. Android 双 TWA 包

- `C:\greenrhino-build\android\` 下建 `music/`、`player/` 两套独立 Gradle 工程（复制现有模板）
- 各 `app/build.gradle`：`applicationId`/`namespace` → `com.greenrhino.music` / `com.greenrhino.player`
- 各 `strings.xml`：app_name 绿角犀音乐/绿角犀播放器；app_url/app_host 各自站点
- 各 `AndroidManifest.xml`：asset_statements 对应各自站点；图标各自
- **同一 keystore 签名两包**（同指纹不同包名可共存安装）
- 构建脚本：`gradlew bundleRelease` 出两个 AAB，转 universal APK 两个
- 产物：`dist/GreenRhinoMusic-v15-android-release.aab`、`dist/GreenRhinoMusic-v15-universal.apk`、`dist/GreenRhinoPlayer-v15-*.aab`、`dist/GreenRhinoPlayer-v15-universal.apk`

### 5. 华为双条目

- `clients/huawei/` → 复制为 `huawei-music/`、`huawei-player/` 两套
- 各自 listing：名称（绿角犀音乐/绿角犀播放器）、简介（description-zh.txt 差异化）、privacy.txt、feature-graphic、6 张截图
- 起始 URL：`https://greenrhino-music.pages.dev` / `https://greenrhino-player.pages.dev`
- assetlinks 各自站点部署

### 6. iOS 双 target

- `clients/ios/project.yml`：单工程双 target（GreenRhinoMusic/GreenRhinoPlayer），bundle id `com.greenrhino.music`/`com.greenrhino.player`，各自 Info.plist 显示名
- 资源：**物理分离** `wwwroot-music/`、`wwwroot-player/` 两个文件夹（LocalServer.swift 查找逻辑支持）
- `build-ios.yml`：循环构建两次出两个 IPA
- 产物命名 `GreenRhinoMusic-v15.ipa` / `GreenRhinoPlayer-v15.ipa`

### 7. 文档与产物

- 更新 `clients/出包总览.md`、`交接总结.md`、`clients/build-ios.md`（双工程说明）、`clients/build-huawei.bat`（双条目引导）
- dist 命名 v15（如上）
- 交接总结新增本轮拆分记录

### 实施顺序

1 → 2 → 3 → 4 → 5 → 6 → 7（Web 最先，Windows/iOS/Android 的 wwwroot 都依赖步骤 1 产物）

## 关键改动文件

| 文件 | 改动 |
|---|---|
| `src/store.js` | DB_NAME 按角色区分 |
| `scripts/build-web.mjs`（新增） | 产出两套 web（注入 ROLE、manifest、sw.js、assetlinks） |
| `clients/copy-web.mjs` | 复制目标改为两套 wwwroot（windows 双 csproj、ios 双 target） |
| `clients/windows/GreenRhinoMusic/`、`GreenRhinoPlayer/`（新目录） | 双 csproj 双 exe |
| `clients/windows/GreenRhino/WindowHost.cs` | user-data-folder 按 exe 名区分 |
| `C:\greenrhino-build\android\music\`、`player\` | 双 TWA 工程 |
| `clients/huawei-music/`、`huawei-player/` | 双 listing |
| `clients/ios/project.yml` | 双 target |
| `.github/workflows/build-ios.yml` | 双 IPA 构建 |
| `clients/出包总览.md`、`交接总结.md` | 文档同步 |

## 验证方式

1. **Web 本地**：`python -m http.server` 分别起 music/player 两套 → 打开确认：music 版无视频导航/视频 UI，player 版无音乐 UI；两版各自 IndexedDB（DevTools → Application）DB 名不同（gr-music-v1 / gr-player-v1）；Lighthouse 两版 PWA 项通过
2. **Cloudflare**：curl 两域名确认 manifest、sw.js、assetlinks 各就位；浏览器可安装
3. **Windows**：跑 build-windows.bat 出两个 exe → 双击各自打开、标题/图标/界面正确、只含各自功能；两 exe 数据互不可见
4. **Android**：两 AAB/APK 装同一设备 → 桌面两个图标、各自启动对应站点、数据隔离
5. **华为/iOS**：资料齐备核对（上架动作由用户在各自控制台完成）

## 风险清单

- **模块 import 崩溃**：裁剪必须"运行时角色裁剪"而非物理删共享模块文件（main.js/player.js/store.js 等被两版引用，删文件必崩）；sw.js CORE 精简只减不删共享模块
- **sw.js 旧缓存串桶**：新 CACHE 前缀与旧 `greenrhino-v14` 不同，activate 自动清旧桶；部署后首访网络优先兜底（现有策略）
- **Windows 同源共享**：两 exe 若共用 user-data-folder → 同 origin 同 DB 名会互见数据；必须按 exe 名分目录 + DB 名双保险
- **旧数据孤儿**：拆分后旧 `offline-player` 数据不可见；不自动迁移（用户已选独立）
- **TWA assetlinks**：两站各一条 relation 指向各自 package，避免数组校验歧义
- **Android 双工程**：`local.properties` 的 storeFile 相对路径需各工程可解析（拷贝模板时注意）
- **华为双条目**：简介差异化 + 隐私文案各自独立
- **iOS**：两 wwwroot 必须物理分离，不能引用同一文件夹
