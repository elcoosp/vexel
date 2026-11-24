import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type FormatStatus = 'formatted' | 'syntax_error' | 'unavailable' | 'timeout' | 'empty'

export interface FormatDiagnostic {
  tool: string
  line?: number
  column?: number
  message: string
}

export interface FormatResult {
  ok: boolean
  status: FormatStatus
  formatted: string
  engine: string
  diagnostic?: FormatDiagnostic
}

export interface FormatterSpec {
  engine: string
  binName: string
  args: (filename: string) => string[]
  allowNonZeroWithStdout?: boolean
}

const OXFMT_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'html',
  'css',
  'scss',
  'less',
  'md',
  'mdx',
  'graphql',
  'gql',
  'vue',
  'svelte',
  'astro',
])

const CLANG_FORMAT_EXTS = new Set([
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cxx',
  'hh',
  'm',
  'mm',
  'cs',
  'proto',
])

export const LANG_TO_EXT: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  python: 'py',
  python3: 'py',
  py: 'py',
  pyi: 'pyi',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  golang: 'go',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yml',
  yml: 'yml',
  toml: 'toml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  markdown: 'md',
  md: 'md',
  mdx: 'mdx',
  graphql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cxx: 'cxx',
  cc: 'cc',
  objc: 'm',
  'objective-c': 'm',
  java: 'java',
  csharp: 'cs',
  'c#': 'cs',
  cs: 'cs',
  proto: 'proto',
  protobuf: 'proto',
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
  terraform: 'tf',
  tf: 'tf',
  hcl: 'hcl',
  nix: 'nix',
  lua: 'lua',
  zig: 'zig',
  swift: 'swift',
  kotlin: 'kt',
  kt: 'kt',
  kts: 'kts',
  php: 'php',
  rb: 'rb',
  ruby: 'rb',
  dart: 'dart',
}

const FORMATTER_SPECS_BY_EXT: Record<string, FormatterSpec[]> = {
  toml: [{ engine: 'taplo', binName: 'taplo', args: () => ['format', '-'] }],
  py: [
    {
      engine: 'ruff',
      binName: 'ruff',
      args: (filename) => ['format', '--stdin-filename', filename, '-'],
    },
  ],
  pyi: [
    {
      engine: 'ruff',
      binName: 'ruff',
      args: (filename) => ['format', '--stdin-filename', filename, '-'],
    },
  ],
  rs: [
    {
      engine: 'rustfmt',
      binName: 'rustfmt',
      args: () => ['--emit', 'stdout', '--edition', '2024'],
    },
  ],
  go: [{ engine: 'gofmt', binName: 'gofmt', args: () => [] }],
  sh: [{ engine: 'shfmt', binName: 'shfmt', args: () => ['-i', '2', '-'] }],
  bash: [{ engine: 'shfmt', binName: 'shfmt', args: () => ['-i', '2', '-'] }],
  zsh: [{ engine: 'shfmt', binName: 'shfmt', args: () => ['-i', '2', '-'] }],
  sql: [
    { engine: 'sleek', binName: 'sleek', args: () => [] },
    {
      engine: 'sqruff',
      binName: 'sqruff',
      args: (filename) => ['fix', '--stdin-filename', filename, '-'],
    },
    { engine: 'pg_format', binName: 'pg_format', args: () => ['-'] },
  ],
  tf: [
    { engine: 'tofu', binName: 'tofu', args: () => ['fmt', '-'] },
    { engine: 'terraform', binName: 'terraform', args: () => ['fmt', '-'] },
  ],
  tfvars: [
    { engine: 'tofu', binName: 'tofu', args: () => ['fmt', '-'] },
    { engine: 'terraform', binName: 'terraform', args: () => ['fmt', '-'] },
  ],
  hcl: [
    { engine: 'tofu', binName: 'tofu', args: () => ['fmt', '-'] },
    { engine: 'terraform', binName: 'terraform', args: () => ['fmt', '-'] },
  ],
  nix: [
    { engine: 'alejandra', binName: 'alejandra', args: () => ['--quiet'] },
    { engine: 'nixfmt', binName: 'nixfmt', args: () => [] },
  ],
  lua: [{ engine: 'stylua', binName: 'stylua', args: () => ['-'] }],
  zig: [{ engine: 'zig', binName: 'zig', args: () => ['fmt', '--stdin'] }],
  swift: [
    { engine: 'swift-format', binName: 'swift-format', args: () => ['format'] },
    {
      engine: 'swiftformat',
      binName: 'swiftformat',
      args: (filename) => ['stdin', '--stdinpath', filename],
    },
  ],
  kt: [{ engine: 'ktfmt', binName: 'ktfmt', args: () => ['-'] }],
  kts: [{ engine: 'ktfmt', binName: 'ktfmt', args: () => ['-'] }],
  php: [
    {
      engine: 'mago',
      binName: 'mago',
      args: (filename) => ['format', '--stdin-input', '--stdin-filepath', filename],
    },
    { engine: 'pretty-php', binName: 'pretty-php', args: () => [] },
    {
      engine: 'php-cs-fixer',
      binName: 'php-cs-fixer',
      args: () => ['fix', '--using-cache=no', '--quiet', '-'],
    },
  ],
  rb: [
    { engine: 'rubyfmt', binName: 'rubyfmt', args: () => [] },
    {
      engine: 'standardrb',
      binName: 'standardrb',
      args: (filename) => ['--stdin', filename, '--fix', '--format', 'quiet', '--stderr'],
      allowNonZeroWithStdout: true,
    },
    {
      engine: 'rubocop',
      binName: 'rubocop',
      args: (filename) => [
        '--stdin',
        filename,
        '-a',
        '--except',
        'Style/FrozenStringLiteralComment',
        '--format',
        'quiet',
        '--stderr',
      ],
      allowNonZeroWithStdout: true,
    },
  ],
  dart: [
    { engine: 'dart', binName: 'dart', args: () => ['format', '--output=show', '--summary=none'] },
  ],
  md: [{ engine: 'rumdl', binName: 'rumdl', args: () => ['fmt', '--silent', '-'] }],
  yaml: [{ engine: 'yamlfmt', binName: 'yamlfmt', args: () => ['-in'] }],
  java: [
    { engine: 'google-java-format', binName: 'google-java-format', args: () => ['-'] },
    {
      engine: 'clang-format',
      binName: 'clang-format',
      args: (filename) => ['--assume-filename=' + filename],
    },
  ],
}

