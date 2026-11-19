import { t, plural } from '@lingui/core/macro';
import '../i18n';
import { browseLocalFs, packLocalFsFolder, pickLocalFolder, readLocalFsFile } from './local-fs';
import { openOnboardingModal } from './onboarding';
import { animate } from 'motion';
import { createLucideIcon, createFileOrFolderIcon } from './icons';
import { MAX_SAFE_LENGTH, uploadAsTextFile } from './file-upload';
import { copyCleanThread, exportConversationMarkdown } from './thread-tools';
import { BUILTIN_SKILLS } from './builtin-skills';

import { type RefFile, type SkillItem, type RemoteSkill, type BrowseEntry, type MenuMode, BT1, BT3, formatChars, DOCK_CSS, POPOVER_CSS } from './palette-ui';

export function initCommandPalette(showToast: (msg: string) => void): void {
  let isOpen = false;
  let mode: MenuMode = 'skills';
  let triggerTextLength = 0;
  let hasInlineTrigger = false;
  let activeInput: HTMLElement | null = null;
  let skills: SkillItem[] = [...BUILTIN_SKILLS];
  let filteredSkills: SkillItem[] = [];
  let remoteSkills: RemoteSkill[] = [];
  let remoteTimer: number | undefined;
  const installingSkills = new Set<string>();
  const RECENT_FILES_KEY = 'vexel:recent-files';
  type RecentEntry = { name: string; relPath: string; isDir: boolean };
  let recentEntries: RecentEntry[] = (() => {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  })();
  let visibleFileItems: RecentEntry[] = [];

  function recordRecentEntry(entry: RecentEntry): void {
    if (!entry.relPath || entry.name === '.. (Parent folder)') return;
    recentEntries = [
      { name: entry.name, relPath: entry.relPath, isDir: entry.isDir },
      ...recentEntries.filter((x) => x.relPath !== entry.relPath),
    ].slice(0, 5);
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentEntries));
    } catch {}
  }

  function getActiveRecentEntries(qRaw: string): RecentEntry[] {
    if (currentDir || recentEntries.length === 0) return [];
    const q = qRaw.trim().toLowerCase();
    if (!q) return recentEntries;
    return recentEntries.filter(
      (r) => r.name.toLowerCase().includes(q) || r.relPath.toLowerCase().includes(q)
    );
  }
  let isLoadingSkills = false;
  let isSearchingRemote = false;
  const removingSkills = new Set<string>();
  let confirmDeleteId: string | null = null;
  let confirmDeleteTimer: number | undefined;
  let activeSkill: SkillItem | null = null;
  let filteredRefs: RefFile[] = [];
  let currentDir = '';
  let isZeroServerFs = false;
  let rootLabel = '~';
  let browseEntries: BrowseEntry[] = [];
  let selectedIndex = 0;
  let fileFetchTimer: number | undefined;
  let rowElements: HTMLDivElement[] = [];

  // 1. Dock integre directement dans la barre d'outils de l'input Google (.o8Wipc)
  const dockHost = document.createElement('span');
  dockHost.id = 'vexel-input-dock-host';
  const dockShadow = dockHost.attachShadow({ mode: 'open' });
  const dockStyle = document.createElement('style');
  dockStyle.textContent = DOCK_CSS;

  const dockBtn = document.createElement('button');
  dockBtn.type = 'button';
  dockBtn.className = 'dock-btn';
  dockBtn.title = t`Vexel — Skills (/) & Files (@)`;
  const zapIcon = createLucideIcon('zap', 13, '#1a73e8');
  dockBtn.append(zapIcon, document.createTextNode('Vexel'));

  const keysWrap = document.createElement('span');
  keysWrap.className = 'dock-keys';
  const kSlash = document.createElement('kbd');
  kSlash.textContent = '/';
  const kAt = document.createElement('kbd');
  kAt.textContent = '@';
  keysWrap.append(kSlash, kAt);
  dockBtn.appendChild(keysWrap);

  dockShadow.append(dockStyle, dockBtn);

  // Micro-interaction tactile sur le bouton Dock (spring detent style interior.dev)
  dockBtn.addEventListener('pointerdown', () => {
    animate(dockBtn, { scale: 0.95 }, { duration: 0.1 });
  });
  dockBtn.addEventListener('pointerup', () => {
    animate(dockBtn, { scale: 1 }, { type: 'spring', stiffness: 600, damping: 28 });
  });
  dockBtn.addEventListener('pointerleave', () => {
    animate(dockBtn, { scale: 1 }, { type: 'spring', stiffness: 500, damping: 30 });
  });

  // 2. Popover flottant ancre au-dessus du conteneur de saisie Google
  const popHost = document.createElement('div');
  popHost.id = 'vexel-inline-menu-host';
  const shadow = popHost.attachShadow({ mode: 'open' });

const styleEl = document.createElement('style');
styleEl.textContent = POPOVER_CSS;
shadow.appendChild(styleEl);
const popover = document.createElement('div');
popover.className = 'popover';
const header = document.createElement('div');
header.className = 'header';
const tabs = document.createElement('div');
tabs.className = 'tabs';
const tabPill = document.createElement('div');
tabPill.className = 'tab-pill';
const tabSkills = document.createElement('button');
tabSkills.type = 'button';
tabSkills.className = 'tab active';
tabSkills.append(createLucideIcon('sparkles', 12), document.createTextNode(t`Skills`));
const tabFiles = document.createElement('button');
tabFiles.type = 'button';
tabFiles.className = 'tab';
tabFiles.append(createLucideIcon('folder', 12), document.createTextNode(t`Files`));
tabs.append(tabPill, tabSkills, tabFiles);
const btnExport = document.createElement('button');
btnExport.type = 'button';
btnExport.className = 'export-btn';
const setExportIdle = () => {
btnExport.classList.remove('done');
btnExport.replaceChildren(createLucideIcon('download', 12), document.createTextNode(t`Export .md`));
};
setExportIdle();
const headerRight = document.createElement('div');
  headerRight.style.display = 'inline-flex';
  headerRight.style.alignItems = 'center';
  headerRight.style.gap = '6px';
  const btnTour = document.createElement('button');
  btnTour.type = 'button';
  btnTour.className = 'export-btn';
  btnTour.title = t`Interactive welcome tour & local folder setup`;
  btnTour.textContent = '?';
  Object.assign(btnTour.style, { width: '28px', height: '28px', minWidth: '28px', padding: '0', borderRadius: '999px', justifyContent: 'center' });
  btnTour.addEventListener('click', () => {
    closeMenu();
    openOnboardingModal(showToast);
  });
  const btnCopy = document.createElement('button');
  btnCopy.type = 'button';
  btnCopy.className = 'export-btn';
  btnCopy.title = t`Copy clean Markdown thread to clipboard`;
  const setCopyIdle = () => {
    btnCopy.classList.remove('done');
    btnCopy.replaceChildren(createLucideIcon('copy', 12), document.createTextNode(t`Copy`));
  };
  setCopyIdle();
  btnCopy.addEventListener('click', async () => {
    animate(btnCopy, { scale: Array(0.95, 1) }, { type: 'spring', stiffness: 550, damping: 28 });
    const ok = await copyCleanThread(showToast);
    if (ok) {
      btnCopy.classList.add('done');
      btnCopy.replaceChildren(createLucideIcon('check', 12, '#137333'), document.createTextNode(t`Copied`));
      window.setTimeout(setCopyIdle, 1600);
    }
  });
  headerRight.append(btnCopy, btnExport, btnTour);
  header.append(tabs, headerRight);
