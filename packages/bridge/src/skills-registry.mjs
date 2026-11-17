import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const META_CACHE_FILE = path.join(os.homedir(), '.cache', 'vexel-skills-meta.json')
const searchCache = new Map()
const inflightSearch = new Map()
let rateLimitedUntil = 0

function loadMetaCache() {
  try {
    return JSON.parse(fs.readFileSync(META_CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveMetaCache(cache) {
  try {
    fs.mkdirSync(path.dirname(META_CACHE_FILE), { recursive: true })
    fs.writeFileSync(META_CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch {}
}

let diskMeta = loadMetaCache()

function fmtInstalls(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

export async function searchRemoteSkills(query = '') {
  const q = String(query || '').trim().toLowerCase()
  if (q.length < 2) return []

  const cached = searchCache.get(q)
  if (cached && Date.now() - cached.ts < 600000) return cached.items

  if (Date.now() < rateLimitedUntil) return []
  if (inflightSearch.has(q)) return inflightSearch.get(q)

  const task = (async () => {
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
      const data = await res.json()
      const raw = Array.isArray(data && data.skills) ? data.skills : []
      let dirty = false
      const items = raw.slice(0, 15).map((item) => {
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
      if (dirty) saveMetaCache(diskMeta)
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

export async function enrichLocalSkill(skill) {
  const hit = diskMeta[String(skill.name || '').toLowerCase()] || diskMeta[String(skill.id || '').toLowerCase()]
  if (hit && hit.sourceRepo) {
    return { ...skill, sourceRepo: hit.sourceRepo, installs: hit.installs }
  }
  return skill
}

export async function installRemoteSkill(repo, skillName) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    throw new Error('Repo invalide')
  }
  const args = ['-y', 'skills', 'add', repo]
  if (skillName && /^[a-zA-Z0-9_.-]+$/.test(skillName)) {
    args.push('--skill', skillName)
  }
  args.push('-g', '-y')
  const { stdout, stderr } = await execFileAsync('npx', args, { timeout: 60000 })
  return { ok: true, output: (stdout || stderr || '').trim() }
}

export async function removeLocalSkill(skillId, skillDir) {
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
  ].filter(Boolean)

  for (const dir of candidates) {
    try {
      const resolved = path.resolve(dir)
      const inAgents = resolved.startsWith(path.resolve(os.homedir(), '.agents', 'skills') + path.sep)
      const inClaude = resolved.startsWith(path.resolve(os.homedir(), '.claude', 'skills') + path.sep)
      if ((inAgents || inClaude) && fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
      }
    } catch {}
  }

  if (diskMeta[safeId.toLowerCase()]) {
    delete diskMeta[safeId.toLowerCase()]
    saveMetaCache(diskMeta)
  }
  return { ok: true }
}
