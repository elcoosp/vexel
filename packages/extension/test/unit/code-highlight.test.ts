import { beforeEach, describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import {
  ensureSemanticTokenStyles,
  reconstructStructuralIndentation,
  renderHighlightedTail,
} from '../../src/features/code-highlight'

describe('code-highlight.ts structural indentation & XSS-safe tokenizer', () => {
  let doc: Document

  beforeEach(() => {
    const { document: parsedDoc } = parseHTML(
      '<!doctype html><html><head></head><body></body></html>'
    )
    doc = parsedDoc
  })

  it('reconstructs Python class/method/try-except/dedent-after-return indentation accurately', () => {
    const head = [
      'class WorkerPool:',
      '    def __init__(self, size: int):',
      '        self.size = size',
      '',
      '    async def run(self, items):',
      '        for item in items:',
      '            try:',
    ].join('\n')

    const strippedTail = [
      'result = await self.execute(',
      'item,',
      'retry=True',
      ')',
      'return result',
      'except ValueError as err:',
      'self.log_error(err)',
      'else:',
      'self.commit()',
      '@staticmethod',
      'def health() -> bool:',
      'return True',
    ].join('\n')

    const full = reconstructStructuralIndentation(head, strippedTail, 'python')
    const lines = full.split('\n')

    expect(lines).toContain('                result = await self.execute(')
    expect(lines).toContain('                    item,')
    expect(lines).toContain('                return result')
    expect(lines).toContain('            except ValueError as err:')
    expect(lines).toContain('                self.log_error(err)')
    expect(lines).toContain('            else:')
    expect(lines).toContain('                self.commit()')
    expect(lines).toContain('    @staticmethod')
    expect(lines).toContain('    def health() -> bool:')
    expect(lines).toContain('        return True')
  })

  it('reconstructs brace-delimited languages while ignoring braces inside block comments & strings', () => {
    const head = [
      '/* block comment with fake { { { */',
      'pub fn evaluate(input: &str) -> usize {',
      '    // inline comment with {',
      '    match input {',
      '        "{" => {',
    ].join('\n')

    const strippedTail = ['let count = 1;', 'count', '}', '_ => 0,', '}', '}'].join('\n')
    const full = reconstructStructuralIndentation(head, strippedTail, 'rust')
    expect(full).toContain('      let count = 1;')
    expect(full).toContain('    }')
    expect(full.endsWith('\n}')).toBe(true)
  })

  it('tokenizes keywords, strings, numbers, decorators, types, functions & escapes HTML safely', () => {
    ensureSemanticTokenStyles(doc)
    ensureSemanticTokenStyles(doc)
    expect(doc.querySelectorAll('#vexel-code-tok-styles').length).toBe(1)

    const container = doc.createElement('span')
    const sample = [
      '@dataclass',
      'def compute(limit: int = 0xff) -> ResultType:',
      '    # comment with <script>alert(1)</script>',
      '    factor = 1.5e-2',
      '    msg = f"value={limit + factor}"',
      '    return format_msg(msg)',
    ].join('\n')

    renderHighlightedTail(container, sample, 'python')

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.querySelector('[data-vexel-tok="decorator"]')?.textContent).toBe('@dataclass')
    expect(container.querySelector('[data-vexel-tok="keyword"]')?.textContent).toBe('def')
    expect(container.querySelector('[data-vexel-tok="function"]')?.textContent).toBe('compute')
    expect(container.querySelector('[data-vexel-tok="string"]')?.textContent).toBe(
      'f"value={limit + factor}"'
    )
    expect(container.querySelector('[data-vexel-tok="type"]')?.textContent).toBe('ResultType')
    const numbers = Array.from(container.querySelectorAll('[data-vexel-tok="number"]')).map(
      (el) => el.textContent
    )
    expect(numbers).toEqual(['0xff', '1.5e-2'])
  })
})
