// build-web.mjs — 把合一的绿角犀 web 应用拆成两套完全独立的 PWA 站点
//   music  ：绿角犀音乐（曲库/歌单/收藏/EQ/歌词/频谱，无视频 UI）
//   player ：绿角犀播放器（字幕/音轨/画中画/AB循环/章节，无音乐 UI）
// 角色裁剪靠 index.html 注入 window.__winRole 在运行时生效（main.js 已支持），
// 共享模块（main.js/player.js/store.js 等）全部保留，避免静态 import 缺模块崩溃。
//
// 输出：release/pwa-site-music/ 、 release/pwa-site-player/ （Cloudflare Pages 上传用）
// 用法：node scripts/build-web.mjs [--role=music|player|all]   （默认 all）
//
// 各壳工程（Windows/iOS wwwroot、Android app_url、华为起始 URL）基于这两套站点组装。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')          // 项目根（web 源）
const REL = path.join(ROOT, 'release')               // 输出根

const FINGERPRINT = '0fec2838848aceb04bdbd4f6dd46c4ae5436b36a9d547af9a856d0a86bb0c77e'
const APP_VERSION = 'v16'   // 应用版本徽标（顶部导航固定显示；各 App 同一构建基线，用哪个即显示哪个）

const ROLES = {
  music: {
    winRole: 'music',
    title: '绿角犀音乐 · 离线音乐播放器',
    brand: '绿角犀音乐',
    version: APP_VERSION,
    cache: 'gr-music-v16',
    themeColor: '#00D8A6',
    manifest: {
      name: '绿角犀音乐',
      short_name: '绿角犀音乐',
      description: '离线优先的本地音乐播放器，支持曲库、歌单、收藏、均衡器、歌词与频谱。',
      theme_color: '#00D8A6',
      background_color: '#0E1116',
      display: 'standalone',
      orientation: 'any',
      start_url: '/',
      scope: '/',
      icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
    },
    androidPackage: 'com.greenrhino.music',
    siteUrl: 'https://greenrhino-music.pages.dev'
  },
  player: {
    winRole: 'video',
    title: '绿角犀播放器 · 离线视频播放器',
    brand: '绿角犀播放器',
    version: APP_VERSION,
    cache: 'gr-player-v16',
    themeColor: '#FFB03A',
    manifest: {
      name: '绿角犀播放器',
      short_name: '绿角犀播放器',
      description: '离线优先的本地视频播放器，支持外挂字幕、音轨切换、画中画、AB 循环与章节跳转。',
      theme_color: '#FFB03A',
      background_color: '#0E1116',
      display: 'standalone',
      orientation: 'any',
      start_url: '/',
      scope: '/',
      icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
    },
    androidPackage: 'com.greenrhino.player',
    siteUrl: 'https://greenrhino-player.pages.dev'
  }
}

function copyPath(src, dst) {
  const st = fs.statSync(src)
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const name of fs.readdirSync(src)) copyPath(path.join(src, name), path.join(dst, name))
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
  }
}

function buildRole(key) {
  const cfg = ROLES[key]
  const out = path.join(REL, `pwa-site-${key}`)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  // 1) index.html：注入 window.__winRole + 替换 title/brand/theme-color
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${cfg.title}</title>`)
  html = html.replace(/<span class="brand-name">[^<]*<\/span>/, `<span class="brand-name">${cfg.brand}</span>`)
  html = html.replace(/<meta name="theme-color" content="[^"]*" \/>/, `<meta name="theme-color" content="${cfg.themeColor}" />`)
  html = html.replace(
    '<script type="module" src="./src/main.js"></script>',
    `<script>window.__winRole='${cfg.winRole}';window.__appVersion='${cfg.version}';</script>\n  <script type="module" src="./src/main.js"></script>`
  )
  fs.writeFileSync(path.join(out, 'index.html'), html)

  // 2) manifest.webmanifest
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(cfg.manifest, null, 2))

  // 3) sw.js：精确替换占位符 __SW_CACHE__ 为角色专属 cache 名（gr-music-v16 / gr-player-v16）
  //    旧正则 'greenrhino-v\d+' 已废弃，改用显式占位符消除隐式依赖
  let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  sw = sw.replace(/'__SW_CACHE__'/, `'${cfg.cache}'`)
  fs.writeFileSync(path.join(out, 'sw.js'), sw)

  // 4) favicon / icons / src / public（全量复制；public 可能不存在则跳过）
  copyPath(path.join(ROOT, 'favicon.svg'), path.join(out, 'favicon.svg'))
  if (fs.existsSync(path.join(ROOT, 'icons'))) copyPath(path.join(ROOT, 'icons'), path.join(out, 'icons'))
  if (fs.existsSync(path.join(ROOT, 'src'))) copyPath(path.join(ROOT, 'src'), path.join(out, 'src'))
  if (fs.existsSync(path.join(ROOT, 'public'))) copyPath(path.join(ROOT, 'public'), path.join(out, 'public'))

  // 4.5) 角色专属图标：文件名保持 icon.svg / favicon.svg（sw 预缓存与 manifest 引用不变），
  //      内容按角色替换 —— 音乐绿 ♫ / 播放器琥珀 ▶，两站图标就此区分。
  const ROLE_ICONS = {
    music: { icon: 'icons/icon-music.svg', favicon: 'favicon-music.svg' },
    player: { icon: 'icons/icon-player.svg', favicon: 'favicon-player.svg' }
  }
  const ri = ROLE_ICONS[key]
  if (ri) {
    copyPath(path.join(ROOT, ri.icon), path.join(out, 'icons', 'icon.svg'))
    copyPath(path.join(ROOT, ri.favicon), path.join(out, 'favicon.svg'))
  }

  // 5) .well-known/assetlinks.json：各站只放对应 Android 包的一条 relation
  const assetlinks = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: cfg.androidPackage,
      sha256_cert_fingerprints: [FINGERPRINT]
    }
  }]
  fs.mkdirSync(path.join(out, '.well-known'), { recursive: true })
  fs.writeFileSync(path.join(out, '.well-known', 'assetlinks.json'), JSON.stringify(assetlinks, null, 2))

  console.log(`✅ 已生成 ${key} 站点 → ${path.relative(ROOT, out)}  (winRole=${cfg.winRole}, cache=${cfg.cache}, pkg=${cfg.androidPackage})`)
}

const argRole = process.argv.find((a) => a.startsWith('--role='))
const role = argRole ? argRole.split('=')[1] : 'all'
if (role === 'all') { buildRole('music'); buildRole('player') }
else if (ROLES[role]) buildRole(role)
else { console.error('未知角色：' + role); process.exit(1) }

console.log('\n✅ 完成。两套独立站点已就绪：\n  - release/pwa-site-music/  → https://greenrhino-music.pages.dev\n  - release/pwa-site-player/ → https://greenrhino-player.pages.dev')
