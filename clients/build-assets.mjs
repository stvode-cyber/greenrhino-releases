// build-assets.mjs — 绿角犀播放器 跨平台原生客户端资源生成器
// 将项目根目录 favicon.svg 光栅化为 Windows/Android/iOS/华为 所需全部图标，
// 并生成 assetlinks.json（TWA / 华为数字资产校验）与 browserconfig.xml。
//
// 用法（在可写环境 / 本机 / CI 运行）：
//   npm i playwright        # 首次需安装 playwright（已含 chromium）
//   node clients/build-assets.mjs
// 沙箱验证可用：OUT_ROOT=/tmp/x PW_CHANNEL=msedge node clients/build-assets.mjs
//
// 默认输出到 clients/ 下的对应平台目录；可用环境变量 OUT_ROOT 覆盖根目录。

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// .mjs 为 ESM，__dirname 不存在，用 import.meta.url 推导
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const ROOT = process.env.OUT_ROOT
  ? path.resolve(process.env.OUT_ROOT)
  : path.resolve(__dirname, '..')
const SRC_SVG = path.resolve(__dirname, '..', 'favicon.svg')
const svg = fs.readFileSync(SRC_SVG, 'utf8')

const ensure = (p) => fs.mkdirSync(p, { recursive: true })
const write = (p, buf) => { ensure(path.dirname(p)); fs.writeFileSync(p, buf) }

// ---------- 光栅化 ----------
const b64 = Buffer.from(svg).toString('base64')
const whiteSvg = svg
  .replace(/#2D6CDF/g, '#FFFFFF')
  .replace(/<rect[^>]*fill="#0E1116"[^>]*\/?>/g, '<rect width="64" height="64" fill="none"/>')

async function raster(buf, size, { maskable = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const inner = maskable ? `width:80%;height:80%` : `width:100%;height:100%`
  const bg = maskable ? `#0E1116` : `transparent`
  await page.setContent(
    `<body style="margin:0;padding:0;width:${size}px;height:${size}px;` +
    `display:flex;align-items:center;justify-content:center;background:${bg}">` +
    `<img src="data:image/svg+xml;base64,${buf}" style="${inner}"/></body>`
  )
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
  return png
}

// ---------- ICO 打包（PNG 内嵌）----------
function buildIco(pngs) {
  // pngs: [{ size, data }]
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)      // reserved
  dir.writeUInt16LE(1, 2)      // type=icon
  dir.writeUInt16LE(pngs.length, 4)
  let offset = 6 + pngs.length * 16
  const entries = []
  const chunks = []
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // width
    e.writeUInt8(size >= 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2)                       // colors
    e.writeUInt8(0, 3)                       // reserved
    e.writeUInt16LE(1, 4)                    // planes
    e.writeUInt16LE(32, 6)                   // bpp
    e.writeUInt32LE(data.length, 8)          // data size
    e.writeUInt32LE(offset, 12)              // data offset
    entries.push(e)
    chunks.push(data)
    offset += data.length
  }
  return Buffer.concat([dir, ...entries, ...chunks])
}

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || undefined,
  args: ['--no-sandbox', '--disable-gpu']
})
console.log('Playwright 已启动，开始光栅化图标…')

// ============ iOS ============
const iosDir = path.join(ROOT, 'clients', 'ios', 'GreenRhino', 'Assets.xcassets', 'AppIcon.appiconset')
const iosSizes = [
  [20, '20x20', 1], [20, '20x20', 2], [20, '20x20', 3],
  [29, '29x29', 1], [29, '29x29', 2], [29, '29x29', 3],
  [40, '40x40', 1], [40, '40x40', 2], [40, '40x40', 3],
  [60, '60x60', 2], [60, '60x60', 3],
  [76, '76x76', 1], [76, '76x76', 2],
  [83.5, '83.5x83.5', 2],
  [1024, '1024x1024', 1]
]
const iosPx = {}
for (const [pt, , scale] of iosSizes) iosPx[Math.round(pt * scale)] = true
const iosIcons = []
for (const px of Object.keys(iosPx).map(Number).sort((a, b) => a - b)) {
  const buf = await raster(b64, px)
  const f = `icon-${px}.png`
  write(path.join(iosDir, f), buf)
  iosIcons.push({ px, f })
}
const contents = {
  images: iosSizes.map(([pt, size, scale]) => ({
    size: String(pt).includes('.') ? size : `${pt}x${pt}`,
    idiom: 'universal',
    scale: `${scale}x`,
    filename: `icon-${Math.round(pt * scale)}.png`
  })),
  info: { author: 'xcode', version: 1 }
}
write(path.join(iosDir, 'Contents.json'), Buffer.from(JSON.stringify(contents, null, 2)))
console.log(`  iOS: ${iosIcons.length} 个图标 -> ${path.relative(ROOT, iosDir)}`)

