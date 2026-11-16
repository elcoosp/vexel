import { MAX_SAFE_LENGTH, uploadAsTextFile } from './untruncate';

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

const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

function el(tagName: string, attrs: string, inner: string): string {
  const space = attrs ? ' ' + attrs : '';
  return LT + tagName + space + GT + inner + LT + '/' + tagName + GT;
}

function voidEl(tagName: string, attrs: string): string {
  const space = attrs ? ' ' + attrs : '';
  return LT + tagName + space + '/' + GT;
}

const ICONS = {
  search: el('svg', 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('circle', 'cx="11" cy="11" r="8"') + voidEl('path', 'd="m21 21-4.3-4.3"')
  ),
  sparkles: el('svg', 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"')
  ),
  fileText: el('svg', 'width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"') +
    voidEl('path', 'd="M14 2v4a2 2 0 0 0 2 2h4"') +
    voidEl('path', 'd="M10 9H8"') +
    voidEl('path', 'd="M16 13H8"') +
    voidEl('path', 'd="M16 17H8"')
  ),
  paperclip: el('svg', 'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"')
  ),
  folderTree: el('svg', 'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"') +
    voidEl('path', 'd="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"') +
    voidEl('path', 'd="M3 5a2 2 0 0 0 2 2h3"') +
    voidEl('path', 'd="M3 3v13a2 2 0 0 0 2 2h3"')
  ),
  chevronRight: el('svg', 'width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="m9 18 6-6-6-6"')
  ),
  arrowLeft: el('svg', 'width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('path', 'd="m12 19-7-7 7-7"') + voidEl('path', 'd="M19 12H5"')
  ),
  alertCircle: el('svg', 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    voidEl('circle', 'cx="12" cy="12" r="10"') +
    voidEl('line', 'x1="12" x2="12" y1="8" y2="12"') +
    voidEl('line', 'x1="12" x2="12.01" y1="16" y2="16"')
  )
};

const CSS_RULES = [
  ':host { all: initial; }',
  '.backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.58); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 2147483646; display: none; align-items: flex-start; justify-content: center; padding-top: 11vh; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }',
  '.backdrop.open { display: flex; }',
  '.modal { width: 650px; max-width: 94vw; background: rgba(20, 20, 23, 0.97); border: 1px solid rgba(255, 255, 255, 0.11); border-radius: 14px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.78); overflow: hidden; color: #f4f4f5; display: flex; flex-direction: column; }',
  '.header { display: flex; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); gap: 10px; }',
  '.search-icon { color: #71717a; display: flex; align-items: center; }',
  '.back-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; color: #e4e4e7; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); padding: 3px 8px; border-radius: 6px; cursor: pointer; }',
  'input { flex: 1; background: transparent; border: none; outline: none; color: #fafafa; font-size: 15px; font-weight: 400; letter-spacing: -0.01em; }',
  'input::placeholder { color: #52525b; }',
  '.brand { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; color: #a1a1aa; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); padding: 3px 8px; border-radius: 6px; }',
  '.list { max-height: 380px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }',
  '.list::-webkit-scrollbar { width: 6px; }',
  '.list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 3px; }',
  '.item { padding: 10px 12px; border-radius: 9px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; border: 1px solid transparent; }',
  '.item.active { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.09); }',
  '.item-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }',
  '.item-title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }',
  '.item-icon { color: #a1a1aa; display: flex; align-items: center; flex-shrink: 0; }',
  '.item.active .item-icon { color: #60a5fa; }',
  '.item-name { font-weight: 500; font-size: 14px; color: #f4f4f5; letter-spacing: -0.01em; }',
  '.badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }',
  '.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 5px; background: rgba(255, 255, 255, 0.05); color: #a1a1aa; border: 1px solid rgba(255, 255, 255, 0.06); }',
  '.pill.file { color: #93c5fd; background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.25); }',
  '.pill.refs { color: #c4b5fd; background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.25); }',
  '.item-desc { font-size: 12.5px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 22px; }',
  '.item.active .item-desc { color: #a1a1aa; }',
  '.footer { display: flex; align-items: center; justify-content: space-between; padding: 9px 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(14, 14, 17, 0.85); font-size: 11.5px; color: #71717a; }',
  '.shortcuts { display: flex; align-items: center; gap: 12px; }',
  '.sc { display: inline-flex; align-items: center; gap: 4px; }',
  'kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: #a1a1aa; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px; padding: 1px 5px; }',
  '.empty { padding: 32px 20px; text-align: center; color: #71717a; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }',
  '.err { color: #fca5a5; font-family: ui-monospace, monospace; font-size: 11.5px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 6px 10px; border-radius: 6px; }'
].join('\n');

