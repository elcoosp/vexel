interface ThreadTurn {
  index: number
  element: HTMLElement
  role: 'user' | 'assistant'
  preview: string
}
const BT3 = String.fromCodePoint(96, 96, 96)
function findConversationContainer(): HTMLElement | null {
  const anchors = document.querySelectorAll('[data-hveid]')
  if (anchors.length === 0) return null
  const visibleInput = [...document.querySelectorAll('textarea, [contenteditable="true"]')].find(
    (el) => (el as HTMLElement).offsetParent !== null
  )
  const parentCounts = new Map<HTMLElement, number>()
  const limit = Math.min(anchors.length, 80)
  for (let i = 0; i < limit; i++) {
    const anchor = anchors.item(i)
    let curr: HTMLElement | null = anchor?.parentElement || null
    let depth = 0
    while (curr && curr !== document.body && depth < 12) {
      if (curr.children.length >= 2 && curr.children.length <= 350) {
        parentCounts.set(curr, (parentCounts.get(curr) || 0) + 1)
      }
      curr = curr.parentElement
      depth++
    }
  }
  let bestContainer: HTMLElement | null = null
  let bestScore = 0
  parentCounts.forEach((count, container) => {
    if (visibleInput && container.contains(visibleInput)) return
    const rect = container.getBoundingClientRect()
    if (rect.width < 280 || rect.height < 80) return
    const score = count * 10 - container.children.length
    if (score > bestScore) {
      bestScore = score
      bestContainer = container
    }
  })
  return bestContainer
}
function isUserTurnBlock(el: HTMLElement, containerRect: DOMRect, idx: number): boolean {
  const rawText = (el.textContent || '').trim()
  if (!rawText) return false
  if (el.querySelector('pre, code, table, ul, ol, h1, h2, h3, .aiModeUiCodeBlock__Container')) {
    return false
  }
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.width < containerRect.width * 0.88) {
    const rightOffset = rect.left - containerRect.left
    if (rightOffset > containerRect.width * 0.08) return true
  }
  const innerDivs = el.querySelectorAll('div, p, span')
  const checkLimit = Math.min(innerDivs.length, 25)
  for (let i = 0; i < checkLimit; i++) {
    const node = innerDivs.item(i)
    if (!node) continue
    const lRect = node.getBoundingClientRect()
    if (lRect.width > 16 && lRect.width < containerRect.width * 0.86) {
      const offset = lRect.left - containerRect.left
      if (offset > containerRect.width * 0.1 && (node.textContent || '').trim() === rawText) {
        return true
      }
    }
  }
  return idx === 0 && rawText.length < 2000
}
function extractTurns(): ThreadTurn[] {
  const container = findConversationContainer()
  if (!container) return []
  const containerRect = container.getBoundingClientRect()
  const turns: ThreadTurn[] = []
  const children = [...container.children] as HTMLElement[]
  for (let i = 0; i < children.length; i++) {
    const el = children.slice(i, i + 1).find(() => true)
    if (!el) continue
    const rawText = (el.textContent || '').trim()
    if (!rawText) continue
    const userTurn = isUserTurnBlock(el, containerRect, i)
    const role: 'user' | 'assistant' = userTurn ? 'user' : 'assistant'
    const cleanPreview = rawText.replaceAll(/\s+/gu, ' ').slice(0, 72)
    turns.push({ index: turns.length + 1, element: el, role, preview: cleanPreview })
  }
  return turns
}
function elementToMarkdown(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement
  for (const pre of clone.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code')
    const langMatch = (codeEl?.className || '').match(/language-([a-zA-Z0-9_-]+)/u)
    const lang = langMatch?.slice(1, 2).find(() => true) || ''
    const codeText = (codeEl ? codeEl.textContent : pre.textContent) || ''
    pre.replaceWith(
      document.createTextNode('\n' + BT3 + lang + '\n' + codeText.trim() + '\n' + BT3 + '\n')
    )
  }
  for (const h of clone.querySelectorAll('h1, h2, h3, h4')) {
    const hashes = '#'.repeat(Number(h.tagName.slice(1)))
    h.replaceWith(
      document.createTextNode('\n\n' + hashes + ' ' + (h.textContent || '').trim() + '\n\n')
    )
  }
  for (const li of clone.querySelectorAll('li')) {
    li.replaceWith(document.createTextNode('\n- ' + (li.textContent || '').trim()))
  }
  for (const p of clone.querySelectorAll('p')) {
    p.replaceWith(document.createTextNode('\n\n' + (p.textContent || '').trim() + '\n'))
  }
  return (clone.textContent || '').replaceAll(/\n{3,}/gu, '\n\n').trim()
}
export function exportConversationMarkdown(showToast: (msg: string) => void): void {
  const turns = extractTurns()
  if (turns.length === 0) {
    showToast('Aucun tour de conversation detecte')
    return
  }
  const timestamp = new Date().toISOString().slice(0, 16).replaceAll(/[:T]/gu, '-')
  const lines: string[] = [
    '# Export Google AI Mode (' + new Date().toLocaleDateString('fr-FR') + ')',
    '',
    '> ' + turns.length + ' blocs exportes via Vexel',
    '',
  ]
  for (const turn of turns) {
    const header = turn.role === 'user' ? '## Utilisateur' : '## Assistant'
    const mdBody = elementToMarkdown(turn.element)
    if (!mdBody) continue
    lines.push('---', '', header, '', mdBody, '')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'google-ai-mode-' + timestamp + '.md'
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  showToast('Conversation exportee (' + turns.length + ' blocs)')
}
const TOC_CSS = [
  ':host { all: initial; }',
  '.rail { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 8px 4px; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }',
  '.tick-wrap { position: relative; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; padding: 2px 4px; }',
  '.tick { width: 14px; height: 3px; border-radius: 2px; background: rgba(161, 161, 170, 0.55); transition: all 0.15s ease; }',
  '.tick-wrap:hover .tick { width: 24px; background: #3b82f6; }',
  '.tooltip { position: absolute; right: 30px; background: rgba(20, 20, 23, 0.96); color: #f4f4f5; border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 9px; border-radius: 7px; font-size: 11.5px; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); opacity: 0; pointer-events: none; transform: translateX(4px); transition: all 0.12s ease; }',
  '.tick-wrap:hover .tooltip { opacity: 1; transform: translateX(0); }',
].join('\n')
export function initThreadTools(showToast: (msg: string) => void): void {
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        exportConversationMarkdown(showToast)
      }
    },
    true
  )
  const host = document.createElement('div')
  host.id = 'vexel-toc-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = TOC_CSS
  const rail = document.createElement('div')
  rail.className = 'rail'
  shadow.append(styleEl, rail)
  document.body.append(host)
  let lastSig = ''
  const refreshToc = () => {
    const allTurns = extractTurns()
    const userTurns = allTurns.filter((t) => t.role === 'user')
    const displayTurns = userTurns.length > 0 ? userTurns : allTurns
    const sig = displayTurns.length + ':' + (displayTurns.slice(-1).find(() => true)?.preview || '')
    if (sig === lastSig) return
    lastSig = sig
    rail.replaceChildren()
    if (displayTurns.length === 0) return
    const step = displayTurns.length > 35 ? Math.ceil(displayTurns.length / 35) : 1
    for (let i = 0; i < displayTurns.length; i += step) {
      const turn = displayTurns.slice(i, i + 1).find(() => true)
      if (!turn) continue
      const wrap = document.createElement('div')
      wrap.className = 'tick-wrap'
      const tip = document.createElement('div')
      tip.className = 'tooltip'
      tip.textContent = '#' + (i + 1) + ' — ' + turn.preview
      const tick = document.createElement('div')
      tick.className = 'tick'
      wrap.append(tip, tick)
      wrap.addEventListener('click', () => {
        turn.element.dataset.vexelVirtualized = ''
        turn.element.style.contentVisibility = ''
        turn.element.style.containIntrinsicSize = ''
        turn.element.style.contain = ''
        turn.element.inert = false
        turn.element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      rail.append(wrap)
    }
  }
  let tocTimer: number | undefined
  const scheduleToc = () => {
    if (tocTimer) globalThis.clearTimeout(tocTimer)
    tocTimer = globalThis.setTimeout(() => {
      if ('requestIdleCallback' in globalThis) {
        globalThis.requestIdleCallback(refreshToc, { timeout: 1500 })
      } else {
        refreshToc()
      }
    }, 1200)
  }
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const target = m.target as HTMLElement
      if (target?.id?.startsWith('vexel-')) continue
      if (m.addedNodes.length > 0) {
        scheduleToc()
        return
      }
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
  scheduleToc()
}
