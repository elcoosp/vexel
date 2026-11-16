let isUserSubmitting = false
let submitPauseTimer: number | undefined

function pauseRepairBriefly(): void {
  isUserSubmitting = true
  if (submitPauseTimer !== undefined) {
    window.clearTimeout(submitPauseTimer)
  }
  submitPauseTimer = window.setTimeout(() => {
    isUserSubmitting = false
  }, 1500)
}

export function initCodeRepair(showToast: (msg: string) => void): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) pauseRepairBriefly()
    },
    { capture: true, passive: true }
  )

  window.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('button')) pauseRepairBriefly()
    },
    { capture: true, passive: true }
  )

  const parseWizCodeComment = (rawComment: string): string | null => {
    const sepIdx = rawComment.indexOf('|||[[')
    if (sepIdx === -1) return null
    try {
      const jsonStr = rawComment.slice(sepIdx + 3)
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const firstEntry = parsed[0]
        if (Array.isArray(firstEntry) && firstEntry.length > 1) {
          const codeText = firstEntry[1]
          if (typeof codeText === 'string') {
            return codeText
          }
        }
      }
    } catch {
      // Ignore non-code JSON comments
    }
    return null
  }

  const findRawCode = (codeBlock: Element): string | null => {
    const scopes: Node[] = [codeBlock]
    if (codeBlock.parentElement) scopes.push(codeBlock.parentElement)
    if (codeBlock.parentElement?.parentElement) scopes.push(codeBlock.parentElement.parentElement)

    for (const scope of scopes) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_COMMENT)
      let node = walker.nextNode()
      while (node) {
        const val = node.nodeValue || ''
        const extracted = parseWizCodeComment(val)
        if (extracted !== null) {
          return extracted
        }
        node = walker.nextNode()
      }
    }
    return null
  }

  const collectSpilledCodeAfterBlock = (codeBlock: Element, initialCode: string): string => {
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

    const siblings = Array.from(parent.children)
    const startIdx = siblings.indexOf(blockWrapper)
    if (startIdx === -1) return initialCode

    const spilledChunks: string[] = []
    let foundOverflow = false

    for (let i = startIdx + 1; i < siblings.length; i++) {
      const el = siblings[i] as HTMLElement
      // Utiliser textContent en priorite pour eviter un forced synchronous layout (innerText)
      const text = (el.textContent || '').trim()
      if (!text) continue

      if (text.startsWith('Utilisez ce code avec pr') || text.startsWith('Use code with caution')) {
        continue
      }

      if (el.querySelector('.aiModeUiCodeBlock__Container')) {
        const innerCode = el.querySelector('code')?.textContent || ''
        if (innerCode.trim().startsWith('<FollowUp>')) {
          el.style.display = 'none'
          break
        }
        break
      }

      if (text.startsWith('<FollowUp>') || text.includes('</FollowUp>')) {
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
        text.startsWith('```') ||
        (text.includes('{') && text.includes('}'))

      if (looksLikeCode || foundOverflow) {
        foundOverflow = true
        const cleaned = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/g, '')
        if (cleaned) {
          spilledChunks.push(cleaned)
        }
      }
    }

    if (spilledChunks.length === 0) {
      return initialCode
    }

    return `${initialCode.replace(/\s+$/, '')}\n\n${spilledChunks.join('\n\n')}`
  }

  const scanAll = () => {
    if (isUserSubmitting) {
      scheduleScan()
      return
    }

    const containers = document.querySelectorAll(
      '.aiModeUiCodeBlock__Container:not([data-vexel-repaired="true"])'
    )
    containers.forEach((codeBlock) => {
      codeBlock.setAttribute('data-vexel-repaired', 'true')

      const baseCode = findRawCode(codeBlock) || codeBlock.querySelector('code')?.textContent || ''

      if (baseCode.trim().startsWith('<FollowUp>')) {
        ;(codeBlock as HTMLElement).style.display = 'none'
        return
      }

      const fullCode = collectSpilledCodeAfterBlock(codeBlock, baseCode)
      const wasStitched = fullCode.length > baseCode.length

      const headerBar = codeBlock.querySelector('.a2TNg') || codeBlock.firstElementChild
      if (!headerBar) return

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = wasStitched
        ? `Copier complet + suite (${fullCode.length} car.)`
        : `Copier source exacte (${fullCode.length} car.)`

      Object.assign(btn.style, {
        marginLeft: 'auto',
        backgroundColor: wasStitched ? '#059669' : '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
      })

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.writeText(fullCode)
        showToast(
          wasStitched
            ? `Code complet reconstitue copie (${fullCode.length} car.)`
            : `Source exacte copiee (${fullCode.length} car.)`
        )
      })

      headerBar.appendChild(btn)
    })
  }

  let timer: number | undefined
  const scheduleScan = () => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => scanAll(), { timeout: 1200 })
      } else {
        scanAll()
      }
    }, 650)
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        scheduleScan()
        return
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
  scheduleScan()
}
