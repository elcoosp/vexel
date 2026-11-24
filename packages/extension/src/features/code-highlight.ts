const STYLE_TAG_ID = 'vexel-code-tok-styles'

const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
  'self',
  'cls',
])

const JS_TS_KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'number',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'static',
  'string',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
])

const RUST_GO_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'chan',
  'const',
  'continue',
  'crate',
  'defer',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'func',
  'go',
  'if',
  'impl',
  'import',
  'in',
  'interface',
  'let',
  'loop',
  'map',
  'match',
  'mod',
  'move',
  'mut',
  'package',
  'pub',
  'range',
  'ref',
  'return',
  'select',
  'self',
  'Self',
  'static',
  'struct',
  'super',
  'switch',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'var',
  'where',
  'while',
])

function getKeywordSet(lang: string): Set<string> {
  const l = lang.toLowerCase()
  if (l === 'py' || l === 'python') return PYTHON_KEYWORDS
  if (l === 'rs' || l === 'rust' || l === 'go' || l === 'golang') return RUST_GO_KEYWORDS
  return JS_TS_KEYWORDS
}

function stripPythonComment(line: string): string {
  let q: string | null = null
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (q) {
      if (ch === '\\') i += 1
      else if (ch === q) q = null
      continue
    }
    if (ch === "'" || ch === '"') q = ch
    else if (ch === '#') return line.slice(0, i).trimEnd()
  }
  return line.trimEnd()
}

