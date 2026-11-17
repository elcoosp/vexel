console.log('[Vexel Background] Service Worker demarre')
const LOCAL_HOST = ['http://', '127.0.0.1', ':49152'].join('')
const ALT_HOST = ['http://', 'localhost', ':49152'].join('')
const BASES = [LOCAL_HOST, ALT_HOST]

async function fetchBridgeEndpoint(endpoint: string) {
  let lastError = 'Inconnu'
  for (const base of BASES) {
    try {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(base + endpoint, { signal: controller.signal, cache: 'no-store' })
      clearTimeout(id)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      return { ok: true, data }
    } catch (err) {
      lastError = String(err)
    }
  }
  return { ok: false, error: lastError }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return
  if (message.type === 'FETCH_SKILLS') {
    fetchBridgeEndpoint('/skills').then(sendResponse)
    return true
  }
  if (message.type === 'SEARCH_REMOTE_SKILLS') {
    fetchBridgeEndpoint('/skills/search?q=' + encodeURIComponent(message.query || '')).then(sendResponse)
    return true
  }
  if (message.type === 'INSTALL_REMOTE_SKILL') {
    fetch(LOCAL_HOST + '/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: message.repo, name: message.name }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true
  }
  if (message.type === 'REMOVE_LOCAL_SKILL') {
    fetch(LOCAL_HOST + '/skills/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: message.id, dir: message.dir }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true
  }
  if (message.type === 'BROWSE_DIR') {
    const dir = encodeURIComponent(message.dir || '')
    const q = encodeURIComponent(message.query || '')
    fetchBridgeEndpoint('/browse?dir=' + dir + '&q=' + q).then(sendResponse)
    return true
  }
  if (message.type === 'FETCH_GIT_DIFF') {
    const dir = encodeURIComponent(message.dir || '')
    fetchBridgeEndpoint('/git-diff?dir=' + dir).then(sendResponse)
    return true
  }
  if (message.type === 'PACK_FOLDER') {
    const p = encodeURIComponent(message.relPath || '')
    fetchBridgeEndpoint('/pack-folder?path=' + p).then(sendResponse)
    return true
  }
  if (message.type === 'WRITE_FILE') {
    fetch(LOCAL_HOST + '/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relPath: message.relPath, content: message.content }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true
  }
  if (message.type === 'FETCH_FILE_CONTENT') {
    const p = encodeURIComponent(message.relPath || '')
    fetchBridgeEndpoint('/file?path=' + p).then(sendResponse)
    return true
  }
})
