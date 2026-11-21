import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  enrichLocalSkill,
  installRemoteSkill,
  removeLocalSkill,
  searchRemoteSkills,
} from '../src/skills-registry.ts'

describe('skills-registry.ts enrichment, remote search & security sandbox', () => {
  let tmpSkillsDir = ''
  beforeAll(() => {
    tmpSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-skills-test-'))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(() => {
    fs.rmSync(tmpSkillsDir, { recursive: true, force: true })
  })

  it('enriches local skills and enforces safe removal sandbox', async () => {
    const skillDir = path.join(tmpSkillsDir, 'audit-api')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: audit-api\n---\nBody')
    const enriched = await enrichLocalSkill({ id: 'audit-api', name: 'audit-api' })
    expect(enriched.id).toBe('audit-api')
    await expect(removeLocalSkill('../evil', skillDir)).rejects.toThrow()
    await expect(removeLocalSkill('', skillDir)).rejects.toThrow()
    expect((await removeLocalSkill('audit-api', skillDir)).ok).toBe(true)
    expect(fs.existsSync(skillDir)).toBe(true)
  })

  it('rejects invalid repo identifiers and handles remote search + 429', async () => {
    await expect(installRemoteSkill('bad-repo')).rejects.toThrow('Invalid repository')
    expect(await searchRemoteSkills('a')).toEqual([])
    vi.stubGlobal('fetch', async (input: string | URL) => {
      if (String(input).includes('/api/search')) {
        return new Response(
          JSON.stringify({
            skills: [{ source: 'acme/skills', name: 'stripe-audit', installs: 2500 }],
          }),
          { status: 200 }
        )
      }
      return new Response('---\ndescription: Stripe audit\n---\nBody', { status: 200 })
    })
    const items = await searchRemoteSkills('stripe')
    expect(items[0]?.installs).toBe('2.5K')
    vi.stubGlobal('fetch', async () => new Response('Rate limited', { status: 429 }))
    expect(await searchRemoteSkills('rate-limit-check')).toEqual([])
  })
})
