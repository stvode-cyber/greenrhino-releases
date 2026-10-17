# 决策台账 · 绿角犀

> 关键决策记录：选了啥 / 为啥 / 备选方案 / 关联文件 / 相关坑
> 编号规则：`DEC-YYYYMMDD-NNN`

---

## DEC-20260909-001 拆双 App（音乐 / 播放器）

- **日期**：2026-09-09
- **决策**：从「合一单应用」拆成两个完全独立 App
  - 绿角犀音乐（music）`com.greenrhino.music` 主题绿 `#00D8A6`
  - 绿角犀播放器（player）`com.greenrhino.player` 主题琥珀 `#FFB03A`
- **原因**：用户明确要求；产品定位清晰化
- **备选方案**：单 App + 模式切换（被否决，无法精准定位）
- **落地方式**：`build-web.mjs` 按角色裁剪输出到 `release/pwa-site-{music,player}/`；运行时靠 `index.html` 注入 `window.__winRole`
- **关联文件**：`scripts/build-web.mjs`、`src/main.js`、`src/store.js`、`release/pwa-site-*/`
- **相关坑**：ISS-20260913-001（SW cache 占位符）
- **副作用**：共享模块（main.js / player.js / store.js）不物理删除，避免静态 import 崩溃

---

## DEC-20260914-001 TWA → 原生 WebView 壳（Android）

- **日期**：2026-09-14
- **决策**：放弃 TWA，改用 Kotlin 原生 WebView 壳，PWA 资源打包进 APK `assets/pwa/`
- **原因**：TWA 强依赖 GMS / Chrome；华为机型无 Google 框架，TWA 启动回退到浏览器失去独立 App 感
- **备选方案**：TWA + bubblewrap（被否决，依赖 GMS）；继续 PWA 站点（被否决，无桌面图标入口）
- **收益**：完全离线 + 真 App 感（无 URL bar）+ 不依赖 Chrome
- **代价**：APK 从 0.24MB 涨到 3.44MB（含 Kotlin 运行时 + 34 个 PWA 资源）
- **关联文件**：`clients/android-music/app/src/main/java/com/greenrhino/music/MainActivity.kt`、`clients/android-music/app/src/main/assets/pwa/`
- **相关坑**：ISS-20260914-001（index.html 绝对路径）、ISS-20260914-002（webkitdirectory 不支持）
- **后续**：华为上架走 AppGallery PWA 方案（见 `clients/huawei/README.md`）

---

## DEC-20260908-001 播放模式分离

- **日期**：2026-09-08
- **决策**：音乐/视频播放模式各自独立保存
  - 音乐默认 `loop`（列表循环）
  - 视频默认 `order`（顺序，单集播完即停）
- **原因**：视频用户大多看完就换，循环反直觉；音乐反之
- **关联文件**：`src/player.js`、`src/store.js`（`playModes` 字段）
- **相关坑**：无

---

## DEC-20260904-001 GPU 软件渲染默认开

- **日期**：2026-09-04
- **决策**：Windows WebView2 默认 `--disable-gpu`，`--gpu` 命令行开关可切回
- **原因**：Intel Arc + 向日葵虚拟显示器下硬件渲染花屏（曾因此返工）
- **备选方案**：硬件渲染 + 检测（被否决，不可靠）
- **关联文件**：`clients/windows/GreenRhino/MainWindow.xaml.cs`
- **相关坑**：ISS-20260903-001（视频黑屏链 L1~L9）

---

## DEC-20260903-001 HEVC 内置 ffmpeg 转码

- **日期**：2026-09-03
- **决策**：内置 `ffmpeg.exe`（98MB 嵌入资源）懒释放到 `%TEMP%\GreenRhino\ffmpeg.exe`，HEVC/10bit → H.264
- **原因**：HEVC 视频在 WebView2 静默失败（`videoWidth=0` 但音频推进），无法解码
- **备选方案**：让用户装 Microsoft Store HEVC 扩展（被否决，体验差）；ffmpeg.wasm（被否决，性能差）
- **检测时机**：`loadedmetadata` 后 `videoWidth===0` 立即转码（不再等 2.5s 看门狗）
- **去重**：同一文件并发请求合并（字典缓存）
- **关联文件**：`clients/windows/GreenRhino/ffmpeg.exe`、`src/player.js` `_startTranscode`、`MainWindow.xaml.cs`
- **相关坑**：ISS-20260903-001（视频黑屏 E4 关单）

---

## DEC-20260905-001 视频缩略图自动抽帧

- **日期**：2026-09-05
- **决策**：无封面视频后台 seek 抽帧（宽 ≤320px JPEG）写 IndexedDB `thumbnails` store
- **串行队列**：`queueVideoThumbs(list)` 串行处理避免解码器过载
- **失败处理**：HEVC 解不了 / 10s 超时 → 标 `failed` 不再重试
- **作用域**：**仅对 blob 视频**，外部打开（localPath）跳过
- **关联文件**：`src/videoThumb.js`、`src/ui/library.js`
- **相关坑**：无

---

## DEC-20261017-001 建立台账系统

- **日期**：2026-10-17
- **决策**：落地 `.trae/memory/台账/` 6 文件，把 HANDOVER/HANDOFF/R0/FD/交接总结/overview 的存量知识一次性提炼归档
- **原因**：AGENTS.md 声明的台账系统只有文档没有实体，新 AI 进门找不到北
- **备选方案**：继续用散落的多个文档（被否决，信息孤岛 + 上下文压力大）
- **关联文件**：`.trae/memory/台账/*`、`AGENTS.md`
- **相关坑**：待发现
- **后续动作**：旧文档保留作为历史参考，但所有新记录只进台账

