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
