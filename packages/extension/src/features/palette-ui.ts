import { createLucideIcon, type LucideIconName } from './icons'
export interface PaletteDom {
  triggerPill: HTMLButtonElement
  popover: HTMLDivElement
  tabSkills: HTMLButtonElement
  tabFiles: HTMLButtonElement
  btnExport: HTMLButtonElement
  breadcrumbsEl: HTMLDivElement
  filterInput: HTMLInputElement
  listEl: HTMLDivElement
  statusText: HTMLSpanElement
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
  '.tab { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; padding: 4px 8px; border-radius: 6px; cursor: pointer; color: #a1a1aa; background: transparent; border: 1px solid transparent; }',
  '.tab.active { color: #ffffff; background: rgba(59, 130, 246, 0.18); border-color: rgba(59, 130, 246, 0.35); }',
  '.export-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; color: #d4d4d8; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 4px 8px; cursor: pointer; }',
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
  '.item-title-wrap { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 500; color: #f4f4f5; min-width: 0; }',
  '.item-title-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.item-sub { font-size: 11.5px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 21px; }',
  '.badge { font-size: 10.5px; padding: 2px 6px; border-radius: 5px; background: rgba(255, 255, 255, 0.06); color: #a1a1aa; flex-shrink: 0; }',
  '.badge.dir { color: #fcd34d; background: rgba(245, 158, 11, 0.14); }',
  '.footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(14, 14, 17, 0.9); font-size: 11px; color: #71717a; }',
  '.empty { padding: 20px; text-align: center; color: #71717a; font-size: 12.5px; }',
].join('\n')
export function createPaletteDom(): PaletteDom {
  const host = document.createElement('div')
  host.id = 'vexel-inline-menu-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = MENU_CSS
  const triggerPill = document.createElement('button')
  triggerPill.type = 'button'
  triggerPill.className = 'trigger-pill'
  triggerPill.title = 'Menu Vexel (/ skills, @ fichiers)'
  const kbdSlash = document.createElement('kbd')
  kbdSlash.textContent = '/'
  const kbdAt = document.createElement('kbd')
  kbdAt.textContent = '@'
  triggerPill.append(createLucideIcon('zap', 12), 'Vexel', kbdSlash, kbdAt)
  const popover = document.createElement('div')
  popover.className = 'popover'
  const topBar = document.createElement('div')
  topBar.className = 'top-bar'
  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  const tabSkills = document.createElement('button')
  tabSkills.type = 'button'
  tabSkills.className = 'tab active'
  tabSkills.append(createLucideIcon('sparkles', 12), '/ Skills')
  const tabFiles = document.createElement('button')
  tabFiles.type = 'button'
  tabFiles.className = 'tab'
  tabFiles.append(createLucideIcon('folder', 12), '@ Fichiers')
  tabs.append(tabSkills, tabFiles)
  const btnExport = document.createElement('button')
  btnExport.type = 'button'
  btnExport.className = 'export-btn'
  btnExport.append(createLucideIcon('download', 12), 'Exporter .md')
  topBar.append(tabs, btnExport)
  const breadcrumbsEl = document.createElement('div')
  breadcrumbsEl.className = 'breadcrumbs'
  const filterBox = document.createElement('div')
  filterBox.className = 'filter-box'
  const filterInput = document.createElement('input')
  filterInput.type = 'text'
  filterInput.placeholder = 'Filtrer...'
  filterInput.autocomplete = 'off'
  filterBox.append(filterInput)
  const listEl = document.createElement('div')
  listEl.className = 'list'
  const footer = document.createElement('div')
  footer.className = 'footer'
  const statusText = document.createElement('span')
  statusText.textContent = '0 element'
  const hints = document.createElement('span')
  hints.textContent = '↑↓ naviguer • ↵ ouvrir/inserer • ← parent'
  footer.append(statusText, hints)
  popover.append(topBar, breadcrumbsEl, filterBox, listEl, footer)
  shadow.append(styleEl, triggerPill, popover)
  document.body.append(host)
  return {
    triggerPill,
    popover,
    tabSkills,
    tabFiles,
    btnExport,
    breadcrumbsEl,
    filterInput,
    listEl,
    statusText,
  }
}
export function createMenuRow(params: {
  icon: LucideIconName
  title: string
  badgeText: string
  isDirBadge: boolean
  isSelected: boolean
  subText?: string
  onSelect: (fullBundle: boolean) => void
}): HTMLDivElement {
  const item = document.createElement('div')
  item.className = params.isSelected ? 'item active' : 'item'
  const row = document.createElement('div')
  row.className = 'item-row'
  const titleWrap = document.createElement('span')
  titleWrap.className = 'item-title-wrap'
  const titleText = document.createElement('span')
  titleText.className = 'item-title-text'
  titleText.textContent = params.title
  titleWrap.append(createLucideIcon(params.icon, 14), titleText)
  const badge = document.createElement('span')
  badge.className = params.isDirBadge ? 'badge dir' : 'badge'
  badge.textContent = params.badgeText
  row.append(titleWrap, badge)
  item.append(row)
  if (params.subText) {
    const sub = document.createElement('div')
    sub.className = 'item-sub'
    sub.textContent = params.subText
    item.append(sub)
  }
  item.addEventListener('mousedown', (e) => {
    e.preventDefault()
    params.onSelect((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey)
  })
  return item
}
