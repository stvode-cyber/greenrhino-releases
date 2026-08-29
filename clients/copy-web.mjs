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
  path.join(OUT, 'clients', 'windows', 'GreenRhino', 'wwwroot'),
  path.join(OUT, 'clients', 'ios', 'GreenRhino', 'wwwroot')
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
console.log('\n✅ 完成。每个 wwwroot 含 index.html / sw.js / src / public / icons 等。')
