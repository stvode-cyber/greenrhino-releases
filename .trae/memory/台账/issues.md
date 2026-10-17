# 踩坑台账 · 绿角犀

> 问题 / 解决 / 根因 / 预防 / 严重度 / 归类标签 / 关联文件
> 编号规则：`ISS-YYYYMMDD-NNN`
> 严重度：P0(阻断) / P1(高) / P2(中) / P3(低)
> 同标签 ≥2 条 → 自动归「🔶 问题群」；≥3 条 + 已沉淀预防 → 移 archive/

---

## 🔶 问题群：#relative-path

> 同类坑 2 条。根因：WebView file:// / PWA 子路径部署时，绝对路径 `/` 解析基准不一致。
> 预防：构建脚本自动重写。

### ISS-20260914-001 index.html 绝对路径 WebView 解析失败

- **严重度**：P0
- **现象**：Android WebView 加载 `file:///android_asset/pwa/index.html` 时，`<link href="/src/style.css">` 被解析成 `file:///src/style.css`（文件系统根）→ CSS 全 404 → 裸 HTML
- **根因**：WebView 把 `/` 当文件系统根，不是 PWA 部署根
- **解决**：正则替换 `(href|src)="/(?!/)` → `$1="./"`，4 处全改
- **关联文件**：`release/pwa-site-music/index.html`、`release/pwa-site-player/index.html`、`clients/android-music/app/src/main/assets/pwa/index.html`
- **预防**：✅ 已加 TODO 进 `scripts/build-web.mjs`（待实施）— build 时自动重写
- **归类标签**：`#relative-path` `#android-webview` `#pwa-deploy`

### ISS-20261017-001 AGENTS.md 声明的台账/CI 不存在

- **严重度**：P0
- **现象**：AGENTS.md 说 `.trae/memory/台账/` 有 6 文件、`.github/workflows/` 有 3 套 CI，实际都不存在
- **根因**：规则先于实现，落地缺失
- **解决**：本次建立台账 + 创建基础 CI workflow（见 decisions.md DEC-20261017-001）
- **关联文件**：`.trae/memory/台账/`、`.github/workflows/`
- **预防**：每月审计 AGENTS.md 声明 vs 实际，发现漂移立刻修
- **归类标签**：`#relative-path`（声明 vs 实际路径漂移） `#governance`

---

## 🔶 问题群：#version-sync

> 同类坑 3+ 条。根因：版本号散落在多处（build-web.mjs / sw.js / installer / package.json），手工同步易漏。
> 预防：单一来源 + 自动同步脚本。

### ISS-20260913-001 sw.js 硬编码版本号

- **严重度**：P0
- **现象**：`sw.js` 源码 `const CACHE = 'greenrhino-v14'` 硬编码，靠 `build-web.mjs` 两条隐式正则 `replace(/'greenrhino-v14'/, ...)` 掩盖；一旦正则失效，release 产物 cache 名变 v14
- **根因**：隐式依赖正则匹配
- **解决**：改显式占位符 `'__SW_CACHE__'`，精确替换；配套单元测试 `test/build-sw-cache.test.js` 6 条断言
- **关联文件**：`sw.js`、`scripts/build-web.mjs`、`test/build-sw-cache.test.js`
- **预防**：✅ 占位符 + 测试覆盖（已落地）
- **归类标签**：`#version-sync` `#sw-cache`

### ISS-20260910-001 版本号三落点不一致

- **严重度**：P1
- **现象**：build-web.mjs 是 v16，但 Android dist 出包还是 v15 命名；`.iss` 安装包文件名也是 v15
- **根因**：版本号硬编码在 3+ 处，手工同步
- **解决**：交接时强调「三落点必须同步」
- **关联文件**：`scripts/build-web.mjs`、`clients/windows/GreenRhino{Music,Player}/*.iss`、`dist/`
- **预防**：⏳ 待做 — `scripts/bump-version.mjs` 一键改三处
- **归类标签**：`#version-sync` `#release`

---

## 🔶 问题群：#android-webview

### ISS-20260914-002 webkitdirectory 在 WebView 不支持

- **严重度**：P1
- **现象**：侧边栏「📁 导入文件夹」按钮，点击无反应
- **根因**：WebView 不实现 `HTMLInputElement.webkitdirectory`；但因没 C# 壳注入 `winRole='music'`，main.js 默认 `isHub=true`，hub 模式会显示该按钮
- **解决**：`index.html` `<body>` 开头 inline script 检测 `'webkitdirectory' in HTMLInputElement.prototype`，不支持则 `display:none`
- **关联文件**：`clients/android-music/app/src/main/assets/pwa/index.html`
- **预防**：✅ 加 feature detection 注释到 `index.html` 源文件（待做）
- **归类标签**：`#android-webview` `#feature-detection`

### ISS-20261017-002 Moto 真机 adb logcat -c 屏蔽 App 日志

- **严重度**：P0
- **现象**：Moto XT2401 上 `adb logcat -c` 清 buffer 后完全屏蔽 App 日志（无论级别）
- **根因**：Moto ROM 特殊行为
- **解决**：冷启动后直接 `adb logcat -d --pid=<PID>` 抓 buffer 残留的 Fatal 级 JS 日志
- **关联文件**：调试流程
- **预防**：✅ 已写进 AGENTS.md 铁律 #8
- **归类标签**：`#android-webview` `#moto-device` `#debugging`

---

## 🔶 问题群：#build-cache

### ISS-20260904-001 wwwroot.zip 不重生成导致内嵌旧前端

- **严重度**：P0
- **现象**：改了 web 源码但 exe 跑的还是旧前端
- **根因**：`wwwroot.zip` 是 csproj 内嵌资源，必须手动重生成
- **解决**：`node clients/copy-web.mjs` 同步 + 重压 zip
- **关联文件**：`clients/copy-web.mjs`、`clients/windows/GreenRhino/wwwroot.zip`
- **预防**：✅ copy-web.mjs 已自动重压；但仍依赖人工记得跑
- **归类标签**：`#build-cache` `#dotnet-publish`

### ISS-20260908-001 SW CORE 预缓存漏模块

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
