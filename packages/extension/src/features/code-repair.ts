let isUserSubmitting = false
let submitPauseTimer: number | undefined
let isMutating = false
function pauseDuringSubmit(): void {
  isUserSubmitting = true
  if (submitPauseTimer !== undefined) {
    globalThis.clearTimeout(submitPauseTimer)
  }
  submitPauseTimer = globalThis.setTimeout(() => {
    isUserSubmitting = false
  }, 1800)
}
function parseWizCodeComment(rawComment: string): string | null {
  const sepIdx = rawComment.indexOf('|||[[')
  if (sepIdx === -1) return null
  const jsonPart = rawComment.slice(sepIdx + 3).trim()
  try {
    const parsed = JSON.parse(jsonPart)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const [firstEntry] = parsed
      if (Array.isArray(firstEntry) && firstEntry.length > 1) {
        const [, codeText] = firstEntry
        if (typeof codeText === 'string') {
          return codeText
        }
      }
    }
  } catch {
    return null
  }
  return null
}
function findRawCode(codeBlock: Element): string | null {
  const scopes: Node[] = [codeBlock]
  if (codeBlock.parentElement) scopes.push(codeBlock.parentElement)
  if (codeBlock.parentElement?.parentElement) {
    scopes.push(codeBlock.parentElement.parentElement)
  }
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_COMMENT)
    let node = walker.nextNode()
    while (node) {
      const extracted = parseWizCodeComment(node.nodeValue || '')
      if (extracted !== null) return extracted
      node = walker.nextNode()
    }
  }
  return null
}
function collectSpilledCodeAfterBlock(codeBlock: Element, initialCode: string): string {
  let blockWrapper: Element = codeBlock
  while (
    blockWrapper.parentElement &&
    blockWrapper.parentElement.children.length <= 2 &&
    !blockWrapper.parentElement.classList.contains('Y3BBE')
  ) {
    blockWrapper = blockWrapper.parentElement
  }
  const parent = blockWrapper.parentElement
  if (!parent) return initialCode
  const siblings = [...parent.children]
  const startIdx = siblings.indexOf(blockWrapper)
  if (startIdx === -1) return initialCode
  const spilledChunks: string[] = []
  let foundOverflow = false
  for (let i = startIdx + 1; i < siblings.length; i++) {
    const el = siblings.slice(i, i + 1).find(() => true) as HTMLElement | undefined
    if (!el) continue
    const text = (el.textContent || '').trim()
    if (!text) continue
    if (text.startsWith('Utilisez ce code avec pr') || text.startsWith('Use code with caution')) {
      continue
    }
    if (el.querySelector('.aiModeUiCodeBlock__Container')) {
      const innerCode = el.querySelector('code')?.textContent || ''
      if (innerCode.trim().startsWith('')) {
        el.style.display = 'none'
      }
      break
    }
    if (text.startsWith('') || text.includes('')) {
      el.style.display = 'none'
      break
    }
    const looksLikeCode =
      text.includes('EOF') ||
      text.includes('pnpm ') ||
      text.includes('function ') ||
      text.includes('const ') ||
      text.includes('export ') ||
      text.includes('return ') ||
      text.includes('document.') ||
      text.includes('=>') ||
      (text.includes('{') && text.includes('}'))
    if (looksLikeCode || foundOverflow) {
      foundOverflow = true
      const cleaned = text.replace(/^[a-z]\s/iu, '').replaceAll(/\s*$/gu, '')
      if (cleaned) spilledChunks.push(cleaned)
    }
  }
  if (spilledChunks.length === 0) return initialCode
  return initialCode.replace(/\s+$/u, '') + '\n\n' + spilledChunks.join('\n\n')
}
export function initCodeRepair(showToast: (msg: string) => void): void {
  globalThis.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) pauseDuringSubmit()
    },
    true
  )
  globalThis.addEventListener('click', () => pauseDuringSubmit(), true)
  const processCodeBlock = (codeBlock: Element) => {
    const htmlBlock = codeBlock as HTMLElement
    if (htmlBlock.dataset.vexelRepaired === 'true') return
    const baseCode = findRawCode(codeBlock) || codeBlock.querySelector('code')?.textContent || ''
    if (!baseCode) return
    htmlBlock.dataset.vexelRepaired = 'true'
    const fullCode = collectSpilledCodeAfterBlock(codeBlock, baseCode)
    const wasStitched = fullCode.length > baseCode.length
    const headerBar = codeBlock.querySelector('.a2TNg') || codeBlock.firstElementChild
    if (!headerBar) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = wasStitched ? 'Copier complet' : 'Copier brut'
    btn.style.cssText =
      'margin-left: 8px; padding: 3px 10px; font-size: 11px; font-weight: 500; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; cursor: pointer;'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      navigator.clipboard.writeText(fullCode)
      showToast(wasStitched ? 'Script complet reconstitue et copie' : 'Code brut copie')
    })
    headerBar.append(btn)
  }
  const scanAll = () => {
    if (isUserSubmitting) return
    isMutating = true
    try {
      const blocks = document.querySelectorAll('.aiModeUiCodeBlock__Container')
      for (const block of blocks) {
        processCodeBlock(block)
      }
    } finally {
      isMutating = false
    }
  }
  let timer: number | undefined
  const scheduleScan = () => {
    if (timer) globalThis.clearTimeout(timer)
    timer = globalThis.setTimeout(() => {
      if ('requestIdleCallback' in globalThis) {
        globalThis.requestIdleCallback(() => scanAll(), { timeout: 1500 })
      } else {
        scanAll()
      }
    }, 1200)
  }
  const observer = new MutationObserver((mutations) => {
    if (isMutating) return
    for (const m of mutations) {
      const target = m.target as HTMLElement
      if (target?.id?.startsWith('vexel-')) continue
      if (m.addedNodes.length > 0) {
        scheduleScan()
        return
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleScan()
}
