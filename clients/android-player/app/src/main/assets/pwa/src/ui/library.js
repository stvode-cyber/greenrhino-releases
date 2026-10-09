// library.js — 媒体库网格组件（按类型拆分：音乐/视频各自独立页）+ 多选与批量操作
import { h, openModal } from './dom.js'
import { getAllMedia, toggleFavorite, deleteMedia, getPlaylists, savePlaylist, findDuplicates } from '../store.js'
import { player } from '../player.js'
import { getThumbsMap, queueVideoThumbs } from '../videoThumb.js'

const TYPE_ICON = { music: '🎵', video: '🎬' }
const TYPE_NAME = { music: '音乐', video: '视频' }

// 构建一个「只显示指定类型」的媒体库网格，供音乐页 / 视频页各自嵌入
export function mediaLibrary(app, type) {
  const el = h('div', { class: 'media-lib' })
  let unsub = []
  let importMode = 'manual' // manual | scan（设计文档 §7）
  let selMode = false
  const selected = new Set()

  function matches(item) {
    if (item.type !== type) return false
    // 隐藏「空文件」坏记录：真实导入的文件必有 name，仅损坏/残缺记录才是空名空标题，
    // 这类卡片只剩一个裸类型图标（如仅 🎬），显示出来很冗余，直接不算进列表。
    if (!item.name && !item.title) return false
    if (app.search) {
      const q = app.search.toLowerCase()
      const hay = `${item.title || ''} ${item.artist || ''} ${item.name}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }

  // 显示去重键：同名同规格（name+size）视为同一文件；空名返回 null（单独隐藏）
  function getDedupKey(item) {
    if (!item.name) return null
    return `${item.name}::${item.size || 0}`
  }

  function importBar() {
    // 🔶 ISS-20261009-016：两个独立按钮，去掉 [手动|扫描] 分段——一步直接触发
    // Android MediaStore 自动扫描（500MB+ 大视频，秒完）
    const scanBtn = h('button', { class: 'ghost-btn', style: { padding: '6px 12px' }, onclick: () => {
      if (window.RhinoBridge?.requestAutoImport) {
        toast('开始扫描 MediaStore...', 'info')
        window.RhinoBridge.requestAutoImport()
      } else {
        app.importFolderDialog()
      }
    }, title: '扫描 Android 媒体库（500MB+ 大视频）' }, '📥 自动扫描')
    // 用户手动自选文件（SAF 文件选择器，支持批量多选）
    const pickBtn = h('button', { class: 'ghost-btn', style: { padding: '6px 12px' }, onclick: () => {
      app.importFilesDialog()
    }, title: '从文件管理器选择视频' }, '📁 选择文件')
    const selBtn = h('button', { class: 'ghost-btn' + (selMode ? ' active' : ''), style: { padding: '6px 12px' }, onclick: () => toggleSelect(), title: '多选批量操作' }, selMode ? '✓ 退出选择' : '☑ 多选')
    const dupBtn = h('button', { class: 'ghost-btn', style: { padding: '6px 12px' }, onclick: () => openDuplicates(), title: '查找媒体库中重复的文件' }, '🔁 查重复')
    return h('div', { class: 'lib-toolbar' }, scanBtn, pickBtn, selBtn, dupBtn)
  }

  let refreshGen = 0 // 并发守卫：refresh 内有多个 await（getAllMedia / getThumbsMap），
  // 叠加库变更事件可能并发触发；只让最后一次真正渲染，避免重复追加内容。
  async function refresh() {
    const gen = ++refreshGen
    const all = await getAllMedia()
    if (gen !== refreshGen) return
    // 🔶 诊断日志：MediaStore 数据到底对不对
    const typeCounts = {}
    for (const m of all) typeCounts[m.type] = (typeCounts[m.type] || 0) + 1
    console.error(`[gr-lib] refresh: all=${all.length} typeCounts=`, JSON.stringify(typeCounts), `filtering for type="${type}"`)
    if (all.length) console.error(`[gr-lib] sample item.type=${all[0].type} name=${all[0].name?.slice(0,30)} id=${all[0].id}`)
    el.replaceChildren()
    // 显示层去重（只隐藏、不动数据）：
    // 1) 同名同规格（name+size）判定为同一文件重复导入，只保留最新导入的一条；
    // 2) 空文件记录（无 name 无 title）不显示。
    const keepIds = new Set()
    {
      const latest = new Map() // key(name::size) -> item
      for (const m of all) {
        if ((m.name || '') && (getDedupKey(m))) {
          const key = getDedupKey(m)
          const prev = latest.get(key)
          if (!prev || (m.addedAt || 0) >= (prev.addedAt || 0)) latest.set(key, m)
        }
      }
      for (const m of latest.values()) keepIds.add(m.id)
    }
    const list = all.filter((m) => matches(m) && keepIds.has(m.id))
    console.error(`[gr-lib] refresh: keepIds.size=${keepIds.size} list(after matches+dedup)=${list.length}`)
    // 视频缩略图：从 thumbnails store 合并到条目，随后把缺图的视频排进后台抽帧队列
    const thumbs = await getThumbsMap()
    for (const m of list) if (m.type === 'video') m.thumb = thumbs.get(m.id) || null
    queueVideoThumbs(list)
    const title = TYPE_NAME[type] || '媒体'
    el.appendChild(h('div', { class: 'lib-head' },
      h('div', { class: 'section-title', style: { margin: '4px 0 0' } }, `${title} · ${list.length} 项`),
      importBar()))

    if (!all.length) {
      el.appendChild(emptyState(app, type))
      el.appendChild(selbar)
      return
    }
    if (!list.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', {}, `还没有${title}，点「导入」或直接拖进来`)))
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
    // 🔶 ISS-20261009-011: selMode 下常驻显示 selbar（之前 n=0 就隐藏 → 用户选了多选取不到操作按钮）
    selbar.style.display = selMode ? 'flex' : 'none'
    selbar.querySelector('.selcount').textContent = `已选 ${n}`
    const btns = selbar.querySelectorAll('button')
    // btns[0] 全选 / btns[1] 已选span / btns[2] 加入歌单 / btns[3] 删除 / btns[4] 取消
    // 没选中时禁用有破坏性的按钮（加入歌单、删除），全选/取消一直可用
    btns[2].disabled = n === 0
    btns[3].disabled = n === 0
    btns[2].style.opacity = n === 0 ? '0.4' : '1'
    btns[3].style.opacity = n === 0 ? '0.4' : '1'
    const total = el.querySelectorAll('.grid .card').length
    btns[0].textContent = (total && n >= total) ? '取消全选' : '全选'
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
    if (!confirm(`移除 ${ids.length} 个文件？`)) return
    for (const id of ids) await deleteMedia(id)
    app.toast(`已移除 ${ids.length} 个文件`)
    exitSelect()
  }

  // 媒体库重复检测弹窗（设计清单⑨）
  async function openDuplicates() {
    const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + 'MB' : (b / 1024).toFixed(0) + 'KB'
    const groups = await findDuplicates()
    const body = h('div', { class: 'mb' })
    if (!groups.length) {
      body.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🎉'), h('div', {}, '没有发现重复文件')))
    } else {
      const totalDup = groups.reduce((n, g) => n + g.length - 1, 0)
      body.appendChild(h('p', { style: { color: 'var(--text-3)', margin: '0 0 10px' } }, `发现 ${groups.length} 组重复，共 ${totalDup} 个可清理副本（每组保留最新导入的一个）`))
      for (const g of groups) {
        const keep = g[0]
        const card = h('div', { class: 'dup-group', style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '10px', marginBottom: '10px' } })
        card.appendChild(h('div', { class: 'dup-title', style: { fontWeight: '600', marginBottom: '6px' } }, keep.title || keep.name))
        g.forEach((it, i) => {
          const row = h('div', { class: 'dup-row', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' } })
          row.appendChild(h('span', { style: { flex: '1' } }, `${i === 0 ? '✅ 保留' : '副本'} · ${it.name} · ${fmtSize(it.size)}`))
          if (i !== 0) {
            row.appendChild(h('button', { class: 'ghost-btn danger', style: { padding: '2px 10px' }, onclick: async () => { if (confirm('移除该副本？')) { await deleteMedia(it.id); app.toast('已移除副本'); close(); openDuplicates() } } }, '移除'))
          }
          card.appendChild(row)
        })
        body.appendChild(card)
      }
      body.appendChild(h('button', { class: 'cta', style: { width: '100%', marginTop: '4px' }, onclick: async () => {
        if (!confirm(`移除全部副本？`)) return
        for (const g of groups) for (let i = 1; i < g.length; i++) await deleteMedia(g[i].id)
        app.toast(`已清理 ${totalDup} 个副本`); close(); refresh()
      } }, `🧹 一键清理全部 ${totalDup} 个副本`))
    }
    const modal = h('div', { class: 'modal' },
      h('div', { class: 'mh' }, h('h3', {}, '重复文件检测'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
    const close = openModal(modal)
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
    app.onStore('favorites:changed', refresh),
    app.onStore('thumb:updated', refresh)
  )
  const cleanup = () => unsub.forEach((u) => u())

  refresh()
  return { el, refresh, cleanup }
}

export function mediaCard(item, app, opts = {}) {
  // 🔶 丢失判断：有 uri（Android MediaStore）就不算丢失，只有 blob 为空且没 uri 才算丢
  const isLost = !item.blob && !item.uri
  // 🔶 时长格式化：秒 → "mm:ss"（CSS attr() 读 data-dur 显示在 thumb 右下角）
  let durStr = ''
  if (item.duration != null && isFinite(item.duration) && item.duration > 0) {
    const m = Math.floor(item.duration / 60), s = Math.floor(item.duration % 60)
    durStr = `${m}:${String(s).padStart(2, '0')}`
  }
  const thumb = h('div', { class: 'thumb', 'data-dur': durStr }, TYPE_ICON[item.type])
  const coverOrThumb = item.cover || item.thumb
  if (coverOrThumb) thumb.innerHTML = ''
  if (coverOrThumb) thumb.appendChild(h('img', { src: coverOrThumb, alt: '', loading: 'lazy' }))
  const fav = h('div', { class: 'fav', title: '收藏' }, item.favorite ? '⭐' : '☆')
  fav.addEventListener('click', async (e) => {
    e.stopPropagation()
    const f = await toggleFavorite(item.id)
    fav.textContent = f ? '⭐' : '☆'
  })

  // 媒体徽标行：格式 / 时长 / 大小（有则显，缺则不占位）
  const badges = h('div', { class: 'badges' })
  const ext = (item.name || '').includes('.') ? (item.name.split('.').pop() || '').toUpperCase() : ''
  const dur = (item.duration != null && isFinite(item.duration)) ? item.duration : null
  if (ext) badges.appendChild(h('span', { class: 'bdg' }, ext))
  if (dur != null) { const m = Math.floor(dur / 60), s = Math.floor(dur % 60); badges.appendChild(h('span', { class: 'bdg' }, `${m}:${String(s).padStart(2, '0')}`)) }
  if (item.size) badges.appendChild(h('span', { class: 'bdg' }, item.size > 1048576 ? (item.size / 1048576).toFixed(1) + 'MB' : (item.size / 1024).toFixed(0) + 'KB'))

  if (opts.selectable) {
    const chk = h('div', { class: 'chk', title: '选择' }, '✓')
    const node = h('div', { class: 'card' + (isLost ? ' lost' : '') + (opts.selected ? ' sel' : ''), 'data-id': item.id },
      chk, thumb, fav,
      h('div', { class: 'meta' },
        h('div', { class: 'name' }, item.title || item.name),
        h('div', { class: 'sub' }, item.artist || item.album || (item.type === 'video' ? '视频文件' : '音频文件')),
        badges
      )
    )
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; opts.onToggle(item, node) })
    return node
  }

  const node = h('div', { class: 'card' + (isLost ? ' lost' : '') },
    thumb, fav,
    h('div', { class: 'meta' },
      h('div', { class: 'name' }, item.title || item.name),
      h('div', { class: 'sub' }, item.artist || item.album || (item.type === 'video' ? '视频文件' : '音频文件')),
      badges
    )
  )
  if (isLost) {
    // §12 文件已丢失：标灰 + 提示 + 重新定位 / 移除
    const badge = h('div', { class: 'lost-badge' }, '⚠ 文件已丢失')
    const actions = h('div', { class: 'lost-actions' },
      h('button', { class: 'ghost-btn', onclick: (e) => { e.stopPropagation(); app.relocateMedia(item.id) } }, '重新定位'),
      h('button', { class: 'ghost-btn danger', onclick: (e) => { e.stopPropagation(); if (confirm(`移除？`)) { deleteMedia(item.id); app.toast('已移除') } } }, '从库移除')
    )
    node.appendChild(badge)
    node.appendChild(actions)
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; app.toast('该文件已丢失，请「重新定位」', 'err') })
  } else {
    node.addEventListener('click', (e) => { if (e.target.closest('.fav')) return; app.playItem(item) })
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (confirm(`移除？`)) { deleteMedia(item.id); app.toast('已移除') }
    })
  }
  return node
}

function emptyState(app, type) {
  const isMusic = type === 'music'
  return h('div', { class: 'empty' },
    h('div', { class: 'big' }, isMusic ? '🎧' : '🎬'),
    h('div', {}, isMusic ? '还没有音乐' : '还没有视频'),
    h('div', { style: { marginTop: '6px', color: 'var(--text-3)' } }, `把${isMusic ? '音乐' : '视频'}拖进来，或点击下方按钮导入`),
    h('button', { class: 'cta', onclick: () => app.importFilesDialog() }, '导入媒体')
  )
}

