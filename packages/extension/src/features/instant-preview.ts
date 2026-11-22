import { marked } from 'marked'
import { extractLastExchangeMarkdown, type LastExchangeSnapshot } from './thread-tools'

interface CachedTurnSnapshot extends LastExchangeSnapshot {
  updatedAt: number
}

const CACHE_STORAGE_KEY = 'vexel:thread-cache:v6'
const MAX_CACHED_THREADS = 25
const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'CODE',
  'PRE',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'BLOCKQUOTE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'HR',
  'A',
])

const getConversationCacheKey = (): string | null => {
  try {
    const url = new URL(window.location.href)
    if (!url.pathname.startsWith('/search')) return null
    const elids = url.searchParams.get('elids')
    if (elids) return 'elids:' + elids
    const mstk = url.searchParams.get('mstk')
    if (mstk) return 'mstk:' + mstk
    const udm = url.searchParams.get('udm')
    const atvm = url.searchParams.get('atvm')
    const q = (url.searchParams.get('q') || '').trim().slice(0, 120)
    if ((udm === '50' || atvm === '1') && q) return 'q:' + q
    return null
  } catch {
    return null
  }
}

const sanitizeNodeTree = (node: Node, targetDoc: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) return targetDoc.createTextNode(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as HTMLElement
  if (!ALLOWED_TAGS.has(el.tagName)) {
    const frag = targetDoc.createDocumentFragment()
    el.childNodes.forEach((c) => {
      const clean = sanitizeNodeTree(c, targetDoc)
      if (clean) frag.appendChild(clean)
    })
    return frag
  }
  const cleanEl = targetDoc.createElement(el.tagName.toLowerCase())
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) {
      cleanEl.setAttribute('href', href)
      cleanEl.setAttribute('target', '_blank')
      cleanEl.setAttribute('rel', 'noopener noreferrer')
    }
  }
  if (el.tagName === 'CODE') {
    const lang = Array.from(el.classList).find((c) => c.startsWith('language-'))
    if (lang) cleanEl.dataset.lang = lang.replace('language-', '')
  }
  el.childNodes.forEach((c) => {
    const clean = sanitizeNodeTree(c, targetDoc)
    if (clean) cleanEl.appendChild(clean)
  })
  return cleanEl
}

const renderMarkdown = (container: HTMLElement, md: string) => {
  const rawHtml = marked.parse(md, { gfm: true, breaks: true, async: false }) as string
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html')
  parsed.body.childNodes.forEach((node) => {
    const clean = sanitizeNodeTree(node, document)
    if (clean) container.appendChild(clean)
  })
  container.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code')
    const codeText = (codeEl?.textContent || pre.textContent || '').trim()
    if (!codeText) return
    const wrapper = document.createElement('div')
    wrapper.className = 'code-box'
    const bar = document.createElement('div')
    bar.className = 'code-hdr'
    const langSpan = document.createElement('span')
    langSpan.textContent = codeEl?.dataset.lang || 'code'
    const copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'copy-btn'
    copyBtn.textContent = 'Copier'
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(codeText).catch(() => {})
      copyBtn.textContent = 'Copié'
      window.setTimeout(() => {
        copyBtn.textContent = 'Copier'
      }, 1400)
    })
    bar.append(langSpan, copyBtn)
    pre.parentNode?.insertBefore(wrapper, pre)
    wrapper.append(bar, pre)
  })
}

