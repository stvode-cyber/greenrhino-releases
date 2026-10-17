# UX 黑盒测试手册（ux-test-playbook）

> `ux-experience-tester` Agent 的操作手册。self-evolution-engineer 应定期扫描本文件、补充新发现的反模式和一键化机会。

---

## 一、快速启动（零配置）

```bash
# 1. 起本地服务（两个端口）
python -m http.server 4173 --directory release/pwa-site-music
python -m http.server 4174 --directory release/pwa-site-player

# 2. 冒烟测试（默认）
npx playwright test test/e2e/sw-cache.spec.js  # 已有的 SW 测试
# 或者跑 ux-experience-tester 写的新 spec
npx playwright test test/ux-smoke.spec.js

# 3. 单文件跑 + 看浏览器
npx playwright test test/ux-smoke.spec.js --headed --browser=edge

# 4. 真机测试（已连的华为手机）
adb shell am start -n com.greenrhino.music/com.google.androidbrowserhelper.trusted.LauncherActivity
adb logcat -s "greenrhino" "BrowserHelper"
```

---

## 二、常见 UX 反模式清单（持续补充）

> self-evolution-engineer 每轮审计时，发现新的反模式 → 追加到这里。ux-experience-tester 写测试时 → 自动覆盖这些。

### 🔴 P0 级（用户会卡住）

| # | 反模式 | 绿角犀现状 | 检测方法 | 修复模板 |
|---|---|---|---|---|
| AP-001 | **空库状态无引导** | 🟡 部分（有侧边栏导入按钮，但主内容区空白） | Playwright：打开 App → 截图 → 检查有没有 `#empty-state` 元素 | 在 main.js 加 `if (items.length === 0)` → 显示引导卡片 |
| AP-002 | **错误被吞（console.error）** | 🔴 确认（12+ 处） | `grep -r "console.error" src/` → 应该 ≤ 2 处 | 封装 `window.showToast(msg, type)` → 逐处替换 |
| AP-003 | **断网白屏** | ❓ 未测 | Playwright：`page.context.setOffline(True)` → 刷新 → 看有没有显示"离线" | 加 `offline` 事件监听 → 显示 banner |
| AP-004 | **导入非媒体文件崩溃** | ❓ 未测 | Playwright：上传 `.exe` / `.txt` → 看有没有异常 | 在 FilePicker 里 MIME type 过滤 + try/catch |

### 🟠 P1 级（用户困惑）

| # | 反模式 | 绿角犀现状 | 检测方法 | 修复模板 |
|---|---|---|---|---|
| AP-005 | **搜索 placeholder 模糊** | 🔴 确认（"搜索音乐/视频…"没说范围） | Playwright：`page.locator('#search').getAttribute('placeholder')` → 应该含"标题/艺术家/文件名" | 改成 "按 标题 / 艺术家 / 文件名 搜索" |
| AP-006 | **导入完成无上下文** | 🔴 确认（"✓ 完成"不知道然后呢） | Playwright：导入后 → 看有没有显示 "✓ 已导入 N 首" | 加计数 + 下一步建议 |
| AP-007 | **主题色没按角色差异化** | 🔴 确认（CSS --accent 两个 App 都是蓝色） | Playwright：`getComputedStyle(document.documentElement).getPropertyValue('--accent')` → 音乐版应为 #00D8A6 | build-web.mjs 加 style.css 正则替换 |
| AP-008 | **Player 版默认 role 错误** | 🔴 确认（main.js 默认 mode='music'） | `grep "mode: 'music'" release/pwa-site-player/src/main.js` | build-web.mjs 加 main.js role 替换 |
| AP-009 | **没有取消正在进行的操作** | 🟡 导入中能不能取消？ | Playwright：开始导入 → 等 2s → 点取消 | 加取消按钮 + AbortController |
| AP-010 | **文件选择器取消后 App 报错** | ❓ 未测 | Playwright：点导入 → 文件选择器 → 取消 → 看 console | try/catch 包裹 FilePicker API |

### 🟡 P2 级（体验可以更好）

| # | 反模式 | 绿角犀现状 | 检测方法 | 修复模板 |
|---|---|---|---|---|
| AP-011 | **没有快捷键** | ❓ 未测 | Playwright：按 Space 播放/暂停 | 加 `keydown` 监听（Space=播放/暂停, ←→=切歌） |
| AP-012 | **没有深色/浅色切换** | 🟡 只有深色 | Playwright：检查有没有 theme toggle 按钮 | 加切换 + 记住用户选择 |
| AP-013 | **不记住上次浏览路径** | ❓ 未测 | Playwright：导入 → 关闭 App → 重开 → 再点导入 → 看路径是否回到上次 | localStorage 存 lastImportPath |
| AP-014 | **侧边栏太宽/太窄** | ❓ 未测 | 不同分辨率下 Playwright screenshot diff | 响应式 + 可折叠 |
| AP-015 | **首次使用没有 tooltip** | ❓ 未测 | Playwright：首次打开 → 看有没有引导气泡 | 加 FirstRunOverlay 组件 |

