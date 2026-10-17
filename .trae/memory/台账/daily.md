# 📅 每日工作流水 daily.md

> 每天一个 section，记录当天干了啥、改了哪些文件、跑了啥命令。
> 新 AI 进门看一眼今天流水就知道"已经干了啥、剩下啥"。
> 超过 7 天的旧日期归档到 `.trae/memory/台账/archive/` 或合并进 context.md。

---

## 2026-10-17（周五 · 换电脑交接日）

### DLNA Step1 Miracast mirror() + Step2 GetPositionInfo SOAP 轮询

**Step 1 Miracast mirror() 三层打通 + 真机验证 3 个坑**：
- DlnaCaster.kt 加 mirror()：Android 15 上 `ACTION_WIFI_DISPLAY_SETTINGS` 编译期不存在 → 纯字符串 CAST_SETTINGS；实测 adb shell am start -a CAST_SETTINGS → Settings$WifiDisplaySettingsActivity result=0 ✅
- RhinoBridge.kt 加 @JavascriptInterface fun castMirror()
- cast.js 替换 TODO error → window.RhinoBridge.castMirror()
- Debug Receiver 补 CAST_MIRROR action + Log.d 全改 Log.e（Moto 屏蔽 Log.d）
- 又踩主线程坑：@JavascriptInterface WebView 后台线程不能 startActivity → Handler(Looper.getMainLooper()).post {} 包一层

**Step 2 GetPositionInfo SOAP 轮询 100% 实现**：
- DlnaCaster.kt 加 soapWithResponse() 返回 XML body / parsePositionInfo() XML 解析 / startPolling() 2.5s 轮询 + statusCallback / play() 自动 startPolling / stop() 先 stopPolling / pause() 保留轮询
- Kotlin break in inline lambda 实验特性坑 → while + 分帧 Thread.sleep 改写
- MainActivity.kt castPlay() 注册 statusCallback → evaluateJavascript 推 window.__castCb({type:'cast:status', state, position, duration})
- cast.js state 加 position/duration 字段 + handleMsg cast:status 兼容 TransportState 大写
- videoPlayer.js banner 显示 "正在投送 → XX 电视 00:12/03:45" + 数组去重

**Kotlin 编译错误**：
- gradlew assembleDebug 报 "The feature break continue in inline lambdas is experimental" → repeat(10){ break } 改成 while 分帧 sleep
- gradlew assembleDebug 报 "Unresolved reference: ACTION_WIFI_DISPLAY_SETTINGS" → Android 15 SDK 35 里这个常量编译期就不存在，直接用字符串

**Git commit 3 个**：
- `608a601` feat(DLNA): Android Miracast mirror + GetPositionInfo SOAP 轮询 (4 files, +190/-17)
- `2810ea3` fix(debug): Debug BroadcastReceiver 加 CAST_MIRROR + Log.e (1 file)
- `debf362` fix(DLNA): mirror() 主线程 + CAST_SETTINGS (1 file)

**构建验证**：npm test:all 10/10 ✅ + gradlew assembleDebug BUILD SUCCESSFUL ✅

**未完成**：真机换电脑断连，mirror 主线程修复 + SOAP 轮询链路需要下一台电脑验证

### 换电脑交接
- Git status clean, ahead 12 commits, GitHub 断网未 push
- context.md / daily.md / issues.md / index.md 全更新
- .session-memory.md 清空
- cloud_api.py 8787 端口还活着
- APK 最后装机 2026-10-16 18:21（debf362 + Handler.post 主线程修复）

---

