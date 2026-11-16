# 模块索引 · 绿角犀

> 按目录/模块索引台账条目。改某模块前 → 先看这页 → 扫对应坑。
> 最后更新：2026-10-21（协作铁律硬约束落地 + 钩子体系 + preflight 21项 + 单元测试 9项）

---

## 📁 src/（前端源码，零构建 ES Module）

### src/main.js（714 行 · 原 1003，三批大重构 -289 行 -28.8%）
- **决策**：DEC-20260909-001（拆双 App，__winRole 运行时裁剪）、DEC-20261017-003（设定体系升级）
- **坑**：ISS-20261017-014（promise 链缺 catch，已补）；变量遮蔽 playItem ctx→sameType（T20261020-04）
- **状态**：✅ 三批全部落地，4 个 B 层模块（context/importManager/bootstrap/playerUtils），无进一步抽取计划

### src/app/（🆕 B 层新增，三批大重构后 4 模块）
- `format.js` — fmtQuota 字节格式化
- 🆕 `context.js` — 共享上下文（ctx.app/pages/ROLE/isHub/isMusic/isVideo/showPage/importOverlay）
- 🆕 `importManager.js` — 导入/定位/进度浮层（~140 行）
- 🆕 `bootstrap.js` — 启动装配/PWA/Media Session/首次引导（~210 行）
- 🆕 `playerUtils.js` — 播放编排/睡眠定时/异常保护/后台暂停（101 行，第三批提取）

### src/player.js（796 行 · 原 856，B 层已抽纯函数到 player/utils.js）
- **决策**：DEC-20260908-001（播放模式分离）、DEC-20260903-001（HEVC 转码）
- **坑**：ISS-20260903-001（视频黑屏 E4，已关单）
- **TODO**：⚠️ 仍偏大，AudioEngine/PlayerEngine 类可进一步拆

### src/player/（🆕 B 层新增）
- `utils.js` — parseChapters / EQ_FREQS / EQ_PRESETS / guessMime / _extOf / _bufToB64 / MIME_BY_EXT

### src/store.js（IndexedDB 持久化 + 事件总线）
- **坑**：✅ ISS-20261017-009（三 getter 缺 || [] 已补）、✅ ISS-20261017-016（同根因拆分已关）、#indexeddb 问题群
- **修复**：2026-10-17 三个 getter 统一加 `|| []` 兜底
- **🆕 dbBatchPut**（T20261020-02 OPT-④）：新增单 transaction 批量写入工具函数，addMediaFiles/addMediaFromAndroid 已改用，633 首导入从 30s→<1s

### src/style.css（944 行 · 单文件）
- **回退**：原 B 层拆成 src/css/ 三层（base 48 + components 455 + role 885），但 Android WebView file:// 协议 @import 兼容性差（ISS-20261017-010），已回退单文件内联
- **SW CORE**：style.css 已进 CORE；src/css/ 三文件保留为构建时参考（build-web.mjs 不再使用）

### src/ui/（15 个组件）
- bottombar.js / library.js / music.js / videoPlayer.js / queue.js / settings.js / favorites.js / playlists.js / recent.js / cloud.js / spectrum.js / gestures.js / dom.js / stats.js / onlinesearch.js
- **决策**：DEC-20260909-001（按角色裁剪显隐）
- **坑**：ISS-20260908-001（SW CORE 漏模块）、ISS-20261017-010（library.js refresh 密集）、ISS-20261017-013（已修 debounce）、ISS-20261017-014（music.js catch 兜底）

### src/videoThumb.js（视频缩略图抽帧）
- **决策**：DEC-20260905-001

---

## 📁 scripts/（构建脚本）

### scripts/build-web.mjs（双 App 拆分核心）
- **决策**：DEC-20260909-001
- **坑**：ISS-20260913-001（SW 占位符）、ISS-20260910-001（版本号三落点）
- **TODO**：
  - ⏳ 自动重写 index.html 绝对路径为相对路径
  - ⏳ 一键同步到 android assets/pwa/
  - ⏳ 版本号 bump 子命令

### scripts/preflight.mjs（21 项发布前检查）
- **决策**：DEC-20261017-002（发布前自动化）、DEC-20261017-003（设定体系升级）
- **坑**：ISS-20261017-015（注释 10→14 漂移，已修）
- **🆕 2026-10-21 扩展**：新增第18项 Android 构建 ASCII 路径警告（铁律#9）+ 第19项 bump-version.mjs 存在性（版本五落点自动化）
- **🆕 配套钩子**：.git-hooks/pre-commit（致命三合一拦截）+ scripts/setup-hooks.mjs（跨平台配置）+ .gitattributes（强制 LF 行尾）

