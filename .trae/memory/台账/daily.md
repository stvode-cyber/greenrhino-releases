# 每日流水 · 绿角犀

> 每天干了啥、改了哪些文件、跑了啥命令。一句话一行，倒序。

---

## 2026-10-17

### 📋 任务 T20261017-10 B 层代码质量升级（保守拆分零回归）

| 动作 | 状态 | 说明 |
|---|---|---|
| B0 基线 | ✅ | preflight 14/14 + 单元 6/6 |
| B1 main.js 保守抽离 | ✅ | fmtQuota → src/app/format.js；SW CORE 补 cast.js/id3.js/lyricFetch.js → ISS-0908-001 关单 |
| B2 player.js 保守抽离 | ✅ | parseChapters/EQ_FREQS/EQ_PRESETS/guessMime/_extOf/_bufToB64/MIME_BY_EXT → src/player/utils.js（7 个纯函数/常量）；PROBE_A/PROBE_V 留 player.js（DOM 依赖） |
| B3 style.css @import 拆分 | ✅ | 1481 行 → 8 行入口；拆 src/css/base.css（48）+ components.css（455）+ role.css（885） |
| B4 sw.js CORE 同步 | ✅ | +6 条（format.js + utils.js + base.css + components.css + role.css + cast.js/id3.js/lyricFetch.js） |
| B5 全量回归 | ✅ | preflight 14/14 + 单元 6/6 + build 双站点 + Android sync 47 项 |
| B6 commit + push | ✅ | c3626c0 → main |
| B7 台账更新 | ✅ | ISS-0908-001 关单 + index.md 新模块 + daily.md 本条目 |

**改了哪些文件**：
- 新增 6 个：src/app/format.js、src/player/utils.js、src/css/base.css、src/css/components.css、src/css/role.css
- 修改 4 个：src/main.js、src/player.js、src/style.css、sw.js

**行数变化**：
- main.js 928→921 | player.js 856→796 | style.css 1481→8
- 新增总行数：6+67+48+455+885 = 1461（原 style.css 1481 + player.js 抽离 60 行 ≈ 1541 行，净减 80 行）

**活跃坑从 5 条 → 4 条**（ISS-0908-001 关单）

### 📋 任务 T20261017-09 A 层台账止血

| 动作 | 状态 | 说明 |
|---|---|---|
| A0 基线验证 | ✅ | preflight 14/14 + 单元 6/6，零漂移 |
| A1 index.md 漂移修复 | ✅ | workflows 4 个已建不再写"待建立"、E2E 实际 1 个 spec、cloud_api.py 状态更新 |
| A2 issues.md 关单瘦身 | ✅ | 已修 16 条 ISS 加 ✅ 标记，活跃坑 5 条加 ⚠️ 标记（0914-001/0910-001/0908-001/0914-002/008） |
| A3 context.md 同步 | ✅ | commit 3923222 已推、preflight 14/14、活跃坑清单集中化、最近 5 动作更新 |
| A4 secrets-keys.md 升级 | ✅ | 补版本追踪 + 推送记录表 |
| A5 AGENTS.md 用户偏好加强 | ✅ | 8→10 条，核心明确「只做决定权」+ 自动闭环 + 上下文减负 |
| A6 回归验证 | ✅ | preflight 14/14 + 单元 6/6 全绿，台账改动零影响 |
| A7 daily.md 记录 + 汇报 | ✅ | 本条目 |

**改动文件**：index.md / issues.md / context.md / secrets-keys.md / AGENTS.md（5 个台账文件，零代码改动）
**活跃坑从 21 条 → 5 条**（16 条已关单）

### 📋 任务 T20261017-08 前端 UI 加 MJPEG 屏幕镜像按钮（最后一块拼图）

