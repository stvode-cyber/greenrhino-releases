// queue.js — 播放队列抽屉（搜索过滤 / 保存为歌单 / 拖拽重排 / 移除）
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { savePlaylist } from '../store.js'

const TYPE_ICON = { music: '🎵', video: '🎬' }

export function buildQueue(app) {
  const drawer = document.getElementById('queue-drawer')
  let dragId = null
  let kw = '' // 搜索关键词：只过滤显示，不影响队列本身

  // 静态骨架（标题 + 保存歌单 + 关闭 + 搜索框 + 计数）：队列变化只重建列表区，
  // 避免每次敲键都重建输入框导致焦点丢失
  const head = h('div', { class: 'dh' },
    h('h3', {}, '播放队列'),
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
      h('button', { class: 'icon-btn', title: '保存当前队列为歌单', onclick: saveAsPlaylist }, '💾'),
      h('button', { class: 'icon-btn', onclick: close }, '✕')))
  const searchBox = h('input', {
    class: 'q-search', type: 'search', placeholder: '筛选队列…', autocomplete: 'off', value: kw,
    oninput: (e) => { kw = e.target.value; renderList() }
  })
  const countEl = h('span', { class: 'q-count' }, '')
  const list = h('div', { class: 'dlist' })
  drawer.append(head, searchBox, countEl, list)

  function renderList() {
    const q = player.queue
    const cur = player.current?.id
    const qword = kw.trim().toLowerCase()
    const filtered = qword
      ? q.filter((it) => `${it.title || ''} ${it.artist || ''} ${it.name || ''}`.toLowerCase().includes(qword))
      : q
    countEl.textContent = qword ? `匹配 ${filtered.length} / ${q.length}` : `${q.length} 首`
    list.innerHTML = ''
    if (!filtered.length) { list.appendChild(h('div', { class: 'empty' }, q.length ? '没有匹配的条目' : '队列为空')); return }
    filtered.forEach((item) => {
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
      row.addEventListener('click', () => {
        const i = player.queue.findIndex((x) => x.id === item.id)
        if (i < 0) return
        player.index = i
        player.playItem(item, { crossfade: false })
      })
      list.appendChild(row)
    })
  }

  function reorder(fromId, toId) {
    const q = [...player.queue]
    const fi = q.findIndex((x) => x.id === fromId)
    const ti = q.findIndex((x) => x.id === toId)
    if (fi < 0 || ti < 0) return
    const [m] = q.splice(fi, 1)
    q.splice(ti, 0, m)
    player.setQueue(q, player.current?.id)
    renderList()
  }
  function remove(id) {
    const q = player.queue.filter((x) => x.id !== id)
    player.setQueue(q, player.current?.id)
    renderList()
  }
  async function saveAsPlaylist() {
    if (!player.queue.length) { toast('队列为空，无内容可保存', 'err'); return }
    const name = prompt('歌单名称：', '我的歌单 ' + new Date().toLocaleDateString())
    if (!name) return
    await savePlaylist({ id: 'pl-' + Date.now(), name, ids: player.queue.map((i) => i.id), at: Date.now() })
    toast(`已保存为歌单「${name}」`)
  }

  const off = player.on('queue:changed', renderList)
  const off2 = player.on('trackchanged', renderList)

  function open() { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('open')); renderList() }
  function close() {
    kw = ''; searchBox.value = ''
    drawer.classList.remove('open'); setTimeout(() => { drawer.hidden = true }, 250)
  }

  return { open, close, refresh: renderList, cleanup: () => { off(); off2() } }
}
