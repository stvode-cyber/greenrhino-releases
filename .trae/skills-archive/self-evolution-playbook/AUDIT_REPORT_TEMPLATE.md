# 自我进化循环审计报告模板

> 自我进化工程师每轮循环的**输出契约**。按此模板填写，所有章节可填充即视为循环完成。

**完整示例**：同目录下 `EXAMPLE_2026-09-13.md`（真实跑通的一轮，可直接参考）

---

## 🚀 快速上手（1 分钟看懂）

> 下面是把模板填完后的**样子**——来自 2026-09-13 真实循环，可直接当填空参考。

### 摘要页（模板 §二 填完后）

```markdown
| 指标 | 数值 |
|---|---|
| 审计检查项 | 27 |
| Bug 发现 | 4（🔴 2 / 🟠 1 / 🟡 1） |
| Bug 修复 | 4 |
| 单元测试新增 | 6 条（Node 原生 node:test） |
| E2E 测试新增 | 4 条（Playwright 1.63 + Edge） |
| Skill 反哺 | 4 个（code-review-checklist +2 / devops-engineer +3 / unit-test-spec +60行 / AGENTS.md +5行） |
| Commit 数 | 7 |
| 最终测试通过率 | 10/10（100%） |
```

### 根因分析（模板 §八 填完后）

```markdown
| 根因类型 | 是否命中 | 具体表现 |
|---|---|---|
| 隐式依赖 | ✅ | 两条正则掩盖源码硬编码 v14，新人以为是历史兼容 |
| 版本号多层传递无断言 | ✅ | APP_VERSION → cfg.cache → 替换进 sw.js，三层无测试 |
| 无 E2E 浏览器验证 | ✅ | 单元测 release 文本，但没测真实浏览器 SW 注册 |
| Skill 手册缺条目 | ✅ | code-review-checklist 没有 sw.js cache 占位符检查 |
| 新人看不懂 | ✅ | 隐式正则写成 replace(/'greenrhino-v\d+'/, ...) 看起来像"通用兜底" |
| 文档与代码漂移 | ❌ | AGENTS.md §5 只写了"隔离"没写占位符机制 |
```

### 循环完成判断（模板 §十二 填完后）

```markdown
| # | 标准 | 证据 | 结果 |
|---|---|---|---|
| 1 | 所有 Bug 已修复 | commit 1732157 + 76b8460 | ✅ |
| 2 | 每个 Bug 有测试 | test/build-sw-cache.test.js + test/e2e/sw-cache.spec.js，10/10 全绿 | ✅ |
| 3 | Skill / Agent 已反哺 | grep __SW_CACHE__ .trae/skills/ → 3 处新条目 | ✅ |
| 4 | 线上验证完成 | curl greenrhino-music.pages.dev/manifest → theme_color=#00D8A6 ✅ | ✅ |
| 5 | 报告已 push | .trae/documents/2026-09-13-self-evolution-audit-report.md 在 main 分支 | ✅ |
→ **结论：CYCLE COMPLETE**
```

---

## 📚 示例速查表

> 模板的每个章节，在 `EXAMPLE_2026-09-13.md` 里都有对应的真实内容。下表告诉你去哪找。

| 模板章节 | 示例位置 | 示例亮点 |
|---|---|---|
| §一 头部元数据 | EXAMPLE §头部 | 状态写 CYCLE COMPLETE，列出审计范围 |
| §二 摘要 | EXAMPLE §摘要 | 10 个指标全有数字 |
| §三 Bug 修复 | EXAMPLE §一 | Bug-1 隐式正则脆弱性 + Bug-2 theme_color 未差异化 |
| §四 测试覆盖 | EXAMPLE §二 | 双层防护架构图 + 反向验证步骤 |
| §五 Git 提交链 | EXAMPLE §三 | 7 个 commit 的 hash + 文件数 + 类型 |
| §六 Skill 反哺 | EXAMPLE §四 | 4 个 Skill/Agent 共约 70 行新内容 |
| §七 线上验证 | EXAMPLE §五-§六 | Cloudflare Pages 6 项全 PASS + CI 三套 SUCCESS |
| §八 根因分析 | EXAMPLE §七 | 3 个命中的根因类型详细分析 |
| §九 改进措施 | EXAMPLE §八 | 7 项对照表 |
| §十 后续建议 | EXAMPLE §九 | 低/中/高 三档共 8 条 |
| §十一 审计命令 | EXAMPLE §十 | 10 条可复制 grep/curl/gh run |
| §十二 循环判断 | 本文件 §十二 | 5 条全满足才算闭合 |

