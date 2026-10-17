# 项目驾驶舱 · 绿角犀（GreenRhino）

> **TL;DR**：新 AI 进门 30 秒上手。每次任务前必读。
> 最后更新：2026-10-17

---

## 🎯 当前状态

| 项 | 值 |
|---|---|
| **版本** | `v16` |
| **SW cache 桶** | `gr-music-v16` / `gr-player-v16` |
| **双站** | https://greenrhino-music.pages.dev / https://greenrhino-player.pages.dev |
| **包名** | `com.greenrhino.music` / `com.greenrhino.player` |
| **主题色** | 音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A` |
| **Preflight** | ✅ 14/14 绿 |
| **单元测试** | ✅ 6/6 绿 |
| **CI** | ✅ `.github/workflows/ci.yml` |
| **远程** | ✅ main 分支已推送 `https://github.com/stvode-cyber/greenrhino-releases.git` |
| **双 APK（今天新鲜的）** | 🎵 music 3.49MB 10/17 10:13 · 🎬 player 3.47MB 10/17 10:10 |
| **当前卡点** | Moto XT2401 USB 未连接 → 真机回归无法进行 |

---

## 🚀 常用命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 构建双 App PWA 站点 |
| `npm run build:android` | 构建 + 同步到 Android assets/pwa/ |
| `npm run preflight` | 发布前 14 项自动化检查（全绿才敢发） |
| `npm run bump` | 一键版本升级 |
| `npm run test` / `npm run test:all` | 单元测试 / 单元+E2E |

## 🔧 Android 构建铁律（**必须执行**）

```powershell
# 1. 在纯 ASCII 路径构建（路径不能含中文/emoji）
Remove-Item C:\greenrhino-build\android-{music,player} -Recurse -Force
Copy-Item clients\android-music C:\greenrhino-build\android-music -Recurse -Force -Exclude build,.gradle
Copy-Item clients\android-player C:\greenrhino-build\android-player -Recurse -Force -Exclude build,.gradle

# 2. 同步 release 产物到 android assets
Copy-Item release\pwa-site-music\* C:\greenrhino-build\android-music\app\src\main\assets\pwa\ -Recurse -Force
Copy-Item release\pwa-site-player\* C:\greenrhino-build\android-player\app\src\main\assets\pwa\ -Recurse -Force

# 3. 设环境变量
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\Administrator\Android\Sdk"

# 4. 跑 gradle
cd C:\greenrhino-build\android-player
.\gradlew.bat assembleDebug --no-daemon
```

**根因**：JDK 17 无法处理含 emoji 或中文的路径 → `Illegal char <?>` → gradle-wrapper.jar 加载失败 → `ClassNotFoundException GradleWrapperMain`

**关联坑**：ISS-20261017-006

---

## 🚨 环境速查

| 工具 | 真实位置 | 旧位置（已失效） |
|---|---|---|
| JDK 17 | `C:\Program Files\Java\jdk-17`（PATH 里） | `C:\greenrhino-tools\jdk17` |
| Android SDK | `C:\Users\Administrator\Android\Sdk` | `C:\Users\Administrator\.android-sdk` |
| adb | `C:\Users\Administrator\Android\Sdk\platform-tools\adb.exe` | 同上 |
| gradle wrapper cache | `~/.gradle/wrapper/dists/gradle-8.11.1-bin/` | - |

**关联坑**：ISS-20261017-007

---

## 🕐 最近 5 条动作

| Commit | 内容 |
|---|---|
| 357b2d4 | `fix(android): 加 ASCII 路径铁律 + local.properties SDK 路径 + gitignore` |
| 753bfcb | `docs(ledger): 台账同步 — DEC-20261017-002 + ISS-20261017-003/004/005` |
| 352f958 | `chore: player.js 补模块级 TODO 分拆计划` |
| 2df9bf9 | `feat(ci): 建立 GitHub Actions CI + clients 废弃工程标注` |
| f6a18e1 | `feat(build): build-web.mjs 自动重写绝对路径 + Android 同步 + preflight + bump` |

**最新动态**（2026-10-17 10:15）：双 APK 今天新构建（music 3.49MB + player 3.47MB），推远程 main ✅。下一轮接 Moto USB → 真机回归。

---

## 📏 已定规则（23 条铁律）

详见 [AGENTS.md](../../../AGENTS.md)。核心：

1. 版本三落点一致：`build-web.mjs APP_VERSION` + `sw.js cache` + `.iss`
2. SW 占位符 `'__SW_CACHE__'` 禁止硬编码版本号
3. 双 App cache 桶严格隔离
4. 主题色、包名、assetlinks.json 严格对应
5. `src/` 零构建，禁 bundler
6. Android MediaStore `<unknown>` 字面量三层清洗
7. Moto 真机：不要 `adb logcat -c`、装机必须 `install -r`、必须 `pm grant 4 权限`
8. 改 web 必须重跑 `copy-web.mjs` 重压 `wwwroot.zip`
9. **Android 构建必须在纯 ASCII 路径**（2026-10-17 新增铁律 #9）

---

## 📚 台账导航

- [context.md](./context.md) — 你在这里
- [decisions.md](./decisions.md) — 8 个决策
- [issues.md](./issues.md) — 16 个坑 + 5 个问题群
- [index.md](./index.md) — 模块索引
- [daily.md](./daily.md) — 每日流水
- [archive/](./archive/) — 7 份旧文档已归档
