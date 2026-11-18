import { browseLocalFs, writeLocalFsFile } from './local-fs';
import { animate } from 'motion';
import { createLucideIcon, createFileOrFolderIcon } from './icons';
import { loadRecentFiles } from './palette-files';
import type { BrowseEntry } from './palette-ui';

const EXT_BY_LANG: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  json: 'json',
  html: 'html',
  css: 'css',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  yaml: 'yml',
  yml: 'yml',
  markdown: 'md',
  md: 'md',
  sql: 'sql',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
};

const DEFAULT_NAME_BY_EXT: Record<string, string> = {
  py: 'script.py',
  ts: 'index.ts',
  tsx: 'Component.tsx',
  js: 'index.js',
  jsx: 'Component.jsx',
  rs: 'main.rs',
  go: 'main.go',
  sh: 'run.sh',
  json: 'config.json',
  md: 'README.md',
  html: 'index.html',
  css: 'styles.css',
  sql: 'query.sql',
};

function getRecentFolderPaths(): string[] {
  const entries = loadRecentFiles();
  const folders: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const folder = entry.isDir
      ? entry.relPath.replace(/\/+$/, '')
      : entry.relPath.includes('/')
        ? entry.relPath.slice(0, entry.relPath.lastIndexOf('/'))
        : '';
    if (folder && !seen.has(folder)) {
      seen.add(folder);
      folders.push(folder);
    }
  }
  return folders.slice(0, 4);
}

function detectLanguage(container: HTMLElement, codeEl: HTMLElement, header: HTMLElement): string {
  const classSources = [codeEl.className || '', container.className || ''];
  for (const src of classSources) {
    const m = src.match(/language-([a-zA-Z0-9_-]+)/i);
    const g1 = m ? m.slice(1, 2).find(Boolean) : undefined; if (g1) return g1.toLowerCase();
  }

  let rawText = '';
  for (let n = header.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) rawText += n.textContent || '';
    else if (n.nodeType === 1 && !(n as Element).hasAttribute('data-vexel-ui') && (n as Element).tagName !== 'BUTTON') {
      rawText += n.textContent || '';
    }
  }
  const rawLabel = rawText.trim().split(/\s+/).find(Boolean)?.toLowerCase() || '';
  if (rawLabel && EXT_BY_LANG[rawLabel]) {
    return rawLabel;
  }

  return '';
}

