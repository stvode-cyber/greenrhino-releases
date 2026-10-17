// castStatusBar.js — 全局常驻投屏状态条
// 任何页面都看得到，cast stopped 自动隐藏
// videoPlayer.js 的 castBanner 已删除，统一用这个
import { h } from './dom.js'
import { cast } from '../cast.js'
import { player } from '../player.js'

let bar = null   // 全局单例
let textEl, pauseBtn, stopBtn

/**
 * 初始化（main.js 启动时调一次）
 */
export function initCastStatusBar() {
  if (bar) return bar
  bar = h('div', { class: 'cc-bar', hidden: true },
    h('div', { class: 'cc-bar-ico' }, '📺'),
    textEl = h('span', { class: 'cc-bar-text' }, ''),
    pauseBtn = h('button', { class: 'cc-bar-btn', title: '暂停/继续', onclick: togglePause }, '⏸'),
    stopBtn = h('button', { class: 'cc-bar-btn', title: '停止投屏', onclick: () => { cast.stop() } }, '■ 停止')
  )
  document.body.appendChild(bar)

  cast.on('status', (s) => {
    updateStatus(s)
  })
  cast.on('devices', () => {})   // 保持
  cast.on('error', () => {})

  // 初始状态恢复（App 重启时如果还在投）
  if (cast.state.casting) showBar(cast.state.deviceName || '电视', 'PLAYING')

  return bar
}

function togglePause() {
  const st = (cast.state.status || '').toUpperCase()
  const isPlaying = ['PLAYING', 'TRANSITIONING'].some(x => st.includes(x))
  if (isPlaying) cast.pause()
  else cast.resume?.() || cast.play?.() || player.toggle()
}

function updateStatus(s) {
  if (!s || !cast.state.casting && !['playing','paused'].includes((s.state||'').toLowerCase())) {
    // stopped
    bar.hidden = true
    return
  }
  const state = (s.state || '').toLowerCase()
  const isStopped = ['stopped', 'stopped_playback', 'no_media_present'].some(x => state.includes(x)) || state === ''
  if (isStopped) { bar.hidden = true; return }

  bar.hidden = false
  const tvName = cast.state.deviceName || '电视'
  const pd = (s.position && s.duration && s.duration !== '00:00:00')
    ? ` · ${s.position}/${s.duration}`
    : ''
  const label = state.includes('pause') || state.includes('paused') ? '已暂停' : '正在投送'
  textEl.textContent = `${label} → ${tvName}${pd}`

  const isPlaying = state.includes('play') && !state.includes('pause')
  pauseBtn.textContent = isPlaying ? '⏸' : '▶'
}

function showBar(name, state) {
  bar.hidden = false
  textEl.textContent = `${state === 'PAUSED_PLAYBACK' ? '已暂停' : '正在投送'} → ${name}`
}
