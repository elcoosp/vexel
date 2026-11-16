import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function searchRemoteSkills(query = '') {
  const q = String(query || '').trim()
  const url = 'https://skills.sh' + encodeURIComponent(q)
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Vexel-Bridge/1.0' },
  })
  if (!res.ok) return []
  const data = await res.json()
  const items = Array.isArray(data) ? data : data.skills || data.results || []
  return items.slice(0, 20).map((item) => ({
    id: item.slug || item.name || item.id || '',
    name: item.name || item.slug || '',
    repo: item.repo || item.source || item.ownerRepo || '',
    installs: item.installs || item.installCount || '',
    description: item.description || '',
  }))
}

export async function enrichLocalSkill(skill) {
  try {
    const matches = await searchRemoteSkills(skill.name)
    const exact = matches.find(
      (m) =>
        m.name.toLowerCase() === skill.name.toLowerCase() ||
        m.id.toLowerCase() === skill.id.toLowerCase()
    )
    if (exact) {
      return { ...skill, sourceRepo: exact.repo, installs: exact.installs }
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
