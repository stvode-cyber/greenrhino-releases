# 📅 每日工作流水 daily.md

> 每天一个 section，记录当天干了啥、改了哪些文件、跑了啥命令。
> 新 AI 进门看一眼今天流水就知道"已经干了啥、剩下啥"。
> 超过 7 天的旧日期归档到 `.trae/memory/台账/archive/` 或合并进 context.md。

---

## 2026-10-08（周三）

- 视频播放核心功能落地：CSS grid 溢出根因修复（`#main overflow:hidden` + `minmax(0,1fr)`）
- 视频沉浸式：`body.video-playing` 隐藏顶栏底栏侧栏；全屏用 `body.video-immersive`
- 控制条 3s 自动淡出 + 中间透明层 `vp-hint` 温柔唤起（**不再**硬切播放/暂停）
- 全屏横屏切换：`RhinoBridge.toggleFullscreen` → `setRequestedOrientation + immersive`
- 返回按钮加入控制条最前；player role 顶栏加「📁 导入」按钮
- MainActivity 清理 `onPageFinished` 里的绿色 dump div 调试代码
- index.html 加 cache-busting query string 防 WebView 缓存旧 CSS
- `npm run test:all` → Playwright chromium 缺失失败（不是业务代码问题）
- **2 个 commit 入库**：`df1b9e3` feat: 视频播放全屏/沉浸式/控制条自动隐藏 → `d7fd251` chore: 清理调试垃圾文件
- 新坑 5 条进台账（ISS-20261008-001~005）+ **#css-grid-overflow 新问题群🔥 P0**
- 新决策 3 条进台账（DEC-20261008-001~003）
- 改了 `src/style.css` / `src/ui/videoPlayer.js` / `index.html` / `src/main.js` / `MainActivity.kt`
- 跑了 `node scripts/build-web.mjs` / `gradlew assembleDebug` / `adb shell pm clear` / `adb install`

## 2026-09-30（周二）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| 全天 | **台账系统全面升级** | AGENTS.md、context.md、decisions.md、issues.md、daily.md（本文件） | — | 用户要求：工作完成总汇、同类问题归类加级、AI 交接秒懂 |

### 本轮新增/更新台账条目
- **决策**：DEC-20260914-004 迭代（从 4 文件 → 5 文件，6 条规则 → 五步闭环 + 成长型归类）
- **坑**：issues.md 全面重写，每条加归类标签，识别出 6 个问题群（#android-webview 🔥P0、#twa-gms、#gradle-directory、#relative-path、#playwright-mirror、#harmonyos-install）
- **新增**：daily.md（本文件）、context.md 末尾「最近 5 条动作」区

---

## 2026-09-18（周四）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| — | Android 壳交接文档 HANDOVER.md 完成 | HANDOVER.md、context.md | — | 换电脑交接核心文档 |

---

## 2026-09-16（周二）

| 时间 | 任务 | 改了哪些文件 | 跑了啥命令 | 备注 |
|---|---|---|---|---|
| — | 修 Android player 3 层白屏问题 | index.html、scripts/build-web.mjs、src/main.js、clients/android-player/app/build.gradle | node scripts/build-web.mjs、./gradlew clean assembleDebug | ISS-20260916-001/002/003 |

---

*文件由 AI 自动管理，每次任务结束追加当天流水。*
## 2026-10-09 （大改日 · 换电脑交接）

### 时间线
- **上午**: UI 重构（底部导航、新首页、全屏播放页）
- **下午1**: 导入边界过滤漏洞排查 → 发现 3 个大漏洞 → store.js role 分流 + Music MainActivity 补 RhinoBridge
- **下午2**: buildMusicHome 函数缺失暴露 → Playwright headless smoke test 救了 E2E
- **下午3**: 测试 10/10 全绿 → commit 3 个 → git push 超时
- **下午4**: 写交接文档（本 context.md + daily.md）
- **晚**: SAF 严格过滤真机验证 ✅ 双 App 通过（详见下方「晚间验证」）
- **晚2**: 🎵 歌曲列表按参考图改造（详见下方「歌曲列表改造」）

