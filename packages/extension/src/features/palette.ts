import { MAX_SAFE_LENGTH, uploadAsTextFile } from './untruncate'
import { exportConversationMarkdown } from './thread-tools'
import { createMenuRow, createPaletteDom } from './palette-ui'

interface RefFile {
  relPath: string
  content: string
  length: number
}

interface SkillItem {
  id: string
  name: string
  description: string
  smartContent: string
  smartLength: number
  fullContent: string
  fullLength: number
  refCount: number
  refs: RefFile[]
}

interface BrowseEntry {
  name: string
  relPath: string
  isDir: boolean
}

type MenuMode = 'skills' | 'refs' | 'files'

const BT1 = String.fromCodePoint(96)
const BT3 = String.fromCodePoint(96, 96, 96)

function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k car.' : len + ' car.'
}

function resolveEditable(target: EventTarget | null): HTMLElement | null {
  const node = target as HTMLElement | null
  if (!node) return null
  if (node.tagName === 'TEXTAREA') return node
  const ce = node.closest('[contenteditable="true"]') as HTMLElement | null
  if (ce) return ce
  return node.isContentEditable ? node : null
}

function findVisibleInput(): HTMLElement | null {
  const inputs = document.querySelectorAll('textarea, [contenteditable="true"]')
  for (const el of inputs) {
    if ((el as HTMLElement).offsetParent !== null) return el as HTMLElement
  }
  return null
}

function getTextBeforeCursor(editable: HTMLElement): string {
  if (editable.tagName === 'TEXTAREA') {
    const ta = editable as HTMLTextAreaElement
    return ta.value.slice(0, ta.selectionStart ?? ta.value.length)
  }
  const sel = globalThis.getSelection()
  if (!sel || sel.rangeCount === 0) return editable.textContent || ''
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(editable)
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset)
  return range.toString()
}

