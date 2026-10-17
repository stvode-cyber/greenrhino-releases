// castCenter.js — 投屏中心（独立模态框，三卡片 Material You 风格）
// 三方案全齐：① DLNA 推视频  ② Miracast 系统镜像  ③ MJPEG 屏幕镜像
// 所有 CSS 类名 `.cc-*` 前缀 — 彻底隔离 bottombar 的 .cast-* 样式
import { h, toast } from './dom.js'
import { cast } from '../cast.js'
import { player } from '../player.js'

let ccModal = null     // 模态框根节点（全局单例）

export function showCastCenter(app) {
  if (ccModal) { ccModal.hidden = false; renderDevices(); return ccModal }

  const host = cast.isHost()
  const hostLabel = host
    ? host === 'android' ? 'Android 原生通道'
    : host === 'windows' ? 'Windows 桌面通道' : '浏览器（无原生投屏）'
    : '浏览器（无原生投屏）'

  // ---- 三张大卡片 ----
  const dlnaCard = h('div', { class: 'cc-card cc-card-dlna' },
    h('div', { class: 'cc-card-ico' }, '📺'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'DLNA 推视频/音乐'),
      h('p', {}, '电视开启 DLNA，把在播媒体推过去直接播放'),
      h('div', { class: 'cc-card-actions' },
        h('button', { class: 'cc-btn-primary', onclick: () => { cast.scan(); renderDevices() } }, '🔍 扫描设备'),
        h('button', { class: 'cc-btn-danger cc-stop', hidden: true, onclick: () => { cast.stop(); app.toast('已停止投屏') } }, '■ 停止')
      )
    )
  )

  const mirrorCard = h('div', { class: 'cc-card cc-card-mirror' },
    h('div', { class: 'cc-card-ico' }, '🖥️'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'Miracast 系统镜像'),
      h('p', {}, '整屏镜像，电视需支持 Miracast'),
      h('button', { class: 'cc-btn-secondary', onclick: () => {
        if (!host) { app.toast('系统镜像需在原生客户端中使用', 'info'); return }
        cast.mirror()
      } }, '唤起系统无线显示')
    )
  )

  const screenCard = h('div', { class: 'cc-card cc-card-screen' },
    h('div', { class: 'cc-card-ico' }, '📱'),
    h('div', { class: 'cc-card-body' },
      h('h4', {}, 'MJPEG 屏幕镜像'),
      h('p', {}, '任何有浏览器的电视都能用'),
      h('button', { class: 'cc-btn-secondary cc-screen-btn', onclick: () => {
        if (!host) { app.toast('屏幕镜像需在原生客户端中使用', 'info'); return }
        if (cast.state.screenCasting) cast.screenCastStop()
        else cast.screenCastStart()
      } }, '开始屏幕镜像'),
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

  // ---- 设备列表渲染 ----
  function renderDevices() {
    deviceList.innerHTML = ''
    if (cast.state.scanning) {
      deviceList.appendChild(h('div', { class: 'cc-empty cc-scanning' },
        h('span', { class: 'cc-spinner' }), '扫描附近设备中…'))
      return
    }
    if (!cast.state.devices.length) {
      deviceList.appendChild(h('div', { class: 'cc-empty' },
        host
          ? '没找到设备。请检查：①电视开机 ②同一 Wi-Fi ③电视支持 DLNA'
          : '当前是纯浏览器环境，投屏需在 Android App 或 Windows 桌面版中使用'))
      return
    }
    cast.state.devices.forEach((d) => {
      deviceList.appendChild(h('button', { class: 'cc-device', onclick: () => selectDevice(d) },
        h('span', { class: 'cc-device-ico' }, '📺'),
        h('div', { class: 'cc-device-info' },
          h('div', { class: 'cc-device-name' }, d.name || '未知设备'),
          h('div', { class: 'cc-device-sub' }, d.uri || d.host || '')
        ),
        h('span', { class: 'cc-device-connect' }, '连接')))
    })
  }

  async function selectDevice(d) {
    const item = player.current
    if (!item) { app.toast('当前没有在播的媒体', 'err'); return }
    if (host === 'windows' && !item.blob) { app.toast('Windows 投屏需要可上传的媒体文件', 'err'); return }
    modal.hidden = true
    await cast.castTo(d.id)
    app.toast('正在推送到 ' + (d.name || '电视'), 'info')
  }

  function updateScreenUrl(url) {
    const row = screenCard.querySelector('.cc-screen-url')
    const btn = screenCard.querySelector('.cc-screen-btn')
    if (!url) { row.hidden = true; row.innerHTML = ''; btn.textContent = '开始屏幕镜像'; return }
    row.hidden = false
    row.innerHTML = ''
    const label = h('div', { class: 'cc-screen-label' }, '🌐 电视浏览器打开：')
    const row2 = h('div', { class: 'cc-screen-row' },
      h('input', { class: 'cc-screen-input', readonly: true, value: url }),
      h('button', { class: 'cc-btn-tiny', onclick: () => navigator.clipboard?.writeText(url).then(() => app.toast('已复制')) }, '📋 复制'))
    row.append(label, row2)
    btn.textContent = '■ 停止屏幕镜像'
  }

  // ---- 事件监听（自动绑定+清理）----
  const offDevices = cast.on('devices', renderDevices)
  const offStatus = cast.on('status', (s) => {
    dlnaCard.querySelector('.cc-stop').hidden = !cast.state.casting
    if (s.state === 'playing') app.toast('已投屏到 ' + (cast.state.deviceName || '电视'), 'info')
    else if (s.state === 'stopped') app.toast('已停止投屏', 'info')
  })
  const offMirror = cast.on('mirror', (m) => app.toast(m ? '系统镜像唤起失败：' + m : '已唤起系统无线显示', m ? 'err' : 'info'))
  const offScreen = cast.on('screenCast', (sc) => {
    updateScreenUrl(sc.on ? (sc.url || '') : '')
    if (sc.on) app.toast('屏幕镜像已开启！电视浏览器: ' + (sc.url || '/tv'), 'info')
    else if (sc.error) app.toast('屏幕镜像失败: ' + sc.error, 'err')
  })
  const offErr = cast.on('error', (m) => app.toast(m, 'err'))

  function cleanup() { offDevices(); offStatus(); offMirror(); offScreen(); offErr() }

  modal.hidden = false
  renderDevices()
  if (!cast.state.scanning) cast.scan()

  return modal
}