// ============ Android (TWA) ============
const dmap = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, s] of Object.entries(dmap)) {
  const buf = await raster(b64, s)
  write(path.join(ROOT, 'clients', 'android', 'app', 'src', 'main', 'res', `mipmap-${d}`, 'ic_launcher_foreground.png'), buf)
}
// 自适应图标背景（纯色）+ 引用
const bgColor = '#0E1116'
write(path.join(ROOT, 'clients', 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher_background.xml'),
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${bgColor}</color></resources>\n`))
write(path.join(ROOT, 'clients', 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'),
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`))
// 通知图标（白色单色）
const notif = await raster(Buffer.from(whiteSvg).toString('base64'), 24)
write(path.join(ROOT, 'clients', 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_notification.png'), notif)
console.log('  Android: mipmap 自适应图标 + 通知图标 已生成')

// ============ Windows ============
const winIcoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = []
for (const s of winIcoSizes) icoPngs.push({ size: s, data: await raster(b64, s) })
write(path.join(ROOT, 'clients', 'windows', 'GreenRhino', 'icon.ico'), buildIco(icoPngs))
// MSIX 商店磁贴/闪屏
const winStore = {
  'Assets/StoreLogo.png': 50, 'Assets/SmallTile.png': 71, 'Assets/MediumTile.png': 150,
  'Assets/WideTile.png': [310, 150], 'Assets/LargeTile.png': 310, 'Assets/SplashScreen.png': [620, 300]
}
for (const [rel, dim] of Object.entries(winStore)) {
  const [w, h] = Array.isArray(dim) ? dim : [dim, dim]
  const buf = await raster(b64, Math.max(w, h), { maskable: true })
  write(path.join(ROOT, 'clients', 'windows', 'GreenRhino', rel), buf)
}
console.log('  Windows: icon.ico + 商店磁贴/闪屏 已生成')

// ============ 通用 / 华为 / maskable ============
const mask = await raster(b64, 512, { maskable: true })
write(path.join(ROOT, 'clients', 'assets', 'maskable-512.png'), mask)
write(path.join(ROOT, 'clients', 'assets', 'icon-512.png'), await raster(b64, 512))
console.log('  maskable-512 + icon-512 已生成')

// ============ 数字资产校验 ============
// 占位 SHA256 —— 用户部署 PWA 后用 `openssl x509 -in <cert> -noout -fingerprint -sha256` 替换
const PLACEHOLDER = 'REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT'
const assetlinks = JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'com.greenrhino.player', sha256_cert_fingerprints: [PLACEHOLDER] }
}], null, 2)
write(path.join(ROOT, 'clients', 'android', '.well-known', 'assetlinks.json'), Buffer.from(assetlinks))
write(path.join(ROOT, 'clients', 'huawei', 'assetlinks.json'), Buffer.from(assetlinks))
write(path.join(ROOT, 'clients', 'assets', 'browserconfig.xml'),
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<browserconfig><msapplication><tile>` +
    `<square150x150logo src="/Assets/MediumTile.png"/>` +
    `<wide310x150logo src="/Assets/WideTile.png"/>` +
    `<square310x310logo src="/Assets/LargeTile.png"/>` +
    `<TileColor>#0E1116</TileColor></tile></msapplication></browserconfig>\n`))
console.log('  assetlinks.json (Android/华为) + browserconfig.xml 已生成')

await browser.close()
console.log('\n✅ 全部图标与资源生成完成。')
console.log('   下一步：运行  node clients/copy-web.mjs  将 web 应用复制到 windows/wwwroot 与 ios/wwwroot。')
