# Skill: self-evolution-playbook — 自我进化可执行手册

> 自我进化工程师（self-evolution-engineer）的核心操作手册。每条都是**可以直接复制运行**的命令，跑完直接出审计结果。

---

## 一、版本号全链路一致性检查（5 秒跑完）

绿角犀有 **6 个地方** 必须同步版本号。任何一个漂移 = 立刻阻断：

```bash
# === 1. APP_VERSION（权威源）===
echo "=== scripts/build-web.mjs ==="
grep -n "APP_VERSION\s*=" scripts/build-web.mjs

# === 2. SW cache 名（必须和 APP_VERSION 同步）===
echo ""; echo "=== SW cache 名 ==="
grep -n "cache.*v\|'gr-" scripts/build-web.mjs | head -10
grep -n "gr-music-v\|gr-player-v" sw.js

# === 3. manifest.versionName ===
echo ""; echo "=== manifest version ==="
grep "version" release/pwa-site-music/manifest.webmanifest 2>/dev/null
grep "version" release/pwa-site-player/manifest.webmanifest 2>/dev/null

# === 4. Windows EXE 版本（.csproj）===
echo ""; echo "=== Windows csproj ==="
grep -r "VersionPrefix\|ApplicationVersion" clients/windows/ --include="*.csproj" 2>/dev/null

# === 5. Android TWA versionName ===
echo ""; echo "=== Android gradle ==="
grep -r "versionName\|versionCode" clients/android-*/app/build.gradle 2>/dev/null

# === 6. index.html window.__appVersion ===
echo ""; echo "=== index.html version ==="
grep "__appVersion" release/pwa-site-music/index.html 2>/dev/null
grep "__appVersion" release/pwa-site-player/index.html 2>/dev/null
```

### 漂移自动检测脚本
```bash
# 一键检测所有版本号是否一致
# 不一致时会打印 "❌ DRIFT DETECTED"
VERSION=$(grep "APP_VERSION\s*=" scripts/build-web.mjs | grep -oE "v[0-9]+" | head -1)
echo "权威版本: $VERSION"

# 检查 SW cache
if ! grep -q "gr-music-${VERSION}" scripts/build-web.mjs; then
  echo "❌ SW cache 名与 APP_VERSION 不一致"
fi

# 检查 index.html
if grep "__appVersion" release/pwa-site-music/index.html | grep -qv "$VERSION"; then
  echo "❌ music index.html 版本漂移"
fi

echo "✅ 版本链路检查完成"
```

---

## 二、SW cache 全链路验证

绿角犀最常见的版本号漂移场景：改了 `APP_VERSION` 但漏改 cache 名。

```bash
echo "=== SW cache 全链路 ==="
echo "--- scripts/build-web.mjs ---"
grep -n "cache:\|gr-music-\|gr-player-" scripts/build-web.mjs
echo ""
echo "--- sw.js ---"
grep -n "cache\|gr-music-\|gr-player-" sw.js
echo ""
echo "--- music release sw.js ---"
grep -n "cache\|gr-music-\|gr-player-" release/pwa-site-music/sw.js 2>/dev/null
echo ""
echo "--- player release sw.js ---"
grep -n "cache\|gr-music-\|gr-player-" release/pwa-site-player/sw.js 2>/dev/null
```

---

## 三、assetlinks.json 双份绑定验证

两个 App 的 package_name、域名、SHA256 指纹必须严格对应。

```bash
echo "=== 🎵 Music assetlinks ==="
cat release/pwa-site-music/.well-known/assetlinks.json 2>/dev/null
echo ""
echo "=== 🎬 Player assetlinks ==="
cat release/pwa-site-player/.well-known/assetlinks.json 2>/dev/null
echo ""

# 快速检查：music 里不能出现 com.greenrhino.player
if grep -q "com.greenrhino.player" release/pwa-site-music/.well-known/assetlinks.json 2>/dev/null; then
  echo "❌ Music assetlinks 里混入了 Player 包名！"
fi
if grep -q "com.greenrhino.music" release/pwa-site-player/.well-known/assetlinks.json 2>/dev/null; then
  echo "❌ Player assetlinks 里混入了 Music 包名！"
fi

echo "✅ assetlinks 检查完成"
```

---

## 四、theme_color 一致性验证

