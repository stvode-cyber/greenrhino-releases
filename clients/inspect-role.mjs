import { chromium } from 'playwright';
const job = process.argv[2] || 'player'; // player | music
const url = job === 'player' ? 'https://greenrhino-player.pages.dev/' : 'https://greenrhino-music.pages.dev/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, colorScheme: 'dark' });
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
// list all section titles visible
const titles = await page.$$eval('main h2, main h3, [id^="view"] h2, [id^="view"] h3', els => els.map(e => e.textContent.trim()));
console.log('ROLE:', await page.evaluate(() => window.__winRole));
console.log('SECTION TITLES:', JSON.stringify(titles));
// list nav items
const nav = await page.$$eval('nav .nav-item', els => els.map(e => e.getAttribute('data-view') + ':' + e.textContent.trim()));
console.log('NAV:', JSON.stringify(nav));
// count library sections
const libs = await page.$$eval('[class*="lib"], [data-lib], [id*="video"], [id*="music"]', els => els.length);
const html = await page.evaluate(() => { const s = document.querySelector('#view'); return s ? s.innerHTML.slice(0, 2600) : 'NO #view'; });
console.log('--- VIEW HTML ---');
console.log(html);
console.log('lib-ish els count:', libs);
await browser.close();