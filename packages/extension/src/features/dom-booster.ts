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


function findLastUserPromptElement(): HTMLElement | null {
  const lastTurn =
    document.querySelector<HTMLElement>('.CKgc1d[data-last-turn="true"]') ||
    findRealTurnElements().slice(-1).find(Boolean) ||
    null;
  if (!lastTurn) return null;
  return lastTurn.querySelector<HTMLElement>('.ilZyRc.R7mRQb, .tbIZh.Odbbif') || lastTurn;
}

export function scrollToLastUserPrompt(smooth = false): boolean {
  const target = findLastUserPromptElement();
  if (!target) return false;
  target.style.scrollMarginTop = '92px';
  target.scrollIntoView({
    behavior: smooth ? 'smooth' : 'instant',
    block: 'start',
  });
  return true;
}

function initSmartAutoScroll(scheduleSync: () => void): () => void {
  let autoScrollActive = true;
  const startTime = Date.now();
  const MAX_WINDOW_MS = 3500;

  const cancelAutoScroll = () => {
    autoScrollActive = false;
  };

  window.addEventListener('wheel', cancelAutoScroll, { passive: true, once: true });
  window.addEventListener('touchstart', cancelAutoScroll, { passive: true, once: true });
  window.addEventListener('pointerdown', cancelAutoScroll, { passive: true, once: true });

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
      cancelAutoScroll();
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      scrollToLastUserPrompt(true);
    }
  });

  return () => {
    if (!autoScrollActive) return;
    if (Date.now() - startTime > MAX_WINDOW_MS) {
      autoScrollActive = false;
      return;
    }
    // Wait until at least 2 turns exist (restored thread) before locking onto last user message
    const turns = findRealTurnElements();
    if (turns.length < 2) return;

    window.requestAnimationFrame(() => {
      if (!autoScrollActive) return;
      const didScroll = scrollToLastUserPrompt(false);
      if (didScroll) {
        scheduleSync();
      }
    });
  };
}

export function initDomBooster(): void {
  injectInstantVirtualizationCSS()

  let rafPending = false
  let runAutoScroll: (() => void) | null = null
  const scheduleSync = () => {
    if (rafPending) return
    rafPending = true
    window.requestAnimationFrame(() => {
      rafPending = false
      syncVirtualizeTurns()
    })
  }

  let isTyping = false
  let typingTimer: number | undefined
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('[data-xid="aim-mars-input-plate"]'))) {
      isTyping = true
      if (typingTimer) window.clearTimeout(typingTimer)
      typingTimer = window.setTimeout(() => { isTyping = false }, 800)
    }
  }, { capture: true, passive: true })

  let boostTimer: number | undefined
  const debouncedBoost = () => {
    if (boostTimer) window.clearTimeout(boostTimer)
    boostTimer = window.setTimeout(() => {
      if (isTyping) { debouncedBoost(); return }
      scheduleSync()
    }, 350)
  }

  const observer = new MutationObserver((mutations) => {
    if (isTyping) return
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      if (m.addedNodes.length === 0) continue
      const target = m.target as HTMLElement | null
      if (target?.closest?.('[data-vexel-ui], [data-xid="aim-mars-input-plate"], form')) continue
      runAutoScroll?.()
      debouncedBoost()
      return
    }
  })

  const startObserving = () => {
    if (document.body) {
      runAutoScroll = initSmartAutoScroll(scheduleSync)
      observer.observe(document.body, { childList: true, subtree: true })
      syncVirtualizeTurns()
      runAutoScroll()
    }
  }

  if (document.body) {
    startObserving()
  } else {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true })
  }
}