```bash
echo "=== 🎵 Music theme_color ==="
echo "--- manifest ---"
grep "theme_color" release/pwa-site-music/manifest.webmanifest 2>/dev/null
echo "--- build-web.mjs ---"
grep -A3 "androidPackage.*music" scripts/build-web.mjs | grep "theme_color"
echo "--- index.html meta ---"
grep "theme-color" release/pwa-site-music/index.html 2>/dev/null

echo ""
echo "=== 🎬 Player theme_color ==="
echo "--- manifest ---"
grep "theme_color" release/pwa-site-player/manifest.webmanifest 2>/dev/null
echo "--- build-web.mjs ---"
grep -A3 "androidPackage.*player" scripts/build-web.mjs | grep "theme_color"
echo "--- index.html meta ---"
grep "theme-color" release/pwa-site-player/index.html 2>/dev/null

# 快速漂移检测
MUSIC_MANIFEST=$(grep -oE '"theme_color":\s*"#[0-9A-Fa-f]+"' release/pwa-site-music/manifest.webmanifest)
MUSIC_BUILD=$(grep -A8 "winRole.*music\|role.*music" scripts/build-web.mjs | grep "theme_color" | grep -oE "#[0-9A-Fa-f]{6}")
if [ "$MUSIC_BUILD" != "00D8A6" ]; then
  echo "❌ Music theme_color 不是 #00D8A6！"
fi
```

---

## 五、代码库坏味道检测

### 5.1 重复代码（跨 src/ 模块）
```bash
# 找 30+ 行的重复代码块（跨文件）
# 方法：先导出所有函数签名，再找相似的
echo "=== 跨 src/ 函数签名 ==="
grep -rn "^export function\|^export const.*=>" src/ --include="*.js" | sort
echo ""
echo "=== 可能重复：同名函数不同文件 ==="
grep -rh "^export function\|^export const.*=>" src/ --include="*.js" | sed 's/(.*//' | sort | uniq -d
```

### 5.2 未使用模块（孤立 src/*.js）
```bash
# 哪些 src/*.js 没有被 main.js 或其他模块 import
echo "=== 所有 src/*.js 文件 ==="
ls src/*.js
echo ""
echo "=== main.js 里的 import ==="
grep "^import" src/main.js
echo ""
echo "=== 没有被 import 的文件（孤立模块）==="
for f in src/*.js; do
  base=$(basename "$f" .js)
  if ! grep -rq "from.*['\"]/${base}\|from.*['\"].*${base}" src/ --include="*.js" && [ "$base" != "main" ]; then
    echo "  ⚠️  $f — 可能未被使用"
  fi
done
```

### 5.3 过时依赖
```bash
echo "=== 过时依赖 ==="
npm outdated 2>&1
echo ""
echo "=== 安全漏洞 ==="
npm audit --audit-level high 2>&1 | tail -10
```

### 5.4 复杂度超标（圈复杂度 > 10 的函数）
```bash
# 简单近似：if/else/for/while/switch/case 语句过多的函数
echo "=== 高复杂度函数（近似检测）==="
grep -rn "function\|const.*=>" src/ --include="*.js" | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  lineno=$(echo "$line" | cut -d: -f2)
  # 统计该函数到下一个函数之间的控制流语句
  complexity=$(sed -n "${lineno},\$p" "$file" | head -n 50 | grep -cE "\bif\b|\belse if\b|\bfor\b|\bwhile\b|\bswitch\b|\bcase\b|\?")
  if [ "$complexity" -gt 8 ]; then
    echo "  🔴 $file:$lineno complexity≈$complexity"
  fi
done
```

### 5.5 硬编码颜色值（应该用 CSS 变量）
```bash
echo "=== src/ 里硬编码的颜色（应该用 --brand / --accent）==="
grep -rn "#[0-9A-Fa-f]\{6\}" src/ --include="*.css" --include="*.js" | grep -v "0E1116\|2D6CDF\|000000\|FFFFFF\|D6E4FB"
```

---

## 六、CI/CD 健康度监控

### 6.1 三套 workflow 最近 10 次成功率
```bash
# 需要先 gh auth login 或 GH_TOKEN
echo "=== 🤖 Workflow 成功率（最近 10 次）==="

for wf in build-android.yml build-windows.yml build-huawei.yml; do
  echo ""
  echo "--- $wf ---"
  gh run list --workflow="$wf" --limit 10 --json conclusion 2>/dev/null | \
    python3 -c "
import json,sys
data = json.load(sys.stdin)
success = sum(1 for r in data if r['conclusion']=='success')
total = len(data)
print(f'  ✅ {success}/{total} = {success/total*100:.0f}%' if total>0 else '  (无数据)')
if total - success > 0:
  fails = [r for r in data if r['conclusion']!='success'][:3]
  for f in fails:
    print(f'  🔴 失败: {f[\"conclusion\"]}')
" 2>/dev/null || echo "  (gh 未登录或无数据)"
done
```

