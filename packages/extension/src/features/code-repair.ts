import { franc } from 'franc-min'
import { reconstructStructuralIndentation, renderHighlightedTail } from './code-highlight'
import { t } from '@lingui/core/macro'
import '../i18n'
import { createLucideIcon } from './icons'
import { UI_COLORS, UI_FONT_MONO, UI_FONT_SANS, UI_RADII, UI_SHADOWS } from './ui-tokens'

const TRUNCATION_MIN_CHARS = 3500
const BT1 = String.fromCharCode(96)

export interface RepairedCodeRecord {
  code: string
  engine: string
  lang: string
}

const repairedCodeByContainer = new WeakMap<HTMLElement, RepairedCodeRecord>()

export function getRepairedCodeForContainer(
  container: HTMLElement
): RepairedCodeRecord | undefined {
  return repairedCodeByContainer.get(container)
}

function detectSemanticLang(codeEl: HTMLElement, headerEl: HTMLElement | null): string {
  const m = (codeEl.className || '').match(/language-([a-zA-Z0-9_-]+)/i)
  const g1 = m ? m.slice(1, 2).find(Boolean) : undefined
  if (g1) return g1.toLowerCase()
  if (!headerEl) return ''
  let raw = ''
  for (let n = headerEl.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) raw += n.textContent || ''
    else if (
      n.nodeType === 1 &&
      !(n as Element).hasAttribute('data-vexel-ui') &&
      (n as Element).tagName !== 'BUTTON'
    ) {
      raw += n.textContent || ''
    }
  }
  const token = raw.trim().split(/\s+/).find(Boolean)?.toLowerCase() || ''
  return /^[a-z0-9_+-]{1,16}$/i.test(token) ? token : ''
}

function extractCleanSiblingCode(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'button, [data-amic], [data-vexel-ui], svg, style, script, [aria-hidden="true"]'
    )
    .forEach((node) => node.remove())
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')))
  for (const br of Array.from(clone.querySelectorAll('br'))) {
    br.replaceWith('\n')
  }
  return (clone.textContent || '').replace(/\u00a0/g, ' ').trim()
}

