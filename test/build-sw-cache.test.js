// Node 原生测试 —— sw.js CACHE 占位符替换
// 跑法：node --test test/build-sw-cache.test.js
//
// 修复的 bug（2026-09-13 自我进化审计发现）：
//   sw.js 源码里 const CACHE = 'greenrhino-v14' —— 硬编码遗留版本号，
//   靠 build-web.mjs 里两条隐式正则 replace(/'greenrhino-v14'/, ...) + replace(/'greenrhino-v\d+'/, ...)
//   掩盖问题。一旦正则失效，release 产物 cache 名直接变成 v14。
//
// 修复方案：显式占位符 '__SW_CACHE__'，精确匹配替换。
// 本测试保证此行为不再退化。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SW_SRC = path.join(ROOT, 'sw.js')
const MUSIC_SW_OUT = path.join(ROOT, 'release', 'pwa-site-music', 'sw.js')
const PLAYER_SW_OUT = path.join(ROOT, 'release', 'pwa-site-player', 'sw.js')

// 先确保 build-web.mjs 跑过（有 release 产物）
function runBuild() {
  execSync('node scripts/build-web.mjs', {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8'
  })
}

// 一次 build 测到底——重复跑不会改变产物
runBuild()

// ────────────────────────────────────────
// 测试 1：sw.js 源码必须有精确占位符
// ────────────────────────────────────────
test('sw.js 源码有 __SW_CACHE__ 占位符', () => {
  const src = fs.readFileSync(SW_SRC, 'utf8')
  assert.ok(
    src.includes("'__SW_CACHE__'"),
    'sw.js 源码里必须存在精确占位符 __SW_CACHE__，当前内容为:\n' +
      src.split('\n').find(l => l.includes('CACHE'))
  )
})

// ────────────────────────────────────────
// 测试 2：源码里不能再有硬编码版本号（回归检测）
// ────────────────────────────────────────
test('sw.js 源码没有硬编码的 greenrhino-v* 版本号', () => {
  const src = fs.readFileSync(SW_SRC, 'utf8')
  const re = /greenrhino-v\d+/
  assert.ok(
    !re.test(src),
    'sw.js 里不应再出现 greenrhino-vN 硬编码版本号（应为占位符 __SW_CACHE__），' +
      '发现: ' + (src.match(re)?.[0] ?? '(未知)')
  )
})

// ────────────────────────────────────────
// 测试 3：music release 产物 cache 名正确
// ────────────────────────────────────────
test('music release sw.js cache 名 = gr-music-v16（与 APP_VERSION 同步）', () => {
  const out = fs.readFileSync(MUSIC_SW_OUT, 'utf8')
  // 占位符必须消失
  assert.ok(
    !out.includes('__SW_CACHE__'),
    '占位符 __SW_CACHE__ 应被替换后消失，当前 release/sw.js 内容:\n' +
      out.split('\n').find(l => l.includes('CACHE'))
  )
  // cache 名格式正确
  const match = out.match(/const CACHE = '([^']+)'/)
  assert.ok(match, '找不到 const CACHE = ... 赋值语句')
  const cacheName = match[1]
  assert.ok(
    cacheName.startsWith('gr-music-v'),
    `music 版 cache 应以 gr-music-v 开头，实际: ${cacheName}`
  )
})

// ────────────────────────────────────────
// 测试 4：player release 产物 cache 名正确
// ────────────────────────────────────────
test('player release sw.js cache 名 = gr-player-v16（与 APP_VERSION 同步）', () => {
  const out = fs.readFileSync(PLAYER_SW_OUT, 'utf8')
  assert.ok(!out.includes('__SW_CACHE__'), '占位符应消失')
  const match = out.match(/const CACHE = '([^']+)'/)
  assert.ok(match, '找不到 const CACHE = ... 赋值语句')
  const cacheName = match[1]
  assert.ok(
    cacheName.startsWith('gr-player-v'),
    `player 版 cache 应以 gr-player-v 开头，实际: ${cacheName}`
  )
})

// ────────────────────────────────────────
// 测试 5：双 App cache 名不串（最重要的隔离保证）
// ────────────────────────────────────────
test('music 和 player 两个 App 的 cache 名严格不同（隔离验证）', () => {
  const musicCache = fs.readFileSync(MUSIC_SW_OUT, 'utf8').match(/const CACHE = '([^']+)'/)?.[1]
  const playerCache = fs.readFileSync(PLAYER_SW_OUT, 'utf8').match(/const CACHE = '([^']+)'/)?.[1]
  assert.ok(musicCache && playerCache, '两个 release sw.js 都应可解析')
  assert.notEqual(
    musicCache, playerCache,
    `两个 App 的 cache 名不应相同！music=${musicCache}, player=${playerCache}`
  )
  assert.ok(
    musicCache.includes('music') && playerCache.includes('player'),
    `music cache 应含 'music'，player cache 应含 'player'，实际: music=${musicCache}, player=${playerCache}`
  )
})

// ────────────────────────────────────────
// 测试 6：版本号与 build-web.mjs 的 APP_VERSION 一致
// ────────────────────────────────────────
test('cache 名里的版本号与 build-web.mjs 的 APP_VERSION 同步', () => {
  const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'build-web.mjs'), 'utf8')
  const m = buildSrc.match(/const APP_VERSION = '(\w+)'/)
  assert.ok(m, '找不到 APP_VERSION 定义')
  const version = m[1] // 如 v16

  const musicCache = fs.readFileSync(MUSIC_SW_OUT, 'utf8').match(/const CACHE = '([^']+)'/)?.[1]
  const playerCache = fs.readFileSync(PLAYER_SW_OUT, 'utf8').match(/const CACHE = '([^']+)'/)?.[1]

  assert.ok(
    musicCache.includes(version),
    `music cache ${musicCache} 应包含 APP_VERSION ${version}`
  )
  assert.ok(
    playerCache.includes(version),
    `player cache ${playerCache} 应包含 APP_VERSION ${version}`
  )
})