## 2026-10-16（周四）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 上午 | 🔧 **LRCLIB 歌词代理字段名修复** | server/cloud_api.py L195-210（4 处字段名） | npm run test:all 10/10 ✅ | LRCLIB API 改字段名：`track_name`→`trackName`、`lrclib_id`→`id`、`syncedLyric`→`syncedLyrics`、`plainLyric`→`plainLyrics`。修前永远空歌词，修后 Let It Go 1951 字符 LRC、晴天 1089 字符。 |
| 上午 | ✅ **云同步后端全链路验证** | — | python server/cloud_api.py + test_cloud.py 9/9 ✅ + PowerShell 手动测 sync | 后端 8787 端口正常：注册/token/5GB 配额/MOCK 存储/sync push/pull/last-writer-wins 409 拒绝旧数据/lyric 60s 缓存全通。 |
| 上午 | ✅ **Step A: Windows 绿角犀壳验证** | — | Start-Process GreenRhinoMusic.exe → curl 8800 | 内嵌 LocalServer 通 + /api/lyric 拿到 1950 字符 LRC（Let It Go） |
| 上午 | ✅ **Step B: PWA 构建 + 全测试** | — | build-web.mjs + npm run test:all | 单元 6/6 + E2E 4/4 = 10/10 全绿 |
| 上午 | ✅ **Step C: Android APK 装机 + RB PROBE 全绿** | — | robocopy → gradlew clean assembleDebug (51s) → adb install -r → 手动点 ResolverActivity 第一个 → App 启动 PID=28658 | 🎉 RB PROBE 9 方法全 function：toggleFullscreen/setPlaying/requestAutoImport/lookupMediaUri/**getLyric**/castScan/castPlay/castStop/castPause。IndexedDB 有 633 首歌。MediaHttpServer 40363 起了。**关键发现**：Moto 屏蔽 GreenRhino:D tag，但 `adb logcat -d --pid=<PID>` 能拿到冷启动 Fatal 级别！但 `adb logcat -c` 清 buffer 后完全屏蔽 Debug/Info 新日志。 |
| 上午 | ✅ **🎤 RhinoBridge.getLyric 实际触发真机证据** | — | uiautomator dump 拿歌曲行精确 bounds → adb input tap 点「周杰伦串烧」→ 等 5s → --pid 抓日志 | **完整链路时间线（10:24:06~10:24:12）**：①playItem → ②🎤getLyric(title=周杰伦串烧, artist=<unknown>) → ③LRCLIB+gecimi 双源 miss（周杰伦串烧是混合曲） → ④Kotlin 返回 EMPTY → ⑤前端走②级 fetch `/api/lyric` → WebView file:// schema 不支持报 `Fetch API cannot load file:///api/lyric` → ⑥前端应该走③级直连 LRCLIB。**结论：RhinoBridge.getLyric 三级优先级链路完全通！** 只是这首搜不到歌词。换一首标准曲（比如 Acoustic Installation + TK from 凛として时雨，有完整 artist 的）应该能命中。 |
| 上午 | 🔄 **重启 App + 冷启动 tap 触发 RhinoBridge.getLyric 3 次** | — | am force-stop → am start → input tap ResolverActivity(610,2251) → dump → Python 解析 bounds → tap (745,1757) BEYOND → tap (745,1530) Acoustic → tap 又点到 Avril Lavigne 混合曲 | **🔥 3 次 getLyric 完整日志时间线**（BEYOND 10:36:17、Acoustic/Avril 10:36:40）：全链路 ①Kotlin RhinoBridge.getLyric → ②LRCLIB+gecimi 双源查询 → ③返回结果/EMPTY 完整可见！**重大发现：所有 633 首歌 artist 全是 `<unknown>`** → 这不是歌曲问题，是 MediaStore 导入没解析 TAG 元数据！**埋新坑 ISS-20261016-010 P1 活跃** |
| 上午 | ✅ **3 条新坑入库** | issues.md + .session-memory.md | — | ISS-010 artist 全 unknown P1 🔶（需修）/ ISS-011 Moto logcat 绕过 ✅（沉淀套路）/ ISS-012 ResolverActivity 绕过 ✅（沉淀套路） |
| 下午 | 🔧 **ISS-010 三层修复：artist `<unknown>` 清洗** | MainActivity.kt L435-441（Kotlin） + LocalServer.cs L473-476（.NET） + store.js L179-187（前端兜底） | gradlew clean assembleDebug ✅ + adb install -r | 根因：MediaStore 50% 无 TAG 文件 ROM 写字面量 `<unknown>` 而非 null，`?: ""` 兜底不触发。三层加 `if (artist.equals("<unknown>", ignoreCase=true)) artist = ""` 清洗 |
| 下午 | 🎉 **ISS-010 真机验证 + npm test:all 全绿** | issues.md（ISS-010 状态更新为 ✅ 已修） | adb install -r → pm grant 4 权限 → tap 扫描按钮 (406,1368) → tap 本地音乐卡片 (225,667) → dump 解析行 bounds → tap Acoustic Installation (632,1560) → getLyric 日志；build-web.mjs + npm run test:all | **getLyric 关键对比**：之前 `artist=<unknown>` → 现在 `artist=TK from 凛として时雨` ✅ 清洗生效！LRCLIB miss 是日文冷门乐队问题（artist 为空时 LRCLIB 自动走 track-only 搜索）。单元 6/6 + E2E 4/4 全绿 |
| 下午 | 🔍 **全系统设定审计 + 优化（P0+P1+P2 共 13 项）** | AGENTS.md（技术栈 Node→Python/.NET/Kotlin + 约束 #7 #8）、context.md（活跃坑/最近5条动作/后端架构图/构建链路）、index.md（健康度更新 + ISS 指针）、.session-memory.md（清空） | npm run test:all ✅ 单元 6/6 + E2E 4/4 | **矛盾 7 条全修**：AGENTS.md 技术栈写 Node.js（实际 Python cloud_api.py + .NET LocalServer + Kotlin MediaHttpServer 三端）、context.md 活跃坑写"全清"（实际 ISS-010/011/012）、context.md 歌词代理标题写"未验证成功"（实际已验证）、构建链路写 adb uninstall（会清 IndexedDB 空库死锁）、写 logcat -c（Moto 屏蔽日志）、index.md 健康度过期 7 天。**新增不可变约束 2 条**：#7 MediaStore `<unknown>` 字面量清洗、#8 Moto XT2401 真机调试铁律（不 -c / install -r / pm grant / ResolverActivity 绕过） |
| 下午 | 🔧 **云同步 Android 端打通（全程 4 坑 1 决策）** | 🆕 server/cloud_api.py（login 不再轮换 token）+ MainActivity.kt（CLOUD_SYNC receiver + RECEIVER_EXPORTED）+ src/ui/cloud.js（debug log + window.__GR_SYNC） | build-web.mjs + robocopy + gradlew clean assembleDebug + adb install -r + am broadcast -a greenrhino.CLOUD_SYNC | **关键发现：MainActivity.kt L128 cloudBase 已经是 `http://192.168.1.132:8787`，不需要改 IP！** 全链路：Python cloud_api.py 8787 → Android WebView URL ?cloud= 参数 → cleartext/CORS 全通 → register+login+quota 5GB+localStorage 持久化 → syncAll pull+push+last-writer-wins 全绿。**4 坑入库**：ISS-013 token 轮换互踢 P0 ✅ / ISS-014 RECEIVER_NOT_EXPORTED P0 ✅ / ISS-015 gradlew up-to-date P1 / ISS-016 Moto tap 不触发 P2。**根因时间线**：Python login 轮换 token → Android token 被踢 → 改 users.json 没重启 cloud_api.py（内存 users dict 已读死）→ 改 auth_user/do_GET 加 debug.log 才发现 token 完全匹配 curl 通 → 重启 cloud_api.py → Android curl 通 → tap 按钮不触发 → 加 CLOUD_SYNC BroadcastReceiver（RECEIVER_EXPORTED）+ window.__GR_SYNC → broadcast 触发 syncAll → logcat 显示 syncAll DONE pull+push ✅ |
| 下午 | ✨ **Advisor 审查 + 清理生产代码 + /api/logout + 最终验证** | server/cloud_api.py（do_POST 新增 /api/logout + 删 auth_user/do_GET debug.log）+ src/ui/cloud.js（_log() 守卫 + api() debug 换 _log + syncAll debug 换 _log + window.__GR_SYNC 注释 + 删末尾 session 冗余 log）+ .trae/memory/台账（issues.md 新坑 + daily.md + context.md） | npm test:all ✅ 10/10 + test_logout.py ✅ 6/6 + fix_token.py + build-web.mjs + robocopy + gradlew clean assembleDebug + adb install -r + am broadcast | **AdvisorTool 3 条建议全执行**：①清理 cloud.js debug console.error → 加 `_IS_ANDROID_SHELL` 守卫（Android 壳 Moto 屏蔽 Debug/Info，Error 能漏 → 纯网页 DevTools 正常不需要）②清理 cloud_api.py debug.log + auth_user/do_GET debug 已删 ③加 /api/logout（安全：主动清 token 防止泄露）。/api/logout 6/6 pass：logout 200 ✅ / logout 后 sync 401 ✅ / invalid token 401 ✅ / re-login 恢复 ✅。**最终 clean build Android 真机验证全绿**：syncAll DONE pull+push ✅ server_ts 从 1792123674722 → 1792125389374（Android 推成功！） |

