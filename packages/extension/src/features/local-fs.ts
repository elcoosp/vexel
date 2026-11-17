import type { BrowseEntry } from './palette-ui';

const DB_NAME = 'vexel-fs-db';
const STORE_NAME = 'handles';
const ROOT_KEY = 'project-root';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.astro',
  '.svelte-kit',
  '__pycache__',
  'target',
  'coverage',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.mov', '.exe', '.dll', '.so', '.dylib',
]);

function openFsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openFsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, ROOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openFsDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(ROOT_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ mode: 'readwrite' });
    await saveDirectoryHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function ensureFolderPermission(
  handle: FileSystemDirectoryHandle,
  interactive = false
): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!h.queryPermission) return true;
  const state = await h.queryPermission({ mode: 'readwrite' });
  if (state === 'granted') return true;
  if (interactive && h.requestPermission) {
    const req = await h.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  }
  return false;
}

async function resolveSubdir(
  root: FileSystemDirectoryHandle,
  relDir: string
): Promise<FileSystemDirectoryHandle> {
  let curr = root;
  const parts = relDir.split('/').filter(Boolean);
  for (const part of parts) {
    curr = await curr.getDirectoryHandle(part);
  }
  return curr;
}

export async function browseLocalFs(
  relDir: string,
  query: string,
  interactive = false
): Promise<{ ok: boolean; needsPicker?: boolean; rootLabel?: string; dir?: string; entries?: BrowseEntry[] }> {
  const root = await loadDirectoryHandle();
  if (!root) return { ok: false, needsPicker: true };
  const permitted = await ensureFolderPermission(root, interactive);
  if (!permitted) return { ok: false, needsPicker: true };

  const cleanDir = relDir.replace(/^\/+|\/+$/g, '');
  const q = query.trim().toLowerCase();

  if (!q) {
    const target = await resolveSubdir(root, cleanDir);
    const folders: BrowseEntry[] = [];
    const files: BrowseEntry[] = [];
    const iter = (target as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }).values();

    for await (const entry of iter) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const entryRel = cleanDir ? cleanDir + '/' + entry.name : entry.name;
      if (entry.kind === 'directory') {
        folders.push({ name: entry.name, relPath: entryRel, isDir: true });
      } else {
        files.push({ name: entry.name, relPath: entryRel, isDir: false });
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return {
      ok: true,
      rootLabel: root.name,
      dir: cleanDir,
      entries: [...folders, ...files].slice(0, 500),
    };
  }

  // Recursive search matching query
  const matches: BrowseEntry[] = [];
  const startDir = await resolveSubdir(root, cleanDir);
  const walk = async (dirHandle: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (depth > 5 || matches.length >= 120) return;
    const iter = (dirHandle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }).values();
    for await (const entry of iter) {
      if (matches.length >= 120) break;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const entryRel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entryRel.toLowerCase().includes(q)) {
        matches.push({
          name: entry.name,
          relPath: entryRel,
          isDir: entry.kind === 'directory',
        });
      }
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, entryRel, depth + 1);
      }
    }
  };
  await walk(startDir, cleanDir, 0);
  return { ok: true, rootLabel: root.name, dir: cleanDir, entries: matches };
}

export async function readLocalFsFile(relPath: string): Promise<{ ok: boolean; content?: string }> {
  const root = await loadDirectoryHandle();
  if (!root) return { ok: false };
  const permitted = await ensureFolderPermission(root, true);
  if (!permitted) return { ok: false };

  const parts = relPath.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return { ok: false };
  const dirHandle = await resolveSubdir(root, parts.join('/'));
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  if (file.size > 512 * 1024) return { ok: false };
  const content = await file.text();
  return { ok: true, content };
}

export async function packLocalFsFolder(
  relDir: string
): Promise<{ ok: boolean; folderName?: string; fileCount?: number; tokensEst?: number; content?: string; error?: string }> {
  const root = await loadDirectoryHandle();
  if (!root) return { ok: false, error: 'No local folder connected' };
  const permitted = await ensureFolderPermission(root, true);
  if (!permitted) return { ok: false, error: 'Folder permission denied' };

  const cleanDir = relDir.replace(/^\/+|\/+$/g, '');
  const target = await resolveSubdir(root, cleanDir);
  const folderName = cleanDir ? cleanDir.split('/').pop() || root.name : root.name;

  const treeLines: string[] = [];
  const files: Array<{ rel: string; ext: string; content: string }> = [];
  let totalBytes = 0;
  const MAX_FILES = 60;
  const MAX_BYTES = 180 * 1024;
  const BT4 = String.fromCharCode(96, 96, 96, 96);
  const BT3 = String.fromCharCode(96, 96, 96);

  const walk = async (dirHandle: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (depth > 8 || treeLines.length >= 400) return;
    const iter = (dirHandle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }).values();
    for await (const entry of iter) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, rel, depth + 1);
      } else {
        const dotIdx = entry.name.lastIndexOf('.');
        const ext = dotIdx !== -1 ? entry.name.slice(dotIdx).toLowerCase() : '';
        if (BINARY_EXT.has(ext) || entry.name.endsWith('-lock.yaml') || entry.name === 'package-lock.json') continue;
        treeLines.push(rel);
        if (files.length >= MAX_FILES || totalBytes >= MAX_BYTES) continue;
        try {
          const f = await (entry as FileSystemFileHandle).getFile();
          const raw = await f.text();
          if (raw.includes('\u0000')) continue;
          const clipped = raw.length > 96 * 1024 ? raw.slice(0, 96 * 1024) + '\n\n[... truncated at 96 KB ...]' : raw;
          totalBytes += clipped.length;
          files.push({ rel, ext: ext.replace(/^\./, '') || 'txt', content: clipped });
        } catch {}
      }
    }
  };

  await walk(target, '', 0);

  const sections = [
    '#### Included Files (' + treeLines.length + ' total, ' + files.length + ' inlined)',
    BT3 + 'text',
    treeLines.join('\n') || '(empty)',
    BT3,
    '',
  ];
  for (const f of files) {
    sections.push('#### File: `' + f.rel + '`', BT4 + f.ext, f.content.trim(), BT4, '');
  }
  const body = sections.join('\n');
  const tokensEst = Math.max(1, Math.round(body.length / 4));
  const packed = [
    '### Folder Context Pack: ' + (cleanDir || folderName),
    '',
    '> ' + files.length + ' file(s) packed locally (~' + tokensEst + ' tokens)',
    '',
    body,
  ].join('\n');

  return { ok: true, folderName, fileCount: files.length, tokensEst, content: packed };
}

export async function writeLocalFsFile(
  relPath: string,
  content: string
): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  let root = await loadDirectoryHandle();
  if (!root) {
    root = await pickLocalFolder();
    if (!root) return { ok: false, error: 'Select a local folder first' };
  }
  const permitted = await ensureFolderPermission(root, true);
  if (!permitted) return { ok: false, error: 'Folder write permission denied' };

const parts = relPath.split("/").filter(Boolean);
const fileName = parts.pop();
if (!fileName) return { ok: false, error: 'Invalid file name' };
let curr = root;
for (const seg of parts) {
curr = await curr.getDirectoryHandle(seg, { create: true });
}
const fileHandle = await curr.getFileHandle(fileName, { create: true });
const writable = await fileHandle.createWritable();
await writable.write(content);
await writable.close();
return { ok: true, bytes: new TextEncoder().encode(content).length };
}
