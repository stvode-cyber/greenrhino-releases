// bottombar.js — 常驻底栏（播放/进度/音量/队列/模式）
import { h, formatTime } from './dom.js'
import { player } from '../player.js'
import { cast } from '../cast.js'

// 音乐/视频各自独立的播放模式文案（视频用「单集循环」以示区分）
const PLAYMODE_LABEL = {
  music: { order: '顺序', loop: '列表循环', random: '随机', one: '单曲循环' },
  video: { order: '顺序', loop: '列表循环', random: '随机', one: '单集循环' }
}

export function initBottomBar(app) {
  const bar = document.getElementById('bottombar')
  const cover = h('div', { class: 'cover' }, '🎵')
  const title = h('div', { class: 'n' }, '未在播放')
  const sub = h('div', { class: 's' }, '—')

  const playBtn = h('button', { class: 'icon-btn primary', title: '播放/暂停 (空格)', onclick: () => player.toggle() }, '▶')
  const prevBtn = h('button', { class: 'icon-btn', title: '上一首 (P)', onclick: () => player.prev() }, '⏮')
  const nextBtn = h('button', { class: 'icon-btn', title: '下一首 (N)', onclick: () => player.next(true) }, '⏭')

  const seek = h('input', { class: 'seek', type: 'range', min: '0', max: '1000', value: '0', step: '1' })
  const tCur = h('span', { class: 'time' }, '0:00')
  const tDur = h('span', { class: 'time' }, '0:00')
  seek.addEventListener('input', () => {
    const d = player.getDuration()
    player.seek((seek.value / 1000) * d)
  })
  seek.addEventListener('mousemove', (e) => {
    const r = seek.getBoundingClientRect()
    const d = player.getDuration()
    if (!d) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    seekTip.textContent = formatTime(ratio * d)
    seekTip.style.left = (ratio * 100) + '%'
    seekTip.classList.add('show')
  })
  seek.addEventListener('mouseleave', () => seekTip.classList.remove('show'))

  // §10 章节跳转：进度条上叠加可点击节点
  const chapters = h('div', { class: 'chapters' })
  const seekTip = h('div', { class: 'seek-tip' })
  const seekWrap = h('div', { class: 'seek-wrap' }, seek, chapters, seekTip)
  function renderChapters() {
    const cs = player.getChapters()
    const d = player.getDuration()
    chapters.innerHTML = ''
    if (!cs.length || !d) { chapters.style.display = 'none'; return }
    chapters.style.display = ''
    cs.forEach((c) => chapters.appendChild(h('div', {
      class: 'ch', title: c.title,
      style: { left: Math.min(100, (c.time / d) * 100) + '%' },
      onclick: (e) => { e.stopPropagation(); player.seek(c.time) }
    })))
  }

  const queueBtn = h('button', { class: 'icon-btn', title: '播放队列', onclick: () => app.openQueue() }, '☰')
  const modeMenu = h('div', { class: 'mode-menu', hidden: true })
  const modeBtn = h('button', { class: 'mode-badge', title: '播放模式（点击选择）', onclick: (e) => { e.stopPropagation(); toggleModeMenu() } }, '')
  const modeWrap = h('div', { class: 'mode-wrap' }, modeBtn, modeMenu)
  const sleepBtn = h('button', { class: 'icon-btn', title: '睡眠定时', onclick: () => app.openSleep() }, '🌙')

  const muteBtn = h('button', { class: 'icon-btn', title: '静音 (M)', onclick: () => player.setMute(!player.muted) }, '🔊')
  const vol = h('input', { class: 'vol', type: 'range', min: '0', max: '100', value: String(Math.round(player.volume * 100)) })
  vol.addEventListener('input', () => player.setVolume(vol.value / 100))

  const castBtn = h('button', { class: 'icon-btn', title: '投屏到电视 (DLNA)', onclick: onCastClick }, '📺')

  bar.append(
    h('div', { class: 'bb-now' }, cover, h('div', { class: 'txt' }, title, sub)),
    h('div', { class: 'bb-center' },
      h('div', { class: 'bb-controls' }, prevBtn, playBtn, nextBtn),
      h('div', { class: 'progress-row' }, tCur, seekWrap, tDur)
    ),
    h('div', { class: 'bb-right' }, castBtn, queueBtn, modeWrap, sleepBtn,
      h('div', { class: 'vol-row' }, muteBtn, vol))
  )

  // 播放模式选单（音乐/视频各自独立：文案与生效值跟随当前界面）
  let modeBtns = []
  function refreshModeBadge() {
    const mode = app.mode === 'video' ? 'video' : 'music'
    const cur = player.playModes[mode] || 'order'
    modeBtn.textContent = PLAYMODE_LABEL[mode][cur]
    modeMenu.innerHTML = ''
    modeBtns = Object.keys(PLAYMODE_LABEL[mode]).map((m) => {
      const b = h('button', {
        class: cur === m ? 'active' : '',
        onclick: (e) => { e.stopPropagation(); player.setPlayMode(m, mode); closeModeMenu() }
      }, PLAYMODE_LABEL[mode][m])
      modeMenu.appendChild(b)
      return { m, b }
    })
  }
  function toggleModeMenu() { if (modeMenu.hidden) { refreshModeBadge(); modeMenu.hidden = false } else modeMenu.hidden = true }
  function closeModeMenu() { modeMenu.hidden = true }
  app.refreshModeBadge = refreshModeBadge // 供 main.js 切换界面时同步徽章
  document.addEventListener('click', (e) => { if (!modeMenu.hidden && !modeWrap.contains(e.target)) closeModeMenu() })
  refreshModeBadge()

  // ---------- 投屏面板（DLNA，仅 Windows 客户端可用） ----------
  const castPanel = h('div', { class: 'cast-panel' })
  const castList = h('div', { class: 'cast-list' })
  const castScan = h('button', { class: 'cast-scan', onclick: () => cast.scan() }, '扫描设备')
  const castStop = h('button', { class: 'cast-stop', onclick: () => cast.stop() }, '■ 停止投屏')
  const castMirror = h('button', { class: 'cast-scan', onclick: () => cast.mirror() }, '🖥️ 系统镜像')
  const castClose = h('button', { class: 'cast-close', onclick: () => { castPanel.hidden = true } }, '✕')
  castPanel.hidden = true
  castPanel.append(
    h('div', { class: 'cast-head' }, h('span', {}, '投屏到'), castClose),
    h('div', { class: 'cast-actions' }, castScan, castStop),
    h('div', { class: 'cast-actions' }, castMirror),
    castList
  )
  document.body.appendChild(castPanel)

  function renderCastList() {
    castList.innerHTML = ''
    if (cast.state.scanning) { castList.appendChild(h('div', { class: 'cast-empty' }, '扫描中…')); return }
    if (!cast.state.devices.length) {
      castList.appendChild(h('div', { class: 'cast-empty' }, '未发现设备。请确认电视已开机、与电脑同一 Wi-Fi，且支持 DLNA 投屏。'))
      return
    }
    cast.state.devices.forEach((d) => {
      castList.appendChild(h('button', { class: 'cast-dev', onclick: () => {
        cast.castTo(d.id)
        castPanel.hidden = true
        app.toast('正在投屏到 ' + d.name, 'info')
      } }, '📺 ' + (d.name || '设备')))
    })
  }
  function onCastClick() {
    if (!cast.isHost()) { app.toast('投屏需在 Windows 客户端（绿角犀 exe）中使用', 'info'); return }
    if (!player.current || !player.current.blob) { app.toast('当前没有可投屏的媒体', 'err'); return }
    castPanel.hidden = !castPanel.hidden
    if (!castPanel.hidden) { renderCastList(); cast.scan() }
  }
  cast.on('devices', renderCastList)
  cast.on('status', (s) => {
    if (s.state === 'uploading') app.toast('正在准备投屏文件…', 'info')
    else if (s.state === 'playing') app.toast('已投屏到 ' + (cast.state.deviceName || '设备'), 'info')
    else if (s.state === 'stopped') app.toast('已停止投屏', 'info')
    castStop.hidden = !cast.state.casting
  })
  cast.on('mirror', (m) => {
    if (m) app.toast('系统镜像唤起失败：' + m, 'err')
    else app.toast('已唤起系统无线显示，请在弹出的面板中选择你的电视', 'info')
  })
  cast.on('error', (m) => app.toast(m, 'err'))

  function setIcon(btn, txt) { btn.textContent = txt }

  player.on('trackchanged', (item) => {
    cover.innerHTML = ''
    if (item.cover) cover.appendChild(h('img', { src: item.cover }))
    else cover.textContent = item.type === 'video' ? '🎬' : '🎵'
    title.textContent = item.title || item.name
    sub.textContent = item.artist || item.album || (item.type === 'video' ? '视频' : '音乐')
    sleepBtn.style.display = item.type === 'video' ? 'none' : ''
  })
  player.on('play', () => setIcon(playBtn, '⏸'))
  player.on('pause', () => setIcon(playBtn, '▶'))
  player.on('time', ({ time, duration }) => {
    tCur.textContent = formatTime(time)
    tDur.textContent = formatTime(duration)
    if (document.activeElement !== seek && duration) seek.value = String((time / duration) * 1000)
    const cs = player.getChapters()
    if (cs.length) {
      if (!chapters.children.length && duration) renderChapters()
      let act = -1
      for (let i = 0; i < cs.length; i++) if (cs[i].time <= time + 0.2) act = i; else break
      chapters.querySelectorAll('.ch').forEach((el, i) => el.classList.toggle('active', i === act))
    }
  })
  player.on('chapters', () => { renderChapters() })
  player.on('loaded', () => { renderChapters() })
  player.on('volume', (v) => { vol.value = String(Math.round(v * 100)); muteBtn.textContent = v === 0 ? '🔇' : '🔊' })
  player.on('mute', (m) => { muteBtn.textContent = m ? '🔇' : '🔊' })
  player.on('playmode', () => refreshModeBadge())
  player.on('error', (msg) => app.toast(msg, 'err'))
  player.on('transcode', (msg) => app.toast(msg, 'info'))
}
