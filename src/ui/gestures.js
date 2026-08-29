// gestures.js — 移动端触摸手势
import { player } from '../player.js'

export function initGestures(app) {
  const view = document.getElementById('view')
  let sx = 0, sy = 0, st = 0, tracking = false, lastTap = 0
  const SWIPE = 45
  const ignore = 'input,button,select,.card,.q-item,.line,.opt,.tag,.nav-item,.mode-btn,.seek,.vol,.lyrics'

  view.addEventListener('touchstart', (e) => {
    if (app.page !== 'music' && app.page !== 'video') return
    if (e.target.closest(ignore)) return
    const t = e.touches[0]
    sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true
  }, { passive: true })

  view.addEventListener('touchend', (e) => {
    if (!tracking) return
    tracking = false
    const t = e.changedTouches[0]
    const dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st
    if (dt > 600) return

    // 视频区垂直滑动：右半屏调音量，左半屏调亮度
    if (app.page === 'video' && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
      const video = document.querySelector('video')
      const stage = video?.parentElement
      if (video && stage) {
        const r = stage.getBoundingClientRect()
        const onRight = t.clientX - r.left > r.width / 2
        if (onRight) {
          const v = player.volume + (dy < 0 ? 0.08 : -0.08)
          player.setVolume(Math.max(0, Math.min(1, v)))
        } else {
          const cur = parseFloat(video.dataset.brightness || '1')
          const b = Math.max(0.3, Math.min(1.5, cur + (dy < 0 ? 0.1 : -0.1)))
          video.dataset.brightness = String(b)
          video.style.filter = `brightness(${b})`
        }
      }
      return
    }

    // 水平滑动：切歌
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) player.next(true); else player.prev()
      return
    }

    // 双击暂停（仅音乐页；视频页用单击切换）
    if (app.page === 'music' && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now()
      if (now - lastTap < 300) { player.toggle(); lastTap = 0 }
      else lastTap = now
    }
  }, { passive: true })
}
