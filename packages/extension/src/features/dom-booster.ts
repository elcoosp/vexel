const DEFAULT_ESTIMATED_HEIGHT = 480

function injectInstantVirtualizationCSS(): void {
  if (document.getElementById('vexel-fast-load-css')) return
  const style = document.createElement('style')
  style.id = 'vexel-fast-load-css'
  style.textContent = `
    html.vexel-booting *,
    html.vexel-booting *::before,
    html.vexel-booting *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
    }
    html.vexel-booting [data-scope-id="turn"]:not(:last-of-type),
    html.vexel-resizing [data-scope-id="turn"]:not(:nth-last-of-type(-n+2)) {
      content-visibility: hidden !important;
      contain-intrinsic-size: auto 480px;
      contain: strict !important;
    }
    [data-scope-id="turn"]:not(:nth-last-of-type(-n+2)) {
      content-visibility: auto;
      contain-intrinsic-size: auto ${DEFAULT_ESTIMATED_HEIGHT}px;
      contain: layout style paint;
    }
    [data-scope-id="turn"][data-last-turn="true"],
    [data-scope-id="turn"]:nth-last-of-type(-n+3),
    .vexel-active-turn {
      content-visibility: visible !important;
      contain: none !important;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

export function scrollToLastUserPrompt(smooth = false): boolean {
  const lastTurn =
    document.querySelector<HTMLElement>('[data-scope-id="turn"][data-last-turn="true"]') ||
    Array.from(document.querySelectorAll<HTMLElement>('[data-scope-id="turn"]')).pop() ||
    null
  if (!lastTurn) return false
  const target = lastTurn.querySelector<HTMLElement>('[jsname="eFVkfb"]') || lastTurn
  target.style.scrollMarginTop = '92px'
  target.scrollIntoView({
    behavior: smooth ? 'smooth' : 'instant',
    block: 'start',
  })
  return true
}

export function initDomBooster(): void {
  document.documentElement.classList.add('vexel-booting')
  injectInstantVirtualizationCSS()

  const clearBooting = () => {
    document.documentElement.classList.remove('vexel-booting')
  }
  window.setTimeout(clearBooting, 1200)
  for (const evt of ['wheel', 'touchstart', 'scroll'] as const) {
    window.addEventListener(evt, clearBooting, { passive: true, once: true, capture: true })
  }

  let resizeClearTimer = 0
  window.addEventListener(
    'resize',
    () => {
      if (!document.documentElement.classList.contains('vexel-resizing')) {
        document.documentElement.classList.add('vexel-resizing')
      }
      if (resizeClearTimer) window.clearTimeout(resizeClearTimer)
      resizeClearTimer = window.setTimeout(() => {
        resizeClearTimer = 0
        document.documentElement.classList.remove('vexel-resizing')
      }, 140)
    },
    { passive: true }
  )

  // Native Blink event: batch height reads then style writes in one rAF to prevent resize layout thrashing
  const pendingTurns = new Set<HTMLElement>()
  let measureScheduled = false
  document.addEventListener(
    'contentvisibilityautostatechange',
    (ev: Event) => {
      const target = ev.target as HTMLElement | null
      if (!target || target.getAttribute('data-scope-id') !== 'turn') return
      const skipped = (ev as Event & { skipped?: boolean }).skipped
      if (!skipped) {
        pendingTurns.add(target)
        if (!measureScheduled) {
          measureScheduled = true
          window.requestAnimationFrame(() => {
            measureScheduled = false
            const updates: Array<[HTMLElement, number]> = []
            for (const el of pendingTurns) {
              if (!el.isConnected) continue
              const h = el.offsetHeight
              if (h > 40) updates.push([el, h])
            }
            pendingTurns.clear()
            for (const [el, h] of updates) {
              el.style.containIntrinsicSize = `auto ${h}px`
            }
          })
        }
      }
    },
    true
  )

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      scrollToLastUserPrompt(true)
    }
  })

  const runInitialAutoScroll = () => {
    let active = true
    const cancel = () => {
      active = false
    }
    window.addEventListener('wheel', cancel, { passive: true, once: true })
    window.addEventListener('touchstart', cancel, { passive: true, once: true })
    window.addEventListener('pointerdown', cancel, { passive: true, once: true })

    for (const delay of Array(250, 700, 1400, 2400)) {
      window.setTimeout(() => {
        if (!active) return
        const turns = document.querySelectorAll('[data-scope-id="turn"]')
        if (turns.length >= 2) {
          scrollToLastUserPrompt(false)
        }
      }, delay)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialAutoScroll, { once: true })
  } else {
    runInitialAutoScroll()
  }

  // Reversible True DOM Pruning for long threads (>12 turns): detaches offscreen older turn children
  // into a WeakMap<HTMLElement, DocumentFragment> while preserving exact height & Wiz node identities.
  const prunedTurns = new WeakMap<HTMLElement, { fragment: DocumentFragment; height: number }>()

  const restoreTurn = (turn: HTMLElement) => {
    const entry = prunedTurns.get(turn)
    if (!entry) return
    prunedTurns.delete(turn)
    turn.replaceChildren(entry.fragment)
    turn.style.minHeight = ''
    delete turn.dataset.vexelPruned
  }

  const pruneObserver =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const el = entry.target as HTMLElement
                pruneObserver?.unobserve(el)
                restoreTurn(el)
              }
            }
          },
          { rootMargin: '900px 0px' }
        )
      : null

  const pruneOldTurns = () => {
    if (document.documentElement.classList.contains('vexel-booting')) return
    const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-scope-id="turn"]'))
    if (turns.length <= 12) return
    const candidates = turns.slice(0, -8)
    for (const turn of candidates) {
      if (prunedTurns.has(turn) || !turn.isConnected) continue
      const rect = turn.getBoundingClientRect()
      // Only prune turns well above the current viewport
      if (rect.bottom > -900) continue
      const height = Math.max(120, Math.round(rect.height))
      const fragment = document.createDocumentFragment()
      while (turn.firstChild) {
        fragment.appendChild(turn.firstChild)
      }
      turn.appendChild(document.createComment('vexel-pruned'))
      turn.style.minHeight = `${height}px`
      turn.dataset.vexelPruned = '1'
      prunedTurns.set(turn, { fragment, height })
      pruneObserver?.observe(turn)
    }
  }

  document.addEventListener('aimRenderComplete', () => window.setTimeout(pruneOldTurns, 400), true)
  window.setTimeout(pruneOldTurns, 2600)

  // Option A: Stale-While-Revalidate Instant Last-Turn Cache (chrome.storage.local)
  // Renders the last cached prompt + AI answer in Shadow DOM in <50ms while Google hydrates full history.
  interface CachedTurnSnapshot {
    prompt: string
    answer: string
    codeSnippets: Array<{ lang: string; code: string }>
    turnCount: number
    updatedAt: number
  }

  const CACHE_STORAGE_KEY = 'vexel:thread-cache:v1'
  const MAX_CACHED_THREADS = 25

  const getConversationCacheKey = (): string | null => {
    try {
      const url = new URL(window.location.href)
      if (!url.pathname.startsWith('/search')) return null
      const elids = url.searchParams.get('elids')
      if (elids) return `elids:${elids}`
      const mstk = url.searchParams.get('mstk')
      if (mstk) return `mstk:${mstk}`
      const udm = url.searchParams.get('udm')
      const q = (url.searchParams.get('q') || '').trim().slice(0, 120)
      if (udm === '50' && q) return `q:${q}`
      return null
    } catch {
      return null
    }
  }

  const cacheKey = getConversationCacheKey()
  let previewHost: HTMLElement | null = null
  let previewDismissed = false

  const dismissInstantPreview = () => {
    previewDismissed = true
    if (!previewHost) return
    const el = previewHost
    previewHost = null
    el.style.transition = 'opacity 180ms ease, transform 180ms ease'
    el.style.opacity = '0'
    el.style.transform = 'translateY(6px)'
    window.setTimeout(() => el.remove(), 190)
  }

  const mountInstantPreview = (snap: CachedTurnSnapshot) => {
    if (previewDismissed || previewHost || document.getElementById('vexel-instant-preview-host'))
      return
    // If Google already rendered at least 2 turns, no preview needed
    if (document.querySelectorAll('[data-scope-id="turn"]').length >= 2) return

    const host = document.createElement('div')
    host.id = 'vexel-instant-preview-host'
    host.setAttribute('data-vexel-ui', 'true')
    Object.assign(host.style, {
      position: 'fixed',
      left: '50%',
      bottom: '108px',
      transform: 'translateX(-50%)',
      width: 'min(760px, calc(100vw - 48px))',
      maxHeight: '52vh',
      zIndex: '2147483640',
      pointerEvents: 'auto',
    })

    const sr = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `
      .card {
        background: rgba(255, 255, 255, 0.97);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(26, 115, 232, 0.24);
        border-radius: 16px;
        box-shadow: 0 12px 36px rgba(32, 33, 36, 0.14);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #202124;
        display: flex;
        flex-direction: column;
        max-height: 52vh;
        overflow: hidden;
      }
      .hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 9px 14px;
        background: linear-gradient(90deg, rgba(26, 115, 232, 0.08), rgba(26, 115, 232, 0.02));
        border-bottom: 1px solid rgba(60, 64, 67, 0.1);
        font-size: 12px;
        color: #1a73e8;
        font-weight: 600;
      }
      .hdr-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #1a73e8; flex-shrink: 0;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
      .close {
        border: none; background: transparent; color: #5f6368;
        cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px;
      }
      .close:hover { background: rgba(60, 64, 67, 0.08); color: #202124; }
      .body {
        padding: 12px 16px;
        overflow-y: auto;
        font-size: 13.5px;
        line-height: 1.55;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .prompt {
        align-self: flex-end;
        background: #f1f3f4;
        color: #202124;
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 13px;
        max-width: 85%;
        white-space: pre-wrap;
      }
      .answer { white-space: pre-wrap; color: #202124; }
      .code-box {
        background: #1e1f22;
        color: #e8eaed;
        border-radius: 10px;
        padding: 10px 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        overflow-x: auto;
        position: relative;
      }
      .code-hdr {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 11px; color: #9aa0a6; margin-bottom: 6px;
      }
      .copy-btn {
        border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06);
        color: #e8eaed; border-radius: 5px; padding: 2px 8px; font-size: 11px; cursor: pointer;
      }
      .copy-btn:hover { background: rgba(255,255,255,0.14); }
      pre { margin: 0; white-space: pre; }
    `

    const card = document.createElement('div')
    card.className = 'card'

    const hdr = document.createElement('div')
    hdr.className = 'hdr'
    const hdrLeft = document.createElement('div')
    hdrLeft.className = 'hdr-left'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const label = document.createElement('span')
    label.textContent = `Vexel Instant Cache (${snap.turnCount} turns) • Syncing Google history…`
    hdrLeft.append(dot, label)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close'
    closeBtn.type = 'button'
    closeBtn.textContent = '×'
    closeBtn.title = 'Dismiss preview'
    closeBtn.addEventListener('click', dismissInstantPreview)
    hdr.append(hdrLeft, closeBtn)

    const body = document.createElement('div')
    body.className = 'body'
    if (snap.prompt) {
      const pEl = document.createElement('div')
      pEl.className = 'prompt'
      pEl.textContent = snap.prompt
      body.appendChild(pEl)
    }
    if (snap.answer) {
      const aEl = document.createElement('div')
      aEl.className = 'answer'
      aEl.textContent = snap.answer
      body.appendChild(aEl)
    }
    for (const snip of snap.codeSnippets) {
      const box = document.createElement('div')
      box.className = 'code-box'
      const cHdr = document.createElement('div')
      cHdr.className = 'code-hdr'
      const langSpan = document.createElement('span')
      langSpan.textContent = snip.lang || 'code'
      const cpBtn = document.createElement('button')
      cpBtn.className = 'copy-btn'
      cpBtn.type = 'button'
      cpBtn.textContent = 'Copy'
      cpBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(snip.code).catch(() => {})
        cpBtn.textContent = 'Copied'
        window.setTimeout(() => {
          cpBtn.textContent = 'Copy'
        }, 1400)
      })
      cHdr.append(langSpan, cpBtn)
      const pre = document.createElement('pre')
      pre.textContent = snip.code
      box.append(cHdr, pre)
      body.appendChild(box)
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

  const saveLastTurnSnapshot = () => {
    if (!cacheKey) return
    const turns = Array.from(document.querySelectorAll<HTMLElement>('[data-scope-id="turn"]'))
    if (turns.length === 0) return
    const lastTurn = turns[turns.length - 1]
    const promptEl = lastTurn.querySelector<HTMLElement>('.V3FYCf, [jsname="eFVkfb"]')
    const answerEl = lastTurn.querySelector<HTMLElement>('[data-subtree="aimc"], .pWvJNd')
    const prompt = (promptEl?.textContent || '').trim().slice(0, 1200)
    const codeSnippets: Array<{ lang: string; code: string }> = []
    answerEl?.querySelectorAll('pre code').forEach((codeEl) => {
      if (codeSnippets.length >= 3) return
      const code = (codeEl.textContent || '').trim()
      if (!code) return
      const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'))
      codeSnippets.push({
        lang: langClass ? langClass.replace('language-', '') : 'code',
        code: code.slice(0, 4000),
      })
    })
    const answer = (answerEl?.textContent || '').trim().slice(0, 6000)
    if (!prompt && !answer) return

    try {
      chrome.storage?.local?.get(CACHE_STORAGE_KEY, (res) => {
        const map = (res?.[CACHE_STORAGE_KEY] || {}) as Record<string, CachedTurnSnapshot>
        map[cacheKey] = {
          prompt,
          answer,
          codeSnippets,
          turnCount: turns.length,
          updatedAt: Date.now(),
        }
        const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        const trimmed = Object.fromEntries(entries.slice(0, MAX_CACHED_THREADS))
        chrome.storage?.local?.set({ [CACHE_STORAGE_KEY]: trimmed })
      })
    } catch {}
  }

  if (cacheKey) {
    try {
      chrome.storage?.local?.get(CACHE_STORAGE_KEY, (res) => {
        const snap = (res?.[CACHE_STORAGE_KEY] as Record<string, CachedTurnSnapshot> | undefined)?.[
          cacheKey
        ]
        if (snap && (snap.prompt || snap.answer)) {
          mountInstantPreview(snap)
        }
      })
    } catch {}

    // Auto-dismiss instant preview once Google renders real turns
    const waitRealTurns = () => {
      if (!document.body) return
      const obs = new MutationObserver(() => {
        const turns = document.querySelectorAll('[data-scope-id="turn"]')
        if (turns.length >= 2) {
          obs.disconnect()
          dismissInstantPreview()
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      window.setTimeout(() => obs.disconnect(), 20000)
    }
    if (document.body) waitRealTurns()
    else document.addEventListener('DOMContentLoaded', waitRealTurns, { once: true })
    document.addEventListener(
      'aimRenderComplete',
      () => {
        dismissInstantPreview()
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(saveLastTurnSnapshot, { timeout: 1000 })
        } else {
          window.setTimeout(saveLastTurnSnapshot, 300)
        }
      },
      true
    )
    window.setTimeout(saveLastTurnSnapshot, 4500)
  }
}
