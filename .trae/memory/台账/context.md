# 项目驾驶舱 · 绿角犀（GreenRhino）

> **TL;DR**：新 AI 进门 30 秒上手。每次任务前必读。
> 最后更新：2026-10-18（T20261018-01 设定台账全面升级完成）

---

## 🎯 当前状态

| 项 | 值 |
|---|---|
| **版本** | `v16` |
| **SW cache 桶** | `gr-music-v16` / `gr-player-v16` |
| **双站** | https://greenrhino-music.pages.dev / https://greenrhino-player.pages.dev |
| **包名** | `com.greenrhino.music` / `com.greenrhino.player` |
| **主题色** | 音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A` |
| **Preflight** | ✅ 18/18 绿 |
| **单元测试** | ✅ 6/6 绿 |
| **CI** | ✅ `.github/workflows/ci.yml` |
| **远程** | ✅ main 分支已推 `fc2c12e`（2026-10-17 晚） |
| **投屏三方案** | ✅ DLNA 推视频（已有）+ **🆕 MJPEG 屏幕镜像 /screen.mjpg**（MediaProjection 抓屏，任何有浏览器的电视都能用，95%+ 覆盖）+ Miracast 原生兜底 |
| **当前重点** | 🆕 屏幕镜像 MJPEG 已部署，用户在绿角犀 App 里点「📺 屏幕镜像」→ 系统弹框允许 → 电视浏览器开 /tv 页面自动显示手机画面 |

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
| （待提交） | `chore: T20261018-01 设定台账全面升级——漂移修复+SKILL同步v16+台账闭环` |
| 3923222 | `feat: 前端 UI 加 MJPEG 屏幕镜像按钮（投屏面板三选项全齐）` |
| 2b9cb77 | `feat: 屏幕镜像 MJPEG /screen.mjpg — MediaProjection 抓屏` |
| 61dbafb | `feat: MediaHttpServer TV browser + BootReceiver + 双壳全量 sync` |
| 1124423 | `feat: autoNext 设置 — 播放完默认停（DEC-005）` |

---

## 🚨 活跃坑清单（新 AI 必看）

> ✅ **0 条活跃**，全部关单。详见 [issues.md](./issues.md)

---

## 📏 已定规则（10 条铁律）

详见 [AGENTS.md](../../../AGENTS.md) 「不可变约束」章节。

核心速查：
1. **版本五落点**：APP_VERSION + cache 桶 + .iss + .gradle versionName/versionCode 必须同步（`npm run bump` 一键覆盖 + `npm run preflight` 18 项自动验）
2. **SW 占位符**：`'__SW_CACHE__'` 禁止硬编码版本号
3. **双 App cache 隔离**：music ≠ player
4. **主题色/包名/assetlinks**：严格绑定角色
5. **src/ 零构建**：禁 bundler
6. **Android MediaStore `<unknown>` 三层清洗**：不是 null，必须显式匹配字面量
7. **Moto 真机**：别 `logcat -c`、装机 `install -r`、pm grant 4 权限、tap 610 2251
8. **Android 构建必须纯 ASCII 路径**：复制到 C:\greenrhino-build\
9. **build-assets.mjs 在 clients/**：不是 scripts/
10. **台账闭环**：五步必走

---

## 📚 台账导航

- [context.md](./context.md) — 你在这里
- [decisions.md](./decisions.md) — 9 个决策
- [issues.md](./issues.md) — 19 个坑 + 5 个问题群
- [index.md](./index.md) — 模块索引
- [daily.md](./daily.md) — 每日流水
- [secrets-keys.md](./secrets-keys.md) — 🔐 敏感信息索引（只存引用不存密码）
- [archive/](./archive/) — 7 份旧文档已归档
