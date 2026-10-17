# 模块索引 · 绿角犀

> 按目录/模块索引台账条目。改某模块前 → 先看这页 → 扫对应坑。
> 最后更新：2026-10-17

---

## 📁 src/（前端源码，零构建 ES Module）

### src/main.js（48KB 应用装配）
- **决策**：DEC-20260909-001（拆双 App，__winRole 运行时裁剪）、DEC-20261017-003（设定体系升级）
- **坑**：ISS-20261017-014（promise 链缺 catch，已补）
- **TODO**：⚠️ 文件过大，未来需拆分

### src/player.js（41KB 播放引擎）
- **决策**：DEC-20260908-001（播放模式分离）、DEC-20260903-001（HEVC 转码）
- **坑**：ISS-20260903-001（视频黑屏 E4，已关单）
- **TODO**：⚠️ 文件过大，未来需拆分

### src/store.js（20KB IndexedDB）
- **决策**：DEC-20260909-001（按 __winRole 选 DB 名 `gr-music-v1` / `gr-player-v1`）
- **坑**：无专属

### src/style.css（73KB 全量样式）
- **决策**：DEC-20260909-001（双主题色）
- **TODO**：⚠️ 文件过大，未来需拆分

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

### scripts/preflight.mjs（14 项发布前检查）
- **决策**：DEC-20261017-002（发布前自动化）、DEC-20261017-003（设定体系升级）
- **坑**：ISS-20261017-015（注释 10→14 漂移，已修）

---

## 📁 server/（Python 后端）

### server/cloud_api.py（16.9KB 单文件，8787 端口）
- **TODO**：⚠️ 单文件过千行，按路由/模型/工具拆分（见 F 任务）
- **坑**：无专属

---

## 📁 clients/（平台壳工程）

### clients/android-music/ + clients/android-player/
- **决策**：DEC-20260914-001（TWA → 原生 WebView）
- **坑**：
  - ISS-20260914-001（index.html 绝对路径）
  - ISS-20260914-002（webkitdirectory 不支持）
  - ISS-20261017-002（Moto adb logcat -c，已验证）
  - ISS-20261017-006（✅ Android 构建 ASCII 路径铁律）
  - ISS-20261017-007（SDK 路径漂移，已修）
  - ISS-20261017-008（Gradle 下载超时）
  - **ISS-20261017-009**（P2 music APK TypeError undefined.length，待挖）
  - **ISS-20261017-010**（P3 player APK refresh 密集 7 次，待加 debounce）
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

---

## 📁 test/

### test/build-sw-cache.test.js（6 条断言）
- **覆盖**：SW 占位符、cache 名格式、双 App 隔离、版本号一致
- **坑**：ISS-20260913-001

### test/e2e/sw-cache.spec.js
- **TODO**：⏳ AGENTS.md 说 E2E 4 条，实际只有 1 个 spec 文件，需补齐

---

## 📁 .github/workflows/（待建立）

- **坑**：ISS-20261017-001（不存在）
- **TODO**：⏳ 建 3 套基础 CI（build-web / test:all / 可选 build-android）

---

## 📁 docs/screenshots/（新建，2026-10-17）

- 64 张历史 PNG 归档至此
- **归类**：审计截图 / 调试图 / 验收图 / 品牌图

---

## 📁 根目录文档（待合并进台账后归档）

| 文档 | 状态 | 去向 |
|---|---|---|
| AGENTS.md | ✅ 保留（项目规则基线） | 根目录 |
| CHANGELOG.md | ✅ 保留（版本史） | 根目录 |
| HANDOVER.md | 📦 已提炼进台账 | archive/ |
| HANDOFF.md | 📦 已提炼进台账 | archive/ |
| 交接总结.md | 📦 已提炼进台账 | archive/ |
| R0.md | 📦 待提炼 | archive/ |
| FD.md | 📦 待提炼 | archive/ |
| overview.md | 📦 待提炼 | archive/ |
| HELP.md | ✅ 保留（用户说明） | 根目录 |
| UI-design.md | ✅ 保留（设计稿） | 根目录 |
| vite.config.js | ❌ 删除（零构建残留） | - |
| ui.xml / ui2.xml | ❌ 删除（调试残留） | - |
| .push.log / install.log | ❌ 删除 | - |

---

## 🔍 快速查询

- 改 `sw.js` → 看 ISS-20260913-001 + ISS-20260908-001
- 改 `scripts/build-web.mjs` → 看 DEC-20260909-001 + ISS-20260910-001
- 改 `clients/android-*` → 看 ISS-20260914-001 + ISS-20261017-002
- 改 `clients/windows` → 看 ISS-20260904-001 + DEC-20260904-001
- 改 `src/player.js` → 看 DEC-20260903-001 + DEC-20260908-001