export function reconstructStructuralIndentation(
  headCode: string,
  strippedTail: string,
  lang: string
): string {
  const l = lang.toLowerCase()
  const isPython = l === 'py' || l === 'python'
  const BT1 = String.fromCodePoint(96)

  if (isPython) {
    let inClass = false
    let depth = 0
    let bracketDepth = 0
    const headLines = headCode.split('\n')
    for (const raw of headLines) {
      const trimmed = raw.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const spaces = raw.length - raw.trimStart().length
      if (spaces === 0) {
        if (/^class\s+[A-Za-z_]/.test(trimmed)) inClass = true
        else if (/^(?:def|async\s+def|if\s+__name__)\b/.test(trimmed)) inClass = false
      }
      const codeOnly = stripPythonComment(trimmed)
      let q: string | null = null
      for (let i = 0; i < codeOnly.length; i += 1) {
        const c = codeOnly[i]
        if (q) {
          if (c === '\\') i += 1
          else if (c === q) q = null
          continue
        }
        if (c === "'" || c === '"') q = c
        else if (c === '(' || c === '[' || c === '{') bracketDepth += 1
        else if (c === ')' || c === ']' || c === '}') bracketDepth = Math.max(0, bracketDepth - 1)
      }
      depth = Math.floor(spaces / 4)
      if (bracketDepth === 0 && codeOnly.endsWith(':')) depth += 1
    }

    let justReturned = false
    const outLines: string[] = []
    for (const rawLine of strippedTail.split('\n')) {
      const line = rawLine.trim()
      if (!line) {
        outLines.push('')
        continue
      }
      const codeOnly = stripPythonComment(line)
      const minFloor = inClass ? 1 : 0

      if (bracketDepth === 0) {
        if (/^class\s+[A-Za-z_]/.test(codeOnly)) {
          inClass = true
          depth = 0
          justReturned = false
        } else if (/^if\s+__name__\s*==/.test(codeOnly)) {
          inClass = false
          depth = 0
          justReturned = false
        } else if (
          /^@[A-Za-z_]/.test(codeOnly) ||
          /^(?:async\s+def|def)\s+[A-Za-z_]/.test(codeOnly)
        ) {
          depth = inClass ? 1 : 0
          justReturned = false
        } else if (/^(?:elif\b|else\s*:|except\b|finally\s*:)/.test(codeOnly)) {
          depth = Math.max(minFloor, depth - 1)
          justReturned = false
        } else if (justReturned && depth > minFloor) {
          depth = Math.max(minFloor, depth - 1)
          justReturned = false
        }
      }

      const effectiveDepth = depth + (bracketDepth > 0 ? 1 : 0)
      outLines.push('    '.repeat(Math.max(0, effectiveDepth)) + line)

      let q: string | null = null
      for (let i = 0; i < codeOnly.length; i += 1) {
        const c = codeOnly[i]
        if (q) {
          if (c === '\\') i += 1
          else if (c === q) q = null
          continue
        }
        if (c === "'" || c === '"') q = c
        else if (c === '(' || c === '[' || c === '{') bracketDepth += 1
        else if (c === ')' || c === ']' || c === '}') bracketDepth = Math.max(0, bracketDepth - 1)
      }

      if (bracketDepth === 0 && codeOnly) {
        if (codeOnly.endsWith(':')) {
          depth += 1
          justReturned = false
        } else if (/^(?:return|raise|break|continue|pass)\b/.test(codeOnly)) {
          justReturned = true
        } else {
          justReturned = false
        }
      }
    }
    return headCode.replace(/\n+$/, '') + '\n' + outLines.join('\n')
  }

  // Brace-delimited languages (TS, JS, Rust, Go, C/C++, Java, CSS, JSON)
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inBlockComment = false
  for (let i = 0; i < headCode.length; i += 1) {
    const ch = headCode[i]
    const next = headCode[i + 1]
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (inSingle) {
      if (ch === '\\') i += 1
      else if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '\\') i += 1
      else if (ch === '"') inDouble = false
      continue
    }
    if (inBacktick) {
      if (ch === '\\') i += 1
      else if (ch === BT1) inBacktick = false
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      const nl = headCode.indexOf('\n', i)
      if (nl === -1) break
      i = nl
      continue
    }
    if (ch === "'") inSingle = true
    else if (ch === '"') inDouble = true
    else if (ch === BT1) inBacktick = true
    else if (ch === '{' || ch === '[' || ch === '(') depth += 1
    else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
  }

  const outLines: string[] = []
  for (const rawLine of strippedTail.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      outLines.push('')
      continue
    }
    let leadingClosers = 0
    for (let j = 0; j < line.length; j += 1) {
      const c = line[j]
      if (c === '}' || c === ']' || c === ')') leadingClosers += 1
      else break
    }
    outLines.push('  '.repeat(Math.max(0, depth - leadingClosers)) + line)

    let s1 = false
    let s2 = false
    let s3 = false
    for (let j = 0; j < line.length; j += 1) {
      const c = line[j]
      const n = line.slice(j + 1, j + 2)
      if (s1) {
        if (c === '\\') j += 1
        else if (c === "'") s1 = false
        continue
      }
      if (s2) {
        if (c === '\\') j += 1
        else if (c === '"') s2 = false
        continue
      }
      if (s3) {
        if (c === '\\') j += 1
        else if (c === BT1) s3 = false
        continue
      }
      if (c === '/' && n === '/') break
      if (c === "'") s1 = true
      else if (c === '"') s2 = true
      else if (c === BT1) s3 = true
      else if (c === '{' || c === '[' || c === '(') depth += 1
      else if (c === '}' || c === ']' || c === ')') depth = Math.max(0, depth - 1)
    }
  }
  return headCode.replace(/\n+$/, '') + '\n' + outLines.join('\n')
}

export function ensureSemanticTokenStyles(doc: Document): void {
  if (doc.getElementById(STYLE_TAG_ID)) return
  const head = doc.head || doc.documentElement
  if (!head) return
  const style = doc.createElement('style')
  style.id = STYLE_TAG_ID
  style.textContent = [
    '[data-vexel-tok="keyword"] { color: #9334e6; font-weight: 500; }',
    '[data-vexel-tok="string"] { color: #188038; }',
    '[data-vexel-tok="number"] { color: #b45908; }',
    '[data-vexel-tok="function"] { color: #1967d2; }',
    '[data-vexel-tok="type"] { color: #996900; }',
    '[data-vexel-tok="decorator"] { color: #007b83; }',
    '[data-vexel-tok="comment"] { color: #70757a; font-style: italic; }',
    '@media (prefers-color-scheme: dark) {',
    '  [data-vexel-tok="keyword"] { color: #c58af9; }',
    '  [data-vexel-tok="string"] { color: #81c995; }',
    '  [data-vexel-tok="number"] { color: #fdd663; }',
    '  [data-vexel-tok="function"] { color: #8ab4f8; }',
    '  [data-vexel-tok="type"] { color: #f6aea9; }',
    '  [data-vexel-tok="decorator"] { color: #78d9ec; }',
    '  [data-vexel-tok="comment"] { color: #9aa0a6; }',
    '}',
  ].join('\n')
  head.appendChild(style)
}