const PALETTE_HTML =
  el('style', '', CSS_RULES) +
  el('div', 'class="backdrop" id="backdrop"',
    el('div', 'class="modal"',
      el('div', 'class="header"',
        el('span', 'class="search-icon" id="search-icon"', ICONS.search) +
        el('span', 'class="back-pill" id="back-pill" style="display:none"', ICONS.arrowLeft + ' ' + el('span', 'id="active-skill-title"', '')) +
        voidEl('input', 'id="search" type="text" placeholder="Rechercher un skill..." autocomplete="off"') +
        el('span', 'class="brand"', ICONS.sparkles + ' VEXEL')
      ) +
      el('div', 'class="list" id="list"', '') +
      el('div', 'class="footer"',
        el('span', 'id="count-label"', '0 skill') +
        el('div', 'class="shortcuts" id="footer-shortcuts"', '')
      )
    )
  );

export function initCommandPalette(showToast: (msg: string) => void): void {
  let isOpen = false;
  let skills: SkillItem[] = [];
  let filteredSkills: SkillItem[] = [];
  let activeSkill: SkillItem | null = null;
  let filteredRefs: RefFile[] = [];
  let selectedIndex = 0;
  let lastActiveInput: HTMLElement | null = null;

  const host = document.createElement('div');
  host.id = 'vexel-palette-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = PALETTE_HTML;
  document.body.appendChild(host);

  const backdrop = shadow.getElementById('backdrop') as HTMLDivElement;
  const searchInput = shadow.getElementById('search') as HTMLInputElement;
  const listEl = shadow.getElementById('list') as HTMLDivElement;
  const countLabel = shadow.getElementById('count-label') as HTMLSpanElement;
  const footerShortcuts = shadow.getElementById('footer-shortcuts') as HTMLDivElement;
  const backPill = shadow.getElementById('back-pill') as HTMLSpanElement;
  const activeSkillTitle = shadow.getElementById('active-skill-title') as HTMLSpanElement;

  function updateHeaderAndFooter(): void {
    if (activeSkill) {
backPill.style.display = 'inline-flex';
activeSkillTitle.textContent = activeSkill.name;
searchInput.placeholder = 'Filtrer les references de ' + activeSkill.name + '...';
countLabel.textContent = filteredRefs.length + (filteredRefs.length > 1 ? ' references' : ' reference');
footerShortcuts.innerHTML =
el('span', 'class="sc"', el('kbd', '', '←') + ' Retour') +
el('span', 'class="sc"', el('kbd', '', '↵') + ' Injecter cette ref');
} else {
backPill.style.display = 'none';
searchInput.placeholder = 'Rechercher un skill...';
countLabel.textContent = filteredSkills.length + (filteredSkills.length > 1 ? ' skills' : ' skill');
footerShortcuts.innerHTML =
el('span', 'class="sc"', el('kbd', '', '↵') + ' SKILL + index refs') +
el('span', 'class="sc"', el('kbd', '', '→') + ' Ouvrir refs') +
el('span', 'class="sc"', el('kbd', '', '⌘') + el('kbd', '', '↵') + ' Tout joindre');
}
}
function enterSkillRefs(skill?: SkillItem): void {
if (!skill || skill.refs.length === 0) return;
activeSkill = skill;
searchInput.value = '';
filterItems('');
}
function exitSkillRefs(): void {
if (!activeSkill) return;
activeSkill = null;
searchInput.value = '';
filterItems('');
}
backPill.addEventListener('click', exitSkillRefs);
function loadSkills(): void {
listEl.innerHTML = el('div', 'class="empty"', 'Indexation des skills...');
let settled = false;
const timeoutId = window.setTimeout(() => {
if (settled) return;
settled = true;
listEl.innerHTML = el('div', 'class="empty"',
ICONS.alertCircle +
el('span', '', 'Timeout du Service Worker.') +
el('div', 'class="err"', 'Rechargez Vexel dans chrome://extensions/ puis actualisez la page.')
);
}, 3000);
try {
chrome.runtime.sendMessage({ type: 'FETCH_SKILLS' }, (response) => {
if (settled) return;
settled = true;
window.clearTimeout(timeoutId);
if (chrome.runtime.lastError || !response || !response.ok) {
const errMsg = chrome.runtime.lastError?.message || response?.error || 'Bridge hors ligne';
listEl.innerHTML = el('div', 'class="empty"',
ICONS.alertCircle +
el('span', '', 'Bridge local injoignable') +
el('div', 'class="err"', escapeHtml(errMsg))
);
return;
}
skills = response.data?.skills || [];
filterItems(searchInput.value);
});
} catch {
if (!settled) {
settled = true;
window.clearTimeout(timeoutId);
listEl.innerHTML = el('div', 'class="empty"',
ICONS.alertCircle +
el('span', '', 'Extension mise a jour. Actualisez la page (Cmd+R).')
);
}
}
}
function filterItems(query: string): void {
const q = query.toLowerCase().trim();
if (activeSkill) {
filteredRefs = q
? activeSkill.refs.filter((r) => r.relPath.toLowerCase().includes(q))
: activeSkill.refs;
} else {
filteredSkills = q
? skills.filter(
(s) =>
s.name.toLowerCase().includes(q) ||
s.description.toLowerCase().includes(q) ||
s.refs.some((r) => r.relPath.toLowerCase().includes(q))
)
: skills;
}
selectedIndex = 0;
updateHeaderAndFooter();
renderList();
}
function renderList(): void {
if (activeSkill) {
if (filteredRefs.length === 0) {
listEl.innerHTML = el('div', 'class="empty"', 'Aucune reference correspondante.');
return;
}
const rows: string[] = [];
for (let i = 0; i < filteredRefs.length; i++) {
const ref = filteredRefs.slice(i, i + 1).find(() => true);
if (!ref) continue;
const cls = i === selectedIndex ? 'item active' : 'item';
const isFile = ref.length > MAX_SAFE_LENGTH;
const badge = isFile
? el('span', 'class="pill file"', ICONS.paperclip + ' ' + formatChars(ref.length))
: el('span', 'class="pill"', ICONS.fileText + ' ' + formatChars(ref.length));
rows.push(
el('div', 'class="' + cls + '" data-idx="' + i + '"',
el('div', 'class="item-top"',
el('div', 'class="item-title-wrap"',
el('span', 'class="item-icon"', ICONS.fileText) +
el('span', 'class="item-name"', escapeHtml(ref.relPath))
) +
el('div', 'class="badges"', badge)
)
)
);
}
listEl.innerHTML = rows.join('');
listEl.querySelectorAll('.item').forEach((node) => {
const htmlEl = node as HTMLElement;
htmlEl.addEventListener('click', () => {
const idx = Number(htmlEl.getAttribute('data-idx'));
const ref = filteredRefs.slice(idx, idx + 1).find(() => true);
applyRef(ref);
});
});
scrollActive();
return;
}
if (filteredSkills.length === 0) {
listEl.innerHTML = el('div', 'class="empty"', 'Aucun skill correspondant.');
return;
}
const rows: string[] = [];
for (let i = 0; i < filteredSkills.length; i++) {
const s = filteredSkills.slice(i, i + 1).find(() => true);
if (!s) continue;
const isFileMode = s.smartLength > MAX_SAFE_LENGTH;
const cls = i === selectedIndex ? 'item active' : 'item';
const refsBadge = s.refCount > 0
? el('span', 'class="pill refs" data-browse-idx="' + i + '"', ICONS.folderTree + ' ' + s.refCount + ' ref' + (s.refCount > 1 ? 's' : '') + ' ' + ICONS.chevronRight)
: '';
const modeBadge = isFileMode
? el('span', 'class="pill file"', ICONS.paperclip + ' ' + formatChars(s.smartLength))
: el('span', 'class="pill"', ICONS.fileText + ' ' + formatChars(s.smartLength));
const descHtml = s.description
? el('div', 'class="item-desc"', escapeHtml(s.description))
: '';
rows.push(
el('div', 'class="' + cls + '" data-idx="' + i + '"',
el('div', 'class="item-top"',
el('div', 'class="item-title-wrap"',
el('span', 'class="item-icon"', ICONS.sparkles) +
el('span', 'class="item-name"', escapeHtml(s.name))
) +
el('div', 'class="badges"', refsBadge + modeBadge)
) +
descHtml
)
);
}
listEl.innerHTML = rows.join('');
listEl.querySelectorAll('.pill.refs').forEach((badgeNode) => {
const bEl = badgeNode as HTMLElement;
bEl.addEventListener('click', (e) => {
e.stopPropagation();
const idx = Number(bEl.getAttribute('data-browse-idx'));
const item = filteredSkills.slice(idx, idx + 1).find(() => true);
enterSkillRefs(item);
});
});
listEl.querySelectorAll('.item').forEach((node) => {
const htmlEl = node as HTMLElement;
htmlEl.addEventListener('click', (e) => {
const idx = Number(htmlEl.getAttribute('data-idx'));
const item = filteredSkills.slice(idx, idx + 1).find(() => true);
const fullBundle = (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey;
applySkill(item, fullBundle);
});
});
scrollActive();
}
function scrollActive(): void {
const activeEl = listEl.querySelector('.item.active');
if (activeEl) {
activeEl.scrollIntoView({ block: 'nearest' });
}
}
function injectPayload(payload: string, fileName: string, toastLabel: string): void {
const target =
lastActiveInput ||
(document.querySelector('textarea, [contenteditable="true"]') as HTMLElement | null);
if (!target) {
navigator.clipboard.writeText(payload);
showToast(toastLabel + ' copie');
return;
}
target.focus();
if (payload.length > MAX_SAFE_LENGTH) {
uploadAsTextFile(payload, target, showToast, fileName);
return;
}
if (target.tagName === 'TEXTAREA') {
const ta = target as HTMLTextAreaElement;
const prefix = ta.value ? ta.value + '\n\n' : '';
ta.value = prefix + payload;
ta.dispatchEvent(new Event('input', { bubbles: true }));
} else {
document.execCommand('insertText', false, payload);
}
showToast(toastLabel + ' insere');
}
function applySkill(skill?: SkillItem, fullBundle = false): void {
if (!skill) return;
closePalette();
if (fullBundle) {
injectPayload(
skill.fullContent,
skill.id + '-full.md',
'Skill "' + skill.name + '" complet (+' + skill.refCount + ' refs)'
);
} else {
injectPayload(
skill.smartContent,
skill.id + '.md',
'Skill "' + skill.name + '" (+ index refs)'
);
}
}
function applyRef(ref?: RefFile): void {
if (!ref || !activeSkill) return;
const skillName = activeSkill.name;
closePalette();
const header = '## Reference demandee (' + skillName + ') : ' + ref.relPath + '\n\n';
const safeFile = ref.relPath.split('/').join('-');
injectPayload(header + ref.content, safeFile, 'Reference "' + ref.relPath + '"');
}
function openPalette(): void {
const active = document.activeElement as HTMLElement | null;
if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable)) {
lastActiveInput = active;
}
activeSkill = null;
isOpen = true;
backdrop.classList.add('open');
searchInput.value = '';
searchInput.focus();
loadSkills();
}
function closePalette(): void {
isOpen = false;
activeSkill = null;
backdrop.classList.remove('open');
}
document.addEventListener('keydown', (e: KeyboardEvent) => {
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
e.preventDefault();
e.stopPropagation();
if (isOpen) {
closePalette();
} else {
openPalette();
}
return;
}
if (!isOpen) return;
const listLen = activeSkill ? filteredRefs.length : filteredSkills.length;
if (e.key === 'Escape') {
e.preventDefault();
if (activeSkill) {
exitSkillRefs();
} else {
closePalette();
}
} else if (e.key === 'ArrowDown') {
e.preventDefault();
selectedIndex = (selectedIndex + 1) % Math.max(1, listLen);
renderList();
} else if (e.key === 'ArrowUp') {
e.preventDefault();
selectedIndex = (selectedIndex - 1 + listLen) % Math.max(1, listLen);
renderList();
} else if (e.key === 'ArrowRight' && !activeSkill) {
const current = filteredSkills.slice(selectedIndex, selectedIndex + 1).find(() => true);
if (current && current.refs.length > 0) {
e.preventDefault();
enterSkillRefs(current);
}
} else if (e.key === 'ArrowLeft' && activeSkill && searchInput.value === '') {
e.preventDefault();
exitSkillRefs();
} else if (e.key === 'Enter') {
e.preventDefault();
if (activeSkill) {
const ref = filteredRefs.slice(selectedIndex, selectedIndex + 1).find(() => true);
applyRef(ref);
} else {
const skill = filteredSkills.slice(selectedIndex, selectedIndex + 1).find(() => true);
const fullBundle = e.metaKey || e.ctrlKey;
applySkill(skill, fullBundle);
}
}
}, true);
searchInput.addEventListener('input', () => filterItems(searchInput.value));
backdrop.addEventListener('click', (e) => {
if (e.target === backdrop) closePalette();
});
}
function formatChars(len: number): string {
if (len >= 1000) {
return (len / 1000).toFixed(1) + 'k car.';
}
return len + ' car.';
}
function escapeHtml(str: string): string {
return str
.replace(/&/g, '&')
.replace(/</g, '<')
.replace(/>/g, '>');
}
