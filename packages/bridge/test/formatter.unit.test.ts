import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  formatCodeWithNativeTool,
  getCandidateSpecs,
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
    expect(resolveTargetExtension('unknown', 'src/main.zig')).toBe('zig')
    expect(resolveTargetExtension('')).toBe('txt')
  })
  it('exposes high-speed native candidate specs across all supported ecosystems', () => {
    expect(getCandidateSpecs('ts').map((s) => s.engine)).toEqual(['oxfmt', 'biome'])
    expect(getCandidateSpecs('toml').map((s) => s.engine)).toEqual(['taplo', 'oxfmt'])
    expect(getCandidateSpecs('py').map((s) => s.engine)).toEqual(['ruff'])
    expect(getCandidateSpecs('rs').map((s) => s.engine)).toEqual(['rustfmt'])
    expect(getCandidateSpecs('go').map((s) => s.engine)).toEqual(['gofmt'])
    expect(getCandidateSpecs('sh').map((s) => s.engine)).toEqual(['shfmt'])
    expect(getCandidateSpecs('cpp').map((s) => s.engine)).toEqual(['clang-format'])
    expect(getCandidateSpecs('java').map((s) => s.engine)).toEqual(['clang-format'])
    expect(getCandidateSpecs('proto').map((s) => s.engine)).toEqual(['clang-format'])
    expect(getCandidateSpecs('sql').map((s) => s.engine)).toEqual(['sleek', 'pg_format'])
    expect(getCandidateSpecs('tf').map((s) => s.engine)).toEqual(['tofu', 'terraform'])
    expect(getCandidateSpecs('nix').map((s) => s.engine)).toEqual(['alejandra', 'nixfmt'])
    expect(getCandidateSpecs('lua').map((s) => s.engine)).toEqual(['stylua'])
    expect(getCandidateSpecs('zig').map((s) => s.engine)).toEqual(['zig'])
    expect(getCandidateSpecs('swift').map((s) => s.engine)).toEqual(['swift-format'])
    expect(getCandidateSpecs('kt').map((s) => s.engine)).toEqual(['ktfmt'])
    expect(getCandidateSpecs('unknown_ext')).toEqual([])
  })
  it('formats via native CLI binaries over stdin/stdout for C++, SQL, TOML, Terraform, Lua, Zig, Nix, Swift & Kotlin', async () => {
    writeFakeFormatter('clang-format', 'cat; printf "\\n// clang-formatted:%s" "$1"')
    writeFakeFormatter('sleek', 'printf "SELECT 1;\\n"')
    writeFakeFormatter('taplo', 'cat <<\'OUT\'\n[package]\nname = "vexel"\nOUT')
    writeFakeFormatter('tofu', 'cat <<\'OUT\'\nresource "null_resource" "ok" {}\nOUT')
    writeFakeFormatter('stylua', 'printf "local x = 1\\n"')
    writeFakeFormatter('zig', 'printf "const x: u32 = 1;\\n"')
    writeFakeFormatter('alejandra', 'printf "{ pkgs }: pkgs.hello\\n"')
    writeFakeFormatter('swift-format', 'printf "let x = 1\\n"')
    writeFakeFormatter('ktfmt', 'printf "val x = 1\\n"')
    const cppRes = await formatCodeWithNativeTool('int main(){return 0;}', 'cpp', 'src/app.cpp')
    expect(cppRes.engine).toBe('clang-format')
    expect(cppRes.formatted).toContain('// clang-formatted:--assume-filename=app.cpp')
    const sqlRes = await formatCodeWithNativeTool('select 1', 'sql')
    expect(sqlRes).toEqual({ ok: true, formatted: 'SELECT 1;', engine: 'sleek' })
    const tomlRes = await formatCodeWithNativeTool('[package]\nname="vexel"', 'toml')
    expect(tomlRes).toEqual({ ok: true, formatted: '[package]\nname = "vexel"', engine: 'taplo' })
    const tfRes = await formatCodeWithNativeTool('resource "null_resource" "ok" {}', 'terraform')
    expect(tfRes.engine).toBe('tofu')
    const luaRes = await formatCodeWithNativeTool('local x=1', 'lua')
    expect(luaRes).toEqual({ ok: true, formatted: 'local x = 1', engine: 'stylua' })
    const zigRes = await formatCodeWithNativeTool('const x:u32=1;', 'zig')
    expect(zigRes).toEqual({ ok: true, formatted: 'const x: u32 = 1;', engine: 'zig' })
    const nixRes = await formatCodeWithNativeTool('{pkgs}:pkgs.hello', 'nix')
    expect(nixRes).toEqual({ ok: true, formatted: '{ pkgs }: pkgs.hello', engine: 'alejandra' })
    const swiftRes = await formatCodeWithNativeTool('let x=1', 'swift')
    expect(swiftRes).toEqual({ ok: true, formatted: 'let x = 1', engine: 'swift-format' })
    const ktRes = await formatCodeWithNativeTool('val x=1', 'kotlin')
    expect(ktRes).toEqual({ ok: true, formatted: 'val x = 1', engine: 'ktfmt' })
  })
  it('falls back to secondary formatter candidate when primary exits non-zero, and to fallback when none succeed', async () => {
    writeFakeFormatter('sleek', 'exit 2')
    writeFakeFormatter('pg_format', 'printf "SELECT id FROM users;\n"')
    const sqlFallback = await formatCodeWithNativeTool('select id from users', 'sql')
    expect(sqlFallback).toEqual({
      ok: true,
      formatted: 'SELECT id FROM users;',
      engine: 'pg_format',
    })
    const unknownRes = await formatCodeWithNativeTool('raw text', 'brainfuck')
    expect(unknownRes).toEqual({
      ok: true,
      formatted: 'raw text',
      engine: 'fallback',
    })
  })
})
