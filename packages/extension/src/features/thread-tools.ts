import { t } from '@lingui/core/macro'
import '../i18n'
import { animate } from 'motion'

interface ThreadTurn {
  index: number
  element: HTMLElement
  role: 'user' | 'assistant'
  preview: string
}

const BT3 = String.fromCharCode(96, 96, 96)

function getUserTurnElements(): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  const results: HTMLElement[] = []

  const turnBlocks = document.querySelectorAll<HTMLElement>(
    '.CKgc1d[data-scope-id="turn"], [jsname="CS7uPe"], [data-turn-id]'
  )

  for (let i = 0; i < turnBlocks.length; i++) {
    const block = turnBlocks[i]
    const userEl =
      block.querySelector<HTMLElement>(
        '[jsname="eFVkfb"], .VndcI.veK2kb, .tbIZh.Odbbif, [data-user-query], .ryAKYc'
      ) || null
    if (userEl && !seen.has(userEl)) {
      seen.add(userEl)
      results.push(userEl)
    }
  }

  const standalone = document.querySelectorAll<HTMLElement>(
    '[jsname="eFVkfb"], .VndcI.veK2kb, .tbIZh.Odbbif, [data-user-query]'
  )
  for (let i = 0; i < standalone.length; i++) {
    const el = standalone[i]
    if (seen.has(el)) continue
    let isNested = false
    for (const existing of seen) {
      if (existing.contains(el) || el.contains(existing)) {
        isNested = true
        break
      }
    }
    if (!isNested) {
      seen.add(el)
      results.push(el)
    }
  }

  return results
}

function extractTurns(): ThreadTurn[] {
  const turns: ThreadTurn[] = []
  const turnBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.CKgc1d[data-scope-id="turn"], [jsname="CS7uPe"]')
  )

  if (turnBlocks.length > 0) {
    for (const block of turnBlocks) {
      const userEl =
        block.querySelector<HTMLElement>('[jsname="eFVkfb"], .VndcI.veK2kb, .tbIZh.Odbbif') || null
      if (userEl) {
        const userText = (userEl.textContent || '').replace(/\s+/g, ' ').trim()
        if (userText) {
          turns.push({
            index: turns.length + 1,
            element: userEl,
            role: 'user',
            preview: userText.slice(0, 72),
          })
        }
      }

      const aiEl = block.querySelector<HTMLElement>('[data-subtree="aimc"]') || null
      if (aiEl) {
        const aiText = (aiEl.textContent || '').replace(/\s+/g, ' ').trim()
        if (aiText) {
          turns.push({
            index: turns.length + 1,
            element: aiEl,
            role: 'assistant',
            preview: aiText.slice(0, 72),
          })
        }
      }
    }
    return turns
  }

  const fallbackUserNodes = getUserTurnElements()
  for (const node of fallbackUserNodes) {
    const clean = (node.textContent || '').replace(/\s+/g, ' ').trim()
    if (clean) {
      turns.push({
        index: turns.length + 1,
        element: node,
        role: 'user',
        preview: clean.slice(0, 72),
      })
    }
  }
  return turns
}

const BT1 = String.fromCharCode(96)

function extractUserAttachments(turnBlock: HTMLElement): string[] {
  const names: string[] = []
  turnBlock
    .querySelectorAll<HTMLElement>('[data-sn-container] [role="listitem"]')
    .forEach((item) => {
      const leaf = item.firstElementChild as HTMLElement | null
      const label = (leaf?.textContent || '').trim()
      if (label && label.length < 120 && !names.includes(label)) {
        names.push(label)
      }
    })
  return names
}