popover.appendChild(header);
const breadcrumbsEl = document.createElement('div');
breadcrumbsEl.className = 'breadcrumbs';
popover.appendChild(breadcrumbsEl);
const searchRow = document.createElement('div');
searchRow.className = 'search-row';
const filterInput = document.createElement('input');
filterInput.type = 'text';
filterInput.placeholder = t`Search a skill or file...`;
filterInput.autocomplete = 'off';
searchRow.appendChild(filterInput);
popover.appendChild(searchRow);
const listEl = document.createElement('div');
listEl.className = 'list';
const rowHighlight = document.createElement('div');
rowHighlight.className = 'row-highlight';
listEl.appendChild(rowHighlight);
popover.appendChild(listEl);
const footer = document.createElement('div');
footer.className = 'footer';
const statusText = document.createElement('span');
statusText.textContent = plural(0, { one: '# item', other: '# items' });
const hints = document.createElement('span');
hints.textContent = t`Navigate: arrows | Insert: Enter | Parent: left`;
footer.append(statusText, hints);
popover.appendChild(footer);
shadow.appendChild(popover);
document.body.appendChild(popHost);
// Segmented Control coulissant ("The selection travels. Nothing jumps.")
function syncSegmentedPill(instant = false): void {
const activeTab = mode === 'files' ? tabFiles : tabSkills;
const x = activeTab.offsetLeft - 3;
const w = activeTab.offsetWidth;
if (w === 0) return;
kSlash.classList.toggle('lit', isOpen && mode !== 'files');
kAt.classList.toggle('lit', isOpen && mode === 'files');
if (instant) {
tabPill.style.width = w + 'px';
tabPill.style.transform = 'translateX(' + x + 'px)';
return;
}
animate(
tabPill,
{ x, width: w },
{ type: 'spring', stiffness: 520, damping: 36, mass: 0.8 }
);
}
// Curseur glissant sur la ligne active de la liste
function syncActiveRowHighlight(instant = false): void {
for (let i = 0; i < rowElements.length; i++) {
rowElements[i].classList.toggle('active', i === selectedIndex);
}
const targetRow = rowElements[selectedIndex];
if (!targetRow) {
rowHighlight.style.opacity = '0';
return;
}
rowHighlight.style.opacity = '1';
const y = targetRow.offsetTop;
const h = targetRow.offsetHeight;
if (instant) {
rowHighlight.style.height = h + 'px';
rowHighlight.style.transform = 'translateY(' + y + 'px)';
} else {
animate(
rowHighlight,
{ y, height: h },
{ type: 'spring', stiffness: 560, damping: 38, mass: 0.7 }
);
}
targetRow.scrollIntoView({ block: 'nearest' });
}
function isEditableElement(el: HTMLElement | null): boolean {
if (!el) return false;
if (el.tagName === 'TEXTAREA') return true;
if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
return false;
}
function resolveEditable(target: EventTarget | null): HTMLElement | null {
const node = target as HTMLElement | null;
if (!node) return null;
if (node.tagName === 'TEXTAREA') return node;
const ce = node.closest('[contenteditable="true"]') as HTMLElement | null;
if (ce) return ce;
return isEditableElement(node) ? node : null;
}
function findVisibleInput(): HTMLElement | null {
const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
for (let i = 0; i < inputs.length; i++) {
const el = inputs.item(i) as HTMLElement;
if (el.offsetParent !== null) return el;
}
return null;
}
function findInputPlate(input: HTMLElement): HTMLElement {
return (
input.closest('[data-xid="aim-mars-input-plate"], .AgWCw') ||
input.parentElement ||
input
);
}
let observedPlate: HTMLElement | null = null;
const plateObserver = new ResizeObserver(() => {
if (isOpen) positionPopover();
});
function mountDockIntoInput(): void {
if (dockHost.isConnected && dockHost.parentElement?.classList.contains('o8Wipc')) return;
const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput();
if (!input) return;
activeInput = input;
const plate = findInputPlate(input);
if (plate !== observedPlate) {
plateObserver.disconnect();
plateObserver.observe(plate);
observedPlate = plate;
}
const toolbarRow = plate.querySelector('.o8Wipc');
if (toolbarRow) {
if (dockHost.parentElement !== toolbarRow) {
dockHost.style.position = '';
dockHost.style.top = '';
dockHost.style.left = '';
dockHost.style.alignSelf = '';
dockHost.style.marginRight = '';
const chipsContainer = toolbarRow.querySelector('.rJkohe');
if (chipsContainer) {
toolbarRow.insertBefore(dockHost, chipsContainer);
} else {
toolbarRow.appendChild(dockHost);
}
animate(dockBtn, { opacity: 1, scale: 1 }, { type: 'spring', stiffness: 460, damping: 32 });
}
return;
}
const searchRow = plate.querySelector('.SDkEP') || (plate.classList.contains('SDkEP') ? plate : null);
if (searchRow) {
if (dockHost.parentElement !== searchRow) {
dockHost.style.position = '';
dockHost.style.top = '';
dockHost.style.left = '';
dockHost.style.alignSelf = 'center';
dockHost.style.marginRight = '4px';
const rightTools = searchRow.querySelector('.dRYYxd');
if (rightTools) {
searchRow.insertBefore(dockHost, rightTools);
} else {
searchRow.appendChild(dockHost);
}
animate(dockBtn, { opacity: 1, scale: 1 }, { type: 'spring', stiffness: 460, damping: 32 });
}
return;
}
if (dockHost.parentElement !== document.body) {
document.body.appendChild(dockHost);
}
const rect = plate.getBoundingClientRect();
if (rect.width > 0 && rect.height > 0) {
dockHost.style.position = 'fixed';
dockHost.style.zIndex = '2147483645';
dockHost.style.top = rect.bottom + 8 + 'px';
dockHost.style.left = Math.max(12, rect.right - 122) + 'px';
}
}
function positionPopover(): void {
  if (!isOpen) return;
const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput();
if (!input) return;
const plate = findInputPlate(input);
const rect = plate.getBoundingClientRect();
if (rect.width === 0 || rect.height === 0) return;
const targetWidth = Math.max(360, Math.min(680, Math.round(rect.width)));
const widthStr = targetWidth + 'px';
const popHeight = popover.offsetHeight || 360;
if (popover.style.width !== widthStr) popover.style.width = widthStr;
const topAbove = rect.top - popHeight - 10;
const finalTop =
topAbove >= 12 ? topAbove : Math.min(window.innerHeight - popHeight - 12, rect.bottom + 10);
const alignedLeft = rect.left + (rect.width - targetWidth) / 2;
const finalLeft = Math.max(12, Math.min(window.innerWidth - targetWidth - 12, alignedLeft));
if (topAbove >= 12) {
      popover.style.top = 'auto';
      popover.style.bottom = Math.round(window.innerHeight - rect.top + 10) + 'px';
    } else {
      popover.style.bottom = 'auto';
      popover.style.top = Math.round(finalTop) + 'px';
    }
    popover.style.left = Math.round(finalLeft) + 'px';
}
let heightAnim: { stop?: () => void; finished?: Promise<unknown> } | null = null;
function animatePanelHeight(mutate: () => void): void {
  if (!isOpen || !popover.classList.contains("open")) { mutate(); return; }
  const prevHeight = popover.getBoundingClientRect().height;
  if (prevHeight <= 0) { mutate(); return; }
  if (heightAnim?.stop) heightAnim.stop();
  popover.style.height = "auto";
  mutate();
  const nextHeight = popover.getBoundingClientRect().height;
  if (Math.abs(nextHeight - prevHeight) < 2) { popover.style.height = "auto"; return; }
  popover.style.height = prevHeight + "px";
  heightAnim = animate(
    popover,
    { height: [prevHeight + "px", nextHeight + "px"] },
    { type: "spring", stiffness: 460, damping: 36, mass: 0.8 }
  ) as unknown as { stop?: () => void; finished?: Promise<unknown> };
  heightAnim.finished?.then(() => { if (isOpen) popover.style.height = "auto"; });
}

