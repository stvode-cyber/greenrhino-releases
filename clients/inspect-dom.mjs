import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, colorScheme: 'dark' });
await page.goto('https://greenrhino-player.pages.dev/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('#view .lib-head')];
  const vppages = [...document.querySelectorAll('#view .vp-page')];
  const medials = [...document.querySelectorAll('#view .media-lib')];
  return {
    vpPageCount: vppages.length,
    mediaLibCount: medials.length,
    libHeadCount: heads.length,
    libHeadParents: heads.map(h => h.parentElement.className),
    emptyCount: document.querySelectorAll('#view .empty').length,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();