function elementToMarkdown(root: HTMLElement, role: 'user' | 'assistant'): string {
  if (role === 'user') {
    const turnContainer = root.closest<HTMLElement>('[data-scope-id="turn"]')
    const attachments = turnContainer ? extractUserAttachments(turnContainer) : []
    const textEl = root.querySelector<HTMLElement>('[jsname="y5v2y"]') || root
    const body = (textEl.innerText || textEl.textContent || '').trim()
    if (attachments.length > 0) {
      return '> Attachments: ' + attachments.map((a) => BT1 + a + BT1).join(', ') + '\n\n' + body
    }
    return body
  }

  const mainCol = root.querySelector<HTMLElement>('[data-container-id="main-col"]') || root
  const clone = mainCol.cloneNode(true) as HTMLElement

  // Strip non-content UI using semantic/ARIA attributes only (zero generated class names)
  clone
    .querySelectorAll(
      [
        '[data-ignore-copy]',
        '[data-container-id="rhs-col"]',
        '[data-vexel-ui]',
        '[aria-live]',
        '[aria-hidden="true"]',
        '[hidden]',
        '[role="status"]',
        '[role="toolbar"]',
        '[role="region"]',
        '[role="dialog"]',
        'button',
        'svg',
        'style',
        'script',
      ].join(', ')
    )
    .forEach((el) => el.remove())

  // 1. Code blocks: anchor strictly on standard <pre><code>
  clone.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code')
    const codeText = ((codeEl ? codeEl.textContent : pre.textContent) || '').replace(/\n$/, '')
    const langMatch = (codeEl?.className || '').match(/language-([a-zA-Z0-9_-]+)/)
    let lang = langMatch ? langMatch.slice(1, 2).find(() => true) || '' : ''

    // Find the enclosing code-card wrapper (the ancestor containing this <pre> and its language/footer chrome)
    let card: HTMLElement = pre
    let curr: HTMLElement | null = pre.parentElement
    while (curr && curr !== clone) {
      if (curr.querySelectorAll('pre').length === 1 && curr.hasAttribute('data-hveid')) {
        card = curr
        break
      }
      curr = curr.parentElement
    }

    if (!lang && card !== pre) {
      const prevSiblingText =
        (pre.parentElement?.previousElementSibling?.textContent || '')
          .trim()
          .split(/\s+/)
          .find(Boolean) || ''
      if (/^[a-zA-Z0-9_+-]{1,15}$/.test(prevSiblingText)) {
        lang = prevSiblingText.toLowerCase()
      }
    }

    const fence = codeText.includes(BT3) ? BT3 + BT1 : BT3
    card.replaceWith(
      document.createTextNode('\n\n' + fence + lang + '\n' + codeText + '\n' + fence + '\n\n')
    )
  })

  // 2. Inline code tags
  clone.querySelectorAll('code').forEach((code) => {
    if (code.closest('pre')) return
    const txt = (code.textContent || '').trim()
    if (txt) code.replaceWith(document.createTextNode(BT1 + txt + BT1))
  })

  // 3. Bold & italic
  clone.querySelectorAll('strong, b').forEach((el) => {
    const txt = (el.textContent || '').trim()
    if (txt) el.replaceWith(document.createTextNode('**' + txt + '**'))
  })
  clone.querySelectorAll('em, i').forEach((el) => {
    const txt = (el.textContent || '').trim()
    if (txt) el.replaceWith(document.createTextNode('*' + txt + '*'))
  })

  // Strip Google AI disclaimer footer block
  clone.querySelectorAll('a[href*="://google.com"], a[href*="://google.com"]').forEach((a) => {
    a.parentElement?.remove()
  })

  // 4. Links
  clone.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || ''
    const txt = (a.textContent || '').trim()
    if (txt && href && !href.startsWith('#')) {
      a.replaceWith(document.createTextNode('[' + txt + '](' + href + ')'))
    }
  })

  // 5. Horizontal rules
  clone.querySelectorAll('hr').forEach((hr) => {
    hr.replaceWith(document.createTextNode('\n\n---\n\n'))
  })

  // 6. Semantic & ARIA headings
  clone.querySelectorAll<HTMLElement>('[role="heading"]').forEach((h) => {
    const level = Number(h.getAttribute('aria-level') || '4')
    const hashes = '#'.repeat(Math.min(6, Math.max(2, level - 1)))
    const txt = (h.textContent || '').trim().replace(/^\*\*|\*\*$/g, '')
    if (txt) h.replaceWith(document.createTextNode('\n\n' + hashes + ' ' + txt + '\n\n'))
  })
  clone.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    const hashes = '#'.repeat(Number(h.tagName.slice(1)))
    const txt = (h.textContent || '').trim()
    if (txt) h.replaceWith(document.createTextNode('\n\n' + hashes + ' ' + txt + '\n\n'))
  })

  // 7. Follow-up suggestion links ([role="link"])
  clone.querySelectorAll<HTMLElement>('[role="link"]').forEach((chip) => {
    const txt = (chip.textContent || '').trim()
    if (txt) chip.replaceWith(document.createTextNode('\n- ' + txt))
  })

  // 8. Bottom-up list items
  Array.from(clone.querySelectorAll('li'))
    .reverse()
    .forEach((li) => {
      const txt = (li.textContent || '').trim()
      if (!txt) {
        li.remove()
        return
      }
      const isNested = Boolean(li.parentElement?.closest('li'))
      const prefix = isNested ? '  - ' : '- '
      li.replaceWith(document.createTextNode('\n' + prefix + txt))
    })

  // 9. Paragraph blocks
  clone.querySelectorAll('p, div[data-hveid]').forEach((p) => {
    if (p.querySelector('ul, ol, hr, [role="heading"]')) return
    const txt = (p.textContent || '').trim()
    if (txt) p.replaceWith(document.createTextNode('\n\n' + txt + '\n\n'))
  })

  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildCleanThreadMarkdown(): string | null {
  const turns = extractTurns()
  if (turns.length === 0) return null
  const lines: string[] = [
    '# Google AI Mode Export (' + new Date().toLocaleDateString('en-US') + ')',
    '',
    '> ' + turns.length + ' blocks exported via Vexel',
    '',
  ]
  for (const turn of turns) {
    const mdBody = elementToMarkdown(turn.element, turn.role)
    if (mdBody)
      lines.push('---', '', turn.role === 'user' ? '## User' : '## Assistant', '', mdBody, '')
  }
  return lines.join('\n')
}