const binaryPathCache = new Map<string, string | null>()

export function resetBinaryPathCacheForTests(): void {
  binaryPathCache.clear()
}

function getSearchDirs(): string[] {
  const home = os.homedir()
  const here = path.dirname(fileURLToPath(import.meta.url))
  const rootNodeBin = path.resolve(here, '..', '..', '..', 'node_modules', '.bin')
  const localNodeBin = path.resolve(here, '..', '..', 'extension', 'node_modules', '.bin')
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)

  const gemDirs: string[] = []
  for (const gemRoot of [
    path.join(home, '.gem', 'ruby'),
    path.join(home, '.local', 'share', 'gem', 'ruby'),
  ]) {
    try {
      for (const ver of fs.readdirSync(gemRoot)) {
        gemDirs.push(path.join(gemRoot, ver, 'bin'))
      }
    } catch {}
  }
  const fallbackDirs = [
    ...gemDirs,
    rootNodeBin,
    localNodeBin,
    path.join(home, '.local', 'bin'),
    path.join(home, '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  return Array.from(new Set([...pathDirs, ...fallbackDirs]))
}

async function resolveBinary(binName: string): Promise<string | null> {
  if (binaryPathCache.has(binName)) {
    return binaryPathCache.get(binName) ?? null
  }
  const suffix = process.platform === 'win32' ? '.exe' : ''
  for (const dir of getSearchDirs()) {
    const candidate = path.join(dir, binName + suffix)
    try {
      await fs.promises.access(candidate, fs.constants.X_OK)
      binaryPathCache.set(binName, candidate)
      return candidate
    } catch {}
  }
  try {
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(lookupCmd, [binName], { timeout: 800 })
    const found =
      stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) || null
    binaryPathCache.set(binName, found)
    return found
  } catch {
    binaryPathCache.set(binName, null)
    return null
  }
}

export function resolveTargetExtension(langOrExt: string, filenameHint?: string): string {
  const cleanKey = (langOrExt || '').trim().toLowerCase().replace(/^\./, '')
  const hintExt = filenameHint ? path.extname(filenameHint).toLowerCase().replace(/^\./, '') : ''
  return hintExt || LANG_TO_EXT[cleanKey] || cleanKey || 'txt'
}

export function getCandidateSpecs(ext: string): FormatterSpec[] {
  if (OXFMT_EXTS.has(ext)) {
    return [
      {
        engine: 'oxfmt',
        binName: 'oxfmt',
        args: (filename) => ['--stdin-filepath', filename],
      },
      {
        engine: 'biome',
        binName: 'biome',
        args: (filename) => ['format', '--stdin-file-path', filename],
      },
    ]
  }
  if (CLANG_FORMAT_EXTS.has(ext)) {
    return [
      {
        engine: 'clang-format',
        binName: 'clang-format',
        args: (filename) => [`--assume-filename=${filename}`],
      },
    ]
  }
  return FORMATTER_SPECS_BY_EXT[ext] || []
}

interface ProcessRunOutcome {
  kind: 'formatted' | 'syntax_error' | 'timeout' | 'spawn_error'
  stdout: string
  stderr: string
}

