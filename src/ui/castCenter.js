// castCenter.js — 投屏中心（独立模态框，三卡片 Material You 风格）
// 三方案全齐：① DLNA 推视频  ② Miracast 系统镜像  ③ MJPEG 屏幕镜像
// 所有 CSS 类名 `.cc-*` 前缀 — 彻底隔离 bottombar 的 `.cast-*` 样式
import { h, toast } from './dom.js'
import { cast } from '../cast.js'
import { player } from '../player.js'
import QRCode from '../lib/qrcodejs.js'

let ccModal = null     // 模态框根节点（全局单例）

export function showCastCenter(app) {
  if (ccModal) { ccModal.hidden = false; renderDevices(); return ccModal }

  const host = cast.isHost()
  const hostLabel = host
    ? host === 'android' ? 'Android 原生通道'
    : host === 'windows' ? 'Windows 桌面通道' : '浏览器（无原生投屏）'
    : '浏览器（无原生投屏）'

  // ---- ① DLNA 卡 ----
  const scanBtn = h('button', { class: 'cc-btn-primary', onclick: () => {
    if (scanBtn.disabled) return
    cast.scan()
  } }, '🔍 扫描设备')
  const stopBtn = h('button', { class: 'cc-btn-danger cc-stop', hidden: true, onclick: () => { cast.stop(); app.toast('已停止投屏') } }, '■ 停止投屏')
  const dlnaCard = h('div', { class: 'cc-card cc-card-dlna' },
    h('div', { class: 'cc-card-ico' }, '📺'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'DLNA 推视频/音乐'),
      h('p', {}, '电视开启 DLNA，把在播媒体推过去直接播放'),
      h('div', { class: 'cc-card-actions' }, scanBtn, stopBtn)
    )
  )

  // ---- ② Miracast 卡 ----
  const mirrorBtn = h('button', { class: 'cc-btn-secondary', onclick: () => {
    if (!host) { app.toast('系统镜像需在原生客户端中使用', 'info'); return }
    cast.mirror()
  } }, '🖥️ 唤起系统无线显示')
  const mirrorCard = h('div', { class: 'cc-card cc-card-mirror' },
    h('div', { class: 'cc-card-ico' }, '🖥️'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'Miracast 系统镜像'),
      h('p', {}, '整屏镜像，电视需支持 Miracast'),
      h('div', { class: 'cc-card-actions' }, mirrorBtn)
    )
  )

  // ---- ③ MJPEG 屏幕镜像卡 ----
  const screenBtn = h('button', { class: 'cc-btn-secondary cc-screen-btn', onclick: () => {
    if (!host) { app.toast('屏幕镜像需在原生客户端中使用', 'info'); return }
    if (cast.state.screenCasting) cast.screenCastStop()
    else cast.screenCastStart()
  } }, '📱 开始屏幕镜像')
  const screenCard = h('div', { class: 'cc-card cc-card-screen' },
    h('div', { class: 'cc-card-ico' }, '📱'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'MJPEG 屏幕镜像'),
      h('p', {}, '任何有浏览器的电视都能用'),
      h('div', { class: 'cc-card-actions' }, screenBtn),
      h('div', { class: 'cc-screen-url', hidden: true })
    )
  )

  const deviceList = h('div', { class: 'cc-device-list' })

  // ---- 模态框根 ----
  const modal = h('div', { class: 'cc-modal', hidden: true },
    h('div', { class: 'cc-modal-inner' },
      h('div', { class: 'cc-head' },
        h('h2', {}, '📺 投屏中心'),
        h('span', { class: 'cc-host-tag' }, '🔌 ' + hostLabel),
        h('button', { class: 'cc-close', onclick: () => { modal.hidden = true; cleanup() } }, '✕')
      ),
      h('div', { class: 'cc-cards' }, dlnaCard, mirrorCard, screenCard),
      h('div', { class: 'cc-devices' },
        h('h3', {}, '附近的设备'),
        deviceList
      )
    )
  )
  document.body.appendChild(modal)
  ccModal = modal

  // ---- 设备列表渲染 + loading ----
  function renderDevices() {
    deviceList.innerHTML = ''
    if (cast.state.scanning) {
      scanBtn.disabled = true
      scanBtn.textContent = '⏳ 扫描中…'
      deviceList.appendChild(h('div', { class: 'cc-empty cc-scanning' },
        h('span', { class: 'cc-spinner' }), '扫描附近设备中（同一 Wi-Fi）…'))
      return
    }
    scanBtn.disabled = false
    scanBtn.textContent = '🔍 重新扫描'

    if (!cast.state.devices.length) {
      deviceList.appendChild(h('div', { class: 'cc-empty' },
        host
          ? '没找到设备。请检查：\n① 电视已开机\n② 手机和电视同一 Wi-Fi\n③ 电视支持 DLNA 投屏'
          : '当前是纯浏览器环境，投屏需在 Android App 或 Windows 桌面版中使用'))
      return
    }
    cast.state.devices.forEach((d) => {
      const devBtn = h('button', { class: 'cc-device', onclick: () => selectDevice(devBtn, d) },
        h('span', { class: 'cc-device-ico' }, '📺'),
        h('div', { class: 'cc-device-info' },
          h('div', { class: 'cc-device-name' }, d.name || '未知设备'),
          h('div', { class: 'cc-device-sub' }, d.uri || d.host || '')
        ),
        h('span', { class: 'cc-device-connect' }, '点击连接'))
      deviceList.appendChild(devBtn)
    })
  }

  async function selectDevice(devBtn, d) {
    const item = player.current
    if (!item) { app.toast('当前没有在播的媒体', 'err'); return }
    if (host === 'windows' && !item.blob) { app.toast('Windows 投屏需要可上传的媒体文件', 'err'); return }

    // 点设备按钮 → loading 态
    devBtn.disabled = true
    devBtn.querySelector('.cc-device-connect').textContent = '⏳ 连接中…'
    devBtn.classList.add('cc-device-loading')

    try {
      await cast.castTo(d.id)
      app.toast('正在推送到 ' + (d.name || '电视'), 'info')
      // 成功后关闭面板（让全局 castStatusBar 继续显示状态）
      modal.hidden = true
    } catch (e) {
      devBtn.disabled = false
      devBtn.querySelector('.cc-device-connect').textContent = '点击连接'
      devBtn.classList.remove('cc-device-loading')
    }
  }

  function updateScreenUrl(url) {
    const row = screenCard.querySelector('.cc-screen-url')
    if (!url) { row.hidden = true; row.innerHTML = ''; screenBtn.textContent = '📱 开始屏幕镜像'; return }
    row.hidden = false
    row.innerHTML = ''
    const qrWrap = h('div', { class: 'cc-screen-qr-wrap' })
    try {
      // 零依赖：本地 QRCode 库生成 canvas（离线可用，不受网络/CSP 限制）
      new QRCode(qrWrap, { text: url, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.L })
      // canvas 自动生成，给它加背景+圆角
      const c = qrWrap.querySelector('canvas')
      if (c) { c.className = 'cc-screen-qr'; c.style.background = '#fff' }
    } catch (e) {
      qrWrap.textContent = 'QR 生成失败：' + e?.message
    }
    row.append(
      h('div', { class: 'cc-screen-label' }, '🌐 电视浏览器打开这个地址：'),
      h('div', { class: 'cc-screen-row' },
        h('input', { class: 'cc-screen-input', readonly: true, value: url }),
        h('button', { class: 'cc-btn-tiny', onclick: () => navigator.clipboard?.writeText(url).then(() => app.toast('已复制')) }, '📋 复制')),
      qrWrap,
      h('div', { class: 'cc-screen-qr-tip' }, '📱 电视扫码直接访问'))
    screenBtn.textContent = '■ 停止屏幕镜像'
  }

  // ---- 事件监听 ----
  const offDevices = cast.on('devices', renderDevices)
  const offStatus = cast.on('status', (s) => {
    stopBtn.hidden = !cast.state.casting
    if (s.state === 'uploading') app.toast('📤 正在上传媒体文件…', 'info')
    else if (s.state === 'playing') app.toast('✅ 已投屏到 ' + (cast.state.deviceName || '电视'), 'info')
    else if (s.state === 'stopped') app.toast('已停止投屏', 'info')
  })
  const offMirror = cast.on('mirror', (m) => app.toast(m ? '系统镜像唤起失败：' + m : '已唤起系统无线显示，请在电视列表中选择', m ? 'err' : 'info'))
  const offScreen = cast.on('screenCast', (sc) => {
    updateScreenUrl(sc.on ? (sc.url || '') : '')
    if (sc.on) app.toast('📱 屏幕镜像已开启！电视浏览器访问: ' + (sc.url || '/tv'), 'info')
    else if (sc.error) app.toast('屏幕镜像失败: ' + sc.error, 'err')
  })
  const offErr = cast.on('error', (m) => app.toast(m, 'err'))

  function cleanup() { offDevices(); offStatus(); offMirror(); offScreen(); offErr() }

  modal.hidden = false
  renderDevices()
  if (!cast.state.scanning) cast.scan()

  return modal
}
