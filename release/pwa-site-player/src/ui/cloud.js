// cloud.js — 账号云盘客户端（注册送 5GB / 上传 / 列举 / 下载 / 删除）
// 后端：server/cloud_api.py（零依赖 Python stdlib HTTP 服务，默认 8787 端口，CORS 已开放）
// 部署：本机运行 `python server/cloud_api.py` 即可；生产可设 OSS 环境变量走阿里云。
import { h, toast } from './dom.js'

// 后端基址：优先 url ?cloud=，其次 window.GR_CLOUD_BASE（原生壳注入的内嵌服务端口），默认本机 8787
const CLOUD_BASE = (new URLSearchParams(location.search).get('cloud')
  || window.GR_CLOUD_BASE || 'http://localhost:8787').replace(/\/+$/, '')
// 是否运行在原生壳（WebView2）：内嵌云盘同源可用，纯网页需另起 Python 后端
const IS_HOST = !!window.GR_HOST

const SKEY = 'gr_cloud_session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SKEY) || 'null') } catch { return null }
}
function saveSession(s) {
  if (s) localStorage.setItem(SKEY, JSON.stringify(s))
  else localStorage.removeItem(SKEY)
}

function fmtBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}

// 统一请求封装：后端返回 JSON 或 octet-stream（下载）
async function api(path, { method = 'GET', body = null, auth = true, isForm = false } = {}) {
  const headers = {}
  const s = loadSession()
  if (auth && s && s.token) headers['Authorization'] = 'Bearer ' + s.token
  const opt = { method, headers }
  if (body) {
    if (isForm) opt.body = body              // FormData / Blob，浏览器自动带 boundary
    else { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body) }
  }
  const r = await fetch(CLOUD_BASE + path, opt)
  const ct = r.headers.get('Content-Type') || ''
  if (ct.includes('application/json')) {
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || ('请求失败 ' + r.status))
    return j
  }
  if (!r.ok) throw new Error('请求失败 ' + r.status)
  return r  // 下载流（octet-stream）
}