function stripAnsi(text: string): string {
  const esc = String.fromCodePoint(27)
  return text.replaceAll(new RegExp(esc + '\\[[0-9;]*[A-Za-z]', 'g'), '')
}

export function parseFormatterDiagnostic(tool: string, rawStderr: string): FormatDiagnostic {
  const cleaned = stripAnsi(rawStderr).trim()
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let line: number | undefined
  let column: number | undefined

  for (const l of lines) {
    const locMatch = l.match(/(?:-->\s*)?(?:<stdin>|[^\s:]+):(\d+):(\d+)/)
    if (locMatch) {
      line = Number(locMatch[1])
      column = Number(locMatch[2])
      break
    }
    const wordMatch = l.match(/\bline\s+(\d+)(?:[,:\s]+col(?:umn)?\s+(\d+))?/i)
    if (wordMatch) {
      line = Number(wordMatch[1])
      if (wordMatch[2]) column = Number(wordMatch[2])
      break
    }
    const simpleLineMatch = l.match(/:(\d+):/)
    if (simpleLineMatch) {
      line = Number(simpleLineMatch[1])
      break
    }
  }

  const meaningfulLine =
    lines.find((l) => /\b(?:error|parse|syntax|unexpected|expected|invalid|failed)\b/i.test(l)) ||
    lines.find((l) => !l.startsWith('-->') && !l.startsWith('|') && !/^\d+\s*\|/.test(l)) ||
    lines[0] ||
    tool + ' reported a syntax error'

  const message =
    meaningfulLine.length > 220 ? meaningfulLine.slice(0, 217) + '...' : meaningfulLine

  return {
    tool,
    ...(line !== undefined && Number.isFinite(line) && line > 0 ? { line } : {}),
    ...(column !== undefined && Number.isFinite(column) && column > 0 ? { column } : {}),
    message,
  }
}

function runProcessWithStdin(
  binPath: string,
  args: string[],
  stdinText: string,
  timeoutMs = 8000,
  allowNonZeroWithStdout = false
): Promise<ProcessRunOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (val: ProcessRunOutcome) => {
      if (settled) return
      settled = true
      resolve(val)
    }

    const child = spawn(binPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      finish({ kind: 'timeout', stdout: '', stderr: '' })
    }, timeoutMs)

    const outChunks: Buffer[] = []
    const errChunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))
    child.on('error', () => {
      clearTimeout(timer)
      finish({ kind: 'spawn_error', stdout: '', stderr: '' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(outChunks).toString('utf8')
      const stderr = Buffer.concat(errChunks).toString('utf8')
      if ((code === 0 || (allowNonZeroWithStdout && code === 1)) && stdout.trim().length > 0) {
        finish({ kind: 'formatted', stdout, stderr })
      } else if (code === 0) {
        finish({ kind: 'formatted', stdout: stdinText, stderr })
      } else {
        finish({ kind: 'syntax_error', stdout, stderr })
      }
    })

    child.stdin.on('error', () => {})
    child.stdin.end(stdinText, 'utf8')
  })
}

export async function formatCodeWithNativeTool(
  code: string,
  langOrExt: string,
  filenameHint?: string
): Promise<FormatResult> {
  if (!code.trim()) {
    return {
      ok: true,
      status: 'empty',
      formatted: code,
      engine: 'empty',
    }
  }

  const ext = resolveTargetExtension(langOrExt, filenameHint)
  const safeName =
    filenameHint && path.basename(filenameHint) ? path.basename(filenameHint) : 'snippet.' + ext

  const specs = getCandidateSpecs(ext)
  let sawTimeout = false
  let firstSyntaxError: { engine: string; diagnostic: FormatDiagnostic } | null = null

  for (const spec of specs) {
    const binPath = await resolveBinary(spec.binName)
    if (!binPath) continue
    const outcome = await runProcessWithStdin(
      binPath,
      spec.args(safeName),
      code,
      8000,
      Boolean(spec.allowNonZeroWithStdout)
    )
    if (outcome.kind === 'formatted' && outcome.stdout.trim().length > 0) {
      return {
        ok: true,
        status: 'formatted',
        formatted: outcome.stdout.replace(/\n$/, ''),
        engine: spec.engine,
      }
    }
    if (outcome.kind === 'timeout') {
      sawTimeout = true
      continue
    }
    if (outcome.kind === 'syntax_error' && !firstSyntaxError) {
      firstSyntaxError = {
        engine: spec.engine,
        diagnostic: parseFormatterDiagnostic(spec.engine, outcome.stderr),
      }
    }
  }

  if (firstSyntaxError) {
    return {
      ok: true,
      status: 'syntax_error',
      formatted: code,
      engine: firstSyntaxError.engine,
      diagnostic: firstSyntaxError.diagnostic,
    }
  }

  return {
    ok: true,
    status: sawTimeout ? 'timeout' : 'unavailable',
    formatted: code,
    engine: 'fallback',
  }
}
