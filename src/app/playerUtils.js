// src/app/playerUtils.js — 播放编排 / 睡眠定时 / 异常保护 / 后台暂停
// 从 main.js 第三批提取（playItem/playList/openSleepModal/trySkipInQueue/error-lost handlers/visibilitychange）
// 耦合映射：player → 模块单例 import；app/showPage → ctx；h/toast/openModal → dom.js

import { player } from '../player.js'
import { ctx } from './context.js'
import { h, toast, openModal } from '../ui/dom.js'
import { fetchOnlineLyric } from '../lyricFetch.js'

// ---------- 播放 ----------

export function playItem(item) {
  ctx.app.mode = item.type
  // 🔶 队列上下文：activeSource（当前页面过滤后的列表）优先，其次 currentList
  const source = ctx.app.activeSource?.length ? ctx.app.activeSource : (ctx.app.currentList || [])
  const sameType = source.filter((i) => i.type === item.type)
  const queueList = sameType.length ? sameType : [item]
  // 🔶 保持用户当前页面：如果已在收藏/歌单等分类页就不跳走
  if (!['favorites', 'playlists', 'recent', 'cloud'].includes(ctx.app.page)) ctx.showPage(item.type)
  player.setQueue(queueList, item.id)
  player.playItem(item, { crossfade: player.isPlaying() })
  // 🔶 ISS-20261010-027: 播放时就后台搜歌词（不用等进全屏）
  if (!item.lyric && item.type !== 'video') {
    fetchOnlineLyric(item).catch(() => {})
  }
}

export function playList(items, first) {
  ctx.app.mode = first.type
  ctx.showPage(first.type)
  player.setQueue(items, first.id)
  player.playItem(first, { crossfade: false })
}

// ---------- 睡眠定时 ----------

export function openSleepModal() {
  const body = h('div', { class: 'mb' })
  const opts = [['关闭', 0], ['10 分钟', 10], ['20 分钟', 20], ['30 分钟', 30], ['45 分钟', 45], ['60 分钟', 60], ['90 分钟', 90], ['播完当前曲停止', 'track']]
  opts.forEach(([label, val]) => body.appendChild(h('button', {
    class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' },
    onclick: () => { player.setSleep(val); toast(val === 'track' ? '将播完当前曲后停止' : val ? `${val} 分钟后停止` : '已关闭睡眠定时'); close() }
  }, label)))
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '睡眠定时'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
  const close = openModal(modal)
}

// ---------- 异常态：解码失败 / 文件丢失（设计文档 §12） ----------
// 解码失败与文件丢失共用一套「队列内自动跳过」保护，避免 error/lost 重复触发导致多次 next 或死循环
let _skipGuard = false
let _skipStreak = 0

function trySkipInQueue(badItem, label) {
  if (_skipGuard) return
  // 以出错的曲目定位索引（error/lost 可能早于 playItem 写入 current，故优先用事件携带的 item）
  const bad = badItem || player.current
  if (bad) { const i = player.queue.findIndex(q => q && q.id === bad.id); if (i >= 0) player.index = i }
  if (player.queue.length > 1 && player.playMode !== 'one') {
    _skipStreak++
    if (_skipStreak > player.queue.length) { toast(`连续多曲无法播放（${label}），已停止`, 'err'); player.pause(); _skipGuard = false; _skipStreak = 0; return }
    _skipGuard = true
    setTimeout(() => { player.next(true); _skipGuard = false }, 1000)
  }
}

/** 注册 player error/lost handlers。必须在 ctx.app 赋值后调用。 */
export function wirePlayerErrorHandlers() {
  player.on('loaded', () => { _skipStreak = 0; _skipGuard = false }) // 成功加载则重置连续失败计数
  // 🔶 ISS-20261009-004：player role 下 video error/lost 由 videoPlayer.js 全权处理（删库+toast）
  player.on('error', (msg, item) => {
    if (item?.type === 'video' && window.__winRole === 'video') { trySkipInQueue(item, '格式不支持'); return }
    toast(msg || '该格式暂不支持播放', 'err')
    trySkipInQueue(item, '格式不支持')
  })
  player.on('lost', (item) => {
    if (item?.type === 'video' && window.__winRole === 'video') return
    toast(`「${item?.title || item?.name || '该文件'}」文件已丢失`, 'err')
    ctx.app.refreshCurrent() // 让媒体库标灰显示
    trySkipInQueue(item, '文件已丢失')
  })
}

// ---------- 进度落盘 + 后台自动暂停 ----------

let _wasPlayingOnHide = false

/** 注册 beforeunload + visibilitychange handlers。必须在 ctx.app 赋值后调用。 */
export function wireVisibilityPause() {
  window.addEventListener('beforeunload', () => player.flushProgress())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _wasPlayingOnHide = player.mode === 'video' ? !player.videoEl?.paused : (player.engines?.some(e => !e.el.paused && !e.el.ended) || false)
      if (_wasPlayingOnHide) player.pause()
      player.flushProgress()
    } else if (_wasPlayingOnHide) {
      _wasPlayingOnHide = false
      player.play?.().catch(() => {})
    }
  })
}