export function buildCloud(app) {
  const notify = (m, t) => (app && app.toast ? app.toast(m, t) : toast(m, t))
  const el = h('div', { class: 'page' })
  let mode = 'login' // login | register

  // ---------- 未登录：登录 / 注册 ----------
  function renderAuth() {
    el.innerHTML = ''
    const s = loadSession()
    if (s && s.token) { renderHome(); return }

    const tabWrap = h('div', { class: 'seg cloud-tabs' })
    const mkTab = (m, label) => h('button', {
      class: mode === m ? 'active' : '',
      onclick: () => { mode = m; renderAuth() }
    }, label)
    tabWrap.append(mkTab('login', '登录'), mkTab('register', '注册（送 5GB）'))

    const userInp = h('input', { class: 'cloud-inp', type: 'text', placeholder: '用户名', autocomplete: 'username' })
    const pwInp = h('input', { class: 'cloud-inp', type: 'password', placeholder: '密码',
      autocomplete: mode === 'register' ? 'new-password' : 'current-password',
      onkeydown: (e) => { if (e.key === 'Enter') doSubmit() } })
    const errBox = h('div', { class: 'cloud-err' })
    const submit = h('button', { class: 'cta', style: { width: '100%', marginTop: '6px' }, onclick: doSubmit },
      mode === 'register' ? '注册并领取 5GB' : '登录')

    async function doSubmit() {
      const username = userInp.value.trim()
      const password = pwInp.value
      if (!username || !password) { errBox.textContent = '请输入用户名和密码'; return }
      errBox.textContent = ''
      submit.disabled = true; submit.textContent = '处理中…'
      try {
        const j = await api(mode === 'register' ? '/api/register' : '/api/login', {
          method: 'POST', body: { username, password }, auth: false
        })
        saveSession({ token: j.token, username, quota: j.quota, used: j.used || 0 })
        notify(mode === 'register' ? '注册成功，已送你 5GB 空间 🎉' : '登录成功')
        renderHome()
      } catch (e) {
        errBox.textContent = e.message
      } finally {
        submit.disabled = false
        submit.textContent = mode === 'register' ? '注册并领取 5GB' : '登录'
      }
    }

    const card = h('div', { class: 'cloud-card' },
      h('div', { class: 'cloud-hero' },
        h('div', { class: 'cloud-hero-ico' }, '☁️'),
        h('h2', {}, '绿角犀云盘'),
        h('p', {}, '注册即送 5GB 离线空间，文件存本机、断网也能用。')),
      tabWrap,
      h('div', { class: 'cloud-form' }, userInp, pwInp, errBox, submit),
      h('p', { class: 'cloud-tip' }, IS_HOST ? '云盘已内嵌在本程序，离线也能用。' : '提示：纯网页模式需在本机运行 server/cloud_api.py（默认 8787 端口）。')
    )
    el.appendChild(card)
  }

  // ---------- 已登录：配额 + 上传 + 文件列表 ----------
  let listEl, quotaFill, quotaText, userText
  function renderHome() {
    const s = loadSession()
    if (!s || !s.token) { renderAuth(); return }
    el.innerHTML = ''

    quotaFill = h('span', { class: 'cloud-quota-fill' })
    quotaText = h('div', { class: 'cloud-quota-text' })
    userText = h('div', { class: 'cloud-user' })
    const head = h('div', { class: 'cloud-head' },
      h('div', { class: 'cloud-head-info' }, userText,
        h('div', { class: 'cloud-quota-bar' }, quotaFill), quotaText),
      h('button', { class: 'ghost-btn', onclick: logout }, '退出登录'))

    const fileInp = h('input', { type: 'file', multiple: true, style: { display: 'none' },
      onchange: () => { if (fileInp.files.length) doUpload([...fileInp.files]); fileInp.value = '' } })
    const drop = h('div', { class: 'cloud-drop' },
      h('div', {}, '📤 拖拽文件到此处，或'),
      h('button', { class: 'ghost-btn', style: { marginTop: '8px' }, onclick: () => fileInp.click() }, '选择文件上传'))
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over') })
    drop.addEventListener('dragleave', () => drop.classList.remove('over'))
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('over')
      const files = [...e.dataTransfer.files]
      if (files.length) doUpload(files)
    })

    listEl = h('div', { class: 'cloud-list' })
    el.append(head, fileInp, drop,
      h('div', { class: 'section-title', style: { marginTop: '18px' } }, '我的文件'), listEl)
    reload()
  }

  // 拉取配额 + 文件列表
  async function reload() {
    const s = loadSession()
    if (!s || !s.token) { renderAuth(); return }

    try {
      const q = await api('/api/quota')
      s.quota = q.quota; s.used = q.used; saveSession(s)
    } catch (e) { /* 网络错时保留本地缓存的配额显示 */ }

    userText.textContent = `👤 ${s.username || ''}`
    const pct = s.quota ? Math.min(100, (s.used / s.quota) * 100) : 0
    quotaFill.style.width = pct.toFixed(1) + '%'
    const left = Math.max(0, (s.quota || 0) - (s.used || 0))
    quotaText.textContent = `已用 ${fmtBytes(s.used)} / 共 ${fmtBytes(s.quota)}（剩 ${fmtBytes(left)}）`

    listEl.innerHTML = ''
    let files
    try {
      files = (await api('/api/files')).files || []
    } catch (e) {
      listEl.appendChild(h('div', { class: 'cloud-err' }, '无法连接云盘服务：' + e.message + '。请确认 server/cloud_api.py 已启动。'))
      return
    }
    if (!files.length) {
      listEl.appendChild(h('div', { class: 'empty' }, '还没有文件，上传点什么吧'))
      return
    }
    files.sort((a, b) => (b.ctime || '').localeCompare(a.ctime || ''))
    for (const f of files) listEl.appendChild(fileRow(f))
  }

  function fileRow(f) {
    const dl = h('button', { class: 'icon-btn', title: '下载', onclick: () => download(f) }, '⬇️')
    const del = h('button', { class: 'icon-btn', title: '删除', onclick: () => remove(f) }, '🗑️')
    return h('div', { class: 'cloud-row' },
      h('div', { class: 'cloud-row-main' },
        h('div', { class: 'cloud-row-name' }, f.name),
        h('div', { class: 'cloud-row-meta' }, `${fmtBytes(f.size)} · ${f.ctime ? new Date(f.ctime).toLocaleString() : ''}`)),
      h('div', { class: 'cloud-row-act' }, dl, del))
  }

  async function doUpload(files) {
    if (!files.length) return
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file, file.name)
        await api('/api/files', { method: 'POST', body: fd, isForm: true })
        notify(`已上传 ${file.name}`)
      } catch (e) {
        notify(`上传 ${file.name} 失败：${e.message}`, 'err')
      }
    }
    reload()
  }

  async function download(f) {
    try {
      const r = await api('/api/files/' + encodeURIComponent(f.id))
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = f.name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      notify('已开始下载 ' + f.name)
    } catch (e) { notify('下载失败：' + e.message, 'err') }
  }

  async function remove(f) {
    if (!confirm(`删除？`)) return
    try {
      await api('/api/files/' + encodeURIComponent(f.id), { method: 'DELETE' })
      notify('已删除 ' + f.name)
      reload()
    } catch (e) { notify('删除失败：' + e.message, 'err') }
  }

  function logout() {
    saveSession(null)
    mode = 'login'
    renderAuth()
    notify('已退出云盘')
  }

  return {
    el,
    show() { const s = loadSession(); if (s && s.token) renderHome(); else renderAuth() },
    hide() {},
    refresh() { if (loadSession()) reload() }
  }
}

