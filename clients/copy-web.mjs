// copy-web.mjs — 将绿角犀播放器 web 应用复制到各原生壳的 wwwroot 资源目录
// 这样 Windows(WebView2) / iOS(WKWebView) 的内嵌本地服务即可离线托管完整 PWA。
// 用法：node clients/copy-web.mjs   （可选 OUT_ROOT 覆盖目标根目录，用于验证）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// .mjs 为 ESM，__dirname 不存在，用 import.meta.url 推导
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PROJ = process.env.SRC_ROOT
  ? path.resolve(process.env.SRC_ROOT)               // 可指定 web 应用根（如自定义构建产物）
  : path.resolve(__dirname, '..')
const OUT = process.env.OUT_ROOT
  ? path.resolve(process.env.OUT_ROOT)
  : PROJ

const SRC = PROJ
const targets = [
  path.join(OUT, 'clients', 'windows', 'GreenRhino', 'wwwroot')
]

const items = [
  'index.html', 'sw.js', 'manifest.webmanifest', 'favicon.svg',
  'public', 'icons', 'src'
]

// 手写递归复制：对目录逐层遍历，避免依赖 fs.cpSync 在部分环境下的目录复制异常
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

for (const t of targets) {
  try { fs.rmSync(t, { recursive: true, force: true }) } catch (e) { /* 清旧目录失败可忽略，下方 copyPath 会覆盖重建 */ }
  for (const it of items) {
    const s = path.join(SRC, it)
    if (fs.existsSync(s)) copyPath(s, path.join(t, it))
  }
  console.log('复制 web 应用到', path.relative(OUT, t))
}

// 双独立 App（Windows 双 exe）：把角色化 web 站点复制到各自 wwwroot 并压制 wwwroot.zip。
// release/pwa-site-music -> GreenRhinoMusic/wwwroot(+wwwroot.zip)；player 同理。
// 压缩必须让 index.html 等位于 zip 顶层（嵌入资源解压路径依赖于此）。
function buildRoleSite(srcDir, wwwrootDir) {
  const src = path.resolve(OUT, 'release', srcDir)
  if (!fs.existsSync(src)) { console.log('跳过（目录不存在）:', src); return }
  try { fs.rmSync(wwwrootDir, { recursive: true, force: true }) } catch (e) { }
  fs.mkdirSync(wwwrootDir, { recursive: true })
  for (const name of fs.readdirSync(src)) copyPath(path.join(src, name), path.join(wwwrootDir, name))
  console.log('复制角色站点到', path.relative(OUT, wwwrootDir))
}

const roleApps = [
  { site: 'pwa-site-music', wwwroot: path.join(OUT, 'clients', 'windows', 'GreenRhinoMusic', 'wwwroot') },
  { site: 'pwa-site-player', wwwroot: path.join(OUT, 'clients', 'windows', 'GreenRhinoPlayer', 'wwwroot') }
]
for (const r of roleApps) buildRoleSite(r.site, r.wwwroot)

// iOS 双独立 App（Music / Player）：仅将角色化 web 站点复制到各自 wwwroot，不压制 zip。
// 每个 target 的 bundle 内 wwwroot 位于顶层，LocalServer.locateRoot() 的 `base/wwwroot` 即可命中。
// Windows 的 Compress-Archive 仅针对上方 roleApps（Windows 双 wwwroot），不波及 iOS。
const iosApps = [
  { site: 'pwa-site-music', wwwroot: path.join(OUT, 'clients', 'ios', 'Music', 'wwwroot') },
  { site: 'pwa-site-player', wwwroot: path.join(OUT, 'clients', 'ios', 'Player', 'wwwroot') }
]
for (const r of iosApps) buildRoleSite(r.site, r.wwwroot)

if (process.platform === 'win32') {
  const { execSync } = await import('node:child_process')
  for (const r of roleApps) {
    const zip = r.wwwroot + '.zip'
    try { fs.rmSync(zip, { force: true }) } catch (e) { }
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${r.wwwroot}/*' -DestinationPath '${zip}' -Force"`)
    console.log('压缩角色站点 ->', path.relative(OUT, zip))
  }
}

console.log('\n✅ 完成。每个 wwwroot 含 index.html / sw.js / src / public / icons 等。')
