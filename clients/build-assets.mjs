// build-assets.mjs — 绿角犀双独立 App 跨平台原生客户端资源生成器
// 双 App（音乐绿 ♫ / 播放器琥珀 ▶）各有专属图标，按各自 SVG 光栅化为
// Windows(icon.ico) / iOS(AppIcon.appiconset) / Android(mipmap+通知) / 华为(listing icon-512)；
// 旧单 App 目录 clients/android 已删除；当前输出仅面向 android-music / android-player 双角色。
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
const HUB_SVG = path.resolve(__dirname, '..', 'favicon.svg')

const ensure = (p) => fs.mkdirSync(p, { recursive: true })
const write = (p, buf) => { ensure(path.dirname(p)); fs.writeFileSync(p, buf) }
const readSvg = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// 双独立 App 定义：各自的图标 SVG 与各平台落点目录
const APPS = [
  {
    key: 'music',
    svgRel: 'icons/icon-music.svg',
    accent: '#00D8A6',                       // 酷狗绿
    winDir: path.join('windows', 'GreenRhinoMusic'),
    iosDir: path.join('ios', 'Music'),
    androidDir: 'android-music',
    huaweiDir: path.join('huawei-music', 'listing')
  },
  {
    key: 'player',
    svgRel: 'icons/icon-player.svg',
    accent: '#FFB03A',                       // 琥珀橙
    winDir: path.join('windows', 'GreenRhinoPlayer'),
    iosDir: path.join('ios', 'Player'),
    androidDir: 'android-player',
    huaweiDir: path.join('huawei-player', 'listing')
  }
]

// ---------- 光栅化 ----------
function whiteOf(svg, accent) {
  // 通知/单色图标：图形提白、去背景底板（安卓通知要求白色扁平剪影）
  return svg
    .replace(new RegExp(accent, 'g'), '#FFFFFF')
    .replace(/<rect[^>]*fill="#0E1116"[^>]*\/?>/g, '<rect width="64" height="64" fill="none"/>')
}