function removeTriggerChars(editable: HTMLElement, count: number): void {
  if (count <= 0) return
  if (editable.tagName === 'TEXTAREA') {
    const ta = editable as HTMLTextAreaElement
    const pos = ta.selectionStart ?? ta.value.length
    const start = Math.max(0, pos - count)
    ta.value = ta.value.slice(0, start) + ta.value.slice(pos)
    ta.selectionStart = start
    ta.selectionEnd = start
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }

  editable.focus()
  const sel = globalThis.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.endContainer as Text
    const start = Math.max(0, range.endOffset - count)
    textNode.deleteData(start, range.endOffset - start)
    const newRange = document.createRange()
    newRange.setStart(textNode, start)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
    editable.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

export function initCommandPalette(showToast: (msg: string) => void): void {
  const ui = createPaletteDom()
  let isOpen = false
  let mode: MenuMode = 'skills'
  let triggerTextLength = 0
  let hasInlineTrigger = false
  let activeInput: HTMLElement | null = null

  let skills: SkillItem[] = []
  let filteredSkills: SkillItem[] = []
  let activeSkill: SkillItem | null = null
  let filteredRefs: RefFile[] = []

  let currentDir = ''
  let rootLabel = '~'
  let browseEntries: BrowseEntry[] = []
  let selectedIndex = 0
  let fileFetchTimer: number | undefined

  const setEmptyMessage = (msg: string) => {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = msg
    ui.listEl.replaceChildren(empty)
  }

  const positionElements = () => {
    const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput()
    if (!input) {
      ui.triggerPill.style.display = 'inline-flex'
      ui.triggerPill.style.bottom = '18px'
      ui.triggerPill.style.right = '24px'
      ui.triggerPill.style.top = 'auto'
      ui.triggerPill.style.left = 'auto'
      if (isOpen) {
        ui.popover.style.bottom = '56px'
        ui.popover.style.right = '24px'
        ui.popover.style.top = 'auto'
        ui.popover.style.left = 'auto'
      }
      return
    }
    activeInput = input
    const rect = input.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      ui.triggerPill.style.display = 'inline-flex'
      ui.triggerPill.style.bottom = '18px'
      ui.triggerPill.style.right = '24px'
      ui.triggerPill.style.top = 'auto'
      ui.triggerPill.style.left = 'auto'
      return
    }

    ui.triggerPill.style.display = 'inline-flex'
    ui.triggerPill.style.bottom = 'auto'
    ui.triggerPill.style.right = 'auto'
    ui.triggerPill.style.top = Math.max(8, rect.top - 32) + 'px'
    ui.triggerPill.style.left = Math.max(12, rect.right - 118) + 'px'

    if (isOpen) {
      const popHeight = ui.popover.offsetHeight || 340
      const topPos = rect.top - popHeight - 8
      const resolvedTop =
        topPos > 10 ? topPos : Math.min(globalThis.innerHeight - popHeight - 12, rect.bottom + 8)
      ui.popover.style.bottom = 'auto'
      ui.popover.style.right = 'auto'
      ui.popover.style.top = resolvedTop + 'px'
      ui.popover.style.left = Math.max(12, Math.min(globalThis.innerWidth - 552, rect.left)) + 'px'
    }
  }

  const renderBreadcrumbs = () => {
    if (mode !== 'files') {
      ui.breadcrumbsEl.classList.remove('visible')
      return
    }
    ui.breadcrumbsEl.classList.add('visible')
    ui.breadcrumbsEl.replaceChildren()

    const rootBtn = document.createElement('span')
    rootBtn.className = 'crumb'
    rootBtn.textContent = rootLabel
    rootBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      navigateToDir('')
    })
    ui.breadcrumbsEl.append(rootBtn)

    if (!currentDir) return
    const parts = currentDir.split('/')
    let acc = ''
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part
      const targetPath = acc
      const sep = document.createElement('span')
      sep.className = 'crumb-sep'
      sep.textContent = '/'
      const crumb = document.createElement('span')
      crumb.className = 'crumb'
      crumb.textContent = part
      crumb.addEventListener('mousedown', (e) => {
        e.preventDefault()
        navigateToDir(targetPath)
      })
      ui.breadcrumbsEl.append(sep, crumb)
    }
  }

  const navigateToDir = (dirPath: string) => {
    currentDir = dirPath
    ui.filterInput.value = ''
    browseDir(currentDir, '')
  }

  const navigateUp = () => {
    if (!currentDir) return
    const idx = currentDir.lastIndexOf('/')
    navigateToDir(idx === -1 ? '' : currentDir.slice(0, idx))
  }

  const fetchSkills = () => {
    setEmptyMessage('Chargement des skills...')
    chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        setEmptyMessage('Bridge local injoignable (127.0.0.1:49152)')
        return
      }
      skills = res.data?.skills || []
      applyFilter(ui.filterInput.value)
    })
  }

  const browseDir = (dir: string, query: string) => {
    if (fileFetchTimer) globalThis.clearTimeout(fileFetchTimer)
    fileFetchTimer = globalThis.setTimeout(
      () => {
        chrome.runtime.sendMessage({ type: 'BROWSE_DIR', dir, query }, (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            setEmptyMessage('Bridge local injoignable (127.0.0.1:49152)')
            return
          }
          rootLabel = res.data?.rootLabel || '~'
          currentDir = res.data?.dir || ''
          const rawEntries: BrowseEntry[] = res.data?.entries || []

          if (!query && currentDir) {
            const idx = currentDir.lastIndexOf('/')
            const parentPath = idx === -1 ? '' : currentDir.slice(0, idx)
            browseEntries = [
              { name: '.. (Dossier parent)', relPath: parentPath, isDir: true },
              ...rawEntries,
            ]
          } else {
            browseEntries = rawEntries
          }

          selectedIndex = 0
          renderBreadcrumbs()
          renderList()
        })
      },
      query ? 90 : 0
    )
  }

  const switchMode = (newMode: MenuMode, initialQuery = '') => {
    mode = newMode
    activeSkill = null
    ui.tabSkills.classList.toggle('active', mode === 'skills' || mode === 'refs')
    ui.tabFiles.classList.toggle('active', mode === 'files')
    ui.filterInput.value = initialQuery
    renderBreadcrumbs()

    if (mode === 'skills') {
      ui.filterInput.placeholder = 'Filtrer les skills...'
      if (skills.length === 0) fetchSkills()
      else applyFilter(initialQuery)
    } else if (mode === 'files') {
      ui.filterInput.placeholder = 'Filtrer ce dossier ou rechercher un fichier...'
      browseDir(currentDir, initialQuery)
    }
  }

  const openMenu = (initialMode: MenuMode, initialQuery = '', tokenLen = 0) => {
    hasInlineTrigger = tokenLen > 0
    triggerTextLength = tokenLen
    isOpen = true
    ui.popover.classList.add('open')
    switchMode(initialMode, initialQuery)
    positionElements()
    if (!hasInlineTrigger) ui.filterInput.focus()
  }

  const closeMenu = () => {
    isOpen = false
    hasInlineTrigger = false
    triggerTextLength = 0
    activeSkill = null
    ui.popover.classList.remove('open')
  }

  const applyFilter = (qRaw: string) => {
    const q = qRaw.toLowerCase().trim()
    if (mode === 'refs' && activeSkill) {
      filteredRefs = q
        ? activeSkill.refs.filter((r) => r.relPath.toLowerCase().includes(q))
        : activeSkill.refs
      selectedIndex = 0
      renderList()
      return
    }
    if (mode === 'skills') {
      filteredSkills = q
        ? skills.filter(
            (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
          )
        : skills
      selectedIndex = 0
      renderList()
      return
    }
    if (mode === 'files') browseDir(currentDir, q)
  }
  const renderList = () => {
    ui.listEl.replaceChildren()
    if (mode === 'refs' && activeSkill) {
      ui.statusText.textContent = filteredRefs.length + ' reference(s) — ' + activeSkill.name
      if (filteredRefs.length === 0) {
        setEmptyMessage('Aucune reference correspondante.')
        return
      }
      filteredRefs.forEach((r, i) => {
        ui.listEl.append(
          createMenuRow({
            icon: 'file-text',
            title: r.relPath,
            badgeText: formatChars(r.length),
            isDirBadge: false,
            isSelected: i === selectedIndex,
            onSelect: (full) => selectCurrentItem(i, full),
          })
        )
      })
    } else if (mode === 'skills') {
      ui.statusText.textContent = filteredSkills.length + ' skill(s)'
      if (filteredSkills.length === 0) {
        setEmptyMessage('Aucun skill correspondant.')
        return
      }
      filteredSkills.forEach((s, i) => {
        const prefix = s.refCount > 0 ? s.refCount + ' refs • ' : ''
        ui.listEl.append(
          createMenuRow({
            icon: 'sparkles',
            title: s.name,
            badgeText: prefix + formatChars(s.smartLength),
            isDirBadge: false,
            isSelected: i === selectedIndex,
            subText: s.description,
            onSelect: (full) => selectCurrentItem(i, full),
          })
        )
      })
    } else if (mode === 'files') {
      ui.statusText.textContent = browseEntries.length + ' element(s)'
      if (browseEntries.length === 0) {
        setEmptyMessage('Dossier vide ou aucun fichier correspondant.')
        return
      }
      const hasQuery = ui.filterInput.value.trim().length > 0
      browseEntries.forEach((entry, i) => {
        ui.listEl.append(
          createMenuRow({
            icon: entry.isDir ? 'folder' : 'file-text',
            title: entry.name,
            badgeText: entry.isDir ? 'Dossier' : 'Fichier',
            isDirBadge: entry.isDir,
            isSelected: i === selectedIndex,
            subText: hasQuery ? entry.relPath : undefined,
            onSelect: (full) => selectCurrentItem(i, full),
          })
        )
      })
    }
    const active = ui.listEl.querySelector('.item.active')
    if (active) active.scrollIntoView({ block: 'nearest' })
  }
  const injectContent = (
    content: string,
    fileName: string,
    toastMsg: string,
    charsToStrip: number
  ) => {
    const target = activeInput || findVisibleInput()
    if (!target) {
      navigator.clipboard.writeText(content)
      showToast(toastMsg + ' (copie)')
      return
    }
    if (charsToStrip > 0) removeTriggerChars(target, charsToStrip)
    target.focus()
    if (
      content.length > MAX_SAFE_LENGTH ||
      fileName.endsWith('.ts') ||
      fileName.endsWith('.rs') ||
      fileName.endsWith('.mjs')
    ) {
      uploadAsTextFile(content, target, showToast, fileName)
      return
    }
    if (target.tagName === 'TEXTAREA') {
      const ta = target as HTMLTextAreaElement
      ta.value = ta.value ? ta.value + '\n\n' + content : content
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('insertText', false, content)
    }
    showToast(toastMsg)
  }
  const selectCurrentItem = (idx = selectedIndex, fullBundle = false) => {
    const charsToStrip = hasInlineTrigger ? triggerTextLength : 0
    if (mode === 'refs' && activeSkill) {
      const ref = filteredRefs.slice(idx, idx + 1).find(() => true)
      if (!ref) return
      const skillName = activeSkill.name
      closeMenu()
      injectContent(
        '## Reference (' + skillName + ') : ' + ref.relPath + '\n\n' + ref.content,
        ref.relPath.split('/').join('-'),
        'Reference "' + ref.relPath + '" ajoutee',
        charsToStrip
      )
      return
    }
    if (mode === 'skills') {
      const skill = filteredSkills.slice(idx, idx + 1).find(() => true)
      if (!skill) return
      closeMenu()
      const payload = fullBundle ? skill.fullContent : skill.smartContent
      injectContent(payload, skill.id + '.md', 'Skill "' + skill.name + '" ajoute', charsToStrip)
      return
    }
    if (mode === 'files') {
      const entry = browseEntries.slice(idx, idx + 1).find(() => true)
      if (!entry) return
      if (entry.isDir) {
        navigateToDir(entry.relPath)
        return
      }
      closeMenu()
      chrome.runtime.sendMessage({ type: 'FETCH_FILE_CONTENT', relPath: entry.relPath }, (res) => {
        if (!res?.ok || !res.data) {
          showToast('Impossible de lire ' + entry.relPath)
          return
        }
        const wrapped =
          '### Fichier : ' +
          BT1 +
          entry.relPath +
          BT1 +
          '\n\n' +
          BT3 +
          '\n' +
          res.data.content +
          '\n' +
          BT3
        const target = activeInput || findVisibleInput()
        if (target) {
          if (charsToStrip > 0) removeTriggerChars(target, charsToStrip)
          uploadAsTextFile(wrapped, target, showToast, entry.name + '.txt')
        }
      })
    }
  }
  const handleEditableInput = (e: Event) => {
    const editable = resolveEditable(e.target)
    if (!editable) return
    activeInput = editable
    const textBeforeCursor = getTextBeforeCursor(editable)
    const triggerPos = Math.max(
      textBeforeCursor.lastIndexOf('/'),
      textBeforeCursor.lastIndexOf('@')
    )
    let match: { symbol: string; query: string; len: number } | null = null
    if (triggerPos !== -1) {
      const prevChar = triggerPos === 0 ? ' ' : textBeforeCursor.charAt(triggerPos - 1)
      const afterTrigger = textBeforeCursor.slice(triggerPos + 1)
      if (/\s/u.test(prevChar) && !/\s/u.test(afterTrigger)) {
        match = {
          symbol: textBeforeCursor.charAt(triggerPos),
          query: afterTrigger,
          len: afterTrigger.length + 1,
        }
      }
    }
    if (match) {
      const targetMode: MenuMode = match.symbol === '/' ? 'skills' : 'files'
      if (!isOpen || mode !== targetMode) {
        openMenu(targetMode, match.query, match.len)
      } else {
        hasInlineTrigger = true
        triggerTextLength = match.len
        ui.filterInput.value = match.query
        applyFilter(match.query)
        positionElements()
      }
    } else if (isOpen && hasInlineTrigger) {
      closeMenu()
    }
  }
  const getCurrentListLength = (): number => {
    if (mode === 'refs') return filteredRefs.length
    if (mode === 'skills') return filteredSkills.length
    return browseEntries.length
  }
  document.addEventListener('input', handleEditableInput, true)
  document.addEventListener(
    'keyup',
    (e: KeyboardEvent) => {
      if (e.key === '/' || e.key === '@' || e.key === 'Backspace') handleEditableInput(e)
    },
    true
  )
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (!isOpen) return
      const len = getCurrentListLength()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (mode === 'refs') switchMode('skills', ui.filterInput.value)
        else closeMenu()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        selectedIndex = (selectedIndex + 1) % Math.max(1, len)
        renderList()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        selectedIndex = (selectedIndex - 1 + len) % Math.max(1, len)
        renderList()
      } else if (
        e.key === 'ArrowLeft' &&
        mode === 'files' &&
        ui.filterInput.value === '' &&
        currentDir
      ) {
        e.preventDefault()
        e.stopPropagation()
        navigateUp()
      } else if (e.key === 'ArrowRight' && mode === 'files') {
        const entry = browseEntries.slice(selectedIndex, selectedIndex + 1).find(() => true)
        if (entry?.isDir) {
          e.preventDefault()
          e.stopPropagation()
          navigateToDir(entry.relPath)
        }
      } else if (
        e.key === 'ArrowRight' &&
        mode === 'skills' &&
        document.activeElement !== activeInput
      ) {
        const s = filteredSkills.slice(selectedIndex, selectedIndex + 1).find(() => true)
        if (s && s.refs.length > 0) {
          e.preventDefault()
          activeSkill = s
          mode = 'refs'
          ui.filterInput.value = ''
          applyFilter('')
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        selectCurrentItem(selectedIndex, e.metaKey || e.ctrlKey)
      }
    },
    true
  )
  ui.triggerPill.addEventListener('click', () => {
    if (isOpen) closeMenu()
    else openMenu('skills', '', 0)
  })
  ui.tabSkills.addEventListener('click', () => switchMode('skills', ui.filterInput.value))
  ui.tabFiles.addEventListener('click', () => switchMode('files', ui.filterInput.value))
  ui.btnExport.addEventListener('click', () => {
    closeMenu()
    exportConversationMarkdown(showToast)
  })
  ui.filterInput.addEventListener('input', () => applyFilter(ui.filterInput.value))
  document.addEventListener('mousedown', (e) => {
    if (!isOpen) return
    const path = e.composedPath()
    if (
      !path.includes(ui.popover) &&
      !path.includes(ui.triggerPill) &&
      !resolveEditable(e.target)
    ) {
      closeMenu()
    }
  })
  globalThis.addEventListener('resize', positionElements, { passive: true })
  document.addEventListener('focusin', positionElements, true)
  positionElements()
  globalThis.setTimeout(positionElements, 800)
}
