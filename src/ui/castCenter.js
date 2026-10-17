// castCenter.js — 投屏中心（共享组件，settings / videoPlayer 都用它）
// 三方案全齐：① DLNA 推视频  ② Miracast 系统镜像  ③ MJPEG 屏幕镜像
import { h, toast } from './dom.js'
import { cast } from '../cast.js'
import { player } from '../player.js'

let globalPanel = null     // overlay 模式：全局只有一个
let overlayCloseFn = null  // closeModal 返回的关闭函数

/**
 * 打开投屏中心
 * @param {object} app - 主 app 实例（需有 toast 方法）
 * @param {object} opts
 * @param {'overlay'|'inline'} opts.mode - overlay=模态框覆盖层(空库也能用)，inline=内嵌面板
 * @param {boolean} opts.needMedia - 是否需要当前在播媒体才显示 DLNA 选项
 * @param {HTMLElement} [opts.parent] - inline 模式的挂载父元素
 */
export function showCastCenter(app, opts = {}) {
  const { mode = 'overlay', needMedia = false, parent = null } = opts
  if (globalPanel && mode === 'overlay') {
    globalPanel.hidden = false
    renderDevices()
    if (!cast.state.scanning) cast.scan()
    return
  }

  const panel = h('div', { class: 'cast-panel cast-center', hidden: true })
  const listBox = h('div', { class: 'cast-list' })

  // ---- 状态标签 ----
  const host = cast.isHost()
  const hostLabel = host
    ? host === 'android' ? 'Android 原生通道'
    : host === 'windows' ? 'Windows 桌面通道' : '浏览器'
    : '浏览器（无原生投屏）'

  const statusBar = h('div', { class: 'cast-status' },
    h('span', {}, '🔌 ' + hostLabel))

  // ---- ① DLNA 扫描+推视频 ----
  const scanBtn = h('button', { class: 'cast-scan', onclick: () => { cast.scan(); renderDevices() } }, '🔍 扫描设备')
  const stopBtn = h('button', { class: 'cast-stop', hidden: true, onclick: () => { cast.stop(); app.toast('已停止投屏') } }, '■ 停止投屏')
  const dlnaBox = h('div', { class: 'cast-section' },
    h('h4', {}, '① DLNA 推视频/音乐'),
    h('p', { class: 'cast-hint' }, '电视开启 DLNA 投屏，绿角犀把当前在播媒体推过去直接播放'),
    h('div', { class: 'cast-actions' }, scanBtn, stopBtn),
    listBox
  )

  // ---- ② Miracast 系统镜像 ----
  const mirrorBtn = h('button', { class: 'cast-scan', onclick: () => {
    if (!host) { app.toast('系统镜像需在原生客户端中使用', 'info'); return }
    cast.mirror()
  } }, '🖥️ 唤起系统无线显示')
  const miracastBox = h('div', { class: 'cast-section' },
    h('h4', {}, '② Miracast 系统镜像'),
    h('p', { class: 'cast-hint' }, '手机整个屏幕镜像到电视（Android 原生功能，电视需支持 Miracast）'),
    h('div', { class: 'cast-actions' }, mirrorBtn)
  )

  // ---- ③ MJPEG 屏幕镜像 ----
  const screenBtn = h('button', { class: 'cast-scan', onclick: () => {
    if (!host) { app.toast('屏幕镜像需在原生客户端中使用', 'info'); return }
    if (cast.state.screenCasting) cast.screenCastStop()
    else cast.screenCastStart()
  } }, '📱 开始屏幕镜像')
  const screenBox = h('div', { class: 'cast-section' },
    h('h4', {}, '③ MJPEG 屏幕镜像（通用）'),
    h('p', { class: 'cast-hint' }, '任何有浏览器的电视都能用。开了之后电视浏览器访问下面的地址'),
    h('div', { class: 'cast-actions' }, screenBtn),
    h('div', { class: 'cast-screen-url', hidden: true })
  )

  const closeBtn = h('button', { class: 'cast-close', title: '关闭', onclick: () => hide() }, '✕')
  panel.append(
    h('div', { class: 'cast-head' }, h('span', {}, '📺 投屏中心'), closeBtn),
    statusBar,
    dlnaBox,
    miracastBox,
    screenBox
  )

  // ---- 事件监听 ----
  function renderDevices() {
    listBox.innerHTML = ''
    if (cast.state.scanning) {
      listBox.appendChild(h('div', { class: 'cast-empty' }, '扫描中…')); return
    }
    if (!cast.state.devices.length) {
      listBox.appendChild(h('div', { class: 'cast-empty' },
        cast.state.host ? '没找到设备。请确保电视已开机、与手机/电脑同一 Wi-Fi，且支持 DLNA' :
        '当前是纯浏览器环境，DLNA 投屏需在 Android App 或 Windows 桌面版中使用'))
      return
    }
    cast.state.devices.forEach((d) => {
      listBox.appendChild(h('button', { class: 'cast-dev', onclick: () => selectDevice(d) },
        h('span', { class: 'cast-dev-name' }, '📺 ' + (d.name || '未知设备')),
        h('span', { class: 'cast-dev-sub' }, d.uri || d.host || '')))
    })
  }

  async function selectDevice(d) {
    const item = player.current
    if (!item) { app.toast('当前没有在播的媒体', 'err'); return }
    if (host === 'windows' && !item.blob) { app.toast('Windows 投屏需要可上传的媒体文件', 'err'); return }
    panel.hidden = true
    hide()
    await cast.castTo(d.id)
    app.toast('正在推送到 ' + (d.name || '电视'), 'info')
  }

  function updateScreenBox(url) {
    const row = screenBox.querySelector('.cast-screen-url')
    if (!url) { row.hidden = true; screenBtn.textContent = '📱 开始屏幕镜像'; return }
    row.hidden = false
    row.innerHTML = ''
    const label = h('div', { class: 'cast-screen-label' }, '🌐 电视浏览器打开这个地址：')
    const link = h('input', { class: 'cast-screen-input', readonly: true, value: url })
    const copyBtn = h('button', { class: 'opt', onclick: () => {
      navigator.clipboard?.writeText(url).then(() => app.toast('地址已复制'))
    } }, '📋 复制')
    row.append(label, h('div', { class: 'cast-screen-row' }, link, copyBtn))
    screenBtn.textContent = '■ 停止屏幕镜像'
  }

  const offDevices = cast.on('devices', renderDevices)
  const offStatus = cast.on('status', (s) => {
    stopBtn.hidden = !cast.state.casting
    if (s.state === 'uploading') app.toast('正在准备投屏文件…', 'info')
    else if (s.state === 'playing') app.toast('已投屏到 ' + (cast.state.deviceName || '设备'), 'info')
    else if (s.state === 'stopped') app.toast('已停止投屏', 'info')
  })
  const offMirror = cast.on('mirror', (m) => {
    if (m) app.toast('系统镜像唤起失败：' + m, 'err')
    else app.toast('已唤起系统无线显示，请在弹出的面板中选择电视', 'info')
  })
  const offScreenCast = cast.on('screenCast', (sc) => {
    if (sc.on) {
      updateScreenBox(sc.url || '')
      app.toast('📱 屏幕镜像已开启！电视浏览器打开: ' + (sc.url || '/tv'), 'info')
    } else {
      updateScreenBox('')
      if (sc.error) app.toast('屏幕镜像失败: ' + sc.error, 'err')
      else app.toast('屏幕镜像已停止', 'info')
    }
  })
  const offError = cast.on('error', (m) => app.toast(m, 'err'))

  function destroy() {
    offDevices(); offStatus(); offMirror(); offScreenCast(); offError()
    if (panel.parentNode) panel.parentNode.removeChild(panel)
    globalPanel = null
  }

  function hide() {
    panel.hidden = true
    if (mode === 'overlay' && overlayCloseFn) { overlayCloseFn(); overlayCloseFn = null }
  }

  panel.hidden = false
  if (mode === 'overlay') {
    // 模态覆盖层：加 dim 背景
    const modal = h('div', { class: 'modal cast-center-modal' },
      h('div', { class: 'mh' }, h('h3', {}, '投屏中心'), h('button', { class: 'icon-btn', onclick: () => hide() }, '✕')))
    panel.classList.add('cast-center-body')
    modal.appendChild(panel)
    document.body.appendChild(modal)
    globalPanel = modal  // 存 modal 以便快速 hide
    renderDevices()
    if (!cast.state.scanning) cast.scan()
  } else if (mode === 'inline' && parent) {
    parent.appendChild(panel)
    renderDevices()
    if (!cast.state.scanning) cast.scan()
  }

  return { hide, destroy, panel }
}

// 给 bottombar/videoPlayer 用的旧 API 兼容导出
export { cast }