function setEmptyMessage(msg: string): void {
rowElements = [];
rowHighlight.style.opacity = '0';
const empty = document.createElement('div');
empty.className = 'empty';
empty.textContent = msg;
listEl.replaceChildren(rowHighlight, empty);
}
function renderBreadcrumbs(): void {
if (mode !== 'files') {
breadcrumbsEl.classList.remove('visible');
return;
}
breadcrumbsEl.classList.add('visible');
breadcrumbsEl.replaceChildren();
const rootBtn = document.createElement('span');
rootBtn.className = 'crumb';
rootBtn.textContent = rootLabel;
rootBtn.addEventListener('mousedown', (e) => {
e.preventDefault();
navigateToDir('');
});
breadcrumbsEl.appendChild(rootBtn);
if (isZeroServerFs) {
  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.textContent = t`Switch folder`;
  Object.assign(switchBtn.style, {
    marginLeft: 'auto',
    border: '1px solid #dadce0',
    background: '#ffffff',
    color: '#1967d2',
    borderRadius: '999px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  });
  switchBtn.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const h = await pickLocalFolder();
    if (h) {
      recentEntries = [];
      try { localStorage.removeItem(RECENT_FILES_KEY); } catch {}
      const folderName = h.name;
      showToast(t`Connected folder: ${folderName}`);
      browseDir('', '');
    }
  });
  breadcrumbsEl.appendChild(switchBtn);
}
if (!currentDir) return;
const parts = currentDir.split('/');
let acc = '';
for (let i = 0; i < parts.length; i++) {
const part = parts.slice(i, i + 1).find(() => true) || '';
acc = acc ? acc + '/' + part : part;
const targetPath = acc;
const sep = document.createElement('span');
sep.className = 'crumb-sep';
sep.textContent = '/';
breadcrumbsEl.appendChild(sep);
const crumb = document.createElement('span');
crumb.className = 'crumb';
crumb.textContent = part;
crumb.addEventListener('mousedown', (e) => {
e.preventDefault();
navigateToDir(targetPath);
});
breadcrumbsEl.appendChild(crumb);
}
}
function navigateToDir(dirPath: string): void {
currentDir = dirPath;
filterInput.value = '';
browseDir(currentDir, '');
}
function navigateUp(): void {
if (!currentDir) return;
const idx = currentDir.lastIndexOf('/');
const parent = idx === -1 ? '' : currentDir.slice(0, idx);
navigateToDir(parent);
}
function fetchSkills(): void {
setEmptyMessage(t`Loading skills...`);
chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (res) => {
if (chrome.runtime.lastError || !res?.ok) {
setEmptyMessage(t`Local bridge unreachable (127.0.0.1:49152)`);
return;
}
skills = res.data?.skills || [];
applyFilter(filterInput.value);
});
}
function browseDir(dir: string, query: string): void {
if (fileFetchTimer) window.clearTimeout(fileFetchTimer);
fileFetchTimer = window.setTimeout(
() => {
chrome.runtime.sendMessage({ type: 'BROWSE_DIR', dir, query }, async (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          isZeroServerFs = true;
          const local = await browseLocalFs(dir, query, false);
          if (!local.ok) {
            listEl.replaceChildren();
            const wrap = document.createElement('div');
            Object.assign(wrap.style, { padding: '22px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' });
            const msg = document.createElement('div');
            msg.textContent = t`Connect a local project folder to browse, pack & save files—zero server required.`;
            Object.assign(msg.style, { fontSize: '12.5px', color: '#5f6368', maxWidth: '300px', lineHeight: '1.45' });
            const pickBtn = document.createElement('button');
            pickBtn.type = 'button';
            pickBtn.textContent = t`Open Local Folder`;
            Object.assign(pickBtn.style, { padding: '7px 14px', borderRadius: '999px', border: 'none', background: '#1a73e8', color: '#fff', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' });
            pickBtn.addEventListener('mousedown', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const h = await pickLocalFolder();
              if (h) {
                recentEntries = [];
                try { localStorage.removeItem(RECENT_FILES_KEY); } catch {}
                showToast('Connected folder: ' + h.name);
                browseDir('', '');
              }
            });
            wrap.append(msg, pickBtn);
            listEl.appendChild(wrap);
            statusText.textContent = t`Zero-server mode`;
            return;
          }
          rootLabel = local.rootLabel || t`Folder`;
          currentDir = local.dir || '';
          const rawEntries: BrowseEntry[] = local.entries || [];
          if (!query && currentDir) {
            const idx = currentDir.lastIndexOf('/');
            const parentPath = idx === -1 ? '' : currentDir.slice(0, idx);
            browseEntries = [{ name: '.. (Parent folder)', relPath: parentPath, isDir: true }, ...rawEntries];
          } else {
            browseEntries = rawEntries;
          }
          selectedIndex = 0;
          animatePanelHeight(() => { renderBreadcrumbs(); });
          renderList();
          return;
        }
isZeroServerFs = false;
        rootLabel = res.data?.rootLabel || '~';
currentDir = res.data?.dir || '';
const rawEntries: BrowseEntry[] = res.data?.entries || [];
if (!query && currentDir) {
const idx = currentDir.lastIndexOf('/');
const parentPath = idx === -1 ? '' : currentDir.slice(0, idx);
browseEntries = [
{ name: '.. (Parent folder)', relPath: parentPath, isDir: true },
...rawEntries,
];
} else {
browseEntries = rawEntries;
}
selectedIndex = 0;
animatePanelHeight(() => {
      renderBreadcrumbs();
    });
renderList();
});
},
query ? 90 : 0
);
}
function switchMode(newMode: MenuMode, initialQuery = '', instantPill = false): void {
mode = newMode;
activeSkill = null;
tabSkills.classList.toggle('active', mode === 'skills' || mode === 'refs');
tabFiles.classList.toggle('active', mode === 'files');
syncSegmentedPill(instantPill);
filterInput.value = initialQuery;
renderBreadcrumbs();
if (mode === 'skills') {
filterInput.placeholder = t`Filter skills...`;
if (skills.length === 0) fetchSkills();
else applyFilter(initialQuery);
} else if (mode === 'files') {
filterInput.placeholder = t`Filter this folder or search files...`;
setEmptyMessage(t`Loading files...`);
browseDir(currentDir, initialQuery);
}
window.requestAnimationFrame(positionPopover);
}
function openMenu(initialMode: MenuMode, initialQuery = '', tokenLen = 0): void {
const wasClosed = !isOpen;
hasInlineTrigger = tokenLen > 0;
triggerTextLength = tokenLen;
isOpen = true;
dockBtn.classList.add('active');
popover.style.opacity = '0'; popover.style.transform = 'translateY(8px) scale(0.975)'; popover.classList.add('open');
animate(zapIcon, { rotate: [0, -14, 10, 0] }, { duration: 0.32 });
switchMode(initialMode, initialQuery, wasClosed);
positionPopover();
if (wasClosed) {
animate(
popover,
{ opacity: 1, y: 0, scale: 1 },
{ type: 'spring', stiffness: 520, damping: 35, mass: 0.75 }
);
}
if (!hasInlineTrigger) {
filterInput.focus();
}
}
function closeMenu(): void {
if (!isOpen) return;
isOpen = false;
hasInlineTrigger = false;
triggerTextLength = 0;
activeSkill = null;
dockBtn.classList.remove('active');
kSlash.classList.remove('lit');
kAt.classList.remove('lit');
animate(
popover,
{ opacity: 0, y: 6, scale: 0.98 },
{ duration: 0.14, ease: [0.4, 0, 1, 1] }
).finished.then(() => {
if (!isOpen) popover.classList.remove('open');
});
}
function applyFilter(qRaw: string): void {
const q = qRaw.toLowerCase().trim();
if (mode === 'refs' && activeSkill) {
filteredRefs = q
? activeSkill.refs.filter((r) => r.relPath.toLowerCase().includes(q))
: activeSkill.refs;
selectedIndex = 0;
renderList();
return;
}
if (mode === 'skills') {
filteredSkills = q
? skills.filter(
(s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
)
: skills;
selectedIndex = 0;
renderList();
if (remoteTimer) window.clearTimeout(remoteTimer);
if (q.length >= 2) {
isSearchingRemote = true;
renderList();
remoteTimer = window.setTimeout(() => {
chrome.runtime.sendMessage({ type: 'SEARCH_REMOTE_SKILLS', query: q }, (res) => {
isSearchingRemote = false;
if (!res?.ok) {
if (mode === 'skills') renderList();
return;
}
const localNames = new Set(skills.map((x) => x.name.toLowerCase()));
remoteSkills = (res.data?.skills || []).filter(
(r: RemoteSkill) => r.repo && !localNames.has(r.name.toLowerCase())
);
if (mode === 'skills') { renderList(); window.requestAnimationFrame(positionPopover); }
});
}, 380);
} else {
isSearchingRemote = false;
remoteSkills = [];
}
return;
}
if (mode === 'files') {
browseDir(currentDir, q);
}
}
function createRow(
index: number,
iconEl: Element,
title: string,
badgeText: string,
isDirBadge: boolean,
subText?: string
): HTMLDivElement {
const item = document.createElement('div');
item.className = index === selectedIndex ? 'item active' : 'item';
const row = document.createElement('div');
row.className = 'item-row';
const titleEl = document.createElement('span');
titleEl.className = 'item-title';
titleEl.append(iconEl, document.createTextNode(title));
const badge = document.createElement('span');
badge.className = isDirBadge ? 'badge dir' : 'badge';
badge.textContent = badgeText;
row.append(titleEl, badge);
item.appendChild(row);
if (subText) {
const sub = document.createElement('div');
sub.className = 'item-sub';
sub.textContent = subText;
item.appendChild(sub);
}
item.addEventListener('pointerenter', () => {
if (selectedIndex !== index) {
selectedIndex = index;
syncActiveRowHighlight(false);
}
});
item.addEventListener('mousedown', (e) => {
e.preventDefault();
animate(item, { scale: 0.99 }, { duration: 0.08 });
selectCurrentItem(index, (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey);
});
return item;
}
function renderList(): void {
rowElements = [];
const frag = document.createDocumentFragment();
frag.appendChild(rowHighlight);
if (mode === 'refs' && activeSkill) {
const refCount = filteredRefs.length;
const skillTitle = activeSkill.name;
statusText.textContent = plural(refCount, { one: `# ref — ${skillTitle}`, other: `# refs — ${skillTitle}` });
if (filteredRefs.length === 0) {
setEmptyMessage(t`No matching references.`);
return;
}
for (let i = 0; i < filteredRefs.length; i++) {
const r = filteredRefs.slice(i, i + 1).find(() => true);
if (r) {
const row = createRow(i, createFileOrFolderIcon(r.relPath, false, 14), r.relPath, formatChars(r.length), false);
rowElements.push(row);
frag.appendChild(row);
}
}
} else if (mode === 'skills') {
const localCount = filteredSkills.length;
const remoteCount = remoteSkills.length;
statusText.textContent = remoteCount > 0 ? t`${localCount} local • ${remoteCount} on skills.sh` : t`${localCount} local`;
if (isLoadingSkills && filteredSkills.length === 0) {
listEl.replaceChildren();
const box = document.createElement('div');
box.className = 'empty-state';
const inner = document.createElement('span');
inner.className = 'empty-loading';
const sp = document.createElement('span');
sp.className = 'vexel-spinner';
inner.append(sp, document.createTextNode(t`Loading skills...`));
box.appendChild(inner);
listEl.appendChild(box);
return;
}
if (filteredSkills.length === 0 && remoteSkills.length === 0 && !isSearchingRemote) {
setEmptyMessage(t`No matching skills.`);
return;
}
let rowIdx = 0;
for (let i = 0; i < filteredSkills.length; i++) {
const s = filteredSkills.slice(i, i + 1).find(() => true);
if (s) {
const metaParts: string[] = [];
if (s.sourceRepo) metaParts.push(s.sourceRepo);
if (s.refCount > 0) metaParts.push(plural(s.refCount, { one: '# ref', other: '# refs' }));
metaParts.push(formatChars(s.smartLength));
const cleanDesc = s.description && !/^[>|]-?$/.test(s.description.trim()) ? s.description : '';
const row = createRow(rowIdx++, createLucideIcon('sparkles', 13, '#1a73e8'), s.name, metaParts.join(' • '), false, cleanDesc);
const isRemoving = removingSkills.has(s.id);
const isConfirming = confirmDeleteId === s.id;
if (!s.isBuiltin) {
const delBtn = document.createElement('button');
delBtn.type = 'button';
delBtn.className = 'del-btn' + (isRemoving ? ' removing' : isConfirming ? ' confirm' : '');
delBtn.title = isConfirming ? t`Click again to delete permanently` : t`Uninstall skill`;
if (isRemoving) {
  const sp = document.createElement('span');
  sp.className = 'vexel-spinner danger';
  delBtn.append(sp, document.createTextNode(t`Removing...`));
} else if (isConfirming) {
  delBtn.textContent = t`Confirm?`;
} else {
  delBtn.textContent = '✕';
}
delBtn.addEventListener('mousedown', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  if (removingSkills.has(s.id)) return;
  if (confirmDeleteId !== s.id) {
    confirmDeleteId = s.id;
    if (confirmDeleteTimer) window.clearTimeout(confirmDeleteTimer);
    confirmDeleteTimer = window.setTimeout(() => {
      if (confirmDeleteId === s.id) {
        confirmDeleteId = null;
        if (mode === 'skills') renderList();
      }
    }, 3000);
    renderList();
    return;
  }
  confirmDeleteId = null;
  removingSkills.add(s.id);
  renderList();
  const removingName = s.name;
  statusText.textContent = t`Removing ${removingName}...`;
  chrome.runtime.sendMessage({ type: 'REMOVE_LOCAL_SKILL', id: s.id, dir: (s as any).dir || '' }, (res) => {
    removingSkills.delete(s.id);
    if (!res?.ok || res?.data?.ok === false) {
      renderList();
      const errMsg = res?.data?.error || res?.error || t`remove error`;
      statusText.textContent = t`Remove failed: ${errMsg}`;
      showToast(t`Remove failed: ${errMsg}`);
      return;
    }
    const removedName = s.name;
    showToast(t`✓ Skill "${removedName}" removed!`);
    skills = skills.filter((x) => x.id !== s.id);
    filteredSkills = filteredSkills.filter((x) => x.id !== s.id);
    const remLocal = filteredSkills.length;
    const remRemote = remoteSkills.length;
    statusText.textContent = remRemote > 0 ? t`${remLocal} local • ${remRemote} on skills.sh` : t`${remLocal} local`;
    const currentRow = delBtn.closest('.item') as HTMLElement | null;
    if (currentRow) {
      const h = currentRow.offsetHeight;
      currentRow.style.overflow = 'hidden';
      currentRow.style.height = h + 'px';
      currentRow.style.boxSizing = 'border-box';
      currentRow.style.transition = 'height 0.18s cubic-bezier(0.2, 0, 0, 1), opacity 0.14s ease, padding 0.18s cubic-bezier(0.2, 0, 0, 1), margin 0.18s cubic-bezier(0.2, 0, 0, 1)';
      window.requestAnimationFrame(() => {
        currentRow.style.opacity = '0';
        currentRow.style.height = '0px';
        currentRow.style.paddingTop = '0px';
        currentRow.style.paddingBottom = '0px';
        currentRow.style.marginTop = '0px';
        currentRow.style.marginBottom = '0px';
      });
      window.setTimeout(() => {
        if (mode === 'skills') renderList();
      }, 190);
    } else if (mode === 'skills') {
      renderList();
    }
  });
});
const headerRow = row.querySelector('.item-row');
if (headerRow) headerRow.appendChild(delBtn);
}
rowElements.push(row);
frag.appendChild(row);
}
}
if (remoteSkills.length > 0 || isSearchingRemote) {
const sec = document.createElement('div');
sec.className = 'section-label';
if (isSearchingRemote && remoteSkills.length === 0) {
const wrap = document.createElement('span');
wrap.className = 'section-loading';
const sp = document.createElement('span');
sp.className = 'vexel-spinner';
wrap.append(sp, document.createTextNode(t`Searching skills.sh...`));
sec.appendChild(wrap);
} else {
sec.textContent = t`Available on skills.sh`;
}
frag.appendChild(sec);
for (let i = 0; i < remoteSkills.length; i++) {
const r = remoteSkills.slice(i, i + 1).find(() => true);
if (!r) continue;
const installsCount = r.installs;
const metaLabel = [r.repo, installsCount ? t`${installsCount} installs` : ''].filter(Boolean).join(' • ');
const isInstalling = installingSkills.has(r.repo + '/' + r.name);
const cleanRemoteDesc = r.description && !r.description.includes(' installs') && !/^[>|]-?$/.test(r.description.trim()) ? r.description : undefined;
const row = createRow(
  rowIdx++,
  createLucideIcon('sparkles', 13, '#5f6368'),
  r.name,
  metaLabel,
  false,
  cleanRemoteDesc
);
const headerRow = row.querySelector('.item-row');
const actionBtn = document.createElement('button');
actionBtn.type = 'button';
if (isInstalling) {
  actionBtn.className = 'installing-btn';
  const spinner = document.createElement('span');
  spinner.className = 'vexel-spinner';
  actionBtn.append(spinner, document.createTextNode(t`Loading...`));
} else {
  actionBtn.className = 'install-btn';
  actionBtn.append(createLucideIcon('download', 12, '#ffffff'), document.createTextNode(t`Install`));
}
if (headerRow) headerRow.appendChild(actionBtn);
rowElements.push(row);
frag.appendChild(row);
}
}
} else if (mode === 'files') {
const activeRecents = getActiveRecentEntries(filterInput.value);
const recentPaths = new Set(activeRecents.map((r) => r.relPath));
const dirItems = currentDir
  ? browseEntries
  : browseEntries.filter((e) => !recentPaths.has(e.relPath));

const filteredRecents = isZeroServerFs
  ? activeRecents.filter((r) => browseEntries.some((b) => b.relPath === r.relPath))
  : activeRecents;
visibleFileItems = [...filteredRecents, ...dirItems];
statusText.textContent = plural(visibleFileItems.length, { one: '# item', other: '# items' });

if (visibleFileItems.length === 0) {
setEmptyMessage(t`Empty folder or no matching files.`);
return;
}

const buildFileEntryRow = (entry: { name: string; relPath: string; isDir: boolean }, rowIndex: number, subLabel?: string) => {
const isGitDiff = entry.relPath === '__git_diff__';
const badge = isGitDiff ? 'Git' : '';
const row = createRow(
rowIndex,
isGitDiff ? createLucideIcon('sparkles', 14, '#1a73e8') : createFileOrFolderIcon(entry.name, entry.isDir, 14),
entry.name,
badge,
entry.isDir || isGitDiff,
subLabel
);
if (entry.isDir && entry.name !== '.. (Parent folder)') {
const headerRow = row.querySelector('.item-row');
const badgeEl = row.querySelector('.badge.dir');
if (badgeEl) badgeEl.remove();
const packBtn = document.createElement('button');
packBtn.type = 'button';
packBtn.className = 'pack-btn';
packBtn.title = t`Recursively pack non-gitignored files into context`;
packBtn.append(createLucideIcon('folder', 11, 'currentColor'), document.createTextNode(t`Pack`));
packBtn.addEventListener('mousedown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
const stripNow = hasInlineTrigger ? triggerTextLength : 0;
recordRecentEntry(entry);
closeMenu();
const dirName = entry.name;
showToast(t`Packing ${dirName}/...`);
chrome.runtime.sendMessage({ type: 'PACK_FOLDER', relPath: entry.relPath }, async (res) => {
          let packData = res?.ok && res.data?.ok ? res.data : null;
          if (!packData) {
            const localPack = await packLocalFsFolder(entry.relPath);
            if (!localPack.ok) {
              showToast(localPack.error || res?.data?.error || t`Unable to pack folder`);
              return;
            }
            packData = localPack;
          }
          if (packData) {
            const target = activeInput || findVisibleInput();
            if (target) {
              if (stripNow > 0) removeTriggerChars(target, stripNow);
              uploadAsTextFile(
                packData.content,
                target,
                showToast,
                packData.folderName + '-pack.md (' + packData.fileCount + ' files, ~' + packData.tokensEst + ' tok)'
              );
            }
          }
        });
});
if (headerRow) headerRow.appendChild(packBtn);
}
return row;
};

let fileRowIdx = 0;
if (filteredRecents.length > 0) {
const sec = document.createElement('div');
sec.className = 'section-label';
const lbl = document.createElement('span');
lbl.textContent = t`Recently Used`;
const clearBtn = document.createElement('button');
clearBtn.type = 'button';
clearBtn.className = 'section-clear';
clearBtn.textContent = t`Clear`;
clearBtn.addEventListener('mousedown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
recentEntries = [];
try { localStorage.removeItem(RECENT_FILES_KEY); } catch {}
if (mode === 'files') renderList();
});
sec.append(lbl, clearBtn);
frag.appendChild(sec);

for (let i = 0; i < filteredRecents.length; i++) {
const entry = filteredRecents[i];
const row = buildFileEntryRow(entry, fileRowIdx++, entry.relPath);
rowElements.push(row);
frag.appendChild(row);
}

if (dirItems.length > 0) {
const browseSec = document.createElement('div');
browseSec.className = 'section-label';
browseSec.textContent = t`Browse`;
frag.appendChild(browseSec);
}
}

for (let i = 0; i < dirItems.length; i++) {
const entry = dirItems[i];
const isGitDiff = entry.relPath === '__git_diff__';
const showSub = isGitDiff
  ? t`Inject staged + unstaged repository changes`
  : filterInput.value.trim().length > 0
  ? entry.relPath
  : undefined;
const row = buildFileEntryRow(entry, fileRowIdx++, showSub);
rowElements.push(row);
frag.appendChild(row);
}
}
listEl.replaceChildren(frag);
window.requestAnimationFrame(() => {
syncActiveRowHighlight(true);
positionPopover();
});
}
function getTextBeforeCursor(editable: HTMLElement): string {
if (editable.tagName === 'TEXTAREA') {
const ta = editable as HTMLTextAreaElement;
return ta.value.slice(0, ta.selectionStart ?? ta.value.length);
}
const sel = window.getSelection();
if (!sel || sel.rangeCount === 0) return editable.textContent || '';
const range = sel.getRangeAt(0).cloneRange();
range.selectNodeContents(editable);
range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
return range.toString();
}
function removeTriggerChars(editable: HTMLElement, count: number): void {
if (count <= 0) return;
if (editable.tagName === 'TEXTAREA') {
const ta = editable as HTMLTextAreaElement;
const pos = ta.selectionStart ?? ta.value.length;
const start = Math.max(0, pos - count);
ta.value = ta.value.slice(0, start) + ta.value.slice(pos);
ta.selectionStart = ta.selectionEnd = start;
ta.dispatchEvent(new Event('input', { bubbles: true }));
return;
}
editable.focus();
const sel = window.getSelection();
if (!sel || sel.rangeCount === 0) return;
const range = sel.getRangeAt(0);
if (range.endContainer.nodeType === Node.TEXT_NODE) {
const textNode = range.endContainer as Text;
const start = Math.max(0, range.endOffset - count);
textNode.deleteData(start, range.endOffset - start);
const newRange = document.createRange();
newRange.setStart(textNode, start);
newRange.collapse(true);
sel.removeAllRanges();
sel.addRange(newRange);
editable.dispatchEvent(new Event('input', { bubbles: true }));
}
}
function injectContent(content: string, fileName: string, toastMsg: string): void {
const target = activeInput || findVisibleInput();
const charsToStrip = hasInlineTrigger ? triggerTextLength : 0;
if (!target) {
navigator.clipboard.writeText(content);
showToast(t`${toastMsg} (copied)`);
return;
}
if (charsToStrip > 0) removeTriggerChars(target, charsToStrip);
target.focus();
if (
content.length > MAX_SAFE_LENGTH ||
fileName.endsWith('.ts') ||
fileName.endsWith('.rs') ||
fileName.endsWith('.mjs')
) {
uploadAsTextFile(content, target, showToast, fileName);
return;
}
if (target.tagName === 'TEXTAREA') {
const ta = target as HTMLTextAreaElement;
const prefix = ta.value ? ta.value + '\n\n' : '';
ta.value = prefix + content;
ta.dispatchEvent(new Event('input', { bubbles: true }));
} else {
document.execCommand('insertText', false, content);
}
showToast(toastMsg);
}
function selectCurrentItem(idx = selectedIndex, fullBundle = false): void {
const charsToStrip = hasInlineTrigger ? triggerTextLength : 0;
if (mode === 'refs' && activeSkill) {
const ref = filteredRefs.slice(idx, idx + 1).find(() => true);
if (!ref) return;
const skillName = activeSkill.name;
closeMenu();
hasInlineTrigger = charsToStrip > 0;
triggerTextLength = charsToStrip;
injectContent(
'## Reference (' + skillName + ') : ' + ref.relPath + '\n\n' + ref.content,
ref.relPath.split('/').join('-'),
t`Reference "${ref.relPath}" added`
);
hasInlineTrigger = false;
triggerTextLength = 0;
return;
}
if (mode === 'skills') {
if (idx >= filteredSkills.length) {
const remote = remoteSkills[idx - filteredSkills.length];
if (!remote) return;
const key = remote.repo + '/' + remote.name;
if (installingSkills.has(key)) return;
installingSkills.add(key);
renderList();
const instName = remote.name;
const instRepo = remote.repo;
statusText.textContent = t`Installing ${instName} via npx...`;
showToast(t`Installing ${instName} (${instRepo})...`);
chrome.runtime.sendMessage({ type: 'INSTALL_REMOTE_SKILL', repo: remote.repo, name: remote.name }, (res) => {
installingSkills.delete(key);
if (!res?.ok || res?.data?.ok === false) {
renderList();
const errMsg = res?.data?.error || res?.error || t`npx error`;
statusText.textContent = t`Install failed: ${errMsg}`;
showToast(t`Install failed: ${errMsg}`);
return;
}
const doneName = remote.name;
showToast(t`✓ Skill "${doneName}" installed!`);
statusText.textContent = t`✓ "${doneName}" installed!`;
remoteSkills = remoteSkills.filter((x) => x.name !== remote.name);
fetchSkills();
});
return;
}
const skill = filteredSkills.slice(idx, idx + 1).find(() => true);
if (!skill) return;
closeMenu();
hasInlineTrigger = charsToStrip > 0;
triggerTextLength = charsToStrip;
const payload = fullBundle ? skill.fullContent : skill.smartContent;
const addedSkill = skill.name;
injectContent(payload, skill.id + '.md', t`Skill "${addedSkill}" added`);
hasInlineTrigger = false;
triggerTextLength = 0;
return;
}
if (mode === 'files') {
const entry = visibleFileItems[idx] || browseEntries[idx];
if (!entry) return;
if (entry.relPath === 'git_diff') {
closeMenu();
showToast(t`Packing Git diff...`);
chrome.runtime.sendMessage({ type: 'FETCH_GIT_DIFF', dir: currentDir }, (res) => {
if (!res?.ok || !res.data?.ok) {
showToast(res?.data?.error || t`No git repository found here`);
return;
}
const target = activeInput || findVisibleInput();
if (target) {
if (charsToStrip > 0) removeTriggerChars(target, charsToStrip);
uploadAsTextFile(res.data.content, target, showToast, 'git-diff.md (~' + res.data.tokensEst + ' tok)');
}
});
return;
}
recordRecentEntry(entry);
if (entry.isDir) {
navigateToDir(entry.relPath);
return;
}
closeMenu();
chrome.runtime.sendMessage({ type: 'FETCH_FILE_CONTENT', relPath: entry.relPath }, async (res) => {
        let fileText = res?.ok && res.data ? res.data.content : null;
        if (fileText === null) {
          const localFile = await readLocalFsFile(entry.relPath);
          if (!localFile.ok || typeof localFile.content !== 'string') {
            const failedPath = entry.relPath;
            showToast(t`Unable to read ${failedPath}`);
            return;
          }
          fileText = localFile.content;
        }
const wrapped =
'### File: ' + BT1 + entry.relPath + BT1 + '\n\n' + BT3 + '\n' + fileText + '\n' + BT3;
const target = activeInput || findVisibleInput();
if (target) {
if (charsToStrip > 0) removeTriggerChars(target, charsToStrip);
uploadAsTextFile(wrapped, target, showToast, entry.name + '.txt');
}
});
}
}
const handleEditableInput = (e: Event) => {
const editable = resolveEditable(e.target);
if (!editable) return;
activeInput = editable;
mountDockIntoInput();
const textBeforeCursor = getTextBeforeCursor(editable);
const lastSlash = textBeforeCursor.lastIndexOf('/');
const lastAt = textBeforeCursor.lastIndexOf('@');
const triggerPos = Math.max(lastSlash, lastAt);
let match: { symbol: string; query: string; len: number } | null = null;
if (triggerPos !== -1) {
const prevChar = triggerPos === 0 ? ' ' : textBeforeCursor.charAt(triggerPos - 1);
const afterTrigger = textBeforeCursor.slice(triggerPos + 1);
if (/\s/.test(prevChar) && !/\s/.test(afterTrigger)) {
match = {
symbol: textBeforeCursor.charAt(triggerPos),
query: afterTrigger,
len: afterTrigger.length + 1,
};
}
}
if (match) {
const targetMode: MenuMode = match.symbol === '/' ? 'skills' : 'files';
if (!isOpen || mode !== targetMode) {
openMenu(targetMode, match.query, match.len);
} else {
hasInlineTrigger = true;
triggerTextLength = match.len;
filterInput.value = match.query;
applyFilter(match.query);
positionPopover();
}
} else if (isOpen && hasInlineTrigger) {
closeMenu();
}
};
document.addEventListener('input', handleEditableInput, true);
document.addEventListener(
'keyup',
(e: KeyboardEvent) => {
if (e.key === '/' || e.key === '@' || e.key === 'Backspace') {
handleEditableInput(e);
}
},
true
);
document.addEventListener(
'keydown',
(e: KeyboardEvent) => {
if (!isOpen) return;
const len =
mode === 'refs'
? filteredRefs.length
: mode === 'skills'
? filteredSkills.length + remoteSkills.length
: (visibleFileItems.length || browseEntries.length);
if (e.key === 'Escape') {
e.preventDefault();
e.stopPropagation();
if (mode === 'refs') switchMode('skills', filterInput.value);
else closeMenu();
} else if (e.key === 'ArrowDown') {
e.preventDefault();
e.stopPropagation();
selectedIndex = (selectedIndex + 1) % Math.max(1, len);
syncActiveRowHighlight(false);
} else if (e.key === 'ArrowUp') {
e.preventDefault();
e.stopPropagation();
selectedIndex = (selectedIndex - 1 + len) % Math.max(1, len);
syncActiveRowHighlight(false);
} else if (e.key === 'ArrowLeft' && mode === 'files' && filterInput.value === '' && currentDir) {
e.preventDefault();
e.stopPropagation();
navigateUp();
} else if (e.key === 'ArrowRight' && mode === 'files') {
const entry = browseEntries.slice(selectedIndex, selectedIndex + 1).find(() => true);
if (entry && entry.isDir) {
e.preventDefault();
e.stopPropagation();
navigateToDir(entry.relPath);
}
} else if (e.key === 'ArrowRight' && mode === 'skills' && document.activeElement !== activeInput) {
const s = filteredSkills.slice(selectedIndex, selectedIndex + 1).find(() => true);
if (s && s.refs.length > 0) {
e.preventDefault();
activeSkill = s;
mode = 'refs';
filterInput.value = '';
applyFilter('');
}
} else if (e.key === 'Enter' && !e.shiftKey) {
e.preventDefault();
e.stopPropagation();
selectCurrentItem(selectedIndex, e.metaKey || e.ctrlKey);
}
},
true
);
dockBtn.addEventListener('click', (e) => {
e.preventDefault();
e.stopPropagation();
if (isOpen) closeMenu();
else openMenu('skills', '', 0);
});
tabSkills.addEventListener('click', () => switchMode('skills', filterInput.value));
tabFiles.addEventListener('click', () => switchMode('files', filterInput.value));
// Micro-interaction bouton Export style interior.dev ("The label changes. The button stays put.")
btnExport.addEventListener('click', () => {
animate(btnExport, { scale: [0.95, 1] }, { type: 'spring', stiffness: 550, damping: 28 });
exportConversationMarkdown(showToast);
btnExport.classList.add('done');
btnExport.replaceChildren(createLucideIcon('check', 12, '#137333'), document.createTextNode(t`Exported`));
window.setTimeout(() => {
setExportIdle();
}, 1600);
});
filterInput.addEventListener('input', () => applyFilter(filterInput.value));
document.addEventListener('mousedown', (e) => {
if (!isOpen) return;
const path = e.composedPath();
if (!path.includes(popover) && !path.includes(dockHost) && !resolveEditable(e.target)) {
closeMenu();
}
});
let paletteResizeRaf = 0;
window.addEventListener('resize', () => {
if (paletteResizeRaf) return;
paletteResizeRaf = window.requestAnimationFrame(() => {
paletteResizeRaf = 0;
mountDockIntoInput();
if (isOpen) positionPopover();
});
}, { passive: true });
let paletteScrollRaf = 0;
document.addEventListener('scroll', () => {
if (!isOpen || paletteScrollRaf) return;
paletteScrollRaf = window.requestAnimationFrame(() => {
paletteScrollRaf = 0;
if (isOpen) positionPopover();
});
}, { capture: true, passive: true });
document.addEventListener('focusin', () => {
if (!dockHost.isConnected) mountDockIntoInput();
if (isOpen) positionPopover();
}, true);
window.addEventListener('popstate', () => window.setTimeout(mountDockIntoInput, 120));
mountDockIntoInput();
}