### 新增反模式入口

> self-evolution-engineer 或 ux-experience-tester 发现新问题时，按以下格式追加：
>
> ```markdown
> | AP-{NNN} | 一句话描述 | 🔴/🟠/🟡 | 怎么测 | 怎么修 |
> ```

---

## 三、一键化机会识别规则（可量化）

> 识别"哪些操作可以从 N 步变成 1 步"。每条规则都有**检测方法**和**修复模板**。

| 规则 ID | 规则描述 | 检测方法 | 修复模板 | 预期节省 |
|---|---|---|---|---|
| OC-01 | **A 事件后 90% 概率触发 B**（可自动） | Playwright 记录用户行为序列 → 统计 P(B\|A) | 监听 A 事件 → 自动执行 B | 3-5 步 |
| OC-02 | **同一功能入口 ≥ 2 次点击才能到达** | Playwright 记录元素点击路径 → 深度 ≥ 3 | 合并到主按钮 / 提升层级 | 1-2 步 |
| OC-03 | **每次打开都要重复同样操作** | localStorage 空 → 用户每次手动设置 | localStorage 记住 → 自动恢复 | 2-3 步 |
| OC-04 | **可以用快捷键/手势替代** | 检查有没有 keydown/touch 监听 | 加监听 + 文档化 | 1 步 + 更快 |
| OC-05 | **跨 App 重复相同配置** | diff 两个 App 的 settings 对象 | 抽到共享的 settings store | 5+ 步 |
| OC-06 | **导入/加载后有明显的"下一步"但没自动做** | Playwright：导入完成 → 等 3s → 看有没有自动跳转/播放 | 完成回调 → 自动 trigger 下一步 | 2-3 步 |
| OC-07 | **空状态没有默认行动建议** | Playwright：空库 → 看有没有引导按钮 | 空状态卡片 → 大号主按钮 | 用户不迷路 |

### 一键化机会输出模板

```markdown
| 机会 ID | 来源规则 | 当前流程 | 建议流程 | 节省步数 | 实现难度 | 影响比例 |
|---|---|---|---|---|---|---|
| OC-06-01 | 导入后自动播放 | 导入 → 切tab → 点第一首（3步） | 导入 → 自动播第1首（0步） | 3 | 低 | 100% |
| OC-03-01 | 记住导入路径 | 每次浏览到上次目录（3步） | 打开就是上次路径（0步） | 3 | 低 | 30% |
```

---

## 四、黑盒测试流程模板

> 每个测试套件都按这个结构写 Playwright spec。

### 模板 1：冒烟测试（smoke.spec.js）

```javascript
// 结构：每个核心功能 1 个 test，全 PASS 才算通过
test('🎵 音乐版首页能正常加载', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#search')).toBeVisible();
});

test('🎬 播放器版首页能正常加载', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('🎨 两个 App 主题色不同', async ({ browser }) => {
  const m = await browser.newPage(); await m.goto('http://127.0.0.1:4173/');
  const p = await browser.newPage(); await p.goto('http://127.0.0.1:4174/');
  const mAccent = await m.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  const pAccent = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  expect(mAccent).not.toBe(pAccent);  // 不同 App 应该有不同 accent
});

test('📡 Service Worker 注册成功', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await expect.poll(async () => (await page.evaluate(() =>
    navigator.serviceWorker.controller?.activeState
  ))).toBe('activated');
});
```

### 模板 2：异常测试（edge-case.spec.js）

```javascript
// 结构：每个异常场景 1 个 test
test('📡 断网后不白屏', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await page.context().setOffline(true);
  await page.reload();
  // 不应该白屏
  await expect(page.locator('body').innerHTML.length).toBeGreaterThan(100);
  // 应该有离线提示
  await expect(page.getByText(/离线|offline/i)).toBeVisible();
});

test('📁 非媒体文件静默跳过', async ({ page }) => {
  // ... mock file input，上传 .exe
  // 期望：不崩溃，console 有 warn 但无 error
});

test('⚡ 连续快速点击不状态错乱', async ({ page }) => {
  // 连续点播放/暂停 20 次
  for (let i = 0; i < 20; i++) await page.click('#play-btn');
  // 期望：最终状态是 valid（要么 playing 要么 paused）
});
```

