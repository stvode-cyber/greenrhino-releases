import { chromium } from 'playwright';
import path from 'node:path';

const root = process.cwd();
const W = 1080, H = 1350; // 宽高比 0.8，介于 AppGallery 竖图 0.75–1.77
const out = (rel) => path.join(root, rel);

const browser = await chromium.launch();

async function shoot(url, name, gotoView) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  const file = out(`clients/huawei-${name.startsWith('music')?'music':'player'}/listing/screenshots/${gotoView.file}`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await ctx.close();
}

// —— 音乐：首页 ——
await shoot('https://greenrhino-music.pages.dev/', 'music', { file: 'phone-1-music-library.png' });
// —— 播放器：视频库 ——
await shoot('https://greenrhino-player.pages.dev/', 'player', { file: 'phone-1-offline.png' });

// 精细视图：加载后切 tab 再截
async function shootView(url, app, file, viewName) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  // 尝试点导航
  try {
    await page.click(`nav [data-view="${viewName}"]`, { timeout: 4000 });
    await page.waitForTimeout(1200);
  } catch (e) { console.warn('view click skipped for', viewName, e.message.split('\n')[0]); }
  await page.screenshot({ path: out(`clients/huawei-${app}/listing/screenshots/${file}`) });
  console.log('saved', file);
  await ctx.close();
}

await shootView('https://greenrhino-music.pages.dev/', 'music', 'phone-2-queue-drawer.png', 'music');
await shootView('https://greenrhino-music.pages.dev/', 'music', 'phone-3-offline.png', 'playlists');

await browser.close();
console.log('ALL DONE');