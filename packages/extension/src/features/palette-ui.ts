import { createLucideIcon, type LucideIconName } from './icons'

export interface PaletteDom {
  host: HTMLDivElement
  triggerPill: HTMLButtonElement
  popover: HTMLDivElement
  tabSkills: HTMLButtonElement
  tabFiles: HTMLButtonElement
  btnExport: HTMLButtonElement
  filterInput: HTMLInputElement
  breadcrumbsEl: HTMLDivElement
  listEl: HTMLDivElement
  statusText: HTMLSpanElement
}

export interface MenuRowOptions {
  icon: LucideIconName
  title: string
  badgeText: string
  isDirBadge: boolean
  isSelected: boolean
  subText?: string
  onSelect: (fullBundle: boolean) => void
}

const PALETTE_CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
}
.pill {
  position: fixed;
  bottom: 18px;
  right: 24px;
  z-index: 2147483647;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(20, 20, 24, 0.94);
  color: #f4f4f5;
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  transition: transform 0.14s ease, border-color 0.14s ease;
}
.pill:hover {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.6);
}
.popover {
  position: fixed;
  bottom: 58px;
  right: 24px;
  width: 520px;
  max-width: calc(100vw - 24px);
  max-height: 420px;
  z-index: 2147483647;
  display: none;
  flex-direction: column;
  background: rgba(18, 18, 22, 0.97);
  color: #f4f4f5;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(16px);
  overflow: hidden;
}
.popover.open {
  display: flex;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 8px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.tab.active {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.12);
}
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #d4d4d8;
  font-size: 11.5px;
  cursor: pointer;
}
.export-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
.search-wrap {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.search-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  padding: 6px 10px;
  color: #f4f4f5;
  font-size: 13px;
  outline: none;
}
.search-input:focus {
  border-color: #3b82f6;
}
.breadcrumbs {
  display: none;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 12px;
  font-size: 11.5px;
  color: #a1a1aa;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.breadcrumbs.visible {
  display: flex;
}
.crumb {
  cursor: pointer;
  color: #93c5fd;
}
.crumb:hover {
  text-decoration: underline;
}
.list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid transparent;
}
.item:hover, .item.active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}
.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.item-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #f4f4f5;
  min-width: 0;
}
.item-title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  color: #a1a1aa;
  white-space: nowrap;
}
.badge.dir {
  background: rgba(59, 130, 246, 0.18);
  color: #93c5fd;
}
.item-sub {
  font-size: 11.5px;
  color: #71717a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 21px;
}
.empty {
  padding: 20px;
  text-align: center;
  font-size: 12.5px;
  color: #71717a;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: #71717a;
}
`

export function createPaletteDom(): PaletteDom {
  const host = document.createElement('div')
  host.id = 'vexel-inline-menu-host'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = PALETTE_CSS

  const triggerPill = document.createElement('button')
  triggerPill.type = 'button'
  triggerPill.className = 'pill'
  const pillLabel = document.createElement('span')
  pillLabel.textContent = 'Vexel'
  triggerPill.append(createLucideIcon('zap', 13), pillLabel)

  const popover = document.createElement('div')
  popover.className = 'popover'

  const header = document.createElement('div')
  header.className = 'header'

  const tabs = document.createElement('div')
  tabs.className = 'tabs'

  const tabSkills = document.createElement('button')
  tabSkills.type = 'button'
  tabSkills.className = 'tab active'
  const skillsLabel = document.createElement('span')
  skillsLabel.textContent = 'Skills (/)'
  tabSkills.append(createLucideIcon('sparkles', 13), skillsLabel)

  const tabFiles = document.createElement('button')
  tabFiles.type = 'button'
  tabFiles.className = 'tab'
  const filesLabel = document.createElement('span')
  filesLabel.textContent = 'Fichiers (@)'
  tabFiles.append(createLucideIcon('folder', 13), filesLabel)

  tabs.append(tabSkills, tabFiles)

  const btnExport = document.createElement('button')
  btnExport.type = 'button'
  btnExport.className = 'export-btn'
  const exportLabel = document.createElement('span')
  exportLabel.textContent = 'Export .md'
  btnExport.append(createLucideIcon('download', 13), exportLabel)

  header.append(tabs, btnExport)

  const searchWrap = document.createElement('div')
  searchWrap.className = 'search-wrap'
  const filterInput = document.createElement('input')
  filterInput.type = 'text'
  filterInput.className = 'search-input'
  filterInput.placeholder = 'Filtrer...'
  searchWrap.append(filterInput)

  const breadcrumbsEl = document.createElement('div')
  breadcrumbsEl.className = 'breadcrumbs'

  const listEl = document.createElement('div')
  listEl.className = 'list'

  const footer = document.createElement('div')
  footer.className = 'footer'
  const statusText = document.createElement('span')
  statusText.textContent = 'Pret'
  const hintText = document.createElement('span')
  hintText.textContent = 'Entree: inserer • Cmd+Entree: complet'
  footer.append(statusText, hintText)

  popover.append(header, searchWrap, breadcrumbsEl, listEl, footer)
  shadow.append(style, triggerPill, popover)
  ;(document.body || document.documentElement).append(host)

  return {
    host,
    triggerPill,
    popover,
    tabSkills,
    tabFiles,
    btnExport,
    filterInput,
    breadcrumbsEl,
    listEl,
    statusText,
  }
}

export function createMenuRow(opts: MenuRowOptions): HTMLDivElement {
  const row = document.createElement('div')
  row.className = opts.isSelected ? 'item active' : 'item'

  const top = document.createElement('div')
  top.className = 'item-row'

  const titleWrap = document.createElement('div')
  titleWrap.className = 'item-title-wrap'
  const titleSpan = document.createElement('span')
  titleSpan.className = 'item-title-text'
  titleSpan.textContent = opts.title
  titleWrap.append(createLucideIcon(opts.icon, 14), titleSpan)

  const badge = document.createElement('span')
  badge.className = opts.isDirBadge ? 'badge dir' : 'badge'
  badge.textContent = opts.badgeText

  top.append(titleWrap, badge)
  row.append(top)

  if (opts.subText) {
    const sub = document.createElement('div')
    sub.className = 'item-sub'
    sub.textContent = opts.subText
    row.append(sub)
  }

  row.addEventListener('mousedown', (e) => {
    e.preventDefault()
    opts.onSelect(e.metaKey || e.ctrlKey)
  })

  return row
}
