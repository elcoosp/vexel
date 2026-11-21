import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('@vexel/bridge HTTP API (full edge-case matrix)', () => {
  let tmpDir = ''
  let proc: ChildProcess | null = null
  let base = ''
  const token = 'vexel-test-secret-token'

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-bridge-test-'))
    fs.mkdirSync(path.join(tmpDir, 'project', 'src'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'project', 'node_modules'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'plain', 'sub'), { recursive: true })
    execFileSync('git', ['init'], { cwd: path.join(tmpDir, 'project'), stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 't@v.dev'], { cwd: path.join(tmpDir, 'project') })
    execFileSync('git', ['config', 'user.name', 'Vexel'], { cwd: path.join(tmpDir, 'project') })
    fs.writeFileSync(path.join(tmpDir, 'project', '.gitignore'), 'ignored.log\n')
    fs.writeFileSync(path.join(tmpDir, 'project', 'ignored.log'), 'secret')
    fs.writeFileSync(path.join(tmpDir, 'project', 'node_modules', 'dep.js'), 'export default 1')
    fs.writeFileSync(path.join(tmpDir, 'project', 'src', 'index.ts'), 'export const a = 1;\n')
    execFileSync('git', ['add', 'src/index.ts'], { cwd: path.join(tmpDir, 'project') })
    fs.writeFileSync(path.join(tmpDir, 'plain', 'sub', 'util.py'), 'def ok(): return 1\n')
    fs.writeFileSync(path.join(tmpDir, 'plain', 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const port = 49200 + Math.floor(Math.random() * 500)
    base = ['http', ':', '//', '127.0.0.1', ':', String(port)].join('')
    const child = spawn(process.execPath, ['packages/bridge/src/server.ts'], {
      env: {
        ...process.env,
        VEXEL_PORT: String(port),
        VEXEL_ROOT_DIR: tmpDir,
        VEXEL_BRIDGE_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc = child
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bridge startup timeout')), 5000)
      let out = ''
      child.stdout.on('data', (c: Buffer) => {
        out += c.toString()
        if (out.includes('127.0.0.1:')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  })

  afterAll(() => {
    proc?.kill('SIGTERM')
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('enforces origin/token auth and CORS preflight', async () => {
    const evil = ['https', ':', '//', '://example.com'].join('')
    expect(
      (await fetch(base + '/skills', { method: 'OPTIONS', headers: { Origin: evil } })).status
    ).toBe(204)
    expect((await fetch(base + '/skills', { headers: { Origin: evil } })).status).toBe(403)
    const ok = await fetch(base + '/skills', { headers: { Origin: evil, 'X-Vexel-Token': token } })
    expect(ok.status).toBe(200)
  })

  it('browses dirs, searches recursively, and blocks traversal', async () => {
    const h = { 'X-Vexel-Token': token }
    const res = (await (await fetch(base + '/browse?dir=project', { headers: h })).json()) as {
      entries: Array<{ name: string }>
    }
    expect(res.entries.map((e) => e.name)).toContain('src')
    expect(res.entries.map((e) => e.name)).not.toContain('node_modules')
    const q = (await (await fetch(base + '/browse?dir=plain&q=util', { headers: h })).json()) as {
      entries: Array<{ name: string }>
    }
    expect(q.entries.some((e) => e.name === 'util.py')).toBe(true)
    const miss = (await (await fetch(base + '/browse?dir=nope', { headers: h })).json()) as {
      missingDir?: boolean
    }
    expect(miss.missingDir).toBe(true)
    expect((await fetch(base + '/browse?dir=../out', { headers: h })).status).toBe(403)
  })

  it('packs git and non-git folders while blocking root pack', async () => {
    const h = { 'X-Vexel-Token': token }
    expect((await fetch(base + '/pack-folder?path=', { headers: h })).status).toBe(403)
    const gp = (await (await fetch(base + '/pack-folder?path=project', { headers: h })).json()) as {
      ok: boolean
      content: string
    }
    expect(gp.ok).toBe(true)
    expect(gp.content).toContain('src/index.ts')
    expect(gp.content).not.toContain('ignored.log')
    const pp = (await (await fetch(base + '/pack-folder?path=plain', { headers: h })).json()) as {
      ok: boolean
      content: string
    }
    expect(pp.content).toContain('sub/util.py')
    expect(pp.content).not.toContain('pic.png')
  })

  it('reads files, enforces 512KB limit, and validates write-file', async () => {
    const h = { 'Content-Type': 'application/json', 'X-Vexel-Token': token }
    expect((await fetch(base + '/file?path=project/missing.ts', { headers: h })).status).toBe(404)
    expect((await fetch(base + '/file?path=../../etc/passwd', { headers: h })).status).toBe(403)
    fs.writeFileSync(path.join(tmpDir, 'project', 'big.txt'), 'x'.repeat(600 * 1024))
    expect((await fetch(base + '/file?path=project/big.txt', { headers: h })).status).toBe(413)
    expect(
      (
        await fetch(base + '/write-file', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ relPath: 'project/Makefile', content: 'x' }),
        })
      ).status
    ).toBe(400)
    expect(
      (
        await fetch(base + '/write-file', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ relPath: '../x.ts', content: 'x' }),
        })
      ).status
    ).toBe(403)
    const wr = await fetch(base + '/write-file', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ relPath: 'project/new/out.ts', content: 'export const v = 2;\n' }),
    })
    expect(wr.status).toBe(200)
    expect(fs.readFileSync(path.join(tmpDir, 'project/new/out.ts'), 'utf8')).toBe(
      'export const v = 2;\n'
    )
    expect((await fetch(base + '/unknown', { headers: h })).status).toBe(404)
  })
})