### scripts/setup-hooks.mjs（🆕 2026-10-21 新增）
- **作用**：跨平台（Windows/macOS/Linux）Git 钩子配置脚本（`git config core.hooksPath .git-hooks`）
- **触发**：`npm run postinstall` 自动执行（新 clone 装完依赖钩子自动生效）
- **容错**：非 Git 仓库/CI 环境静默跳过（process.exit 0）
- **坑**：ISS-20261021-001（上一轮 postinstall 写 bash 语法 `\|\| true` → Windows cmd.exe 不认 → exit code 1，已修复）

### 📁 .git-hooks/（🆕 2026-10-21 新增）
- **pre-commit**：致命三合一拦截（规则24）
  - 规则1 私货拦截：*.exe/*.dll/*.bin 未授权二进制 → **拒提交**
  - 规则2 脏内容警告：console.log / // TODO: debug → 警告（可 --no-verify 跳过）
  - 规则3 外发口警告：硬编码 http(s):// 非内网 URL → 警告
- **白名单豁免**：package.json / manifest.webmanifest / assetlinks.json / *.md 自动跳过
- **配置**：`git config core.hooksPath .git-hooks`（setup-hooks.mjs 自动做）

### 📁 .gitattributes（🆕 2026-10-21 新增）
- **作用**：强制 `.git-hooks/pre-commit` 用 LF 行尾（防止 Windows Git 自动转 CRLF 炸 shebang）

---

## 📁 server/（Python 后端）

### server/cloud_api.py（350 行单文件，8787 端口）
- **TODO**：⚠️ 单文件路由+模型+工具混写，拆分目标待定
- **坑**：无专属

---

## 📁 clients/（平台壳工程）

### clients/android-music/ + clients/android-player/
- **决策**：DEC-20260914-001（TWA → 原生 WebView）、DEC-20261017-004（player 壳投屏同步）
- **🆕 player 壳 2026-10-17 投屏补齐**：+DlnaCaster.kt +MediaHttpServer.kt +MainActivity 5 cast 方法 + Manifest 2 条权限
- **坑**：
  - ISS-20260914-001（index.html 绝对路径）
  - ISS-20260914-002（webkitdirectory 不支持）
  - ISS-20261017-002（Moto adb logcat -c，已验证）
  - ISS-20261017-006（✅ Android 构建 ASCII 路径铁律）
  - ISS-20261017-007（SDK 路径漂移，已修）
  - ISS-20261012-008（com.sun 不存在，MediaHttpServer 纯 ServerSocket 绕过）
  - ISS-20261012-011（SSDP 多播 MulticastLock）
  - ✅ ISS-20261017-017（Gradle 下载超时，已固化到铁律 #9）
  - ✅ ISS-20261017-009（music APK TypeError undefined.length，已补 \|\| []）
  - ✅ ISS-20261017-010（player APK refresh 密集 7 次，已加 debounce）
  - **ISS-20261017-011**（✅ ResolverActivity tap 610 2251 已验证）
- **Moto XT2401 真机实测**：✅ music APK 633 首 + player APK 15 视频 全加载 ✅
- **构建铁律**：必须复制到 `C:\greenrhino-build\`（ASCII 路径）再跑 gradlew
- **tap 铁律**：Moto 1220×2712 屏 ResolverActivity 第一项 center = (610, 2251)，已双 APK 验证有效

### clients/windows/（.NET 8 WebView2）
- **决策**：DEC-20260904-001（GPU 软件渲染）、DEC-20260903-001（ffmpeg 转码）
- **坑**：ISS-20260903-001（视频黑屏，已关单）、ISS-20260904-001（wwwroot.zip 重生成）
- **关键文件**：
  - `GreenRhino/MainWindow.xaml.cs`
  - `GreenRhino/LocalServer.cs`（8800 端口）
  - `GreenRhino/ffmpeg.exe`（98MB 勿提交）

### clients/huawei*/ + clients/ios/
- **状态**：⚠️ 待实机验证 / 待上架
- **决策**：DEC-20260914-001（TWA 放弃后，华为走 AppGallery PWA）

### clients/node_modules/（应删除）
- **坑**：ISS-20261017-003

