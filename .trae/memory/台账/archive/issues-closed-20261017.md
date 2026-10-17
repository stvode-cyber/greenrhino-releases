# 已关单问题归档 · 2026-10-17 清理

> 来源：issues.md v2（2026-10-17）
> 归档标准：根因级修复落地 + 预防机制已固化（AGENTS 铁律 / preflight / 单元测试）

---

## 🔶 #android-webview（✅ 2/2 已关单，已沉淀预防）

### ✅ ISS-20260914-002 webkitdirectory 在 WebView 不支持
- 根因：WebView 不实现 HTMLInputElement.webkitdirectory
- 解决：importFolderDialog() 加 feature detection + 降级多文件
- 预防：所有 HTML5 新 API 先 feature detection

### ✅ ISS-20261017-002 Moto adb logcat -c 屏蔽日志
- 根因：Moto ROM 特殊行为
- 解决：冷启动后直接 logcat -d --pid= 抓残留
- 预防：✅ 已固化 AGENTS 铁律 #8

---

## 🔶 #performance（✅ 2/2 已关单）

### ✅ ISS-20261017-010 + ISS-20261017-013 library.js refresh 密集
- 根因：4 个事件启动时同时 fire，IO 并发未防
- 解决：debounce 150ms 入口拦截 + refreshGen 并发守卫
- 预防：双保险已落地

---

## 🔶 #e2e-testing（✅ 2/2 已关单）

### ✅ ISS-20261017-012 playwright SW ready 超时
- 根因：测试时机用 domcontentloaded 早于 SW load 注册
- 状态：非代码 bug，测试用例时机问题

### ✅ ISS-20261017-015 preflight 注释/铁律编号漂移
- 根因：新增检查项后没同步文档声明
- 解决：preflight 14 项 + context 铁律数同步
- 预防：每次改 preflight/铁律数量后同步更新

---

## 🔶 #indexeddb（✅ 2/2 已关单）

### ✅ ISS-20261017-009 music APK TypeError undefined.length
### ✅ ISS-20261017-016 IndexedDB getter 缺兜底
- 根因：store.js 三个 IndexedDB getter 缺 `|| []` 防御性兜底
- 解决：统一加 `|| []` + `.sort()` 也兜底
- 预防：所有 IndexedDB 读操作统一加空值兜底

---

## 🔶 #role-isolation（✅ 3/3 已关单）

### ✅ ISS-20261017-008 main.js allowedViews 裁剪不完整
- player 只剩 'video'，补 'home','video','settings'
- music 缺 'settings'

### ✅ ISS-20261017-009 player.js EQ_FREQS 未 re-export
- settings.js 从 player.js 导入，player.js 必须显式 export 透传

### ✅ ISS-20261017-010 CSS @import file:// WebView 风险
- 回退单文件 style.css

- **预防**：✅ AGENTS 铁律 #11 固化（allowedViews + re-export + CSS + 二次裁剪）

---

## 单独条目（已关单）

### ✅ ISS-20260914-001 index.html 绝对路径 WebView
- build-web 自动重写 + preflight 第 4 项自动验

### ✅ ISS-20261017-001 AGENTS 声明不存在
- 台账 + 4 套 CI 全建

### ✅ ISS-20260913-001 sw.js 硬编码版本号
- 占位符 + 单元测试覆盖

### ✅ ISS-20260910-001 版本号五落点同步
- bump-version 覆盖 5 处 + preflight 18 项

### ✅ ISS-20261017-003 clients/node_modules 嵌套
- preflight 第 13 项自动检测

### ✅ ISS-20261017-004 vite.config.js 残留
- 零构建铁律 #6 固化

### ✅ ISS-20261017-005 HANDOVER.md 路径过期
- 台账系统取代散落文档

### ✅ ISS-20261017-006 Android 构建路径非 ASCII
- ✅ 已升 AGENTS 铁律 #9

### ✅ ISS-20261017-007 Android SDK 路径漂移
- local.properties 已修复

### ✅ ISS-20260903-001 视频黑屏 E4
- L1~L9 九层防线 + ffmpeg 转码

### ✅ ISS-20260908-001 SW CORE 预缓存漏模块
- 补 cast.js/id3.js/lyricFetch.js + 新文件

### ✅ ISS-20261017-011 ResolverActivity tap 坐标
- ✅ 已固化铁律 #8

### ✅ ISS-20261017-014 多处 async 链没 catch
- main.js/music.js 全补 catch

---

**归档后 issues.md 保留活跃坑 ≤ 5 条（ISS-20260904-001 wwwroot.zip + ISS-20261017-008 Gradle 超时网络依赖）**
