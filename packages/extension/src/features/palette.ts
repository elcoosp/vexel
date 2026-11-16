import { createLucideIcon, createFileOrFolderIcon } from './icons';
import { MAX_SAFE_LENGTH, uploadAsTextFile } from './untruncate';
import { exportConversationMarkdown } from './thread-tools';

interface RefFile {
  relPath: string;
  content: string;
  length: number;
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  smartContent: string;
  smartLength: number;
  fullContent: string;
  fullLength: number;
  refCount: number;
  refs: RefFile[];
}

interface BrowseEntry {
  name: string;
  relPath: string;
  isDir: boolean;
}

type MenuMode = 'skills' | 'refs' | 'files';

const BT1 = String.fromCharCode(96);
const BT3 = String.fromCharCode(96, 96, 96);

function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k' : len + ' c';
}

const DOCK_CSS = [
  ':host { all: initial; display: inline-flex; align-items: center; vertical-align: middle; margin-left: 6px; color-scheme: light; }',
  '.dock-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px 0 9px; border-radius: 999px; background: #f8f9fa; color: #3c4043; border: 1px solid #e1e3e6; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; font-size: 12px; font-weight: 500; letter-spacing: -0.01em; cursor: pointer; user-select: none; transition: all 0.16s cubic-bezier(0.2, 0, 0, 1); box-shadow: 0 1px 2px rgba(60, 64, 67, 0.05); }',
  '.dock-btn:hover { background: #f1f3f4; border-color: #c6dafc; color: #1a73e8; box-shadow: 0 1px 4px rgba(26, 115, 232, 0.12); }',
  '.dock-btn.active { background: #e8f0fe; border-color: #a8c7fa; color: #1967d2; }',
  '.dock-keys { display: inline-flex; align-items: center; gap: 3px; margin-left: 2px; }',
  '.dock-keys kbd { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 600; line-height: 1; background: #ffffff; border: 1px solid #dadce0; border-bottom-width: 1.5px; padding: 2px 4px; border-radius: 5px; color: #5f6368; }',
  '.dock-btn:hover .dock-keys kbd, .dock-btn.active .dock-keys kbd { border-color: #c6dafc; color: #1a73e8; }',
].join('\n');

const POPOVER_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.popover { position: fixed; width: 580px; max-width: calc(100vw - 24px); background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(16px); border: 1px solid #dadce0; border-radius: 24px; box-shadow: 0 16px 40px rgba(60, 64, 67, 0.2), 0 2px 8px rgba(60, 64, 67, 0.08); z-index: 2147483646; display: none; flex-direction: column; overflow: hidden; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #1f1f1f; }',
  '.popover.open { display: flex; }',
  '.header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 8px 14px; border-bottom: 1px solid #f1f3f4; background: #fafbfc; gap: 8px; flex-wrap: wrap; }',
  '.tabs { display: inline-flex; align-items: center; background: #f1f3f4; padding: 3px; border-radius: 999px; gap: 2px; }',
  '.tab { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 4px 11px; border-radius: 999px; cursor: pointer; color: #5f6368; background: transparent; border: none; transition: all 0.14s ease; }',
  '.tab:hover { color: #1f1f1f; }',
  '.tab.active { color: #1a73e8; background: #ffffff; box-shadow: 0 1px 3px rgba(60, 64, 67, 0.14); }',
  '.export-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: #5f6368; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 999px; padding: 5px 11px; cursor: pointer; transition: all 0.14s ease; }',
  '.export-btn:hover { background: #f8f9fa; color: #1a73e8; border-color: #c6dafc; }',
  '.breadcrumbs { display: none; align-items: center; flex-wrap: wrap; gap: 3px; padding: 6px 16px; border-bottom: 1px solid #f1f3f4; background: #ffffff; font-size: 11.5px; color: #5f6368; }',
  '.breadcrumbs.visible { display: flex; }',
  '.crumb { cursor: pointer; padding: 2px 6px; border-radius: 6px; color: #1a73e8; font-weight: 500; }',
  '.crumb:hover { background: #e8f0fe; }',
  '.crumb-sep { color: #bdc1c6; }',
  '.search-row { padding: 10px 16px; border-bottom: 1px solid #f1f3f4; display: flex; align-items: center; gap: 10px; background: #ffffff; }',
  '.search-row input { flex: 1; background: transparent; border: none; outline: none; color: #1f1f1f; font-family: inherit; font-size: 14px; }',
  '.search-row input::placeholder { color: #80868b; }',
  '.list { max-height: 280px; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; scrollbar-color: #dadce0 transparent; }',
  '.list::-webkit-scrollbar { width: 5px; }',
  '.list::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 999px; }',
  '.item { position: relative; padding: 8px 12px; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; transition: background 0.1s ease; }',
  '.item:hover { background: #f8f9fa; }',
  '.item.active { background: #f0f6ff; border-color: #d2e3fc; }',
  '.item.active::before { content: ""; position: absolute; left: 4px; top: 9px; bottom: 9px; width: 3px; border-radius: 999px; background: #1a73e8; }',
  '.item-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }',
  '.item-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #1f1f1f; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.item-sub { font-size: 11.5px; color: #5f6368; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 22px; }',
  '.badge { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: #f1f3f4; color: #5f6368; flex-shrink: 0; }',
  '.badge.dir { font-family: inherit; font-weight: 500; color: #1967d2; background: #e8f0fe; }',
  '.footer { display: flex; justify-content: space-between; align-items: center; padding: 7px 16px; border-top: 1px solid #f1f3f4; background: #fafbfc; font-size: 11px; color: #5f6368; }',
  '.empty { padding: 24px 16px; text-align: center; color: #5f6368; font-size: 12.5px; }',
].join('\n');