function inferSuggestedPath(
  container: HTMLElement,
  codeText: string,
  lang: string,
  recentFolders: string[]
): string {
  const defaultFolder = recentFolders.find(Boolean) || '';
  const withFolder = (filePath: string): string => {
    if (!defaultFolder || filePath.includes('/')) return filePath;
    return defaultFolder + '/' + filePath;
  };

  const firstLine = (codeText.split('\n').find(() => true) || '').trim();
  const commentPathMatch = firstLine.match(
    /^(?:\/\/|#|\/\*|<!--)\s*(?:file:\s*)?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/i
  );
  const cm = commentPathMatch ? commentPathMatch.slice(1, 2).find(Boolean) : undefined;
  if (cm) return withFolder(cm);

  let prev: Element | null = container.previousElementSibling;
  for (let step = 0; step < 2 && prev; step++) {
    const txt = (prev.textContent || '').trim();
    const headerMatch = txt.match(
      /(?:File:|Path:|\b)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/
    );
    const hm = headerMatch ? headerMatch.slice(1, 2).find(Boolean) : undefined; if (hm) return hm;
    prev = prev.previousElementSibling;
  }

  const ext = EXT_BY_LANG[lang] || 'txt';
  const baseName = DEFAULT_NAME_BY_EXT[ext] || 'snippet.' + ext;
  return withFolder(baseName);
}

export function initCodeSave(showToast: (msg: string) => void): void {
  const mountSaveButton = (container: HTMLElement) => {
    if (container.getAttribute('data-vexel-save') === 'true') return;
    const codeEl = container.querySelector('code');
    const header =
      container.querySelector<HTMLElement>('.a2TNg') ||
      (container.firstElementChild as HTMLElement | null);
    if (!codeEl || !header) return;
    container.setAttribute('data-vexel-save', 'true');

      const lang = detectLanguage(container, codeEl, header);

      const triggerBtn = document.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.setAttribute('data-vexel-ui', 'true');
      triggerBtn.title = 'Save code block to local file via Vexel Bridge';

      const iconWrap = document.createElement('span');
      iconWrap.style.display = 'inline-flex';
      iconWrap.style.alignItems = 'center';
      iconWrap.appendChild(createLucideIcon('download', 12, 'currentColor'));

      const labelSpan = document.createElement('span');
      labelSpan.textContent = 'Save to file';

      triggerBtn.append(iconWrap, labelSpan);
      Object.assign(triggerBtn.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '28px',
        marginLeft: '8px',
        padding: '0 11px 0 9px',
        borderRadius: '999px',
        border: '1px solid #e1e3e6',
        backgroundColor: '#f8f9fa',
        color: '#3c4043',
        fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
        fontSize: '12px',
        fontWeight: '500',
        letterSpacing: '-0.01em',
        lineHeight: '1',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: '0 1px 2px rgba(60, 64, 67, 0.05)',
        transition:
          'background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease',
      });

      let drawerEl: HTMLDivElement | null = null;
      let isOpen = false;
      let cleanupListeners: (() => void) | null = null;

      const setTriggerActiveStyle = (active: boolean) => {
        if (active) {
          triggerBtn.style.backgroundColor = '#e8f0fe';
          triggerBtn.style.borderColor = '#a8c7fa';
          triggerBtn.style.color = '#1967d2';
          triggerBtn.style.boxShadow = '0 2px 6px rgba(26, 115, 232, 0.14)';
        } else {
          triggerBtn.style.backgroundColor = '#f8f9fa';
          triggerBtn.style.borderColor = '#e1e3e6';
          triggerBtn.style.color = '#3c4043';
          triggerBtn.style.boxShadow = '0 1px 2px rgba(60, 64, 67, 0.05)';
        }
      };

      triggerBtn.addEventListener('mouseenter', () => {
        if (isOpen) return;
        triggerBtn.style.backgroundColor = '#f1f3f4';
        triggerBtn.style.borderColor = '#c6dafc';
        triggerBtn.style.color = '#1a73e8';
        triggerBtn.style.boxShadow = '0 2px 6px rgba(26, 115, 232, 0.12)';
      });

      triggerBtn.addEventListener('mouseleave', () => {
        if (!isOpen) setTriggerActiveStyle(false);
      });

      const closeDrawer = () => {
        if (!drawerEl || !isOpen) return;
        isOpen = false;
        setTriggerActiveStyle(false);
        if (cleanupListeners) {
          cleanupListeners();
          cleanupListeners = null;
        }
        const closingEl = drawerEl;
        drawerEl = null;
        animate(
          closingEl,
          { opacity: 0, y: -4, scale: 0.99 },
          { duration: 0.14, ease: [0.4, 0, 1, 1] }
        ).finished.then(() => closingEl.remove());
      };

      triggerBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        animate(triggerBtn, { scale: Array(0.95, 1) }, { duration: 0.18 });

        if (isOpen) {
          closeDrawer();
          return;
        }

        isOpen = true;
        setTriggerActiveStyle(true);

        const recentFolders = getRecentFolderPaths();
        const currentCode = codeEl.textContent || '';
        const suggested = inferSuggestedPath(container, currentCode, lang, recentFolders);

        const positionDrawer = () => {
          if (!drawerEl) return;
          const boxRect = container.getBoundingClientRect();
          const hdrRect = header.getBoundingClientRect();
          const availW = Math.max(280, Math.min(boxRect.width - 24, 560));
          const panelW = Math.min(availW, window.innerWidth - 24);
          const rawLeft = boxRect.right - panelW - 12;
          const minLeft = Math.max(12, boxRect.left + 12);
          const left = Math.max(minLeft, Math.min(rawLeft, window.innerWidth - panelW - 12));
          const top = Math.max(12, Math.min(hdrRect.bottom + 10, window.innerHeight - 180));

          drawerEl.style.width = panelW + 'px';
          drawerEl.style.left = left + 'px';
          drawerEl.style.top = top + 'px';
        };

        const handleOutsideClick = (e: MouseEvent) => {
          const t = e.target as Node | null;
          if (drawerEl && t && !drawerEl.contains(t) && !triggerBtn.contains(t)) {
            closeDrawer();
          }
        };

        let drawerPosRaf = 0;
        const schedulePositionDrawer = () => {
          if (drawerPosRaf) return;
          drawerPosRaf = window.requestAnimationFrame(() => {
            drawerPosRaf = 0;
            positionDrawer();
          });
        };

        cleanupListeners = () => {
          if (drawerPosRaf) window.cancelAnimationFrame(drawerPosRaf);
          window.removeEventListener('scroll', schedulePositionDrawer, true);
          window.removeEventListener('resize', schedulePositionDrawer);
          document.removeEventListener('mousedown', handleOutsideClick, true);
        };

        drawerEl = document.createElement('div');
        drawerEl.setAttribute('data-vexel-ui', 'true');
        Object.assign(drawerEl.style, {
          position: 'fixed',
          zIndex: '2147483645',
          margin: '0',
          padding: '11px 12px',
          borderRadius: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(18px)',
          border: '1px solid #dadce0',
          boxShadow: '0 14px 36px rgba(60, 64, 67, 0.18), 0 2px 6px rgba(60, 64, 67, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
          transformOrigin: 'top right',
          opacity: '0',
          boxSizing: 'border-box',
        });

        const topRow = document.createElement('div');
        Object.assign(topRow.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
        });

        const inputShell = document.createElement('div');
Object.assign(inputShell.style, {
flex: '1',
minWidth: '0',
display: 'flex',
alignItems: 'center',
gap: '7px',
padding: '6px 10px',
borderRadius: '10px',
backgroundColor: '#f8f9fa',
border: '1px solid #dadce0',
transition: 'border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease',
});
const folderGlyph = createLucideIcon('folder', 13, '#1a73e8');
const input = document.createElement('input');
input.type = 'text';
input.value = suggested;
input.placeholder = 'folder/filename.ext';
Object.assign(input.style, {
flex: '1',
minWidth: '0',
border: 'none',
background: 'transparent',
color: '#1f1f1f',
fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
fontSize: '12.5px',
fontWeight: '500',
outline: 'none',
});
input.addEventListener('focus', () => {
inputShell.style.backgroundColor = '#ffffff';
inputShell.style.borderColor = '#1a73e8';
inputShell.style.boxShadow = '0 0 0 3px rgba(26, 115, 232, 0.14)';
});
input.addEventListener('blur', () => {
inputShell.style.backgroundColor = '#f8f9fa';
inputShell.style.borderColor = '#dadce0';
inputShell.style.boxShadow = 'none';
});
inputShell.append(folderGlyph, input);
const saveBtn = document.createElement('button');
saveBtn.type = 'button';
saveBtn.textContent = 'Save';
Object.assign(saveBtn.style, {
height: '32px',
padding: '0 14px',
borderRadius: '999px',
border: 'none',
backgroundColor: '#1a73e8',
color: '#ffffff',
fontFamily: 'inherit',
fontSize: '12px',
fontWeight: '600',
cursor: 'pointer',
flexShrink: '0',
boxShadow: '0 1px 3px rgba(26, 115, 232, 0.28)',
transition: 'background-color 0.14s ease, transform 0.12s ease',
});
saveBtn.addEventListener('mouseenter', () => {
if (!saveBtn.disabled) saveBtn.style.backgroundColor = '#1557b0';
});
saveBtn.addEventListener('mouseleave', () => {
if (!saveBtn.disabled) saveBtn.style.backgroundColor = '#1a73e8';
});
const cancelBtn = document.createElement('button');
cancelBtn.type = 'button';
cancelBtn.textContent = 'Cancel';
Object.assign(cancelBtn.style, {
height: '32px',
padding: '0 11px',
borderRadius: '999px',
border: '1px solid #e0e0e0',
backgroundColor: '#ffffff',
color: '#5f6368',
fontFamily: 'inherit',
fontSize: '12px',
fontWeight: '500',
cursor: 'pointer',
flexShrink: '0',
transition: 'background-color 0.14s ease, color 0.14s ease',
});
cancelBtn.addEventListener('mouseenter', () => {
cancelBtn.style.backgroundColor = '#f1f3f4';
cancelBtn.style.color = '#1f1f1f';
});
cancelBtn.addEventListener('mouseleave', () => {
cancelBtn.style.backgroundColor = '#ffffff';
cancelBtn.style.color = '#5f6368';
});
topRow.append(inputShell, saveBtn, cancelBtn);
drawerEl.appendChild(topRow);
// Path autocomplete suggestions list
const acList = document.createElement('div');
Object.assign(acList.style, {
display: 'none',
flexDirection: 'column',
gap: '2px',
maxHeight: '150px',
overflowY: 'auto',
padding: '4px',
borderRadius: '10px',
backgroundColor: '#f8f9fa',
border: '1px solid #e8eaed',
});
let acEntries: BrowseEntry[] = [];
let acSelectedIdx = -1;
let acTimer: number | undefined;
let lastQueriedDir = '\0';
let cachedDirEntries: BrowseEntry[] = [];
        let hasUserTyped = false;
const getCurrentFileName = (): string => {
const cur = input.value.trim();
const idx = cur.lastIndexOf('/');
return idx !== -1 ? cur.slice(idx + 1) : cur;
};
const applyAutocompleteEntry = (entry: BrowseEntry) => {
if (entry.isDir) {
const fileName = getCurrentFileName() || 'snippet.txt';
input.value = entry.relPath + '/' + fileName;
const slashPos = input.value.lastIndexOf('/');
input.focus();
input.setSelectionRange(slashPos + 1, input.value.length);
triggerAutocomplete();
} else {
input.value = entry.relPath;
input.focus();
acList.style.display = 'none';
acEntries = [];
acSelectedIdx = -1;
}
};
const renderAutocomplete = () => {
if (acEntries.length === 0) {
acList.style.display = 'none';
return;
}
acList.style.display = 'flex';
acList.replaceChildren();
acEntries.forEach((entry, idx) => {
const row = document.createElement('div');
const isSel = idx === acSelectedIdx;
Object.assign(row.style, {
display: 'flex',
alignItems: 'center',
justifyContent: 'space-between',
gap: '8px',
padding: '5px 8px',
borderRadius: '7px',
cursor: 'pointer',
backgroundColor: isSel ? '#e8f0fe' : 'transparent',
color: isSel ? '#1967d2' : '#1f1f1f',
fontSize: '12px',
fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
});
const leftPart = document.createElement('span');
Object.assign(leftPart.style, {
display: 'inline-flex',
alignItems: 'center',
gap: '6px',
minWidth: '0',
overflow: 'hidden',
textOverflow: 'ellipsis',
whiteSpace: 'nowrap',
});
leftPart.append(
createFileOrFolderIcon(entry.name, entry.isDir, 13),
document.createTextNode(entry.isDir ? entry.name + '/' : entry.name)
);
const hintBadge = document.createElement('span');
hintBadge.textContent = entry.isDir ? 'Folder' : 'Overwrite';
Object.assign(hintBadge.style, {
fontSize: '10px',
fontWeight: '600',
padding: '1px 6px',
borderRadius: '5px',
backgroundColor: entry.isDir ? '#e8f0fe' : 'rgba(60, 64, 67, 0.08)',
color: entry.isDir ? '#1967d2' : '#5f6368',
flexShrink: '0',
});
row.append(leftPart, hintBadge);
row.addEventListener('mouseenter', () => {
acSelectedIdx = idx;
renderAutocomplete();
});
row.addEventListener('mousedown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
applyAutocompleteEntry(entry);
});
acList.appendChild(row);
});
};
const filterAndShowAc = (dirEntries: BrowseEntry[], partialName: string) => {
const q = hasUserTyped ? partialName.toLowerCase() : '';
acEntries = dirEntries
.filter(
(e) =>
e.relPath !== 'git_diff' &&
e.name !== '.. (Parent folder)' &&
(!q || e.name.toLowerCase().includes(q))
)
.slice(0, 6);
acSelectedIdx = acEntries.length > 0 ? 0 : -1;
renderAutocomplete();
};
const triggerAutocomplete = () => {
if (acTimer) window.clearTimeout(acTimer);
acTimer = window.setTimeout(() => {
const raw = input.value.trim();
const slashIdx = raw.lastIndexOf('/');
const dir = slashIdx !== -1 ? raw.slice(0, slashIdx) : '';
const partial = slashIdx !== -1 ? raw.slice(slashIdx + 1) : raw;
if (dir === lastQueriedDir) {
filterAndShowAc(cachedDirEntries, partial);
return;
}
chrome.runtime.sendMessage({ type: 'BROWSE_DIR', dir, query: '' }, async (res) => {
              const lastErr = chrome.runtime.lastError?.message;
              if (lastErr || !res?.ok) {
                const local = await browseLocalFs(dir, '', false);
                if (local.ok && local.entries) {
                  lastQueriedDir = dir;
                  cachedDirEntries = local.entries;
                  filterAndShowAc(cachedDirEntries, partial);
                }
                return;
              }
              if (res?.data?.missingDir) {
                lastQueriedDir = dir;
                cachedDirEntries = [];
                acEntries = [];
                acSelectedIdx = -1;
                acList.style.display = 'flex';
                acList.replaceChildren();
                const infoRow = document.createElement('div');
                Object.assign(infoRow.style, {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: '7px',
                  fontSize: '11.5px',
                  color: '#5f6368',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                });
                const txt = document.createElement('span');
                txt.textContent = (dir || 'new folder') + '/';
                const badge = document.createElement('span');
                badge.textContent = 'New folder on save';
                Object.assign(badge.style, {
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  backgroundColor: '#e8f0fe',
                  color: '#1967d2',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                });
                infoRow.append(txt, badge);
                acList.appendChild(infoRow);
                return;
              }
              const list = res?.data?.entries || res?.data?.items || [];
              lastQueriedDir = dir;
              cachedDirEntries = list;
              filterAndShowAc(cachedDirEntries, partial);
            });
}, 90);
};
drawerEl.appendChild(acList);
if (recentFolders.length > 0) {
const chipsRow = document.createElement('div');
Object.assign(chipsRow.style, {
display: 'flex',
alignItems: 'center',
flexWrap: 'wrap',
gap: '5px',
paddingLeft: '2px',
});
const chipsLabel = document.createElement('span');
chipsLabel.textContent = 'Recent:';
Object.assign(chipsLabel.style, {
fontSize: '11px',
fontWeight: '500',
color: '#80868b',
});
chipsRow.appendChild(chipsLabel);
for (const folder of recentFolders) {
const chip = document.createElement('button');
chip.type = 'button';
chip.textContent = folder + '/';
Object.assign(chip.style, {
display: 'inline-flex',
alignItems: 'center',
padding: '2px 8px',
borderRadius: '999px',
border: '1px solid #d2e3fc',
backgroundColor: '#f0f6ff',
color: '#1967d2',
fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
fontSize: '11px',
fontWeight: '500',
cursor: 'pointer',
transition: 'background-color 0.14s ease, transform 0.12s ease',
});
chip.addEventListener('mouseenter', () => {
chip.style.backgroundColor = '#e8f0fe';
});
chip.addEventListener('mouseleave', () => {
chip.style.backgroundColor = '#f0f6ff';
});
chip.addEventListener('click', (e) => {
e.preventDefault();
e.stopPropagation();
animate(chip, { scale: Array(0.94, 1) }, { duration: 0.16 });
const baseFile = getCurrentFileName() || 'snippet.txt';
input.value = folder + '/' + baseFile;
input.focus();
const slashIdx = input.value.lastIndexOf('/');
input.setSelectionRange(slashIdx + 1, input.value.length);
triggerAutocomplete();
});
chipsRow.appendChild(chip);
}
drawerEl.appendChild(chipsRow);
}
const hasValidFileExt = (p: string): boolean => {
          if (!p || p.endsWith('/')) return false;
          const base = p.slice(p.lastIndexOf('/') + 1);
          const dotIdx = base.lastIndexOf('.');
          return dotIdx > 0 && dotIdx < base.length - 1;
        };

        const commitSave = () => {
          const relPath = input.value.trim();
          if (!relPath) return;
          if (!hasValidFileExt(relPath)) {
            inputShell.style.borderColor = '#c5221f';
            inputShell.style.boxShadow = '0 0 0 3px rgba(197, 34, 31, 0.14)';
            animate(inputShell, { x: Array(-4, 4, -3, 3, 0) }, { duration: 0.24 });
            const suggestedExt = EXT_BY_LANG[lang] || 'txt';
            showToast('Add a file extension first (e.g. .' + suggestedExt + ')');
            input.focus();
            return;
          }
saveBtn.disabled = true;
saveBtn.textContent = 'Saving...';
const fileBody = codeEl.textContent || '';
          chrome.runtime.sendMessage(
            { type: 'WRITE_FILE', relPath, content: fileBody },
            async (res) => {
              if (!res?.ok || !res.data?.ok) {
                const localRes = await writeLocalFsFile(relPath, fileBody);
                if (!localRes.ok) {
                  saveBtn.disabled = false;
                  saveBtn.textContent = 'Save';
                  showToast(localRes.error || res?.data?.error || 'Failed to write file');
                  return;
                }
                saveBtn.style.backgroundColor = '#137333';
                saveBtn.textContent = 'Saved ✓';
                showToast('Saved locally: ' + relPath + ' (' + localRes.bytes + ' B)');
                window.setTimeout(() => closeDrawer(), 420);
                return;
              }
              saveBtn.style.backgroundColor = '#137333';
              saveBtn.textContent = 'Saved ✓';
              showToast('Saved ' + relPath + ' (' + res.data.bytes + ' B)');
              window.setTimeout(() => closeDrawer(), 420);
            }
          );
};
saveBtn.addEventListener('click', (e) => {
e.preventDefault();
e.stopPropagation();
animate(saveBtn, { scale: Array(0.95, 1) }, { duration: 0.16 });
commitSave();
});
cancelBtn.addEventListener('click', (e) => {
e.preventDefault();
e.stopPropagation();
closeDrawer();
});
input.addEventListener('input', () => {
triggerAutocomplete();
});
input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          const hasAc = acEntries.length > 0 && acList.style.display !== 'none';
          if (hasAc) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              acSelectedIdx = (acSelectedIdx + 1) % acEntries.length;
              renderAutocomplete();
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              acSelectedIdx = (acSelectedIdx - 1 + acEntries.length) % acEntries.length;
              renderAutocomplete();
              return;
            }
            const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
            if ((e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) && acSelectedIdx >= 0) {
              e.preventDefault();
              const chosen = acEntries.slice(acSelectedIdx, acSelectedIdx + 1).find(Boolean);
              if (chosen) applyAutocompleteEntry(chosen);
              return;
            }
          }

          if (e.altKey && e.key >= '1' && e.key <= '4') {
            const idx = Number(e.key) - 1;
            const targetFolder = recentFolders.slice(idx, idx + 1).find(Boolean);
            if (targetFolder) {
              e.preventDefault();
              hasUserTyped = false;
              const baseFile = getCurrentFileName() || 'snippet.txt';
              input.value = targetFolder + '/' + baseFile;
              const slashIdx = input.value.lastIndexOf('/');
              input.setSelectionRange(slashIdx + 1, input.value.length);
              triggerAutocomplete();
              return;
            }
          }

          if (e.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
            const pos = input.selectionStart || 0;
            if (pos > 0 && input.value.slice(pos - 1, pos) === '/') {
              const beforeSlash = input.value.slice(0, pos - 1);
              const prevSlash = beforeSlash.lastIndexOf('/');
              const parentPrefix = prevSlash !== -1 ? beforeSlash.slice(0, prevSlash + 1) : '';
              const afterSlash = input.value.slice(pos);
              e.preventDefault();
              hasUserTyped = false;
              input.value = parentPrefix + afterSlash;
              input.setSelectionRange(parentPrefix.length, parentPrefix.length);
              triggerAutocomplete();
              return;
            }
          }

          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || true)) {
            e.preventDefault();
            commitSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDrawer();
          }
        });
