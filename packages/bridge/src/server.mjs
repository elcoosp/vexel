import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const PORT = 49152
const HOME_DIR = os.homedir()
const ROOT_DIR = process.env.VEXEL_ROOT_DIR ? path.resolve(process.env.VEXEL_ROOT_DIR) : HOME_DIR
const SKILLS_DIR = path.join(HOME_DIR, '.agents', 'skills')

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'tests',
  'evals',
  '__pycache__',
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

function parseSkillMarkdown(raw, fallbackName) {
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

async function collectReferenceFiles(dirPath, baseSkillDir) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results = []

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

function resolveSafePath(relDir = '') {
  const cleaned = String(relDir || '').replace(/^\/+/, '')
  const resolved = path.resolve(ROOT_DIR, cleaned)
  if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) {
    return null
  }
  return resolved
}

async function listDirectoryEntries(absDir) {
  const entries = await fs.readdir(absDir, { withFileTypes: true })
  const folders = []
  const files = []

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
  return [...folders, ...files].slice(0, 120)
}

async function searchEntries(absDir, query, depth = 0, out = []) {
  if (depth > 5 || out.length >= 40) return out
  let entries
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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
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

      const skills = []
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

      skills.sort((a, b) => a.name.localeCompare(b.name))
      res.writeHead(200)
      res.end(JSON.stringify({ skillsDir: SKILLS_DIR, count: skills.length, skills }))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(err), skillsDir: SKILLS_DIR }))
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
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(err) }))
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
    } catch (err) {
      res.writeHead(404)
      res.end(JSON.stringify({ error: String(err) }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('[Vexel Bridge] Pret sur http://127.0.0.1:' + PORT + ' (Racine: ' + ROOT_DIR + ')')
})
