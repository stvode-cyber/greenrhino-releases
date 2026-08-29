// library.js — 媒体库网格（音乐/视频）+ 多选与批量操作
import { h, openModal } from './dom.js'
import { getAllMedia, toggleFavorite, deleteMedia, getPlaylists, savePlaylist } from '../store.js'
import { player } from '../player.js'

const TYPE_ICON = { music: '🎵', video: '🎬' }

export function buildLibrary(app) {
  const el = h('div', { class: 'page' })
  let unsub = []
  let importMode = 'manual' // manual | scan（设计文档 §7）
  let selMode = false
  const selected = new Set()

  function matches(item) {
    if (app.filter !== 'all' && item.type !== app.filter) return false
    if (app.search) {
      const q = app.search.toLowerCase()
      const hay = `${item.title || ''} ${item.artist || ''} ${item.name}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }

  function importBar() {
    const seg = h('div', { class: 'seg', style: { fontSize: '12px' } })
    const mk = (mode, label) => h('button', {
      class: importMode === mode ? 'active' : '',
      onclick: () => { importMode = mode; seg.querySelectorAll('button').forEach(b => b.classList.remove('active')); seg.querySelector(`[data-m="${mode}"]`)?.classList.add('active') },
      'data-m': mode
    }, label)
    seg.append(mk('manual', '手动'), mk('scan', '扫描'))
    const btn = h('button', { class: 'ghost-btn', style: { padding: '6px 14px' }, onclick: () => importMode === 'scan' ? app.importFolderDialog() : app.importFilesDialog() }, '＋ 导入')
    const selBtn = h('button', { class: 'ghost-btn' + (selMode ? ' active' : ''), style: { padding: '6px 14px' }, onclick: () => toggleSelect(), title: '多选批量操作' }, selMode ? '✓ 退出选择' : '☑ 多选')
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } }, seg, btn, selBtn)
  }

  async function refresh() {
    const all = await getAllMedia()
    el.innerHTML = ''
    const list = all.filter(matches)
    const title = app.filter === 'music' ? '音乐' : app.filter === 'video' ? '视频' : '媒体库'
    const titleRow = h('div', { class: 'section-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', {}, `${title} · ${list.length} 项`),
      importBar()
    )
    el.appendChild(titleRow)

    if (!all.length) {
      el.appendChild(emptyState(app))
      el.appendChild(selbar)
      return
    }
    if (!list.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', {}, '没有匹配的内容')))
      el.appendChild(selbar)
      return
    }
    const grid = h('div', { class: 'grid' + (selMode ? ' selecting' : '') })
    for (const item of list) {
      grid.appendChild(mediaCard(item, app, selMode ? {
        selectable: true,
        selected: selected.has(item.id),
        onToggle: (it, node) => {
          if (selected.has(it.id)) { selected.delete(it.id); node.classList.remove('sel') }
          else { selected.add(it.id); node.classList.add('sel') }
          updateSelBar()
        }
      } : {}))
    }
    el.appendChild(grid)
    el.appendChild(selbar)
    updateSelBar()
  }

  // ---------- 多选 / 批量操作 ----------
  const selbar = h('div', { class: 'selbar', style: { display: 'none' } },
    h('button', { class: 'ghost-btn', onclick: () => toggleAll() }, '全选'),
    h('span', { class: 'selcount' }, '已选 0'),
    h('button', { class: 'ghost-btn', onclick: () => openAddToPlaylist() }, '＋ 加入歌单'),
    h('button', { class: 'ghost-btn danger', onclick: () => batchDelete() }, '🗑 删除'),
    h('button', { class: 'ghost-btn', onclick: () => exitSelect() }, '取消')
  )

  function updateSelBar() {
    const n = selected.size
    selbar.style.display = n > 0 ? 'flex' : 'none'
    selbar.querySelector('.selcount').textContent = `已选 ${n}`
    const allBtn = selbar.querySelector('button')
    const total = el.querySelectorAll('.grid .card').length
    allBtn.textContent = (total && n >= total) ? '取消全选' : '全选'
  }
  function toggleSelect() {
    selMode = !selMode
    if (!selMode) selected.clear()
    el.classList.toggle('selecting', selMode)
    refresh()
  }
  function exitSelect() {
    selMode = false
    selected.clear()
    el.classList.remove('selecting')
    refresh()
  }
  function toggleAll() {
    const cards = [...el.querySelectorAll('.grid .card')]
    const total = cards.length
    if (selected.size >= total) { selected.clear(); cards.forEach(c => c.classList.remove('sel')) }
    else { for (const c of cards) { const id = c.dataset.id; if (id) selected.add(id); c.classList.add('sel') } }
    updateSelBar()
  }
  async function openAddToPlaylist() {
    const ids = [...selected]
    if (!ids.length) return
    const pls = await getPlaylists()
    const body = h('div', { class: 'mb' })
    body.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const name = prompt('新歌单名称：', '歌单 ' + new Date().toLocaleDateString())
      if (!name) return
      await savePlaylist({ id: 'pl-' + Date.now(), name, ids: [...ids], at: Date.now() })
      app.toast('已新建歌单并加入')
      close(); exitSelect()
    } }, '＋ 新建歌单'))
    pls.forEach(pl => body.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const merged = [...new Set([...pl.ids, ...ids])]
      await savePlaylist({ ...pl, ids: merged })
      app.toast(`已加入「${pl.name}」`)
      close(); exitSelect()
    } }, `${pl.name}（${pl.ids.length}）`)))
    const modal = h('div', { class: 'modal' },
      h('div', { class: 'mh' }, h('h3', {}, '加入歌单'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
    const close = openModal(modal)
  }
  async function batchDelete() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`确认从媒体库移除选中的 ${ids.length} 个文件？此操作不可撤销`)) return
    for (const id of ids) await deleteMedia(id)
    app.toast(`已移除 ${ids.length} 个文件`)
    exitSelect()
  }

  // 拖拽导入
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.outline = '2px dashed var(--accent)' })
  el.addEventListener('dragleave', () => { el.style.outline = '' })
  el.addEventListener('drop', async (e) => {
    e.preventDefault(); el.style.outline = ''
    const files = [...(e.dataTransfer?.files || [])]
    if (files.length) {
      const added = await app.importFiles(files, '拖拽导入')
      if (added.length) app.toast(`已导入 ${added.length} 个文件`)
      refresh()
    }
  })

  unsub.push(
    app.onStore('library:changed', refresh),
    app.onStore('media:updated', refresh),
    app.onStore('favorites:changed', refresh)
  )
  el._cleanup = () => unsub.forEach((u) => u())

  refresh()
  return { el, refresh }
}

export function mediaCard(item, app, opts = {}) {
  const isLost = !item.blob || item.blob.size === 0
  const thumb = h('div', { class: 'thumb' }, TYPE_ICON[item.type])
  if (item.cover) thumb.innerHTML = ''
  if (item.cover) thumb.appendChild(h('img', { src: item.cover, alt: '' }))
  const fav = h('div', { class: 'fav', title: '收藏' }, item.favorite ? '⭐' : '☆')
  fav.addEventListener('click', async (e) => {
    e.stopPropagation()
    const f = await toggleFavorite(item.id)
    fav.textContent = f ? '⭐' : '☆'
  })

  if (opts.selectable) {
    const chk = h('div', { class: 'chk', title: '选择' }, '✓')
    const node = h('div', { class: 'card' + (isLost ? ' lost' : '') + (opts.selected ? ' sel' : ''), 'data-id': item.id },
      chk, thumb, fav,
      h('div', { class: 'meta' },
        h('div', { class: 'name' }, item.title || item.name),
        h('div', { class: 'sub' }, item.artist || item.album || (item.type === 'video' ? '视频文件' : '音频文件'))
      )
    )
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; opts.onToggle(item, node) })
    return node
  }

  const node = h('div', { class: 'card' + (isLost ? ' lost' : '') },
    thumb, fav,
    h('div', { class: 'meta' },
      h('div', { class: 'name' }, item.title || item.name),
      h('div', { class: 'sub' }, item.artist || item.album || (item.type === 'video' ? '视频文件' : '音频文件'))
    )
  )
  if (isLost) {
    // §12 文件已丢失：标灰 + 提示 + 重新定位 / 移除
    const badge = h('div', { class: 'lost-badge' }, '⚠ 文件已丢失')
    const actions = h('div', { class: 'lost-actions' },
      h('button', { class: 'ghost-btn', onclick: (e) => { e.stopPropagation(); app.relocateMedia(item.id) } }, '重新定位'),
      h('button', { class: 'ghost-btn danger', onclick: (e) => { e.stopPropagation(); if (confirm(`从媒体库移除「${item.name}」？`)) { deleteMedia(item.id); app.toast('已移除') } } }, '从库移除')
    )
    node.appendChild(badge)
    node.appendChild(actions)
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; app.toast('该文件已丢失，请「重新定位」', 'err') })
  } else {
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; app.playItem(item) })
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (confirm(`从媒体库移除「${item.name}」？`)) { deleteMedia(item.id); app.toast('已移除') }
    })
  }
  return node
}

function emptyState(app) {
  return h('div', { class: 'empty' },
    h('div', { class: 'big' }, '🎧'),
    h('div', {}, '媒体库还是空的'),
    h('div', { style: { marginTop: '6px', color: 'var(--text-3)' } }, '把音乐或视频拖进来，或点击下方按钮导入'),
    h('button', { class: 'cta', onclick: () => app.importFilesDialog() }, '导入媒体')
  )
}
