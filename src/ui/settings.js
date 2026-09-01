// settings.js — 设置模态（主题/音量/续播/EQ/存储/导入记录）
import { h, toast, openModal } from './dom.js'
import { player, EQ_FREQS, EQ_PRESETS } from '../player.js'
import { getSettings, saveSettings, getAllMedia, dbDelete, dbClear, dbGetAll, getImportRecords, exportSyncData, importSyncData } from '../store.js'

const HZ_LABEL = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

export async function openSettings(app, focus = '') {
  const s = await getSettings()
  const body = h('div', { class: 'mb' })

  // 主题
  const themeSeg = seg(['dark', 'light'], s.theme, (v) => applyTheme(v), { dark: '深色', light: '浅色' })
  // 默认音量
  const vol = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(s.defaultVolume * 100)),
    oninput: (e) => saveSettings({ defaultVolume: e.target.value / 100 }) })
  // 续播
  const resumeSeg = seg(['on', 'off'], s.resumeEnabled ? 'on' : 'off', (v) => {
    saveSettings({ resumeEnabled: v === 'on' }); player.resumeEnabled = v === 'on'
  }, { on: '开启', off: '关闭' })
  // 交叉淡入
  const cf = h('select', { class: 'opt', onchange: (e) => { saveSettings({ crossfade: +e.target.value }); player.setCrossfade(+e.target.value) } },
    ...[0, 3, 5, 8].map((v) => h('option', { value: String(v), selected: v === s.crossfade }, v === 0 ? '关闭' : v + ' 秒')))

  // EQ
  const eqWrap = h('div', {})
  const eqPresetSeg = seg(Object.keys(EQ_PRESETS), s.eqPreset, (name) => {
    const bands = player.applyEQPreset(name)
    saveSettings({ eqPreset: name, eqBands: bands })
    renderEQ(bands)
  })
  const eqGrid = h('div', { class: 'eq-grid' })
  function renderEQ(bands) {
    eqGrid.innerHTML = ''
    bands.forEach((b, i) => {
      const inp = h('input', { type: 'range', min: '-12', max: '12', value: String(b),
        oninput: (e) => {
          const nb = [...player.eqBands]; nb[i] = +e.target.value
          player.setEQ(nb); saveSettings({ eqBands: nb, eqPreset: 'custom' })
        } })
      eqGrid.appendChild(h('div', { class: 'eq-band' }, inp, h('div', { class: 'hz' }, HZ_LABEL[i])))
    })
  }
  eqWrap.append(h('div', { style: { marginBottom: '8px' } }, eqPresetSeg), eqGrid)
  renderEQ(s.eqBands)

  // 存储
  const storageInfo = h('div', {})
  refreshStorage(storageInfo)
  const clearThumbBtn = h('button', { class: 'opt', onclick: async () => {
    await dbClear('thumbnails')
    app.toast('缩略图缓存已清理'); refreshStorage(storageInfo)
  } }, '清理缩略图')
  const clearBtn = h('button', { class: 'opt', style: { color: 'var(--danger)' }, onclick: async () => {
    if (!confirm('确定清空整个媒体库？此操作不可恢复。')) return
    const all = await getAllMedia()
    for (const m of all) { await dbDelete('media', m.id); await dbDelete('progress', m.id) }
    app.toast('媒体库已清空'); refreshStorage(storageInfo); app.refreshCurrent()
  } }, '清空媒体库')

  // 导入记录
  const importBox = h('div', {})
  refreshImports(importBox)

  // 多端同步（零成本手动同步：导出/导入 JSON 文件，覆盖进度+歌单+收藏+偏好）
  const syncInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files && e.target.files[0]
      if (!f) return
      try {
        const json = JSON.parse(await f.text())
        const n = await importSyncData(json)
        app.toast(`已导入 ${n} 项同步数据`)
        app.refreshCurrent()
      } catch (err) { app.toast('导入失败：' + (err.message || err), 'err') }
      e.target.value = ''
    } })
  const exportBtn = h('button', { class: 'opt', onclick: async () => {
    const data = await exportSyncData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const d = new Date(); const p = (n) => String(n).padStart(2, '0')
    a.href = url
    a.download = `greenrhino-sync-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    app.toast('已导出同步文件（进度·歌单·收藏·偏好）')
  } }, '导出同步数据')
  const importBtn = h('button', { class: 'opt', onclick: () => syncInput.click() }, '导入同步数据')

  body.append(
    row('主题', '深浅色外观', themeSeg),
    row('默认音量', '新播放的初始音量', vol),
    row('退出续播', '记住进度，下次继续', resumeSeg),
    row('设为默认播放器', '双击音频/视频直接用本软件打开', h('button', { class: 'opt', onclick: setAsDefaultPlayer }, '设为系统默认')),
    row('交叉淡入', '歌曲间平滑过渡', cf),
    row('均衡器 EQ', '10 段频率调节', eqWrap),
    row('多端同步', '导出/导入进度·歌单·收藏·偏好（手动同步，不同步媒体文件）', h('div', {}, syncInput, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, exportBtn, importBtn))),
    row('存储', '媒体占用与清理', h('div', {}, storageInfo, h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, clearThumbBtn, clearBtn))),
    row('导入记录', '历史导入来源', importBox)
  )

  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '设置'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')),
    body)
  const close = openModal(modal)
  if (focus === 'eq') eqWrap.scrollIntoView({ behavior: 'smooth', block: 'center' })

  async function refreshStorage(box) {
    const all = await getAllMedia()
    const mediaBytes = all.reduce((a, m) => a + (m.size || 0), 0)
    const thumbs = await dbGetAll('thumbnails')
    const thumbBytes = thumbs.reduce((a, t) => a + (t.size || 0), 0)
    const progress = await dbGetAll('progress')
    box.innerHTML = ''
    box.appendChild(h('div', { class: 'storage-bar' }, h('span', { style: { width: '100%' } })))
    box.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', lineHeight: '1.6' } },
      `媒体数据 ${fmtBytes(mediaBytes)} · 缩略图缓存 ${fmtBytes(thumbBytes)}`,
      h('br'),
      `进度/索引 ${progress.length} 项 · 媒体共 ${all.length} 项`))
  }
  async function refreshImports(box) {
    const recs = await getImportRecords()
    box.innerHTML = ''
    if (!recs.length) { box.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-3)' } }, '暂无导入记录')); return }
    recs.sort((a, b) => b.at - a.at).forEach((r) => {
      box.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '12px', gap: '8px' } },
        h('span', { style: { flex: '1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${r.folder} · ${new Date(r.at).toLocaleString()}`),
        h('div', { style: { display: 'flex', gap: '4px' } },
          h('button', { class: 'icon-btn', title: '重新扫描', onclick: () => { app.importFolderDialog(); app.toast('请重新选择该文件夹以扫描') } }, '🔄'),
          h('button', { class: 'icon-btn', title: '移除记录', onclick: async () => { await dbDelete('imports', r.id); refreshImports(box); app.toast('已移除记录') } }, '✕'))))
    })
  }

  // 设为系统默认播放器：通过 WebView2 原生通道写注册表关联
  function setAsDefaultPlayer() {
    const wv = window.chrome && window.chrome.webview
    if (!wv || typeof wv.postMessage !== 'function') {
      app.toast('此功能需在 Windows 桌面版绿角犀中执行', 'info')
      return
    }
    const handler = (e) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (d && d.type === 'setDefaultResult') {
          wv.removeEventListener('message', handler)
          if (d.ok) app.toast(d.msg || '已设为默认播放器')
          else app.toast(d.msg || '设置失败', 'err')
        }
      } catch { /* 忽略无法解析的消息 */ }
    }
    wv.addEventListener('message', handler)
    wv.postMessage(JSON.stringify({ type: 'setDefault' }))
  }

}

function row(label, desc, control) {
  return h('div', { class: 'setting-row' },
    h('div', {}, h('label', {}, label), h('div', { class: 'desc' }, desc)), control)
}
function seg(values, current, onPick, labels = {}) {
  const wrap = h('div', { class: 'seg' })
  values.forEach((v) => {
    const b = h('button', { class: v === current ? 'active' : '', onclick: () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'))
      b.classList.add('active'); onPick(v)
    } }, labels[v] || v)
    wrap.appendChild(b)
  })
  return wrap
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  saveSettings({ theme }); player.emit('theme', theme)
}