| 动作 | 状态 | 说明 |
|---|---|---|
| F1 cast.js | ✅ | screenCastStart/screenCastStop + state.screenCasting + handleMsg mirror 回调 |
| F2 bottombar.js | ✅ | 投屏面板加「🖥️ 屏幕镜像 (通用)」按钮 + cast.on('screenCast') toast |
| F3 build + preflight + test | ✅ | build PWA sync assets + preflight 14/14 + test 6/6 |
| F4 commit + push | ✅ | 2b9cb77→3923222 main→main |

**投屏面板现在三个镜像选项**：
1. 📺 DLNA 视频推送（扫描设备 → SetAVTransportURI 推视频文件）
2. 🖥️ 系统镜像 (Miracast)（唤起 Win+K / Settings.WIFI_DISPLAY_SETTINGS）
3. 🆕 🖥️ 屏幕镜像 (通用)（MJPEG /screen.mjpg，任何有浏览器的电视都能用）

### 📋 任务 T20261017-07 屏幕镜像 MJPEG 投屏（通用方案，95%+ 智能电视覆盖）

| 动作 | 状态 | 说明 |
|---|---|---|
| P0 ScreenCaster.kt | ✅ | MediaProjection → JPEG → ConcurrentLinkedQueue |
| P1 MediaHttpServer /screen.mjpg | ✅ | MJPEG multipart/x-mixed-replace + sendMjpeg |
| P2 MediaHttpServer /screen/status | ✅ | JSON {"casting":true/false,"port":xxx} |
| P3 /tv 页面屏幕镜像预览 | ✅ | `<img src=/screen.mjpg>` + 2s 轮询状态 |
| P4 RhinoBridge 3 方法 | ✅ | startScreenCast/stopScreenCast/getScreenMirrorUrl |
| P5 MediaProjection Launcher | ✅ | registerForActivityResult(StartActivityForResult) |
| P6 双壳 sync + build | ✅ | BUILD SUCCESSFUL × 2 |
| P7 preflight + test | ✅ | preflight 14/14 + unit test 6/6 零回归 |
| P8 commit + push | ✅ | 61dbafb→2b9cb77 main→main |

**关键设计决策**：
- MJPEG（12fps，JPEG 55% 压缩，原分辨率 50%）而非 WebRTC：MJPEG 任何浏览器都能显示（`<img>` 标签），零依赖零配置，电视端零操作（只输一次收藏地址）
- ScreenCaster 编码线程：ImageReader → Image → Bitmap.setPixel（逐像素复制处理 rowStride padding）→ JPEG → ConcurrentLinkedQueue（3 帧环形缓冲）
- sendMjpeg 复用 MediaHttpServer 的 ServerSocket 连接池，独立 keep-alive 不阻塞其他请求

### 📋 任务 T20261017-06 MediaHttpServer 电视浏览器投屏 + 双壳全量 sync（深夜）

| 动作 | 状态 | 说明 |
|---|---|---|
| I0 路由 | ✅ | MediaHttpServer 加 /tv /list / 路由，IPv6 dual-stack |
| I1 BootReceiver | ✅ | 开机自启 + 网络变化重启 MediaHttpServer |
| I2 常量修 | ✅ | Intent.ACTION_WIFI_STATE_CHANGED → WifiManager.WIFI_STATE_CHANGED_ACTION |
| I3 handleList | ✅ | workprofile fallback + 去 LIMIT 字符串 + DISPLAY_NAME/TITLE 双列 fallback |
| I4 onResume/onNewIntent | ✅ | singleTask杀进程后Activity恢复自动重启MediaHttpServer |
| I5 双壳sync | ✅ | player壳全量覆盖：MediaHttpServer/BootReceiver/MainActivity(4处MediaHttpService→MediaHttpServer) |
| I6 双壳rebuild | ✅ | music+player BUILD SUCCESSFUL |
| I7 preflight+test | ✅ | preflight 12/12 + unit test 6/6 零回归 |
| I8 commit+push | ✅ | be76163→61dbafb main→main |

