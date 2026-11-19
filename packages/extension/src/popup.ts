const STRINGS = {
  en: {
    zeroTitle: 'Zero-Server Mode Ready',
    zeroSub: 'Type @ in Google AI Mode to pick a local folder, or start the optional CLI bridge:',
    onlineTitle: 'Local Bridge Connected',
    onlineSub: 'Workspace root: ',
    copy: 'Copy',
    copied: 'Copied',
    openAim: 'Open Google AI Mode',
    skills: 'Skills',
    files: 'Files',
    exportMd: 'Export .md',
  },
  fr: {
    zeroTitle: 'Mode Zéro-Serveur actif',
    zeroSub: 'Tapez @ dans Google AI Mode pour choisir un dossier local, ou lancez le bridge CLI optionnel :',
    onlineTitle: 'Bridge local connecté',
    onlineSub: 'Dossier actif : ',
    copy: 'Copier',
    copied: 'Copié',
    openAim: 'Ouvrir Google AI Mode',
    skills: 'Skills',
    files: 'Fichiers',
    exportMd: 'Export .md',
  },
} as const;

type Locale = 'en' | 'fr';

function getLocale(): Locale {
  try {
    const saved = localStorage.getItem('vexel:popup-locale');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {}
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let currentLocale: Locale = getLocale();
let bridgeRoot: string | null = null;

function render(): void {
  const s = STRINGS[currentLocale];
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) langBtn.textContent = currentLocale.toUpperCase();

  const dot = document.getElementById('bridge-dot');
  const title = document.getElementById('bridge-title');
  const sub = document.getElementById('bridge-sub');
  const cmdRow = document.getElementById('bridge-cmd-row');

  if (bridgeRoot) {
    dot?.classList.add('online');
    if (title) title.textContent = s.onlineTitle;
    if (sub) sub.textContent = s.onlineSub + bridgeRoot;
    if (cmdRow) cmdRow.style.display = 'none';
  } else {
    dot?.classList.remove('online');
    if (title) title.textContent = s.zeroTitle;
    if (sub) sub.textContent = s.zeroSub;
    if (cmdRow) cmdRow.style.display = 'flex';
  }

  const copyBtn = document.getElementById('copy-cmd');
  if (copyBtn) copyBtn.textContent = s.copy;
  const openBtn = document.getElementById('open-aim');
  if (openBtn) openBtn.textContent = s.openAim;
  const lblSkills = document.getElementById('lbl-skills');
  if (lblSkills) lblSkills.textContent = s.skills;
  const lblFiles = document.getElementById('lbl-files');
  if (lblFiles) lblFiles.textContent = s.files;
  const lblExport = document.getElementById('lbl-export');
  if (lblExport) lblExport.textContent = s.exportMd;
}

async function probeBridge(): Promise<void> {
  try {
    const res = await fetch('http://127.0.0', {
      signal: AbortSignal.timeout(900),
    });
    if (res.ok) {
      const data = (await res.json()) as { rootLabel?: string };
      bridgeRoot = data.rootLabel || '127.0.0.1:49152';
      render();
    }
  } catch {
    bridgeRoot = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const v = chrome.runtime.getManifest().version;
    const vEl = document.getElementById('ext-version');
    if (vEl && v) vEl.textContent = 'v' + v;
  } catch {}

  render();
  void probeBridge();

  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    currentLocale = currentLocale === 'en' ? 'fr' : 'en';
    try {
      localStorage.setItem('vexel:popup-locale', currentLocale);
    } catch {}
    render();
  });

  document.getElementById('copy-cmd')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    await navigator.clipboard.writeText('npx @vexel/bridge').catch(() => {});
    btn.textContent = STRINGS[currentLocale].copied;
    window.setTimeout(() => {
      btn.textContent = STRINGS[currentLocale].copy;
    }, 1500);
  });

  document.getElementById('open-aim')?.addEventListener('click', () => {
    void chrome.tabs.create({ url: 'https://google.com' });
  });
});
