# AGENTS.md — 绿角犀项目全局规则

> 本文件对所有 AI 员工注入，是跨角色的行为基线。修改代码前必须通读。

## 项目定位

绿角犀（GreenRhino）是一个 **离线优先的 PWA 媒体播放器**，拆成两个完全独立的应用：

| App | 主题色 | 包名 | Cloudflare Pages URL | Android TWA |
|---|---|---|---|---|
| 🎵 音乐（green） | `#00D8A6` | `com.greenrhino.music` | `greenrhino-music.pages.dev` | ✅ |
| 🎬 播放器（amber） | `#FFB03A` | `com.greenrhino.player` | `greenrhino-player.pages.dev` | ✅ |

共享同一套源码，由 `scripts/build-web.mjs` 按角色裁剪输出到 `release/pwa-site-{music,player}/`。

## 技术栈

- **前端**：原生 ES Module（零构建，无 framework），`src/` 直接浏览器加载
- **后端**：Node.js（LocalServer，负责媒体扫描/流式传输）
- **构建工具**：仅 `scripts/build-web.mjs` + `scripts/build-assets.mjs`（自定义 Node 脚本）
- **PWA**：手写 `sw.js`，Manifest v3
- **Windows EXE**：.NET 8 WebView2，clients/windows/GreenRhino{Music,Player}
- **Android**：WebView 原生壳（Kotlin MainActivity），clients/android-{music,player}（已从 TWA 迁移，TWA 因 GMS 依赖放弃）
- **部署**：Cloudflare Pages（wrangler） + GitHub Actions（三套 workflow）

## 关键目录

```
src/                     # 前端源码（两个 App 共享，运行时按 winRole 裁剪 UI）
scripts/                 # build-web.mjs / build-assets.mjs / copy-web.mjs
server/                  # Node LocalServer（媒体扫描、流式传输）
clients/                 # 各平台壳工程（android-music, windows, huawei-music 等）
release/pwa-site-*/      # build-web.mjs 输出（Cloudflare Pages 部署目录）
.github/workflows/       # CI：build-android.yml / build-windows.yml / build-huawei.yml
.wrangler/               # Cloudflare Pages 部署缓存
icons/                   icon-music.svg / icon-player.svg（角色专属图标）
```

## 不可变约束（Breaking These = 高优先级 Bug）