export async function copyCleanThread(showToast: (msg: string) => void): Promise<boolean> {
  const md = buildCleanThreadMarkdown()
  if (!md) {
    showToast(t`No conversation turns found`)
    return false
  }
  try {
    await navigator.clipboard.writeText(md)
    const kb = Math.round(md.length / 100) / 10
    showToast(t`Clean thread copied to clipboard (${kb} KB)`)
    return true
  } catch {
    showToast(t`Clipboard write blocked`)
    return false
  }
}

export function exportConversationMarkdown(showToast: (msg: string) => void): void {
  const md = buildCleanThreadMarkdown()
  if (!md) {
    showToast(t`No conversation turns found`)
    return
  }
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const lines = md.split('\n')
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'google-ai-mode-' + timestamp + '.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  const kb = Math.round(md.length / 100) / 10
  showToast(t`Conversation exported (${kb} KB)`)
}

const TOC_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.rail { box-sizing: border-box; position: fixed; right: 16px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: none; flex-direction: column; align-items: center; width: 28px; max-height: min(62vh, 420px); padding: 6px 0; border-radius: 999px; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(16px); border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; transition: width 0.2s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease, box-shadow 0.2s ease; }',
  '.rail.overflowing:hover { width: 32px; }',
  '.rail.visible { display: flex; }',
  '.rail:hover { background: rgba(255, 255, 255, 0.98); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05); }',
  '.rail-scroll { box-sizing: border-box; position: relative; width: 100%; max-height: calc(min(62vh, 420px) - 12px); overflow-y: auto; overflow-x: visible; overscroll-behavior: contain; scrollbar-width: none; }',
  '.rail-scroll::-webkit-scrollbar { display: none; }',
  '.rail-scroll.overflowing { mask-image: linear-gradient(to bottom, transparent 0%, #000 10px, #000 calc(100% - 10px), transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 10px, #000 calc(100% - 10px), transparent 100%); }',
  '.rail-inner { position: relative; width: 18px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 2px; }',
  '.active-pill { position: absolute; left: 0; top: 0; width: 18px; height: 18px; border-radius: 999px; background: #e8f0fe; pointer-events: none; will-change: transform; }',
  '.custom-thumb { position: absolute; right: 3px; top: 8px; width: 3px; height: 24px; border-radius: 999px; background: rgba(60, 64, 67, 0.28); opacity: 0; pointer-events: none; transition: opacity 0.18s ease, background-color 0.18s ease; }',
  '.rail.overflowing:hover .custom-thumb { opacity: 1; }',
  '.tick-wrap { position: relative; z-index: 1; width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 999px; }',
  '.tick { width: 5px; height: 5px; border-radius: 50%; background: #c4c7c5; transition: background-color 0.18s ease, transform 0.18s ease; }',
  '.tick-wrap:hover .tick { background: #5f6368; transform: scale(1.25); }',
  '.tick-wrap.current .tick { background: #1a73e8; transform: scale(1.2); }',
  '.shared-tip, .shared-tip * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; }',
  '.shared-tip { position: fixed; right: 50px; top: 0; display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(18px); color: #1f1f1f; border: 1px solid rgba(0, 0, 0, 0.08); padding: 6px 12px 6px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; line-height: 1.3; white-space: nowrap; max-width: 280px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05); opacity: 0; pointer-events: none; will-change: transform, opacity; z-index: 2147483641; }',
  '.tip-badge { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 600; color: #1a73e8; background: #e8f0fe; padding: 1px 6px; border-radius: 6px; flex-shrink: 0; }',
  '.tip-text { overflow: hidden; text-overflow: ellipsis; color: #3c4043; }',
  '@media (max-width: 900px) {',
  '  .rail { right: 4px; width: 24px; }',
  '  .rail.overflowing:hover { width: 26px; }',
  '  .shared-tip { right: 34px; max-width: calc(100vw - 46px); }',
  '}',
].join('\n')