export const initInstantThreadCache = (): void => {
  const cacheKey = getConversationCacheKey()
  if (!cacheKey) return

  let previewHost: HTMLElement | null = null
  let previewDismissed = false
  let previewPinned = false
  let userInteracted = false

  const dismissPreview = (force = false) => {
    if (!force && (previewPinned || userInteracted)) return
    previewDismissed = true
    if (!previewHost) return
    const el = previewHost
    previewHost = null
    el.style.transition = 'opacity 180ms ease'
    el.style.opacity = '0'
    window.setTimeout(() => el.remove(), 190)
  }

  const isRealLastTurnStable = (): boolean => {
    if (document.documentElement.classList.contains('vexel-booting')) return false
    const turns = document.querySelectorAll<HTMLElement>('[data-scope-id="turn"]')
    if (turns.length < 2) return false
    const last = turns[turns.length - 1]
    const answerEl = last.querySelector<HTMLElement>('[data-subtree="aimc"]')
    if ((answerEl?.textContent || '').trim().length < 80) return false
    const rect = last.getBoundingClientRect()
    return rect.height > 100 && rect.width > 240
  }

  const mountPreview = (snap: CachedTurnSnapshot) => {
    if (previewDismissed || previewHost || document.getElementById('vexel-instant-preview-host'))
      return
    if (isRealLastTurnStable()) return

    const host = document.createElement('div')
    host.id = 'vexel-instant-preview-host'
    host.setAttribute('data-vexel-ui', 'true')
    Object.assign(host.style, {
      position: 'fixed',
      left: '50%',
      bottom: '148px',
      transform: 'translateX(-50%)',
      width: 'min(740px, calc(100vw - 48px))',
      maxHeight: 'calc(100vh - 220px)',
      zIndex: '2147483640',
      pointerEvents: 'auto',
    })

    const sr = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = [
      '.card{background:#fff;border:1px solid #dadce0;border-radius:16px;box-shadow:0 8px 28px rgba(32,33,36,.14);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#202124;display:flex;flex-direction:column;max-height:calc(100vh - 220px);overflow:hidden}',
      '.hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;background:#f8f9fa;border-bottom:1px solid #e8eaed;font-size:12px;color:#3c4043;font-weight:500}',
      '.hdr-left{display:flex;align-items:center;gap:8px;min-width:0}',
      '.hdr-actions{display:flex;align-items:center;gap:6px}',
      '.dot{width:7px;height:7px;border-radius:50%;background:#1a73e8;flex-shrink:0}',
      '.pill-btn,.close{border:1px solid #dadce0;background:#fff;color:#3c4043;cursor:pointer;font-size:11px;line-height:1.2;padding:3px 8px;border-radius:999px}',
      '.pill-btn.active{background:#e8f0fe;color:#1a73e8;border-color:#aecbfa}',
      '.close{border:none;background:transparent;font-size:16px;padding:2px 6px;border-radius:6px}',
      '.close:hover,.pill-btn:hover{background:#f1f3f4}',
      '.body{padding:14px 18px;overflow-y:auto;overscroll-behavior:contain;font-size:13.5px;line-height:1.6;display:flex;flex-direction:column;gap:12px}',
      '.prompt{align-self:flex-end;background:#f1f3f4;color:#202124;padding:8px 13px;border-radius:14px;font-size:13px;max-width:85%}',
      '.answer{color:#202124}',
      '.answer p{margin:0 0 8px}.answer p:last-child{margin-bottom:0}',
      '.answer h1,.answer h2,.answer h3,.answer h4{font-size:14px;font-weight:600;margin:10px 0 6px;color:#1f2328}',
      '.answer ul,.answer ol{margin:4px 0 8px;padding-left:20px}.answer li{margin-bottom:4px}',
      '.answer code{background:#f1f3f4;padding:1px 5px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}',
      '.answer pre code{background:transparent;padding:0;color:inherit}',
      '.code-box{background:#1e1f22;color:#e8eaed;border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-x:auto;margin:8px 0}',
      '.code-hdr{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#9aa0a6;margin-bottom:6px}',
      '.copy-btn{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#e8eaed;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer}',
      '.copy-btn:hover{background:rgba(255,255,255,.16)}',
      'pre{margin:0;white-space:pre}',
    ].join('')

    const card = document.createElement('div')
    card.className = 'card'

    const hdr = document.createElement('div')
    hdr.className = 'hdr'
    const hdrLeft = document.createElement('div')
    hdrLeft.className = 'hdr-left'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const label = document.createElement('span')
    label.textContent = 'Dernier échange en cache (' + snap.turnCount + ' tours)'
    hdrLeft.append(dot, label)

    const hdrActions = document.createElement('div')
    hdrActions.className = 'hdr-actions'
    const pinBtn = document.createElement('button')
    pinBtn.className = 'pill-btn'
    pinBtn.type = 'button'
    pinBtn.textContent = 'Garder'
    pinBtn.addEventListener('click', () => {
      previewPinned = !previewPinned
      pinBtn.classList.toggle('active', previewPinned)
      pinBtn.textContent = previewPinned ? 'Épinglé' : 'Garder'
    })

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close'
    closeBtn.type = 'button'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => dismissPreview(true))

    hdrActions.append(pinBtn, closeBtn)
    hdr.append(hdrLeft, hdrActions)

    const body = document.createElement('div')
    body.className = 'body'
    body.addEventListener(
      'wheel',
      () => {
        userInteracted = true
        label.textContent = 'Dernier échange en cache (' + snap.turnCount + ' tours) • Lecture'
      },
      { passive: true }
    )

    if (snap.prompt) {
      const pEl = document.createElement('div')
      pEl.className = 'prompt'
      pEl.textContent = snap.prompt
      body.appendChild(pEl)
    }
    if (snap.answerMarkdown) {
      const aEl = document.createElement('div')
      aEl.className = 'answer'

      renderMarkdown(aEl, snap.answerMarkdown)
      body.appendChild(aEl)
    }
    card.append(hdr, body)
    sr.append(style, card)
    const attach = () => {
      if (previewDismissed || !document.body) return
      document.body.appendChild(host)
      previewHost = host
    }
    if (document.body) attach()
    else document.addEventListener('DOMContentLoaded', attach, { once: true })
  }
  const saveSnapshot = () => {
    const extracted = extractLastExchangeMarkdown()
    if (!extracted) return
    try {
      chrome.storage?.local?.get(CACHE_STORAGE_KEY, (res) => {
        const map = (res?.[CACHE_STORAGE_KEY] || {}) as Record<string, CachedTurnSnapshot>
        map[cacheKey] = { ...extracted, updatedAt: Date.now() }
        const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        chrome.storage?.local?.set({
          [CACHE_STORAGE_KEY]: Object.fromEntries(entries.slice(0, MAX_CACHED_THREADS)),
        })
      })
    } catch {}
  }
  try {
    chrome.storage?.local?.get(CACHE_STORAGE_KEY, (res) => {
      const snap = (res?.[CACHE_STORAGE_KEY] as Record<string, CachedTurnSnapshot> | undefined)?.[
        cacheKey
      ]
      if (snap && (snap.prompt || snap.answerMarkdown)) mountPreview(snap)
    })
  } catch {}
  const waitRealTurns = () => {
    if (!document.body) return
    let settleTimer = 0
    const obs = new MutationObserver(() => {
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (isRealLastTurnStable()) {
          obs.disconnect()
          dismissPreview(false)
          saveSnapshot()
        }
      }, 900)
    })
    obs.observe(document.body, { childList: true, subtree: true })
    window.setTimeout(() => obs.disconnect(), 25000)
  }
  if (document.body) waitRealTurns()
  else document.addEventListener('DOMContentLoaded', waitRealTurns, { once: true })
  document.addEventListener(
    'aimRenderComplete',
    () => {
      window.setTimeout(() => {
        if (isRealLastTurnStable()) dismissPreview(false)
      }, 500)
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(saveSnapshot, { timeout: 1000 })
      } else {
        window.setTimeout(saveSnapshot, 300)
      }
    },
    true
  )
  window.setTimeout(saveSnapshot, 6500)
}
