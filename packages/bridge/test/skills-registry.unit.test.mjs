import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enrichLocalSkill, removeLocalSkill } from '../src/skills-registry.mjs';

describe('skills-registry.mjs frontmatter & security sandbox', () => {
  let tmpSkillsDir;

  beforeAll(() => {
    tmpSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-skills-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpSkillsDir, { recursive: true, force: true });
  });

  it('extracts SKILL.md YAML frontmatter description and enforces safe removal sandbox', async () => {
    const skillDir = path.join(tmpSkillsDir, 'audit-api');
    fs.mkdirSync(skillDir, { recursive: true });
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
    );

    const desc = await enrichLocalSkill(skillDir, 'audit-api');
    expect(typeof desc).toBe('string');

    // Verify removeLocalSkill never deletes arbitrary directories outside ~/.agents/skills or ~/.claude/skills
    await expect(removeLocalSkill('../evil', skillDir)).rejects.toThrow();
    const res = await removeLocalSkill('audit-api', skillDir);
    expect(res.ok).toBe(true);
    expect(fs.existsSync(skillDir)).toBe(true);
  });
});
