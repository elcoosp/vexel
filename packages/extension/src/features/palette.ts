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
interface RepoFileItem {
name: string;
relPath: string;
repo: string;
}
type MenuMode = 'skills' | 'refs' | 'files';
const BT1 = String.fromCharCode(96);
const BT3 = String.fromCharCode(96, 96, 96);
function formatChars(len: number): string {
return len >= 1000 ? (len / 1000).toFixed(1) + 'k car.' : len + ' car.';
}
function escapeHtml(str: string): string {
return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
const MENU_HTML = [
'',
':host { all: initial; }',
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
'.filter-box { padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; gap: 8px; }',
'.filter-box input { flex: 1; background: transparent; border: none; outline: none; color: #fafafa; font-size: 13px; }',
'.list { max-height: 290px; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }',
'.item { padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; }',
'.item.active { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.1); }',
'.item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
'.item-title { font-size: 13px; font-weight: 500; color: #f4f4f5; }',
'.item-sub { font-size: 11.5px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
'.badge { font-size: 10.5px; padding: 2px 6px; border-radius: 5px; background: rgba(255, 255, 255, 0.06); color: #a1a1aa; flex-shrink: 0; }',
'.badge.repo { color: #93c5fd; background: rgba(59, 130, 246, 0.14); }',
'.footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(14, 14, 17, 0.9); font-size: 11px; color: #71717a; }',
'.empty { padding: 20px; text-align: center; color: #71717a; font-size: 12.5px; }',
'',
'⚡ Vexel / @',
'',
'  ',
'    ',
'      / Skills',
'      @ Fichiers Repos',
'    ',
'    Exporter .md (⌘⇧E)',
'  ',
'  ',
'    ',
'  ',
'  ',
'  ',
'    0 element',
'    ↑↓ naviguer • ↵ inserer • Esc fermer',
'  ',
''
].join('\n');
export function initCommandPalette(showToast: (msg: string) => void): void {
let isOpen = false;
let mode: MenuMode = 'skills';
let triggerRange: { start: number; end: number } | null = null;
let activeInput: HTMLElement | null = null;
let skills: SkillItem[] = [];
let filteredSkills: SkillItem[] = [];
let activeSkill: SkillItem | null = null;
let filteredRefs: RefFile[] = [];
let repoFiles: RepoFileItem[] = [];
let selectedIndex = 0;
let fileFetchTimer: number | undefined;
const host = document.createElement('div');
host.id = 'vexel-inline-menu-host';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = MENU_HTML;
document.body.appendChild(host);
const triggerPill = shadow.getElementById('trigger-pill') as HTMLButtonElement;
const popover = shadow.getElementById('popover') as HTMLDivElement;
const tabSkills = shadow.getElementById('tab-skills') as HTMLButtonElement;
const tabFiles = shadow.getElementById('tab-files') as HTMLButtonElement;
const btnExport = shadow.getElementById('btn-export') as HTMLButtonElement;
const filterInput = shadow.getElementById('filter-input') as HTMLInputElement;
const listEl = shadow.getElementById('list') as HTMLDivElement;
const statusText = shadow.getElementById('status-text') as HTMLSpanElement;
function findVisibleInput(): HTMLElement | null {
const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
for (let i = 0; i < inputs.length; i++) {
const el = inputs.item(i) as HTMLElement;
if (el.offsetParent !== null) return el;
}
return null;
}
function positionElements(): void {
const input = activeInput && document.contains(activeInput) ? activeInput : findVisibleInput();
if (!input) {
triggerPill.style.display = 'none';
return;
}
activeInput = input;
const rect = input.getBoundingClientRect();
if (rect.width === 0 || rect.height === 0) {
triggerPill.style.display = 'none';
return;
}
triggerPill.style.display = 'inline-flex';
triggerPill.style.top = Math.max(8, rect.top - 30) + 'px';
triggerPill.style.left = Math.max(12, rect.right - 118) + 'px';
if (isOpen) {
const popHeight = popover.offsetHeight || 340;
const topPos = rect.top - popHeight - 8;
popover.style.top = (topPos > 10 ? topPos : Math.min(window.innerHeight - popHeight - 12, rect.bottom + 8)) + 'px';
popover.style.left = Math.max(12, Math.min(window.innerWidth - 552, rect.left)) + 'px';
}
}
function fetchSkills(): void {
listEl.innerHTML = 'Chargement des skills...';
chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (res) => {
if (chrome.runtime.lastError || !res?.ok) {
listEl.innerHTML = 'Bridge local injoignable (127.0.0.1:49152)';
return;
}
skills = res.data?.skills || [];
applyFilter(filterInput.value);
});
}
function fetchFiles(query: string): void {
if (fileFetchTimer) window.clearTimeout(fileFetchTimer);
fileFetchTimer = window.setTimeout(() => {
listEl.innerHTML = 'Recherche dans ~/Documents/Repos...';
chrome.runtime.sendMessage({ type: 'FETCH_FILES', query }, (res) => {
if (chrome.runtime.lastError || !res?.ok) {
listEl.innerHTML = 'Bridge local injoignable (127.0.0.1:49152)';
return;
}
repoFiles = res.data?.files || [];
selectedIndex = 0;
renderList();
});
}, 120);
}
function switchMode(newMode: MenuMode, initialQuery = ''): void {
mode = newMode;
activeSkill = null;
tabSkills.classList.toggle('active', mode === 'skills' || mode === 'refs');
tabFiles.classList.toggle('active', mode === 'files');
filterInput.value = initialQuery;
if (mode === 'skills') {
filterInput.placeholder = 'Filtrer les skills (~/.agents/skills)...';
if (skills.length === 0) {
fetchSkills();
} else {
applyFilter(initialQuery);
}
} else if (mode === 'files') {
filterInput.placeholder = 'Nom ou chemin de fichier dans ~/Documents/Repos...';
fetchFiles(initialQuery);
}
}
function openMenu(initialMode: MenuMode, initialQuery = '', range: { start: number; end: number } | null = null): void {
triggerRange = range;
isOpen = true;
popover.classList.add('open');
switchMode(initialMode, initialQuery);
positionElements();
if (!range) {
filterInput.focus();
}
}
function closeMenu(): void {
isOpen = false;
triggerRange = null;
activeSkill = null;
popover.classList.remove('open');
}
function applyFilter(qRaw: string): void {
const q = qRaw.toLowerCase().trim();
if (mode === 'refs' && activeSkill) {
filteredRefs = q ? activeSkill.refs.filter((r) => r.relPath.toLowerCase().includes(q)) : activeSkill.refs;
selectedIndex = 0;
renderList();
return;
}
if (mode === 'skills') {
filteredSkills = q
? skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
: skills;
selectedIndex = 0;
renderList();
return;
}
if (mode === 'files') {
fetchFiles(q);
}
}
function renderList(): void {
if (mode === 'refs' && activeSkill) {
statusText.textContent = filteredRefs.length + ' reference(s) — ' + activeSkill.name;
if (filteredRefs.length === 0) {
listEl.innerHTML = 'Aucune reference correspondante.';
return;
}
listEl.innerHTML = filteredRefs
.map((r) => [
'',
'  ',
'    📄 ' + escapeHtml(r.relPath) + '',
'    ' + formatChars(r.length) + '',
'  ',
''
].join(''))
.join('');
bindRowClicks();
return;
}
if (mode === 'skills') {
statusText.textContent = filteredSkills.length + ' skill(s)';
if (filteredSkills.length === 0) {
listEl.innerHTML = 'Aucun skill correspondant.';
return;
}
listEl.innerHTML = filteredSkills
.map((s) => [
'',
'  ',
'    ✦ ' + escapeHtml(s.name) + '',
'    ' + (s.refCount > 0 ? s.refCount + ' refs • ' : '') + formatChars(s.smartLength) + '',
'  ',
s.description ? '  ' + escapeHtml(s.description) + '' : '',
''
].join(''))
.join('');
bindRowClicks();
return;
}
if (mode === 'files') {
statusText.textContent = repoFiles.length + ' fichier(s)';
if (repoFiles.length === 0) {
listEl.innerHTML = 'Aucun fichier trouve dans ~/Documents/Repos.';
return;
}
listEl.innerHTML = repoFiles
.map((f) => [
'',
'  ',
'    ' + escapeHtml(f.name) + '',
'    ' + escapeHtml(f.repo) + '',
'  ',
'  ' + escapeHtml(f.relPath) + '',
''
].join(''))
.join('');
bindRowClicks();
}
}
function bindRowClicks(): void {
listEl.querySelectorAll('.item').forEach((node) => {
node.addEventListener('mousedown', (e) => {
e.preventDefault();
const idx = Number((node as HTMLElement).getAttribute('data-idx'));
selectCurrentItem(idx, (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey);
});
});
const active = listEl.querySelector('.item.active');
if (active) active.scrollIntoView({ block: 'nearest' });
}
function stripTriggerToken(ta: HTMLTextAreaElement): void {
if (!triggerRange) return;
const before = ta.value.slice(0, triggerRange.start);
const after = ta.value.slice(triggerRange.end);
ta.value = before + after;
ta.selectionStart = ta.selectionEnd = before.length;
ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function injectContent(content: string, fileName: string, toastMsg: string): void {
const target = activeInput || findVisibleInput();
if (!target) {
navigator.clipboard.writeText(content);
showToast(toastMsg + ' (copie)');
return;
}
if (target.tagName === 'TEXTAREA') {
stripTriggerToken(target as HTMLTextAreaElement);
}
target.focus();
if (content.length > MAX_SAFE_LENGTH || fileName.endsWith('.ts') || fileName.endsWith('.rs') || fileName.endsWith('.mjs')) {
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
if (mode === 'refs' && activeSkill) {
const ref = filteredRefs.slice(idx, (idx) + 1).find(() => true);
if (!ref) return;
const skillName = activeSkill.name;
closeMenu();
injectContent(
'## Reference (' + skillName + ') : ' + ref.relPath + '\n\n' + ref.content,
ref.relPath.split('/').join('-'),
'Reference "' + ref.relPath + '" ajoutee'
);
return;
}
if (mode === 'skills') {
const skill = filteredSkills.slice(idx, (idx) + 1).find(() => true);
if (!skill) return;
closeMenu();
const payload = fullBundle ? skill.fullContent : skill.smartContent;
injectContent(payload, skill.id + '.md', 'Skill "' + skill.name + '" ajoute');
return;
}
if (mode === 'files') {
const file = repoFiles.slice(idx, (idx) + 1).find(() => true);
if (!file) return;
closeMenu();
chrome.runtime.sendMessage({ type: 'FETCH_FILE_CONTENT', relPath: file.relPath }, (res) => {
if (!res?.ok || !res.data) {
showToast('Impossible de lire ' + file.relPath);
return;
}
const wrapped = '### Fichier : ' + BT1 + file.relPath + BT1 + '\n\n' + BT3 + '\n' + res.data.content + '\n' + BT3;
const target = activeInput || findVisibleInput();
if (target) {
if (target.tagName === 'TEXTAREA') stripTriggerToken(target as HTMLTextAreaElement);
uploadAsTextFile(wrapped, target, showToast, file.name + '.txt');
}
});
}
}
document.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.tagName !== 'TEXTAREA') return;
    const ta = target as HTMLTextAreaElement;
    activeInput = ta;

    const cursor = ta.selectionStart ?? ta.value.length;
    const textBeforeCursor = ta.value.slice(0, cursor);
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const triggerPos = Math.max(lastSlash, lastAt);
    let match: { symbol: string; query: string; start: number } | null = null;

    if (triggerPos !== -1) {
      const prevChar = triggerPos === 0 ? ' ' : textBeforeCursor.charAt(triggerPos - 1);
      const afterTrigger = textBeforeCursor.slice(triggerPos + 1);
      if (/\s/.test(prevChar) && !/\s/.test(afterTrigger)) {
        match = { symbol: textBeforeCursor.charAt(triggerPos), query: afterTrigger, start: triggerPos };
      }
    }

    if (match) {
      const targetMode: MenuMode = match.symbol === '/' ? 'skills' : 'files';
      if (!isOpen || mode !== targetMode) {
        openMenu(targetMode, match.query, { start: match.start, end: cursor });
      } else {
        triggerRange = { start: match.start, end: cursor };
        filterInput.value = match.query;
        applyFilter(match.query);
        positionElements();
      }
    } else if (isOpen && triggerRange) {
      closeMenu();
    }
  }, true);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
if (!isOpen) return;
const len = mode === 'refs' ? filteredRefs.length : mode === 'skills' ? filteredSkills.length : repoFiles.length;
if (e.key === 'Escape') {
e.preventDefault();
e.stopPropagation();
if (mode === 'refs') {
switchMode('skills', filterInput.value);
} else {
closeMenu();
}
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
} else if (e.key === 'ArrowRight' && mode === 'skills' && document.activeElement !== activeInput) {
const s = filteredSkills.slice(selectedIndex, (selectedIndex) + 1).find(() => true);
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
}, true);
triggerPill.addEventListener('click', () => {
if (isOpen) closeMenu();
else openMenu('skills', '', null);
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
if (!path.includes(popover) && !path.includes(triggerPill) && e.target !== activeInput) {
closeMenu();
}
});
window.addEventListener('resize', positionElements, { passive: true });
window.addEventListener('scroll', positionElements, { passive: true });
setInterval(positionElements, 1200);
}