export function initCommandPalette(showToast: (msg: string) => void): void {
  let isOpen = false;
  let mode: MenuMode = 'skills';
  let triggerTextLength = 0;
  let hasInlineTrigger = false;
  let activeInput: HTMLElement | null = null;
  let skills: SkillItem[] = [];
  let filteredSkills: SkillItem[] = [];
  let activeSkill: SkillItem | null = null;
  let filteredRefs: RefFile[] = [];
  let currentDir = '';
  let rootLabel = '~';
  let browseEntries: BrowseEntry[] = [];
  let selectedIndex = 0;
  let fileFetchTimer: number | undefined;

  // 1. Dock integre directement dans la barre d'outils de l'input Google (.o8Wipc)
  const dockHost = document.createElement('span');
  dockHost.id = 'vexel-input-dock-host';
  const dockShadow = dockHost.attachShadow({ mode: 'open' });
  const dockStyle = document.createElement('style');
  dockStyle.textContent = DOCK_CSS;

  const dockBtn = document.createElement('button');
  dockBtn.type = 'button';
  dockBtn.className = 'dock-btn';
  dockBtn.title = 'Vexel — Skills (/) et Fichiers (@)';
  dockBtn.append(createLucideIcon('zap', 13, '#1a73e8'), document.createTextNode('Vexel'));

  const keysWrap = document.createElement('span');
  keysWrap.className = 'dock-keys';
  const kSlash = document.createElement('kbd');
  kSlash.textContent = '/';
  const kAt = document.createElement('kbd');
  kAt.textContent = '@';
  keysWrap.append(kSlash, kAt);
  dockBtn.appendChild(keysWrap);

  dockShadow.append(dockStyle, dockBtn);

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

  const tabSkills = document.createElement('button');
  tabSkills.type = 'button';
  tabSkills.className = 'tab active';
  tabSkills.append(createLucideIcon('sparkles', 12), document.createTextNode('Skills'));

  const tabFiles = document.createElement('button');
  tabFiles.type = 'button';
  tabFiles.className = 'tab';
  tabFiles.append(createLucideIcon('folder', 12), document.createTextNode('Fichiers'));

  tabs.append(tabSkills, tabFiles);

  const btnExport = document.createElement('button');
  btnExport.type = 'button';
  btnExport.className = 'export-btn';
  btnExport.append(createLucideIcon('download', 12), document.createTextNode('Exporter .md'));

  header.append(tabs, btnExport);
  popover.appendChild(header);

  const breadcrumbsEl = document.createElement('div');
  breadcrumbsEl.className = 'breadcrumbs';
  popover.appendChild(breadcrumbsEl);

  const searchRow = document.createElement('div');
  searchRow.className = 'search-row';
  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = 'Rechercher un skill ou un fichier...';
  filterInput.autocomplete = 'off';
  searchRow.appendChild(filterInput);
  popover.appendChild(searchRow);

  const listEl = document.createElement('div');
  listEl.className = 'list';
  popover.appendChild(listEl);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const statusText = document.createElement('span');
statusText.textContent = '0 element';
const hints = document.createElement('span');
hints.textContent = 'Naviguer: fleches | Inserer: Entree | Dossier parent: gauche';
footer.append(statusText, hints);
popover.appendChild(footer);
shadow.appendChild(popover);
document.body.appendChild(popHost);
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
const plate =
input.closest<HTMLElement>('[data-xid="aim-mars-input-plate"], .AgWCw') ||
input.parentElement ||
input;
return plate;
}
let observedPlate: HTMLElement | null = null;
const plateObserver = new ResizeObserver(() => {
if (isOpen) positionPopover();
});
function mountDockIntoInput(): void {
const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput();
if (!input) return;
activeInput = input;
const plate = findInputPlate(input);
if (plate !== observedPlate) {
plateObserver.disconnect();
plateObserver.observe(plate);
observedPlate = plate;
}
// Insertion native dans la barre d'actions interne de l'input Google (.o8Wipc)
const toolbarRow = plate.querySelector('.o8Wipc');
if (toolbarRow) {
if (dockHost.parentElement !== toolbarRow) {
dockHost.style.position = '';
dockHost.style.top = '';
dockHost.style.left = '';
const chipsContainer = toolbarRow.querySelector('.rJkohe');
if (chipsContainer) {
toolbarRow.insertBefore(dockHost, chipsContainer);
} else {
toolbarRow.appendChild(dockHost);
}
}
return;
}
// Fallback si Google affiche une barre simplifiee (page d'accueil avant premier message)
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
popover.style.width = targetWidth + 'px';
const popHeight = popover.offsetHeight || 360;
const topAbove = rect.top - popHeight - 10;
const finalTop =
topAbove >= 12 ? topAbove : Math.min(window.innerHeight - popHeight - 12, rect.bottom + 10);
const alignedLeft = rect.left + (rect.width - targetWidth) / 2;
const finalLeft = Math.max(12, Math.min(window.innerWidth - targetWidth - 12, alignedLeft));
popover.style.top = Math.round(finalTop) + 'px';
popover.style.left = Math.round(finalLeft) + 'px';
}
function setEmptyMessage(msg: string): void {
const empty = document.createElement('div');
empty.className = 'empty';
empty.textContent = msg;
listEl.replaceChildren(empty);
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
setEmptyMessage('Chargement des skills...');
chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (res) => {
if (chrome.runtime.lastError || !res?.ok) {
setEmptyMessage('Bridge local injoignable (127.0.0.1:49152)');
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
chrome.runtime.sendMessage({ type: 'BROWSE_DIR', dir, query }, (res) => {
if (chrome.runtime.lastError || !res?.ok) {
setEmptyMessage('Bridge local injoignable (127.0.0.1:49152)');
return;
}
rootLabel = res.data?.rootLabel || '~';
currentDir = res.data?.dir || '';
const rawEntries: BrowseEntry[] = res.data?.entries || [];
if (!query && currentDir) {
const idx = currentDir.lastIndexOf('/');
const parentPath = idx === -1 ? '' : currentDir.slice(0, idx);
browseEntries = [
{ name: '.. (Dossier parent)', relPath: parentPath, isDir: true },
...rawEntries,
];
} else {
browseEntries = rawEntries;
}
selectedIndex = 0;
renderBreadcrumbs();
renderList();
});
},
query ? 90 : 0
);
}
function switchMode(newMode: MenuMode, initialQuery = ''): void {
mode = newMode;
activeSkill = null;
tabSkills.classList.toggle('active', mode === 'skills' || mode === 'refs');
tabFiles.classList.toggle('active', mode === 'files');
filterInput.value = initialQuery;
renderBreadcrumbs();
if (mode === 'skills') {
filterInput.placeholder = 'Filtrer les skills...';
if (skills.length === 0) fetchSkills();
else applyFilter(initialQuery);
} else if (mode === 'files') {
filterInput.placeholder = 'Filtrer ce dossier ou rechercher un fichier...';
browseDir(currentDir, initialQuery);
}
window.requestAnimationFrame(positionPopover);
}
function openMenu(initialMode: MenuMode, initialQuery = '', tokenLen = 0): void {
hasInlineTrigger = tokenLen > 0;
triggerTextLength = tokenLen;
isOpen = true;
dockBtn.classList.add('active');
popover.classList.add('open');
switchMode(initialMode, initialQuery);
positionPopover();
if (!hasInlineTrigger) {
filterInput.focus();
}
}
function closeMenu(): void {
isOpen = false;
hasInlineTrigger = false;
triggerTextLength = 0;
activeSkill = null;
dockBtn.classList.remove('active');
popover.classList.remove('open');
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
item.addEventListener('mousedown', (e) => {
e.preventDefault();
selectCurrentItem(index, (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey);
});
return item;
}
function renderList(): void {
listEl.replaceChildren();
if (mode === 'refs' && activeSkill) {
statusText.textContent = filteredRefs.length + ' ref(s) — ' + activeSkill.name;
if (filteredRefs.length === 0) {
setEmptyMessage('Aucune reference correspondante.');
return;
}
for (let i = 0; i < filteredRefs.length; i++) {
const r = filteredRefs.slice(i, i + 1).find(() => true);
if (r) {
listEl.appendChild(
createRow(i, createFileOrFolderIcon(r.relPath, false, 14), r.relPath, formatChars(r.length), false)
);
}
}
} else if (mode === 'skills') {
statusText.textContent = filteredSkills.length + ' skill(s)';
if (filteredSkills.length === 0) {
setEmptyMessage('Aucun skill correspondant.');
return;
}
for (let i = 0; i < filteredSkills.length; i++) {
const s = filteredSkills.slice(i, i + 1).find(() => true);
if (s) {
const badge = (s.refCount > 0 ? s.refCount + ' refs • ' : '') + formatChars(s.smartLength);
listEl.appendChild(
createRow(i, createLucideIcon('sparkles', 13, '#1a73e8'), s.name, badge, false, s.description)
);
}
}
} else if (mode === 'files') {
statusText.textContent = browseEntries.length + ' element(s)';
if (browseEntries.length === 0) {
setEmptyMessage('Dossier vide ou aucun fichier correspondant.');
return;
}
for (let i = 0; i < browseEntries.length; i++) {
const entry = browseEntries.slice(i, i + 1).find(() => true);
if (!entry) continue;
const badge = entry.isDir ? 'Dossier' : 'Fichier';
const showSub = filterInput.value.trim().length > 0 ? entry.relPath : undefined;
listEl.appendChild(
createRow(i, createFileOrFolderIcon(entry.name, entry.isDir, 14), entry.name, badge, entry.isDir, showSub)
);
}
}
const active = listEl.querySelector('.item.active');
if (active) active.scrollIntoView({ block: 'nearest' });
window.requestAnimationFrame(positionPopover);
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
showToast(toastMsg + ' (copie)');
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
'Reference "' + ref.relPath + '" ajoutee'
);
hasInlineTrigger = false;
triggerTextLength = 0;
return;
}
if (mode === 'skills') {
const skill = filteredSkills.slice(idx, idx + 1).find(() => true);
if (!skill) return;
closeMenu();
hasInlineTrigger = charsToStrip > 0;
triggerTextLength = charsToStrip;
const payload = fullBundle ? skill.fullContent : skill.smartContent;
injectContent(payload, skill.id + '.md', 'Skill "' + skill.name + '" ajoute');
hasInlineTrigger = false;
triggerTextLength = 0;
return;
}
if (mode === 'files') {
const entry = browseEntries.slice(idx, idx + 1).find(() => true);
if (!entry) return;
if (entry.isDir) {
navigateToDir(entry.relPath);
return;
}
closeMenu();
chrome.runtime.sendMessage({ type: 'FETCH_FILE_CONTENT', relPath: entry.relPath }, (res) => {
if (!res?.ok || !res.data) {
showToast('Impossible de lire ' + entry.relPath);
return;
}
const wrapped =
'### Fichier : ' + BT1 + entry.relPath + BT1 + '\n\n' + BT3 + '\n' + res.data.content + '\n' + BT3;
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
? filteredSkills.length
: browseEntries.length;
if (e.key === 'Escape') {
e.preventDefault();
e.stopPropagation();
if (mode === 'refs') switchMode('skills', filterInput.value);
else closeMenu();
} else if (e.key === 'ArrowDown') {
e.preventDefault();
e.stopPropagation();
selectedIndex = (selectedIndex + 1) % Math.max(1, len);
renderList();
} else if (e.key === 'ArrowUp') {
e.preventDefault();
e.stopPropagation();
selectedIndex = (selectedIndex - 1 + len) % Math.max(1, len);
renderList();
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
btnExport.addEventListener('click', () => {
closeMenu();
exportConversationMarkdown(showToast);
});
filterInput.addEventListener('input', () => applyFilter(filterInput.value));
document.addEventListener('mousedown', (e) => {
if (!isOpen) return;
const path = e.composedPath();
if (!path.includes(popover) && !path.includes(dockHost) && !resolveEditable(e.target)) {
closeMenu();
}
});
window.addEventListener('resize', () => {
mountDockIntoInput();
positionPopover();
}, { passive: true });
document.addEventListener('scroll', positionPopover, { capture: true, passive: true });
document.addEventListener('focusin', () => {
mountDockIntoInput();
positionPopover();
}, true);
let mountTimer: number | undefined;
const domObs = new MutationObserver(() => {
if (dockHost.isConnected && dockHost.parentElement?.classList.contains('o8Wipc')) return;
if (mountTimer) window.clearTimeout(mountTimer);
mountTimer = window.setTimeout(mountDockIntoInput, 150);
});
domObs.observe(document.body, { childList: true, subtree: true });
mountDockIntoInput();
}
