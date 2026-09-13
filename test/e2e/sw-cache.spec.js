// Playwright E2E —— sw.js CACHE 占位符替换的真实浏览器验证
// 跑法：npx playwright test test/e2e/sw-cache.spec.js
//
// 与单元测试（test/build-sw-cache.test.js）的区别：
//   单元测试：读文件文本，验证 release/sw.js 内容对不对
//   E2E 测试：真实 Chromium/Edge 浏览器里跑，验证 Service Worker 真注册了
//             cache 名真被浏览器 caches API 接受了

import { test, expect } from '@playwright/test'

const MUSIC_URL = 'http://127.0.0.1:4173'
const PLAYER_URL = 'http://127.0.0.1:4174'

// ────────────────────────────────────────
// 场景 1：music 版独立打开 → SW 注册 + cache 正确 + CORE 预缓存
// ────────────────────────────────────────
test.describe('🎵 Music PWA SW', () => {
  test.use({ baseURL: MUSIC_URL })

  test('SW 注册成功，cache 名 = gr-music-<APP_VERSION>', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // 从页面注入的 window 变量取版本号（双保险，不硬编码 v16）
    const appInfo = await page.evaluate(() => ({
      role: window.__winRole,
      version: window.__appVersion,
    }))
    expect(appInfo.role).toBe('music')
    expect(appInfo.version).toBeTruthy()
    const EXPECTED_CACHE = `gr-music-${appInfo.version}`

    // 等 SW ready
    await page.evaluate(async () => { await navigator.serviceWorker.ready })

    // 查 SW 注册
    const regs = await page.evaluate(async () => {
      const rs = await navigator.serviceWorker.getRegistrations()
      return {
        count: rs.length,
        scope: rs[0]?.scope || null,
        state: rs[0]?.active?.state || rs[0]?.installing?.state || null,
      }
    })
    expect(regs.count).toBeGreaterThanOrEqual(1)
    expect(regs.scope).toMatch(/\/$/)
    expect(['activated', 'activating']).toContain(regs.state)

    // 查 caches API —— 关键验证点
    const cachesState = await page.evaluate(async () => {
      const names = await caches.keys()
      return {
        allNames: names,
        musicCache: names.find(n => n.startsWith('gr-music-')) || null,
        playerCaches: names.filter(n => n.includes('player')),
      }
    })
    expect(cachesState.musicCache).toBe(EXPECTED_CACHE)
    expect(
      cachesState.playerCaches.length,
      `music context 不应有 player cache，实际: ${JSON.stringify(cachesState.allNames)}`
    ).toBe(0)
  })

  test('SW 预缓存 CORE 资源包含 index.html 和 manifest', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => { await navigator.serviceWorker.ready })

    const precachedUrls = await page.evaluate(async () => {
      const names = await caches.keys()
      const musicCacheName = names.find(n => n.startsWith('gr-music-'))
      if (!musicCacheName) return { error: 'music cache not found', names }
      const cache = await caches.open(musicCacheName)
      const reqs = await cache.keys()
      const origin = location.origin // page.evaluate 里能拿到
      return {
        cacheName: musicCacheName,
        urls: reqs.map(r => r.url.replace(origin, '')).sort(),
      }
    })
    expect(precachedUrls.error).toBeUndefined()
    expect(precachedUrls.urls).toContain('/index.html')
    expect(precachedUrls.urls).toContain('/manifest.webmanifest')
    expect(precachedUrls.urls).toContain('/src/main.js')
  })
})

// ────────────────────────────────────────
// 场景 2：player 版独立打开 → SW 注册 + cache 正确
// ────────────────────────────────────────
test.describe('🎬 Player PWA SW', () => {
  test.use({ baseURL: PLAYER_URL })

  test('SW 注册成功，cache 名 = gr-player-<APP_VERSION>', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const appInfo = await page.evaluate(() => ({
      role: window.__winRole,
      version: window.__appVersion,
    }))
    expect(appInfo.role).toBe('video') // player 版 winRole='video'
    expect(appInfo.version).toBeTruthy()
    const EXPECTED_CACHE = `gr-player-${appInfo.version}`

    await page.evaluate(async () => { await navigator.serviceWorker.ready })

    const cachesState = await page.evaluate(async () => {
      const names = await caches.keys()
      return {
        allNames: names,
        playerCache: names.find(n => n.startsWith('gr-player-')) || null,
        musicCaches: names.filter(n => n.includes('music')),
      }
    })
    expect(cachesState.playerCache).toBe(EXPECTED_CACHE)
    expect(
      cachesState.musicCaches.length,
      `player context 不应有 music cache，实际: ${JSON.stringify(cachesState.allNames)}`
    ).toBe(0)
  })
})

// ────────────────────────────────────────
// 场景 3：双 App 同时打开 → SW 隔离（不同 context = 不同 cache 存储）
// ────────────────────────────────────────
test.describe('🔵 双 App cache 隔离', () => {
  test('music 和 player 各自 SW 独立注册', async ({ browser }) => {
    // 两个独立 context（各自隔离 SW + Cache Storage）
    const musicCtx = await browser.newContext()
    const playerCtx = await browser.newContext()
    const musicPage = await musicCtx.newPage()
    const playerPage = await playerCtx.newPage()

    try {
      // 并行打开 + 等 SW ready
      await Promise.all([
        musicPage.goto(MUSIC_URL, { waitUntil: 'domcontentloaded' }),
        playerPage.goto(PLAYER_URL, { waitUntil: 'domcontentloaded' }),
      ])
      await Promise.all([
        musicPage.evaluate(async () => { await navigator.serviceWorker.ready }),
        playerPage.evaluate(async () => { await navigator.serviceWorker.ready }),
      ])

      // 各自查 caches（不同 origin 天然隔离）
      const [musicCaches, playerCaches] = await Promise.all([
        musicPage.evaluate(async () => ({
          version: window.__appVersion,
          role: window.__winRole,
          names: await caches.keys(),
        })),
        playerPage.evaluate(async () => ({
          version: window.__appVersion,
          role: window.__winRole,
          names: await caches.keys(),
        })),
      ])

      // music context
      expect(musicCaches.role).toBe('music')
      expect(musicCaches.names.some(n => n.startsWith('gr-music-'))).toBe(true)
      expect(musicCaches.names.some(n => n.includes('player'))).toBe(false)

      // player context
      expect(playerCaches.role).toBe('video')
      expect(playerCaches.names.some(n => n.startsWith('gr-player-'))).toBe(true)
      expect(playerCaches.names.some(n => n.includes('music'))).toBe(false)

      // 版本号同步（双 App 应该同一个 APP_VERSION）
      expect(musicCaches.version).toBe(playerCaches.version)
    } finally {
      await musicCtx.close()
      await playerCtx.close()
    }
  })
})