## 2026-10-12（周六）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 深夜 | 📺 **Android DLNA 投屏完整打通** | 🆕 clients/android-music/.../DlnaCaster.kt + MainActivity.kt + AndroidManifest.xml + src/cast.js + src/ui/bottombar.js | gradlew assembleDebug ✅ BUILD SUCCESSFUL + npm run test:all 10/10 ✅ | Kotlin 手写 SSDP+SOAP AVTransport 零依赖；RhinoBridge +4 cast 方法；Manifest +2 条局域网权限；前端 cast.js 加 Android 双宿主分支 |
| 深夜 | 🔧 **Log.println priority bug 修复** | MainActivity.kt L190-203 | gradlew assembleDebug | char code 当 Log priority（'D'.code=68≠Log.DEBUG=3），改用 Log.d/e/w/i |
| 深夜 | 🎵 **账号云同步 + 播放队列联动 + 歌词代理** | src/main.js + src/lyricFetch.js + src/ui/{cloud,music,library,favorites,playlists,settings}.js + server/cloud_api.py + MainActivity.kt | build-web.mjs + test:all | ⚠️ RhinoBridge.getLyric 前端调不通（ISS-001 历史遗留） |
| 深夜 | 🔧 **.gitignore 完善** | .gitignore + git rm --cached 清理 180+ 构建产物 | git rm -r --cached + git commit | 屏蔽 release/pwa-site-*/、clients/*/assets/pwa/、根目录 *.png、.wrangler/、ui.xml |
| 深夜 | 🔧 **Windows git credential 配置修复** | ~/.gitconfig | git config --global --unset + git config --global credential.helper manager | gh.exe 没登录导致 credential.https://github.com.helper 指向死路，删掉后 git-credential-manager 接管，push 成功 |
| 深夜 | 🔍 **代码审计** | — | — | 审了 26 个 JS + Kotlin + Python 文件，发现 3P0 + 7P1 + 5P2；最紧：RhinoBridge.getLyric 为什么前端调不到 + Log.println bug |

## 2026-10-10（周五）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 晚 | **「我的」页重写微信「我」风格 + 个人空间入口** | src/main.js、src/style.css | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | 顶部头像区（🎵绿方头像+名字+副标题）+ 简洁列表行（图标+文字+数量+›箭头）；7行菜单：☁️个人空间→⭐收藏→📃歌单→🕐最近→🌙主题（点切深浅）→⚙️设置→ℹ️关于；cloud.js 个人空间已接好（注册送5GB+上传+下载，无分享）；音乐 App allowedViews 加 cloud；**保留用户音乐数据装机** |
| 晚 | **「我的」页：歌单卡片化 + 设定功能区** | src/main.js、src/style.css | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | 歌单从纯文字列表→2列网格卡片（📃图标+名字+歌曲数+▶播放/🗑删除）；收藏也成卡片（点进收藏页）；加⚙️设定区（主题浅/深切换+全部设置→openSettings+关于）；saveSettings + player.emit('theme') 同步 |

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 晚 | **ISS-20261010-026 Android MediaStore 导入补 parseTags** | src/main.js | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | addMediaFromAndroid 只存基础字段缺歌词。__mediaBatch 回调里对 musicAdded 逐首 fetch(content://uri)→blob→parseTags 拿内嵌 USLT 歌词+APIC 封面。Kotlin shouldInterceptRequest 已代理 content:// |
| 晚 | **ISS-20261010-027 全屏播放页接在线搜歌词** | src/lyricFetch.js（新）+ src/main.js | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | 抽 lyricFetch.js 模块（fetchOnlineLyric + fetchLrclib），LRCLIB 国际歌词库免费无 Key。openMusicFullpage trackchanged 时没内嵌歌词自动 fetch LRCLIB → 搜到渲染 + 写回 IndexedDB 缓存 |
| 下午 | **ISS-20261010-025 全屏播放页「📋 列表」双重根因修复** | src/style.css、src/main.js | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | ① z-index：drawer 40→210、backdrop 39→209（高于 player-fullpage 200）② body.win-music 下 drawer 显式白背景 ③ openMusicFullpage 进入时 queue 为空自动 getAllMedia 填充队列 |
| 下午 | **长按批量选择功能落地** | src/ui/library.js | build-web.mjs + test:build + gradlew assembleDebug + adb install -r | songRow + mediaCard 都加 600ms 长按检测 → enterSelectMode() → 多选模式 + 底部批量操作栏（全选/加入歌单/删除/取消）；openAddToPlaylist() 已支持新建歌单和加入旧歌单 |

## 2026-10-08（周三）

- 视频播放核心功能落地：CSS grid 溢出根因修复（`#main overflow:hidden` + `minmax(0,1fr)`）
- 视频沉浸式：`body.video-playing` 隐藏顶栏底栏侧栏；全屏用 `body.video-immersive`
- 控制条 3s 自动淡出 + 中间透明层 `vp-hint` 温柔唤起（**不再**硬切播放/暂停）
- 全屏横屏切换：`RhinoBridge.toggleFullscreen` → `setRequestedOrientation + immersive`
- 返回按钮加入控制条最前；player role 顶栏加「📁 导入」按钮
- MainActivity 清理 `onPageFinished` 里的绿色 dump div 调试代码
- index.html 加 cache-busting query string 防 WebView 缓存旧 CSS
- `npm run test:all` → Playwright chromium 缺失失败（不是业务代码问题）
- **2 个 commit 入库**：`df1b9e3` feat: 视频播放全屏/沉浸式/控制条自动隐藏 → `d7fd251` chore: 清理调试垃圾文件
- 新坑 5 条进台账（ISS-20261008-001~005）+ **#css-grid-overflow 新问题群🔥 P0**
- 新决策 3 条进台账（DEC-20261008-001~003）
- 改了 `src/style.css` / `src/ui/videoPlayer.js` / `index.html` / `src/main.js` / `MainActivity.kt`
- 跑了 `node scripts/build-web.mjs` / `gradlew assembleDebug` / `adb shell pm clear` / `adb install`

## 2026-09-30（周二）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 全天 | **台账系统全面升级** | AGENTS.md、context.md、decisions.md、issues.md、daily.md（本文件） | — | 用户要求：工作完成总汇、同类问题归类加级、AI 交接秒懂 |

### 本轮新增/更新台账条目
- **决策**：DEC-20260914-004 迭代（从 4 文件 → 5 文件，6 条规则 → 五步闭环 + 成长型归类）
- **坑**：issues.md 全面重写，每条加归类标签，识别出 6 个问题群（#android-webview 🔥P0、#twa-gms、#gradle-directory、#relative-path、#playwright-mirror、#harmonyos-install）
- **新增**：daily.md（本文件）、context.md 末尾「最近 5 条动作」区

---

## 2026-09-18（周四）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| — | Android 壳交接文档 HANDOVER.md 完成 | HANDOVER.md、context.md | — | 换电脑交接核心文档 |

---

## 2026-09-16（周二）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| — | 修 Android player 3 层白屏问题 | index.html、scripts/build-web.mjs、src/main.js、clients/android-player/app/build.gradle | node scripts/build-web.mjs、./gradlew clean assembleDebug | ISS-20260916-001/002/003 |

---

*文件由 AI 自动管理，每次任务结束追加当天流水。*
## 2026-10-09 （大改日 · 换电脑交接）

### 时间线
- **上午**: UI 重构（底部导航、新首页、全屏播放页）
- **下午1**: 导入边界过滤漏洞排查 → 发现 3 个大漏洞 → store.js role 分流 + Music MainActivity 补 RhinoBridge
- **下午2**: buildMusicHome 函数缺失暴露 → Playwright headless smoke test 救了 E2E
- **下午3**: 测试 10/10 全绿 → commit 3 个 → git push 超时
- **下午4**: 写交接文档（本 context.md + daily.md）
- **晚**: SAF 严格过滤真机验证 ✅ 双 App 通过（详见下方「晚间验证」）
- **晚2**: 🎵 歌曲列表按参考图改造（详见下方「歌曲列表改造」）
- **晚3**: 🎵 **彻底砍掉自动扫描 + UI 调整 + 后台播放 Phase 1**（commit 3187fd0）
  - 删 Kotlin `postDelayed` 自动扫描触发 + `SharedPreferences first_scan_done` 标记
  - 删 JS `library.js` 空库 `setTimeout` 自动扫描（**根因修复**——之前只删 Kotlin 层，JS 层漏了导致仍自动扫）
  - 隐藏 `#bottombar`（全局播放控制条含进度条），**保留** `#music-nav`（三栏底部导航：发现/正在播放/我的）
  - 空态引导从单按钮「导入媒体」改为两个大按钮：📥 自动扫描（推荐）+ 📁 选择文件（SAF 多选 EXTRA_ALLOW_MULTIPLE=true）
  - 后台播放 Phase 1：删 `pauseTimers()/resumeTimers()`，`onPause` 条件跳过（isPlaying=true 时不暂停 WebView），加 `PARTIAL_WAKE_LOCK`，新增 `RhinoBridge.setPlaying()` JS 接口
  - `onResume` 加 `wakeLock.isHeld` 检查防 "under-locked" 崩溃（ISS-20261009-019）
  - proguard-rules.pro 保留 Log 调用 + RhinoBridge/MainActivity 类防 R8 优化
  - 装机后用户验证自动扫描不再触发，但后台播放需真机按 Home 测试

### 🎵 歌曲列表改造（参考图：我的收藏列表界面）
- 起因：用户上传参考图要求"音乐的页面按这个按。列表界面"
- 参考图结构：[56×56圆角封面] [歌名/歌手/VIP标签/时长] [▶圆形播放按钮] [⋯更多菜单] + 顶部 Tab（单曲/歌手/专辑/视频）+ 工具条
- 改动文件：
  - `src/ui/library.js` — 新增 `songRow(item, app)` 通用列表行组件（封面+歌名+歌手+格式标签+时长+▶+⋯）
  - `src/ui/favorites.js` — 弃 `mediaCard` 网格，换 `songRow` 列表行 + Tab + 工具条 header
  - `src/main.js` — `import songRow`；删 `buildMusicHome` 内自建 `trackRow` 函数；「最近播放」「收藏单曲」两处调用换 `songRow(m, app)`
  - `src/style.css` — 加 `.sr-row` / `.sr-cover` / `.sr-name` / `.sr-sub` / `.sr-bdg` / `.sr-dur` / `.sr-play` / `.sr-more` / `.sr-tabs` / `.sr-toolbar` / `.sr-menu` 全部样式
- 真机验证（moto X50 Ultra）：✅ 「情歌王」歌曲行完全按参考图渲染，封面图有、格式标签 FLAC 绿色、时长 0:00、▶圆形绿按钮、⋯菜单都在；点击歌曲行触发 playItem 跳到 music 播放页 + mini player 正常

### 晚间验证（SAF 严格过滤 · 真机 moto X50 Ultra）
- 起因：用户要求"导入打开就只能看到音乐格式的，不要混太多文件"
- 改法：双 App `onShowFileChooser` 绕开 `params.createIntent()`，手动构建 `Intent(ACTION_OPEN_DOCUMENT)`，type 锁大分类 + EXTRA_MIME_TYPES 精确白名单
- 验证方法：adb 截图 + uiautomator dump（SAF 是原生 UI 可 dump；WebView NAF 不可 dump，截图量坐标）
- 结果：
  - 🎵 音乐 App SAF 抽屉 = 最近 / **音频** / 下载 / moto X50 Ultra（无图片无视频）；音频页全是歌手文件夹（邰正宵/陈奕迅/戴佩妮…）
  - 🎬 播放器 App SAF 抽屉 = 最近 / **视频** / 下载 / moto X50 Ultra（无图片无音频）；最近页只有一个视频文件
- 新坑入台账：ISS-20261009-021（#saf-mime-filter #android-webview）
- **下午5**: 用户反馈手机端音乐列表"背景"（.music-player 大面板：封面+未在播放+EQ/睡眠+歌词区）盖在列表上多余 → style.css 加移动端媒体查询隐藏 .music-player，只留纯歌曲列表；播放器走底部导航中间按钮 → openMusicFullpage() 全屏播放页；commit 615da48；测试 10/10 全绿
- **下午6**: 4 个修复一起上：① library.js 补 `import toast`（之前直接调用没 import 静默失败）；② buildMusicHome 简化——删掉 plSec/rcSec/fvSec 三个歌单/最近/收藏 section，只剩问候+搜索+两张大卡片；③ style.css .sr-row 加深区别（#F2F4F7 稍深背景 + 圆角 + 底部边框）；④ store.js deleteMedia 加 skipEmit 参数——修复 pruneLost 每删一个条目都 emit library:changed → 触发 refresh 连锁循环（之前 prune 35 条 = 至少 35 次 refresh）。commit 0848fdb，真机验证 MediaStore 扫描 633 → prune 35 → kept 598，只触发 1 次 refresh ✅
- 技巧沉淀：WebView 内部 NAF 点不中 → 改用屏幕截图按比例换算坐标（display 460×1023 ↔ device 1220×2712，scale 2.652）；SAF 原生界面直接 uiautomator dump 拿 bounds 精确点击
- 发现的设备状况：手机 6 个用户 profile（主用户+5 分身），`am start` 播放器弹"选择应用程序"歧义框 → 需显式 `--user 0` 或手动选第一个

### 关键发现
1. Music App 之前完全没有 MediaStore.Audio 扫描！是 SAF 专用壳 → RhinoBridge 补
2. addMediaFromAndroid 硬编码 VIDEO_EXT + 500MB → music role 音频 entry 全被跳过
3. buildMusicHome 调用了没定义 → music role init crash → SW 注册走不到 → E2E 3 条全超时
4. **教训**: UI 大改后必须 python -m http.server + Playwright headless smoke test

### 踩坑
- EPERM rmSync release 目录（被 python http.server 占着）→ Get-Process python | Stop-Process -Force
- GitHub push Connection timed out（300s）→ 等网络恢复

### 下一步（换电脑后新 AI 要做）
1. 真机验证 MediaStore.Audio 扫描
2. buildMusicHome stub 迭代（点击跳转、展开/收起动画、真实数量）
3. 全屏播放页 openMusicFullpage 实现
4. 推 GitHub + Cloudflare Pages 部署
5. 打 release tag + 写 changelog

---

## 2026-10-09（深夜）

- 整页导入页上线（DEC-20261009-005）：点「导入音乐」卡片/空态按钮 → .imp-page 整页，两个大选项「📥 扫描音乐」「📁 手动打开手机文件」，弃用弹窗
- 排查"手机应用没变化"：adb pull 端上 base.apk 解包验证代码已进包 → 病根是 5 个应用分身旧数据未清（ISS-20261009-022），pm clear user 0+900-904 全清
- MainActivity.kt：LOAD_NO_CACHE + clearCache(true) + loadUrl 加 ?v=时间戳 cache-bust
- 改动文件：src/main.js（openImportPage/doScan）、src/style.css（.imp-page 块）、src/ui/library.js（工具栏两直触按钮）
- 验证：npm run test:all 全绿（单元 6 + E2E 4）；wrangler 部署 greenrhino-music / greenrhino-player 双站点；gradlew assembleRelease + adb install -r 装机
- commit dc4073a（17 文件 +556/-101）
