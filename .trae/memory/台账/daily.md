# 每日流水 · 绿角犀

> 每天干了啥、改了哪些文件、跑了啥命令。一句话一行，倒序。

---

## 2026-10-17

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