### 6.2 运行时长趋势
```bash
echo "=== 运行时长（最近 5 次，秒）==="
for wf in build-android.yml build-windows.yml build-huawei.yml; do
  echo ""
  echo "--- $wf ---"
  gh run list --workflow="$wf" --limit 5 --json runDurationMs,status,conclusion 2>/dev/null | \
    python3 -c "
import json,sys
data = json.load(sys.stdin)
for i,r in enumerate(data):
    sec = r.get('runDurationMs',0)//1000
    status = r['conclusion']
    bar = '█' * (sec//10)
    print(f'  #{i+1} {sec:5d}s {bar} {status}')
" 2>/dev/null
done
```

---

## 七、Agent/Skill 定义审计

### 7.1 检查所有 Skill checklist 是否可自动化验证
```bash
echo "=== Skill 可验证性检查 ==="
find .trae/skills -name "SKILL.md" | while read skill; do
  echo ""
  echo "--- $skill ---"
  # 统计 checklist 条目
  checks=$(grep -c "^\- \[ \]" "$skill")
  auto=$(grep -c "grep\|rg \|node\|npm\|curl" "$skill")
  echo "  条目数: $checks, 含可执行命令: $auto"
  if [ "$checks" -gt 0 ] && [ "$auto" -eq 0 ]; then
    echo "  ⚠️  无自动化验证命令 — 追加 grep/rg 建议"
  fi
done
```

### 7.2 检查所有 Agent 输出契约是否可度量
```bash
echo "=== Agent 输出契约检查 ==="
for agent in .trae/agents/*.md; do
  echo ""
  echo "--- $(basename $agent) ---"
  has_contract=$(grep -c "输出契约\|Output\|必须.*输出" "$agent")
  echo "  输出契约条目: $has_contract"
  if [ "$has_contract" -eq 0 ]; then
    echo "  ⚠️  建议追加输出契约章节"
  fi
done
```

### 7.3 检查 AGENTS.md 不可变约束是否被覆盖
```bash
echo "=== AGENTS.md 不可变约束 vs Skill 覆盖 ==="
grep "## 不可变约束" -A 20 AGENTS.md | grep "^\d\." | while read constraint; do
  echo "约束: $constraint"
  # 检查是否有 Skill 提到这个约束的关键词
  keyword=$(echo "$constraint" | grep -oE "[a-zA-Z_]+")
  hit=$(grep -rl "$keyword" .trae/skills/ 2>/dev/null | head -1)
  if [ -n "$hit" ]; then
    echo "  ✅ $hit 已覆盖"
  else
    echo "  🔴 无 Skill 覆盖 — 需追加到某个 SKILL.md"
  fi
done
```

---

## 八、失败复盘四阶段（绿角犀真实案例库）

当某个 Agent 连续犯错时，按这个流程反哺 Skill：

### 阶段 1: Diagnose（定位根因）
> **案例**：code-reviewer 漏了 theme_color 检查
> 
> 现象：code-review-checklist P0 里没有 theme_color 条目 → 审查时自然跳过
> 根因：SKILL.md 的 checklist 是 v1 写的，那时候 theme_color 还是硬编码

### 阶段 2: Compile（编译成可执行条目）
> 把自然语言的检查要求编译成**可以 grep 验证**的条目：
> 
> ```
> - [ ] **theme_color 与角色一致**：`scripts/build-web.mjs` 里 music 的 theme_color 是 `#00D8A6`，player 的是 `#FFB03A`
>   - 验证命令：`grep -A3 "androidPackage.*music" scripts/build-web.mjs | grep "#00D8A6"`
> ```

### 阶段 3: Validate（验证修复）
```bash
# 在追加新条目到 SKILL.md 后，跑一遍确认
grep -c "theme_color" .trae/skills/code-review-checklist/SKILL.md
# → 期望 ≥ 1
```

### 阶段 4: Review（人类审核）
> 提交 PR，附：失败 commit hash + 根因分析 + 新条目 grep 验证通过的截图

### 绿角犀已发生的失败（应反哺但可能还没完全覆盖）

| 失败 | 根因 | 已反哺到 | 待补全 |
|---|---|---|---|
| Android workflow matrix 展开空 | YAML 结构 | code-review-checklist P0 | ✅ |
| YAML CRLF 被拒解析 | 缺 .gitattributes | code-review-checklist P0 | ✅ |
| Windows dotnet publish 空 | matrix.prop 在 bash 为空 | devops 故障速查 | ✅ |
| theme_color 硬编码深色 | 没与图标色绑定 | competitive-intel | ⚠️ 应也加到 code-review-checklist P0 |
| SW cache 名漂移 | 改版本没改 cache | AGENTS.md + code-review-checklist | ⚠️ 应加到 devops |
| assetlinks 指纹错 | keystore 换了没同步 | AGENTS.md + security-audit | ⚠️ 应加自动化验证脚本到 security-audit-guide |
| 🔴 **待追缉**：Windows workflow 退出码 1 偶发 | 脚本里 exit code 没检查 | ? | ❌ 应加到 devops + code-review-checklist |

---

## 九、市场 backlog → 任务拆解模板

把 `competitive-intel/SKILL.md` 里的功能拆成可分配任务：

```markdown
## 🎯 Sprint X — 任务拆解

