import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const enrichCache = new Map()

function formatInstalls(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

export async function searchRemoteSkills(query = '') {
  const q = String(query || '').trim()
  if (!q) return []
  const host = ["https://", "www.", "skills", ".sh"].join("")
  const url = host + "/api/search?q=" + encodeURIComponent(q)
  console.log("[Vexel Bridge] Query skills.sh:", q)
  const res = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/json', 'User-Agent': 'Vexel-Bridge/1.0' },
  })
  if (!res.ok) return []
  const data = await res.json()
  const items = Array.isArray(data?.skills) ? data.skills : []
  console.log("[Vexel Bridge] Hits:", items.length)
  return items.slice(0, 15).map((item) => ({
    id: item.skillId || item.name || item.id || '',
    name: item.name || item.skillId || '',
    repo: item.source || '',
    installs: formatInstalls(item.installs),
    description: item.source ? item.source + (item.installs ? ' • ' + formatInstalls(item.installs) + ' installs' : '') : '',
  }))
}

export async function enrichLocalSkill(skill) {
  if (enrichCache.has(skill.id)) return { ...skill, ...enrichCache.get(skill.id) }
  try {
    const matches = await searchRemoteSkills(skill.name)
    const exact = matches.find(
      (m) =>
        m.name.toLowerCase() === skill.name.toLowerCase() ||
        m.id.toLowerCase() === skill.id.toLowerCase()
    )
    if (exact && exact.repo) {
      const label = exact.installs ? `${exact.repo} (${exact.installs})` : exact.repo
      const meta = { sourceRepo: label, installs: exact.installs }
      enrichCache.set(skill.id, meta)
      return { ...skill, ...meta }
    }
  } catch {}
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
  const { stdout, stderr } = await execFileAsync('npx', args, { timeout: 45000 })
  return { ok: true, output: (stdout || stderr || '').trim() }
}