document.body.appendChild(drawerEl);
positionDrawer();
window.addEventListener('scroll', schedulePositionDrawer, { capture: true, passive: true });
window.addEventListener('resize', schedulePositionDrawer, { passive: true });
document.addEventListener('mousedown', handleOutsideClick, true);
animate(
drawerEl,
{ opacity: Array(0, 1), y: Array(-6, 0), scale: Array(0.985, 1) },
{ type: 'spring', stiffness: 520, damping: 36, mass: 0.65 }
);
input.focus();
const slashPos = input.value.lastIndexOf('/');
if (slashPos !== -1) {
input.setSelectionRange(slashPos + 1, input.value.length);
} else {
input.select();
}
triggerAutocomplete();
});
header.appendChild(triggerBtn);
  };

  
let lastCheckedPre: HTMLPreElement | null = null;
  const handleCodeHoverOrFocus = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (!target || target.nodeType !== 1) return;
    if (lastCheckedPre && lastCheckedPre.contains(target)) return;
    const pre = target.closest('pre');
    if (!pre) return;
    lastCheckedPre = pre;
    if (pre.dataset.vexelSaveBound === '1') return;
    const container = pre.closest<HTMLElement>('[data-hveid]') || pre.parentElement;
    if (!container || container.hasAttribute('data-vexel-save')) {
      pre.dataset.vexelSaveBound = '1';
      return;
    }
    window.requestAnimationFrame(() => {
      mountSaveButton(container);
      if (container.hasAttribute('data-vexel-save')) {
        pre.dataset.vexelSaveBound = '1';
      }
    });
  };

  document.addEventListener('pointerover', handleCodeHoverOrFocus, { capture: true, passive: true });
  document.addEventListener('focusin', handleCodeHoverOrFocus, { capture: true, passive: true });
}