async function raster(browser, buf, size, { maskable = false } = {}) {
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
console.log('Playwright 已启动，开始按 App 光栅化图标…')

// ============ iOS ============
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

async function writeAppIcon(browser, b64, iosDir) {
  const iosIcons = []
  for (const px of Object.keys(iosPx).map(Number).sort((a, b) => a - b)) {
    const f = `icon-${px}.png`
    write(path.join(ROOT, iosDir, 'Assets.xcassets', 'AppIcon.appiconset', f), await raster(browser, b64, px))
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
  write(path.join(ROOT, iosDir, 'Assets.xcassets', 'AppIcon.appiconset', 'Contents.json'),
    Buffer.from(JSON.stringify(contents, null, 2)))
  return iosIcons.length
}

// ============ Android（双 TWA 工程）============
const dmap = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

// ============ 逐 App 生成 ============
for (const app of APPS) {
  const svg = readSvg(app.svgRel)
  const b64 = Buffer.from(svg).toString('base64')
  const whiteB64 = Buffer.from(whiteOf(svg, app.accent)).toString('base64')
  console.log(`\n── App: ${app.key}（${app.accent}）`)

  // Windows：exe / 安装包 图标
  const icoPngs = []
  for (const s of [16, 24, 32, 48, 64, 128, 256]) icoPngs.push({ size: s, data: await raster(browser, b64, s) })
  write(path.join(ROOT, 'clients', app.winDir, 'icon.ico'), buildIco(icoPngs))
  console.log('  Windows icon.ico ->', path.join('clients', app.winDir, 'icon.ico'))

  // iOS
  const nIos = await writeAppIcon(browser, b64, path.join('clients', app.iosDir))
  console.log(`  iOS AppIcon.appiconset ${nIos} 个 ->`, path.join('clients', app.iosDir, 'Assets.xcassets', 'AppIcon.appiconset'))

  // Android 自适应图标前景 + 通知图标
  for (const [d, s] of Object.entries(dmap)) {
    write(path.join(ROOT, 'clients', app.androidDir, 'app', 'src', 'main', 'res', `mipmap-${d}`, 'ic_launcher_foreground.png'),
      await raster(browser, b64, s))
  }
  write(path.join(ROOT, 'clients', app.androidDir, 'app', 'src', 'main', 'res', 'drawable', 'ic_notification.png'),
    await raster(browser, whiteB64, 24))
  console.log('  Android mipmap 自适应图标 + 通知图标 ->', path.join('clients', app.androidDir))

  // 华为 listing 上传图标
  write(path.join(ROOT, 'clients', app.huaweiDir, 'icon-512.png'), await raster(browser, b64, 512))
  console.log('  华为 icon-512 ->', path.join('clients', app.huaweiDir, 'icon-512.png'))
}

// ============ 合一「绿角犀(蓝)」旧产物（兼容保留）============
console.log('\n── Hub: 绿角犀(蓝) 旧产物（兼容）')
const hubSvg = fs.readFileSync(HUB_SVG, 'utf8')
const hubB64 = Buffer.from(hubSvg).toString('base64')
const hubWhite = Buffer.from(whiteOf(hubSvg, '#2D6CDF')).toString('base64')
// 注：旧 Android 单 App 目录 clients/android 已删除，不再向其写入资源。

// 旧 Windows（合一壳）exe/安装包图标 + MSIX 磁贴/闪屏
const winIcoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = []
for (const s of winIcoSizes) icoPngs.push({ size: s, data: await raster(browser, hubB64, s) })
write(path.join(ROOT, 'clients', 'windows', 'GreenRhino', 'icon.ico'), buildIco(icoPngs))
const winStore = {
  'Assets/StoreLogo.png': 50, 'Assets/SmallTile.png': 71, 'Assets/MediumTile.png': 150,
  'Assets/WideTile.png': [310, 150], 'Assets/LargeTile.png': 310, 'Assets/SplashScreen.png': [620, 300]
}
for (const [rel, dim] of Object.entries(winStore)) {
  const [w, h] = Array.isArray(dim) ? dim : [dim, dim]
  write(path.join(ROOT, 'clients', 'windows', 'GreenRhino', rel), await raster(browser, hubB64, Math.max(w, h), { maskable: true }))
}
console.log('  Windows: icon.ico + 商店磁贴/闪屏 已生成')

// 通用 / maskable（合一蓝）
write(path.join(ROOT, 'clients', 'assets', 'maskable-512.png'), await raster(browser, hubB64, 512, { maskable: true }))
write(path.join(ROOT, 'clients', 'assets', 'icon-512.png'), await raster(browser, hubB64, 512))
console.log('  maskable-512 + icon-512 已生成')

// ============ 数字资产校验（真实指纹，与 build-web.mjs 保持一致）============
const FINGERPRINT = '0fec2838848aceb04bdbd4f6dd46c4ae5436b36a9d547af9a856d0a86bb0c77e'

// 为每个 Android TWA 项目写一份 assetlinks.json（各指向自己的包名）
const pkgPerApp = { music: 'com.greenrhino.music', player: 'com.greenrhino.player' }
for (const app of APPS) {
  const assetlinks = JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkgPerApp[app.key], sha256_cert_fingerprints: [FINGERPRINT] }
  }], null, 2)
  // Android TWA 项目内的 .well-known（作为部署参考/备份；正式部署由 build-web.mjs 写入 release/pwa-site-*/）
  write(path.join(ROOT, 'clients', app.androidDir, '.well-known', 'assetlinks.json'), Buffer.from(assetlinks))
  // 华为 AppGallery 上架目录也放一份（同一个 App 身份）
  write(path.join(ROOT, 'clients', app.huaweiDir, 'assetlinks.json'), Buffer.from(assetlinks))
}

// 旧单 App 目录 clients/huawei/ 保留一份（兼容）
const hubAssetlinks = JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'com.greenrhino.player', sha256_cert_fingerprints: [FINGERPRINT] }
}], null, 2)
if (fs.existsSync(path.join(ROOT, 'clients', 'huawei'))) {
  write(path.join(ROOT, 'clients', 'huawei', 'assetlinks.json'), Buffer.from(hubAssetlinks))
}

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
