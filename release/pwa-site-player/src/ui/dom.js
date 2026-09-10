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
export function toast(msg, type = '') {
  if (!toastHost) toastHost = document.getElementById('toast-host')
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