### clients/ 根目录脚本（壳工具链）
- `build-assets.mjs` — 图标光栅化（铁律 #10：在此不是 scripts/）
- `copy-web.mjs` — PWA 产物同步到壳工程 assets/
- `deploy-pwa.mjs` — Cloudflare Pages 部署
- `build-android.bat` / `build-windows.bat` / `build-huawei.bat` — 各壳构建入口
- `capture-shots.mjs` — 自动化截图
- `inspect-dom.mjs` / `inspect-role.mjs` — DOM/角色裁剪调试
- `render-feature.mjs` — 华为上架特性图渲染
- `verify_build.py` / `zip-wwwroot.py` — 构建验证 + wwwroot 打包
- `assetlinks-template.json` — Android assetlinks 模板
- **坑**：无专属，但 build-assets.mjs 路径错会导致 CI 失败

---

## 📁 test/

### test/build-sw-cache.test.js（6 条断言）
- **覆盖**：SW 占位符、cache 名格式、双 App 隔离、版本号一致
- **坑**：ISS-20260913-001

### test/e2e/sw-cache.spec.js（1 个 spec，实际 1 条）
- **现状**：Playwright E2E 只有 SW cache 验证 1 条 spec，AGENTS 声明的 4 条是规划目标
- **坑**：ISS-20261017-012（Playwright SW ready 超时，waitUntil 时机问题）

---

## 📁 .github/workflows/（4 套已建 ✅）

- **ci.yml** — preflight 18 项 + 单元测试 6 条 + build-web 双 PWA
- **build-android.yml** — Gradle assembleRelease（ASCII 路径 workaround 内联）
- **build-windows.yml** — dotnet publish + Inno Setup 打包
- **build-huawei.yml** — AppGallery 上架资产检查
- **坑**：ISS-20261017-001（已解决：AGENTS 声明 vs 实际落地差）

---

## 📁 docs/screenshots/（新建，2026-10-17）

- 64 张历史 PNG 归档至此
- **归类**：审计截图 / 调试图 / 验收图 / 品牌图

---

## 📁 根目录文档

| 文档 | 状态 | 说明 |
|---|---|---|
| AGENTS.md | ✅ 保留 | 项目规则基线（11 条铁律） |
| offline.html | ✅ 保留 | 🆕 自定义离线页（T20261020-02 OPT-③） |
| CHANGELOG.md | ✅ 保留 | 版本史 |
| HELP.md | ✅ 保留 | 用户说明 |
| UI-design.md | ✅ 保留 | 设计稿 |
| 项目进程.md | ✅ 保留 | 🆕 规则21强制：项目根目录进度追踪（v1.2） |
| 项目对话卡.md | ✅ 保留 | 🆕 规则22强制：对话结束出 DC-xx（当前 DC-01 + PLAN-01） |
| ~~HANDOVER/HANDOFF/R0/FD/overview~~ | 📦 已归档 | archive/ 里有提炼版 |

---

## 🔍 快速查询

- 改 `sw.js` → 看 ISS-20260913-001 + ISS-20260908-001
- 改 `scripts/build-web.mjs` → 看 DEC-20260909-001 + ISS-20260910-001
- 改 `clients/android-*` → 看 ISS-20260914-001 + ISS-20261017-002
- 改 `clients/windows` → 看 ISS-20260904-001 + DEC-20260904-001
- 改 `src/player.js` → 看 DEC-20260903-001 + DEC-20260908-001

---

## 📁 .trae/agents/（角色 Agent 定义 · 台账未登记）

> 13 个角色 Agent 定义，用于复杂任务分角色协作，台账之前没登记。

| 文件 | 角色 |
|---|---|
| core/ux-experience-tester.md | UX 体验测试核心 |
| api-doc-writer.md | API 文档 |
| backend-dev.md | 后端开发 |
| code-reviewer.md | 代码审查 |
| devops-engineer.md | DevOps |
| e2e-test-engineer.md | E2E 测试 |
| frontend-dev.md | 前端开发 |
| market-researcher.md | 市场研究 |
| security-auditor.md | 安全审计 |
| self-evolution-engineer.md | 自我进化 |
| test-engineer.md | 测试工程 |
| ux-clarity-auditor.md | UX 清晰度审计 |
| ux-flow-tester.md | UX 流程测试 |
| ux-onboarding-designer.md | UX 引导设计 |

**状态**：这些是辅助角色定义，主工程不需要日常改，但如果新增/修改 Agent 定义要在 daily.md 记录。

---

## 📁 .trae/documents/（历史设计文档 · 台账未登记）

| 文档 | 内容 |
|---|---|
| 2026-09-13-self-evolution-audit-report.md | 自我进化审计报告 |
| 2026-09-14-ux-audit-report.md | UX 审计报告 |
| 双窗口拆分方案.md | 早期双窗口拆分方案（已废弃） |
| 拆分双独立App全平台.md | 双 App 拆分全平台方案（DEC-20260909-001 关联） |

**状态**：历史参考，不活跃。需要时翻 archive/ 一起找。
