// Service Worker：预缓存应用壳 + 全部模块，实现真正的离线可安装
// 注意：每次发布改版必须递增版本号（v3→v4→…），否则 cache-first 会一直用旧缓存，
// 导致 exe 里已是新代码、页面却仍在跑旧前端（曾因此出现「转码完成却没画面」）。
const CACHE = 'greenrhino-v9'
const CORE = [
  '/', '/index.html', '/favicon.svg', '/icons/icon.svg', '/manifest.webmanifest',
  '/src/style.css',
  '/src/main.js', '/src/player.js', '/src/store.js', '/src/lrc.js', '/src/metadata.js',
  '/src/ui/dom.js', '/src/ui/bottombar.js', '/src/ui/library.js', '/src/ui/music.js',
  '/src/ui/video.js', '/src/ui/queue.js', '/src/ui/settings.js', '/src/ui/spectrum.js',
  '/src/ui/gestures.js', '/src/ui/favorites.js', '/src/ui/playlists.js'
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return // 跨域（如 esm.sh 懒加载）交给网络，失败即降级
  // 外部打开端点：媒体流直连 LocalServer，禁止 SW 缓存（避免把大视频写进 SW 缓存）
  if (url.pathname.startsWith('/api/')) return

  // 导航请求：网络优先，离线回退到已缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    )
    return
  }

  // 静态资源：网络优先（LocalServer 是本地回环，速度与缓存无异），失败才回退缓存。
  // 不能用 cache-first：SW 更新接管前会一直命中旧桶，导致「exe 已更新、页面还在跑旧前端」
  // （曾出现转码完成却没画面、改了代码却不生效）。网络优先保证每次加载都是最新前端，
  // SW 缓存仅作 LocalServer 短暂不可用时的兜底。
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
      }
      return res
    }).catch(() => caches.match(req))
  )
})
