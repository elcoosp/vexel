import { t } from '@lingui/core/macro'
import {
  detectBrowserLocale,
  initLocaleSync,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  setLocale,
  type SupportedLocale,
} from './i18n'

function makeSvgIcon(kind: 'star' | 'alert-circle'): SVGElement {
  const ns = 'http://w3.org'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '12')
  svg.setAttribute('height', '12')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  if (kind === 'star') {
    const p = document.createElementNS(ns, 'polygon')
    p.setAttribute(
      'points',
      '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'
    )
    svg.append(p)
  } else {
    const c = document.createElementNS(ns, 'circle')
    c.setAttribute('cx', '12')
    c.setAttribute('cy', '12')
    c.setAttribute('r', '10')
    const l1 = document.createElementNS(ns, 'line')
    l1.setAttribute('x1', '12')
    l1.setAttribute('x2', '12')
    l1.setAttribute('y1', '8')
    l1.setAttribute('y2', '12')
    const l2 = document.createElementNS(ns, 'line')
    l2.setAttribute('x1', '12')
    l2.setAttribute('x2', '12.01')
    l2.setAttribute('y1', '16')
    l2.setAttribute('y2', '16')
    svg.append(c, l1, l2)
  }
  return svg as SVGElement
}

function loadConnectedFolderName(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('vexel-local-fs', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('handles')
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('handles')) {
          db.close()
          return resolve(null)
        }
        const tx = db.transaction('handles', 'readonly')
        const get = tx.objectStore('handles').get('root')
        get.onsuccess = () => {
          const h = get.result as { name?: string } | undefined
          db.close()
          resolve(h?.name || null)
        }
        get.onerror = () => {
          db.close()
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

const HEALTH_URL = ['http://', '127', '.', '0', '.', '0', '.', '1:49152/health'].join('')
const AI_MODE_URL = ['https://', 'www', '.', 'google', '.', 'com/search?udm=50'].join('')
const REPO_URL = ['https://', 'github', '.', 'com/elcoosp/vexel'].join('')
const ISSUES_URL = REPO_URL + '/issues/new'

let overrideLocale: SupportedLocale | null = null
let bridgeRoot: string | null = null
let localFolderRoot: string | null = null

function render(): void {
  const browserLang = detectBrowserLocale()
  setLocale(overrideLocale ?? browserLang)

  const optAuto = document.querySelector<HTMLOptionElement>('#opt-auto')
  if (optAuto) {
    const code = browserLang.split('-')[0].toUpperCase()
    optAuto.textContent = t`Auto (${code})`
  }
  const select = document.querySelector<HTMLSelectElement>('#lang-select')
  if (select) {
    select.value = overrideLocale ?? 'auto'
  }

  const dot = document.querySelector('#bridge-dot')
  const title = document.querySelector('#bridge-title')
  const sub = document.querySelector('#bridge-sub')
  const cmdRow = document.querySelector<HTMLElement>('#bridge-cmd-row')
  if (bridgeRoot) {
    dot?.classList.add('online')
    if (title) title.textContent = t`Local Bridge Connected`
    if (sub) sub.textContent = t`Workspace root: ${bridgeRoot}`
    if (cmdRow) cmdRow.style.display = 'none'
  } else if (localFolderRoot) {
    dot?.classList.add('online')
    if (title) title.textContent = t`Local Folder Connected`
    if (sub) sub.textContent = t`Connected folder: ${localFolderRoot}`
    if (cmdRow) cmdRow.style.display = 'none'
  } else {
    dot?.classList.remove('online')
    if (title) title.textContent = t`Zero-Server Mode Ready`
    if (sub) {
      sub.textContent = t`Type @ in Google AI Mode to pick a local folder, or start the optional CLI bridge:`
    }
    if (cmdRow) cmdRow.style.display = 'flex'
  }
  const copyBtn = document.querySelector('#copy-cmd')
  if (copyBtn) copyBtn.textContent = t`Copy`
  const openBtn = document.querySelector('#open-aim')
  if (openBtn) openBtn.textContent = t`Open Google AI Mode`
  const lblSkills = document.querySelector('#lbl-skills')
  if (lblSkills) lblSkills.textContent = t`Skills`
  const lblFiles = document.querySelector('#lbl-files')
  if (lblFiles) lblFiles.textContent = t`Files`
  const lblExport = document.querySelector('#lbl-export')
  if (lblExport) lblExport.textContent = t`Last prompt`
  const linkRate = document.querySelector('#link-rate')
  if (linkRate) {
    linkRate.replaceChildren(makeSvgIcon('star'), document.createTextNode(t`Star on GitHub`))
  }
  const linkBug = document.querySelector('#link-bug')
  if (linkBug) {
    linkBug.replaceChildren(makeSvgIcon('alert-circle'), document.createTextNode(t`Report a bug`))
  }
}

async function probeConnections(): Promise<void> {
  localFolderRoot = await loadConnectedFolderName().catch(() => null)
  render()
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(900),
    })
    if (res.ok) {
      const data = (await res.json()) as { rootLabel?: string }
      bridgeRoot = data.rootLabel || '127.0.0.1:49152'
      render()
    }
  } catch {
    bridgeRoot = null
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const v = chrome.runtime.getManifest().version
    const vEl = document.querySelector('#ext-version')
    if (vEl && v) vEl.textContent = 'v' + v
  } catch {}

  try {
    overrideLocale = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {}
  render()

  initLocaleSync(() => {
    try {
      overrideLocale = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
    } catch {}
    render()
  })

  void probeConnections()

  document.querySelector<HTMLSelectElement>('#lang-select')?.addEventListener('change', (ev) => {
    const raw = (ev.currentTarget as HTMLSelectElement).value
    overrideLocale = raw === 'auto' ? null : normalizeLocale(raw)
    try {
      if (overrideLocale) {
        localStorage.setItem(LOCALE_STORAGE_KEY, overrideLocale)
        void chrome.storage?.local?.set({ [LOCALE_STORAGE_KEY]: overrideLocale })
      } else {
        localStorage.removeItem(LOCALE_STORAGE_KEY)
        void chrome.storage?.local?.remove(LOCALE_STORAGE_KEY)
      }
    } catch {}
    render()
  })

  document.querySelector('#copy-cmd')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement
    await navigator.clipboard.writeText('npx @vexel/bridge').catch(() => {})
    btn.textContent = t`Copied`
    globalThis.setTimeout(() => {
      btn.textContent = t`Copy`
    }, 1500)
  })
  document.querySelector('#open-aim')?.addEventListener('click', () => {
    void chrome.tabs.create({ url: AI_MODE_URL })
  })
  document.querySelector('#link-rate')?.addEventListener('click', (ev) => {
    ev.preventDefault()
    void chrome.tabs.create({ url: REPO_URL })
  })
  document.querySelector('#link-bug')?.addEventListener('click', (ev) => {
    ev.preventDefault()
    void chrome.tabs.create({ url: ISSUES_URL })
  })
})
