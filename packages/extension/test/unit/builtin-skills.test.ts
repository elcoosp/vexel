import { describe, it, expect } from 'vitest'
import { BUILTIN_SKILLS } from '../../src/features/builtin-skills'

describe('BUILTIN_SKILLS integrity', () => {
  it('provides non-empty unique skills with valid smartContent and fullContent', () => {
    expect(Array.isArray(BUILTIN_SKILLS)).toBe(true)
    expect(BUILTIN_SKILLS.length).toBeGreaterThanOrEqual(4)
    const ids = new Set<string>()
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.id).toBeTruthy()
      expect(ids.has(skill.id)).toBe(false)
      ids.add(skill.id)
      expect(skill.name.length).toBeGreaterThan(1)
      expect(skill.smartContent.length).toBeGreaterThan(20)
      expect(skill.fullContent.length).toBeGreaterThanOrEqual(skill.smartContent.length)
    }
  })
})