### M-01 LRCLIB 在线歌词搜索

| 字段 | 值 |
|---|---|
| **来源** | competitive-intel SKILL.md M-01 |
| **目标** | 在 music 版加入 LRCLIB API 搜索 + IndexedDB 缓存 + 设置 Strict/Lax 开关 |
| **前端改动** | src/ 新增 lrcOnline.js（200行）、lrc.js 扩一个 onlineFetch 方法、ui/settings.js 加开关 |
| **后端改动** | server/index.js 新增代理 `/api/lrclib`（绕过 CORS）|
| **修改 build-web.mjs** | 把 lrcOnline.js 加入 music CORE |
| **测试** | unit-test-spec 里 metadata.test.js 加 online 模式 |
| **CI** | build-android.yml 的 assets 加 lrcOnline.js |
| **验收** | PWA 构建后能搜到歌词 → 断网后仍显示 → Strict/Lax 切换生效 |
| **预计** | 2-3 天 |
| **风险** | LRCLIB 无 rate limit 但可能限流 → 加 30s 缓存层 |
| **负责 Agent** | frontend-dev + backend-dev |
```

---

## 十、自我进化的自我约束（元规则）

> 这一节是给"自我进化工程师"自己看的，防止失控。

1. **进化方向有上限**：Skill 条目不应超过 50 条。超过说明 checklist 粒度过细，应该合并
2. **进化速度有下限**：每周至少 review 1 个 Agent/Skill，否则自我进化引擎在退化
3. **改进必须可回滚**：每次 Skill/Agent 改动必须有 commit hash + 失败证据 + 验证命令
4. **不进化自己**：self-evolution-engineer.md 这个文件只能由人类修改（防止元递归导致系统不稳定）
5. **进化的产物必须被消费**：追加的 Skill 条目必须在接下来 2 周内被某个 Agent 实际使用过。如果没人用 → 条目删掉

---

## 十一、审计报告输出（完整模板见同目录）

> 自我进化循环**必须**产出审计报告。每轮循环结束后，复制 `AUDIT_REPORT_TEMPLATE.md` 到 `.trae/documents/YYYY-MM-DD-self-evolution-audit-report.md`，按模板填空。

### 报告文件命名规则

```
.trae/documents/{YYYY-MM-DD}-self-evolution-audit-report.md
.trae/documents/{YYYY-MM-DD}-cycle-{短名}.md              # 缩写可选
```

### 循环完成判断标准（模板 §十二）

必须**全部 5 条**满足才算循环闭合：

| # | 标准 | 检查命令 |
|---|---|---|
| 1 | 所有 Bug 已修复 | `git diff HEAD~N..HEAD --stat` |
| 2 | 每个 Bug 有对应测试 | `test/` 目录有文件 + `npm run test:all` 全绿 |
| 3 | Skill / Agent 已反哺 | `grep -r "本轮关键词" .trae/skills/` |
| 4 | 线上验证完成（如有部署） | `curl -s https://{域名}/manifest.webmanifest` |
| 5 | 报告已 push 到 main | `git log --oneline .trae/documents/ | head -3` |

### 历史报告索引

> 下一轮循环时，更新这里，让人类一眼就能看到所有已完成的循环。

| 日期 | 报告 | 发现 Bug 数 | 核心产出 | 状态 |
|---|---|---|---|---|
| 2026-09-13 | [sw.js CACHE 占位符修复](../documents/2026-09-13-self-evolution-audit-report.md) | 2 | 显式占位符 + 10 条测试 + Skill 反哺 | ✅ CYCLE COMPLETE |

### 模板位置

```
.trae/skills/self-evolution-playbook/
├── SKILL.md                    # 本文件：执行手册
└── AUDIT_REPORT_TEMPLATE.md    # 🆕 审计报告输出模板（填空式，含示例）
```
