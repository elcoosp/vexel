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

const STRINGS = {
  en: {
    zeroTitle: 'Zero-Server Mode Ready',
    zeroSub: 'Type @ in Google AI Mode to pick a local folder, or start the optional CLI bridge:',
    folderTitle: 'Local Folder Connected',
    folderSub: 'Connected folder: ',
    onlineTitle: 'Local Bridge Connected',
    onlineSub: 'Workspace root: ',
    copy: 'Copy',
    copied: 'Copied',
    openAim: 'Open Google AI Mode',
    skills: 'Skills',
    files: 'Files',
    lastPrompt: 'Last prompt',
    rate: 'Star on GitHub',
    bug: 'Report a bug',
  },
  fr: {
    zeroTitle: 'Mode Zéro-Serveur actif',
    zeroSub:
      'Tapez @ dans Google AI Mode pour choisir un dossier local, ou lancez le bridge CLI optionnel :',
    folderTitle: 'Dossier local connecté',
    folderSub: 'Dossier actif : ',
    onlineTitle: 'Bridge local connecté',
    onlineSub: 'Dossier actif : ',
    copy: 'Copier',
    copied: 'Copié',
    openAim: 'Ouvrir Google AI Mode',
    skills: 'Skills',
    files: 'Fichiers',
    lastPrompt: 'Dernier prompt',
    rate: 'Étoiler sur GitHub',
    bug: 'Signaler un bug',
  },
} as const
const HEALTH_URL = ['http://', '127', '.', '0', '.', '0', '.', '1:49152/health'].join('')
const AI_MODE_URL = ['https://', 'www', '.', 'google', '.', 'com/search?udm=50'].join('')
const REPO_URL = ['https://', 'github', '.', 'com/elcoosp/vexel'].join('')
const ISSUES_URL = REPO_URL + '/issues/new'
type Locale = 'en' | 'fr'
function getLocale(): Locale {
  try {
    const saved = localStorage.getItem('vexel:popup-locale')
    if (saved === 'en' || saved === 'fr') return saved
  } catch {}
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
let currentLocale: Locale = getLocale()
let bridgeRoot: string | null = null
let localFolderRoot: string | null = null
function render(): void {
  const s = STRINGS[currentLocale]
  const langBtn = document.querySelector('#lang-toggle')
  if (langBtn) langBtn.textContent = currentLocale.toUpperCase()
  const dot = document.querySelector('#bridge-dot')
  const title = document.querySelector('#bridge-title')
  const sub = document.querySelector('#bridge-sub')
  const cmdRow = document.querySelector<HTMLElement>('#bridge-cmd-row')
  if (bridgeRoot) {
    dot?.classList.add('online')
    if (title) title.textContent = s.onlineTitle
    if (sub) sub.textContent = s.onlineSub + bridgeRoot
    if (cmdRow) cmdRow.style.display = 'none'
  } else if (localFolderRoot) {
    dot?.classList.add('online')
    if (title) title.textContent = s.folderTitle
    if (sub) sub.textContent = s.folderSub + localFolderRoot
    if (cmdRow) cmdRow.style.display = 'none'
  } else {
    dot?.classList.remove('online')
    if (title) title.textContent = s.zeroTitle
    if (sub) sub.textContent = s.zeroSub
    if (cmdRow) cmdRow.style.display = 'flex'
  }
  const copyBtn = document.querySelector('#copy-cmd')
  if (copyBtn) copyBtn.textContent = s.copy
  const openBtn = document.querySelector('#open-aim')
  if (openBtn) openBtn.textContent = s.openAim
  const lblSkills = document.querySelector('#lbl-skills')
  if (lblSkills) lblSkills.textContent = s.skills
  const lblFiles = document.querySelector('#lbl-files')
  if (lblFiles) lblFiles.textContent = s.files
  const lblExport = document.querySelector('#lbl-export')
  if (lblExport) lblExport.textContent = s.lastPrompt
  const linkRate = document.querySelector('#link-rate')
  if (linkRate) {
    linkRate.replaceChildren(makeSvgIcon('star'), document.createTextNode(s.rate))
  }
  const linkBug = document.querySelector('#link-bug')
  if (linkBug) {
    linkBug.replaceChildren(makeSvgIcon('alert-circle'), document.createTextNode(s.bug))
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
  render()
  void probeConnections()
  document.querySelector('#lang-toggle')?.addEventListener('click', () => {
    currentLocale = currentLocale === 'en' ? 'fr' : 'en'
    try {
      localStorage.setItem('vexel:popup-locale', currentLocale)
    } catch {}
    render()
  })
  document.querySelector('#copy-cmd')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement
    await navigator.clipboard.writeText('npx @vexel/bridge').catch(() => {})
    btn.textContent = STRINGS[currentLocale].copied
    globalThis.setTimeout(() => {
      btn.textContent = STRINGS[currentLocale].copy
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
