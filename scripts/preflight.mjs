// preflight.mjs — 发布前检查（AGENTS.md 发布检查清单自动化）
// 用法：node scripts/preflight.mjs
//
// 检查项（共 14 项）：
//   1. sw.js 源码必须含 '__SW_CACHE__' 占位符
//   2. sw.js 源码不含 greenrhino-v\d+ 硬编码
//   3. build-web.mjs APP_VERSION 与 ROLES.cache 版本一致
//   4. index.html 无 (href|src)="/" 绝对路径（已修复 ISS-20260914-001）
//   5. release/pwa-site-music/sw.js cache 名正确
//   6. release/pwa-site-player/sw.js cache 名正确
//   7. clients/android-music assets/pwa 已同步
//   8. clients/android-player assets/pwa 已同步
//   9. music manifest 主题色 #00D8A6
//  10. player manifest 主题色 #FFB03A
//  11. music assetlinks 包名 com.greenrhino.music
//  12. player assetlinks 包名 com.greenrhino.player
//  13. clients/node_modules 不存在（防嵌套）
//  14. ffmpeg.exe 在 clients/windows/GreenRhino/ 且未被 git 追踪
//  （AGENTS.md 声明为 14 项，与实际一致）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let pass = 0, fail = 0, warn = 0
const ok = (msg) => { pass++; console.log(`  ✅ ${msg}`) }
const bad = (msg) => { fail++; console.log(`  ❌ ${msg}`) }
const warn_ = (msg) => { warn++; console.log(`  ⚠️  ${msg}`) }

console.log('🔍 发布前检查（preflight）\n')

// 1. sw.js 占位符
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
if (swSrc.includes("'__SW_CACHE__'")) ok('sw.js 含 __SW_CACHE__ 占位符')
else bad('sw.js 缺 __SW_CACHE__ 占位符（ISS-20260913-001 回归）')

// 2. sw.js 无硬编码版本
if (!/greenrhino-v\d+/.test(swSrc)) ok('sw.js 无 greenrhino-v* 硬编码')
else bad('sw.js 含 greenrhino-v* 硬编码')

// 3. APP_VERSION 与 cache 同步
const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'build-web.mjs'), 'utf8')
const appVer = buildSrc.match(/const APP_VERSION = '(v\d+)'/)?.[1]
const musicCache = buildSrc.match(/cache: '(gr-music-v\d+)'/)?.[1]
const playerCache = buildSrc.match(/cache: '(gr-player-v\d+)'/)?.[1]
if (appVer && musicCache?.endsWith(appVer) && playerCache?.endsWith(appVer))
  ok(`版本三落点一致：${appVer} → ${musicCache} / ${playerCache}`)
else bad(`版本不一致：APP_VERSION=${appVer}, music=${musicCache}, player=${playerCache}`)

// 4. index.html 绝对路径
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
const absCount = (indexSrc.match(/(href|src)="\/(?!\/)/g) || []).length
if (absCount === 0) ok('index.html 无绝对路径')
else warn_(`index.html 含 ${absCount} 处绝对路径（build 时会自动重写，但源文件建议改）`)

// 5. release 产物存在且含正确 cache 名
for (const role of ['music', 'player']) {
  const swOut = path.join(ROOT, 'release', `pwa-site-${role}`, 'sw.js')
  if (!fs.existsSync(swOut)) { warn_(`release/pwa-site-${role}/sw.js 不存在，需跑 build-web.mjs`); continue }
  const out = fs.readFileSync(swOut, 'utf8')
  const expectedCache = role === 'music' ? musicCache : playerCache
  if (out.includes(`'${expectedCache}'`)) ok(`release/pwa-site-${role}/sw.js cache 名正确 (${expectedCache})`)
  else bad(`release/pwa-site-${role}/sw.js cache 名错误，期望 ${expectedCache}`)
}

// 6. Android assets/pwa 同步（可选）
for (const role of ['music', 'player']) {
  const aDir = path.join(ROOT, 'clients', `android-${role}`, 'app', 'src', 'main', 'assets', 'pwa')
  if (!fs.existsSync(aDir)) { warn_(`clients/android-${role}/app/src/main/assets/pwa/ 不存在`); continue }
  const aSw = path.join(aDir, 'sw.js')
  if (!fs.existsSync(aSw)) { warn_(`android-${role} assets/pwa/sw.js 缺失`); continue }
  const expectedCache = role === 'music' ? musicCache : playerCache
  if (fs.readFileSync(aSw, 'utf8').includes(`'${expectedCache}'`)) ok(`android-${role} assets/pwa 已同步`)
  else warn_(`android-${role} assets/pwa/sw.js 与 release 不一致，跑 build-web.mjs --sync-android`)
}

// 7. manifest 主题色
for (const [role, expectedColor] of [['music', '#00D8A6'], ['player', '#FFB03A']]) {
  const mf = path.join(ROOT, 'release', `pwa-site-${role}`, 'manifest.webmanifest')
  if (!fs.existsSync(mf)) continue
  const data = JSON.parse(fs.readFileSync(mf, 'utf8'))
  if (data.theme_color === expectedColor) ok(`${role} manifest 主题色 ${expectedColor}`)
  else bad(`${role} manifest 主题色错误：${data.theme_color}（期望 ${expectedColor}）`)
}

// 8. assetlinks 包名
for (const [role, expectedPkg] of [['music', 'com.greenrhino.music'], ['player', 'com.greenrhino.player']]) {
  const al = path.join(ROOT, 'release', `pwa-site-${role}`, '.well-known', 'assetlinks.json')
  if (!fs.existsSync(al)) continue
  const data = JSON.parse(fs.readFileSync(al, 'utf8'))
  const pkg = data[0]?.target?.package_name
  if (pkg === expectedPkg) ok(`${role} assetlinks 包名 ${pkg}`)
  else bad(`${role} assetlinks 包名错误：${pkg}（期望 ${expectedPkg}）`)
}

// 9. clients/node_modules 嵌套检测
if (fs.existsSync(path.join(ROOT, 'clients', 'node_modules')))
  bad('clients/node_modules 存在（嵌套依赖，应删除）')
else ok('clients/node_modules 不存在')

// 10. ffmpeg.exe 存在但未被 git 追踪
const ffmpeg = path.join(ROOT, 'clients', 'windows', 'GreenRhino', 'ffmpeg.exe')
if (fs.existsSync(ffmpeg)) {
  try {
    execSync('git check-ignore clients/windows/GreenRhino/ffmpeg.exe', { cwd: ROOT, stdio: 'pipe' })
    ok('ffmpeg.exe 存在且被 gitignore')
  } catch {
    warn_('ffmpeg.exe 存在但未被 gitignore（勿提交 98MB 大二进制）')
  }
} else {
  warn_('ffmpeg.exe 不存在（HEVC 转码链路失效）')
}

console.log(`\n📊 结果：✅ ${pass} 通过  ❌ ${fail} 失败  ⚠️  ${warn} 警告`)
if (fail > 0) { console.log('\n❌ 有失败项，请修复后再发布'); process.exit(1) }
if (warn > 0) { console.log('\n⚠️  有警告项，建议处理'); process.exit(0) }
console.log('\n✅ 全部通过，可发布')
