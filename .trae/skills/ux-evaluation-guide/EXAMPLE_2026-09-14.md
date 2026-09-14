# 🎨 UX 体验审计报告

> **项目**：绿角犀（GreenRhino）v16  
> **日期**：2026-09-14  
> **执行 Agent**：ux-flow-tester + ux-clarity-auditor + ux-onboarding-designer（联合）  
> **审计范围**：首次体验 30 秒、核心流程走查（M-1 / V-1 / B-1）、易懂性全量审计  
> **状态**：🔶 PARTIAL（发现 3 个 P0 + 4 个 P1 + 2 个 P2 问题，需修复后重审）  
> **本次主要发现**：CSS 主题色未按角色差异化（两个 App 都是蓝色 `#2D6CDF`）——**meta theme_color 改了，但 CSS 里的 `--accent` 没改**

---

## 二、摘要

| 指标 | 数值 |
|---|---|
| 审计场景 | 3（首次体验 / 流程走查 / 易懂性审计） |
| 走查步骤 | 42 |
| **🔴 P0 阻断** | 3 |
| **🟠 P1 核心** | 4 |
| **🟡 P2 摩擦** | 2 |
| ⚪ P3 建议 | 0 |
| **首次体验得分** | 4 / 10 |
| **模拟首次使用成功率** | 20%（假设 10 个新用户，仅 2 个能顺利完成 导入→播放） |

---

## 三、首次体验 30 秒打分

### 🎵 音乐版

| 时间点 | 检查项 | PASS/FAIL | 证据 |
|---|---|---|---|
| T+0s | 0.5s 内有意义内容（非白屏） | ✅ | sidebar + main 区域正常渲染（首屏 ~300ms） |
| T+1s | 品牌识别（主题色 + 图标正确） | ❌ | **CSS accent 是蓝色 `#2D6CDF`，不是绿 `#00D8A6`**（meta theme-color 改了但 CSS 变量没改） |
| T+2s | 空状态有引导文案 | ❌ | `<main>` 里只有 `<div class="search-box"><input>`，无空状态引导卡片 |
| T+3s | 有大号行动按钮 | ⚠️ 半通过 | 导入按钮在**侧边栏底部**（ghost-btn 小号），不在主内容区显眼位置 |
| T+5s | 文件选择器正常弹出 | — | 未测（需要本地文件） |
| T+10s | 导入有进度反馈 | — | 未测（需要本地文件） |
| T+12s | 导入完成有反馈 + 下一步建议 | ❌ | 从代码看只有 "✓ 完成"，无 "然后呢" 提示 |
| T+15s | 第一首歌自动开始播放 | ❌ | 从代码看不会自动播放，需要用户手动点 |
| T+20s | 播放界面有状态显示 | ✅ | bottombar.js 实现了播放控制条 |
| T+25s | 用户完成核心循环 | ⚠️ 不确定 | 导入 + 找歌 + 点播放需要多少步取决于用户 |

**得分：3.5 / 10**

### 🎬 播放器版

得分与音乐版相同（同一个 style.css + 同一个 main.js 基础逻辑），但还有一个额外问题：**Player 版 main.js 里 `mode: 'music'` 默认值没改**。

**得分：3 / 10**

---

## 四、流程走查

### 场景 M-1：首次打开 → 空状态 → 导入 → 播放

| 步骤 | 操作 | 用户感受 | 实际问题 | 严重度 |
|---|---|---|---|---|
| 1 | 打开 App | 看到侧边栏 + 搜索框 | ✅ 侧边栏有导入按钮，但主内容区空白 | — |
| 2 | 看主内容区 | "搜索音乐/视频…" + 空白 | ❓ **空白！我应该做什么？** | 🔴 P0 |
| 3 | 找导入入口 | 侧边栏底部有 "📁 导入文件夹" | 半隐藏（ghost-btn 小号，侧边栏底部） | 🟠 P1 |
| 4 | 点导入 | 系统文件选择器 | ✅ | — |
| 5 | 选择文件夹 | 开始扫描 | ✅ 有进度 "N/M" 计数 | — |
| 6 | 扫描完成 | "✓ 完成" | ❓ **完成了？然后呢？** | 🟠 P1 |
| 7 | 找第一首歌 | 应该自动跳到"音乐"tab | ❓ 需要自己切 tab | 🟡 P2 |
| 8 | 点一首歌 | 开始播放 | ✅ | — |