---

## 使用方法

1. 复制本文件到 `.trae/documents/{YYYY-MM-DD}-self-evolution-audit-report.md`
2. 参考 `EXAMPLE_2026-09-13.md`，把 `{占位符}` 替换成实际数据
3. 跑完整轮循环后 push 到仓库

---

## 一、头部元数据

```markdown
# 🧬 自我进化循环审计报告

> **项目**：{项目名} v{版本号}
> **日期**：{YYYY-MM-DD}
> **执行 Agent**：self-evolution-engineer
> **审计范围**：§1 版本号 → §N {实际章节}
> **状态**：✅ CYCLE COMPLETE | 🔶 PARTIAL | ❌ BLOCKED
```

---

## 二、摘要（关键数据一页纸）

> 用数字说话，让任何人 30 秒内理解本轮产出。

| 指标 | 数值 |
|---|---|
| 审计检查项 | {数字} |
| Bug 发现 | {数字}（🔴 阻断 / 🟠 严重 / 🟡 建议） |
| Bug 修复 | {数字} |
| 单元测试新增 | {数字} 条（框架：{node:test / vitest / 其他}） |
| E2E 测试新增 | {数字} 条（框架：{playwright / 其他}） |
| Skill 反哺 | {N 个 Skill，共 M 条新内容} |
| Agent 定义反哺 | {N 个 Agent，共 M 条新内容} |
| Commit 数 | {数字} |
| 改动文件数 | {数字} |
| 最终测试通过率 | {X/Y（百分比）} |

---

## 三、Bug 发现与修复

> 每个 Bug 按以下格式记录。至少写清楚：**是什么 → 怎么发现的 → 影响链 → 怎么修的**。

### Bug-{N} {级别} {一句话标题}

**发现章节**：§{章节号} {章节名}  
**发现方式**：{grep 命令 / 代码审查 / 运行时错误 / 单元测试 fail}  
**原始代码**：

{贴出 buggy 代码片段，最多 10 行}

**影响链**：
```
{第一环}
  → {第二环}
  → ...
  → {最终用户可见的问题}
```

**修复**（commit `{hash}`）：
```
{修复后的代码片段 / 改了哪些文件 / 核心改动}
```

**为什么之前没被发现**：{隐式依赖 / 无测试覆盖 / 文档没写 / 新人不知道}

---

## 四、测试覆盖

### 双层防护架构图

> 如果跑了单元 + E2E，画这个图；只跑了一层，标注"本轮仅单元"或"本轮仅 E2E"。

```
┌─────────────────────────────────────────────────────┐
│                 npm run test:all                     │
│                                                     │
│  ┌─ test/{路径}.test.js ─────────────────────────┐  │
│  │  框架: {框架名}                                  │  │
│  │  跑时: {Xms}                                    │  │
│  │  数量: {N}                                      │  │
│  │                                                 │  │
│  │  ✔ {测试 1 断言}                                 │  │
│  │  ✔ {测试 2 断言}                                 │  │
│  │  ✔ ...                                          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ test/e2e/{路径}.spec.js ──────────────────────┐  │
│  │  框架: {playwright + 浏览器}                     │  │
│  │  跑时: {Xs}                                     │  │
│  │  数量: {N}                                      │  │
│  │                                                 │  │
│  │  ✔ {E2E 场景 1}                                 │  │
│  │  ✔ {E2E 场景 2}                                 │  │
│  │  ✔ ...                                          │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 反向验证

> **必须**做。证明测试真的能防回归，而不是摆设。

```bash
# 1. 故意改坏
{具体怎么改坏的，例如：sw.js: '__SW_CACHE__' → 'greenrhino-v99'}