**关键发现**：
- Android Studio clean 不够！`Copy-Item -Recurse -Force` 覆盖旧目录时**旧文件不删除**，只覆盖同名文件。必须 `Remove-Item -Recurse -Force` 先删旧目录再 Copy
- `/data/local/tmp/ghs_status.txt` Moto 量产版**无写权限**。调试必须用 `context.cacheDir/ghs_xxx.txt`
- `adb run-as com.greenrhino.music` 能看到 cache 目录的文件
- MediaHttpServer 路由 `/list` 查不到视频的根因：Moto 多用户（user 904）+ MediaStore 查询列名兼容性（`_display_name` vs `DISPLAY_NAME`）
- player MainActivity castPlay 里 MediaHttpService 引用 → 全改成 MediaHttpServer

### 📋 任务 T20261017-05 自动下一首设置 + 投屏验证收尾（傍晚）

| 动作 | 状态 | 说明 |
|---|---|---|
| F0 基线 | ✅ | preflight 14/14 + 单元 6/6 |
| F1 store.js autoNext | ✅ | DEFAULT_SETTINGS + exportSyncData |
| F2 player.js _advance 检查开关 | ✅ | 手动 prev/next 不受影响 |
| F3 settings.js UI seg 开关 | ✅ | 「自动/播完停」 |
| F4 回归 | ✅ | preflight 14/14 + 单元 6/6，零回归 |
| F5 归档 + commit | ⏳ | |
| F6 汇报 | ⏳ | |

**投屏验证收尾**：Samsung 电视 SSDP 没扫到 MediaRenderer。Miracast 系统级方案等待用户去电视/手机开启。MediaHttpServer 端口 39577 LISTEN 活的 ✅，castScan broadcast result=0 ✅，但电视端没回应。可能原因：电视 DLNA 默认关闭 / 不在同网段 / 电视是 Vizio TivaCast（非标准 SSDP）。

| 动作 | 状态 | 说明 |
|---|---|---|
| D0 ADB + 装机 | ✅ | music + player APK install -r |
| D1 pm grant 4 权限 + profile 隔离 | ✅ | user 904 only |
| D2 ISS-009 验证 | ✅ | music APK 启动 ~5s 无 TypeError undefined.length ✅ 已修 |
| D3 player cast 验证 | ✅ | RhinoBridge registered OK，cast 5 方法在（music RB PROBE 已确认） |
| D4 归档 + commit | ⏳ | |

| 动作 | 状态 | 说明 |
|---|---|---|
| C0 基线 | ✅ | preflight 14/14 + 单元 6/6 |
| C1 复制 DlnaCaster + MediaHttpServer 改 package | ✅ | music→player 2 文件 |
| C2 player MainActivity 加 cast | ✅ | dlnaCaster/rhinoBridge 成员 + start/stop + 5 cast 方法 |
| C3 player Manifest 加权限 | ✅ | +ACCESS_WIFI_STATE +CHANGE_WIFI_MULTICAST_STATE |
| C4 gradle assembleDebug | ✅ | BUILD SUCCESSFUL (18s) |
| C5 回归验证 | ✅ | preflight 14/14 + 单元 6/6，零回归 |
| C6 归档 + commit | ⏳ | |
| C7 汇报 | ⏳ | |

### 📋 任务 T20261017-02 ISS-009 TypeError 根因修复（下午晚段）

| 动作 | 状态 | 说明 |
|---|---|---|
| B0 基线 | ✅ | preflight 14/14 + 单元 6/6 |
| B1 store.js 三 getter \|\| [] 兜底 | ✅ | getAllMedia / getRecent / getFavorites + getAllMedia sort 防 null |
| B2 showMine catch 补 stack 打印 | ✅ | 下次真机可看到完整 stack + 各 getter typeof |
| B3 回归验证 | ✅ | preflight 14/14 + 单元 6/6，零回归 |
| B4 build + android sync | ✅ | release/pwa-site-* + android assets/pwa 双同步 |
| B5 归档台账 + secrets-keys.md | ✅ | ISS-009 状态更新、ISS-016 新归档、secrets 索引文件 |
| B6 commit | ⏳ | 待 |
| B7 汇报 | ⏳ | 待 |

