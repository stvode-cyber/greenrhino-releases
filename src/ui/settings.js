// settings.js — 设置模态（主题/音量/续播/EQ/存储/导入记录）
import { h, toast, openModal } from './dom.js'
import { player, EQ_FREQS, EQ_PRESETS } from '../player.js'
import { getSettings, saveSettings, getAllMedia, dbDelete, dbClear, dbGetAll, getImportRecords } from '../store.js'

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

  body.append(
    row('主题', '深浅色外观', themeSeg),
    row('默认音量', '新播放的初始音量', vol),
    row('退出续播', '记住进度，下次继续', resumeSeg),
    row('交叉淡入', '歌曲间平滑过渡', cf),
    row('均衡器 EQ', '10 段频率调节', eqWrap),
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
