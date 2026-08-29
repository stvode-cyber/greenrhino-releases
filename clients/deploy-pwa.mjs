// deploy-pwa.mjs — 生成可上线的 PWA 静态产物（相对路径版，适配子路径托管）
// 用法：在项目根目录执行 `node clients/deploy-pwa.mjs`
// 输出：./dist/（index.html + manifest.webmanifest + sw.js + favicon.svg + icons/ + src/）
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'fs'
import { join } from 'path'

const SRC = process.cwd()
const OUT = join(SRC, 'dist')

// 清理旧产物（沙箱 safe-delete shim 可能拦截删除，忽略即可；本机正常清理）
try { rmSync(OUT, { recursive: true, force: true }) } catch {}
mkdirSync(OUT, { recursive: true })

// 1. index.html：绝对路径 href="/ / src="/ -> 相对 ./
let html = readFileSync(join(SRC, 'index.html'), 'utf8')
html = html.replace(/(href|src)="\//g, '$1="./')
writeFileSync(join(OUT, 'index.html'), html)

// 2. manifest：start_url / scope / icons 改相对
const man = JSON.parse(readFileSync(join(SRC, 'manifest.webmanifest'), 'utf8'))
man.start_url = './'
man.scope = './'
if (man.icons && man.icons[0]) man.icons[0].src = './icons/icon.svg'
writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify(man, null, 2))

// 3. sw.js：CORE 列表与回退路径 '/x' -> './x'
let sw = readFileSync(join(SRC, 'sw.js'), 'utf8')
sw = sw.replace(/'\/([^']*)'/g, "'./$1")
writeFileSync(join(OUT, 'sw.js'), sw)

// 4. 复制静态资源（不做路径改写）
cpSync(join(SRC, 'icons'), join(OUT, 'icons'), { recursive: true })
cpSync(join(SRC, 'src'), join(OUT, 'src'), { recursive: true })
cpSync(join(SRC, 'favicon.svg'), join(OUT, 'favicon.svg'))

console.log('[deploy-pwa] 产物已生成 -> dist/（相对路径，可直接部署到子路径托管）')
console.log('[deploy-pwa] 若部署到根域（如 lujax.fun），直接用项目根目录原文件即可，无需本产物')