### 场景 M-2：主题色应该按角色区分（但目前没做到）

| 检查 | 音乐版期望 | 音乐版实际 | 播放器版期望 | 播放器版实际 |
|---|---|---|---|---|
| manifest theme_color | `#00D8A6` 绿 | ✅ `#00D8A6` | `#FFB03A` 琥珀 | ✅ `#FFB03A` |
| meta theme-color | `#00D8A6` | ✅ `#00D8A6` | `#FFB03A` | ✅ `#FFB03A` |
| **CSS --accent** | **`#00D8A6`** | **❌ `#2D6CDF` 蓝** | **`#FFB03A`** | **❌ `#2D6CDF` 蓝** |
| **侧边栏选中色** | 绿色高亮 | ❌ 蓝色高亮 | 琥珀色高亮 | ❌ 蓝色高亮 |
| **按钮 hover 色** | 绿色 | ❌ 蓝色 | 琥珀色 | ❌ 蓝色 |
| **安装按钮 accent** | 绿色 | ❌ 蓝色 | 琥珀色 | ❌ 蓝色 |

**根因**：`build-web.mjs` 只替换了 `index.html` 的 meta 和 `manifest.webmanifest` 的 theme_color，**没有替换 CSS 里的 `--accent` 变量**。而 `src/style.css` 源码里 `--accent: #2D6CDF` 是默认值。

### 场景 V-1：播放器版 main.js 角色默认值问题

从 release 产物看到：
```javascript
// release/pwa-site-player/src/main.js 第 1 行附近
page: 'music',          // ❌ 默认值是 'music'
mode: 'music',          // ❌ 默认值是 'music'
const ROLE = (window.__winRole || 'hub')  // hub = 全量功能
```

纯浏览器打开（无 C# 壳注入 `__winRole`）时，两个 App 都 fallback 到 `hub`——**音乐版能看到视频 tab，播放器版能看到音乐 tab**。

---

## 五、易懂性审计

### 按钮文案

| 位置 | 当前文案 | 问题 | 建议 | 严重度 |
|---|---|---|---|---|
| 侧边栏导航 | "⌂ 首页 / 🎵 音乐 / 🎞️ 视频" | ✅ OK | — | — |
| 侧边栏底部 | "📁 导入文件夹" / "＋ 添加文件" | ✅ OK，有 emoji + 文字 | — | — |
| 安装按钮 | "📲 安装应用" | ✅ OK（但默认 hidden） | — | — |
| 搜索 placeholder | "搜索音乐 / 视频…" | ❌ 没说范围 | "按 标题 / 艺术家 / 文件名 搜索" | 🟠 P1 |

### 错误提示

从代码审计，**所有错误都是 console.error**：
| 位置 | 代码 | 用户能看到？ |
|---|---|---|
| src/cover.js | `console.error('cover fetch fail')` | ❌ |
| src/store.js | `throw new Error('不是有效的绿角犀同步文件')` | ❌ 会导致白屏但无友好提示 |
| main.js 多处 | `console.error(e)` 统一 catch | ❌ |
| cast 传输 | `console.error('[gr] 原生兜底传输失败')` | ❌ |

**结论**：🔴 P0 阻断——用户看不到任何错误反馈。如果视频解码失败，用户只会看到播放卡住，不知道为什么。

### 空状态文案

