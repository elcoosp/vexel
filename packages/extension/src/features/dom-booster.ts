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
}
