import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface FormatResult {
  ok: boolean
  formatted: string
  engine: string
}

interface FormatterSpec {
  engine: string
  binName: string
  args: (filename: string) => string[]
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
  'toml',
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

const LANG_TO_EXT: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  golang: 'go',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  toml: 'toml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  markdown: 'md',
  md: 'md',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
}

const binaryPathCache = new Map<string, string | null>()

function getSearchDirs(): string[] {
  const home = os.homedir()
  const cwd = process.cwd()
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const ancestorBins: string[] = []
  for (const startDir of [cwd, moduleDir]) {
    let cur = startDir
    for (let i = 0; i < 6; i += 1) {
      ancestorBins.push(path.join(cur, 'node_modules', '.bin'))
      ancestorBins.push(path.join(cur, 'packages', 'extension', 'node_modules', '.bin'))
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }
  const envPath = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  return Array.from(
    new Set([
      ...ancestorBins,
      path.join(home, '.cargo', 'bin'),
      path.join(home, '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      ...envPath,
    ])
  )
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

function getCandidateSpecs(ext: string): FormatterSpec[] {
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
  if (ext === 'py' || ext === 'pyi') {
    return [
      {
        engine: 'ruff',
        binName: 'ruff',
        args: (filename) => ['format', '--stdin-filename', filename, '-'],
      },
    ]
  }
  if (ext === 'rs') {
    return [
      {
        engine: 'rustfmt',
        binName: 'rustfmt',
        args: () => ['--emit', 'stdout', '--edition', '2024'],
      },
    ]
  }
  if (ext === 'go') {
    return [
      {
        engine: 'gofmt',
        binName: 'gofmt',
        args: () => [],
      },
    ]
  }
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return [
      {
        engine: 'shfmt',
        binName: 'shfmt',
        args: () => ['-i', '2', '-'],
      },
    ]
  }
  return []
}

function runProcessWithStdin(
  binPath: string,
  args: string[],
  stdinText: string,
  timeoutMs = 600
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (val: string | null) => {
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
      finish(null)
    }, timeoutMs)

    const outChunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk))
    child.on('error', () => {
      clearTimeout(timer)
      finish(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && outChunks.length > 0) {
        finish(Buffer.concat(outChunks).toString('utf8'))
      } else {
        finish(null)
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
  const cleanKey = (langOrExt || '').trim().toLowerCase().replace(/^\./, '')
  const hintExt = filenameHint ? path.extname(filenameHint).toLowerCase().replace(/^\./, '') : ''
  const ext = hintExt || LANG_TO_EXT[cleanKey] || cleanKey || 'txt'
  const safeName =
    filenameHint && path.basename(filenameHint) ? path.basename(filenameHint) : `snippet.${ext}`

  const specs = getCandidateSpecs(ext)
  for (const spec of specs) {
    const binPath = await resolveBinary(spec.binName)
    if (!binPath) continue
    const output = await runProcessWithStdin(binPath, spec.args(safeName), code)
    if (output && output.trim().length > 0) {
      return {
        ok: true,
        formatted: output.replace(/\n$/, ''),
        engine: spec.engine,
      }
    }
  }

  return {
    ok: true,
    formatted: code,
    engine: 'fallback',
  }
}
