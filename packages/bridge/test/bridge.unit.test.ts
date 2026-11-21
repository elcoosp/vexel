import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
interface SkillsListResponse {
  skills: unknown[]
}
interface BrowseResponse {
  entries: Array<{ name: string; relPath: string; isDir: boolean }>
}
interface PackFolderResponse {
  ok: boolean
  content: string
}
interface FileResponse {
  content: string
}
interface GitDiffResponse {
  ok: boolean
  content: string
}
interface WriteFileResponse {
  ok: boolean
}
describe('@vexel/bridge HTTP API', () => {
  let tmpDir = ''
  let proc: ChildProcess | null = null
  let port = 0
  let token = ''
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-bridge-test-'))
    fs.mkdirSync(path.join(tmpDir, 'project', 'src'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'project', 'node_modules'), { recursive: true })
    execFileSync('git', ['init'], { cwd: path.join(tmpDir, 'project'), stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@vexel.dev'], {
      cwd: path.join(tmpDir, 'project'),
    })
    execFileSync('git', ['config', 'user.name', 'Vexel'], { cwd: path.join(tmpDir, 'project') })
    fs.writeFileSync(path.join(tmpDir, 'project', '.gitignore'), 'ignored.log\n')
    fs.writeFileSync(path.join(tmpDir, 'project', 'ignored.log'), 'secret log')
    fs.writeFileSync(path.join(tmpDir, 'project', 'node_modules', 'dep.js'), 'module.exports = 1;')
    fs.writeFileSync(
      path.join(tmpDir, 'project', 'src', 'index.ts'),
      'export const hello = "vexel";\n'
    )
    execFileSync('git', ['add', 'src/index.ts'], { cwd: path.join(tmpDir, 'project') })
    port = 49200 + Math.floor(Math.random() * 500)
    const child = spawn(process.execPath, ['packages/bridge/src/server.ts'], {
      env: { ...process.env, VEXEL_PORT: String(port), VEXEL_ROOT_DIR: tmpDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc = child
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bridge startup timeout')), 5000)
      let out = ''
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString()
        if (out.includes('Pret sur http://127.0.0.1:')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    const tokenFile = path.join(os.homedir(), '.vexel', 'token')
    if (fs.existsSync(tokenFile)) token = fs.readFileSync(tokenFile, 'utf8').trim()
  })
  afterAll(() => {
    if (proc) proc.kill('SIGTERM')
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  it('returns skills list on /skills', async () => {
    const headers: Record<string, string> = token ? { 'X-Vexel-Token': token } : {}
    const res = await fetch(`http://127.0.0.1:${port}/skills`, { headers })
    expect(res.status).toBe(200)
    const data = (await res.json()) as SkillsListResponse
    expect(Array.isArray(data.skills)).toBe(true)
  })
  it('browses project files while skipping node_modules and hidden dirs', async () => {
    const headers: Record<string, string> = token ? { 'X-Vexel-Token': token } : {}
    const res = await fetch(`http://127.0.0.1:${port}/browse?dir=project`, { headers })
    expect(res.status).toBe(200)
    const data = (await res.json()) as BrowseResponse
    const names = data.entries.map((e) => e.name)
    expect(names).toContain('src')
    expect(names).not.toContain('node_modules')
  })
  it('packs folder respecting .gitignore with 4-backtick fences', async () => {
    const headers: Record<string, string> = token ? { 'X-Vexel-Token': token } : {}
    const res = await fetch(`http://127.0.0.1:${port}/pack-folder?path=project`, { headers })
    expect(res.status).toBe(200)
    const data = (await res.json()) as PackFolderResponse
    expect(data.ok).toBe(true)
    expect(data.content).toContain('src/index.ts')
    expect(data.content).toContain('export const hello = "vexel";')
    expect(data.content).not.toContain('ignored.log')
    expect(data.content).toContain('````')
  })
  it('reads single file on /file and rejects >512KB with 413', async () => {
    const headers: Record<string, string> = token ? { 'X-Vexel-Token': token } : {}
    const okRes = await fetch(`http://127.0.0.1:${port}/file?path=project/src/index.ts`, {
      headers,
    })
    expect(okRes.status).toBe(200)
    const okData = (await okRes.json()) as FileResponse
    expect(okData.content).toContain('export const hello = "vexel";')
    fs.writeFileSync(path.join(tmpDir, 'project', 'huge.txt'), 'x'.repeat(600 * 1024))
    const bigRes = await fetch(`http://127.0.0.1:${port}/file?path=project/huge.txt`, { headers })
    expect(bigRes.status).toBe(413)
  })
  it('returns working tree diff on /git-diff', async () => {
    const headers: Record<string, string> = token ? { 'X-Vexel-Token': token } : {}
    const res = await fetch(`http://127.0.0.1:${port}/git-diff?dir=project`, { headers })
    expect(res.status).toBe(200)
    const data = (await res.json()) as GitDiffResponse
    expect(data.ok).toBe(true)
    expect(typeof data.content).toBe('string')
    expect(data.content).toContain('### Git Working Tree Diff')
    expect(data.content).toContain('src/index.ts')
  })
  it('writes nested files safely and blocks path traversal', async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Vexel-Token': token } : {}),
    }
    const bad = await fetch(`http://127.0.0.1:${port}/write-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ relPath: '../escape.txt', content: 'nope' }),
    })
    expect(bad.status).toBe(403)
    const good = await fetch(`http://127.0.0.1:${port}/write-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        relPath: 'project/nested/dir/out.ts',
        content: 'export const x = 42;\n',
      }),
    })
    expect(good.status).toBe(200)
    const data = (await good.json()) as WriteFileResponse
    expect(data.ok).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, 'project/nested/dir/out.ts'), 'utf8')).toBe(
      'export const x = 42;\n'
    )
  })
})