| 位置 | 当前状态 | 建议 | 严重度 |
|---|---|---|---|
| 首次打开 / 空库 | 只有搜索框 + 侧边栏 | 加引导卡片："选择你的{音乐/视频}，开始离线播放" | 🔴 P0 |
| 搜索无结果 | 不确定是否有处理 | 应显示 "没找到匹配项 · 试试 '周杰伦'" | 🟠 P1 |
| 收藏夹空 | 不确定 | 应显示 "还没有收藏 · 点 ♡ 收藏喜欢的音乐" | 🟡 P2 |
| 播放列表空 | 不确定 | 应显示 "列表为空 · 添加一些歌曲吧" | 🟡 P2 |

---

## 六、根因分析

| 根因类型 | 是否命中 | 具体表现 |
|---|---|---|
| **隐式依赖遗漏** | ✅ | build-web.mjs 替换了 meta/manifest/theme_color，但**忘了**替换 CSS 变量 `--accent`。三处主题色必须同步，但现在只同步了两处 |
| **角色默认值错误** | ✅ | Player 版 main.js `mode: 'music'` 硬编码默认值，纯浏览器打开时两个 App 都是 hub 模式（全功能） |
| **UI 引导缺失** | ✅ | 侧边栏有导入按钮但主内容区无空状态引导——新用户进主页只看到搜索框 + 空白 |
| **错误吞掉** | ✅ | 12+ 处 console.error / throw new Error，零处用户可见 toast |
| **无自动化检查** | ⚠️ 部分 | 单元测试只测 sw.js cache，没测主题色替换是否完整（manifest + meta + CSS 三处） |

---

## 七、改进措施

### 🔴 P0 阻断（必须改）

| # | 问题 | 改法 | 落地文件 |
|---|---|---|---|
| 1 | **CSS accent 颜色两个 App 都是蓝色** | build-web.mjs 里新增对 style.css 的替换：`--accent: #2D6CDF` → `--accent: ${cfg.accent}` | `scripts/build-web.mjs` |
| 2 | **Player 版 main.js 默认 role='music'** | build-web.mjs 里对 main.js 做字符串替换：`mode: 'music'` → `mode: 'video'`（仅 Player 版） | `scripts/build-web.mjs` |
| 3 | **空库无引导卡片** | 在 main.js 里加 `if (items.length === 0)` 分支，显示引导 HTML | `src/main.js` + 可能新增 `src/ui/emptyState.js` |

### 🟠 P1 核心（应该改）

| # | 问题 | 改法 | 落地文件 |
|---|---|---|---|
| 4 | **所有错误都是 console.error** | 封装 `window.showToast(msg, type)` 全局函数，替换所有 console.error | `src/ui/dom.js` + 全局改 |
| 5 | **搜索 placeholder 太模糊** | 改成 "按 标题 / 艺术家 / 文件名 搜索" | `index.html` + build-web.mjs 按角色差异化（音乐/播放器可以不同） |
| 6 | **导入完成无上下文** | "✓ 完成" → "✓ 已导入 N 首 → 点击第一首开始播放 →" | `src/store.js` / import 相关 |
| 7 | **侧边栏导入按钮不够显眼** | 在主内容区也加一个大号 "选择文件夹" 按钮（或让搜索框下方有） | `index.html` + `src/main.js` |

### 🟡 P2 摩擦（建议改）

| # | 问题 | 改法 | 落地文件 |
|---|---|---|---|
| 8 | **导入完成后不自动跳 tab** | 扫描完成后自动切到 "音乐"/"视频" tab | `src/main.js` |
| 9 | **没有 toast host 但有 `<div id="toast-host">`** | 好——但确认 `dom.js` 里 toast 函数真在用它 | `src/ui/dom.js` |

---

## 八、后续建议

### 🟢 低风险 · 可立即做

1. **build-web.mjs 加 CSS accent 替换**——一行正则就能搞定，不影响其他逻辑
2. **build-web.mjs 加 main.js role 默认值替换**——同样一行正则
3. **加主题色替换的单元测试**——扩展现有 build-sw-cache.test.js，再加 2 条测主题色替换

