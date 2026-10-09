// dom.js — 轻量 DOM 辅助 + Toast + Modal
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k in el && k !== 'list') { try { el[k] = v } catch { el.setAttribute(k, v) } }
    else el.setAttribute(k, v)
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
  }
  return el
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

let toastHost
// 🔶 ISS-20261009-004：Toast 去重 + 限流
// 同 msg 3s 内不重复弹；屏幕上最多保留 2 条（超了自动删最老的）
const _toastLastAt = new Map()
const TOAST_COOLDOWN = 3000
const TOAST_MAX = 2
export function toast(msg, type = '') {
  if (!toastHost) toastHost = document.getElementById('toast-host')
  const now = Date.now()
  const key = (type || '') + '|' + msg
  const last = _toastLastAt.get(key) || 0
  if (now - last < TOAST_COOLDOWN) return  // 同消息 3s 内跳过
  _toastLastAt.set(key, now)
  // 屏幕上超 TOAST_MAX 条 → 删掉最老的
  while (toastHost.children.length >= TOAST_MAX) {
    const oldest = toastHost.firstElementChild
    oldest?.remove()
  }
  const t = h('div', { class: 'toast' + (type ? ' ' + type : '') }, msg)
  toastHost.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300) }, 2400)
}

let modalRoot
export function openModal(content, { onClose } = {}) {
  if (!modalRoot) modalRoot = document.getElementById('modal-root')
  const mask = h('div', { class: 'modal-mask' })
  const close = () => { mask.remove(); onClose?.() }
  mask.addEventListener('click', (e) => { if (e.target === mask) close() })
  mask.appendChild(content)
  modalRoot.appendChild(mask)
  return close
}
