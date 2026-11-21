import type { BrowseEntry } from './palette-ui'

const DB_NAME = 'vexel-fs-db'
const STORE_NAME = 'handles'
const ROOT_KEY = 'project-root'
const SNAPSHOT_KEY = 'project-snapshot'

export interface StoredFileSnapshot {
  rootName: string
  files: Array<{ relPath: string; name: string; content: string; size: number }>
}

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
])

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.mov',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
])

function openFsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, val: unknown): Promise<void> {
  const db = await openFsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(val, key)
    tx.oncomplete = () => {
      try {
        db.close()
      } catch {}
      resolve()
    }
    tx.onerror = () => {
      try {
        db.close()
      } catch {}
      reject(tx.error)
    }
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openFsDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        try {
          db.close()
        } catch {}
        resolve((req.result as T) || null)
      }
      req.onerror = () => {
        try {
          db.close()
        } catch {}
        reject(req.error)
      }
    })
  } catch {
    return null
  }
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(ROOT_KEY)
}

export async function loadConnectedFolderName(): Promise<string | null> {
  const h = await loadDirectoryHandle()
  if (h) return h.name
  const snap = await idbGet<StoredFileSnapshot>(SNAPSHOT_KEY)
  return snap ? snap.rootName : null
}

function pickViaWebkitDirectory(): Promise<{ name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.multiple = true
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.opacity = '0'

    let settled = false
    const finish = (res: { name: string } | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(res)
    }

    input.addEventListener('change', async () => {
      const fileList = Array.from(input.files || [])
      if (fileList.length === 0) {
        finish(null)
        return
      }

      const firstRel =
        (fileList.find(() => true) as File & { webkitRelativePath?: string })?.webkitRelativePath ||
        ''
      const rootName =
        firstRel
          .split('/')
          .filter(Boolean)
          .find(() => true) || 'Project'
      const stored: StoredFileSnapshot['files'] = []

      for (const f of fileList) {
        if (stored.length >= 250) break
        const rawRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        const segments = rawRel.split('/').filter(Boolean)
        // Strip top root folder prefix
        const relSegments = segments.length > 1 ? segments.slice(1) : segments
        if (relSegments.some((seg) => seg.startsWith('.') || IGNORED_DIRS.has(seg))) continue

        const dotIdx = f.name.lastIndexOf('.')
        const ext = dotIdx !== -1 ? f.name.slice(dotIdx).toLowerCase() : ''
        if (BINARY_EXT.has(ext) || f.size > 120 * 1024) continue

        try {
          const text = await f.text()
          if (text.includes('\u0000')) continue
          stored.push({
            relPath: relSegments.join('/'),
            name: f.name,
            content: text,
            size: f.size,
          })
        } catch {}
      }

      await idbPut(SNAPSHOT_KEY, { rootName, files: stored } satisfies StoredFileSnapshot)
      finish({ name: rootName })
    })

    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}

export async function pickLocalFolder(): Promise<{ name: string } | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: {
        mode?: 'read' | 'readwrite'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker

  if (picker) {
    try {
      const handle = await picker({ mode: 'readwrite' })
      await idbPut(ROOT_KEY, handle)
      return { name: handle.name }
    } catch (err) {
      // If user explicitly cancelled the dialog, abort
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null
      }
      // Otherwise (SecurityError in content script), fall through to webkitdirectory picker
    }
  }

  return pickViaWebkitDirectory()
}

export async function ensureFolderPermission(
  handle: FileSystemDirectoryHandle,
  interactive = false
): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  const state = await h.queryPermission({ mode: 'readwrite' })
  if (state === 'granted') return true
  if (interactive && h.requestPermission) {
    const req = await h.requestPermission({ mode: 'readwrite' })
    return req === 'granted'
  }
  return false
}

async function resolveSubdir(
  root: FileSystemDirectoryHandle,
  relDir: string
): Promise<FileSystemDirectoryHandle> {
  let curr = root
  const parts = relDir.split('/').filter(Boolean)
  for (const part of parts) {
    curr = await curr.getDirectoryHandle(part)
  }
  return curr
}

