const KEEP_RECENT_TURNS = 3
const DEFAULT_ESTIMATED_HEIGHT = 480

const measuredHeights = new WeakMap<HTMLElement, number>()
const observedTurns = new WeakSet<HTMLElement>()

const heightObserver = new ResizeObserver((entries) => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const el = entry.target as HTMLElement
    if (el.offsetParent === null) continue
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
    const boxHeight = boxSize?.blockSize ?? el.offsetHeight
    if (boxHeight > 40) {
      const rounded = Math.round(boxHeight)
      if (measuredHeights.get(el) !== rounded) {
        measuredHeights.set(el, rounded)
        if (el.classList.contains('vexel-virtualized')) {
          el.style.containIntrinsicSize = `auto ${rounded}px`
        }
      }
    }
  }
})

function injectInstantVirtualizationCSS(): void {
  if (document.getElementById('vexel-fast-load-css')) return
  const style = document.createElement('style')
  style.id = 'vexel-fast-load-css'
  // Blink applies this during initial HTML/DOM insertion BEFORE layout/paint runs
  style.textContent = `
    .CKgc1d[data-scope-id="turn"]:not(:nth-last-of-type(-n+4)),
    [data-scope-id="turn"]:not(:nth-last-of-type(-n+4)) {
      content-visibility: auto;
      contain-intrinsic-size: auto ${DEFAULT_ESTIMATED_HEIGHT}px;
      contain: layout style paint;
    }
    .CKgc1d[data-scope-id="turn"][data-last-turn="true"],
    .vexel-active-turn {
      content-visibility: visible !important;
      contain: none !important;
    }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

function findRealTurnElements(): HTMLElement[] {
  const primary = document.querySelectorAll<HTMLElement>(
    '.CKgc1d[data-scope-id="turn"], [data-scope-id="turn"]'
  )
  const turns: HTMLElement[] = []

  for (let i = 0; i < primary.length; i++) {
    const el = primary[i]
    if (el.tagName !== 'DIV') continue
    if (el.style.display === 'none' || el.hidden) continue
    if (el.childElementCount === 0) continue
    turns.push(el)
  }

  return turns
}

function attachTurnTracking(turn: HTMLElement): void {
  if (observedTurns.has(turn)) return
  observedTurns.add(turn)
  heightObserver.observe(turn)

  turn.addEventListener('contentvisibilityautostatechange', (ev: Event) => {
    const skipped = (ev as Event & { skipped?: boolean }).skipped
    if (!skipped) {
      const h = turn.offsetHeight
      if (h > 40) {
        measuredHeights.set(turn, h)
        turn.style.containIntrinsicSize = `auto ${h}px`
      }
    }
  })
}

function syncVirtualizeTurns(): void {
  const turns = findRealTurnElements()
  if (turns.length === 0) return

  const cutoff = Math.max(0, turns.length - KEEP_RECENT_TURNS)

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    attachTurnTracking(turn)

    if (i < cutoff) {
      turn.classList.remove('vexel-active-turn')
      if (!turn.classList.contains('vexel-virtualized')) {
        const currentHeight = turn.offsetHeight
        const exactHeight =
          currentHeight > 40
            ? currentHeight
            : measuredHeights.get(turn) ?? DEFAULT_ESTIMATED_HEIGHT

        measuredHeights.set(turn, exactHeight)
        turn.classList.add('vexel-virtualized')
        turn.style.containIntrinsicSize = `auto ${exactHeight}px`
        turn.style.contentVisibility = 'auto'
        turn.style.contain = 'layout style paint'
      }
    } else {
      turn.classList.add('vexel-active-turn')
      if (turn.classList.contains('vexel-virtualized')) {
        turn.classList.remove('vexel-virtualized')
        turn.style.contentVisibility = ''
        turn.style.containIntrinsicSize = ''
        turn.style.contain = ''
      }
    }
  }
}

export function initDomBooster(): void {
  injectInstantVirtualizationCSS()

  let rafPending = false
  const scheduleSync = () => {
    if (rafPending) return
    rafPending = true
    window.requestAnimationFrame(() => {
      rafPending = false
      syncVirtualizeTurns()
    })
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      if (m.addedNodes.length === 0) continue
      const target = m.target as HTMLElement | null
      if (target?.closest?.('[data-vexel-ui]')) continue
      // Apply synchronously in the microtask BEFORE browser layout/paint of newly streamed turns
      syncVirtualizeTurns()
      scheduleSync()
      return
    }
  })

  const startObserving = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true })
      syncVirtualizeTurns()
    }
  }

  if (document.body) {
    startObserving()
  } else {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true })
  }
}
