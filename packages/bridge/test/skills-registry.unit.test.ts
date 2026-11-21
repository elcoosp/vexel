import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enrichLocalSkill, removeLocalSkill } from '../src/skills-registry.ts'
describe('skills-registry.ts enrichment & security sandbox', () => {
  let tmpSkillsDir = ''
  beforeAll(() => {
    tmpSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-skills-test-'))
  })
  afterAll(() => {
    fs.rmSync(tmpSkillsDir, { recursive: true, force: true })
  })
  it('enriches local skill objects and enforces safe removal sandbox', async () => {
    const skillDir = path.join(tmpSkillsDir, 'audit-api')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: audit-api',
        'description: Security and contract review for REST endpoints',
        '---',
        '# API Audit Workflow',
        'Check authentication, rate limits, and schema validation.',
      ].join('\n')
    )
    const enriched = await enrichLocalSkill({
      id: 'audit-api',
      name: 'audit-api',
      description: 'Security and contract review for REST endpoints',
    })
    expect(enriched.id).toBe('audit-api')
    expect(enriched.name).toBe('audit-api')
    // Verify removeLocalSkill never deletes arbitrary directories outside ~/.agents/skills or ~/.claude/skills
    await expect(removeLocalSkill('../evil', skillDir)).rejects.toThrow()
    const res = await removeLocalSkill('audit-api', skillDir)
    expect(res.ok).toBe(true)
    expect(fs.existsSync(skillDir)).toBe(true)
  })
})