### 🎵 歌曲列表改造（参考图：我的收藏列表界面）
- 起因：用户上传参考图要求"音乐的页面按这个按。列表界面"
- 参考图结构：[56×56圆角封面] [歌名/歌手/VIP标签/时长] [▶圆形播放按钮] [⋯更多菜单] + 顶部 Tab（单曲/歌手/专辑/视频）+ 工具条
- 改动文件：
  - `src/ui/library.js` — 新增 `songRow(item, app)` 通用列表行组件（封面+歌名+歌手+格式标签+时长+▶+⋯）
  - `src/ui/favorites.js` — 弃 `mediaCard` 网格，换 `songRow` 列表行 + Tab + 工具条 header
  - `src/main.js` — `import songRow`；删 `buildMusicHome` 内自建 `trackRow` 函数；「最近播放」「收藏单曲」两处调用换 `songRow(m, app)`
  - `src/style.css` — 加 `.sr-row` / `.sr-cover` / `.sr-name` / `.sr-sub` / `.sr-bdg` / `.sr-dur` / `.sr-play` / `.sr-more` / `.sr-tabs` / `.sr-toolbar` / `.sr-menu` 全部样式
- 真机验证（moto X50 Ultra）：✅ 「情歌王」歌曲行完全按参考图渲染，封面图有、格式标签 FLAC 绿色、时长 0:00、▶圆形绿按钮、⋯菜单都在；点击歌曲行触发 playItem 跳到 music 播放页 + mini player 正常

### 晚间验证（SAF 严格过滤 · 真机 moto X50 Ultra）
- 起因：用户要求"导入打开就只能看到音乐格式的，不要混太多文件"
- 改法：双 App `onShowFileChooser` 绕开 `params.createIntent()`，手动构建 `Intent(ACTION_OPEN_DOCUMENT)`，type 锁大分类 + EXTRA_MIME_TYPES 精确白名单
- 验证方法：adb 截图 + uiautomator dump（SAF 是原生 UI 可 dump；WebView NAF 不可 dump，截图量坐标）
- 结果：
  - 🎵 音乐 App SAF 抽屉 = 最近 / **音频** / 下载 / moto X50 Ultra（无图片无视频）；音频页全是歌手文件夹（邰正宵/陈奕迅/戴佩妮…）
  - 🎬 播放器 App SAF 抽屉 = 最近 / **视频** / 下载 / moto X50 Ultra（无图片无音频）；最近页只有一个视频文件
- 新坑入台账：ISS-20261009-021（#saf-mime-filter #android-webview）
- 技巧沉淀：WebView 内部 NAF 点不中 → 改用屏幕截图按比例换算坐标（display 460×1023 ↔ device 1220×2712，scale 2.652）；SAF 原生界面直接 uiautomator dump 拿 bounds 精确点击
- 发现的设备状况：手机 6 个用户 profile（主用户+5 分身），`am start` 播放器弹"选择应用程序"歧义框 → 需显式 `--user 0` 或手动选第一个

### 关键发现
1. Music App 之前完全没有 MediaStore.Audio 扫描！是 SAF 专用壳 → RhinoBridge 补
2. addMediaFromAndroid 硬编码 VIDEO_EXT + 500MB → music role 音频 entry 全被跳过
3. buildMusicHome 调用了没定义 → music role init crash → SW 注册走不到 → E2E 3 条全超时
4. **教训**: UI 大改后必须 python -m http.server + Playwright headless smoke test

### 踩坑
- EPERM rmSync release 目录（被 python http.server 占着）→ Get-Process python | Stop-Process -Force
- GitHub push Connection timed out（300s）→ 等网络恢复

### 下一步（换电脑后新 AI 要做）
1. 真机验证 MediaStore.Audio 扫描
2. buildMusicHome stub 迭代（点击跳转、展开/收起动画、真实数量）
3. 全屏播放页 openMusicFullpage 实现
4. 推 GitHub + Cloudflare Pages 部署
5. 打 release tag + 写 changelog
