import { formatCodeWithNativeTool } from './formatter.ts'
import { execFile } from 'node:child_process'
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  enrichLocalSkill,
  installRemoteSkill,
  removeLocalSkill,
  searchRemoteSkills,
} from './skills-registry.ts'
const execFileAsync = promisify(execFile)
const PORT = Number(process.env.VEXEL_PORT) || 49152
const HOME_DIR = os.homedir()
const ROOT_DIR = process.env.VEXEL_ROOT_DIR ? path.resolve(process.env.VEXEL_ROOT_DIR) : HOME_DIR
const SKILLS_DIR = path.join(HOME_DIR, '.agents', 'skills')
interface ParsedSkillMarkdown {
  name: string
  description: string
  body: string
}
interface SkillReferenceFile {
  relPath: string
  content: string
  length: number
}
interface LocalSkillRecord {
  id: string
  name: string
  description: string
  smartContent: string
  smartLength: number
  fullContent: string
  fullLength: number
  refCount: number
  refs: SkillReferenceFile[]
  sourceRepo?: string
  installs?: string
}
interface BrowseEntry {
  name: string
  relPath: string
  isDir: boolean
}
interface PackedFileItem {
  rel: string
  ext: string
  content: string
}
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'tests',
  'evals',
  'pycache',
  'target',
  'dist',
  'build',
  '.next',
  '.astro',
  '.svelte-kit',
  'coverage',
  'Library',
  'Applications',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  '.Trash',
])
const IGNORED_SKILL_FILES = new Set([
  '.DS_Store',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'README.md',
  'CLAUDE.md',
])
const ALLOWED_SKILL_EXT = new Set(['.md', '.txt', '.yaml', '.yml', '.toml', '.json'])
const ALLOWED_CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.rs',
  '.go',
  '.py',
  '.zig',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.md',
  '.mdx',
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.html',
  '.css',
  '.scss',
  '.sql',
  '.sh',
  '.astro',
  '.svelte',
  '.vue',
  '.txt',
])
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
function getErrnoCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code
  }
  return undefined
}
function parseSkillMarkdown(raw: string, fallbackName: string): ParsedSkillMarkdown {
  const lines = raw.split(/\r?\n/)
  if (lines.at(0) !== '---') {
    return { name: fallbackName, description: '', body: raw.trim() }
  }
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines.at(i) === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) {
    return { name: fallbackName, description: '', body: raw.trim() }
  }
  const yamlLines = lines.slice(1, endIdx)
  const body = lines
    .slice(endIdx + 1)
    .join('\n')
    .trim()
  let name = fallbackName
  let description = ''
  for (const line of yamlLines) {
    if (line.startsWith('name:')) {
      name = line
        .slice(5)
        .trim()
        .replace(/^["']|["']$/g, '')
    } else if (line.startsWith('description:')) {
      description = line
        .slice(12)
        .trim()
        .replace(/^["']|["']$/g, '')
    }
  }
  return { name, description, body }
}
async function collectReferenceFiles(
  dirPath: string,
  baseSkillDir: string
): Promise<SkillReferenceFile[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results: SkillReferenceFile[] = []
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectReferenceFiles(fullPath, baseSkillDir)
      results.push(...nested)
    } else if (entry.isFile()) {
      if (entry.name === 'SKILL.md' || IGNORED_SKILL_FILES.has(entry.name)) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!ALLOWED_SKILL_EXT.has(ext)) continue
      const relPath = path.relative(baseSkillDir, fullPath)
      const content = (await fs.readFile(fullPath, 'utf8')).trim()
      results.push({ relPath, content, length: content.length })
    }
  }
  return results
}
function resolveSafePath(relDir = ''): string | null {
  const cleaned = String(relDir || '').replace(/^\/+/, '')
  const segments = cleaned.split(/[/\\]+/).filter(Boolean)
  if (segments.some((seg) => seg.startsWith('.'))) {
    return null
  }
  const resolved = path.resolve(ROOT_DIR, cleaned)
  if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) {
    return null
  }
  return resolved
}
async function listDirectoryEntries(absDir: string): Promise<BrowseEntry[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true })
  const folders: BrowseEntry[] = []
  const files: BrowseEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
    const fullPath = path.join(absDir, entry.name)
    const relPath = path.relative(ROOT_DIR, fullPath)
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, relPath, isDir: true })
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!ALLOWED_CODE_EXT.has(ext)) continue
      files.push({ name: entry.name, relPath, isDir: false })
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...folders, ...files].slice(0, 1000)
}
async function searchEntries(
  absDir: string,
  query: string,
  depth = 0,
  out: BrowseEntry[] = []
): Promise<BrowseEntry[]> {
  if (depth > 5 || out.length >= 40) return out
  let entries: Dirent[]
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (out.length >= 40) break
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
    const fullPath = path.join(absDir, entry.name)
    const relPath = path.relative(ROOT_DIR, fullPath)
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase().includes(query)) {
        out.push({ name: entry.name, relPath, isDir: true })
      }
      await searchEntries(fullPath, query, depth + 1, out)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!ALLOWED_CODE_EXT.has(ext)) continue
      if (relPath.toLowerCase().includes(query)) {
        out.push({ name: entry.name, relPath, isDir: false })
      }
    }
  }
  return out
}
async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes = 600 * 1024
): Promise<Record<string, unknown>> {
  let total = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) throw new Error('Payload too large')
    chunks.push(buf)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Vary', 'Origin')
  const reqOrigin = req.headers.origin || ''
  const bridgeToken = process.env.VEXEL_BRIDGE_TOKEN || ''
  const reqToken = req.headers['x-vexel-token'] || ''
  const allowedPrefix = process.env.VEXEL_EXT_ORIGIN || 'chrome-extension://'
  const isAllowedOrigin = !reqOrigin || reqOrigin.startsWith(allowedPrefix)
  const isTokenValid = Boolean(bridgeToken && reqToken === bridgeToken)
  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin)
  }
  if (req.method !== 'OPTIONS' && !isAllowedOrigin && !isTokenValid) {
    res.writeHead(403)
    res.end(JSON.stringify({ error: 'Forbidden origin' }))
    return
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vexel-Token')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1')
  if (parsedUrl.pathname === '/skills') {
    try {
      const topEntries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
      const skillFolders = topEntries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      const skills: LocalSkillRecord[] = []
      for (const folder of skillFolders) {
        const skillDir = path.join(SKILLS_DIR, folder.name)
        const mainFile = path.join(skillDir, 'SKILL.md')
        let rawMain = ''
        try {
          rawMain = await fs.readFile(mainFile, 'utf8')
        } catch {
          continue
        }
        const parsed = parseSkillMarkdown(rawMain, folder.name)
        const refs = await collectReferenceFiles(skillDir, skillDir)
        refs.sort((a, b) => a.relPath.localeCompare(b.relPath))
        let smartContent = parsed.body
        let fullContent = parsed.body
        if (refs.length > 0) {
          const indexLines = refs.map(
            (r) => '- ' + r.relPath + ' (' + Math.ceil(r.length / 1000) + 'k car.)'
          )
          smartContent =
            parsed.body +
            '\n\n---\n## References disponibles pour ce skill (' +
            parsed.name +
            ')\nLes fichiers de reference suivants existent localement mais ne sont pas encore charges pour economiser le contexte :\n' +
            indexLines.join('\n') +
            '\n\nInstruction : Si tu as besoin du contenu detaille de un ou plusieurs de ces fichiers pour repondre avec precision, demande-moi explicitement de te fournir le fichier exact avant de poursuivre.'
          const refBlocks = refs.map(
            (r) => '\n\n---\n## Reference: ' + r.relPath + '\n\n' + r.content
          )
          fullContent = parsed.body + refBlocks.join('')
        }
        skills.push({
          id: folder.name,
          name: parsed.name,
          description: parsed.description,
          smartContent,
          smartLength: smartContent.length,
          fullContent,
          fullLength: fullContent.length,
          refCount: refs.length,
          refs,
        })
      }
      const enriched = await Promise.all(skills.map(enrichLocalSkill))
      enriched.sort((a, b) => a.name.localeCompare(b.name))
      skills.splice(0, skills.length, ...enriched)
      res.writeHead(200)
      res.end(JSON.stringify({ skillsDir: SKILLS_DIR, count: skills.length, skills }))
    } catch (err: unknown) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(err), skillsDir: SKILLS_DIR }))
    }
    return
  }
  if (parsedUrl.pathname === '/skills/search') {
    const q = parsedUrl.searchParams.get('q') || ''
    const remote = await searchRemoteSkills(q).catch((e: unknown) => {
      console.error('[Vexel Bridge] searchRemoteSkills ERR:', e)
      return []
    })
    res.writeHead(200)
    res.end(JSON.stringify({ skills: remote }))
    return
  }
  if (parsedUrl.pathname === '/skills/install' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 64 * 1024)
      const repo = typeof body.repo === 'string' ? body.repo : ''
      const name = typeof body.name === 'string' ? body.name : undefined
      const result = await installRemoteSkill(repo, name)
      res.writeHead(200)
      res.end(JSON.stringify(result))
    } catch (err: unknown) {
      res.writeHead(200)
      res.end(JSON.stringify({ ok: false, error: getErrorMessage(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/skills/remove' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 64 * 1024)
      const id = typeof body.id === 'string' ? body.id : ''
      const dir = typeof body.dir === 'string' ? body.dir : undefined
      const result = await removeLocalSkill(id, dir)
      res.writeHead(200)
      res.end(JSON.stringify(result))
    } catch (err: unknown) {
      res.writeHead(200)
      res.end(JSON.stringify({ ok: false, error: getErrorMessage(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/browse') {
    try {
      const dirParam = parsedUrl.searchParams.get('dir') || ''
      const q = (parsedUrl.searchParams.get('q') || '').toLowerCase().trim()
      const targetDir = resolveSafePath(dirParam)
      if (!targetDir) {
        res.writeHead(403)
        res.end(JSON.stringify({ error: 'Acces refuse hors de la racine' }))
        return
      }
      const relDir = path.relative(ROOT_DIR, targetDir)
      const entries = q ? await searchEntries(targetDir, q) : await listDirectoryEntries(targetDir)
      res.writeHead(200)
      res.end(
        JSON.stringify({
          rootLabel: path.basename(ROOT_DIR),
          dir: relDir,
          entries,
        })
      )
    } catch (err: unknown) {
      const code = getErrnoCode(err)
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        res.writeHead(200)
        res.end(
          JSON.stringify({
            rootLabel: path.basename(ROOT_DIR),
            dir: '',
            entries: [],
            missingDir: true,
          })
        )
        return
      }
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/git-diff') {
    try {
      const relDir = parsedUrl.searchParams.get('dir') || ''
      const targetDir = resolveSafePath(relDir) || ROOT_DIR
      const { stdout: statusOut } = await execFileAsync('git', ['status', '-s'], {
        cwd: targetDir,
        timeout: 5000,
      })
      let diffOut = ''
      try {
        const resHead = await execFileAsync('git', ['diff', 'HEAD'], {
          cwd: targetDir,
          timeout: 8000,
          maxBuffer: 2 * 1024 * 1024,
        })
        diffOut = resHead.stdout || ''
      } catch {
        const resPlain = await execFileAsync('git', ['diff'], {
          cwd: targetDir,
          timeout: 8000,
          maxBuffer: 2 * 1024 * 1024,
        })
        diffOut = resPlain.stdout || ''
      }
      const trimmedDiff = diffOut.slice(0, 120000)
      const changedFiles = statusOut
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean).length
      const content = [
        '### Git Working Tree Diff' + (relDir ? ' (' + relDir + ')' : ''),
        '',
        '#### Status (' + changedFiles + ' changed file(s))',
        '',
        statusOut.trim() || '(clean)',
        '',
        '',
        '#### Diff',
        'diff',
        trimmedDiff.trim() || '(no unstaged/staged diff)',
        '',
      ].join('\n')
      res.writeHead(200)
      res.end(
        JSON.stringify({
          ok: true,
          changedFiles,
          tokensEst: Math.max(1, Math.round(content.length / 4)),
          content,
        })
      )
    } catch {
      res.writeHead(200)
      res.end(JSON.stringify({ ok: false, error: 'Not a git repository or git unavailable' }))
    }
    return
  }
  if (parsedUrl.pathname === '/pack-folder') {
    try {
      const relDir = parsedUrl.searchParams.get('path') || ''
      const resolved = resolveSafePath(relDir)
      if (!resolved || resolved === ROOT_DIR) {
        res.writeHead(403)
        res.end(JSON.stringify({ error: 'Cannot pack root directory directly' }))
        return
      }
      const IGNORED = new Set([
        'node_modules',
        '.git',
        '.next',
        'dist',
        'build',
        '.turbo',
        '.cache',
        'coverage',
        'pycache',
        '.venv',
        'vendor',
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
        '.lock',
      ])
      const LOCKFILES = new Set([
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'bun.lockb',
        'Cargo.lock',
      ])
      const candidateRelPaths: string[] = []
      let usedGit = false
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['ls-files', '--cached', '--others', '--exclude-standard'],
          { cwd: resolved, timeout: 6000, maxBuffer: 4 * 1024 * 1024 }
        )
        const gitFiles = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        if (gitFiles.length > 0) {
          usedGit = true
          gitFiles.sort((a, b) => a.localeCompare(b))
          for (const rel of gitFiles) candidateRelPaths.push(rel)
        }
      } catch {}
      if (!usedGit) {
        const walkFallback = async (dir: string, depth: number): Promise<void> => {
          if (depth > 10 || candidateRelPaths.length >= 400) return
          const entries = await fs.readdir(dir, { withFileTypes: true })
          entries.sort(
            (a, b) =>
              Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)
          )
          for (const ent of entries) {
            if (ent.name.startsWith('.') && ent.name !== '.env.example') continue
            if (IGNORED.has(ent.name)) continue
            const full = path.join(dir, ent.name)
            if (ent.isDirectory()) await walkFallback(full, depth + 1)
            else if (ent.isFile()) candidateRelPaths.push(path.relative(resolved, full))
          }
        }
        await walkFallback(resolved, 0)
      }
      const files: PackedFileItem[] = []
      const treeLines: string[] = []
      let totalBytes = 0
      const MAX_BYTES = 180 * 1024
      const MAX_FILES = 60
      for (const rel of candidateRelPaths) {
        const parts = rel.split('/')
        if (parts.some((seg) => seg.startsWith('.') && seg !== '.env.example')) continue
        if (parts.some((seg) => IGNORED.has(seg))) continue
        const base = path.basename(rel)
        const ext = path.extname(base).toLowerCase()
        if (BINARY_EXT.has(ext) || LOCKFILES.has(base)) continue
        treeLines.push(rel)
        if (files.length >= MAX_FILES || totalBytes >= MAX_BYTES) continue
        try {
          const full = path.join(resolved, rel)
          const st = await fs.stat(full)
          if (!st.isFile()) continue
          const rawFull = await fs.readFile(full, 'utf8')
          if (rawFull.includes('\u0000')) continue
          const MAX_FILE_CHARS = 96 * 1024
          const raw =
            rawFull.length > MAX_FILE_CHARS
              ? rawFull.slice(0, MAX_FILE_CHARS) + '\n\n[... truncated at 96 KB ...]'
              : rawFull
          totalBytes += Buffer.byteLength(raw, 'utf8')
          files.push({ rel, ext: ext.replace(/^./, '') || 'txt', content: raw })
        } catch {}
      }
      const folderName = path.basename(resolved)
      const bodySections = [
        '#### Included Files (' + treeLines.length + ' total, ' + files.length + ' inlined)',
        'text',
        treeLines.join('\n') || '(empty)',
        '',
        '',
      ]
      for (const f of files) {
        const BT4 = String.fromCodePoint(96, 96, 96, 96)
        bodySections.push('#### File: ' + f.rel, BT4 + f.ext, f.content.trim(), BT4, '')
      }
      const bodyText = bodySections.join('\n')
      const tokensEst = Math.max(1, Math.round(bodyText.length / 4))
      const packed = [
        '### Folder Context Pack: ' + (relDir || folderName),
        '',
        '> ' +
          files.length +
          ' file(s) packed (~' +
          tokensEst +
          ' tokens' +
          (usedGit ? ', .gitignore respected' : '') +
          ')',
        '',
        bodyText,
      ].join('\n')
      res.writeHead(200)
      res.end(
        JSON.stringify({
          ok: true,
          folderName,
          fileCount: files.length,
          tokensEst,
          content: packed,
        })
      )
    } catch (err: unknown) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/format' && req.method === 'POST') {
    try {
      const t0 = Date.now()
      const body = await readJsonBody(req, 512 * 1024)
      const code = typeof body.code === 'string' ? body.code : ''
      const lang = typeof body.lang === 'string' ? body.lang.trim() : 'txt'
      const filename = typeof body.filename === 'string' ? body.filename.trim() : undefined
      if (!code.trim()) {
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true, formatted: code, engine: 'empty' }))
        return
      }
      const result = await formatCodeWithNativeTool(code, lang, filename)
      console.log(
        `[Vexel Bridge] POST /format lang=${lang} -> engine=${result.engine} (${Date.now() - t0}ms, len=${result.formatted.length})`
      )
      res.writeHead(200)
      res.end(JSON.stringify(result))
    } catch (err: unknown) {
      console.error('[Vexel Bridge] POST /format error:', err)
      res.writeHead(200)
      res.end(JSON.stringify({ ok: false, error: getErrorMessage(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/write-file' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 600 * 1024)
      const relPath = typeof body.relPath === 'string' ? body.relPath.trim() : ''
      const content = typeof body.content === 'string' ? body.content : ''
      if (!relPath || relPath.endsWith('/') || !path.extname(path.basename(relPath))) {
        res.writeHead(400)
        res.end(
          JSON.stringify({
            ok: false,
            error: 'File path must include a file extension (e.g. .ts, .py)',
          })
        )
        return
      }
      if (Buffer.byteLength(content, 'utf8') > 512 * 1024) {
        res.writeHead(413)
        res.end(JSON.stringify({ ok: false, error: 'Content exceeds 512 KB limit' }))
        return
      }
      const resolved = resolveSafePath(relPath)
      if (!resolved || resolved === ROOT_DIR) {
        res.writeHead(403)
        res.end(JSON.stringify({ ok: false, error: 'Forbidden or hidden path' }))
        return
      }
      await fs.mkdir(path.dirname(resolved), { recursive: true })
      await fs.writeFile(resolved, content, 'utf8')
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, relPath, bytes: Buffer.byteLength(content, 'utf8') }))
    } catch (err: unknown) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
    return
  }
  if (parsedUrl.pathname === '/file') {
    try {
      const relPath = parsedUrl.searchParams.get('path') || ''
      const resolved = resolveSafePath(relPath)
      if (!resolved || resolved === ROOT_DIR) {
        res.writeHead(403)
        res.end(JSON.stringify({ error: 'Path traversal forbidden' }))
        return
      }
      const stat = await fs.stat(resolved)
      if (stat.size > 512 * 1024) {
        res.writeHead(413)
        res.end(JSON.stringify({ error: 'Fichier trop volumineux (> 512 Ko)' }))
        return
      }
      const content = await fs.readFile(resolved, 'utf8')
      res.writeHead(200)
      res.end(
        JSON.stringify({ relPath, name: path.basename(resolved), content, length: content.length })
      )
    } catch (err: unknown) {
      res.writeHead(404)
      res.end(JSON.stringify({ error: String(err) }))
    }
    return
  }
  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})
server.listen(PORT, '127.0.0.1', () => {
  console.log('[Vexel Bridge] Pret sur http://127.0.0.1:' + PORT + ' (Racine: ' + ROOT_DIR + ')')
})
