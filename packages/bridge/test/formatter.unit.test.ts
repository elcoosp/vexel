import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  formatCodeWithNativeTool,
  getCandidateSpecs,
  parseFormatterDiagnostic,
  resetBinaryPathCacheForTests,
  resolveTargetExtension,
} from '../src/formatter.ts'

describe('formatter.ts native CLI routing & fallback matrix', () => {
  let tmpBinDir = ''
  let origPath = ''

  beforeEach(() => {
    origPath = process.env.PATH || ''
    tmpBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-fmt-bin-'))
    process.env.PATH = `${tmpBinDir}${path.delimiter}${origPath}`
    resetBinaryPathCacheForTests()
  })

  afterEach(() => {
    process.env.PATH = origPath
    resetBinaryPathCacheForTests()
    if (tmpBinDir) {
      fs.rmSync(tmpBinDir, { recursive: true, force: true })
    }
  })

  function writeFakeFormatter(binName: string, scriptBody: string): void {
    const filePath = path.join(tmpBinDir, binName)
    fs.writeFileSync(filePath, `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 })
  }

  it('resolves language aliases and filename hints to target extensions', () => {
    expect(resolveTargetExtension('typescript')).toBe('ts')
    expect(resolveTargetExtension('c++')).toBe('cpp')
    expect(resolveTargetExtension('csharp')).toBe('cs')
    expect(resolveTargetExtension('postgresql')).toBe('sql')
    expect(resolveTargetExtension('terraform')).toBe('tf')
    expect(resolveTargetExtension('kotlin')).toBe('kt')
    expect(resolveTargetExtension('ruby')).toBe('rb')
    expect(resolveTargetExtension('php')).toBe('php')
    expect(resolveTargetExtension('dart')).toBe('dart')
    expect(resolveTargetExtension('unknown', 'src/main.zig')).toBe('zig')
    expect(resolveTargetExtension('')).toBe('txt')
  })
  it('exposes high-speed native candidate specs across all supported ecosystems', () => {
    expect(getCandidateSpecs('ts').map((s) => s.engine)).toEqual(['oxfmt', 'biome'])
    expect(getCandidateSpecs('toml').map((s) => s.engine)).toEqual(['taplo'])
    expect(getCandidateSpecs('py').map((s) => s.engine)).toEqual(['ruff'])
    expect(getCandidateSpecs('rs').map((s) => s.engine)).toEqual(['rustfmt'])
    expect(getCandidateSpecs('go').map((s) => s.engine)).toEqual(['gofmt'])
    expect(getCandidateSpecs('sh').map((s) => s.engine)).toEqual(['shfmt'])
    expect(getCandidateSpecs('cpp').map((s) => s.engine)).toEqual(['clang-format'])
    expect(getCandidateSpecs('java').map((s) => s.engine)).toEqual([
      'google-java-format',
      'clang-format',
    ])
    expect(getCandidateSpecs('proto').map((s) => s.engine)).toEqual(['clang-format'])
    expect(getCandidateSpecs('sql').map((s) => s.engine)).toEqual(['sleek', 'sqruff', 'pg_format'])
    expect(getCandidateSpecs('tf').map((s) => s.engine)).toEqual(['tofu', 'terraform'])
    expect(getCandidateSpecs('nix').map((s) => s.engine)).toEqual(['alejandra', 'nixfmt'])
    expect(getCandidateSpecs('lua').map((s) => s.engine)).toEqual(['stylua'])
    expect(getCandidateSpecs('zig').map((s) => s.engine)).toEqual(['zig'])
    expect(getCandidateSpecs('swift').map((s) => s.engine)).toEqual(['swift-format', 'swiftformat'])
    expect(getCandidateSpecs('kt').map((s) => s.engine)).toEqual(['ktfmt'])
    expect(getCandidateSpecs('php').map((s) => s.engine)).toEqual([
      'mago',
      'pretty-php',
      'php-cs-fixer',
    ])
    expect(getCandidateSpecs('rb').map((s) => s.engine)).toEqual([
      'rubyfmt',
      'standardrb',
      'rubocop',
    ])
    expect(getCandidateSpecs('dart').map((s) => s.engine)).toEqual(['dart'])
    expect(getCandidateSpecs('unknown_ext')).toEqual([])
  })
  it(
    'formats via native CLI binaries over stdin/stdout for C++, SQL, TOML, Terraform, Lua, Zig, Nix, Swift & Kotlin',
    { timeout: 15_000 },
    async () => {
      writeFakeFormatter('clang-format', 'cat; printf "\\n// clang-formatted:%s" "$1"')
      writeFakeFormatter('sleek', 'printf "SELECT 1;\\n"')
      writeFakeFormatter('taplo', 'cat <<\'OUT\'\n[package]\nname = "vexel"\nOUT')
      writeFakeFormatter('tofu', 'cat <<\'OUT\'\nresource "null_resource" "ok" {}\nOUT')
      writeFakeFormatter('stylua', 'printf "local x = 1\\n"')
      writeFakeFormatter('zig', 'printf "const x: u32 = 1;\\n"')
      writeFakeFormatter('alejandra', 'printf "{ pkgs }: pkgs.hello\\n"')
      writeFakeFormatter('swift-format', 'printf "let x = 1\\n"')
      writeFakeFormatter('ktfmt', 'printf "val x = 1\\n"')
      writeFakeFormatter(
        'mago',
        'printf "<?php\\n\\nfunction hi(): int\\n{\\n    return 1;\\n}\\n"'
      )
      writeFakeFormatter('standardrb', 'printf "def hi\\n  1\\nend\\n"')
      writeFakeFormatter('dart', 'printf "void main() {\\n  print(1);\\n}\\n"')
      writeFakeFormatter('google-java-format', 'printf "class Main {}\\n"')
      const cppRes = await formatCodeWithNativeTool('int main(){return 0;}', 'cpp', 'src/app.cpp')
      expect(cppRes.engine).toBe('clang-format')
      expect(cppRes.formatted).toContain('// clang-formatted:--assume-filename=app.cpp')
      const sqlRes = await formatCodeWithNativeTool('select 1', 'sql')
      expect(sqlRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'SELECT 1;',
        engine: 'sleek',
      })
      const tomlRes = await formatCodeWithNativeTool('[package]\nname="vexel"', 'toml')
      expect(tomlRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: '[package]\nname = "vexel"',
        engine: 'taplo',
      })
      const tfRes = await formatCodeWithNativeTool('resource "null_resource" "ok" {}', 'terraform')
      expect(tfRes.engine).toBe('tofu')
      const luaRes = await formatCodeWithNativeTool('local x=1', 'lua')
      expect(luaRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'local x = 1',
        engine: 'stylua',
      })
      const zigRes = await formatCodeWithNativeTool('const x:u32=1;', 'zig')
      expect(zigRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'const x: u32 = 1;',
        engine: 'zig',
      })
      const nixRes = await formatCodeWithNativeTool('{pkgs}:pkgs.hello', 'nix')
      expect(nixRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: '{ pkgs }: pkgs.hello',
        engine: 'alejandra',
      })
      const swiftRes = await formatCodeWithNativeTool('let x=1', 'swift')
      expect(swiftRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'let x = 1',
        engine: 'swift-format',
      })
      const ktRes = await formatCodeWithNativeTool('val x=1', 'kotlin')
      expect(ktRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'val x = 1',
        engine: 'ktfmt',
      })
      const phpRes = await formatCodeWithNativeTool('<?php function hi(){return 1;}', 'php')
      expect(phpRes.engine).toBe('mago')
      expect(phpRes.formatted).toContain('function hi(): int')
      const rbRes = await formatCodeWithNativeTool('def hi; 1; end', 'ruby')
      expect(rbRes.ok).toBe(true)
      expect(['rubyfmt', 'standardrb']).toContain(rbRes.engine)
      expect(rbRes.formatted).toContain('def hi')
      const dartRes = await formatCodeWithNativeTool('void main(){print(1);}', 'dart')
      expect(dartRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'void main() {\n  print(1);\n}',
        engine: 'dart',
      })
      const javaRes = await formatCodeWithNativeTool('class Main{}', 'java')
      expect(javaRes).toEqual({
        ok: true,
        status: 'formatted',
        formatted: 'class Main {}',
        engine: 'google-java-format',
      })
    }
  )
  it('falls back to secondary formatter candidate when primary exits non-zero, and to fallback when none succeed', async () => {
    writeFakeFormatter('sleek', 'exit 2')
    writeFakeFormatter('pg_format', 'printf "SELECT id FROM users;\n"')
    const sqlFallback = await formatCodeWithNativeTool('select id from users', 'sql')
    expect(sqlFallback.ok).toBe(true)
    expect(['sqruff', 'pg_format']).toContain(sqlFallback.engine)
    const unknownRes = await formatCodeWithNativeTool('raw text', 'brainfuck')
    expect(unknownRes).toEqual({
      ok: true,
      status: 'unavailable',
      formatted: 'raw text',
      engine: 'fallback',
    })
  })
  it('returns structured syntax_error with extracted line and column without false positives on lint warnings', async () => {
    writeFakeFormatter(
      'rustfmt',
      'printf "error: expected semicolon\\n --> <stdin>:14:5\\n" >&2; exit 1'
    )
    const rsErr = await formatCodeWithNativeTool('fn main() { let x = 1 }', 'rust')
    expect(rsErr.status).toBe('syntax_error')
    expect(rsErr.engine).toBe('rustfmt')
    expect(rsErr.diagnostic?.line).toBe(14)
    expect(rsErr.diagnostic?.column).toBe(5)
    expect(rsErr.diagnostic?.message).toContain('expected semicolon')

    const pyDiag = parseFormatterDiagnostic(
      'ruff',
      'error: Failed to parse <stdin>:9:12: Expected an expression'
    )
    expect(pyDiag).toEqual({
      tool: 'ruff',
      line: 9,
      column: 12,
      message: 'Expected an expression',
    })

    const oxcDiag = parseFormatterDiagnostic(
      'oxfmt',
      [
        "  × TS(1031): 'export' modifier cannot appear on class elements of this kind.",
        '   ╭─[stdin.ts:36:1]',
        '36 │ export interface PipelineStep {',
        '   · ──────',
        '   ╰────',
        '  help: Remove the export modifier.',
      ].join('\n')
    )
    expect(oxcDiag).toEqual({
      tool: 'oxfmt',
      line: 36,
      column: 1,
      message: "TS(1031): 'export' modifier cannot appear on class elements of this kind.\nhelp: Remove the export modifier.",
    })

    const tfDiag = parseFormatterDiagnostic(
      'terraform',
      'Error: Argument or block definition required\n  on <stdin> line 12, in resource "aws_s3_bucket" "logs":'
    )
    expect(tfDiag).toEqual({
      tool: 'terraform',
      line: 12,
      column: undefined,
      message: 'Argument or block definition required (resource "aws_s3_bucket" "logs":)',
    })

    const goDiag = parseFormatterDiagnostic(
      'gofmt',
      "<stdin>:8:15: expected ';', found 'IDENT' foo"
    )
    expect(goDiag).toEqual({
      tool: 'gofmt',
      line: 8,
      column: 15,
      message: "expected ';', found 'IDENT' foo",
    })

    writeFakeFormatter('rubyfmt', 'exit 1')
    writeFakeFormatter('standardrb', 'exit 1')
    writeFakeFormatter(
      'rubocop',
      'printf "def hi\\n  1\\nend\\n"; printf "W: Lint/UselessAssignment\\n" >&2; exit 1'
    )
    const rbWarn = await formatCodeWithNativeTool('def hi; x = 1; 1; end', 'ruby')
    expect(rbWarn.status).toBe('formatted')
    expect(rbWarn.engine).toBe('rubocop')
    expect(rbWarn.formatted).toBe('def hi\n  1\nend')
  })
})