function browseSnapshot(
  snap: StoredFileSnapshot,
  cleanDir: string,
  q: string
): { ok: boolean; rootLabel: string; dir: string; entries: BrowseEntry[] } {
  if (q) {
    const matches: BrowseEntry[] = snap.files
      .filter(
        (f) =>
          (!cleanDir || f.relPath.startsWith(cleanDir + '/')) && f.relPath.toLowerCase().includes(q)
      )
      .slice(0, 100)
      .map((f) => ({ name: f.name, relPath: f.relPath, isDir: false }))
    return { ok: true, rootLabel: snap.rootName, dir: cleanDir, entries: matches }
  }

  const folderSet = new Set<string>()
  const files: BrowseEntry[] = []
  const prefix = cleanDir ? cleanDir + '/' : ''

  for (const f of snap.files) {
    if (prefix && !f.relPath.startsWith(prefix)) continue
    const rest = f.relPath.slice(prefix.length)
    const slashIdx = rest.indexOf('/')
    if (slashIdx !== -1) {
      folderSet.add(rest.slice(0, slashIdx))
    } else if (rest) {
      files.push({ name: rest, relPath: f.relPath, isDir: false })
    }
  }

  const folders: BrowseEntry[] = Array.from(folderSet)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, relPath: prefix + name, isDir: true }))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return { ok: true, rootLabel: snap.rootName, dir: cleanDir, entries: [...folders, ...files] }
}