# 2. 跑测试 → 应该 fail
{跑测试的命令 + 预期多少条 fail}

# 3. 恢复 → 应该全部 pass
{恢复后的命令 + 预期全部 pass}
```

---

## 五、Git 提交链（可追溯证据）

> 必须包含每个 commit 的 hash、类型、文件数。让后人能 `git show` 看到具体改了什么。

| Commit | 说明 | 文件数 | 类型 |
|---|---|---|---|
| `{短 hash}` | {commit message} | {N} | Bug 修复 / 测试 / CI / 文档 / Skill 反哺 |
| ... | ... | ... | ... |

**快速生成命令**：
```bash
git log --oneline --reverse HEAD~{N}..HEAD
git log --oneline -10 --numstat | head -40
```

---

## 六、Skill / Agent 反哺清单

> 自我进化工程师的核心产出——让"下一次不再踩同样的坑"。

### Skill 反哺

| Skill | 追加条目 | 反哺了什么 |
|---|---|---|
| `code-review-checklist/SKILL.md` | P0 +{N} 条 | {具体加了什么} |
| `unit-test-spec/SKILL.md` | +{N} 行 / 新章节 "{章节名}" | {具体加了什么} |
| ... | ... | ... |

**示例（2026-09-13 真实反哺）**：
```markdown
| code-review-checklist | P0 +2 | sw.js 占位符检查 / .gitattributes LF 检查 |
| devops-engineer.md    | 故障速查 +3 | YAML matrix 空展开 / sw.js cache 名错 / CI 单套在跑 |
| unit-test-spec/SKILL.md | +60 行 | 新增"SW cache 测试矩阵"完整章节 |
| AGENTS.md             | §5 +3 条子约束 | 占位符禁止硬编码 / 精确替换逻辑 / 测试覆盖要求 |
```

### Agent 定义反哺

| Agent | 改动 | 原因 |
|---|---|---|
| `devops-engineer.md` | 故障速查表 +{N} 行 | 本轮 CI 踩了什么坑 |
| `self-evolution-engineer.md` | §8 失败复盘 +{N} 条 | 本轮学到了什么 |

---

## 七、线上部署验证

> 如果改了 PWA / Web 相关，**必须**验证线上产物正确。没部署就写"本轮未部署"。

### Cloudflare Pages

| 检查项 | {域名 1} | {域名 2} | 状态 |
|---|---|---|---|
| manifest.theme_color | {值} ✅ / ❌ | {值} ✅ / ❌ | PASS / FAIL |
| sw.js CACHE 名 | {值} ✅ / ❌ | {值} ✅ / ❌ | PASS / FAIL |
| assetlinks.json package_name | {值} ✅ / ❌ | {值} ✅ / ❌ | PASS / FAIL |
| assetlinks.json SHA256 | {值} ✅ / ❌ | {值} ✅ / ❌ | PASS / FAIL |

**验证命令**：
```bash
curl -s https://{域名}/manifest.webmanifest | grep theme_color
curl -s https://{域名}/sw.js | grep "const CACHE"
curl -s https://{域名}/.well-known/assetlinks.json
```

### CI/CD 健康度

| Workflow | 最近状态 | 平均运行时长 | Artifact |
|---|---|---|---|
| `build-{xxx}.yml` | ✅ SUCCESS × {N} | {时间} | {产物名} |

**验证命令**：
```bash
gh run list --limit 10
```

---

## 八、根因分析

> **最重要的章节**。为什么这个 bug 能潜伏这么久？不写这节，循环就没真正闭合。

从以下角度选（命中的打 ✅，没命中的写 ❌ 加一句为什么没有）：

| 根因类型 | 是否命中 | 具体表现 |
|---|---|---|
| **隐式依赖** | ✅ / ❌ | {例如：两条正则掩盖了源码硬编码} |
| **版本号多层传递无断言** | ✅ / ❌ | {例如：APP_VERSION → cfg.cache → 替换进 sw.js，三层无测试} |
| **无 E2E 浏览器验证** | ✅ / ❌ | {例如：单元测 release 文本，但没测真实浏览器 SW 注册} |
| **文档与代码漂移** | ✅ / ❌ | {例如：AGENTS.md 说 cache 隔离，但没写占位符机制} |
| **Skill 手册缺条目** | ✅ / ❌ | {例如：code-review-checklist 没有 sw.js cache 检查} |
| **新人看不懂** | ✅ / ❌ | {例如：隐式正则看起来像历史兼容，不会想到源码本身错了} |

---

## 九、改进措施（已落地）

> 每条措施必须标注：落地文件 + 怎么改的 + 为什么这样改。

| 问题 | 改进 | 落地文件 | 改了什么 |
|---|---|---|---|
| {问题 1} | {改进方案} | {文件路径} | {核心改动} |
| ... | ... | ... | ... |

---

## 十、后续建议

> 按风险分级。低风险 = 本周就能做；中风险 = 下个版本；高风险 = 需要设计评审。

### 🟢 低风险 · 可立即做

1. **{建议 1}**：{一句话说明}
2. ...

### 🟡 中风险 · 下个版本做

1. **{建议 1}**：{一句话说明}
2. ...

### 🔴 高风险 · 需要设计评审

1. **{建议 1}**：{一句话说明为什么风险高}
2. ...

---

## 十一、可执行审计命令速查

> 每条命令都是**可直接复制跑**的。跑出来的输出就是下一轮循环的证据。

```bash
# === §1 版本号全链路 ===
# 检查版本号在所有需要同步的地方是否一致
grep -r '{当前版本}' {版本号定义文件} {所有产物/配置}

