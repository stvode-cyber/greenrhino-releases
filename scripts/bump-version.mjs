// bump-version.mjs — 一键递增 APP_VERSION，同步五处落点
// 解决 ISS-20260910-001：版本号散落在多处手工同步易漏
//
// 用法：
//   node scripts/bump-version.mjs          # v16 → v17
//   node scripts/bump-version.mjs v18      # 直接指定版本
//
// 五落点：
//   1. scripts/build-web.mjs 的 APP_VERSION 常量
//   2. scripts/build-web.mjs 的 ROLES.{music,player}.cache（gr-music-vN / gr-player-vN）
//   3. clients/windows/GreenRhino{Music,Player}/*.iss 的 OutputBaseFilename
//   4. clients/android-music/app/build.gradle 的 versionName + versionCode
//   5. clients/android-player/app/build.gradle 的 versionName + versionCode

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BUILD_WEB = path.join(ROOT, 'scripts', 'build-web.mjs')

// 1. 读当前版本
const src = fs.readFileSync(BUILD_WEB, 'utf8')
const curMatch = src.match(/const APP_VERSION = '(v\d+)'/)
if (!curMatch) { console.error('❌ 找不到 APP_VERSION'); process.exit(1) }
const cur = curMatch[1]
const curNum = parseInt(cur.slice(1), 10)

// 2. 算新版本
const argVer = process.argv[2]
const next = argVer || `v${curNum + 1}`
if (!/^v\d+$/.test(next)) { console.error('❌ 版本格式必须 v+N，如 v17'); process.exit(1) }
if (next === cur) { console.error(`❌ 新版本 ${next} 与当前 ${cur} 相同`); process.exit(1) }

console.log(`📦 版本升级：${cur} → ${next}`)

// 3. 改 build-web.mjs 三处（APP_VERSION + music.cache + player.cache）
let updated = src
  .replace(/const APP_VERSION = 'v\d+'/, `const APP_VERSION = '${next}'`)
  .replace(/cache: 'gr-music-v\d+'/, `cache: 'gr-music-${next}'`)
  .replace(/cache: 'gr-player-v\d+'/, `cache: 'gr-player-${next}'`)
fs.writeFileSync(BUILD_WEB, updated)
console.log(`  ✅ scripts/build-web.mjs（APP_VERSION + 双 cache 桶）`)

// 4. 扫 clients/windows/**/*.iss 改 OutputBaseFilename
const issGlob = path.join(ROOT, 'clients', 'windows')
let issCount = 0
if (fs.existsSync(issGlob)) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.iss')) {
        const iss = fs.readFileSync(p, 'utf8')
        const newIss = iss.replace(/OutputBaseFilename=([^\s]+)-v\d+/g, `OutputBaseFilename=$1-${next}`)
        if (newIss !== iss) {
          fs.writeFileSync(p, newIss)
          console.log(`  ✅ ${path.relative(ROOT, p)}`)
          issCount++
        }
      }
    }
  }
  walk(issGlob)
}
if (issCount === 0) console.log(`  ⏭  未找到 .iss 安装包脚本（可跳过）`)

// 5. 扫 clients/android-{music,player}/app/build.gradle 改 versionName + versionCode
const gradleCount = 0
const majorNum = parseInt(next.slice(1), 10) // v16 → 16
for (const role of ['music', 'player']) {
  const gPath = path.join(ROOT, 'clients', `android-${role}`, 'app', 'build.gradle')
  if (!fs.existsSync(gPath)) { console.log(`  ⏭  未找到 android-${role}/app/build.gradle`); continue }
  const g = fs.readFileSync(gPath, 'utf8')
  const newG = g
    .replace(/versionName\s+"v\d+"/, `versionName "${next}"`)
    .replace(/versionCode\s+\d+/, `versionCode ${majorNum}`)
  if (newG !== g) {
    fs.writeFileSync(gPath, newG)
    console.log(`  ✅ clients/android-${role}/app/build.gradle（versionName + versionCode）`)
  }
}

console.log(`\n✅ 完成。下一步建议：`)
console.log(`  1. npm run test:all                      # 跑测试`)
console.log(`  2. node scripts/build-web.mjs            # 重构建`)
console.log(`  3. node scripts/preflight.mjs            # 发布前检查`)
console.log(`  4. git diff                              # 人工 review`)