export async function browseLocalFs(
  relDir: string,
  query: string,
  interactive = false
): Promise<{
  ok: boolean
  needsPicker?: boolean
  rootLabel?: string
  dir?: string
  entries?: BrowseEntry[]
}> {
  const cleanDir = relDir.split('/').filter(Boolean).join('/')
  const q = query.trim().toLowerCase()

  const root = await loadDirectoryHandle()
  if (root) {
    const permitted = await ensureFolderPermission(root, interactive)
    if (permitted) {
      if (!q) {
        const target = await resolveSubdir(root, cleanDir)
        const folders: BrowseEntry[] = []
        const files: BrowseEntry[] = []
        const iter = (
          target as unknown as {
            values: () => AsyncIterable<FileSystemHandle>
          }
        ).values()

        for await (const entry of iter) {
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
          const entryRel = cleanDir ? cleanDir + '/' + entry.name : entry.name
          if (entry.kind === 'directory') {
            folders.push({ name: entry.name, relPath: entryRel, isDir: true })
          } else {
            files.push({ name: entry.name, relPath: entryRel, isDir: false })
          }
        }
        folders.sort((a, b) => a.name.localeCompare(b.name))
        files.sort((a, b) => a.name.localeCompare(b.name))
        return {
          ok: true,
          rootLabel: root.name,
          dir: cleanDir,
          entries: [...folders, ...files].slice(0, 500),
        }
      }

      const matches: BrowseEntry[] = []
      const startDir = await resolveSubdir(root, cleanDir)
      const walk = async (dirHandle: FileSystemDirectoryHandle, prefix: string, depth: number) => {
        if (depth > 5 || matches.length >= 120) return
        const iter = (
          dirHandle as unknown as {
            values: () => AsyncIterable<FileSystemHandle>
          }
        ).values()
        for await (const entry of iter) {
          if (matches.length >= 120) break
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
          const entryRel = prefix ? prefix + '/' + entry.name : entry.name
          if (entryRel.toLowerCase().includes(q)) {
            matches.push({
              name: entry.name,
              relPath: entryRel,
              isDir: entry.kind === 'directory',
            })
          }
          if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle, entryRel, depth + 1)
          }
        }
      }
      await walk(startDir, cleanDir, 0)
      return { ok: true, rootLabel: root.name, dir: cleanDir, entries: matches }
    }
  }
  const snap = await idbGet<StoredFileSnapshot>(SNAPSHOT_KEY)
  if (snap) {
    return browseSnapshot(snap, cleanDir, q)
  }
  return { ok: false, needsPicker: true }
}
export async function readLocalFsFile(relPath: string): Promise<{ ok: boolean; content?: string }> {
  const root = await loadDirectoryHandle()
  if (root) {
    const permitted = await ensureFolderPermission(root, true)
    if (permitted) {
      const parts = relPath.split('/').filter(Boolean)
      const fileName = parts.pop()
      if (!fileName) return { ok: false }
      const dirHandle = await resolveSubdir(root, parts.join('/'))
      const fileHandle = await dirHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      if (file.size > 512 * 1024) return { ok: false }
      const content = await file.text()
      return { ok: true, content }
    }
  }
  const snap = await idbGet<StoredFileSnapshot>(SNAPSHOT_KEY)
  const found = snap?.files.find((f) => f.relPath === relPath)
  if (found) return { ok: true, content: found.content }
  return { ok: false }
}
export async function packLocalFsFolder(relDir: string): Promise<{
  ok: boolean
  folderName?: string
  fileCount?: number
  tokensEst?: number
  content?: string
  error?: string
}> {
  const cleanDir = relDir.split('/').filter(Boolean).join('/')
  const BT4 = String.fromCharCode(96, 96, 96, 96)
  const BT3 = String.fromCharCode(96, 96, 96)
  const buildPackOutput = (
    folderName: string,
    treeLines: string[],
    files: Array<{ rel: string; ext: string; content: string }>
  ) => {
    const sections = [
      '#### Included Files (' + treeLines.length + ' total, ' + files.length + ' inlined)',
      BT3 + 'text',
      treeLines.join('\n') || '(empty)',
      BT3,
      '',
    ]
    for (const f of files) {
      sections.push('#### File: ' + f.rel + '', BT4 + f.ext, f.content.trim(), BT4, '')
    }
    const body = sections.join('\n')
    const tokensEst = Math.max(1, Math.round(body.length / 4))
    const packed = [
      '### Folder Context Pack: ' + (cleanDir || folderName),
      '',
      '> ' + files.length + ' file(s) packed locally (~' + tokensEst + ' tokens)',
      '',
      body,
    ].join('\n')
    return { ok: true, folderName, fileCount: files.length, tokensEst, content: packed }
  }
  const root = await loadDirectoryHandle()
  if (root) {
    const permitted = await ensureFolderPermission(root, true)
    if (permitted) {
      const target = await resolveSubdir(root, cleanDir)
      const folderName = cleanDir ? cleanDir.split('/').pop() || root.name : root.name
      const treeLines: string[] = []
      const files: Array<{ rel: string; ext: string; content: string }> = []
      let totalBytes = 0
      const walk = async (dirHandle: FileSystemDirectoryHandle, prefix: string, depth: number) => {
        if (depth > 8 || treeLines.length >= 400) return
        const iter = (
          dirHandle as unknown as {
            values: () => AsyncIterable<FileSystemHandle>
          }
        ).values()
        for await (const entry of iter) {
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
          const rel = prefix ? prefix + '/' + entry.name : entry.name
          if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle, rel, depth + 1)
          } else {
            const dotIdx = entry.name.lastIndexOf('.')
            const ext = dotIdx !== -1 ? entry.name.slice(dotIdx).toLowerCase() : ''
            if (
              BINARY_EXT.has(ext) ||
              entry.name.endsWith('-lock.yaml') ||
              entry.name === 'package-lock.json'
            )
              continue
            treeLines.push(rel)
            if (files.length >= 60 || totalBytes >= 180 * 1024) continue
            try {
              const f = await (entry as FileSystemFileHandle).getFile()
              const raw = await f.text()
              if (raw.includes('\u0000')) continue
              const clipped =
                raw.length > 96 * 1024
                  ? raw.slice(0, 96 * 1024) + '\n\n[... truncated at 96 KB ...]'
                  : raw
              totalBytes += clipped.length
              files.push({ rel, ext: ext.replace(/^./, '') || 'txt', content: clipped })
            } catch {}
          }
        }
      }
      await walk(target, '', 0)
      return buildPackOutput(folderName, treeLines, files)
    }
  }
  const snap = await idbGet<StoredFileSnapshot>(SNAPSHOT_KEY)
  if (snap) {
    const prefix = cleanDir ? cleanDir + '/' : ''
    const matching = snap.files.filter((f) => !prefix || f.relPath.startsWith(prefix))
    const folderName = cleanDir ? cleanDir.split('/').pop() || snap.rootName : snap.rootName
    const treeLines = matching.map((f) => (prefix ? f.relPath.slice(prefix.length) : f.relPath))
    const inlined = matching.slice(0, 60).map((f) => {
      const rel = prefix ? f.relPath.slice(prefix.length) : f.relPath
      const dotIdx = f.name.lastIndexOf('.')
      const ext = dotIdx !== -1 ? f.name.slice(dotIdx + 1).toLowerCase() : 'txt'
      return { rel, ext, content: f.content }
    })
    return buildPackOutput(folderName, treeLines, inlined)
  }
  return { ok: false, error: 'No local folder connected' }
}
export async function writeLocalFsFile(
  relPath: string,
  content: string
): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  const parts = relPath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return { ok: false, error: 'Invalid file name' }
  const root = await loadDirectoryHandle()
  if (root) {
    const permitted = await ensureFolderPermission(root, true)
    if (permitted) {
      let curr = root
      for (const seg of parts) {
        curr = await curr.getDirectoryHandle(seg, { create: true })
      }
      const fileHandle = await curr.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
      return { ok: true, bytes: new TextEncoder().encode(content).length }
    }
  }
  // Fallback: trigger clean browser file download when direct FS write isn't available
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { ok: true, bytes: new TextEncoder().encode(content).length }
}