---

## DEC-20261017-002 发布前自动化：preflight + bump

- **日期**：2026-10-17
- **决策**：新建 `scripts/preflight.mjs`（14 项检查）+ `scripts/bump-version.mjs`（一键改版本）
- **原因**：手工核对 AGENTS.md 发布检查清单（9 项）易漏；版本号三落点（APP_VERSION + 双 cache 桶 + .iss）手工同步易错
- **备选方案**：靠人工 review（被否决，历史上曾因此出 v14→v15 漏更新）
- **落地效果**：preflight 覆盖 sw 占位符、cache 隔离、版本三落点、Android 同步、manifest 主题色、assetlinks 包名、ffmpeg 存在、clients/node_modules 嵌套、release 产物完整性
- **关联文件**：`scripts/preflight.mjs`、`scripts/bump-version.mjs`、`scripts/build-web.mjs`
- **相关坑**：ISS-20260910-001（版本号三落点）、ISS-20261017-003（clients/node_modules 嵌套）
- **CI 接入**：`.github/workflows/ci.yml` 已把 preflight 作为必跑项

---

## DEC-20261017-005 播放完自动下一首设为默认关闭

- **日期**：2026-10-17
- **决策**：`autoNext: false` 设为默认值，用户可在设置页开关切换
- **原因**：用户明确要求「一个视频播放完就停止，不要自动播放下一个」。当前代码硬编码 `_advance(true)` 自动下一首，没开关
- **备选方案**：改播放模式默认值（被否决，playMode 控制的是 loop/shuffle，和自动下一首是两个概念）
- **改动**：
  - `store.js DEFAULT_SETTINGS` 加 `autoNext: false` + `exportSyncData` settings 加字段
  - `player.js` 启动从 settings 读 `player.autoNext` + `_advance(auto)` 检查开关（关时 auto 触发的 advance → 直接 pause + emit('ended')，手动 prev/next 不受影响）
  - `settings.js` UI 加 seg 开关「自动/播完停」
- **落地效果**：preflight 14/14 + 单元 6/6 零回归；老用户升级后因 DB settings 里没有 autoNext 字段，DEFAULT_SETTINGS 的合并逻辑自动给 false → 默认播完停
- **关联文件**：`src/store.js`、`src/player.js`、`src/ui/settings.js`
- **相关坑**：无

## DEC-20261017-004 Android player 壳投屏同步（DlnaCaster + MediaHttpServer）

- **日期**：2026-10-17
- **决策**：把 music 壳已验证的 DLNA 投屏代码完整同步到 player 壳（2 新文件 + MainActivity 大改）
- **原因**：music 壳投屏 2026-10-13 真机 curl 验证通过，但 player 壳（同源码、同前端 UI）完全没投屏代码——Cast 按钮点了会报错"投屏需在原生客户端中使用"
- **备选方案**：只加前端 UI 不做后端（被否决，前端已有 UI）；只做 SSDP 发现不做 SOAP（被否决，无意义）
- **改动**：
  - 复制 `DlnaCaster.kt`（242 行）+ `MediaHttpServer.kt`（236 行）到 `com.greenrhino.player` 包，改 package 声明
  - player MainActivity：+dlnaCaster/rhinoBridge 成员变量 + MediaHttpServer start/stop + RhinoBridge 5 个 cast 方法（castScan/Play/Stop/Pause/Mirror）+ JSON import
  - player AndroidManifest：加 ACCESS_WIFI_STATE + CHANGE_WIFI_MULTICAST_STATE 两条权限
- **落地效果**：player APK assembleDebug BUILD SUCCESSFUL，preflight 14/14 + 单元 6/6 零回归
- **关联文件**：`clients/android-player/.../MainActivity.kt`、`DlnaCaster.kt`、`MediaHttpServer.kt`、`AndroidManifest.xml`
- **相关坑**：ISS-20261012-011（MulticastLock）、ISS-20261012-008（com.sun 不存在）

## DEC-20261017-003 设定体系升级：AGENTS 瘦身 + 进程跟踪 + 漂移修复

- **日期**：2026-10-17
- **决策**：一次完成 AGENTS.md 重构 + 台账系统升级 + 代码小稳修复
  - AGENTS.md：266→255 行，删底部重复技术栈/Android 铁律代码块，合并速查表；新增铁律 #10（build-assets.mjs 位置）
  - 台账：加进程跟踪机制（任务编号 + 动作清单 + 完成进度），写进 AGENTS.md 台账系统章节
  - 漂移修复：preflight 注释 10→14、context.md 铁律 23→10、补 `.session-memory.md`、修 build-assets.mjs 路径声明
  - 代码修复：library.js refresh 加 debounce 150ms（ISS-20261017-010/013）、main.js/music.js promise 链加 catch（ISS-20261017-014）
- **原因**：上一轮（2026-10-17 上午）落地台账后发现多处设定漂移；AGENTS.md 有重复段落增加上下文负担
- **备选方案**：先只修代码不动设定（被否决，设定漂移是根因级问题）；只改 AGENTS.md 不碰代码（被否决，ISS-013/014 是实锤 bug）
- **落地效果**：preflight 14/14 绿、单元测试 6/6 绿、零回归
- **关联文件**：`AGENTS.md`、`scripts/preflight.mjs`、`.trae/memory/台账/*`、`src/ui/library.js`、`src/main.js`、`src/ui/music.js`
- **相关坑**：ISS-20261017-010/011/012/013/014/015

---

## 模板（新决策复制此块）

```markdown
## DEC-YYYYMMDD-NNN 标题

- **日期**：
- **决策**：
- **原因**：
- **备选方案**：
- **关联文件**：
- **相关坑**：
```