function appendToken(
  doc: Document,
  frag: DocumentFragment,
  tok: string | null,
  text: string
): void {
  if (!text) return
  if (!tok) {
    frag.appendChild(doc.createTextNode(text))
    return
  }
  const span = doc.createElement('span')

  span.setAttribute('data-vexel-tok', tok)
  span.textContent = text
  frag.appendChild(span)
}
export function renderHighlightedTail(tailEl: HTMLElement, code: string, lang: string): void {
  const doc = tailEl.ownerDocument || document
  ensureSemanticTokenStyles(doc)
  const keywords = getKeywordSet(lang)
  const l = lang.toLowerCase()
  const isPython = l === 'py' || l === 'python' || l === 'sh' || l === 'bash' || l === 'yaml'
  const BT1 = String.fromCodePoint(96)
  const frag = doc.createDocumentFragment()
  let plainBuf = '\n'
  const emitToken = (tok: string | null, text: string) => {
    if (!text) return
    if (!tok) {
      plainBuf += text
      return
    }
    if (plainBuf) {
      frag.appendChild(doc.createTextNode(plainBuf))
      plainBuf = ''
    }
    appendToken(doc, frag, tok, text)
  }
  const lines = code.split('\n')
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx] || ''
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      const next = line[i + 1]
      // Line comment
      if ((isPython && ch === '#') || (!isPython && ch === '/' && next === '/')) {
        emitToken('comment', line.slice(i))
        i = line.length
        continue
      }
      // String literal (single, double, backtick, with optional Python prefix f/r/b)
      const isPrefixedStr =
        isPython &&
        (ch === 'f' || ch === 'r' || ch === 'b' || ch === 'F' || ch === 'R') &&
        (next === '"' || next === "'")
      if (ch === '"' || ch === "'" || ch === BT1 || isPrefixedStr) {
        const quote = isPrefixedStr ? next : ch
        let j = i + (isPrefixedStr ? 2 : 1)
        while (j < line.length) {
          const c = line[j]
          if (c === String.fromCharCode(92)) {
            j += 2
            continue
          }
          j += 1
          if (c === quote) break
        }
        emitToken('string', line.slice(i, j))
        i = j
        continue
      }
      // Decorator (@staticmethod, @dataclass)
      if (ch === '@' && next && /[A-Za-z_]/.test(next)) {
        let j = i + 1
        while (j < line.length && /[A-Za-z0-9_.]/.test(line[j])) j += 1
        emitToken('decorator', line.slice(i, j))
        i = j
        continue
      }
      // Numeric literal
      if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]))) {
        let j = i + 1
        while (j < line.length && /[0-9a-fA-FxXoObB._eE+-]/.test(line[j])) {
          const cur = line[j]
          if ((cur === '+' || cur === '-') && !/[eE]/.test(line[j - 1])) break
          j += 1
        }
        emitToken('number', line.slice(i, j))
        i = j
        continue
      }
      // Identifier / Keyword / Type / Function call
      if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1
        while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j += 1
        const word = line.slice(i, j)
        const after = line.slice(j).trimStart()
        if (keywords.has(word)) {
          emitToken('keyword', word)
        } else if (after.startsWith('(')) {
          emitToken('function', word)
        } else if (/^[A-Z][A-Za-z0-9_]*$/.test(word) && word.length > 1) {
          emitToken('type', word)
        } else {
          emitToken(null, word)
        }
        i = j
        continue
      }
      plainBuf += ch
      i += 1
    }
    if (lineIdx < lines.length - 1) plainBuf += '\n'
  }
  if (plainBuf) frag.appendChild(doc.createTextNode(plainBuf))
  tailEl.replaceChildren(frag)
}

