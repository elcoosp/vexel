import { franc } from 'franc-min'
import {
  clearErrorLineHighlight,
  highlightErrorLineInCodeBlock,
  reconstructStructuralIndentation,
  renderHighlightedTail,
} from './code-highlight'
import { t } from '@lingui/core/macro'
import '../i18n'
import { createLucideIcon } from './icons'
import { UI_COLORS, UI_FONT_MONO, UI_FONT_SANS, UI_RADII, UI_SHADOWS } from './ui-tokens'

const TRUNCATION_MIN_CHARS = 3500
const BT1 = String.fromCharCode(96)

export type BridgeFormatStatus = 'formatted' | 'syntax_error' | 'unavailable' | 'timeout' | 'empty'

export interface BridgeFormatDiagnostic {
  tool: string
  line?: number
  column?: number
  message: string
}

export interface BridgeFormatPayload {
  formatted: string
  engine: string
  status: BridgeFormatStatus
  diagnostic?: BridgeFormatDiagnostic
}

export interface RepairedCodeRecord {
  code: string
  engine: string
  lang: string
  durationMs: number
  status: BridgeFormatStatus
  diagnostic?: BridgeFormatDiagnostic
}

const repairedCodeByContainer = new WeakMap<HTMLElement, RepairedCodeRecord>()
const inFlightCards = new WeakSet<Element>()
interface CardTopology {
  pre: HTMLPreElement
  codeEl: HTMLElement
  anchorBlock: Element
  turnRoot: Element
}
const scannedCardSignatures = new WeakMap<Element, string>()
const cardTopologyCache = new WeakMap<Element, CardTopology>()

function markCardFinal(codeCard: Element, pre?: Element | null): void {
  codeCard.setAttribute('data-vexel-repaired-final', '1')
  const preEl = pre || codeCard.querySelector('pre')
  if (preEl) preEl.setAttribute('data-vexel-final-pre', '1')
}

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

const NON_CODE_ELEMENT_TAGS = new Set([
  'STYLE',
  'SCRIPT',
  'NOSCRIPT',
  'TEMPLATE',
  'LINK',
  'META',
  'SVG',
])

function extractCleanSiblingCode(el: HTMLElement, lang = ''): string {
  if (NON_CODE_ELEMENT_TAGS.has(el.tagName.toUpperCase())) return ''
  const clone = el.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'button, [data-amic], [data-vexel-ui], svg, style, script, [aria-hidden="true"]'
    )
    .forEach((node) => node.remove())
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')))
  if (lang === 'python' || lang === 'py') {
    for (const strongNode of Array.from(clone.querySelectorAll('strong, b'))) {
      const inner = (strongNode.textContent || '').trim()
      if (/^[a-zA-Z0-9_]+$/.test(inner)) {
        strongNode.replaceWith(document.createTextNode('__' + inner + '__'))
      }
    }
  }
  if (lang === 'python' || lang === 'py') {
    for (const strongNode of Array.from(clone.querySelectorAll('strong, b'))) {
      const inner = (strongNode.textContent || '').trim()
      if (/^[a-zA-Z0-9_]+$/.test(inner)) {
        strongNode.replaceWith(document.createTextNode('__' + inner + '__'))
      }
    }
  }
  for (const codeNode of Array.from(clone.querySelectorAll('code'))) {
    const inner = codeNode.textContent || ''
    codeNode.replaceWith(document.createTextNode(BT1 + inner + BT1))
  }
  let finalCode = (clone.textContent || '').replace(/\u00a0/g, ' ').trim()
  if (lang === 'sql') {
    finalCode = finalCode.replace(/^[\u2013\u2014]\s*/gm, '-- ')
  }
  if (lang === 'sql') {
    finalCode = finalCode.replace(/^[\u2013\u2014]\s*/gm, '-- ')
  }
  return finalCode
}