function hasUnclosedCodeDelimiter(code: string): boolean {
  const heredocMatches = Array.from(code.matchAll(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/g))
  for (const m of heredocMatches) {
    const [fullMatch, marker] = Array.from(m)
    if (!marker || !fullMatch) continue
    const startPos = (m.index ?? 0) + fullMatch.length
    const afterStart = code.slice(startPos)
    const closedRe = new RegExp(`(?:^|\n)\\s*${marker}\\s*(?:\n|$)`)
    if (!closedRe.test(afterStart)) return true
  }
  const tripleDouble = (code.match(/"""/g) || []).length
  if (tripleDouble % 2 === 1) return true
  const tripleSingle = (code.match(/'''/g) || []).length
  if (tripleSingle % 2 === 1) return true
  let braceBalance = 0
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '{' || ch === '[') braceBalance += 1
    else if (ch === '}' || ch === ']') braceBalance -= 1
  }
  let unescapedBackticks = 0
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === '`' && (i === 0 || code[i - 1] !== '\\')) {
      unescapedBackticks += 1
    }
  }
  if (unescapedBackticks % 2 === 1) return true
  return braceBalance >= 1
}

function looksLikeCodeFragment(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  let hits = 0
  let codeLines = 0
  let commentLines = 0
  for (const line of lines) {
    if (/^(?:\/\/|#|\/\*|\*(?:\/|$|\s)|--(?:\s|$))/.test(line)) {
      commentLines += 1
      continue
    }
    codeLines += 1
    if (
      /^(?:if|else|for|while|switch|case|return|const|let|var|function|async|await|class|interface|type|enum|export|import|try|catch|finally|throw|new|readonly|public|private|protected|static|abstract|override|declare|namespace|module|this\.|self\.|def|fn|pub|struct|impl|match|func|package)\b/.test(
        line
      ) ||
      /[{};=]$/.test(line) ||
      /^\}[;,]?$/.test(line) ||
      /^[a-zA-Z_$][a-zA-Z0-9_$.]*\s*\(/.test(line) ||
      /^[a-zA-Z_$][a-zA-Z0-9_$?]*\s*:\s*\S+/.test(line) ||
      /^@[a-zA-Z_][a-zA-Z0-9_.]*/.test(line) ||
      /^[a-zA-Z_][a-zA-Z0-9_.,[\]]*\s*(?:\+=|-=|\*=|\/=|=)\s*[^=]/.test(line)
    ) {
      hits += 1
    }
  }
  if (codeLines === 0) return commentLines > 0
  if (lines.length === 1 && /:\s*$/.test(lines[0])) return false
  return hits / codeLines >= 0.45
}

function isPoisonedMarkdownCodeBlock(card: Element): boolean {
  const pre = card.querySelector('pre')
  const code = pre?.querySelector('code')
  if (!pre || !code) return false
  if (
    (code.textContent || '').includes(String.fromCharCode(60) + 'FollowUp>') ||
    Boolean(code.querySelector('followup'))
  )
    return true
  const hasHeader = Boolean(
    pre.parentElement && pre.parentElement !== card && pre.parentElement.previousElementSibling
  )
  if (hasHeader) return false
  const txt = (code.textContent || '').trim()
  if (!txt) return false
  if (txt.includes('<FollowUp>') && txt.includes('</FollowUp>')) {
    const stripped = txt.split('<FollowUp>').join(' ').split('</FollowUp>').join(' ').trim()
    if (!stripped || !looksLikeCodeFragment(stripped)) return true
  }
  return false
}

export const reconstructIndentation = reconstructStructuralIndentation

function isGoogleLegalFooterNode(el: HTMLElement): boolean {
  if (el.querySelector('a[href*="support.google.com"], a[href*="policies.google.com"]')) return true
  const txt = (el.textContent || '').trim()
  return (
    /^Les réponses de l['’]IA peuvent contenir des erreurs/i.test(txt) ||
    /^AI responses may include mistakes/i.test(txt)
  )
}

function isNaturalLanguageProseBlock(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const openFollowUp = String.fromCharCode(60) + 'FollowUp>'
  if (trimmed.includes(openFollowUp)) return true
  const firstLine = (trimmed.split(/\r?\n/).find((l) => l.trim().length > 0) || '').trim()
  if (!firstLine) return false
  if (
    /^(?:[{}()[\];#<>/\\$@]|import\b|from\b|export\b|const\b|let\b|var\b|function\b|def\b|class\b|for\b|while\b|if\b|elif\b|else\b|return\b|cat\b|pnpm\b|npm\b|yarn\b|node\b|python3?\b|git\b|cd\b|rm\b|mkdir\b|EOF\b|["'`])/.test(
      firstLine
    )
  ) {
    return false
  }
  const words = firstLine.split(/\s+/).filter(Boolean)
  if (words.length < 4) return false
  // Strip inline code spans / paths before trigram natural-language detection
  const proseCandidate = firstLine
    .replace(/`[^`]+`/g, ' ')
    .replace(/(?:\.?\/)?[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const detectedLang =
    proseCandidate.length >= 18 ? franc(proseCandidate, { minLength: 10 }) : 'und'
  const isNaturalLang = detectedLang !== 'und'
  const startsCapitalizedSentence = /^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+/.test(firstLine)
  const isLeadInColonSentence =
    startsCapitalizedSentence &&
    words.length >= 3 &&
    firstLine.endsWith(':') &&
    !/[={};()]/.test(firstLine)
  return (
    isLeadInColonSentence || (startsCapitalizedSentence && (isNaturalLang || words.length >= 6))
  )
}

function formatWithBridge(
  code: string,
  lang: string,
  filenameHint?: string
): Promise<{ formatted: string; engine: string }> {
  return new Promise((resolve) => {
    let settled = false
    const done = (val: { formatted: string; engine: string }) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      resolve(val)
    }
    const timer = globalThis.setTimeout(() => done({ formatted: code, engine: 'fallback' }), 1500)
    try {
      const runtime = (
        globalThis as {
          chrome?: {
            runtime?: {
              lastError?: { message?: string }
              sendMessage?: (
                msg: unknown,
                cb: (res?: {
                  ok?: boolean
                  formatted?: string
                  engine?: string
                  data?: { formatted?: string; engine?: string }
                }) => void
              ) => void
            }
          }
        }
      ).chrome?.runtime
      if (!runtime?.sendMessage) {
        done({ formatted: code, engine: 'fallback' })
        return
      }
      runtime.sendMessage({ type: 'FORMAT_CODE', code, lang, filename: filenameHint }, (res) => {
        const err = runtime.lastError?.message
        const payload = res?.data ?? res
        if (!err && res?.ok && typeof payload?.formatted === 'string') {
          done({ formatted: payload.formatted, engine: String(payload.engine || 'bridge') })
        } else {
          done({ formatted: code, engine: 'fallback' })
        }
      })
    } catch {
      done({ formatted: code, engine: 'fallback' })
    }
  })
}

function mountFormatStatusPill(headerEl: HTMLElement, engine: string): void {
  const engineLabel = !engine || engine === 'fallback' ? 'local' : engine
  const nextLabel = `${t`Repaired`} · ${engineLabel}`
  const existing = headerEl.querySelector<HTMLElement>('[data-vexel-format-badge="true"]')
  if (existing?.shadowRoot) {
    const labelSpan = existing.shadowRoot.querySelector('[data-vexel-pill-label="true"]')
    if (labelSpan) labelSpan.textContent = nextLabel
    return
  }

  const host = document.createElement('span')
  host.setAttribute('data-vexel-ui', 'true')
  host.setAttribute('data-vexel-format-badge', 'true')
  Object.assign(host.style, {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '8px',
    verticalAlign: 'middle',
  })

  const shadow = host.attachShadow({ mode: 'open' })
  const pill = document.createElement('span')
  const labelText = nextLabel
  pill.title = t`Truncated code block automatically reassembled and formatted by Vexel`
  Object.assign(pill.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    height: '22px',
    padding: '0 9px',
    borderRadius: UI_RADII.pill,
    backgroundColor: UI_COLORS.primarySoft,
    border: `1px solid ${UI_COLORS.primaryBorder}`,
    color: UI_COLORS.primaryText,
    fontFamily: UI_FONT_SANS,
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    lineHeight: '1',
    userSelect: 'none',
  })

  const labelSpan = document.createElement('span')
  labelSpan.setAttribute('data-vexel-pill-label', 'true')
  labelSpan.textContent = labelText
  pill.append(createLucideIcon('sparkles', 11, 'currentColor'), labelSpan)
  shadow.appendChild(pill)

  const saveHost = headerEl.querySelector('[data-vexel-ui="true"]')
  if (saveHost) headerEl.insertBefore(host, saveHost)
  else headerEl.appendChild(host)
}

function extractRawMarkdownFromPoisonedCard(card: Element): string {
  const pre = card.querySelector('pre')
  if (!pre) return ''
  const rawTxt = pre.textContent || ''
  if (rawTxt.includes(String.fromCharCode(60) + 'FollowUp>')) return rawTxt
  const html = pre.innerHTML
    .replace(/<\/?code[^>]*>/gi, '')
    .replace(/&lt;(\/?FollowUp)&gt;/gi, (_m, tag) => String.fromCharCode(60) + tag + '>')
    .replace(/<\/?followup[^>]*>/gi, (m) =>
      m.startsWith('</')
        ? String.fromCharCode(60, 47) + 'FollowUp>'
        : String.fromCharCode(60) + 'FollowUp>'
    )
  if (html.includes(String.fromCharCode(60) + 'FollowUp>')) return html
  return rawTxt
}

function extractFollowUpBlocks(rawMarkdown: string): {
  cleaned: string
  suggestions: string[]
} {
  const suggestions: string[] = []
  const extraMarkdownParts: string[] = []
  const normalized = rawMarkdown.replace(
    /&lt;(\/?FollowUp)&gt;/gi,
    (_m, tag) => String.fromCharCode(60) + tag + '>'
  )
  const blockRe = new RegExp(
    String.fromCharCode(60) + 'FollowUp>([\\s\\S]*?)' + String.fromCharCode(60, 47) + 'FollowUp>',
    'gi'
  )
  const rest = normalized.replace(blockRe, (_full, innerRaw: string) => {
    const rawInner = String(innerRaw || '').trim()
    const innerLines = rawInner
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const bulletLines = innerLines.filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
    const singleLine = innerLines.length === 1 ? innerLines.find(Boolean) || '' : ''
    const isShortPrompt =
      singleLine.length > 0 &&
      singleLine.length <= 80 &&
      !/,\s+(?:puis|then|and then|et je|so I)\b/i.test(singleLine)
    const candidateChips = bulletLines.length > 0 ? bulletLines : isShortPrompt ? innerLines : []
    if (candidateChips.length > 0) {
      extraMarkdownParts.push(innerLines.join('\n'))
      for (const b of candidateChips) {
        const cleanChip = b
          .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
          .replace(/\*\*/g, '')
          .replace(/`([^`]+)`/g, '$1')
          .trim()
        if (
          cleanChip &&
          cleanChip.length <= 95 &&
          !/,\s+(?:puis|then|and then|et je|so I)\b/i.test(cleanChip)
        ) {
          suggestions.push(cleanChip)
        }
      }
    } else if (rawInner) {
      extraMarkdownParts.push(rawInner)
    }
    return '\n'
  })
  const combinedMd = [rest.trim(), ...extraMarkdownParts].filter(Boolean).join('\n\n')
  return { cleaned: combinedMd, suggestions }
}

function renderCleanFollowUpCard(
  host: Element,
  rawMarkdown: string,
  showToast: (msg: string) => void
): void {
  const { cleaned: cleanedMd, suggestions } = extractFollowUpBlocks(rawMarkdown)
  const cleanHost = document.createElement('div')
  cleanHost.setAttribute('data-vexel-repaired-followup', 'true')
  cleanHost.setAttribute('data-vexel-ui', 'true')
  const shadow = cleanHost.attachShadow({ mode: 'open' })

  const card = document.createElement('div')
  Object.assign(card.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '10px 0',
    padding: '14px 16px',
    borderRadius: UI_RADII.card,
    backgroundColor: UI_COLORS.surfaceSubtle,
    border: `1px solid ${UI_COLORS.borderSubtle}`,
    color: UI_COLORS.text,
    fontFamily: UI_FONT_SANS,
    fontSize: '14px',
    lineHeight: '1.58',
  })

  const appendInline = (target: HTMLElement, text: string) => {
    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g
    let lastIdx = 0
    for (const match of text.matchAll(tokenRegex)) {
      const idx = match.index ?? 0
      if (idx > lastIdx) target.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
      const token = match.find(Boolean) || ''
      if (token.startsWith('**') && token.endsWith('**')) {
        const strong = document.createElement('strong')
        strong.style.fontWeight = '600'
        strong.textContent = token.slice(2, -2)
        target.appendChild(strong)
      } else if (token.startsWith(BT1) && token.endsWith(BT1)) {
        const code = document.createElement('code')
        Object.assign(code.style, {
          fontFamily: UI_FONT_MONO,
          fontSize: '12.5px',
          padding: '1px 5px',
          borderRadius: '4px',
          backgroundColor: UI_COLORS.surfaceHover,
          border: `1px solid ${UI_COLORS.borderSubtle}`,
        })
        code.textContent = token.slice(1, -1)
        target.appendChild(code)
      }
      lastIdx = idx + token.length
    }
    if (lastIdx < text.length) target.appendChild(document.createTextNode(text.slice(lastIdx)))
  }

  let activeList: HTMLUListElement | null = null
  for (const rawLine of cleanedMd.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      activeList = null
      continue
    }
    const hMatch = line.match(/^#{1,4}\s+(.*)$/)
    if (hMatch) {
      activeList = null
      const h = document.createElement('div')
      Object.assign(h.style, {
        fontSize: '15px',
        fontWeight: '600',
        color: UI_COLORS.text,
        letterSpacing: '-0.01em',
      })
      appendInline(h, hMatch.slice(1, 2).find(Boolean) || '')
      card.appendChild(h)
      continue
    }
    const bMatch = line.match(/^[-*]\s+(.*)$/)
    if (bMatch) {
      if (!activeList) {
        activeList = document.createElement('ul')
        Object.assign(activeList.style, {
          margin: '0',
          paddingLeft: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        })
        card.appendChild(activeList)
      }
      const li = document.createElement('li')
      appendInline(li, bMatch.slice(1, 2).find(Boolean) || '')
      activeList.appendChild(li)
      continue
    }
    activeList = null
    const p = document.createElement('p')
    Object.assign(p.style, {
      margin: '0',
      color: UI_COLORS.text,
      fontSize: '14px',
      lineHeight: '1.58',
    })
    appendInline(p, line)
    card.appendChild(p)
  }

  if (suggestions.length > 0) {
    const chipsWrap = document.createElement('div')
    Object.assign(chipsWrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      paddingTop: '4px',
    })
    for (const suggestion of suggestions) {
      const chip = document.createElement('button')
      chip.type = 'button'
      Object.assign(chip.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: UI_RADII.pill,
        border: `1px solid ${UI_COLORS.border}`,
        backgroundColor: UI_COLORS.surface,
        color: UI_COLORS.text,
        fontFamily: UI_FONT_SANS,
        fontSize: '12.5px',
        fontWeight: '500',
        cursor: 'pointer',
        boxShadow: UI_SHADOWS.subtle,
      })
      chip.textContent = suggestion
      chip.addEventListener('click', () => {
        const isVisible = (el: HTMLElement): boolean =>
          el.getClientRects().length > 0 && window.getComputedStyle(el).visibility !== 'hidden'
        const plate = document.querySelector<HTMLElement>('[data-xid="aim-mars-input-plate"]')
        const scopedRoot: ParentNode =
          plate || document.querySelector('form[role="search"]') || document
        const scopedInputs = Array.from(
          scopedRoot.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]')
        ).filter((el) => !el.closest('[data-vexel-ui]') && isVisible(el))
        const fallbackInputs = Array.from(
          document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]')
        ).filter((el) => !el.closest('[data-vexel-ui], [role="dialog"]') && isVisible(el))
        const target =
          scopedInputs.slice(-1).find(Boolean) ||
          fallbackInputs.slice(-1).find(Boolean) ||
          document.querySelector<HTMLElement>('textarea, [contenteditable="true"]')
        if (target) {
          target.focus()
          if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
            target.value = suggestion
            target.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            target.textContent = suggestion
            target.dispatchEvent(new Event('input', { bubbles: true }))
          }
          showToast('Follow-up inserted')
        }
      })
      chipsWrap.appendChild(chip)
    }
    card.appendChild(chipsWrap)
  }

  cleanHost.dataset.vexelCleanMarkdown = rawMarkdown
  shadow.appendChild(card)
  host.replaceWith(cleanHost)
}

function bindNativeCopyOverride(codeCard: Element, showToast: (msg: string) => void): void {
  if (codeCard.getAttribute('data-vexel-copy-bound') === '1') return
  codeCard.setAttribute('data-vexel-copy-bound', '1')
  codeCard.addEventListener(
    'click',
    (ev) => {
      const copyBtn = (ev.target as HTMLElement | null)?.closest('button')
      if (!copyBtn) return
      const aria = (copyBtn.getAttribute('aria-label') || '').toLowerCase()
      if (!aria.includes('copier') && !aria.includes('copy')) return
      const record = repairedCodeByContainer.get(codeCard as HTMLElement)
      if (!record) return
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(record.code).catch(() => {})
      }
      showToast(t`Copied repaired & formatted code (${record.engine})`)
    },
    true
  )
}

async function repairBrokenSequenceFromCodeCard(
  codeCard: Element,
  showToast: (msg: string) => void
): Promise<void> {
  const pre = codeCard.querySelector('pre')
  const codeEl = pre?.querySelector('code')
  if (!pre || !codeEl) return

  const existingTailEl = codeEl.querySelector<HTMLElement>('[data-vexel-repaired-tail="true"]')
  const previousTail = existingTailEl ? (existingTailEl.textContent || '').replace(/^\n/, '') : ''
  const codeClone = codeEl.cloneNode(true) as HTMLElement
  codeClone.querySelector('[data-vexel-repaired-tail="true"]')?.remove()
  const headCode = (codeClone.textContent || '').replace(/\n$/, '')
  if (headCode.length < TRUNCATION_MIN_CHARS && !hasUnclosedCodeDelimiter(headCode)) return

  let anchorBlock: Element = codeCard
  while (
    !anchorBlock.nextElementSibling &&
    anchorBlock.parentElement &&
    !anchorBlock.parentElement.matches(
      '[data-scope-id="turn"], [jsname="CS7uPe"], [data-subtree="aimc"], main, body'
    ) &&
    anchorBlock.parentElement.querySelectorAll('pre code').length === 1
  ) {
    anchorBlock = anchorBlock.parentElement
  }

  const turnRoot =
    anchorBlock.closest('[data-scope-id="turn"], [jsname="CS7uPe"]') ||
    anchorBlock.parentElement ||
    document.body

  const spilledSiblings: ChildNode[] = []
  const spilledChunks: string[] = []
  let poisonedHost: HTMLElement | null = null
  let poisonedRawMarkdown = ''

  const candidateNodes: ChildNode[] = []
  let seenAnchor = false
  const collectFollowing = (rootNode: Node): void => {
    if (rootNode === anchorBlock) {
      seenAnchor = true
      return
    }
    if (
      rootNode instanceof HTMLElement &&
      (rootNode.hasAttribute('data-vexel-ui') || isGoogleLegalFooterNode(rootNode))
    )
      return
    if (seenAnchor) {
      if (rootNode instanceof Text) {
        const parentEl = rootNode.parentElement
        if (parentEl && !parentEl.closest('[data-sfc-cp], [data-vexel-ui], pre, code')) {
          const txt = (rootNode.textContent || '').replace(/\u00a0/g, ' ').trim()
          if (txt) candidateNodes.push(rootNode)
        }
        return
      }
      if (rootNode instanceof HTMLElement) {
        if (
          rootNode.hasAttribute('data-sfc-cp') ||
          (rootNode.querySelector('pre code') !== null &&
            (rootNode.matches('[data-hveid]') || isPoisonedMarkdownCodeBlock(rootNode)))
        ) {
          candidateNodes.push(rootNode)
          return
        }
      }
    }
    for (let child = rootNode.firstChild; child; child = child.nextSibling) {
      collectFollowing(child)
    }
  }
  collectFollowing(turnRoot)

  for (const node of candidateNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const rawTextNode = (node.textContent || '').replace(/\u00a0/g, ' ').trim()
      if (!rawTextNode) continue
      const assembledSoFar = [headCode, previousTail, ...spilledChunks].filter(Boolean).join('\n')
      const stillOpen = hasUnclosedCodeDelimiter(assembledSoFar)
      if (!stillOpen && isNaturalLanguageProseBlock(rawTextNode)) {
        break
      }
      if (stillOpen || looksLikeCodeFragment(rawTextNode)) {
        spilledSiblings.push(node)
        spilledChunks.push(rawTextNode)
      } else {
        break
      }
      continue
    }

    if (!(node instanceof HTMLElement)) continue
    if (node.closest('[data-vexel-ui]')) continue

    if (!node.contains(anchorBlock) && node.querySelectorAll('pre code').length === 1) {
      if (isPoisonedMarkdownCodeBlock(node)) {
        poisonedHost = node
        poisonedRawMarkdown = extractRawMarkdownFromPoisonedCard(node)
        break
      }
      const assembledSoFar = [headCode, previousTail, ...spilledChunks].filter(Boolean).join('\n')
      const secPre = node.querySelector('pre code')
      const secText = (secPre?.textContent || '').replace(/\n$/, '')
      if (
        (spilledChunks.length > 0 || hasUnclosedCodeDelimiter(assembledSoFar)) &&
        secText.trim().length > 0
      ) {
        spilledSiblings.push(node)
        spilledChunks.push(secText)
        continue
      }
      break
    }

    if (node.hasAttribute('data-sfc-cp')) {
      if (isGoogleLegalFooterNode(node)) break
      const cleaned = extractCleanSiblingCode(node)
      if (!cleaned) continue
      const assembledSoFar = [headCode, previousTail, ...spilledChunks].filter(Boolean).join('\n')
      const stillOpen = hasUnclosedCodeDelimiter(assembledSoFar)
      const isNaturalIntroColon =
        /^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+(?:\s+[a-zàâäéèêëîïôöùûüçA-Z0-9_-]+){2,}:$/.test(
          cleaned
        )
      if ((!stillOpen && isNaturalLanguageProseBlock(cleaned)) || isNaturalIntroColon) {
        break
      }
      if (
        !stillOpen &&
        spilledChunks.length === 0 &&
        /^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+(?:s+[a-zàâäéèêëîïôöùûüçA-Z0-9_-]+){2,}:$/.test(
          cleaned
        )
      ) {
        break
      }
      if (stillOpen || looksLikeCodeFragment(cleaned)) {
        spilledSiblings.push(node)
        spilledChunks.push(cleaned)
      } else {
        break
      }
    }
  }
  if (spilledChunks.length === 0 && !poisonedHost) return
  codeCard.setAttribute('data-vexel-repaired', '1')
  const headerEl = (pre.parentElement?.previousElementSibling as HTMLElement | null) || null
  const lang = detectSemanticLang(codeEl, headerEl)
  const firstLine = (headCode.split('\n').find(() => true) || '').trim()
  const strippedComment = firstLine.replace(/^(?:\/\/|#|\/\*|<!--)\s*(?:file:\s*)?/i, '')
  const candidateToken = strippedComment.split(/\s+/).find(Boolean) || ''
  const filenameHint = /^[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+$/.test(candidateToken)
    ? candidateToken
    : undefined
  const combinedTailRaw = [previousTail, ...spilledChunks].filter(Boolean).join('\n')
  const reindented =
    combinedTailRaw.length > 0 ? reconstructIndentation(headCode, combinedTailRaw, lang) : headCode
  const { formatted, engine } = await formatWithBridge(reindented, lang, filenameHint)
  if (spilledSiblings.length > 0) {
    for (const sib of spilledSiblings) sib.remove()
    const headLinesCount = headCode.split('\n').length
    const formattedLines = formatted.split('\n')
    const formattedTail = formattedLines.slice(headLinesCount).join('\n')
    if (formattedTail.trim()) {
      const tailSpan = existingTailEl || document.createElement('span')
      tailSpan.setAttribute('data-vexel-repaired-tail', 'true')
      tailSpan.style.whiteSpace = 'pre'
      renderHighlightedTail(tailSpan, formattedTail, lang)
      if (!existingTailEl) codeEl.appendChild(tailSpan)
    }
  }
  repairedCodeByContainer.set(codeCard as HTMLElement, { code: formatted, engine, lang })
  bindNativeCopyOverride(codeCard, showToast)
  if (headerEl) mountFormatStatusPill(headerEl, engine)
  if (poisonedHost && poisonedHost.parentNode && poisonedRawMarkdown.trim()) {
    renderCleanFollowUpCard(poisonedHost, poisonedRawMarkdown, showToast)
  }
}
export function scanAndRepairCodeBlocks(root: ParentNode, showToast: (msg: string) => void): void {
  const cardSet = new Set<Element>(Array.from(root.querySelectorAll('[data-hveid]')))
  for (const codeNode of Array.from(root.querySelectorAll('pre code'))) {
    const cardContainer =
      codeNode.closest('[data-hveid], [data-sfc-cp]') ||
      codeNode.closest('pre')?.parentElement?.parentElement ||
      codeNode.closest('pre')?.parentElement
    if (cardContainer) cardSet.add(cardContainer)
  }
  const candidates = Array.from(cardSet)

  // Pass 1: repair truncated / broken code cards (which may absorb & clean trailing poisoned FollowUp blocks)
  for (const card of candidates) {
    if (!card.isConnected || card.hasAttribute('data-vexel-repaired')) continue
    if (isPoisonedMarkdownCodeBlock(card)) continue
    if (!card.querySelector('pre code')) continue
    void repairBrokenSequenceFromCodeCard(card, showToast)
  }

  // Pass 2: clean any standalone poisoned markdown/FollowUp blocks not attached to a preceding code card
  for (const card of candidates) {
    if (!card.isConnected || card.hasAttribute('data-vexel-repaired')) continue
    if (!isPoisonedMarkdownCodeBlock(card)) continue
    const outerHost =
      card.parentElement &&
      card.parentElement.children.length === 1 &&
      !card.parentElement.hasAttribute('data-container-id')
        ? card.parentElement
        : card
    const rawMd = extractRawMarkdownFromPoisonedCard(card)
    if (rawMd.trim()) {
      card.setAttribute('data-vexel-repaired', '1')
      renderCleanFollowUpCard(outerHost, rawMd, showToast)
    }
  }
}

export function initCodeRepair(showToast: (msg: string) => void): void {
  let scanTimer: number | undefined
  const scheduleScan = () => {
    if (scanTimer) window.clearTimeout(scanTimer)
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined
      scanAndRepairCodeBlocks(document, showToast)
    }, 320)
  }
  document.addEventListener('aimRenderComplete', scheduleScan, true)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (let i = 0; i < m.addedNodes.length; i += 1) {
        const node = m.addedNodes[i]
        if (node.nodeType === 1 && !(node as Element).hasAttribute('data-vexel-ui')) {
          scheduleScan()
          return
        }
      }
    }
  })
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleScan()
  }
}
