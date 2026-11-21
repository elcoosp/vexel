import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CACHE_DIR = path.join(os.homedir(), '.cache')
const META_CACHE_FILE = path.join(CACHE_DIR, 'vexel-skills-meta.json')
const MAX_SEARCH_CACHE = 100

export interface RemoteSkillItem {
  id: string
  name: string
  repo: string
  installs: string
  description: string
}

export interface EnrichableSkill {
  id?: string
  name?: string
  sourceRepo?: string
  installs?: string
}

interface DiskMetaEntry {
  sourceRepo?: string
  installs?: string
  description?: string
}

interface SearchCacheEntry {
  ts: number
  items: RemoteSkillItem[]
}

interface RegistryApiSkill {
  source?: unknown
  repo?: unknown
  name?: unknown
  skillId?: unknown
  installs?: unknown
}

interface RegistryApiResponse {
  skills?: unknown
}

interface ExecErrorLike {
  stdout?: unknown
  stderr?: unknown
  message?: unknown
}

const searchCache = new Map<string, SearchCacheEntry>()
const inflightSearch = new Map<string, Promise<RemoteSkillItem[]>>()
let rateLimitedUntil = 0

function loadMetaCache(): Record<string, DiskMetaEntry> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(META_CACHE_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, DiskMetaEntry>
    }
    return {}
  } catch {
    return {}
  }
}

async function saveMetaCache(cache: Record<string, DiskMetaEntry>): Promise<void> {
  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true })
    await fs.promises.writeFile(META_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
  } catch {}
}

const diskMeta: Record<string, DiskMetaEntry> = loadMetaCache()

function parseFrontmatterDescription(md: string): string {
  const match = String(md || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return ''
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/)
    if (m) {
      let val = m[1].trim()
      if (val === '>' || val === '|' || val === '>-' || val === '|-') {
        const folded: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s+\S/.test(lines[j])) folded.push(lines[j].trim())
          else if (lines[j].trim() === '') continue
          else break
        }
        val = folded.join(' ')
      }
      return val.replace(/^["']|["']$/g, '').trim()
    }
  }
  return ''
}

async function fetchRemoteSkillDescription(
  repo: string,
  skillName: string,
  skillId: string
): Promise<string> {
  const key = (repo + '/' + (skillId || skillName)).toLowerCase()
  const existing = diskMeta[key]
  if (existing && existing.description !== undefined) return existing.description
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return ''

  const names = Array.from(
    new Set([skillName, skillId, String(skillName || '').replace(/-v\d+$/, '')].filter(Boolean))
  )
  const rawHost = ['https://', 'raw.', 'githubusercontent', '.com'].join('')
  const paths: string[] = []
  for (const n of names) {
    paths.push('skills/' + n + '/SKILL.md')
    paths.push('.agents/skills/' + n + '/SKILL.md')
    paths.push('.claude/skills/' + n + '/SKILL.md')
  }
  paths.push('SKILL.md')

  let foundDesc = ''
  for (const branch of ['main', 'master']) {
    for (const rel of paths) {
      try {
        const res = await fetch(rawHost + '/' + repo + '/' + branch + '/' + rel, {
          signal: AbortSignal.timeout(1800),
          headers: { 'User-Agent': 'Vexel-Bridge/1.0' },
        })
        if (res.ok) {
          const text = await res.text()
          const desc = parseFrontmatterDescription(text)
          if (desc) {
            foundDesc = desc
            break
          }
        }
      } catch {}
    }
    if (foundDesc) break
  }

  diskMeta[key] = { ...diskMeta[key], description: foundDesc }
  void saveMetaCache(diskMeta)
  return foundDesc
}