export function mirrorSemanticTokenStyles(doc: Document, target: ParentNode): void {
  ensureSemanticTokenStyles(doc)
  doc.head?.querySelectorAll('style').forEach((st) => {
    if (st.textContent?.includes('data-vexel-tok')) {
      target.appendChild(st.cloneNode(true))
    }
  })
}

export function createLightCodeCardElement(
  doc: Document,
  codeText: string,
  lang: string
): HTMLElement {
  const wrapper = doc.createElement('div')
  wrapper.className = 'code-box'

  const bar = doc.createElement('div')
  bar.className = 'code-hdr'
  const langSpan = doc.createElement('span')
  langSpan.textContent = lang || 'code'

  const copyBtn = doc.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'copy-btn'
  copyBtn.textContent = 'Copier'
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(codeText).catch(() => {})
    copyBtn.textContent = 'Copié'
    window.setTimeout(() => {
      copyBtn.textContent = 'Copier'
    }, 1400)
  })
  bar.append(langSpan, copyBtn)

  const pre = doc.createElement('pre')
  const codeEl = doc.createElement('code')
  renderHighlightedTail(codeEl, codeText, lang || 'code')
  if (codeEl.firstChild?.nodeType === Node.TEXT_NODE && codeEl.firstChild.textContent === '\n') {
    codeEl.firstChild.remove()
  }
  pre.appendChild(codeEl)
  wrapper.append(bar, pre)
  return wrapper
}

function locateLineGlyphRect(
  doc: Document,
  codeEl: Element,
  lines: string[],
  lineIndexZeroBased: number
): DOMRect | null {
  if (lineIndexZeroBased < 0 || lineIndexZeroBased >= lines.length) return null
  let charOffset = 0
  for (let i = 0; i < lineIndexZeroBased; i += 1) {
    charOffset += lines[i].length + 1
  }
  const rawLine = lines[lineIndexZeroBased] || ''
  const leadingWs = rawLine.match(/^\s*/)?.[0].length || 0
  charOffset += leadingWs

  const walker = doc.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT)
  let traversed = 0
  let current = walker.nextNode() as Text | null
  while (current) {
    const len = current.nodeValue?.length || 0
    if (len > 0 && traversed + len >= charOffset) {
      const startOffset = Math.max(0, Math.min(len - 1, charOffset - traversed))
      const endOffset = Math.min(len, startOffset + 1)
      const range = doc.createRange()
      range.setStart(current, startOffset)
      range.setEnd(current, Math.max(startOffset, endOffset))
      const rect = range.getBoundingClientRect()
      if (rect.height > 0) return rect
    }
    traversed += len
    current = walker.nextNode() as Text | null
  }
  return null
}

function measureLineOffsetInCode(
  preEl: HTMLElement,
  codeEl: Element,
  clampedLine: number,
  fallbackLineHeight: number,
  fallbackPaddingTop: number
): { topPx: number; heightPx: number } {
  try {
    const doc = preEl.ownerDocument || document
    const text = codeEl.textContent || ''
    const lines = text.split('\n')
    const targetIdx = clampedLine - 1
    const targetRect = locateLineGlyphRect(doc, codeEl, lines, targetIdx)
    const preRect = preEl.getBoundingClientRect()
    if (targetRect && preRect.height > 0) {
      const nextRect = locateLineGlyphRect(doc, codeEl, lines, targetIdx + 1)
      const prevRect = locateLineGlyphRect(doc, codeEl, lines, targetIdx - 1)
      const measuredStep =
        nextRect && nextRect.top > targetRect.top + 4
          ? nextRect.top - targetRect.top
          : prevRect && targetRect.top > prevRect.top + 4
            ? targetRect.top - prevRect.top
            : 0
      const heightPx =
        measuredStep > 0 ? Math.round(measuredStep * 100) / 100 : fallbackLineHeight
      const glyphCenterY = targetRect.top - preRect.top + preEl.scrollTop + targetRect.height / 2
      const topPx = Math.max(0, Math.round((glyphCenterY - heightPx / 2) * 100) / 100)
      return { topPx, heightPx }
    }
  } catch {}
  return {
    topPx: fallbackPaddingTop + (clampedLine - 1) * fallbackLineHeight,
    heightPx: fallbackLineHeight,
  }
}

