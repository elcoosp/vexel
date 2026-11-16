import { createLucideIcon } from './icons'
import { MAX_SAFE_LENGTH, uploadAsTextFile } from './untruncate'
import { exportConversationMarkdown } from './thread-tools'
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
const BT1 = String.fromCharCode(96)
const BT3 = String.fromCharCode(96, 96, 96)
function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k car.' : len + ' car.'
}
const MENU_CSS = [
  ':host { all: initial; color-scheme: dark; }',
  '.trigger-pill { position: fixed; z-index: 2147483645; display: none; align-items: center; gap: 6px; background: rgba(24, 24, 27, 0.92); color: #e4e4e7; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; padding: 4px 10px; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; font-size: 11.5px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); backdrop-filter: blur(6px); transition: background 0.15s ease, border-color 0.15s ease; }',
  '.trigger-pill:hover { background: rgba(39, 39, 42, 0.98); border-color: rgba(96, 165, 250, 0.5); color: #ffffff; }',
  '.trigger-pill kbd { font-family: ui-monospace, monospace; font-size: 10px; background: rgba(255, 255, 255, 0.08); padding: 1px 4px; border-radius: 4px; color: #a1a1aa; }',
  '.popover { position: fixed; width: 540px; max-width: 92vw; background: rgba(20, 20, 23, 0.98); border: 1px solid rgba(255, 255, 255, 0.13); border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75); z-index: 2147483646; display: none; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #f4f4f5; }',
  '.popover.open { display: flex; }',
  '.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02); gap: 8px; }',
  '.tabs { display: flex; align-items: center; gap: 6px; }',
  '.tab { font-size: 11.5px; font-weight: 500; padding: 3px 8px; border-radius: 6px; cursor: pointer; color: #a1a1aa; background: transparent; border: 1px solid transparent; }',
  '.tab.active { color: #ffffff; background: rgba(59, 130, 246, 0.18); border-color: rgba(59, 130, 246, 0.35); }',
  '.export-btn { font-size: 11px; font-weight: 500; color: #d4d4d8; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 3px 8px; cursor: pointer; }',
  '.export-btn:hover { background: rgba(255, 255, 255, 0.12); color: #ffffff; }',
  '.breadcrumbs { display: none; align-items: center; flex-wrap: wrap; gap: 4px; padding: 6px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background: rgba(255, 255, 255, 0.015); font-size: 11.5px; color: #a1a1aa; }',
  '.breadcrumbs.visible { display: flex; }',
  '.crumb { cursor: pointer; padding: 2px 5px; border-radius: 4px; color: #d4d4d8; }',
  '.crumb:hover { background: rgba(255, 255, 255, 0.09); color: #ffffff; }',
  '.crumb-sep { color: #52525b; }',
  '.filter-box { padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; gap: 8px; }',
  '.filter-box input { flex: 1; background: transparent; border: none; outline: none; color: #fafafa; font-size: 13px; }',
  '.list { max-height: 290px; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.18) transparent; }',
  '.list::-webkit-scrollbar { width: 6px; height: 6px; }',
  '.list::-webkit-scrollbar-track { background: transparent; }',
  '.list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.16); border-radius: 999px; }',
  '.list::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }',
  '.item { padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; }',
  '.item.active { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.1); }',
  '.item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
  '.item-title { font-size: 13px; font-weight: 500; color: #f4f4f5; }',
  '.item-sub { font-size: 11.5px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.badge { font-size: 10.5px; padding: 2px 6px; border-radius: 5px; background: rgba(255, 255, 255, 0.06); color: #a1a1aa; flex-shrink: 0; }',
  '.badge.dir { color: #fcd34d; background: rgba(245, 158, 11, 0.14); }',
  '.footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(14, 14, 17, 0.9); font-size: 11px; color: #71717a; }',
  '.empty { padding: 20px; text-align: center; color: #71717a; font-size: 12.5px; }',
].join('\n')
export function initCommandPalette(showToast: (msg: string) => void): void {
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
  const host = document.createElement('div')
  host.id = 'vexel-inline-menu-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = MENU_CSS
  shadow.appendChild(styleEl)
  const triggerPill = document.createElement('button')
  triggerPill.type = 'button'
  triggerPill.className = 'trigger-pill'
  triggerPill.title = 'Menu Vexel (/ skills, @ fichiers)'
  triggerPill.append(createLucideIcon('zap', 12), ' Vexel ')
  const kbdSlash = document.createElement('kbd')
  kbdSlash.textContent = '/'
  const kbdAt = document.createElement('kbd')
  kbdAt.textContent = '@'
  triggerPill.appendChild(kbdSlash)
  triggerPill.appendChild(document.createTextNode(' '))
  triggerPill.appendChild(kbdAt)
  shadow.appendChild(triggerPill)
  const popover = document.createElement('div')
  popover.className = 'popover'
  const topBar = document.createElement('div')
  topBar.className = 'top-bar'
  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  const tabSkills = document.createElement('button')
  tabSkills.type = 'button'
  tabSkills.className = 'tab active'
  tabSkills.textContent = '/ Skills'
  const tabFiles = document.createElement('button')
  tabFiles.type = 'button'
  tabFiles.className = 'tab'
  tabFiles.textContent = '@ Fichiers'
  tabs.appendChild(tabSkills)
  tabs.appendChild(tabFiles)
  const btnExport = document.createElement('button')
  btnExport.type = 'button'
  btnExport.className = 'export-btn'
  btnExport.textContent = 'Exporter .md (⌘⇧E)'
  topBar.appendChild(tabs)
  topBar.appendChild(btnExport)
  popover.appendChild(topBar)
  const breadcrumbsEl = document.createElement('div')
  breadcrumbsEl.className = 'breadcrumbs'
  popover.appendChild(breadcrumbsEl)
  const filterBox = document.createElement('div')
  filterBox.className = 'filter-box'
  const filterInput = document.createElement('input')
  filterInput.type = 'text'
  filterInput.placeholder = 'Filtrer...'
  filterInput.autocomplete = 'off'
  filterBox.appendChild(filterInput)
  popover.appendChild(filterBox)
  const listEl = document.createElement('div')
  listEl.className = 'list'
  popover.appendChild(listEl)
  const footer = document.createElement('div')
  footer.className = 'footer'
  const statusText = document.createElement('span')
  statusText.textContent = '0 element'
  const hints = document.createElement('span')
  hints.textContent = '↑↓ naviguer • ↵ ouvrir/inserer • ← dossier parent'
  footer.appendChild(statusText)
  footer.appendChild(hints)
  popover.appendChild(footer)
  shadow.appendChild(popover)
  document.body.appendChild(host)
  function isEditableElement(el: HTMLElement | null): boolean {
    if (!el) return false
    if (el.tagName === 'TEXTAREA') return true
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true
    return false
  }
  function resolveEditable(target: EventTarget | null): HTMLElement | null {
    const node = target as HTMLElement | null
    if (!node) return null
    if (node.tagName === 'TEXTAREA') return node
    const ce = node.closest('[contenteditable="true"]') as HTMLElement | null
    if (ce) return ce
    return isEditableElement(node) ? node : null
  }
  function findVisibleInput(): HTMLElement | null {
    const inputs = document.querySelectorAll('textarea, [contenteditable="true"]')
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs.item(i) as HTMLElement
      if (el.offsetParent !== null) return el
    }
    return null
  }
  function positionElements(): void {
    const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput()
    if (!input) {
      triggerPill.style.display = 'none'
      return
    }
    activeInput = input
    const rect = input.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      triggerPill.style.display = 'none'
      return
    }
    triggerPill.style.display = 'inline-flex'
    triggerPill.style.top = Math.max(8, rect.top - 32) + 'px'
    triggerPill.style.left = Math.max(12, rect.right - 118) + 'px'
    if (isOpen) {
      const popHeight = popover.offsetHeight || 340
      const topPos = rect.top - popHeight - 8
      popover.style.top =
        (topPos > 10 ? topPos : Math.min(window.innerHeight - popHeight - 12, rect.bottom + 8)) +
        'px'
      popover.style.left = Math.max(12, Math.min(window.innerWidth - 552, rect.left)) + 'px'
    }
  }
  function setEmptyMessage(msg: string): void {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = msg
    listEl.replaceChildren(empty)
  }
  function renderBreadcrumbs(): void {
    if (mode !== 'files') {
      breadcrumbsEl.classList.remove('visible')
      return
    }
    breadcrumbsEl.classList.add('visible')
    breadcrumbsEl.replaceChildren()
    const rootBtn = document.createElement('span')
    rootBtn.className = 'crumb'
    rootBtn.textContent = rootLabel
    rootBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      navigateToDir('')
    })
    breadcrumbsEl.appendChild(rootBtn)
    if (!currentDir) return
    const parts = currentDir.split('/')
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts.slice(i, i + 1).find(() => true) || ''
      acc = acc ? acc + '/' + part : part
      const targetPath = acc
      const sep = document.createElement('span')
      sep.className = 'crumb-sep'
      sep.textContent = '/'
      breadcrumbsEl.appendChild(sep)
      const crumb = document.createElement('span')
      crumb.className = 'crumb'
      crumb.textContent = part
      crumb.addEventListener('mousedown', (e) => {
        e.preventDefault()
        navigateToDir(targetPath)
      })
      breadcrumbsEl.appendChild(crumb)
    }
  }
  function navigateToDir(dirPath: string): void {
    currentDir = dirPath
    filterInput.value = ''
    browseDir(currentDir, '')
  }
  function navigateUp(): void {
    if (!currentDir) return
    const idx = currentDir.lastIndexOf('/')
    const parent = idx === -1 ? '' : currentDir.slice(0, idx)
    navigateToDir(parent)
  }
  function fetchSkills(): void {
    setEmptyMessage('Chargement des skills...')
    chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        setEmptyMessage('Bridge local injoignable (127.0.0.1:49152)')
        return
      }
      skills = res.data?.skills || []
      applyFilter(filterInput.value)
    })
  }
  function browseDir(dir: string, query: string): void {
    if (fileFetchTimer) window.clearTimeout(fileFetchTimer)
    fileFetchTimer = window.setTimeout(
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
  function switchMode(newMode: MenuMode, initialQuery = ''): void {
    mode = newMode
    activeSkill = null
    tabSkills.classList.toggle('active', mode === 'skills' || mode === 'refs')
    tabFiles.classList.toggle('active', mode === 'files')
    filterInput.value = initialQuery
    renderBreadcrumbs()
    if (mode === 'skills') {
      filterInput.placeholder = 'Filtrer les skills...'
      if (skills.length === 0) {
        fetchSkills()
      } else {
        applyFilter(initialQuery)
      }
    } else if (mode === 'files') {
      filterInput.placeholder = 'Filtrer ce dossier ou rechercher un fichier...'
      browseDir(currentDir, initialQuery)
    }
  }
  function openMenu(initialMode: MenuMode, initialQuery = '', tokenLen = 0): void {
    hasInlineTrigger = tokenLen > 0
    triggerTextLength = tokenLen
    isOpen = true
    popover.classList.add('open')
    switchMode(initialMode, initialQuery)
    positionElements()
    if (!hasInlineTrigger) {
      filterInput.focus()
    }
  }
  function closeMenu(): void {
    isOpen = false
    hasInlineTrigger = false
    triggerTextLength = 0
    activeSkill = null
    popover.classList.remove('open')
  }
  function applyFilter(qRaw: string): void {
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
    if (mode === 'files') {
      browseDir(currentDir, q)
    }
  }
  function createRow(
    index: number,
    title: string,
    badgeText: string,
    isDirBadge: boolean,
    subText?: string
  ): HTMLDivElement {
    const item = document.createElement('div')
    item.className = index === selectedIndex ? 'item active' : 'item'
    const row = document.createElement('div')
    row.className = 'item-row'
    const titleEl = document.createElement('span')
    titleEl.className = 'item-title'
    titleEl.textContent = title
    const badge = document.createElement('span')
    badge.className = isDirBadge ? 'badge dir' : 'badge'
    badge.textContent = badgeText
    row.appendChild(titleEl)
    row.appendChild(badge)
    item.appendChild(row)
    if (subText) {
      const sub = document.createElement('div')
      sub.className = 'item-sub'
      sub.textContent = subText
      item.appendChild(sub)
    }
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      selectCurrentItem(index, (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey)
    })
    return item
  }
  function renderList(): void {
    listEl.replaceChildren()
    if (mode === 'refs' && activeSkill) {
      statusText.textContent = filteredRefs.length + ' reference(s) — ' + activeSkill.name
      if (filteredRefs.length === 0) {
        setEmptyMessage('Aucune reference correspondante.')
        return
      }
      for (let i = 0; i < filteredRefs.length; i++) {
        const r = filteredRefs.slice(i, i + 1).find(() => true)
        if (r) listEl.appendChild(createRow(i, '📄 ' + r.relPath, formatChars(r.length), false))
      }
    } else if (mode === 'skills') {
      statusText.textContent = filteredSkills.length + ' skill(s)'
      if (filteredSkills.length === 0) {
        setEmptyMessage('Aucun skill correspondant.')
        return
      }
      for (let i = 0; i < filteredSkills.length; i++) {
        const s = filteredSkills.slice(i, i + 1).find(() => true)
        if (s) {
          const badge = (s.refCount > 0 ? s.refCount + ' refs • ' : '') + formatChars(s.smartLength)
          listEl.appendChild(createRow(i, '✦ ' + s.name, badge, false, s.description))
        }
      }
    } else if (mode === 'files') {
      statusText.textContent = browseEntries.length + ' element(s)'
      if (browseEntries.length === 0) {
        setEmptyMessage('Dossier vide ou aucun fichier correspondant.')
        return
      }
      for (let i = 0; i < browseEntries.length; i++) {
        const entry = browseEntries.slice(i, i + 1).find(() => true)
        if (!entry) continue
        const icon = ''
        const badge = entry.isDir ? 'Dossier' : 'Fichier'
        const showSub = filterInput.value.trim().length > 0 ? entry.relPath : undefined
        listEl.appendChild(createRow(i, icon + entry.name, badge, entry.isDir, showSub))
      }
    }
    const active = listEl.querySelector('.item.active')
    if (active) active.scrollIntoView({ block: 'nearest' })
  }
  function getTextBeforeCursor(editable: HTMLElement): string {
    if (editable.tagName === 'TEXTAREA') {
      const ta = editable as HTMLTextAreaElement
      return ta.value.slice(0, ta.selectionStart ?? ta.value.length)
    }
    const sel = window.getSelection()
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
      ta.selectionStart = ta.selectionEnd = start
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    editable.focus()
    const sel = window.getSelection()
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
  function injectContent(content: string, fileName: string, toastMsg: string): void {
    const target = activeInput || findVisibleInput()
    const charsToStrip = hasInlineTrigger ? triggerTextLength : 0
    if (!target) {
      navigator.clipboard.writeText(content)
      showToast(toastMsg + ' (copie)')
      return
    }
    if (charsToStrip > 0) {
      removeTriggerChars(target, charsToStrip)
    }
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
      const prefix = ta.value ? ta.value + '\n\n' : ''
      ta.value = prefix + content
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('insertText', false, content)
    }
    showToast(toastMsg)
  }
  function selectCurrentItem(idx = selectedIndex, fullBundle = false): void {
    const charsToStrip = hasInlineTrigger ? triggerTextLength : 0
    if (mode === 'refs' && activeSkill) {
      const ref = filteredRefs.slice(idx, idx + 1).find(() => true)
      if (!ref) return
      const skillName = activeSkill.name
      closeMenu()
      hasInlineTrigger = charsToStrip > 0
      triggerTextLength = charsToStrip
      injectContent(
        '## Reference (' + skillName + ') : ' + ref.relPath + '\n\n' + ref.content,
        ref.relPath.split('/').join('-'),
        'Reference "' + ref.relPath + '" ajoutee'
      )
      hasInlineTrigger = false
      triggerTextLength = 0
      return
    }
    if (mode === 'skills') {
      const skill = filteredSkills.slice(idx, idx + 1).find(() => true)
      if (!skill) return
      closeMenu()
      hasInlineTrigger = charsToStrip > 0
      triggerTextLength = charsToStrip
      const payload = fullBundle ? skill.fullContent : skill.smartContent
      injectContent(payload, skill.id + '.md', 'Skill "' + skill.name + '" ajoute')
      hasInlineTrigger = false
      triggerTextLength = 0
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
    const lastSlash = textBeforeCursor.lastIndexOf('/')
    const lastAt = textBeforeCursor.lastIndexOf('@')
    const triggerPos = Math.max(lastSlash, lastAt)
    let match: { symbol: string; query: string; len: number } | null = null
    if (triggerPos !== -1) {
      const prevChar = triggerPos === 0 ? ' ' : textBeforeCursor.charAt(triggerPos - 1)
      const afterTrigger = textBeforeCursor.slice(triggerPos + 1)
      if (/\s/.test(prevChar) && !/\s/.test(afterTrigger)) {
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
        filterInput.value = match.query
        applyFilter(match.query)
        positionElements()
      }
    } else if (isOpen && hasInlineTrigger) {
      closeMenu()
    }
  }
  document.addEventListener('input', handleEditableInput, true)
  document.addEventListener(
    'keyup',
    (e: KeyboardEvent) => {
      if (e.key === '/' || e.key === '@' || e.key === 'Backspace') {
        handleEditableInput(e)
      }
    },
    true
  )
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (!isOpen) return
      const len =
        mode === 'refs'
          ? filteredRefs.length
          : mode === 'skills'
            ? filteredSkills.length
            : browseEntries.length
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (mode === 'refs') {
          switchMode('skills', filterInput.value)
        } else {
          closeMenu()
        }
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
        filterInput.value === '' &&
        currentDir
      ) {
        e.preventDefault()
        e.stopPropagation()
        navigateUp()
      } else if (e.key === 'ArrowRight' && mode === 'files') {
        const entry = browseEntries.slice(selectedIndex, selectedIndex + 1).find(() => true)
        if (entry && entry.isDir) {
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
          filterInput.value = ''
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
  triggerPill.addEventListener('click', () => {
    if (isOpen) closeMenu()
    else openMenu('skills', '', 0)
  })
  tabSkills.addEventListener('click', () => switchMode('skills', filterInput.value))
  tabFiles.addEventListener('click', () => switchMode('files', filterInput.value))
  btnExport.addEventListener('click', () => {
    closeMenu()
    exportConversationMarkdown(showToast)
  })
  filterInput.addEventListener('input', () => applyFilter(filterInput.value))
  document.addEventListener('mousedown', (e) => {
    if (!isOpen) return
    const path = e.composedPath()
    if (!path.includes(popover) && !path.includes(triggerPill) && !resolveEditable(e.target)) {
      closeMenu()
    }
  })
  window.addEventListener('resize', positionElements, { passive: true })
  window.addEventListener('scroll', positionElements, { passive: true })
  document.addEventListener('focusin', positionElements, true)
}