function fmtInstalls(n: unknown): string {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

export async function searchRemoteSkills(query = ''): Promise<RemoteSkillItem[]> {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (q.length < 2) return []

  const cached = searchCache.get(q)
  if (cached && Date.now() - cached.ts < 600000) return cached.items

  if (Date.now() < rateLimitedUntil) return []
  const existingTask = inflightSearch.get(q)
  if (existingTask) return existingTask

  const task = (async (): Promise<RemoteSkillItem[]> => {
    try {
      const host = ['https://', 'www.', 'skills', '.sh'].join('')
      const url = host + '/api/search?q=' + encodeURIComponent(q)
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        headers: { Accept: 'application/json', 'User-Agent': 'Vexel-Bridge/1.0' },
      })
      if (res.status === 429) {
        rateLimitedUntil = Date.now() + 15000
        console.warn('[Vexel Registry] Rate limited (429), pause 15s')
        return []
      }
      if (!res.ok) return []
      const data = (await res.json()) as RegistryApiResponse
      const raw = Array.isArray(data?.skills) ? (data.skills as RegistryApiSkill[]) : []
      let dirty = false
      const items: RemoteSkillItem[] = raw.slice(0, 15).map((item) => {
        const repo = String(item.source || item.repo || '')
        const name = String(item.name || item.skillId || '')
        const id = String(item.skillId || name)
        const inst = fmtInstalls(item.installs)
        if (repo && name) {
          const label = inst ? repo + ' (' + inst + ')' : repo
          if (diskMeta[name.toLowerCase()]?.sourceRepo !== label) {
            diskMeta[name.toLowerCase()] = { sourceRepo: label, installs: inst }
            dirty = true
          }
        }
        return {
          id,
          name,
          repo,
          installs: inst,
          description: repo ? repo + (inst ? ' • ' + inst + ' installs' : '') : '',
        }
      })
      if (dirty) void saveMetaCache(diskMeta)
      await Promise.all(
        items.slice(0, 8).map(async (it) => {
          if (it.repo) {
            const desc = await fetchRemoteSkillDescription(it.repo, it.name, it.id)
            it.description = desc || ''
          }
        })
      )
      if (searchCache.size >= MAX_SEARCH_CACHE) {
        const oldest = searchCache.keys().next().value
        if (oldest !== undefined) searchCache.delete(oldest)
      }
      searchCache.set(q, { ts: Date.now(), items })
      return items
    } catch {
      return []
    } finally {
      inflightSearch.delete(q)
    }
  })()

  inflightSearch.set(q, task)
  return task
}

export async function enrichLocalSkill<T extends EnrichableSkill>(skill: T): Promise<T> {
  const hit =
    diskMeta[String(skill.name || '').toLowerCase()] ||
    diskMeta[String(skill.id || '').toLowerCase()]
  if (hit && hit.sourceRepo) {
    return { ...skill, sourceRepo: hit.sourceRepo, installs: hit.installs }
  }
  return skill
}

export async function installRemoteSkill(
  repo: string,
  skillName?: string
): Promise<{ ok: true; output: string }> {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    throw new Error('Invalid repository')
  }
  const runAdd = async (targetSkill?: string) => {
    const args = ['-y', 'skills', 'add', repo]
    if (targetSkill && /^[a-zA-Z0-9_.-]+$/.test(targetSkill)) {
      args.push('--skill', targetSkill)
    }
    args.push('-g', '-y')
    return execFileAsync('npx', args, { timeout: 60000 })
  }

  try {
    const { stdout, stderr } = await runAdd(skillName)
    return { ok: true, output: (stdout || stderr || '').trim() }
  } catch (err: unknown) {
    const execErr = (err && typeof err === 'object' ? err : {}) as ExecErrorLike
    const combined = String(execErr.stdout || '') + '\n' + String(execErr.stderr || '')
    if (combined.includes('SKILLS_NO_MATCHING_SKILLS')) {
      const availMatch = combined.match(/Available skills:\s*(?:│\s*)?-\s*([a-zA-Z0-9_.-]+)/)
      const fallbackSkill = availMatch ? availMatch[1] : ''
      const { stdout, stderr } = await runAdd(fallbackSkill || undefined)
      return { ok: true, output: (stdout || stderr || '').trim() }
    }
    const cleanMsg = combined
      .replaceAll(new RegExp(String.fromCodePoint(27) + '\\[[0-9;?]*[a-zA-Z]', 'g'), '')
      .split('\n')
      .map((l) => l.replace(/^[│◇■╰▶\s]+/, '').trim())
      .filter(Boolean)
      .slice(-2)
      .join(' — ')
    throw new Error(
      cleanMsg || (typeof execErr.message === 'string' ? execErr.message : 'npx install failed')
    )
  }
}

export async function removeLocalSkill(skillId: string, skillDir?: string): Promise<{ ok: true }> {
  const safeId = String(skillId || '').trim()
  if (!safeId || !/^[a-zA-Z0-9_.-]+$/.test(safeId)) {
    throw new Error('Invalid skill identifier')
  }
  try {
    await execFileAsync('npx', ['-y', 'skills', 'remove', safeId, '-g', '-y'], { timeout: 30000 })
  } catch {}

  const candidates = [
    skillDir,
    path.join(os.homedir(), '.agents', 'skills', safeId),
    path.join(os.homedir(), '.claude', 'skills', safeId),
  ].filter((v): v is string => Boolean(v))

  for (const dir of candidates) {
    try {
      const resolved = path.resolve(dir)
      const inAgents = resolved.startsWith(
        path.resolve(os.homedir(), '.agents', 'skills') + path.sep
      )
      const inClaude = resolved.startsWith(
        path.resolve(os.homedir(), '.claude', 'skills') + path.sep
      )
      if ((inAgents || inClaude) && fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
      }
    } catch {}
  }
  if (diskMeta[safeId.toLowerCase()]) {
    delete diskMeta[safeId.toLowerCase()]
    void saveMetaCache(diskMeta)
  }
  return { ok: true }
}
