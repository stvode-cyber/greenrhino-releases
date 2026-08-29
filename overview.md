# 绿角犀播放器 · 离线媒体播放器 — 交付概览

纯前端 PWA（音乐 + 视频双模式，离线优先），原生 ES Module、零构建，由静态服务器托管。

## 品牌标识
| 项 | 值 | 用途 |
|----|----|------|
| 完整名 | 绿角犀播放器 | 网页标题、窗口标题、商店名称、manifest `name` |
| 短名 | 绿角犀 | manifest `short_name`、iOS 主屏图标名（超长会被截断） |
| 代码标识 | `GreenRhino` | C# 命名空间 / 程序集、Xcode 工程名、Gradle 工程名、Android 主题 |
| 应用包名 | `com.greenrhino.player` | Android `applicationId`、iOS Bundle Id、华为 assetlinks |
| 域名占位 | `greenrhino.example.com` | TWA / 华为 PWA 上架用，需替换为真实域名 |

## 已实现功能
- **数据层**：IndexedDB 持久化媒体库（Blob 存储，重启可续播）、播放进度、设置、队列、歌单、收藏、导入记录。事件总线驱动 UI 刷新。
- **音频引擎**：双 `<audio>` 引擎 + Web Audio 图（source→淡入增益→10 段 EQ biquad→analyser→主增益→输出），实现**真交叉淡入**、EQ 预设/自定义、实时频谱、音量/速度。
- **视频引擎**：原生 `<video>`，外挂字幕（SRT→VTT）、**音轨/字幕轨切换**（原生 `audioTracks`/`textTracks`，多外挂字幕按文件名区分、可"关闭字幕"）、画中画、AB 循环、**章节跳转**（载入章节文件，底栏进度条显示可点击节点并高亮当前章）、截图、旋转、比例切换。
- **界面**：侧边栏（媒体库/歌单/收藏/设置）、顶栏（模式切换+搜索+筛选）、媒体库网格（拖拽/选择导入、收藏、空状态引导）、音乐页（专辑图+频谱+滚动歌词+LRC 载入+专辑主色背景）、视频页（画面+控制选项）、常驻底栏（封面/标题/进度/播放/音量/模式）。
- **增强**：播放队列抽屉（拖拽排序/跳转/移除）、Media Session 锁屏控制、PC 快捷键（空格/方向键/M/F/N/P）、LRC 歌词点击跳转、睡眠定时（时长/播完当前曲）、退出续播、搜索筛选、设置（主题/默认音量/续播开关/交叉淡入/EQ/**存储管理**（区分媒体数据/缩略图/进度索引，支持清理缩略图缓存）/**导入记录**（支持移除与重新扫描））。
- **PWA**：manifest + Service Worker（预缓存全部模块/样式/清单，cache-first 离线策略），断网可用、可安装；侧边栏「📲 安装应用」按钮在浏览器触发 `beforeinstallprompt` 时自动出现，支持一键安装，无可安装入口时给出菜单安装引导；**播放模式**（顺序/列表/随机/单曲）持久化，重启后恢复。
- **使用说明**：侧边栏新增「❓ 使用说明」入口，点击打开分章节帮助面板（快速开始 / 导入 / 音乐 / 视频 / 播放控制 / EQ / 睡眠 / 续播 / 安装离线 / 快捷键 / 常见问题），与仓库 `HELP.md` 内容同步。
- **最近播放页**：侧边栏新增「🕒 最近播放」入口，复用续播进度表按更新时间排序展示，卡片底部叠加续播进度条与百分比提示（如「已播 30%」），点击直接续播。
- **视频轨偏好记忆**：切换视频音轨或字幕轨时自动保存到 `settings.trackPrefs`，下次打开同一视频自动套用上次选择（含「关闭字幕」状态）。
- **媒体库多选批量操作**：工具栏新增「☑ 多选」入口，进入选择模式后点击卡片切换勾选；底部浮出「全选 / 已选 N / 加入歌单 / 删除 / 取消」批量操作条，可一键批量加入已有/新建歌单，或批量删除。
- **歌单详情与拖拽重排**：点击歌单卡片打开详情弹窗，列出歌单内曲目；支持拖拽 ≡ 重排顺序、单条移除、一键「播放全部」；重排后自动持久化到 IndexedDB，且歌单卡片页实时刷新。缺失文件标灰提示。
- **底栏播放模式选单**：点击底栏模式标识弹出选单切换顺序/列表循环/随机/单曲循环，切换后持久化；并修复 `mode-menu` 默认始终显示的样式回归。
- **首次启动引导**：`store.js` 默认设置新增 `firstRun`；`main.js` 启动检测为真时弹出欢迎 modal，介绍离线播放核心能力（导入单个/文件夹、音乐 EQ 频谱、视频字幕/音轨/章节、可安装离线），提供「导入媒体」「使用说明」两个 CTA；关闭时持久化 `firstRun:false`，下次启动不再弹出。媒体库空状态已含「导入媒体」入口与之互补。
- **异常态（设计 §12）**：媒体解码失败时弹轻提示「该格式暂不支持」，播放列表内自动跳到下一首不中断；连续坏曲达到队列长度则停止并提示。**文件已丢失**：blob 缺失/为空时媒体卡标灰显示「⚠ 文件已丢失」徽标，提供「重新定位」（重新选文件替换 blob）与「从库移除」；误点播放弹提示并自动跳走，不中断列表。解码失败与文件丢失共用一套队列跳过保护（去重锁 + 连续失败计数），避免 error/lost 重复触发导致多次跳歌或死循环。

## 运行方式
```
cd C:\Users\Administrator\.workbuddy\binaries\node\workspace
C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe serve.mjs
# 浏览器打开 http://127.0.0.1:4173
```
也可使用 `python -m http.server 4173`（简单场景）或 `npm run dev`（需本地可安装依赖的环境）。

## 验证
- **冒烟测试**：`workspace/smoke.mjs` 用系统 Edge（`channel:'msedge'`）做端到端回归，33 项检查连续稳定 33/0、0 console error。
- **真实渲染走查**：`workspace/audit.mjs` 用 canvas+MediaRecorder 生成测试视频、PCM 生成测试音频，注入 IndexedDB 后逐界面截图；验证音乐/视频播放页、字幕加载、**字幕轨切换（双字幕下拉）、章节节点渲染与点击 seek**、设置、队列、移动端布局均正常渲染，0 控制台错误。新增校验：**播放模式切换并刷新后持久化（随机→重启仍随机）**、**触发 `beforeinstallprompt` 后安装按钮显隐**、**CDP 断网后 SW 接管、应用离线完整渲染（底栏/卡片正常）**。

## 已知限制 / 备注
- 本环境 Bash 对项目目录无写权限，`npm install` 无法写入 `node_modules`，故采用零构建方案；`jsmediatags` 由 `esm.sh` CDN 懒加载，离线时仅跳过标签解析。
- iOS Safari 限制见原设计文档（无全盘扫描、无系统级桌面歌词）；本版未做投屏/DLNA 与 ffmpeg.wasm 自动转码。

## 原生客户端（四平台封装）
所有平台共用同一套零构建 Web 应用（PWA），以**纯原生壳**封装，工程位于 `clients/`：

| 平台 | 封装 | 离线能力 | 工程 |
|------|------|----------|------|
| Windows | WebView2 (C# / .NET 8) + 内嵌本地 HTTP 服务 | ✅ 保留 Service Worker | `clients/windows/` |
| Android | Trusted Web Activity (TWA) | ✅ 站点 PWA（需部署 https） | `clients/android/` |
| iOS | WKWebView + 内嵌本地 HTTP 服务（XcodeGen） | ✅ 保留 Service Worker | `clients/ios/` |
| 华为 | AppGallery 上架 PWA（无 GMS，TWA 不可用） | ✅ 站点 PWA | `clients/huawei/` |

一键资源与打包脚本（已实测可运行）：
- `clients/build-assets.mjs`：用 Playwright 将 `favicon.svg` 光栅化为 Android mipmap / iOS appiconset / Windows `.ico` / maskable，并生成 `assetlinks.json` 与 `browserconfig.xml`。
- `clients/copy-web.mjs`：把 web 应用复制到 `windows/wwwroot` 与 `ios/wwwroot`（内嵌服务托管用）。
- 完整构建 / 上架步骤见 `clients/README.md`。

> 注：本沙箱无法编译原生包，以上工程需在本机 / CI 用对应 SDK（.NET 8 SDK / Android Studio / Xcode + XcodeGen / AppGallery 控制台）编译发布。脚本已通过在可写环境运行验证（build-assets 产出 34 个资源文件、copy-web 产出 52 个 web 文件）。
