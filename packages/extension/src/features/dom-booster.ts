const DEFAULT_ESTIMATED_HEIGHT = 480

function injectInstantVirtualizationCSS(): void {
  if (document.getElementById('vexel-fast-load-css')) return
  const style = document.createElement('style')
  style.id = 'vexel-fast-load-css'
  style.textContent = `
    [data-scope-id="turn"]:not(:nth-last-of-type(-n+3)) {
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
  injectInstantVirtualizationCSS()

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
}