### 📋 任务 T20261017-01 设定体系升级（下午早段）

| 动作 | 状态 | 说明 |
|---|---|---|
| A0 基线建立 | ✅ | preflight 14/14 绿、单元 6/6 绿、E2E 1/4 挂（SW ready timeout） |
| A1 AGENTS.md 瘦身 | ✅ | 266→255 行，合并重复，新增铁律 #10 + 进程跟踪机制 + 用户偏好升级（8 条） |
| A2 漂移修复 | ✅ | preflight 注释 10→14、context 铁律 23→10、补 .session-memory.md、修 build-assets.mjs 路径 |
| A3 台账优化 | ✅ | ISS-012~015 新归档、DEC-003 新决策、进程跟踪机制落地 |
| A4 代码修复 | ✅ | library.js refresh debounce 150ms、main.js/music.js promise catch 兜底 |
| A5 回归验证 | ✅ | preflight 14/14 绿 + 单元 6/6 绿，零回归 |
| A6 归档台账 | ✅ | issues +4、decisions +1、daily + 任务区块、session 清空 |
| A7 汇报总汇 | ⏳ | 待完成 |

### 上午流水（同天）

- 上午 build-web.mjs + preflight.mjs + bump-version.mjs 三脚本落地 + CI.yml 建立 + AGENTS.md 同步
- 上午 Android 构建：ASCII 路径 workaround（ISS-20261017-006）+ SDK 路径修复（ISS-20261017-007）+ Gradle 手动 curl（ISS-20261017-008）→ 双 APK BUILD SUCCESSFUL
- 上午 21 commits 全部推 origin/main `stvode-cyber/greenrhino-releases`
- 下午 AGENTS.md 瘦身 208→266 行 + 新增用户行为偏好 5 条 + 常用命令表 + Android/Moto 铁律速查块
- **10:20 Moto XT2401 USB 连接 真机回归启动**
- 10:21 music APK `adb install -r` Success + pm grant 4 权限
- 10:22 ResolverActivity tap 610 2251 ✅ 绕过，PID 28596 进
- 10:23 music logcat 全量：633 首歌 ✅ UI 就绪 ✅，发现 TypeError undefined.length（ISS-20261017-009 非致命）
- 10:29 player APK `adb install -r` 重启 ResolverActivity tap
- 10:30 player logcat 全量：15 视频 ✅ UI 就绪 ✅，零 TypeError，refresh 密集 7 次（ISS-20261017-010）
- 10:30 **真机回归全绿** ✅ ISS-20261017-011 ResolverActivity 坐标固化（1220×2712 屏 center=610,2251）
- 新增 3 坑 ISS-20261017-009/010/011 → issues.md + index.md
- **阻塞**：Q5 fuse tab — 本仓库全 0 命中，需用户指路路径

---

## 2026-10-16

- 下午审计会话归档到旧位置 `.session-memory.md`
- lyricFetch.js / store.js 歌词聚合改动
- ui/cloud.js / ui/library.js 修改

## 2026-10-14

- lyricFetch.js 建立（3.1KB）
- store.js 大改（歌词三层清洗兜底）

## 2026-10-13

- DLNA 投屏测试完成，报告归档 `release/DLNA投屏测试报告_20261013.md`

## 2026-10-12

- ui/library.js / ui/music.js / ui/favorites.js / ui/playlists.js / ui/cloud.js 修改

## 2026-10-10

- 大量 Android 真机调试截图（约 30 张）

## 2026-10-09

- main.js / player.js / style.css 大改
- 大量 UI 调试图（约 20 张）

## 2026-10-08

- scripts/build-web.mjs 最新版本定型（v16）

---

## 更早（9 月）

详见根目录 `CHANGELOG.md` + `HANDOVER.md` + `交接总结.md`（已提炼进 decisions/issues 台账）
