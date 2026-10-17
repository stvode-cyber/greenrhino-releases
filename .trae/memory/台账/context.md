# 项目驾驶舱 · 绿角犀（GreenRhino）

> **TL;DR**：新 AI 进门 30 秒上手。每次任务前必读。
> 最后更新：2026-10-17

---

## 🎯 当前状态

| 项 | 值 |
|---|---|
| **版本** | `v16`（`scripts/build-web.mjs` 的 `APP_VERSION`） |
| **SW cache 桶** | `gr-music-v16` / `gr-player-v16` |
| **双站** | https://greenrhino-music.pages.dev / https://greenrhino-player.pages.dev |
| **包名** | `com.greenrhino.music` / `com.greenrhino.player` |
| **主题色** | 音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A` |
| **当前卡点** | Android 真机（Moto XT2401）回归测试未完成；player APK 待构建 |
| **Preflight** | ✅ 14/14 全绿（每次发布前必跑） |
| **单元测试** | ✅ 6/6 全绿 |
| **CI** | ✅ `.github/workflows/ci.yml` 已落地 |
| **本地仓库状态** | 工作树干净，4 commits（efcb31e / f6a18e1 / 2df9bf9 / 352f958），未推远程 |

---

## 🗺️ 活跃工程 vs 废弃工程

| 状态 | 目录 | 说明 |
|---|---|---|
| ✅ 活跃 | `src/`、`scripts/`、`server/`、`clients/windows/`、`clients/android-music/`、`clients/android-player/` | 主力开发 |
| 🟡 搁置 | `clients/ios/` | 缺 Apple 开发者账号，TODO 时捡 |
| ⚠️ 废弃 | `clients/huawei/`、`clients/assets/` | 标注废弃 README，后续清理 |
| ✅ 已归档 | `.trae/memory/台账/archive/` | HANDOVER/HANDOFF/R0/FD/交接总结/overview 等旧文档 |

---

## 🚀 常用命令（新三招）

| 命令 | 作用 |
|---|---|
| `npm run build` | 构建双 App PWA 站点 |
| `npm run build:android` | 构建 + 同步到 Android assets/pwa/ |
| `npm run preflight` | 发布前 14 项自动化检查（全绿才敢发） |
| `npm run bump` | 一键递增版本号（APP_VERSION + 双 cache 桶 + .iss） |
| `npm run test` / `npm run test:all` | 单元测试 / 单元+E2E |

---

## 🚨 当前阻塞

1. **Android 真机回归**：Moto XT2401 USB 断开未重连（2026-09-14 遗留）
2. **player APK 未构建**：music 已构建，player 镜像改造完成但未构建
3. **远程仓库未推送**：当前 main 分支本地领先 4 commits

---

## 📏 已定规则（22 条铁律，违反 = P0 Bug）

详见 [AGENTS.md](../../../AGENTS.md)。关键提炼：

1. 版本号三落点一致：`build-web.mjs APP_VERSION` + `sw.js cache 桶名` + `installer 文件名`
2. SW 占位符 `'__SW_CACHE__'` 禁止硬编码版本号
3. 双 App cache 桶严格隔离（`gr-music-v16` ≠ `gr-player-v16`）
4. 主题色、包名、assetlinks.json 严格对应
5. `src/` 零构建，禁引入 bundler
6. Android MediaStore `<unknown>` 字面量三层清洗（Kotlin/.NET/前端）
7. Moto 真机调试：不要 `adb logcat -c`、装机必须 `install -r`、必须 `pm grant 4 权限`
8. 改 web 必须重跑 `clients/copy-web.mjs` 重压 `wwwroot.zip`（否则 exe 内嵌旧前端）
9. ffmpeg.exe（98MB）在 `clients/windows/GreenRhino/`，勿删勿提交

---

## 🕐 最近 5 条动作（2026-10-17 一轮密集治理）

| Commit | 内容 |
|---|---|
| 352f958 | `chore: player.js 补模块级 TODO 分拆计划` |
| 2df9bf9 | `feat(ci): 建立 GitHub Actions CI + clients 废弃工程标注` |
| f6a18e1 | `feat(build): build-web.mjs 自动重写绝对路径 + Android 同步 + preflight + bump` |
| efcb31e | `feat(governance): 建立台账系统 + 根目录治理 + AGENTS.md 同步` |

---

## 🔗 关键工具全路径（都不在 PATH）

| 工具 | 路径 |
|---|---|
| dotnet 8 | `C:\greenrhino-tools\dotnet\dotnet.exe` |
| Inno Setup | `C:\greenrhino-tools\Inno Setup 6\ISCC.exe` |
| JDK 17 | `C:\greenrhino-tools\jdk17` |
| Android SDK | `C:\Users\Administrator\.android-sdk` |

---

## 📚 台账导航

- [context.md](./context.md) — 你在这里
- [decisions.md](./decisions.md) — 7 个决策 + 2 个新决策（DEC-20261017-001 建立台账、DEC-20261017-002 preflight+bump）
- [issues.md](./issues.md) — 9 个坑 + 4 个新坑（ISS-20261017-001~005），3 个问题群
- [index.md](./index.md) — 模块索引（改某模块前先查这里）
- [daily.md](./daily.md) — 每日流水
- [archive/](./archive/) — 7 份旧文档已归档
