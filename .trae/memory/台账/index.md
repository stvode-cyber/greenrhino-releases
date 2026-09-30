# 🗂️ 台账索引 index.md

> 按模块归类，找决策/找坑最快的入口。
> 指向 [decisions.md](decisions.md) / [issues.md](issues.md) / [context.md](context.md) / [daily.md](daily.md) 中的具体条目。
>
> 🆕 **台账文件 6 个**：context.md（驾驶舱）/ decisions.md（决策）/ issues.md（坑）/ daily.md（每日流水）/ index.md（本索引）/ .session-memory.md（会话临时）

---

## 🔶 高频问题群 TOP（成长型自动归群）

| 问题群标签 | 活跃坑 | 归档坑 | 严重度 | 详见 issues.md 第几段 |
|---|---|---|---|---|
| `#android-webview` 🔥 | 2 | 2 | 🔴 P0 | P0 活跃坑第一段 |
| `#relative-path` 🔥 | 1 | 1 | 🔴 P0 | P0 活跃坑第一段 + 归档区 |
| `#twa-gms` | 2 | 0 | 🔴 P0 | P0 活跃坑第二段 |
| `#gradle-directory` | 0 | 2 | 🟠 P1 | 归档区第一段 |
| `#playwright-mirror` | 0 | 1 | 🟡 P2 | 归档区（已提升 user shared） |

---

## 📁 src/ — 前端源码

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| 整体架构 | DEC-20260909-002（原生 ES Module 零构建） | ISS-20260914-001（资源路径相对路径）、ISS-20260914-010（webkitdirectory feature detection）、🔥ISS-20260916-003（WebView 绝对路径白屏） |
| library.js | — | ISS-20260914-006（refresh 并发去重） |
| main.js | — | ISS-20260915-002（video role 同步 data-theme） |
| player.js | — | — |
| store.js（IndexedDB） | — | — |
| sw.js | DEC-20260913-001（cache 占位符） | ISS-20260913-001（硬编码版本号漂移） |

---

## 📁 scripts/ — 构建工具

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| build-web.mjs | DEC-20260909-001（双 App 按角色裁剪）、DEC-20260913-001（cache 精确替换） | ISS-20260913-001（隐式正则不可靠）、🔥ISS-20260916-003（regex 同步改相对路径） |
| build-assets.mjs | — | — |
| copy-web.mjs | — | ISS-20260914-005（PWA 改完忘重跑） |

---

## 📁 clients/android-* — Android 壳

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| 整体方案 | DEC-20260914-001（TWA → WebView 原生壳） | ISS-20260914-002（错依赖 LauncherActivity）、ISS-20260914-003（GMS 缺失） |
| assetlinks.json | — | ISS-20260914-004（占位符域名） |
| Huawei 上架 | — | ISS-20260914-007（截图比例不达标） |
| index.html 资源路径 | DEC-20260914-002（相对路径） | ISS-20260914-001（绝对路径 WebView 404）、🔥ISS-20260916-003（相对路径 regex） |
| console→logcat 桥接 | — | — |
| HANDOVER.md 交接文档 | DEC-20260914-005（新增） | — |
| themes.xml 缺 Launcher 子主题 | — | ISS-20260914-012（AAPT 资源链接失败）📦 |
| build.gradle UTF-8 BOM | — | ISS-20260914-011（Gradle 启动失败）📦 |
| build.gradle assets 目录 | — | ISS-20260916-001（copyPwaAssets 去标准目录）📦 |

---

## 📁 clients/windows/ — Windows 壳

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| 双 EXE 端口隔离 | — | ISS-20260914-005（PWA 改完忘重打包）📦 |
| publish.ps1 脚本 bug | — | ISS-20260914-013（csproj 路径错）📦、ISS-20260914-014（dotnet 不在 PATH）📦 |

---

## 📁 clients/huawei-music — 华为端

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| AppGallery 上架 | 走 PWA 上架而非 TWA（缺 GMS） | ISS-20260914-007（截图比例）📦 |

---

## 📁 server/ — Node LocalServer

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| auth middleware | — | ISS-20260914-009（koa-connect wrapper ctx 泄漏）📦 |

---

## 📁 .trae/ — AI 工作台

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| UX Agent 体系 | DEC-20260914-003（4 Agent 分工 + 执行型） | — |
| 审计报告模板 | — | — |
| **台账系统**（本目录） | DEC-20260914-004（5 文件 + 会话层 + 用户共享层 + **五步闭环 + 成长型归类**） | — |

---

## 📁 .github/workflows/ — CI

| 模块 | 关键决策 | 踩过的坑 |
|---|---|---|
| workflow 清理 | — | ISS-20260914-008（废弃 workflow 留红叉）📦 |

---

## 🆔 role 命名备注（写条件分支时必看）

- music 站点 __winRole = `'music'` → 🎵 绿角犀音乐
- player 站点 __winRole = `'video'` → 🎬 绿角犀播放器（**内部代号 video，不是 player**）
- 关联坑：ISS-20260915-001 📦

---

## 🔗 用户级共享台账（跨项目通用）

- **跨项目通用坑**：`%userprofile%/.trae-cn/memory/shared-issues.md`
- **跨项目通用决策**：`%userprofile%/.trae-cn/memory/shared-decisions.md`
- 当前项目已提升：ISS-20260914-015（#playwright-mirror）→ shared-issues GS-0xx

---

## 📊 台账健康度

| 指标 | 值 |
|---|---|
| 活跃决策 | 8 条 |
| 活跃坑 | 11 条（P0: 5 / P1: 5 / P2: 1） |
| 归档坑 | 12 条 |
| 活跃问题群 | 3 个（#android-webview 🔥、#twa-gms、#relative-path 🔥） |
| 归档问题群 | 3 个（#gradle-directory、#playwright-mirror、#harmonyos-install） |
| 最后更新 | 2026-09-30 |
