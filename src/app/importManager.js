// src/app/importManager.js — 媒体文件导入/定位/进度浮层
// 🔶 大重构 T20261020-04：从 main.js 提取（原 L599-742）
// 依赖 ctx.ROLE / ctx.showPage / ctx.app（main.js 构建后注入）
import { h, toast } from '../ui/dom.js'
import { parseTags, guessFromFilename } from '../metadata.js'
import { addMediaFiles, addImportRecord, updateMedia } from '../store.js'
import { ctx } from './context.js'

// ---------- 导入进度浮层（大量文件时给出反馈，避免误以为卡死） ----------
export const importOverlay = (() => {
  const bar = h('div', { class: 'import-bar-fill' })
  const label = h('div', { class: 'import-label' }, '准备导入…')
  const count = h('div', { class: 'import-count' }, '')
  const el = h('div', { class: 'import-overlay', hidden: true },
    h('div', { class: 'import-card' },
      h('div', { class: 'import-title' }, '📥 正在导入媒体'),
      label, count,
      h('div', { class: 'import-bar' }, bar)))
  document.body.appendChild(el)
  let hideTimer = null
  return {
    progress(done, total, msg) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      el.hidden = false
      const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100
      bar.style.width = pct + '%'
      label.textContent = msg || '正在导入…'
      count.textContent = `${done} / ${total}`
    },
    done(msg) {
      bar.style.width = '100%'
      label.textContent = msg || '导入完成'
      count.textContent = '✓ 完成'
      hideTimer = setTimeout(() => { el.hidden = true }, 1300)
    },
    hide() { el.hidden = true; if (hideTimer) clearTimeout(hideTimer) }
  }
})()

// ---------- 导入 ----------
export function makeFileInput() {
  const input = document.createElement('input')
  input.type = 'file'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.addEventListener('change', () => { setTimeout(() => input.remove(), 0) }, { once: true })
  return input
}

export function importFilesDialog() {
  const ROLE = ctx.ROLE
  const input = makeFileInput()
  input.multiple = true
  // ISS-20261009-012：按 role 过滤 MIME type → SAF 只显示对应分类 tab
  input.accept = ROLE === 'video' ? 'video/*' : ROLE === 'music' ? 'audio/*' : 'audio/*,video/*'
  input.onchange = () => doImport([...input.files], '手动添加')
  input.click()
}

export function importFolderDialog() {
  // ISS-20260914-002：WebView / iOS 不支持 webkitdirectory → 自动降级为多文件选择
  const probe = document.createElement('input')
  probe.type = 'file'
  const supportsDir = 'webkitdirectory' in probe || 'directory' in probe
  const input = makeFileInput()
  input.multiple = true
  if (supportsDir) {
    input.webkitdirectory = true
  } else {
    toast('当前环境不支持文件夹选择，已切换为多文件模式', 'warn')
  }
  input.onchange = () => {
    const files = [...input.files]
    const folder = supportsDir ? (files[0]?.webkitRelativePath?.split('/')[0] || '文件夹') : '多文件'
    if (files.length === 0) { toast('未选择任何文件', 'warn'); return }
    doImport(files, folder)
  }
  input.click()
}

async function doImport(files, folder) {
  const added = await importFiles(files, folder, importOverlay.progress)
  if (added.length) {
    importOverlay.done(`已导入 ${added.length} 个文件`)
    ctx.showPage?.(added[0].type)
  } else { importOverlay.hide(); toast('没有可导入的音频/视频文件', 'err') }
}

export async function importFiles(files, folder = '导入', onProgress) {
  const lrcByName = {}
  for (const f of files) {
    if (/\.lrc$/i.test(f.name)) {
      const base = f.name.replace(/\.[^.]+$/, '')
      lrcByName[base] = f
    }
  }
  onProgress?.(0, files.length, '准备导入')
  const added = await addMediaFiles(files, folder, onProgress)
  const total = files.length + added.length
  let done = files.length
  for (const it of added) {
    if (it.type === 'music') {
      const base = it.name.replace(/\.[^.]+$/, '')
      const lrcFile = lrcByName[base]
      let lyric = ''
      if (lrcFile) { try { lyric = (await lrcFile.text()).trim() } catch (e) {} }
      if (lyric) { const upd = await updateMedia(it.id, { lyric }); if (upd) Object.assign(it, upd) }
      const tags = await parseTags(it.blob)
      const guessed = guessFromFilename(it.name)
      const patch = {}
      patch.title = (tags && tags.title) ? tags.title : (guessed.title || it.name)
      if (tags && tags.artist) patch.artist = tags.artist
      else if (guessed.artist) patch.artist = guessed.artist
      if (tags && tags.album) patch.album = tags.album
      if (tags && tags.cover) patch.cover = tags.cover
      if (tags && tags.lyrics && !lyric) patch.lyric = tags.lyrics
      if (Object.keys(patch).length) { const upd = await updateMedia(it.id, patch); if (upd) Object.assign(it, upd) }
    }
    done++; onProgress?.(done, total, '解析封面与歌词')
  }
  if (added.length) await addImportRecord({ folder, count: added.length })
  ctx.app.refreshCurrent()
  return added
}

export function relocateMedia(id) {
  const ROLE = ctx.ROLE
  const input = makeFileInput()
  input.accept = ROLE === 'video' ? 'video/*' : ROLE === 'music' ? 'audio/*' : 'audio/*,video/*'
  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv)$/i.test(file.name)
    const type = isVideo ? 'video' : 'music'
    const patch = { blob: file, size: file.size, name: file.name, type, mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg') }
    if (type === 'music') {
      const tags = await parseTags(file)
      const guessed = guessFromFilename(file.name)
      patch.title = (tags && tags.title) ? tags.title : (guessed.title || file.name)
      if (tags && tags.artist) patch.artist = tags.artist
      else if (guessed.artist) patch.artist = guessed.artist
      if (tags && tags.album) patch.album = tags.album
      if (tags && tags.cover) patch.cover = tags.cover
    }
    await updateMedia(id, patch)
    toast('已重新定位文件，可正常播放')
    ctx.app.refreshCurrent()
  }
  input.click()
}
