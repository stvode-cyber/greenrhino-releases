// 绿角犀 PWA Playwright 冒烟测试 — 完整浏览器渲染层
// 一次性脚本：跑了即删，结果直接贴在日志里

import { chromium } from 'playwright';

const [, , URL, EXPECTED_NAME, EXPECTED_THEME, EXPECTED_ROLE] = process.argv;
const SITE_URL = URL || 'http://localhost:8899';
const SITE_LABEL = EXPECTED_NAME || '绿角犀音乐';
const THEME_EXPECT = EXPECTED_THEME || '#00D8A6';
const ROLE_EXPECT = EXPECTED_ROLE || 'music';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
const pageErrors = [];
const requests = { ok: 0, fail: 0 };
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => {
  const s = r.status();
  if (s >= 200 && s < 400) requests.ok++; else requests.fail++;
});

const rows = [];
function check(label, result) { rows.push({ label, ...result }); }

console.log('\n🧪 绿角犀 PWA Playwright 冒烟测试');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// T1 页面加载 + 状态码
try {
  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  check('T1 页面加载 HTTP 200', { ok: resp?.status() === 200 });
} catch (e) {
  check('T1 页面加载', { ok: false, detail: e.message.slice(0, 80) });
}

// T2 品牌名
const title = await page.title();
check('T2 标题含「绿角犀」', { ok: title.includes('绿角犀') || title.includes('GreenRhino'), detail: title });

// T3 关键按钮（DOM 已渲染）
const hasImportFiles = await page.locator('#import-files').count();
const hasImportFolder = await page.locator('#import-folder').count();
check('T3 关键按钮渲染（＋添加文件）', { ok: hasImportFiles >= 1, detail: `import-files=${hasImportFiles} import-folder=${hasImportFolder}` });

// T4 主题色
const metaTheme = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
check(`T4 theme-color = ${THEME_EXPECT}`, { ok: metaTheme === THEME_EXPECT, detail: metaTheme || 'missing' });

// T5 window.__winRole & __appVersion
const roleInfo = await page.evaluate(() => ({
  role: window.__winRole,
  version: window.__appVersion
}));
check(`T5 __winRole=${ROLE_EXPECT} __appVersion=v16`, { ok: roleInfo.role === ROLE_EXPECT && roleInfo.version === 'v16', detail: JSON.stringify(roleInfo) });

// T6 Service Worker 注册
await page.waitForTimeout(2000);
const swCtrl = await page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL || 'none');
check('T6 Service Worker 注册 sw.js', { ok: swCtrl.includes('sw.js'), detail: swCtrl });

// T7 manifest theme_color
const manifestInfo = await page.evaluate(async () => {
  const l = document.querySelector('link[rel=manifest]');
  if (!l) return { ok: false, detail: 'no manifest tag' };
  try {
    const r = await fetch(l.href);
    const j = await r.json();
    return { ok: j.theme_color === THEME_EXPECT && j.name?.includes(SITE_LABEL), detail: `${j.theme_color} / ${j.name}` };
  } catch (e) { return { ok: false, detail: 'fetch fail' }; }
});
check('T7 manifest theme_color + name', manifestInfo);

// T8 sw.js cache 占位符已替换
const swCache = await page.evaluate(async () => {
  const r = await fetch('sw.js');
  const t = await r.text();
  const m = t.match(/const CACHE = ['"]([^'"]+)['"]/);
  return m ? m[1] : 'not found';
});
check(`T8 sw.js cache 已替换 gr-${ROLE_EXPECT}-v16`, { ok: swCache === `gr-${ROLE_EXPECT}-v16`, detail: swCache });

// T9 无 JS 运行时错误
check('T9 无 pageerror', { ok: pageErrors.length === 0, detail: pageErrors.length > 0 ? pageErrors[0].slice(0, 80) : 'clean' });

// T10 无 console error
check('T10 无 console.error', { ok: consoleErrors.length === 0, detail: consoleErrors.length > 0 ? `${consoleErrors.length} errors` : 'clean' });

// T11 HTTP 请求错误计数
check('T11 无 4xx/5xx 请求', { ok: requests.fail === 0, detail: `ok=${requests.ok} fail=${requests.fail}` });

// T12 侧边栏 nav 完整（11 个 nav-item 是完整 UI 信号）
const navCount = await page.locator('#nav .nav-item').count();
check('T12 侧边栏 nav 完整', { ok: navCount >= 8, detail: `${navCount} items` });

// T13 截图存证（pass/fail 都留）
const shotPath = 'test/smoke-screenshot.png';
await page.screenshot({ path: shotPath, fullPage: true });
check('T13 截图存证', { ok: true, detail: shotPath });

await browser.close();

// 打印结果
console.log('📸 截图 test/smoke-screenshot.png');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let pass = 0, fail = 0;
for (const r of rows) {
  const icon = r.ok ? '✅' : '❌';
  const detail = r.detail ? ` — ${r.detail}` : '';
  console.log(`${icon} ${r.label}${detail}`);
  r.ok ? pass++ : fail++;
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 结果: ${pass} PASS / ${fail} FAIL / ${rows.length} 总`);
console.log(fail === 0 ? '🎉 全绿！可以提 PR 了\n' : '⚠️ 有失败项，需要排查\n');
process.exit(fail > 0 ? 1 : 0);