### 模板 3：兼容性测试（compatibility.spec.js）

```javascript
// 结构：用 Playwright 的 browserName 参数化
// playwright.config.js 里配置 projects: [ {browserName: 'chromium'}, {browserName: 'firefox'}, ... ]

test('🖥️ 桌面分辨率 1920x1080 侧边栏正常', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#sidebar')).toHaveScreenshot('sidebar-1920.png');
});

test('📱 手机分辨率 390x844 不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/');
  // 检查没有元素水平溢出
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

---

## 五、Nielsen 可用性启发式原则（打分表）

> 测试完成后，对照这 10 条打分。每条 1-5 分，总分 /50。

| # | 原则 | 评分标准（1-5） | 绿角犀自检 |
|---|---|---|---|
| 1 | **系统状态可见性** | 1=什么反馈都没有 → 5=每步都有明确进度 | 导入有进度 ✅ / 播放加载没反馈 ❌ / 错误没提示 ❌ |
| 2 | **系统与真实世界匹配** | 1=全技术术语 → 5=全是用户语言 | "✓ 完成" ❌（没上下文）/ "导入文件夹" ✅ |
| 3 | **用户控制与自由** | 1=不能取消/撤销 → 5=每步都能撤销 | 导入能取消？❓ / 错误能重试？❌ |
| 4 | **一致性与标准** | 1=每个页面风格不同 → 5=完全一致 | 侧边栏两个 App 一致 ✅ / accent 颜色没差异化 ❌ |
| 5 | **错误预防** | 1=用户随时能触发崩溃 → 5=危险操作自动拦截 | 非媒体文件导入会怎样？❓ / 删除有确认？❓ |
| 6 | **识别而非回忆** | 1=全靠记忆操作 → 5=全靠图标/文案识别 | 侧边栏图标+文字 ✅ / 没有快捷键入口 ❌ |
| 7 | **灵活与高效** | 1=只能鼠标点 → 5=快捷键/批量/手势都支持 | 没有快捷键 ❌ / 没有批量操作 ❌ |
| 8 | **美学与极简** | 1=信息过载 → 5=刚好够用 | 空库太干净（只有搜索框）❌ |
| 9 | **帮助识别/恢复错误** | 1=错误白屏 → 5=错误+原因+重试 | console.error 全吞 ❌ |
| 10 | **帮助与文档** | 1=无帮助入口 → 5=首次引导+帮助中心 | 有❓帮助入口 / 无首次引导 ❌ |

**快速打分命令**（ux-experience-tester 跑测试时自动填）：
```
综合可用性得分 = (10 条打分之和) × 2 → 满分 100
绿角犀当前预估：约 42/100（错误吞 + 空状态 + 快捷键 三项拉分严重）
```

---

## 六、反模式 → Playwright 测试 自动映射

> self-evolution-engineer 可以把 §二 里的每个反模式自动生成一个 Playwright test stub。
> ux-experience-tester 跑测试时 → FAIL 的反模式自动出现在报告里。

```
AP-001 空库无引导    → test('空状态应该有引导卡片', ...)   → PASS/FAIL
AP-002 错误被吞      → test('断网应该显示 banner', ...)   → PASS/FAIL  
AP-003 断网白屏      → test('console.error 数量应 ≤ 2', ...) → PASS/FAIL（grep）
AP-007 主题色没差异化 → test('两个 App accent 应不同', ...) → PASS/FAIL
...
```

---

## 七、与其他 Skill 的协作

| Skill | 协作点 |
|---|---|
| `ux-evaluation-guide` | 共享用户画像 / 严重度定义 / 场景速查表 |
| `code-review-checklist` | 反模式 AP-xxx → 追加到 P0/P1 检查条目 |
| `unit-test-spec` | 一键化机会 → 追加测试用例 |
| `self-evolution-playbook` | 本手册新发现 → self-evolution 反哺循环 |

---

## 八、交付物命名规范

```
.trae/documents/
├── ux-test-{YYYY-MM-DD}-smoke.md          # 冒烟测试报告
├── ux-test-{YYYY-MM-DD}-edge-case.md      # 异常测试报告
├── ux-test-{YYYY-MM-DD}-compatibility.md  # 兼容性测试报告
├── ux-test-{YYYY-MM-DD}-one-click.md      # 一键化机会清单
└── ux-test-{YYYY-MM-DD}-full.md           # 完整测试报告（综合以上）
```

---

*手册版本：v1 · 2026-09-14 · 由 self-evolution-engineer 持续进化*  
*self-evolution 扫描规则：每次跑完测试后，新发现的反模式追加到 §二 对应级别表末尾*
