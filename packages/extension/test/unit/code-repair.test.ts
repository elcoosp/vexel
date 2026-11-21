import { describe, expect, it } from 'vitest'

import { reconstructIndentation } from '../../src/features/code-repair'

describe('reconstructIndentation', () => {
  it('reconstructs stripped indentation in TypeScript while ignoring braces inside strings', () => {
    const head = [
      'export function runWorker(items: string[]) {',

      ' for (const item of items) {',

      ' if (item.includes("{not-a-brace}")) {',

      ' console.log(item)',
    ].join('\n')

    const strippedTail = [
      'const normalized = item.trim()',

      'if (normalized.length > 0) {',

      'return normalized',

      '}',

      '}',

      '}',

      '}',
    ].join('\n')

    const repaired = reconstructIndentation(head, strippedTail, 'ts')

    expect(repaired).toContain(' const normalized = item.trim()')

    expect(repaired).toContain(' if (normalized.length > 0) {')

    expect(repaired).toContain(' return normalized')

    expect(repaired.endsWith('\n}')).toBe(true)
  })

  it('reconstructs Python 4-space indentation after colon blocks', () => {
    const head = ['def process_jobs(jobs):', ' for job in jobs:'].join('\n')

    const strippedTail = ['if job.is_ready:', 'job.execute()', 'return True'].join('\n')

    const repaired = reconstructIndentation(head, strippedTail, 'python')

    expect(repaired).toContain(' if job.is_ready:')

    expect(repaired).toContain(' job.execute()')
  })
})