export interface LastExchangeSnapshot {
  prompt: string
  answerMarkdown: string
  turnCount: number
}

export function extractLastExchangeMarkdown(): LastExchangeSnapshot | null {
  const turns = extractTurns()
  if (turns.length === 0) return null
  const lastAssistantIdx = turns.map((t) => t.role).lastIndexOf('assistant')
  if (lastAssistantIdx === -1) return null
  const answerMarkdown = elementToMarkdown(turns[lastAssistantIdx].element, 'assistant')
    .trim()
    .slice(0, 14000)
  if (!answerMarkdown) return null
  let prompt = ''
  for (let i = lastAssistantIdx - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'user') {
      prompt = elementToMarkdown(turns[i].element, 'user').trim().slice(0, 1200)
      break
    }
  }
  return {
    prompt,
    answerMarkdown,
    turnCount: turns.length,
  }
}

export function initThreadTools(_showToast?: (msg: string) => void): void {
  if (document.getElementById('vexel-toc-host')) return
  const host = document.createElement('div')
  host.id = 'vexel-toc-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = TOC_CSS

  const rail = document.createElement('div')
  rail.className = 'rail'
  const railScroll = document.createElement('div')
  railScroll.className = 'rail-scroll'
  const railInner = document.createElement('div')
  railInner.className = 'rail-inner'
  const activePill = document.createElement('div')
  activePill.className = 'active-pill'
  const customThumb = document.createElement('div')
  customThumb.className = 'custom-thumb'
  railScroll.appendChild(railInner)
  rail.append(railScroll, customThumb)

  const sharedTip = document.createElement('div')
  sharedTip.className = 'shared-tip'
  const tipBadge = document.createElement('span')
  tipBadge.className = 'tip-badge'
  const tipText = document.createElement('span')
  tipText.className = 'tip-text'
  sharedTip.append(tipBadge, tipText)

  shadow.append(styleEl, rail, sharedTip)
  document.body.appendChild(host)

  let renderedPreviews: string[] = []
  let tipVisible = false
  let hideTimer: number | undefined
  let currentIdx = -1
  let turnEntries: Array<{ wrap: HTMLDivElement; target: HTMLElement }> = []
  const hideTooltip = () => {
    if (!tipVisible) return
    tipVisible = false
    animate(sharedTip, { opacity: 0, x: 4 }, { duration: 0.14 })
  }
  const showTooltipAt = (wrap: HTMLElement, indexLabel: string, preview: string) => {
    if (hideTimer) window.clearTimeout(hideTimer)
    tipBadge.textContent = indexLabel
    tipText.textContent = preview
    const rect = wrap.getBoundingClientRect()
    const centerY = Math.round(rect.top + rect.height / 2 - 15)
    if (!tipVisible) {
      tipVisible = true
      sharedTip.style.transform = 'translateY(' + centerY + 'px) translateX(4px)'
      animate(sharedTip, { opacity: 1, y: centerY, x: 0 }, { duration: 0.16, ease: [0.2, 0, 0, 1] })
    } else {
      animate(
        sharedTip,
        { opacity: 1, y: centerY, x: 0 },
        { type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }
      )
    }
  }
  rail.addEventListener('pointerleave', () => {
    hideTimer = window.setTimeout(hideTooltip, 80)
  })
  const syncThumb = () => {
    const sh = railScroll.scrollHeight
    const ch = railScroll.clientHeight
    if (sh <= ch) return
    const trackH = ch - 4
    const thumbH = Math.max(20, Math.round((ch / sh) * trackH))
    const maxScroll = sh - ch
    const maxTop = trackH - thumbH
    const top = 8 + (maxScroll > 0 ? Math.round((railScroll.scrollTop / maxScroll) * maxTop) : 0)
    customThumb.style.height = thumbH + 'px'
    customThumb.style.top = top + 'px'
  }
  railScroll.addEventListener(
    'scroll',
    () => {
      hideTooltip()
      syncThumb()
    },
    { passive: true }
  )
  const moveActivePill = (idx: number, instant = false) => {
    if (idx < 0 || idx >= turnEntries.length) return
    const targetY = turnEntries[idx].wrap.offsetTop
    if (instant) {
      activePill.style.transform = 'translateY(' + targetY + 'px)'
    } else {
      animate(
        activePill,
        { y: targetY },
        { type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }
      )
    }
    if (railScroll.scrollHeight > railScroll.clientHeight) {
      const desiredTop = Math.max(0, targetY - railScroll.clientHeight / 2 + 9)
      railScroll.scrollTo({ top: desiredTop, behavior: instant ? 'auto' : 'smooth' })
    }
  }
  const updateCurrentTurn = (instant = false) => {
    if (turnEntries.length === 0) return
    const mid = window.innerHeight * 0.42
    let lo = 0
    let hi = turnEntries.length - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (turnEntries[m].target.getBoundingClientRect().top < mid) lo = m + 1
      else hi = m
    }
    let bestIdx = lo
    if (lo > 0) {
      const dPrev = Math.abs(turnEntries[lo - 1].target.getBoundingClientRect().top - mid)
      const dCurr = Math.abs(turnEntries[lo].target.getBoundingClientRect().top - mid)
      if (dPrev < dCurr) bestIdx = lo - 1
    }
    if (bestIdx !== currentIdx || instant) {
      currentIdx = bestIdx
      for (let i = 0; i < turnEntries.length; i++) {
        turnEntries[i].wrap.classList.toggle('current', i === bestIdx)
      }
      moveActivePill(bestIdx, instant)
    }
  }
  const createTickNode = (el: HTMLElement, preview: string, idx: number) => {
    const wrap = document.createElement('div')
    wrap.className = 'tick-wrap'
    const dot = document.createElement('div')
    dot.className = 'tick'
    wrap.appendChild(dot)
    const turnRoot = (el.closest('.CKgc1d') || el) as HTMLElement
    turnEntries.push({ wrap, target: turnRoot })
    const badgeLabel = '#' + (idx + 1)
    wrap.addEventListener('pointerenter', () => {
      showTooltipAt(wrap, badgeLabel, preview)
    })
    wrap.addEventListener('click', () => {
      turnRoot.classList.remove('vexel-virtualized')
      turnRoot.style.contentVisibility = ''
      turnRoot.style.containIntrinsicSize = ''
      turnRoot.style.contain = ''
      turnRoot.inert = false
      turnRoot.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    railInner.appendChild(wrap)
  }
  const refreshToc = () => {
    const userEls = getUserTurnElements()
    const nextItems: Array<{ el: HTMLElement; preview: string }> = []
    for (let i = 0; i < userEls.length; i++) {
      const el = userEls[i]
      const preview = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 72)
      if (preview) nextItems.push({ el, preview })
    }
    const canAppendIncrementally =
      nextItems.length > renderedPreviews.length &&
      renderedPreviews.length >= 2 &&
      renderedPreviews.every((prev, i) => nextItems[i]?.preview === prev)
    if (canAppendIncrementally) {
      for (let i = renderedPreviews.length; i < nextItems.length; i++) {
        createTickNode(nextItems[i].el, nextItems[i].preview, i)
      }
      renderedPreviews = nextItems.map((x) => x.preview)
      window.requestAnimationFrame(() => {
        if (!rail.classList.contains('visible')) return
        const isOverflow = railScroll.scrollHeight > railScroll.clientHeight
        rail.classList.toggle('overflowing', isOverflow)
        railScroll.classList.toggle('overflowing', isOverflow)
        syncThumb()
        updateCurrentTurn(false)
      })
      return
    }
    if (
      nextItems.length === renderedPreviews.length &&
      nextItems.every((item, i) => item.preview === renderedPreviews[i])
    ) {
      return
    }
    renderedPreviews = nextItems.map((x) => x.preview)
    turnEntries = []
    currentIdx = -1
    hideTooltip()
    railInner.replaceChildren(activePill)
    if (nextItems.length < 1) {
      rail.classList.remove('visible')
      return
    }
    rail.classList.add('visible')
    for (let i = 0; i < nextItems.length; i++) {
      createTickNode(nextItems[i].el, nextItems[i].preview, i)
    }
    window.requestAnimationFrame(() => {
      const isOverflow = railScroll.scrollHeight > railScroll.clientHeight
      rail.classList.toggle('overflowing', isOverflow)
      railScroll.classList.toggle('overflowing', isOverflow)
      syncThumb()
      updateCurrentTurn(true)
    })
  }
  let scrollTicking = false
  window.addEventListener(
    'scroll',
    () => {
      if (scrollTicking) return
      scrollTicking = true
      window.requestAnimationFrame(() => {
        updateCurrentTurn(false)
        scrollTicking = false
      })
    },
    { passive: true }
  )
  let railResizeRaf = 0
  window.addEventListener(
    'resize',
    () => {
      if (!rail.classList.contains('visible') || railResizeRaf) return
      railResizeRaf = window.requestAnimationFrame(() => {
        railResizeRaf = 0
        const isOverflow = railScroll.scrollHeight > railScroll.clientHeight
        rail.classList.toggle('overflowing', isOverflow)
        railScroll.classList.toggle('overflowing', isOverflow)
        syncThumb()
      })
    },
    { passive: true }
  )
  let tocTimer: number | undefined
  const burstTimers = new Set<number>()
  const scheduleToc = (delay = 180) => {
    if (tocTimer) window.clearTimeout(tocTimer)
    tocTimer = window.setTimeout(() => {
      refreshToc()
    }, delay)
  }
  const scheduleSyncBurst = (delays: number[]) => {
    for (const id of burstTimers) window.clearTimeout(id)
    burstTimers.clear()
    for (const d of delays) {
      const id = window.setTimeout(() => {
        burstTimers.delete(id)
        refreshToc()
      }, d)
      burstTimers.add(id)
    }
  }
  // Instant sync right after sending a message (Enter or Send button click)
  document.addEventListener(
    'keydown',
    (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        scheduleSyncBurst(Array(120, 500, 1300, 2600))
      }
    },
    true
  )
  document.addEventListener(
    'click',
    (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (
        target?.closest(
          '[data-xid="aim-mars-input-plate"] button, form button, [aria-label*="Envoyer"], [aria-label*="Send"]'
        )
      ) {
        scheduleSyncBurst(Array(150, 550, 1400, 2700))
      }
    },
    true
  )
  document.addEventListener(
    'contentvisibilityautostatechange',
    (ev: Event) => {
      const target = ev.target as HTMLElement | null
      if (target && target.getAttribute('data-scope-id') === 'turn') scheduleToc(120)
    },
    true
  )
  ;(window as unknown as { navigation?: EventTarget }).navigation?.addEventListener(
    'navigatesuccess',
    () => scheduleToc(250)
  )
  window.addEventListener('popstate', () => scheduleToc(200))
  window.addEventListener('load', () => scheduleToc(200), { once: true })
  window.setTimeout(() => refreshToc(), 800)
  window.setTimeout(() => refreshToc(), 2200)
  scheduleToc(100)
}
