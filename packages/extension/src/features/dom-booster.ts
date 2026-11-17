const KEEP_RECENT_TURNS = 3
const DEBOUNCE_MS = 450
const DEFAULT_ESTIMATED_HEIGHT = 480

let isUserInteracting = false
let interactionTimer: number | undefined
let scheduleTimer: number | undefined

const measuredHeights = new WeakMap<HTMLElement, number>()
const observedTurns = new WeakSet<HTMLElement>()

const heightObserver = new ResizeObserver((entries) => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const el = entry.target as HTMLElement
    // Only record height when the element is actively rendered (not skipped by content-visibility)
    if (el.offsetParent === null) continue
    const boxHeight = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight
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

function markUserInteracting(): void {
  isUserInteracting = true
  if (interactionTimer !== undefined) {
    window.clearTimeout(interactionTimer)
  }
  interactionTimer = window.setTimeout(() => {
    isUserInteracting = false
  }, 900)
}

function findRealTurnElements(): HTMLElement[] {
  // Primary selector for Google AI Mode conversation turns
  const primary = document.querySelectorAll<HTMLElement>('.CKgc1d[data-scope-id="turn"], [data-scope-id="turn"]')
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

  // Chrome fires contentvisibilityautostatechange right before skipping/unskipping offscreen subtrees
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

function virtualizeOldTurns(): void {
  if (isUserInteracting) {
    scheduleBoost()
    return
  }

  const turns = findRealTurnElements()
  if (turns.length === 0) return

  for (let i = 0; i < turns.length; i++) {
    attachTurnTracking(turns[i])
  }

  if (turns.length <= KEEP_RECENT_TURNS) return

  const cutoff = turns.length - KEEP_RECENT_TURNS
  let newlyVirtualized = 0

  for (let i = 0; i < cutoff; i++) {
    const turn = turns[i]
    if (!turn.classList.contains('vexel-virtualized')) {
      // Measure real rendered height BEFORE enabling content-visibility: auto to prevent any scroll jump
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
      newlyVirtualized++
    }
  }

  for (let i = cutoff; i < turns.length; i++) {
    const turn = turns[i]
    if (turn.classList.contains('vexel-virtualized')) {
      turn.classList.remove('vexel-virtualized')
      turn.style.contentVisibility = ''
      turn.style.containIntrinsicSize = ''
      turn.style.contain = ''
    }
  }

  if (newlyVirtualized > 0) {
    console.log(
      `[Vexel DOM Booster] ${newlyVirtualized} tours virtualises avec hauteur exacte (${cutoff}/${turns.length})`
    )
  }
}

function scheduleBoost(): void {
  if (scheduleTimer !== undefined) {
    window.clearTimeout(scheduleTimer)
  }
  scheduleTimer = window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => virtualizeOldTurns(), { timeout: 800 })
    } else {
      virtualizeOldTurns()
    }
  }, DEBOUNCE_MS)
}

export function initDomBooster(): void {
  console.log('[Vexel DOM Booster] Demarrage (tours cibles + hauteur exacte anti-jump)')

  window.addEventListener('keydown', markUserInteracting, { capture: true, passive: true })
  window.addEventListener('paste', markUserInteracting, { capture: true, passive: true })
  window.addEventListener('pointerdown', markUserInteracting, { capture: true, passive: true })

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      if (m.addedNodes.length === 0) continue
      const target = m.target as HTMLElement | null
      if (target?.closest?.('[data-vexel-ui]')) continue
      scheduleBoost()
      return
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  scheduleBoost()
}
