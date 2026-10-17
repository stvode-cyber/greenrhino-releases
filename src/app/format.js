// src/app/format.js — 纯格式化工具函数（零外部依赖）
// 从 main.js 抽离，main.js 原 line 52-58

/** 字节数友好显示：B/KB/MB/GB */
export function fmtQuota(n) {
  if (n == null || !n) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}
