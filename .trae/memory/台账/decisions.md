# 📜 决策台账 decisions.md

> 记录项目所有关键决策：**选了啥 / 为啥 / 备选方案 / 关联文件 / 相关坑**
> 编号规则：`DEC-YYYYMMDD-NNN`，每天递增。已入 Skill 的决策移至「📦 归档区」。
>
> 🆕 **追踪链机制**：每条决策带「相关坑/决策」列，让决策能追溯到触发它的坑，也能让坑追溯到解决方案。

---

## 🔵 活跃决策

| 编号 | 日期 | 决策项 | 选了啥 | 为什么 | 备选方案（为啥没选） | 关联文件 | **相关坑/决策** | 备注 |
| DEC-20261008-001 | 2026-10-08 | 视频播放 object-fit 策略：竖屏用 contain（完整），全屏切 cover（铺满） | src/style.css .vp-stage video | 无 | ISS-20261008-005 |
| DEC-20261008-002 | 2026-10-08 | 控制条 auto-hide 策略：3s 无操作淡出，中间透明层 vp-hint 温柔唤起；**禁止** video.click toggle 播放 | src/ui/videoPlayer.js | 单击画面触发播放/暂停（常见设计，但与唤起控制条冲突） | — |
| DEC-20261008-003 | 2026-10-08 | player role 把 import-folder 按钮**移到 topbar**（侧栏藏起来了用户找不到） | index.html、src/main.js | 放在隐藏的侧栏里 | ISS-20261008-003 ||---|---|---|---|---|---|---|---|---|
| DEC-20260914-001 | 2026-09-14 | Android 壳方案 | WebView 原生壳（Kotlin MainActivity） | TWA 依赖 Google Play Services，华为设备 GMS 缺失 → 无法全屏、显示浏览器地址栏；WebView 壳自带全屏、可打包离线资源、可拦截 URL | TWA（原方案，Google 官方但依赖 GMS） | clients/android-music/app/src/main/java/.../MainActivity.kt | → ISS-20260914-002、ISS-20260914-003 | 同时支持音乐和播放器两个 App |
| DEC-20260914-002 | 2026-09-14 | index.html 资源路径 | 改为相对路径 `./src/...` | WebView 加载本地 assets 时，绝对路径 `/src/...` 指向设备根 → 404；相对路径才能正确指向 assets 内文件 | 绝对路径 `/src/...`（浏览器 dev server 正常但 WebView 失效） | release/pwa-site-{music,player}/index.html | → ISS-20260914-001、🔥ISS-20260916-003 | 浏览器 dev server 下相对路径也能工作 |
| DEC-20260913-001 | 2026-09-13 | SW cache 版本管理 | sw.js 源码用 `'__SW_CACHE__'` 占位符，build-web.mjs 精确正则替换 | 之前硬编码 `'greenrhino-v14'` + 隐式正则匹配 → 版本号漂移风险；显式占位符 + 精确替换 = 双保险 | 硬编码版本号（隐式正则替换） | sw.js、scripts/build-web.mjs | → ISS-20260913-001 | 已补单元测试 6 条 + E2E 测试 4 条 |
| DEC-20260909-001 | 2026-09-09 | 双 App 拆版 | 音乐 green（`#00D8A6`）+ 播放器 amber（`#FFB03A`），同一套源码 build-web.mjs 按角色裁剪 | 单一 App 主题色冲突、manifest 不兼容、缓存污染、包名冲突 | 单一 App 内嵌两种主题 | AGENTS.md、scripts/build-web.mjs、icons/ | — | package_name 分别 `com.greenrhino.music` / `com.greenrhino.player` |
| DEC-20260909-002 | 2026-09-09 | 前端技术栈 | 原生 ES Module（零构建） | `src/` 浏览器直接加载，无需 bundler；构建工具只有两个自定义 Node 脚本 | Vite/Webpack（引入构建链、复杂度高） | AGENTS.md、src/ | — | 显式约束「不要引入 bundler 除非明确批准」 |
| DEC-20260914-003 | 2026-09-14 | UX 测试体系 | 4 个 Agent 分工 + 黑盒执行型 `ux-experience-tester` | 分析/审计/设计各有专长，再加一个能跑 Playwright 输出 PASS/FAIL+截图的执行型角色，闭环完整 | 单一大而全 Agent | .trae/agents/core/ux-experience-tester.md、.trae/skills/ux-test-playbook/SKILL.md | — | 可用户一句话触发 |
| DEC-20260914-004 | 2026-09-14 | 台账系统 | 项目级 5 文件（context/decisions/issues/index/daily）+ 会话层（.session-memory.md）+ 用户级共享层（shared-issues/shared-decisions）三层组织 + 成长型归类加级 + 五步闭环 | 项目特有 vs 跨项目通用分开存；会话临时 vs 长期台账分开存；成长型避免台账臃肿；五步闭环防止遗漏 | 单一大文件（臃肿，查找慢）或只在对话里记（容易丢） | .trae/memory/台账/、AGENTS.md §📚台账系统 | → 本决策自身迭代：从 4 文件 → 5 文件，6 条规则 → 五步闭环 | 每次对话自动读写 |
| DEC-20260914-005 | 2026-09-14 | Android 交接文档 | 新增 HANDOVER.md 作为 WebView 壳交接入口 | Android 壳迁移涉及大量具体细节（路径修复、console 桥接、测试状态），新 AI 接手时 3 分钟 TL;DR + 详细步骤比散落在对话历史里高效 | 靠对话历史恢复（易丢、耗时） | HANDOVER.md、clients/android-music/ | → ISS-20260914-001、ISS-20260916-001 | TL;DR + 详细技术栈 + 测试流程 |

---

## 📦 归档区

> 同一个决策被引用 ≥3 次 且 已沉淀进 Skill → 移至此处

（暂无，持续积累）
