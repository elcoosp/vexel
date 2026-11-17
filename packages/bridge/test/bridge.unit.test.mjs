import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('@vexel/bridge HTTP API', () => {
  let tmpDir;
  let proc;
  let port;
  let token = '';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-bridge-test-'));
    fs.mkdirSync(path.join(tmpDir, 'project', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'project', 'node_modules'), { recursive: true });
    execFileSync('git', ['init'], { cwd: path.join(tmpDir, 'project'), stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'project', '.gitignore'), 'ignored.log\n');
    fs.writeFileSync(path.join(tmpDir, 'project', 'ignored.log'), 'secret log');
    fs.writeFileSync(path.join(tmpDir, 'project', 'node_modules', 'dep.js'), 'module.exports = 1;');
    fs.writeFileSync(path.join(tmpDir, 'project', 'src', 'index.ts'), 'export const hello = "vexel";\n');

    port = 49200 + Math.floor(Math.random() * 500);
    proc = spawn('node', ['packages/bridge/src/server.mjs'], {
      env: { ...process.env, VEXEL_PORT: String(port), VEXEL_ROOT_DIR: tmpDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bridge startup timeout')), 5000);
      let out = '';
      proc.stdout.on('data', (chunk) => {
        out += chunk.toString();
        if (out.includes('Pret sur http://127.0.0.1:')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const tokenFile = path.join(os.homedir(), '.vexel', 'token');
    if (fs.existsSync(tokenFile)) token = fs.readFileSync(tokenFile, 'utf8').trim();
  });

  afterAll(() => {
    if (proc) proc.kill('SIGTERM');
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns skills list on /skills', async () => {
    const headers = token ? { 'X-Vexel-Token': token } : {};
    const res = await fetch(`http://127.0.0.1:${port}/skills`, { headers });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.skills)).toBe(true);
  });

  it('browses project files while skipping node_modules and hidden dirs', async () => {
    const headers = token ? { 'X-Vexel-Token': token } : {};
    const res = await fetch(`http://127.0.0.1:${port}/browse?dir=project`, { headers });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.entries.map((e) => e.name);
    expect(names).toContain('src');
    expect(names).not.toContain('node_modules');
  });

  it('packs folder respecting .gitignore with 4-backtick fences', async () => {
    const headers = token ? { 'X-Vexel-Token': token } : {};
    const res = await fetch(`http://127.0.0.1:${port}/pack-folder?path=project`, { headers });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.content).toContain('src/index.ts');
    expect(data.content).toContain('export const hello = "vexel";');
    expect(data.content).not.toContain('ignored.log');
    expect(data.content).toContain('````');
  });

  it('writes nested files safely and blocks path traversal', async () => {
    const headers = { 'Content-Type': 'application/json', ...(token ? { 'X-Vexel-Token': token } : {}) };
    const bad = await fetch(`http://127.0.0.1:${port}/write-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ relPath: '../escape.txt', content: 'nope' }),
    });
    expect(bad.status).toBe(403);

    const good = await fetch(`http://127.0.0.1:${port}/write-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ relPath: 'project/nested/dir/out.ts', content: 'export const x = 42;\n' }),
    });
    expect(good.status).toBe(200);
    const data = await good.json();
    expect(data.ok).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'project/nested/dir/out.ts'), 'utf8')).toBe('export const x = 42;\n');
  });
});
