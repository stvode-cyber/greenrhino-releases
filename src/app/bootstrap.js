// src/app/bootstrap.js — 启动装配 + PWA + Media Session
// 🔶 大重构 T20261020-04：从 main.js 提取
import { h, toast, openModal } from '../ui/dom.js'
import { player } from '../player.js'
import { getSettings, saveSettings, getMedia, getAllMedia } from '../store.js'
import { openHelp } from '../help.js'
import { ctx } from './context.js'

// ---------- 主题 + 续播恢复 ----------
// 🔶 必须在 ctx.app/ctx.pages 赋值后调用（main.js 在 ctx 填充后调用 initBootstrap()）
export async function initBootstrap() {
  const app = ctx.app; const pages = ctx.pages; const ROLE = ctx.ROLE; const isHub = ctx.isHub
  if (!app || !pages) return

  const s = await getSettings()
  // 音乐窗口固定浅色；其余尊重用户设置
  document.documentElement.setAttribute('data-theme', ROLE === 'music' ? 'light' : (s.theme || 'dark'))
  app.mode = s.lastMode || 'music'
  player.setPlayModes(s.playModes || { music: s.playMode || 'loop', video: 'order' })

  // Hub 续播恢复：预载不自动响，外部打开由 __hostOpen 守卫
  if (isHub) {
    if (s.resumeEnabled && s.lastPlayedId && !window.__hostOpened) {
      const item = await getMedia(s.lastPlayedId)
      if (item && pages[item.type]) {
        player.setQueue([item], item.id)
        player.playItem(item, { autoplay: false })
      }
    }
  }
  // 首次启动引导（仅 Hub 一次）
  if (s.firstRun && isHub) openWelcome()
}

// 记住最后播放的曲目 + 播放模式持久化（这两个 player.on 可以保留在 bootstrap）
export function wirePlayerPersistence() {
  player.on('trackchanged', (item) => { if (item) saveSettings({ lastPlayedId: item.id }) })
  player.on('playmode', () => saveSettings({ playModes: player.playModes }))
}

// ---------- 首次启动引导 ----------
export function openWelcome() {
  const body = h('div', { class: 'mb' },
    h('p', { style: { color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.6 } },
      '这是一个完全离线的媒体播放器：你的音乐与视频都保存在本机，断网也能播放，数据不外传。'),
    h('ul', { class: 'wl', style: { margin: '0 0 16px', paddingLeft: '18px', color: 'var(--text-2)', lineHeight: 1.8 } },
      h('li', {}, '📥 从本机导入单个文件，或整个文件夹'),
      h('li', {}, '🎚 音乐支持 EQ 均衡与实时频谱'),
      h('li', {}, '🎬 视频支持字幕、多音轨、章节跳转'),
      h('li', {}, '📲 可「安装」到桌面/主屏，像原生 App 一样离线使用')),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'cta', onclick: () => { close(); ctx.app.importFilesDialog() } }, '导入媒体'),
      h('button', { class: 'ghost-btn', onclick: () => { close(); openHelp() } }, '使用说明')))
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '欢迎使用绿角犀播放器'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
  const close = openModal(modal, { onClose: () => saveSettings({ firstRun: false }) })
}

// ---------- Media Session（锁屏/通知控制） ----------
export function wireMediaSession() {
  if (!('mediaSession' in navigator)) return
  player.on('trackchanged', (item) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || item.name,
      artist: item.artist || '',
      album: item.album || '',
      artwork: item.cover ? [{ src: item.cover }] : []
    })
  })
  navigator.mediaSession.setActionHandler('play', () => player.play())
  navigator.mediaSession.setActionHandler('pause', () => player.pause())
  navigator.mediaSession.setActionHandler('previoustrack', () => player.prev())
  navigator.mediaSession.setActionHandler('nexttrack', () => player.next(true))
  player.on('play', () => { navigator.mediaSession.playbackState = 'playing' })
  player.on('pause', () => { navigator.mediaSession.playbackState = 'paused' })
}

// ---------- Service Worker + PWA install ----------
export function wirePWA() {
  // SW 注册（http/https 下启用）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }

  // PWA install 引导
  const installBtn = document.getElementById('install-btn')
  ctx.installBtn = installBtn
  let deferredPrompt = null
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    if (installBtn) installBtn.hidden = false
  })
  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.hidden = true
    deferredPrompt = null
    toast('绿角犀播放器已安装，感谢使用 🎉')
  })
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt || typeof deferredPrompt.prompt !== 'function') {
      toast('浏览器未提供安装入口，可在菜单选择「安装绿角犀播放器 / 添加到主屏幕」', 'info')
      return
    }
    deferredPrompt.prompt()
    try {
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') toast('已开始安装，感谢使用绿角犀播放器')
    } catch {}
    deferredPrompt = null
    installBtn.hidden = true
  })
}
