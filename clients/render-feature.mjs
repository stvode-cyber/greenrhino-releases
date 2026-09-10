import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const jobs = [
  { svg: 'clients/huawei-music/listing/feature-graphic.svg', png: 'clients/huawei-music/listing/feature-graphic-1024x500.png' },
  { svg: 'clients/huawei-player/listing/feature-graphic.svg', png: 'clients/huawei-player/listing/feature-graphic-1024x500.png' },
];

const root = process.cwd();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });

for (const j of jobs) {
  const svg = readFileSync(path.join(root, j.svg), 'utf8');
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`, { waitUntil: 'load' });
  await page.locator('svg').first().screenshot({ path: path.join(root, j.png) });
  console.log('rendered', j.png);
}

await browser.close();