1. **version 一致**：`scripts/build-web.mjs` 的 `APP_VERSION = 'v16'` 是所有产物的版本基线。改版本时必须同步更新 cache 名（`gr-music-v16`、`gr-player-v16`）
2. **androidPackage 唯一**：两个 App 的 `package_name`（`com.greenrhino.music` / `com.greenrhino.player`）和 `assetlinks.json` 的包名/指纹必须严格对应
3. **siteUrl 唯一**：`assetlinks.json` 的 `target` 域名必须与 Cloudflare Pages 域名匹配
4. **manifest 主题色绑定**：`manifest.theme_color` 和 `<meta theme-color>` 必须与角色图标颜色一致（音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A`）
5. **SW cache 桶隔离**：两个 App 用不同 cache 名（`gr-music-v16` vs `gr-player-v16`），避免跨应用缓存污染。
   - **源码占位符**：`sw.js` 里 `const CACHE = '__SW_CACHE__'` 是显式占位符，**禁止改成硬编码版本号**（如 `'greenrhino-v14'`）
   - **替换逻辑**：`scripts/build-web.mjs` 用精确正则 `replace(/'__SW_CACHE__'/, cfg.cache)` 替换，不再依赖隐式的 `greenrhino-v\d+` 格式
   - **测试覆盖**：改 sw.js 或 build-web.mjs 后必须跑 `npm run test:all`（单元 6 条 + E2E 4 条，全绿才安全）
6. **源码零构建**：`src/` 目录在运行时由浏览器原生 ES Module 加载。不要引入 bundler 除非明确批准

## 📚 台账系统（强制行为基线·成长型）

> 本项目所有 AI Agent 必须遵守的台账操作规则。台账目录：`.trae/memory/台账/`
>
> 核心思想：**随时换电脑、新 AI 接手 30 秒懂项目**。所有动作都落在台账里，不让知识只存在对话历史中。

### 台账文件清单

| 文件 | 管什么 | 编号规则 |
|---|---|---|
| `context.md` | 🆕 **项目驾驶舱**：当前版本、进度、阻塞、已定规则、最近 5 条动作 | 日期戳更新 |
| `decisions.md` | 所有关键决策（选了啥/为啥/备选方案/关联文件/相关坑） | `DEC-YYYYMMDD-NNN` |
| `issues.md` | 所有踩过的坑（问题/解决/根因/预防/严重度/归类标签/关联文件） | `ISS-YYYYMMDD-NNN` |
| `index.md` | 按模块做索引（src/, scripts/, clients/ 等） | 指针条目 |
| `daily.md` | 🆕 **每日工作流水**：当天干了啥、改了哪些文件、跑了啥命令 | 日期分行，每条一句话 |
| `.session-memory.md` | **本次会话**的临时约定 / 临时代码片段 | 会话结束前清空 |

用户级共享台账（自动加载，跨项目通用）：
- `%userprofile%/.trae-cn/memory/shared-issues.md`
- `%userprofile%/.trae-cn/memory/shared-decisions.md`

---

### 🔄 台账五步闭环（每次工作都走完）

> **铁律**：这 5 步是每个 AI Agent 的工作骨架，不得跳过。

#### ① 启动先看（新对话 → 先读台账再动手）

1. 读 `context.md` 头部 TL;DR（换电脑交接区）→ 30 秒内掌握版本/进度/阻塞
2. 读 `context.md` 末尾「最近 5 条动作」→ 知道上一个 AI 干了啥
3. 读 `index.md` → 定位到当前任务涉及的模块
4. 读用户级 `shared-issues.md` + `shared-decisions.md` → 加载跨项目通用坑/决策
5. 一句话主动提醒用户：
   > 【台账提醒】当前 v16，Android 真机渲染待验证，已定规则 22 条。最近动作：上一轮做了 xxx。详见 `.trae/memory/台账/context.md`

#### ② 改前扫坑（改文件 → 先扫关联坑）

1. 扫 `issues.md` 的「关联文件」列 → 匹配到目标文件 → 列出所有相关坑
2. 扫用户级 `shared-issues.md` → 匹配跨项目通用坑
3. 命中时**必须提醒**用户并确认：
   > 【⚠️ 台账预警】你要改的 `index.html` 关联 ISS-20260914-001（资源路径相对路径）和 ISS-20260916-003（PWA 打包 Android 绝对路径白屏）。确认后继续？
4. 未命中也要在 `.session-memory.md` 临时区记一行"本次未触发台账预警"（方便后续追溯）

#### ③ 动作即记（踩坑/决策 → 立刻写台账，不要等）

- 踩了新坑 → **立刻**在 `.session-memory.md` 写临时记录（问题、怎么修的、根因猜测）
- 做了关键决策 → **立刻**在 `.session-memory.md` 写临时记录（选了啥、为啥、备选方案）
- 不要等任务结束才回忆——边干活边记

#### ④ 完成总汇（一个任务做完 → 本轮做了啥 + 归档）

> **触发点**：任务完成 / 用户说「记台账」/ 对话超过 20 条 / 准备结束会话

1. **给用户口头汇总**（大白话，3-5 行）：
   > 本轮工作总结：
   > 1. 改了 `src/main.js` 的主题同步逻辑
   > 2. 新增了 2 条 P0 预防规则的 TODO 注释
   > 3. 更新了 AGENTS.md 台账系统为成长型
   > 台账已同步更新。

2. **自动归档进正式台账**：
   - `.session-memory.md` 里的新决策 → `decisions.md` 新增一条
   - `.session-memory.md` 里的新坑 → `issues.md` 新增一条（**必须带归类标签**，如 `relative-path`、`gradle-directory`）
   - 任务中更新了的项目状态 → `context.md` 同步（版本/进度/阻塞/最近 5 条动作）
   - 改了哪些文件、跑了啥命令 → `daily.md` 追加当天流水
   - 所有新条目 → `index.md` 加模块索引
   - **清理**：`.session-memory.md` 清空重置

#### ⑤ 索引同步（台账动了 → index.md 跟着动）

- 每条新决策/坑 → 立刻在 `index.md` 对应模块加一行指针
- 归档区增加条目 → `index.md` 同步标「📦 已归档」

---

### 📈 成长型归类加级（自动合并同类问题，避免台账臃肿）

> 核心机制：**同类问题自动归成问题群，频率高的自动升严重度，沉淀够的自动归档**

1. **每条坑必须带归类标签**（新增坑时必填）：
   - 格式：`#标签1 #标签2`（如 `#relative-path #android-webview`）
   - 常见标签：`relative-path`、`gradle-directory`、`playwright-mirror`、`version-sync`、`path-charset`