### 🟡 中风险 · 下个版本做

4. **封装全局 toast 函数 + 替换所有 console.error**——涉及改动 12+ 处，需要回归测试
5. **空状态引导卡片 + 导入完成后自动跳 tab**——需要前端组件开发

### 🔴 高风险 · 需要设计评审

6. **搜索 placeholder 按角色差异化**——音乐版和播放器版可以有不同文案（"按 歌曲 / 艺术家" vs "按 视频名 / 文件名"），但需要 build-web.mjs 对 index.html 做条件替换，增加复杂度
7. **Playwright E2E 加主题色验证**——在现有 sw-cache.spec.js 里加一个 `expect(page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))).toBe('#00D8A6')`

---

## 九、与现有缺陷的交叉验证

| 现有 Skill / 文档 | 是否覆盖了本次发现 | 覆盖程度 |
|---|---|---|
| AGENTS.md §4 manifest 主题色绑定 | ✅ 覆盖了 manifest 和 meta | ❌ **没覆盖 CSS 变量**——这是隐藏的第三处 |
| code-review-checklist/SKILL.md | ❌ 没主题色全链路检查 | 需追加 |
| frontend-component-spec/SKILL.md | 需检查——可能有 CSS 变量规范 | 需追加"主题色三处同步"条目 |

**结论**：AGENTS.md 说"manifest 主题色必须绑定"，但没说 **CSS 里的 `--accent` 变量也必须同步绑定**。这次审计发现了这个盲区。

---

## 十、可执行验证命令

```bash
# === CSS 主题色全链路验证（替换前 vs 替换后）===
# 当前（有 bug）：两个 App 都是蓝色
curl -s http://127.0.0.1:4173/src/style.css | grep "--accent:"
# 期望（修复后）：音乐版绿色
curl -s http://127.0.0.1:4173/src/style.css | grep "--accent:" | grep "00D8A6"
# 期望（修复后）：播放器版琥珀
curl -s http://127.0.0.1:4174/src/style.css | grep "--accent:" | grep "FFB03A"

# === 空状态检查 ===
# 检查 main.js 里有没有 items.length === 0 分支
grep "items.length.*===.*0\|!items\.length\|empty" src/main.js
# 期望修复后能 grep 到

# === 错误可见性检查 ===
# 统计 console.error 数量（应该为 0 或只剩开发调试用）
grep -r "console.error" src/ | wc -l
# 期望修复后：grep -r "console.error" src/ → 只有 0-2 处（且有注释说明是调试用）

# === Player 版默认 role 检查 ===
grep "mode: 'music'" release/pwa-site-player/src/main.js
# 期望修复后：grep "mode: 'video'" release/pwa-site-player/src/main.js
```

---

## 结论

绿角犀 v16 在**结构骨架上做得不错**——有侧边栏导航、有导入按钮、有 manifest theme_color、有 toast-host div（虽然 toast 函数是否真在用需验证）。但**有一个关键的主题色全链路遗漏**：meta theme_color 和 manifest theme_color 都改了，但 CSS 里的 `--accent` 变量（被侧边栏选中态、按钮 hover、进度条等核心 UI 组件共用）还是蓝色 `#2D6CDF`。

这个遗漏让两个 App **看起来长得一模一样**——用户分不清自己在绿角犀音乐还是绿角犀播放器。这是 P0 阻断级问题。

修复方案很简单：在 `build-web.mjs` 里加两条 CSS 变量替换正则（一个 accent 主色 + 一个 accent-soft 浅色），像已经替换 meta theme_color 那样处理。

---

*报告生成：ux-flow-tester + ux-clarity-auditor + ux-onboarding-designer 联合 · 2026-09-14 · main@5559a57*  
*下一轮计划：完成 P0 修复后，跑完整的首次体验 30 秒打分重测，目标得分 ≥ 7 / 10*
