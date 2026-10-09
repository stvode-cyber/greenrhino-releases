// videoPlayer.js — 影像（视频）窗口的播放器。
// 空态：用视频内容网格填满整个主区域（不再是一块留白黑屏）。
// 播放态：画面铺满整屏（object-fit:cover，不留黑边），画面下方是增强控制条：
//   倍速 / 音轨 / 字幕轨 / 载入字幕 / 章节 / 画中画 / 旋转 / 比例 / 截图 / AB 循环 / 生成片段。
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { getSettings, saveTrackPref, deleteMedia } from '../store.js'
import { mediaLibrary } from './library.js'

export function buildVideoPlayer(app) {
  const lib = mediaLibrary(app, 'video')   // 空态内容：视频库网格，铺满

  const video = h('video', { playsinline: true, preload: 'metadata' })
  const stage = h('div', { class: 'vp-stage' }, video)

  // HEVC/10bit 等不兼容编码的实时转码进度（C# ffmpeg 回传百分比）
  const transcodeBox = h('div', { class: 'transcode-progress', hidden: true },
    h('div', { class: 'tc-row' },
      h('span', { class: 'tc-text' }, '正在转码为 H.264…'),
      h('span', { class: 'tc-pct' }, '0%')),
    h('div', { class: 'tc-bar' }, h('div', { class: 'tc-fill', style: { width: '0%' } })))
  stage.appendChild(transcodeBox)
  function showTc(pct) {
    transcodeBox.hidden = false
    const f = transcodeBox.querySelector('.tc-fill'), p = transcodeBox.querySelector('.tc-pct')
    if (f) f.style.width = pct + '%'
    if (p) p.textContent = pct + '%'
  }
  const hideTc = () => { transcodeBox.hidden = true }
  player.on('transcode', () => showTc(0))
  player.on('transcodeProgress', (e) => showTc((e && e.pct) || 0))
  player.on('transcodeDone', hideTc)

  // ---------- 增强控制条（倍速 / 音轨 / 字幕 / 章节 / 画中画 / 旋转 / 比例 / 截图 / AB 循环 / 片段 / 全屏） ----------
  let rotate = 0, fit = 'contain'

  const speedSel = h('select', { class: 'opt', onchange: (e) => player.setSpeed(parseFloat(e.target.value)) },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) =>
      h('option', { value: String(s), selected: s === 1 }, s + 'x')))

  const subInput = h('input', { type: 'file', accept: '.srt,.vtt,.txt', style: { display: 'none' } })
  subInput.addEventListener('change', async () => {
    const f = subInput.files[0]; if (!f) return
    await player.loadSubtitle(f); toast('字幕已载入')
    setTimeout(refreshTrackSelects, 400)
  })

  const audSel = h('select', { class: 'opt', title: '音轨切换', style: { display: 'none' },
    onchange: (e) => {
      const i = +e.target.value
      const at = video.audioTracks
      if (at) for (let k = 0; k < at.length; k++) at[k].enabled = (k === i)
      saveTrackPref(player.current?.id, 'audio', i)
    } })
  const subSel = h('select', { class: 'opt', title: '字幕轨切换', style: { display: 'none' },
    onchange: (e) => {
      const idx = +e.target.value
      const tt = video.textTracks
      for (let k = 0; k < tt.length; k++) tt[k].mode = (idx < 0 ? 'disabled' : (k === idx ? 'showing' : 'disabled'))
      saveTrackPref(player.current?.id, 'subtitle', idx)
    } })

  const chapInput = h('input', { type: 'file', accept: '.txt,.lrc,.csv', style: { display: 'none' } })
  chapInput.addEventListener('change', async () => {
    const f = chapInput.files[0]; if (!f) return
    await player.loadChapters(f)
    const cs = player.getChapters()
    toast(cs.length ? `已载入 ${cs.length} 个章节` : '未解析到章节节点')
  })

  // AB 循环与片段剪辑
  const fmtT = (s) => { if (s == null) return '--'; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}` }
  const updAB = () => {
    const ab = player._ab || {}
    const aEl = document.getElementById('abA'); if (aEl) aEl.textContent = 'A:' + fmtT(ab.a)
    const bEl = document.getElementById('abB'); if (bEl) bEl.textContent = 'B:' + fmtT(ab.b)
  }
  player.on('time', () => updAB())

  function screenshot() {
    if (!video.videoWidth) { toast('视频尚未加载', 'err'); return }
    const c = document.createElement('canvas')
    c.width = video.videoWidth; c.height = video.videoHeight
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
    c.toBlob((blob) => {
      const a = h('a', { href: URL.createObjectURL(blob), download: `截图-${Date.now()}.png` })
      document.body.appendChild(a); a.click(); a.remove()
      toast('截图已保存')
    })
  }

  function generateClip() {
    const item = player.current
    const ab = player._ab || {}
    if (ab.a == null || ab.b == null || ab.b <= ab.a) { toast('请先设置有效的 A/B 点', 'err'); return }
    const path = item && item.localPath
    if (!path) { toast('仅支持本地文件生成片段（双击/外部打开的视频可用）', 'info'); return }
    const dur = player.getDuration() || ab.b
    const a = Math.max(0, ab.a), b = Math.min(dur, ab.b)
    toast(`正在生成片段 ${fmtT(a)}~${fmtT(b)} …`)
    try {
      window.chrome?.webview?.postMessage(JSON.stringify({ type: 'clip', path, start: a, end: b }))
    } catch (e) { toast('当前环境不支持片段生成', 'err') }
  }
  player.on('clipResult', (m) => {
    if (m && m.ok) toast('片段已保存：' + (m.path || ''))
    else toast(m && m.msg ? m.msg : '片段生成失败', 'err')
  })

  // 🔶 进度条：seekbar + 时间显示
  const seekBar = h('input', {
    type: 'range', class: 'vp-seek',
    min: 0, max: 1000, step: 1, value: 0,
  })
  const timeCur = h('span', { class: 'vp-time' }, '0:00')
  const timeTot = h('span', { class: 'vp-time' }, '0:00')
  const seekRow = h('div', { class: 'vp-seek-row' }, timeCur, seekBar, timeTot)
  // 🔶 拖动中：只更新显示，不 seek（避免频繁 seek 卡顿）
  let seeking = false
  seekBar.addEventListener('input', () => {
    seeking = true
    const pct = +seekBar.value / 1000
    const dur = player.getDuration() || video.duration || 0
    timeCur.textContent = fmtT(pct * dur)
  })
  // 🔶 松手后真正 seek
  seekBar.addEventListener('change', () => {
    const pct = +seekBar.value / 1000
    const dur = player.getDuration() || video.duration || 0
    if (dur > 0) {
      player.seek(pct * dur)
      timeCur.textContent = fmtT(pct * dur)
    }
    seeking = false
  })
  // 🔶 点击进度条任意位置 seek（不只是拖 slider）
  seekBar.addEventListener('click', (e) => {
    const rect = seekBar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekBar.value = Math.round(pct * 1000)
    const dur = player.getDuration() || video.duration || 0
    if (dur > 0) { player.seek(pct * dur); timeCur.textContent = fmtT(pct * dur) }
  })

  // 🔶 video 原生事件驱动进度条更新
  video.addEventListener('timeupdate', () => {
    if (seeking) return   // 用户在拖动，别抢
    const cur = video.currentTime || 0
    const dur = video.duration || player.getDuration() || 0
    timeCur.textContent = fmtT(cur)
    if (dur > 0) seekBar.value = Math.round((cur / dur) * 1000)
  })
  video.addEventListener('loadedmetadata', () => {
    const dur = video.duration || player.getDuration() || 0
    timeTot.textContent = fmtT(dur)
  })
  // 兜底：player loaded 事件也更总时长（某些视频格式 metadata 晚到）
  player.on('loaded', () => {
    const dur = player.getDuration() || 0
    if (dur > 0) timeTot.textContent = fmtT(dur)
  })
  player.on('time', () => {
    // 兜底更新（video timeupdate 没触发时）
    if (seeking) return
    const cur = player.getTime?.() ?? 0
    const dur = player.getDuration?.() ?? 0
    if (cur > 0 && dur > 0) {
      timeCur.textContent = fmtT(cur)
      seekBar.value = Math.round((cur / dur) * 1000)
    }
  })

    const opts = h('div', { class: 'vp-opts' },
    seekRow,   // 🔶 进度条在控制条最顶部
    h('button', { class: 'opt vp-back', title: '返回视频库', onclick: () => {
      if (document.body.classList.contains('video-immersive')) {
        document.body.classList.remove('video-immersive');
        try { window.RhinoBridge?.toggleFullscreen?.() } catch {}
      }
      document.body.classList.remove('video-playing');
      const stage = document.querySelector('.vp-stage'); if (stage) stage.style.display = 'none';
      const libEl = document.querySelector('#view .vp-page > div:first-child'); if (libEl) libEl.style.display = '';
      showGrid();
      if (player) player.stop();
    } }, '← 返回'),
    h('span', { class: 'opt', style: { pointerEvents: 'none', opacity: .7 } }, '⏩'), speedSel,
    audSel, subSel,
    h('button', { class: 'opt', title: '载入字幕(.srt/.vtt)', onclick: () => subInput.click() }, '📝 字幕'),
    h('button', { class: 'opt', title: '旋转', onclick: () => { rotate = (rotate + 1) % 4; video.style.transform = `rotate(${rotate * 90}deg)` } }, '🔄'),
    h('button', { class: 'opt', title: '画面比例(完整显示/铺满裁剪)', onclick: () => { fit = fit === 'contain' ? 'cover' : 'contain'; video.style.objectFit = fit; toast('比例：' + (fit === 'contain' ? '完整显示' : '铺满裁剪')) } }, '📐'),
    h('button', { class: 'opt', title: '截图', onclick: screenshot }, '📸'),
    h('button', { class: 'opt opt-ab', title: '设 A 点(循环起点)', onclick: () => { player.setAB(player.getTime(), (player._ab || {}).b); updAB(); toast('已设 A 点 ' + fmtT(player.getTime())) } }, 'ⓐ'),
    h('button', { class: 'opt opt-ab', title: '设 B 点(循环终点)', onclick: () => { player.setAB((player._ab || {}).a, player.getTime()); updAB(); toast('已设 B 点 ' + fmtT(player.getTime())) } }, 'ⓑ'),
    h('button', { class: 'opt opt-ab', title: '清除 AB 循环', onclick: () => { player.clearAB(); updAB(); toast('已清除 AB 循环') } }, '✕AB'),
    h('button', { class: 'opt', title: '生成片段(保存到视频/影音先锋剪辑)', onclick: () => { document.querySelectorAll('.opt-ab').forEach(b => b.classList.toggle('show')); generateClip() } }, '✂ 生成片段'),
    h('button', { class: 'opt vp-fs', title: '全屏/退出全屏', onclick: () => toggleFullscreen() }, '🔲 全屏'),
    h('span', { class: 'opt opt-ab ab-label', id: 'abA' }, 'A:--'),
    h('span', { class: 'opt opt-ab ab-label', id: 'abB' }, 'B:--')
  )
  stage.appendChild(opts)

  function refreshTrackSelects() {
    const at = video.audioTracks
    audSel.innerHTML = ''
    if (at && at.length > 1) {
      audSel.style.display = ''
      for (let k = 0; k < at.length; k++) audSel.appendChild(h('option', { value: String(k), selected: at[k].enabled }, at[k].label || at[k].language || `音轨 ${k + 1}`))
    } else audSel.style.display = 'none'
    const tt = video.textTracks
    subSel.innerHTML = ''
    subSel.appendChild(h('option', { value: '-1' }, '关闭字幕'))
    const subs = []
    for (let k = 0; k < tt.length; k++) if (tt[k].kind === 'subtitles' || tt[k].kind === 'captions') subs.push({ t: tt[k], idx: k })
    if (subs.length) {
      subSel.style.display = ''
      subs.forEach(({ t, idx }) => subSel.appendChild(h('option', { value: String(idx), selected: t.mode === 'showing' }, t.label || t.language || `字幕 ${idx + 1}`)))
    } else subSel.style.display = 'none'
    applyTrackPrefs()
  }

  // 记忆上次的音轨/字幕轨选择，下次打开同一视频自动套用
  async function applyTrackPrefs() {
    const item = player.current
    if (!item || item.type !== 'video') return
    const s = await getSettings()
    const pref = s.trackPrefs?.[item.id]
    if (!pref) return
    const at = video.audioTracks
    if (pref.audio != null && at && at[pref.audio]) {
      for (let k = 0; k < at.length; k++) at[k].enabled = (k === pref.audio)
      audSel.value = String(pref.audio)
    }
    const tt = video.textTracks
    if (pref.subtitle != null && tt && tt.length) {
      for (let k = 0; k < tt.length; k++) tt[k].mode = (pref.subtitle < 0 ? 'disabled' : (k === pref.subtitle ? 'showing' : 'disabled'))
      subSel.value = String(pref.subtitle)
    }
  }

  const el = h('div', { class: 'vp-page' }, lib.el, stage)

  player.setVideoElement(video)
  video.addEventListener('click', () => player.toggle())
  video.addEventListener('dblclick', toggleFullscreen)   // 双击画面：全屏/退出全屏
  function toggleFullscreen() {
  console.log('[gr] toggleFullscreen called, RhinoBridge=', !!window.RhinoBridge, 'immersive=', document.body.classList.contains('video-immersive'))
    try {
      const bridge = window.RhinoBridge
      if (bridge?.toggleFullscreen) {
        try { console.log('[gr] calling RhinoBridge.toggleFullscreen'); bridge.toggleFullscreen(); console.log('[gr] RhinoBridge.toggleFullscreen returned') } catch(e) { console.error('[gr] bridge error:', e) }                        // → Android 原生：切横屏 + 沉浸式
        const alreadyImmersive = document.body.classList.contains('video-immersive')
        const willEnter = !alreadyImmersive
        // 🔶 显式 add/remove（不用 toggle！避免状态漂移）
        if (willEnter) document.body.classList.add('video-immersive')
        else document.body.classList.remove('video-immersive')
        document.body.classList.toggle('video-playing', true)
        video.style.objectPosition = 'center center'
        video.style.objectFit = willEnter ? 'cover' : 'contain'
        setTimeout(() => { window.dispatchEvent(new Event('resize')) }, 150)
        toast(willEnter ? '已进入全屏（横屏）' : '已退出全屏（竖屏）')
        return
      }
      // 兜底：HTML5 Fullscreen API（桌面浏览器）
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      if (fsEl) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        exit?.call(document); toast('已退出全屏')
      } else {
        const target = video.requestFullscreen || video.webkitRequestFullscreen
        if (target) { target.call(video); toast('已进入全屏') }
        else toast('当前环境不支持全屏')
      }
    } catch (e) {
      window.RhinoBridge?.log?.('全屏失败: ' + (e?.message || e))
      toast('全屏失败: ' + (e?.message || e))
    }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
    // 退出全屏优先
    if (document.fullscreenElement || document.webkitFullscreenElement) return
    // 否则是 Android 兜底
    try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'fullscreen' })) } catch {}
  }})

  // 空态显示内容网格；播放时画面铺满覆盖
  // 🔶 ISS-20261008-005：返回时强制停 video（display:none 不自动 pause！）
  // 🔶 ISS-20261009-001：加 _exiting flag 防下滑 exit 动画被 trackchanged 抢先打断
  let _exiting = false
  function showGrid() {
    if (_exiting) return  // 下滑 exit 动画正在跑，别插手
    _exiting = false
    try { video.pause() } catch {}
    try { video.currentTime = 0 } catch {}
    // 🔶 清掉任何残留 inline style（下滑手势 transform/opacity/transition）
    stage.style.transition = ''
    stage.style.transform = ''
    stage.style.opacity = ''
    stage.style.display = 'none'
    lib.el.style.display = ''
    document.body.classList.remove('video-playing')
    document.body.classList.remove('video-immersive')
  }
  // 🔶 ISS-20261009-001：每次 showStage 都清残留，避免上次手势的 transform 带到这次播放
  function showStage() {
    stage.style.transition = ''
    stage.style.transform = ''
    stage.style.opacity = ''
    stage.style.display = 'flex'
    lib.el.style.display = 'none'
    document.body.classList.add('video-playing')
  }

  // 🔶 旋转时强制刷新 WebView 尺寸（左边黑块根因）
  // Android 原生调用 window.__onOrientationChange() 或 dispatchEvent('orientationchange')
  window.__onOrientationChange = () => {
    // 强制 vp-page/vp-stage 重新计算 100vw/100vh
    document.querySelectorAll('.vp-page, .vp-stage').forEach(el => {
      el.style.width = ''; el.style.height = ''
      el.offsetHeight // 触发 reflow
    })
  }
  window.addEventListener('orientationchange', window.__onOrientationChange)
  // 兜底：resize 事件也刷（某些设备旋转后不触发 orientationchange 只触发 resize）
  window.addEventListener('resize', () => {
    if (document.body.classList.contains('video-immersive')) window.__onOrientationChange()
  })

  // 🔶 控制条自动隐藏：3s 无操作 → 淡出；点画面 → 温柔唤起
  let hideTimer = null
  function showControls() {
    stage.classList.remove('ctrl-hidden')
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => stage.classList.add('ctrl-hidden'), 3000)
  }
  // 中间透明层：点画面唤起控制条
  const hintLayer = h('div', { class: 'vp-hint' })
  hintLayer.addEventListener('click', () => {
    // 唤起控制条 + 1.5s 后再 auto-hide
    showControls()
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => stage.classList.add('ctrl-hidden'), 1500)
  })
  stage.appendChild(hintLayer)
  // 控制条里任何操作都重置 timer
  opts.addEventListener('click', showControls)
  opts.addEventListener('mousemove', showControls)
  // 🔶 ISS-20261009-001：把两个 touchstart 合并，避免竞争闪烁
  stage.addEventListener('touchstart', (e) => {
    // 先判定下滑手势——如果是从顶部区域起手，不触发 showControls
    const immersive = document.body.classList.contains('video-immersive')
    const t = e.touches[0]
    const rect = stage.getBoundingClientRect()
    const fromTop = !immersive && (t.clientY - rect.top <= rect.height * 0.25)
    if (!fromTop) showControls()
  }, { passive: true })
  stage.addEventListener('mousemove', showControls)

  // 🔶 ISS-20261008-007 + ISS-20261009-001：播放时下滑手势退出
  {
    let panStartY = 0, panStartX = 0, trackingPan = false, panActive = false
    stage.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('video-immersive')) return
      const t = e.touches[0]
      const rect = stage.getBoundingClientRect()
      if (t.clientY - rect.top > rect.height * 0.25) return
      panStartY = t.clientY; panStartX = t.clientX; trackingPan = true
    }, { passive: true })
    stage.addEventListener('touchmove', (e) => {
      if (!trackingPan) return
      const t = e.touches[0]
      const dy = t.clientY - panStartY
      const dx = t.clientX - panStartX
      if (panActive || (dy > 20 && Math.abs(dy) > Math.abs(dx) * 1.2)) {
        panActive = true
        e.preventDefault?.()
        const progress = Math.min(1, dy / 180)
        const maxOffset = 120
        stage.style.transform = `translateY(${Math.min(dy * 0.5, maxOffset)}px)`
        stage.style.opacity = String(1 - progress * 0.4)
      }
    }, { passive: false })
    const endPan = (touchPoint) => {
      if (!trackingPan) return
      trackingPan = false
      if (panActive) {
        const dy = touchPoint ? (touchPoint.clientY - panStartY) : 0
        stage.style.transition = 'transform .28s ease, opacity .28s ease'
        if (dy > 100) {
          // 🔶 ISS-20261009-001：设 _exiting=true 防止 player.stop() 触发的 trackchanged 抢先调 showGrid()
          _exiting = true
          // 立刻停 video（别等 250ms，不然 trackchanged 会来烦）
          try { video.pause() } catch {}
          stage.style.transform = 'translateY(100%)'
          stage.style.opacity = '0'
          setTimeout(() => {
            // 动画跑完：清 inline style → 切 display → 清 _exiting
            stage.style.transition = ''
            stage.style.transform = ''
            stage.style.opacity = ''
            _exiting = false
            showGrid()
          }, 280)  // 比 transition 多 30ms 余量
        } else {
          // 不够距离 → 弹回
          stage.style.transform = ''
          stage.style.opacity = ''
          setTimeout(() => { stage.style.transition = '' }, 300)
        }
        panActive = false
      }
    }
    stage.addEventListener('touchend', (e) => {
      if (!trackingPan) return
      const t = e.changedTouches[0]
      endPan(t)
    }, { passive: true })
    stage.addEventListener('touchcancel', () => { trackingPan = false; if (panActive) endPan() }, { passive: true })
  }
  // 视频元素自身：点击唤起控制条（不切播放！）
  video.removeEventListener('click', () => player.toggle())
  player.on('trackchanged', (it) => {
    const playing = !!(it && it.type === 'video')
    if (playing) { showStage(); setTimeout(refreshTrackSelects, 60) } else showGrid()
    hideTc()
  })
  player.on('loaded', (item) => { if (item?.type === 'video') setTimeout(refreshTrackSelects, 60) })
  // 🔶 ISS-20261009-004：视频加载失败自动移除 + 冷却防重复 toast
  const _errHandled = new Set()  // 每个 item.id 只处理一次 error
  player.on('lost', (item) => {
    if (!item || _errHandled.has(item.id)) return
    _errHandled.add(item.id)
    // 🔶 ISS-20261009-008：明确提示"文件不存在"（区别于编码不兼容）
    toast(`「${item.name || '文件'}」文件不存在，从库移除`, 'warn')
    deleteMedia(item.id).then(() => { lib.refresh(); showGrid() })
  })
  player.on('error', (msg, item) => {
    if (!item || item.type !== 'video' || _errHandled.has(item.id)) return
    _errHandled.add(item.id)
    // 🔶 ISS-20261009-008：优先用 player 传来的 msg（已带明确文案），没有再用 error.code 猜
    if (msg) {
      toast(`「${item.name}」${msg.replace(/^「[^」]*」/, '')}`, 'warn')
    } else {
      const code = player.videoEl?.error?.code || 0
      const reason = code === 3 ? '编码不兼容(H.265/HEVC)' : (code === 4 ? '源不支持' : '加载失败')
      toast(`「${item.name}」${reason}，从库移除`, 'warn')
    }
    deleteMedia(item.id).then(() => { lib.refresh(); showGrid() })
  })
  if (video.textTracks) {
    video.textTracks.onaddtrack = () => refreshTrackSelects()
    video.textTracks.onremovetrack = () => refreshTrackSelects()
  }
  showGrid()

  return {
    el,
    _video: video,
    refresh() { lib.refresh() },
    show() {
      // 重建合成层，规避 WebView2 display:none 黑屏
      video.style.display = 'none'; void video.offsetWidth
      requestAnimationFrame(() => { video.style.display = '' })
      try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoKick' })) } catch {}
      lib.refresh()
    },
    hide() { try { video.pause() } catch {} },
    cleanup() { lib.cleanup() }
  }
}