2. **自动归群**：`issues.md` 里同标签 ≥2 条 → 该标签下自动加一行「🔶 问题群：[标签名]」，把相关坑挂在一起
3. **自动加级**：同标签坑累计修复次数 ≥3 → 问题群严重度自动升一级（P2→P1→P0），并在坑条目前加 `🔥` 标记
4. **自动归档**：同标签坑 ≥3 条 且 预防规则已沉淀进 Skill → 整个问题群移 `📦 归档区`，同时检查是否应提升到用户级 `shared-issues.md`
5. **自动注入 TODO**：活跃坑的 P0/P1 预防规则 → 自动写成 `// TODO: [坑标签] 预防：xxx` 注释到关联文件里（避免重构时遗忘）

---

### 🎯 工作交接铁律（换电脑 / 新 AI 接手）

> 目标：**新 AI 进门 30 秒开工，不用翻历史对话**

1. `context.md` 头部 TL;DR 区必须保持最新（版本/进度/阻塞/未提交改动）
2. `context.md` 末尾「最近 5 条动作」必须是**过去 3 天内的真实动作**（不是过期内容）
3. `daily.md` 当天流水必须每轮任务更新（让新 AI 看到"今天已经干了啥"）
4. 所有文件改动必须关联 `issues.md` 编号（commit message / PR 描述里提 ISS-NNN）
5. 本机换 AI 模型 / 换电脑 → 新 AI 自动走五步闭环第①步（启动先看），不需要手动交接

---

### 📊 周度巡检

每周一 → 自动生成本周台账周报，贴在本周第一条对话开头：
- 新增决策 N 条、新坑 N 条、归档 N 条、跨项目共享 N 条
- 高频问题群 TOP 3（加级了哪些标签）
- 台账健康度（活跃坑数/归档坑数/空预防规则坑数）

---

### 台账写入格式（严格遵守）

每条决策/坑必须满足：
- ✅ 日期精确到日 + 唯一编号
- ✅ 关联文件写相对路径（如 `src/index.html`，不要绝对路径）
- ✅ 决策必须有「备选方案」列（哪怕写「无」）+ 「相关坑/决策」列
- ✅ 坑必须有「预防规则」列（空 = 这条坑没价值，要补）+ **「归类标签」列**
- ❌ 禁止删除已有条目，只能移至归档区
- ❌ 禁止临时对话内容跳过 `.session-memory.md` 直接进正式台账

## 安全基线

- Android keystore / 证书密码存 GitHub Secrets，**绝不要**出现在源码或日志里
- `.secrets.env` 在 `.gitignore` 中，本地临时用，禁止提交
- `assetlinks.json` 的 SHA256 指纹必须从真实 keystore 生成，**不要手写**

## 发布检查清单

每次推主版本 tag 前：

- [ ] `scripts/build-web.mjs` APP_VERSION 已递增
- [ ] **`npm run test:all` 全绿**（单元 6/6 + E2E 4/4，SW cache 占位符 + 浏览器行为双保险）
- [ ] SW cache 名已对应更新
- [ ] Windows dotnet publish 本地跑过（`dotnet publish` 无警告）
- [ ] `wrangler pages deploy release/pwa-site-music --project-name=greenrhino-music` 已执行
- [ ] `wrangler pages deploy release/pwa-site-player --project-name=greenrhino-player` 已执行
- [ ] Cloudflare Pages CDN 缓存已刷新（`curl -H Cache-Control: no-cache` 验证 manifest）
- [ ] GitHub Actions 三套 workflow 已手动触发且 SUCCESS
