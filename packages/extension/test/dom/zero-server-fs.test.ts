import { describe, it, expect, beforeEach } from 'vitest';
import { browseLocalFs, readLocalFsFile, packLocalFsFolder, writeLocalFsFile } from '../../src/features/local-fs';

describe('Zero-Server FS fallback (linkedom + mock IndexedDB)', () => {
  const memStore = new Map<string, unknown>();

  beforeEach(() => {
    memStore.clear();
    // Minimal in-memory IndexedDB mock for unit/dom testing
    (globalThis as Record<string, unknown>).indexedDB = {
      open: () => {
        const req: Record<string, unknown> = {
          result: {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => {},
            transaction: () => ({
              objectStore: () => ({
                put: (val: unknown, key: string) => {
                  memStore.set(key, val);
                },
                get: (key: string) => {
                  const getReq: Record<string, unknown> = { result: memStore.get(key) };
                  queueMicrotask(() => (getReq.onsuccess as (() => void) | undefined)?.());
                  return getReq;
                },
              }),
              set oncomplete(fn: () => void) {
                queueMicrotask(fn);
              },
            }),
          },
        };
        queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
        return req;
      },
    };

    memStore.set('project-snapshot', {
      rootName: 'demo-repo',
      files: [
{ relPath: 'README.md', name: 'README.md', content: '# Demo Repo\n', size: 12 },
{ relPath: 'src/app.ts', name: 'app.ts', content: 'console.log("hi");\n', size: 19 },
],
});
});
it('browses root and subdirectories from stored snapshot', async () => {
const root = await browseLocalFs('', '', false);
expect(root.ok).toBe(true);
expect(root.rootLabel).toBe('demo-repo');
expect(root.entries?.map((e) => e.name)).toEqual(['src', 'README.md']);
const sub = await browseLocalFs('src', '', false);
expect(sub.ok).toBe(true);
expect(sub.entries?.map((e) => e.name)).toEqual(['app.ts']);
});
it('reads file content and packs folder with 4-backtick fences', async () => {
const file = await readLocalFsFile('src/app.ts');
expect(file.ok).toBe(true);
expect(file.content).toBe('console.log("hi");\n');
const pack = await packLocalFsFolder('');
expect(pack.ok).toBe(true);
expect(pack.fileCount).toBe(2);
expect(pack.content).toContain('````ts');
expect(pack.content).toContain('console.log("hi");');
});
it('falls back to browser download when writing without FileSystemDirectoryHandle', async () => {
let clicked = false;
const origCreate = document.createElement.bind(document);
document.createElement = ((tag: string) => {
const el = origCreate(tag);
if (tag === 'a') {
el.click = () => {
clicked = true;
};
}
return el;
}) as typeof document.createElement;
globalThis.URL.createObjectURL = () => 'blob:mock';
globalThis.URL.revokeObjectURL = () => {};
const res = await writeLocalFsFile('src/generated.ts', 'export const ok = true;');
expect(res.ok).toBe(true);
expect(clicked).toBe(true);
});
});
