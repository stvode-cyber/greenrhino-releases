// Playwright E2E 配置 —— sw.js CACHE 行为验证
// 跑法：npx playwright test test/e2e/
// Windows 下 webServer 路径转义坑多 → 用 shell: "powershell" + cd 到目录 + 相对路径
import { defineConfig } from '@playwright/test'

const MUSIC_PORT = 4173
const PLAYER_PORT = 4174
const reuse = process.env.PLAYWRIGHT_REUSE === '1'

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 45_000, // SW 注册可能慢，放宽
  fullyParallel: true,
  reporter: 'list',

  // 两个静态服务器（在各自目录里起，避免绝对路径转义问题）
  webServer: [
    {
      command: `python -m http.server ${MUSIC_PORT}`,
      port: MUSIC_PORT,
      cwd: 'release/pwa-site-music',
      reuseExistingServer: reuse,
      timeout: 20_000,
    },
    {
      command: `python -m http.server ${PLAYER_PORT}`,
      port: PLAYER_PORT,
      cwd: 'release/pwa-site-player',
      reuseExistingServer: reuse,
      timeout: 20_000,
    },
  ],

  // 用系统 Edge（Chromium 内核），跳过 Playwright 自带浏览器下载
  use: {
    browserName: 'chromium',
    channel: 'msedge',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
})
