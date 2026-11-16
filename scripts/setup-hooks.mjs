// scripts/setup-hooks.mjs — 跨平台钩子配置
// 用法：node scripts/setup-hooks.mjs（npm run postinstall 自动触发）
// 修复：Windows CMD 不认 bash 的 2>/dev/null || true

import { execSync } from 'node:child_process'
import process from 'node:process'

try {
  execSync('git config core.hooksPath .git-hooks', { stdio: 'pipe' })
  // 验证一下
  const v = execSync('git config --get core.hooksPath', { stdio: 'pipe' }).toString().trim()
  console.log(`✅ 钩子已配置：core.hooksPath = ${v}`)
} catch (e) {
  // 非 Git 仓库 / CI 浅克隆环境 — 静默跳过
  console.log('ℹ️  非 Git 仓库或 CI 环境，跳过钩子配置（这是正常的）')
  process.exit(0)
}