function hasUnclosedCodeDelimiter(code: string): boolean {
  const heredocMatches = Array.from(code.matchAll(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/g))
  for (const m of heredocMatches) {
    const [fullMatch, marker] = Array.from(m)
    if (!marker || !fullMatch) continue
    const startPos = (m.index ?? 0) + fullMatch.length
    const afterStart = code.slice(startPos)
    const closedRe = new RegExp('(?:^|\\n)\\s*' + marker + '\\s*(?:\\n|$)')
    if (!closedRe.test(afterStart)) return true
  }

  let braceBalance = 0
  let quote: '"' | "'" | '`' | '"""' | "'''" | null = null
  let rawRustHashes = -1
  let inLineComment = false
  let inBlockComment = false
  let unescapedBackticks = 0

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    const next = code[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (rawRustHashes >= 0) {
      if (ch === '"') {
        let hashes = 0
        while (code[i + 1 + hashes] === '#') hashes += 1
        if (hashes >= rawRustHashes) {
          i += rawRustHashes
          rawRustHashes = -1
        }
      }
      continue
    }
    if (quote) {
      if (quote === '"""' || quote === "'''") {
        if (code.slice(i, i + 3) === quote) {
          quote = null
          i += 2
        }
        continue
      }
      if (ch === '\\' && quote !== '`') {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (ch === '#' && (i === 0 || /\s/.test(code[i - 1]))) {
      inLineComment = true
      continue
    }
    if (
      (ch === 'r' || (ch === 'b' && next === 'r')) &&
      (i === 0 || !/[a-zA-Z0-9_]/.test(code[i - 1]))
    ) {
      let scan = ch === 'b' ? i + 2 : i + 1
      let hashes = 0
      while (code[scan] === '#') {
        hashes += 1
        scan += 1
      }
      if (code[scan] === '"') {
        rawRustHashes = hashes
        i = scan
        continue
      }
    }
    if (code.slice(i, i + 3) === '"""') {
      quote = '"""'
      i += 2
      continue
    }
    if (code.slice(i, i + 3) === "'''") {
      quote = "'''"
      i += 2
      continue
    }
    if (ch === '`') {
      unescapedBackticks += 1
      quote = '`'
      continue
    }
    if (ch === '"') {
      quote = '"'
      continue
    }
    if (ch === "'") {
      const nextNl = code.indexOf('\n', i + 1)
      const restOfLine = code.slice(i + 1, nextNl === -1 ? code.length : nextNl)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\b/.test(restOfLine) && !restOfLine.includes("'")) {
        continue
      }
      quote = "'"
      continue
    }
    if (ch === '{' || ch === '[') braceBalance += 1
    else if (ch === '}' || ch === ']') braceBalance -= 1
  }

  if (rawRustHashes >= 0 || quote === '"""' || quote === "'''") return true
  if (unescapedBackticks % 2 === 1) return true
  if (braceBalance >= 1) return true

  const nonEmptyLines = code
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trimEnd())
    .filter((l) => l.trim().length > 0)
  const lastCodeLine = nonEmptyLines[nonEmptyLines.length - 1] || ''
  if (
    /[,]\s*$/.test(lastCodeLine) ||
    /^\s*(?:async\s+def|def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*$/.test(
      lastCodeLine
    )
  ) {
    return true
  }

  return false
}

function looksLikeCodeFragment(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  if (
    /^(?:@[a-zA-Z_][a-zA-Z0-9_.]*|#\[(?:cfg|derive|allow|test|tokio|async_trait)|#(?:include|define|ifdef|ifndef|pragma)\b|(?:pub(?:\s*\([^)]*\))?\s+|public\s+|private\s+|protected\s+|internal\s+|final\s+|sealed\s+|abstract\s+|open\s+|override\s+|static\s+|async\s+|unsafe\s+|extern\s+(?:"[^"]*"\s+)?)*(?:fn|struct|enum|trait|impl|mod|type|const|static|macro_rules!|function|class|data\s+class|interface|protocol|extension|actor|object|namespace|template\s*<|typedef|export|import|from\s+\S+\s+import|def|func|package|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|TRIGGER)|SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\b)/.test(
      lines[0]
    ) ||
    /^(?:"""|'''|r#*["']|`|EOF)\s*(?:;|\)|\]|\})?\s*$/.test(lines[lines.length - 1])
  ) {
    return true
  }
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
      /^(?:if|elif|else|fi|then|for|while|do|done|case|esac|switch|return|const|let|var|function|async|await|class|interface|type|enum|export|import|from|try|catch|finally|throw|new|readonly|public|private|protected|static|abstract|override|declare|namespace|module|this\.|self\.|def|assert|print|raise|yield|del|pass|break|continue|global|nonlocal|fn|pub|struct|impl|match|func|package|WITH|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|DECLARE|RETURN|RETURNS|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|HAVING|LIMIT|VALUES|RETURNING|PARTITION|ROWS|RANGE|UNION|EXCEPT|INTERSECT|CASE|WHEN|THEN|END|set|unset|source|sudo|cd|mkdir|cp|mv|rm|chmod|chown|touch|ln|echo|printf|cat|grep|rg|sed|awk|find|xargs|curl|wget|git|cargo|rustc|rustup|pnpm|npm|yarn|npx|node|deno|bun|python3?|pip|uv|go|make|cmake|docker|kubectl|codesign|launchctl)\b/.test(
        line
      ) ||
      /^(?:--|\/\*)/.test(line) ||
      /^!\s*[a-zA-Z0-9_./-]+/.test(line) ||
      /^\(\s*\d+\s*,/.test(line) ||
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s+(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b/.test(
        line
      ) ||
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s+(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b/.test(
        line
      ) ||
      /[{};=]$/.test(line) ||
      line.endsWith(';') ||
      /^[\])}][;,]?$/.test(line) ||
      /^['"][^'"\n]*['"]\s*[,)\]]*$/.test(line) ||
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

function isSemanticHeadingElement(el: HTMLElement): boolean {
  return el.getAttribute('role') === 'heading' || /^H[1-6]$/.test(el.tagName)
}

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
  if (/^(?:--|–|—|\/\/|\/\*|#)/.test(trimmed)) return false
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
): Promise<BridgeFormatPayload> {
  return new Promise((resolve) => {
    let settled = false
    const fallbackResult: BridgeFormatPayload = {
      formatted: code,
      engine: 'fallback',
      status: 'unavailable',
    }
    const done = (val: BridgeFormatPayload) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      resolve(val)
    }
    const timer = globalThis.setTimeout(
      () => done({ formatted: code, engine: 'fallback', status: 'timeout' }),
      9000
    )
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
                  status?: BridgeFormatStatus
                  diagnostic?: BridgeFormatDiagnostic
                  data?: {
                    formatted?: string
                    engine?: string
                    status?: BridgeFormatStatus
                    diagnostic?: BridgeFormatDiagnostic
                  }
                }) => void
              ) => void
            }
          }
        }
      ).chrome?.runtime
      if (!runtime?.sendMessage) {
        done(fallbackResult)
        return
      }
      runtime.sendMessage({ type: 'FORMAT_CODE', code, lang, filename: filenameHint }, (res) => {
        const err = runtime.lastError?.message
        const payload = res?.data ?? res
        if (!err && res?.ok && typeof payload?.formatted === 'string') {
          const engine = String(payload.engine || 'bridge')
          const status: BridgeFormatStatus =
            payload.status || (engine === 'fallback' ? 'unavailable' : 'formatted')
          done({
            formatted: payload.formatted,
            engine,
            status,
            diagnostic: payload.diagnostic,
          })
        } else {
          done(fallbackResult)
        }
      })
    } catch {
      done(fallbackResult)
    }
  })
}

function scrollCodeBlockToLine(preEl: HTMLElement, lineNumber: number): void {
  const codeEl = preEl.querySelector('code') || preEl
  const totalLines = Math.max(1, (codeEl.textContent || '').split('\n').length)
  const clampedLine = Math.max(1, Math.min(totalLines, lineNumber))
  const computed = window.getComputedStyle(preEl)
  const parsedLineHeight = parseFloat(computed.lineHeight)
  const lineHeight =
    Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 20
  highlightErrorLineInCodeBlock(preEl, clampedLine, true)
  const targetOffset = Math.max(0, (clampedLine - 3) * lineHeight)
  if (preEl.scrollHeight > preEl.clientHeight + 4) {
    preEl.scrollTo({ top: targetOffset, behavior: 'smooth' })
  } else {
    const rect = preEl.getBoundingClientRect()
    const absTop = window.scrollY + rect.top + targetOffset - 120
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: Math.max(0, absTop), behavior: 'smooth' })
    }
  }
}

function mountFormatStatusPill(
  codeCard: Element,
  preEl: HTMLElement,
  headerEl: HTMLElement | null,
  record: RepairedCodeRecord,
  isFinalized: boolean
): void {
  const effectiveStatus: BridgeFormatStatus =
    record.status === 'syntax_error' && !isFinalized ? 'unavailable' : record.status
  const engineLabel = !record.engine || record.engine === 'fallback' ? 'local' : record.engine
  const durationMs = record.durationMs
  const lineSuffix =
    effectiveStatus === 'syntax_error' && record.diagnostic?.line
      ? ' · L' + String(record.diagnostic.line)
      : ''

  const nextLabel =
    effectiveStatus === 'syntax_error'
      ? t`Check syntax` + lineSuffix
      : effectiveStatus === 'formatted'
        ? t`Repaired` + ' · ' + engineLabel + ' · ' + String(durationMs) + ' ms'
        : t`Repaired` + ' · local · ' + String(durationMs) + ' ms'

  const palette =
    effectiveStatus === 'syntax_error'
      ? {
          bg: '#fef7e0',
          border: '#fde293',
          text: '#b06000',
          icon: 'alert-circle' as const,
          title: record.diagnostic
            ? record.diagnostic.tool + ': ' + record.diagnostic.message
            : t`Syntax issue detected by native formatter`,
        }
      : effectiveStatus === 'formatted'
        ? {
            bg: UI_COLORS.successSoft,
            border: UI_COLORS.successBorder,
            text: UI_COLORS.success,
            icon: 'check' as const,
            title: t`Reassembled and verified with ${engineLabel} (${durationMs} ms)`,
          }
        : {
            bg: UI_COLORS.primarySoft,
            border: UI_COLORS.primaryBorder,
            text: UI_COLORS.primaryText,
            icon: 'sparkles' as const,
            title: t`Reassembled from split blocks (no native syntax check available)`,
          }

  let host = codeCard.querySelector<HTMLElement>('[data-vexel-format-badge="true"]')
  if (!host) {
    const footerEl =
      Array.from(codeCard.querySelectorAll<HTMLElement>('div, footer, section')).find(
        (el) =>
          !el.hasAttribute('data-vexel-ui') &&
          !el.contains(preEl) &&
          !preEl.contains(el) &&
          el.querySelector('button:not([data-vexel-ui])') !== null &&
          Array.from(el.children).some(
            (child) =>
              child instanceof HTMLElement &&
              !child.hasAttribute('data-vexel-ui') &&
              child.querySelector('button') !== null
          )
      ) || null
    const copyWrapper = footerEl
      ? Array.from(footerEl.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            !child.hasAttribute('data-vexel-ui') &&
            Boolean(child.querySelector('button'))
        ) || null
      : null

    host = document.createElement('span')
    host.setAttribute('data-vexel-ui', 'true')
    host.setAttribute('data-vexel-format-badge', 'true')
    Object.assign(host.style, {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      flexShrink: '0',
      whiteSpace: 'nowrap',
      marginLeft: footerEl && copyWrapper ? 'auto' : '8px',
      marginRight: footerEl && copyWrapper ? '8px' : '0',
      verticalAlign: 'middle',
    })
    host.attachShadow({ mode: 'open' })

    if (footerEl && copyWrapper) {
      footerEl.insertBefore(host, copyWrapper)
    } else if (footerEl) {
      footerEl.appendChild(host)
    } else if (headerEl) {
      const saveHost = headerEl.querySelector('[data-vexel-ui="true"]')
      if (saveHost) headerEl.insertBefore(host, saveHost)
      else headerEl.appendChild(host)
    }
  }

  const shadow = host.shadowRoot
  if (!shadow) return
  shadow.replaceChildren()

  const pill = document.createElement('button')
  pill.type = 'button'
  pill.title = palette.title
  Object.assign(pill.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    height: '22px',
    padding: '0 9px',
    borderRadius: UI_RADII.pill,
    backgroundColor: palette.bg,
    border: '1px solid ' + palette.border,
    color: palette.text,
    fontFamily: UI_FONT_SANS,
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    flexShrink: '0',
    userSelect: 'none',
    cursor: effectiveStatus === 'syntax_error' ? 'pointer' : 'default',
  })

  const labelSpan = document.createElement('span')
  labelSpan.setAttribute('data-vexel-pill-label', 'true')
  labelSpan.style.whiteSpace = 'nowrap'
  labelSpan.textContent = nextLabel
  pill.append(createLucideIcon(palette.icon, 11, 'currentColor'), labelSpan)
  shadow.appendChild(pill)

  if (effectiveStatus === 'syntax_error' && record.diagnostic?.line) {
    highlightErrorLineInCodeBlock(preEl, record.diagnostic.line, false)
  } else {
    clearErrorLineHighlight(preEl)
  }

  const existingPortalId = host.getAttribute('data-vexel-popover-id')
  if (existingPortalId) {
    document.getElementById(existingPortalId)?.remove()
    host.removeAttribute('data-vexel-popover-id')
  }

  if (effectiveStatus === 'syntax_error' && record.diagnostic) {
    const diag = record.diagnostic
    const portalId = 'vexel-diag-portal-' + Math.random().toString(36).slice(2, 9)
    host.setAttribute('data-vexel-popover-id', portalId)

    const portalHost = document.createElement('div')
    portalHost.id = portalId
    portalHost.setAttribute('data-vexel-ui', 'true')
    portalHost.setAttribute('data-vexel-diag-portal', 'true')
    Object.assign(portalHost.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: '0px',
      height: '0px',
      zIndex: '2147483647',
      pointerEvents: 'none',
    })
    const portalShadow = portalHost.attachShadow({ mode: 'open' })
    ;(document.body || document.documentElement).appendChild(portalHost)

    const popover = document.createElement('div')
    popover.setAttribute('data-vexel-diag-popover', 'true')
    Object.assign(popover.style, {
      position: 'fixed',
      width: '310px',
      maxWidth: 'calc(100vw - 24px)',
      padding: '10px 12px',
      borderRadius: UI_RADII.row,
      backgroundColor: UI_COLORS.surface,
      border: '1px solid #fde293',
      boxShadow: UI_SHADOWS.floating,
      color: UI_COLORS.text,
      fontFamily: UI_FONT_SANS,
      fontSize: '12px',
      lineHeight: '1.45',
      whiteSpace: 'normal',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      display: 'none',
      flexDirection: 'column',
      gap: '6px',
    })

    const topRow = document.createElement('div')
    Object.assign(topRow.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      fontWeight: '600',
      fontSize: '11.5px',
      color: '#b06000',
    })
    const locLabel = diag.line
      ? diag.column
        ? diag.tool + ' · Line ' + String(diag.line) + ', Col ' + String(diag.column)
        : diag.tool + ' · Line ' + String(diag.line)
      : diag.tool + ' · Syntax error'
    const topTitle = document.createElement('span')
    topTitle.textContent = locLabel
    topRow.appendChild(topTitle)

    let pinned = false
    const hidePopover = () => {
      pinned = false
      popover.style.display = 'none'
    }

    const positionPopover = () => {
      if (!host || !host.isConnected) {
        portalHost.remove()
        return
      }
      const r = pill.getBoundingClientRect()
      const popWidth = Math.min(310, Math.max(220, window.innerWidth - 24))
      const leftPx = Math.max(12, Math.min(window.innerWidth - popWidth - 12, r.right - popWidth))
      popover.style.width = popWidth + 'px'
      popover.style.left = leftPx + 'px'
      if (r.top > 170) {
        popover.style.top = 'auto'
        popover.style.bottom = Math.max(12, window.innerHeight - r.top + 6) + 'px'
      } else {
        popover.style.bottom = 'auto'
        popover.style.top = Math.min(window.innerHeight - 140, r.bottom + 6) + 'px'
      }
    }

    const showPopover = () => {
      positionPopover()
      popover.style.display = 'flex'
    }

    if (diag.line) {
      const targetLine = diag.line
      const jumpBtn = document.createElement('button')
      jumpBtn.type = 'button'
      jumpBtn.textContent = t`Jump to line`
      Object.assign(jumpBtn.style, {
        border: '1px solid #fde293',
        backgroundColor: '#fef7e0',
        color: '#b06000',
        borderRadius: UI_RADII.chip,
        padding: '2px 7px',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        flexShrink: '0',
      })
      jumpBtn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        scrollCodeBlockToLine(preEl, targetLine)
        hidePopover()
      })
      topRow.appendChild(jumpBtn)
    }

    const msgEl = document.createElement('pre')
    msgEl.textContent = diag.message
    Object.assign(msgEl.style, {
      margin: '0',
      padding: '6px 8px',
      borderRadius: UI_RADII.chip,
      backgroundColor: UI_COLORS.surfaceSubtle,
      border: '1px solid ' + UI_COLORS.borderSubtle,
      fontFamily: UI_FONT_MONO,
      fontSize: '11px',
      lineHeight: '1.4',
      color: UI_COLORS.textSecondary,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: '140px',
      overflowY: 'auto',
    })

    popover.append(topRow, msgEl)
    portalShadow.appendChild(popover)

    pill.addEventListener('mouseenter', () => {
      showPopover()
    })
    pill.addEventListener('mouseleave', () => {
      if (!pinned) hidePopover()
    })
    popover.addEventListener('mouseenter', () => {
      showPopover()
    })
    popover.addEventListener('mouseleave', () => {
      if (!pinned) hidePopover()
    })
    pill.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      pinned = !pinned
      if (pinned) showPopover()
      else hidePopover()
    })
    document.addEventListener(
      'pointerdown',
      (ev) => {
        if (!pinned) return
        const path = ev.composedPath()
        if (!path.includes(pill) && !path.includes(popover)) {
          hidePopover()
        }
      },
      true
    )
    window.addEventListener(
      'scroll',
      () => {
        if (popover.style.display === 'flex') {
          if (pinned) positionPopover()
          else hidePopover()
        }
      },
      { passive: true, capture: true }
    )
  }
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
      if (record.status === 'syntax_error') {
        if (record.diagnostic?.line) {
          const errLine = record.diagnostic.line
          showToast(t`Copied with unverified syntax (Line ${errLine})`)
        } else {
          showToast(t`Copied with unverified syntax`)
        }
      } else {
        showToast(t`Copied repaired & formatted code (${record.engine})`)
      }
    },
    true
  )
}

function extractWizFullCodeFromCard(
  codeCard: Element,
  anchorBlock: Element
): { lang: string; fullCode: string } | null {
  const roots: Element[] = [codeCard]
  if (anchorBlock !== codeCard) roots.push(anchorBlock)
  if (anchorBlock.parentElement) roots.push(anchorBlock.parentElement)
  const visit = (node: Node): { lang: string; fullCode: string } | null => {
    if (node.nodeType === 8) {
      const val = node.nodeValue || ''
      if (val.startsWith('TgQPHd|||[[')) {
        try {
          const parsed = JSON.parse(val.slice('TgQPHd|||'.length))
          const first = Array.isArray(parsed) ? parsed.find(Array.isArray) : null
          const lang = typeof first?.[0] === 'string' ? first[0].toLowerCase() : ''
          const fullCode = typeof first?.[1] === 'string' ? first[1] : ''
          if (fullCode.length > 0) return { lang, fullCode }
        } catch {}
      }
      return null
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  for (const root of roots) {
    const found = visit(root)
    if (found) return found
  }
  return null
}

async function repairBrokenSequenceFromCodeCard(
  codeCard: Element,
  showToast: (msg: string) => void
): Promise<void> {
  if (inFlightCards.has(codeCard)) return
  let topo = cardTopologyCache.get(codeCard)
  if (!topo || !topo.pre.isConnected || !topo.codeEl.isConnected) {
    const pre = codeCard.querySelector('pre')
    const codeEl = pre?.querySelector('code')
    if (!pre || !codeEl) return
    let anchorBlock: Element = codeCard
    while (
      !anchorBlock.nextElementSibling &&
      anchorBlock.parentElement &&
      !anchorBlock.parentElement.matches(
        '[data-scope-id="turn"], [data-subtree="aimc"], main, body'
      ) &&
      anchorBlock.parentElement.querySelectorAll('pre code').length === 1
    ) {
      anchorBlock = anchorBlock.parentElement
    }
    const turnRoot =
      anchorBlock.closest('[data-scope-id="turn"]') || anchorBlock.parentElement || document.body
    topo = { pre, codeEl, anchorBlock, turnRoot }
    cardTopologyCache.set(codeCard, topo)
  }

  const { pre, codeEl, anchorBlock, turnRoot } = topo
  const isActivelyStreaming = Boolean(
    document.querySelector(
      'button[aria-label*="Stop" i], button[aria-label*="Arrêter" i], button[aria-label*="Interrompre" i]'
    )
  )
  const hasFollowingZzy = Array.from(
    (turnRoot.parentElement || turnRoot).querySelectorAll('[data-zzy="1"]')
  ).some((zzy) => Boolean(anchorBlock.compareDocumentPosition(zzy) & 4))
  const isTurnFinished =
    !isActivelyStreaming && (turnRoot.getAttribute('data-complete') === 'true' || hasFollowingZzy)

  const rawCodeLen = (codeEl.textContent || '').length
  let followingSibCount = 0
  let followingSibChars = 0
  let sigWalk: Element | null = anchorBlock
  while (sigWalk && sigWalk !== turnRoot) {
    for (let s = sigWalk.nextElementSibling; s; s = s.nextElementSibling) {
      if (s.hasAttribute('data-vexel-ui')) continue
      followingSibCount += 1
      followingSibChars += (s.textContent || '').length
    }
    sigWalk = sigWalk.parentElement
  }
  const cardSig =
    rawCodeLen +
    '|' +
    followingSibCount +
    ':' +
    followingSibChars +
    '|' +
    (isTurnFinished ? '1' : '0')
  if (scannedCardSignatures.get(codeCard) === cardSig) return
  scannedCardSignatures.set(codeCard, cardSig)

  inFlightCards.add(codeCard)
  const repairStartMs = performance.now()
  try {
    const existingTailEl = codeEl.querySelector<HTMLElement>('[data-vexel-repaired-tail="true"]')
    const previousTail = existingTailEl ? (existingTailEl.textContent || '').replace(/^\n/, '') : ''
    let headCode = ''
    if (existingTailEl) {
      const codeClone = codeEl.cloneNode(true) as HTMLElement
      codeClone.querySelector('[data-vexel-repaired-tail="true"]')?.remove()
      headCode = (codeClone.textContent || '').replace(/\n$/, '')
    } else {
      headCode = (codeEl.textContent || '').replace(/\n$/, '')
    }
    const headerEl =
      (pre.previousElementSibling as HTMLElement | null) ||
      (pre.parentElement && pre.parentElement !== codeCard
        ? (pre.parentElement.previousElementSibling as HTMLElement | null)
        : null)
    const detectedLang = detectSemanticLang(codeEl, headerEl)
    const wizPayload = extractWizFullCodeFromCard(codeCard, anchorBlock)
    const lang = detectedLang || wizPayload?.lang || ''
    const wizFullCode =
      wizPayload && wizPayload.fullCode.length > headCode.length + 12
        ? wizPayload.fullCode.replace(/\n$/, '')
        : ''
    const expectedSpillChars = wizFullCode ? Math.max(0, wizFullCode.length - headCode.length) : 0

    if (
      !wizFullCode &&
      headCode.length < TRUNCATION_MIN_CHARS &&
      !hasUnclosedCodeDelimiter(headCode)
    ) {
      if (isTurnFinished) markCardFinal(codeCard, pre)
      return
    }

    const spilledSiblings: ChildNode[] = []
    const spilledChunks: string[] = []
    let reachedTerminalBoundary = false
    let poisonedHost: HTMLElement | null = null
    let poisonedRawMarkdown = ''

    const candidateNodes: ChildNode[] = []
    const collectSubtreeNode = (node: ChildNode): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parentEl = node.parentElement
        if (parentEl && !parentEl.closest('[data-sfc-cp], [data-vexel-ui], pre, code')) {
          const txt = (node.textContent || '').replace(/\u00a0/g, ' ').trim()
          if (txt) candidateNodes.push(node)
        }
        return
      }
      if (!(node instanceof HTMLElement)) return
      if (NON_CODE_ELEMENT_TAGS.has(node.tagName.toUpperCase())) return
      if (node.hasAttribute('data-vexel-ui') || isGoogleLegalFooterNode(node)) return
      const isResponseChunkBlock =
        node.hasAttribute('data-sfc-cp') || node.parentElement === anchorBlock.parentElement
      if (
        isResponseChunkBlock ||
        (node.querySelector('pre code') !== null &&
          (node.matches('[data-hveid]') || isPoisonedMarkdownCodeBlock(node)))
      ) {
        candidateNodes.push(node)
        return
      }
      for (let child = node.firstChild; child; child = child.nextSibling) {
        collectSubtreeNode(child)
      }
    }

    let walkEl: Element | null = anchorBlock
    while (walkEl && walkEl !== turnRoot) {
      for (let sib = walkEl.nextSibling; sib; sib = sib.nextSibling) {
        collectSubtreeNode(sib)
      }
      walkEl = walkEl.parentElement
    }

    let absorbedChars = previousTail.length

    for (const node of candidateNodes) {
      const withinWizBudget = expectedSpillChars > 0 && absorbedChars < expectedSpillChars + 64
      if (node.nodeType === Node.TEXT_NODE) {
        const rawTextNode = (node.textContent || '').replace(/\u00a0/g, ' ').trim()
        if (!rawTextNode) continue
        const assembledSoFar = [headCode, previousTail, ...spilledChunks].filter(Boolean).join('\n')
        const stillOpen = hasUnclosedCodeDelimiter(assembledSoFar)
        if (isNaturalLanguageProseBlock(rawTextNode)) {
          break
        }
        if (withinWizBudget || stillOpen || looksLikeCodeFragment(rawTextNode)) {
          spilledSiblings.push(node)
          spilledChunks.push(rawTextNode)
          absorbedChars += rawTextNode.length + 1
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
          reachedTerminalBoundary = true
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

      if (node.hasAttribute('data-sfc-cp') || node.parentElement === anchorBlock.parentElement) {
        if (isGoogleLegalFooterNode(node)) {
          reachedTerminalBoundary = true
          break
        }
        const cleaned = extractCleanSiblingCode(node, lang)
        if (!cleaned) continue
        const assembledSoFar = [headCode, previousTail, ...spilledChunks].filter(Boolean).join('\n')
        const stillOpen = hasUnclosedCodeDelimiter(assembledSoFar)
        if ((stillOpen || withinWizBudget) && isSemanticHeadingElement(node)) {
          spilledSiblings.push(node)
          spilledChunks.push(`# ${cleaned}`)
          absorbedChars += cleaned.length + 3
          continue
        }
        const isNaturalIntroColon =
          /^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+(?:\s+[a-zàâäéèêëîïôöùûüçA-Z0-9_-]+){2,}:$/.test(
            cleaned
          )
        const isProse = isNaturalLanguageProseBlock(cleaned)

        if (isProse || (!withinWizBudget && isNaturalIntroColon)) {
          reachedTerminalBoundary = true
          break
        }
        if (
          !withinWizBudget &&
          !stillOpen &&
          spilledChunks.length === 0 &&
          /^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+(?:\s+[a-zàâäéèêëîïôöùûüçA-Z0-9_-]+){2,}:$/.test(
            cleaned
          )
        ) {
          break
        }
        const looksLike = looksLikeCodeFragment(cleaned)

        if (withinWizBudget || stillOpen || looksLike) {
          spilledSiblings.push(node)
          spilledChunks.push(cleaned)
          absorbedChars += cleaned.length + 1
        } else {
          break
        }
      }
    }
    if (spilledChunks.length === 0 && !wizFullCode && !poisonedHost) {
      if (isTurnFinished) markCardFinal(codeCard, pre)
      return
    }
    codeCard.setAttribute('data-vexel-repaired', '1')
    const firstLine = (headCode.split('\n').find(() => true) || '').trim()
    const strippedComment = firstLine.replace(/^(?:\/\/|#|\/\*|<!--)\s*(?:file:\s*)?/i, '')
    const candidateToken = strippedComment.split(/\s+/).find(Boolean) || ''
    const filenameHint = /^[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+$/.test(candidateToken)
      ? candidateToken
      : undefined
    const combinedTailRaw = [previousTail, ...spilledChunks].filter(Boolean).join('\n')
    const domAssembled =
      combinedTailRaw.length > 0
        ? reconstructIndentation(headCode, combinedTailRaw, lang)
        : headCode
    const reindented =
      wizFullCode && wizFullCode.length >= domAssembled.length ? wizFullCode : domAssembled
    const { formatted, engine, status, diagnostic } = await formatWithBridge(
      reindented,
      lang,
      filenameHint
    )
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
        if (status === 'syntax_error' && diagnostic?.line && isTurnFinished) {
          highlightErrorLineInCodeBlock(pre, diagnostic.line, false)
        }
      } else {
        codeEl.style.whiteSpace = 'pre'
        renderHighlightedTail(codeEl, formatted, lang)
      }
    }
    const postNextSib = anchorBlock.nextElementSibling
    const postNextSig = postNextSib
      ? `${postNextSib.tagName}:${postNextSib.className}:${(postNextSib.textContent || '').length}`
      : 'none'
    scannedCardSignatures.set(
      codeCard,
      `${(codeEl.textContent || '').length}|${postNextSig}|${isTurnFinished ? '1' : '0'}`
    )
    const stillUnclosed = hasUnclosedCodeDelimiter(formatted)
    if (reachedTerminalBoundary || (isTurnFinished && !stillUnclosed)) {
      codeCard.setAttribute('data-vexel-repaired-final', '1')
      pre.setAttribute('data-vexel-final-pre', '1')
    }
    const isFinalized = Boolean(reachedTerminalBoundary || (isTurnFinished && !stillUnclosed))
    const durationMs = Math.max(1, Math.round(performance.now() - repairStartMs))
    const record: RepairedCodeRecord = {
      code: formatted,
      engine,
      lang,
      durationMs,
      status,
      diagnostic,
    }
    repairedCodeByContainer.set(codeCard as HTMLElement, record)
    bindNativeCopyOverride(codeCard, showToast)
    mountFormatStatusPill(codeCard, pre, headerEl, record, isFinalized)
    if (poisonedHost && poisonedHost.parentNode && poisonedRawMarkdown.trim()) {
      renderCleanFollowUpCard(poisonedHost, poisonedRawMarkdown, showToast)
    }
  } catch {
  } finally {
    inFlightCards.delete(codeCard)
    if (codeCard.isConnected && !codeCard.hasAttribute('data-vexel-repaired-final')) {
      let postSibCount = 0
      let postSibChars = 0
      let w: Element | null = anchorBlock
      while (w && w !== turnRoot) {
        for (let s = w.nextElementSibling; s; s = s.nextElementSibling) {
          if (s.hasAttribute('data-vexel-ui')) continue
          postSibCount += 1
          postSibChars += (s.textContent || '').length
        }
        w = w.parentElement
      }
      const postSig =
        (codeEl.textContent || '').length +
        '|' +
        postSibCount +
        ':' +
        postSibChars +
        '|' +
        (isTurnFinished ? '1' : '0')
      if (scannedCardSignatures.get(codeCard) !== postSig) {
        window.setTimeout(() => {
          if (codeCard.isConnected && !codeCard.hasAttribute('data-vexel-repaired-final')) {
            void repairBrokenSequenceFromCodeCard(codeCard, showToast)
          }
        }, 80)
      }
    }
  }
}
export function scanAndRepairCodeBlocks(root: ParentNode, showToast: (msg: string) => void): void {
  const cardSet = new Set<Element>()
  for (const codeNode of Array.from(
    root.querySelectorAll('pre:not([data-vexel-final-pre]) code')
  )) {
    const cardContainer =
      codeNode.closest('[data-hveid], [data-sfc-cp]') ||
      codeNode.closest('pre')?.parentElement?.parentElement ||
      codeNode.closest('pre')?.parentElement
    if (cardContainer) cardSet.add(cardContainer)
  }
  const candidates = Array.from(cardSet)

  // Pass 1: repair truncated / broken code cards (which may absorb & clean trailing poisoned FollowUp blocks)
  for (const card of candidates) {
    if (
      !card.isConnected ||
      card.hasAttribute('data-vexel-repaired-final') ||
      inFlightCards.has(card)
    )
      continue
    if (isPoisonedMarkdownCodeBlock(card)) continue
    if (!card.querySelector('pre code')) continue
    void repairBrokenSequenceFromCodeCard(card, showToast)
  }

  // Pass 2: clean any standalone poisoned markdown/FollowUp blocks not attached to a preceding code card
  for (const card of candidates) {
    if (
      !card.isConnected ||
      card.hasAttribute('data-vexel-repaired-final') ||
      inFlightCards.has(card)
    )
      continue
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

  const scheduleScan = (delayMs = 180) => {
    if (scanTimer) window.clearTimeout(scanTimer)
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined
      scanAndRepairCodeBlocks(document, showToast)
    }, delayMs)
  }

  const runImmediateAndSettle = () => {
    scanAndRepairCodeBlocks(document, showToast)
    scheduleScan(260)
  }

  document.addEventListener('aimRenderComplete', runImmediateAndSettle, true)
  document.addEventListener('aimBodyComplete', runImmediateAndSettle, true)
  document.addEventListener('vexel:stream-end', runImmediateAndSettle, true)
  document.addEventListener('vexel:spa-nav', () => scheduleScan(250), true)
  window.addEventListener('popstate', () => scheduleScan(250))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleScan(120)
  })
  document.addEventListener(
    'contentvisibilityautostatechange',
    (ev: Event) => {
      const target = ev.target as HTMLElement | null
      if (target && target.getAttribute('data-scope-id') === 'turn') scheduleScan(100)
    },
    true
  )

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return
    const isStreaming = Boolean(
      document.querySelector(
        'button[aria-label*="Stop" i], button[aria-label*="Arrêter" i], button[aria-label*="Interrompre" i]'
      )
    )
    if (isStreaming) return
    if (document.querySelector('pre:not([data-vexel-final-pre]) code')) {
      scanAndRepairCodeBlocks(document, showToast)
    }
  }, 900)

  scheduleScan(80)
}
