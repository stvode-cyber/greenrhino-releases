// queue.js — 播放队列抽屉
import { h } from './dom.js'
import { player } from '../player.js'

const TYPE_ICON = { music: '🎵', video: '🎬' }

export function buildQueue(app) {
  const drawer = document.getElementById('queue-drawer')
  let dragId = null

  function refresh() {
    const q = player.queue
    const cur = player.current?.id
    drawer.innerHTML = ''
    drawer.appendChild(h('div', { class: 'dh' },
      h('h3', {}, '播放队列'),
      h('button', { class: 'icon-btn', onclick: close }, '✕')))
    const list = h('div', { class: 'dlist' })
    if (!q.length) list.appendChild(h('div', { class: 'empty' }, '队列为空'))
    q.forEach((item, i) => {
      const row = h('div', {
        class: 'q-item' + (item.id === cur ? ' active' : ''),
        draggable: 'true',
        ondragstart: () => { dragId = item.id },
        ondragover: (e) => e.preventDefault(),
        ondrop: () => { reorder(dragId, item.id); dragId = null }
      },
        h('div', { class: 'qi' }, TYPE_ICON[item.type]),
        h('div', { class: 'qt' },
          h('div', { class: 'n' }, item.title || item.name),
          h('div', { class: 's' }, item.artist || item.album || '')),
        h('div', { class: 'qx', title: '移除', onclick: (e) => { e.stopPropagation(); remove(item.id) } }, '✕')
      )
      row.addEventListener('click', () => { player.index = i; player.playItem(item, { crossfade: false }) })
      list.appendChild(row)
    })
    drawer.appendChild(list)
  }

  function reorder(fromId, toId) {
    const q = [...player.queue]
    const fi = q.findIndex((x) => x.id === fromId)
    const ti = q.findIndex((x) => x.id === toId)
    if (fi < 0 || ti < 0) return
    const [m] = q.splice(fi, 1)
    q.splice(ti, 0, m)
    player.setQueue(q, player.current?.id)
    refresh()
  }
  function remove(id) {
    const q = player.queue.filter((x) => x.id !== id)
    player.setQueue(q, player.current?.id)
    refresh()
  }

  const off = player.on('queue:changed', refresh)
  const off2 = player.on('trackchanged', refresh)

  function open() { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('open')); refresh() }
  function close() { drawer.classList.remove('open'); setTimeout(() => { drawer.hidden = true }, 250) }

  return { open, close, refresh, cleanup: () => { off(); off2() } }
}
