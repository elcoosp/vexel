const KEEP_RECENT_TURNS = 3
const DEBOUNCE_MS = 600

let isUserInteracting = false
let interactionTimer: number | undefined
let scheduleTimer: number | undefined

function markUserInteracting(): void {
  isUserInteracting = true
  if (interactionTimer !== undefined) {
    window.clearTimeout(interactionTimer)
  }
  interactionTimer = window.setTimeout(() => {
    isUserInteracting = false
  }, 1200)
}

function findVisibleInput(): Element | null {
  const inputs = document.querySelectorAll('textarea, [contenteditable="true"]')
  for (let i = 0; i < inputs.length; i++) {
    const el = inputs[i] as HTMLElement
    if (el.offsetParent !== null) return el
  }
  return null
}

function findConversationTurnElements(visibleInput: Element | null): HTMLElement[] {
  const anchors = document.querySelectorAll('.aiModeUiCodeBlock__Container, [data-hveid]')
  if (anchors.length === 0) return []

  const parentCounts = new Map<HTMLElement, number>()
  for (let i = 0; i < anchors.length; i++) {
    let curr: HTMLElement | null = anchors[i].parentElement
    let depth = 0
    while (curr && curr !== document.body && depth < 8) {
      if (curr.children.length >= 4 && curr.children.length <= 500) {
        parentCounts.set(curr, (parentCounts.get(curr) || 0) + 1)
      }
      curr = curr.parentElement
      depth++
    }
  }

  let bestContainer: HTMLElement | null = null
  let bestScore = 0
  parentCounts.forEach((count, container) => {
    if (visibleInput && !container.contains(visibleInput)) {
      const score = count * container.children.length
      if (score > bestScore) {
        bestScore = score
        bestContainer = container
      }
    }
  })

  if (!bestContainer) return []

  const turns: HTMLElement[] = []
  const children = (bestContainer as HTMLElement).children
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    if (!visibleInput || !child.contains(visibleInput)) {
      turns.push(child)
    }
  }
  return turns
}

function virtualizeOldTurns(): void {
  if (isUserInteracting) {
    scheduleBoost()
    return
  }

  const visibleInput = findVisibleInput()
  const turns = findConversationTurnElements(visibleInput)
  if (turns.length <= KEEP_RECENT_TURNS) return

  const cutoff = turns.length - KEEP_RECENT_TURNS
  let newlyVirtualized = 0

  for (let i = 0; i < cutoff; i++) {
    const turn = turns[i]
    if (!turn.classList.contains('vexel-virtualized')) {
      turn.classList.add('vexel-virtualized')
      turn.style.contentVisibility = 'auto'
      turn.style.containIntrinsicSize = 'auto 450px'
      turn.style.contain = 'layout style paint'
    turn.inert = true;
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
    turn.inert = false;
    }
  }

  if (newlyVirtualized > 0) {
    console.log(
      `[Vexel DOM Booster] ${newlyVirtualized} tours virtualises (${cutoff}/${turns.length})`
    )
  }
}

function scheduleBoost(): void {
  if (scheduleTimer !== undefined) {
    window.clearTimeout(scheduleTimer)
  }
  scheduleTimer = window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => virtualizeOldTurns(), { timeout: 1000 })
    } else {
      virtualizeOldTurns()
    }
  }, DEBOUNCE_MS)
}

export function initDomBooster(): void {
  console.log('[Vexel DOM Booster] Demarrage (mode non-imbrique + idle)')

  document.documentElement.style.overflowAnchor = 'none'
  if (document.body) {
    document.body.style.overflowAnchor = 'none'
  }

  window.addEventListener('keydown', markUserInteracting, { capture: true, passive: true })
  window.addEventListener('paste', markUserInteracting, { capture: true, passive: true })
  window.addEventListener('pointerdown', markUserInteracting, { capture: true, passive: true })

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        scheduleBoost()
        return
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  scheduleBoost()
}
