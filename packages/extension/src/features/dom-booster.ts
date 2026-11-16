const KEEP_RECENT_TURNS = 2
const DEBOUNCE_MS = 2200

let isUserInteracting = false
let interactionTimer: number | undefined
let scheduleTimer: number | undefined
let cachedContainer: HTMLElement | null = null

function markUserInteracting(): void {
  isUserInteracting = true
  if (interactionTimer !== undefined) {
    globalThis.clearTimeout(interactionTimer)
  }
  interactionTimer = globalThis.setTimeout(() => {
    isUserInteracting = false
  }, 2000)
}

function findVisibleInput(): HTMLElement | null {
  const inputs = document.querySelectorAll('textarea, [contenteditable="true"]')
  for (const el of inputs) {
    if ((el as HTMLElement).offsetParent !== null) {
      return el as HTMLElement
    }
  }
  return null
}

function resolveConversationContainer(visibleInput: HTMLElement | null): HTMLElement | null {
  if (
    cachedContainer &&
    document.contains(cachedContainer) &&
    cachedContainer.children.length >= 4
  ) {
    return cachedContainer
  }

  const anchors = document.querySelectorAll('[data-hveid]')
  if (anchors.length === 0) return null

  const parentCounts = new Map<HTMLElement, number>()
  const limit = Math.min(anchors.length, 60)
  for (let i = 0; i < limit; i++) {
    const anchor = anchors.item(i)
    let curr: HTMLElement | null = anchor?.parentElement || null
    let depth = 0
    while (curr && curr !== document.body && depth < 10) {
      if (curr.children.length >= 4 && curr.children.length <= 400) {
        parentCounts.set(curr, (parentCounts.get(curr) || 0) + 1)
      }
      curr = curr.parentElement
      depth++
    }
  }

  let bestContainer: HTMLElement | null = null
  let bestScore = 0
  parentCounts.forEach((count, container) => {
    if (!visibleInput || !container.contains(visibleInput)) {
      const score = count * container.children.length
      if (score > bestScore) {
        bestScore = score
        bestContainer = container
      }
    }
  })

  cachedContainer = bestContainer
  return bestContainer
}

function virtualizeOldTurns(): void {
  if (isUserInteracting) return

  const visibleInput = findVisibleInput()
  const container = resolveConversationContainer(visibleInput)
  if (!container) return

  const children = [...container.children] as HTMLElement[]
  if (children.length <= KEEP_RECENT_TURNS * 2) return

  const cutoff = children.length - KEEP_RECENT_TURNS * 2
  let newlyVirtualized = 0

  for (let i = 0; i < cutoff; i++) {
    const turn = children.slice(i, i + 1).find(() => true)
    if (!turn || turn.dataset.vexelVirtualized === 'true') continue
    if (visibleInput && turn.contains(visibleInput)) continue

    const rect = turn.getBoundingClientRect()
    if (rect.height === 0 || rect.bottom > -250) continue

    const height = Math.max(80, Math.round(rect.height))
    turn.style.contentVisibility = 'auto'
    turn.style.containIntrinsicSize = 'auto ' + height + 'px'
    turn.style.contain = 'layout style paint'
    turn.inert = true
    turn.dataset.vexelVirtualized = 'true'
    newlyVirtualized++
  }

  if (newlyVirtualized > 0) {
    console.log('[Vexel DOM Booster] ' + newlyVirtualized + ' anciens blocs virtualises')
  }
}

function scheduleVirtualization(): void {
  if (scheduleTimer !== undefined) {
    globalThis.clearTimeout(scheduleTimer)
  }
  scheduleTimer = globalThis.setTimeout(() => {
    if ('requestIdleCallback' in globalThis) {
      globalThis.requestIdleCallback(() => virtualizeOldTurns(), { timeout: 2000 })
    } else {
      virtualizeOldTurns()
    }
  }, DEBOUNCE_MS)
}

export function initDomBooster(): void {
  globalThis.addEventListener('keydown', markUserInteracting, { capture: true, passive: true })
  globalThis.addEventListener('paste', markUserInteracting, { capture: true, passive: true })
  globalThis.addEventListener('pointerdown', markUserInteracting, { capture: true, passive: true })

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const target = m.target as HTMLElement
      if (target?.id?.startsWith('vexel-')) continue
      if (m.addedNodes.length > 0) {
        scheduleVirtualization()
        return
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
  scheduleVirtualization()
}