export interface HighlightDiagnosticItem {
  tool?: string
  line?: number
  column?: number
  message: string
}

function getOrCreateLineHoverTooltip(doc: Document): HTMLElement {
  let tip = doc.querySelector<HTMLElement>('[data-vexel-line-hover-tooltip="true"]')
  if (!tip) {
    tip = doc.createElement('div')
    tip.setAttribute('data-vexel-ui', 'true')
    tip.setAttribute('data-vexel-line-hover-tooltip', 'true')
    Object.assign(tip.style, {
      position: 'fixed',
      zIndex: '2147483647',
      maxWidth: '360px',
      padding: '7px 10px',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      border: '1px solid #fde293',
      boxShadow: '0 6px 20px rgba(32, 33, 36, 0.16)',
      color: '#202124',
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: '11.5px',
      lineHeight: '1.4',
      pointerEvents: 'none',
      display: 'none',
      flexDirection: 'column',
      gap: '3px',
    })
    ;(doc.body || doc.documentElement).appendChild(tip)
  }
  return tip
}

function hideLineHoverTooltip(doc: Document): void {
  const tip = doc.querySelector<HTMLElement>('[data-vexel-line-hover-tooltip="true"]')
  if (tip) tip.style.display = 'none'
}

export function highlightErrorLinesInCodeBlock(
  preEl: HTMLElement,
  diagnostics: HighlightDiagnosticItem[],
  activeIndex = 0,
  onSelectIndex?: (idx: number) => void,
  pulseActive = false
): void {
  const doc = preEl.ownerDocument || document
  clearErrorLineHighlight(preEl)

  const itemsWithLine = diagnostics
    .map((d, idx) => ({ diag: d, idx }))
    .filter(
      (entry): entry is { diag: HighlightDiagnosticItem & { line: number }; idx: number } =>
        typeof entry.diag.line === 'number' && Number.isFinite(entry.diag.line) && entry.diag.line > 0
    )
  if (itemsWithLine.length === 0) return

  const codeEl = preEl.querySelector('code') || preEl
  if (!preEl.hasAttribute('data-vexel-orig-pl')) {
    preEl.setAttribute('data-vexel-orig-pl', preEl.style.paddingLeft || '')
  }
  preEl.style.paddingLeft = '8px'
  const totalLines = Math.max(1, (codeEl.textContent || '').split('\n').length)
  const preStyle = window.getComputedStyle(preEl)
  const codeStyle = window.getComputedStyle(codeEl)
  if (preStyle.position === 'static') preEl.style.position = 'relative'

  const parsedLineHeight = parseFloat(codeStyle.lineHeight) || parseFloat(preStyle.lineHeight)
  const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 20
  const paddingTop = (parseFloat(preStyle.paddingTop) || 0) + (parseFloat(codeStyle.paddingTop) || 0)
  const totalCount = diagnostics.length

  for (const { diag, idx } of itemsWithLine) {
    const clampedLine = Math.max(1, Math.min(totalLines, Math.floor(diag.line)))
    const isActive = idx === activeIndex
    const { topPx, heightPx } = measureLineOffsetInCode(preEl, codeEl, clampedLine, lineHeight, paddingTop)

    const marker = doc.createElement('div')
    marker.setAttribute('data-vexel-ui', 'true')
    marker.setAttribute('data-vexel-error-line-marker', 'true')
    marker.setAttribute('data-line', String(clampedLine))
    marker.setAttribute('data-diag-index', String(idx))
    if (isActive) marker.setAttribute('data-active', 'true')

    const restBg = isActive ? 'rgba(251, 188, 4, 0.18)' : 'rgba(251, 188, 4, 0.09)'
    const hoverBg = isActive ? 'rgba(251, 188, 4, 0.28)' : 'rgba(251, 188, 4, 0.16)'
    const baseBg = isActive && pulseActive ? 'rgba(251, 188, 4, 0.30)' : restBg

    Object.assign(marker.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: topPx + 'px',
      height: heightPx + 'px',
      backgroundColor: baseBg,
      borderLeft: isActive ? '3px solid #ea8600' : '3px solid rgba(234, 134, 0, 0.45)',
      pointerEvents: 'auto',
      cursor: 'pointer',
      boxSizing: 'border-box',
      transition: 'background-color 180ms ease',
      zIndex: isActive ? '2' : '1',
    })

    const showTip = (ev: MouseEvent) => {
      const tip = getOrCreateLineHoverTooltip(doc)
      tip.replaceChildren()

      const headerRow = doc.createElement('div')
      Object.assign(headerRow.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        fontWeight: '600',
        fontSize: '11px',
        color: '#b06000',
      })
      const toolPrefix = diag.tool ? diag.tool + ' · ' : ''
      const colSuffix = diag.column ? ':' + String(diag.column) : ''
      const countBadge = totalCount > 1 ? ' (' + String(idx + 1) + '/' + String(totalCount) + ')' : ''
      const leftLbl = doc.createElement('span')
      leftLbl.textContent = toolPrefix + 'L' + String(clampedLine) + colSuffix + countBadge
      headerRow.appendChild(leftLbl)

      if (totalCount > 1) {
        const hintLbl = doc.createElement('span')
        hintLbl.style.fontWeight = '500'
        hintLbl.style.color = '#5f6368'
        hintLbl.textContent = isActive ? 'Active' : 'Click to focus'
        headerRow.appendChild(hintLbl)
      }

      const msgBody = doc.createElement('div')
      Object.assign(msgBody.style, {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '11px',
        color: '#3c4043',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      })
      msgBody.textContent = diag.message

      tip.append(headerRow, msgBody)
      tip.style.display = 'flex'

      const markerRect = marker.getBoundingClientRect()
      const tipRect = tip.getBoundingClientRect()
      const tipW = tipRect.width || 260
      const tipH = tipRect.height || 52
      const left = Math.max(12, Math.min(window.innerWidth - tipW - 12, ev.clientX - Math.min(48, tipW / 3)))
      const top =
        markerRect.top > tipH + 14
          ? markerRect.top - tipH - 6
          : Math.min(window.innerHeight - tipH - 12, markerRect.bottom + 6)
      tip.style.left = left + 'px'
      tip.style.top = top + 'px'
    }

    marker.addEventListener('mouseenter', (ev) => {
      marker.style.backgroundColor = hoverBg
      showTip(ev)
    })
    marker.addEventListener('mousemove', (ev) => showTip(ev))
    marker.addEventListener('mouseleave', () => {
      marker.style.backgroundColor = restBg
      hideLineHoverTooltip(doc)
    })
    marker.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      hideLineHoverTooltip(doc)
      if (onSelectIndex) onSelectIndex(idx)
      else highlightErrorLinesInCodeBlock(preEl, diagnostics, idx, onSelectIndex, true)
    })

    preEl.appendChild(marker)

    if (isActive && pulseActive) {
      window.setTimeout(() => {
        if (marker.isConnected) marker.style.backgroundColor = restBg
      }, 650)
    }
  }
}

export function highlightErrorLineInCodeBlock(
  preEl: HTMLElement,
  lineNumber: number,
  pulse = false
): void {
  highlightErrorLinesInCodeBlock(
    preEl,
    [{ line: lineNumber, message: 'Syntax error on line ' + String(Math.floor(lineNumber)) }],
    0,
    undefined,
    pulse
  )
}

export function clearErrorLineHighlight(preEl: HTMLElement): void {
  if (preEl.hasAttribute('data-vexel-orig-pl')) {
    preEl.style.paddingLeft = preEl.getAttribute('data-vexel-orig-pl') || ''
    preEl.removeAttribute('data-vexel-orig-pl')
  }
  const doc = preEl.ownerDocument || document
  hideLineHoverTooltip(doc)
  preEl.querySelectorAll('[data-vexel-error-line-marker="true"]').forEach((el) => el.remove())
}
