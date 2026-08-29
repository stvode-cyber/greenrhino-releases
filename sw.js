// Service Worker：预缓存应用壳 + 全部模块，实现真正的离线可安装
const CACHE = 'greenrhino-v3'
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

  // 静态资源：cache-first（预缓存命中即为离线可用），未命中再回源并补缓存
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      }).catch(() => cached)
    })
  )
})
