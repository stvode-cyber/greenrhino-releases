# 📱 Android 真机回归测试清单

> 适用：绿角犀 Android WebView 壳（music / player）
> 包名：com.greenrhino.music
> 日期：2026-09-14

## 0. 环境准备

`powershell
# 1. 开启开发者选项 + USB 调试
# 2. 连上 USB 线
# 3. 验证设备
adb devices

# 4. 安装 debug APK（music）
adb install -r clients\android-music\app\build\outputs\apk\debug\app-debug.apk

# 5. 安装 debug APK（player）
adb install -r clients\android-player\app\build\outputs\apk\debug\app-debug.apk

# 6. 启动 logcat 过滤（**关键**：两个 tag 必看）
adb logcat -c                              # 清空历史
adb logcat -s GreenRhino:* chromium:* '*:S'
# 或者更宽泛：
adb logcat | Select-String -Pattern "GreenRhino|chromium|Console"
`

## 1. 启动 & UI 冒烟

| 步骤 | 操作 | 预期 | 严重度 |
|---|---|---|---|
| 1.1 | 点开「绿角犀音乐」图标 | 启动图（深色 + 琥珀渐变）→ 2s 内进主界面 | P0 |
| 1.2 | 检查主界面侧边栏 | 绿色（#00D8A6）主题色，无错位 | P0 |
| 1.3 | 检查顶部导航栏 | 版本 badge v16 显示 | P1 |
| 1.4 | 横屏旋转 | UI 不错位、不闪退 | P1 |

## 2. 核心功能（文件导入 → 播放）⚠️ 最关键

| 步骤 | 操作 | 预期 | 严重度 |
|---|---|---|---|
| 2.1 | 点「＋ 添加文件」 | 系统文件选择器弹出 | P0 |
| 2.2 | 选一个 .mp3 文件 | 文件被添加到列表，IndexedDB 存住 | P0 |
| 2.3 | 点列表中的歌曲 | 进入播放界面，进度条开始动 | P0 |
| 2.4 | 按返回键 | 返回歌曲列表（WebView 历史优先） | P1 |
| 2.5 | 长按歌曲 | 能删除，列表刷新 | P1 |
| 2.6 | 播放 30s 后关闭 App 再重开 | 歌曲列表还在（IndexedDB 持久化） | P0 |

## 3. WebView 特性

| 步骤 | 操作 | 预期 | 严重度 |
|---|---|---|---|
| 3.1 | 点「📁 导入文件夹」 | 按钮要么隐藏（WebView 不支持），要么点击有反馈不闪退 | P1 |
| 3.2 | 切后台再切回来 | App 不崩溃、状态保留 | P1 |
| 3.3 | 无网络飞行模式启动 | 不白屏、PWA 资源全离线可用 | P0 |

## 4. logcat 观察清单

`powershell
# 启动后应看到：
# I GreenRhino: === GreenRhino WebView 壳启动 ===
# I GreenRhino: WebView engine initialized
# I GreenRhino: Loading: file:///android_asset/pwa/index.html

# 导入文件后应看到：
# I GreenRhino: onShowFileChooser called
# I GreenRhino: selected 1 files

# JS console 桥接（代码里的 console.log 会转发到 logcat）：
# I GreenRhino/JS: [library] loaded 1 items

# 红色 flag（**看到要截图**）：
# E GreenRhino: （任何 error 级别）
# E chromium: （chromium 渲染错误）
# W chromium: （GPU / renderer 警告）
`

## 5. 异常操作

| 步骤 | 操作 | 预期 |
|---|---|---|
| 5.1 | 连续快速按「＋ 添加文件」多次 | 不闪退、不出现重复条目（ISS-006 refresh 加锁） |
| 5.2 | 导入一个不支持的格式（.txt） | 要么忽略要么提示，不闪退 |
| 5.3 | 列表为空时点播放 | 不闪退、有友好提示 |

## 6. 通过标准

- ✅ 1.x 启动冒烟全 PASS
- ✅ 2.x 文件导入 → 播放全 PASS（**核心闭环**）
- ✅ 无任何 E GreenRhino / E chromium 红色报错
- ✅ 离线启动不白屏
- ✅ 退出重开数据保留

## 发现 Bug 时

1. **截 logcat**（保存到桌面）
2. **复现步骤**（精确到第几步）
3. **截图**（App 当前状态）
4. 回传 AI → 自动入 issues.md