# === §2 SW cache / 关键构建 ===
# 检查占位符存在 + release 产物正确
grep '__SW_CACHE__' {源码文件}
grep '{期望 cache 名}' {release 产物}

# === §3 多角色产物隔离 ===
# 检查两个角色产物没有互相泄漏
grep -v '{角色 A 特有内容}' {角色 B 产物}

# === §4 部署验证 ===
curl -s https://{域名}/manifest.webmanifest | grep '{要检查的字段}'
curl -s https://{域名}/.well-known/{well-known 文件名}

# === §5 测试 ===
{跑全量测试的命令}
{跑单元测试的命令}
{跑 E2E 测试的命令}

# === §6 CI 健康度 ===
gh run list --limit {N}
# 或：gh run view {run_id}

# === §7 Agent/Skill 审计 ===
# 检查 Skill 是否有可执行命令
grep -l -r 'node\|python\|curl\|gh ' .trae/skills/*/SKILL.md
# 检查 Agent 是否有输出契约
grep -l '输出契约' .trae/agents/*.md
```

---

## 十二、循环完成判断标准

> 满足**所有 5 条**才算一轮自我进化循环真正结束。任何一条不满足，循环有缺口。

| # | 标准 | 检查方式 |
|---|---|---|
| 1 | 所有发现的 Bug 已修复 | `git diff HEAD~N..HEAD --stat` 能看到修复 commit |
| 2 | 每个 Bug 都有对应测试（防止回归） | `test/` 目录有对应文件，`npm run test:all` 全绿 |
| 3 | Skill / Agent 定义已反哺 | `grep -r "本轮关键词" .trae/` 能搜到新条目 |
| 4 | 线上验证完成（如有部署） | curl 命令输出与期望一致 |
| 5 | 审计报告已 push | `.trae/documents/YYYY-MM-DD-self-evolution-audit-report.md` 存在于 main 分支 |

---

*模板版本：v1 · 2026-09-13 · 基于 sw.js CACHE 占位符修复循环提炼*
