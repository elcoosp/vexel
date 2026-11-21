import { beforeEach, describe, expect, it } from 'vitest'
import {
  browseLocalFs,
  loadConnectedFolderName,
  packLocalFsFolder,
  readLocalFsFile,
  writeLocalFsFile,
} from '../../src/features/local-fs'

describe('Zero-Server FS fallback & snapshot edge cases (linkedom)', () => {
  const memStore = new Map<string, unknown>()

  beforeEach(() => {
    memStore.clear()
    ;(globalThis as Record<string, unknown>).indexedDB = {
      open: () => {
        const req: Record<string, unknown> = {
          result: {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => {},
            transaction: () => ({
              objectStore: () => ({
                put: (val: unknown, key: string) => {
                  memStore.set(key, val)
                },
                get: (key: string) => {
                  const getReq: Record<string, unknown> = { result: memStore.get(key) }
                  queueMicrotask(() => (getReq.onsuccess as (() => void) | undefined)?.())
                  return getReq
                },
              }),
              set oncomplete(fn: () => void) {
                queueMicrotask(fn)
              },
            }),
          },
        }
        queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.())
        return req
      },
    }
    memStore.set('project-snapshot', {
      rootName: 'demo-repo',
      files: [
        { relPath: 'README.md', name: 'README.md', content: '# Demo\n', size: 7 },
        { relPath: 'src/app.ts', name: 'app.ts', content: 'export const x = 1;\n', size: 20 },
      ],
    })
  })

  it('browses dirs, runs recursive search, and handles missing files/folders', async () => {
    expect(await loadConnectedFolderName()).toBe('demo-repo')
    const root = await browseLocalFs('', '', false)
    expect(root.entries?.map((e) => e.name)).toEqual(['src', 'README.md'])
    const search = await browseLocalFs('', 'app', false)
    expect(search.entries?.map((e) => e.relPath)).toEqual(['src/app.ts'])
    expect((await readLocalFsFile('missing.ts')).ok).toBe(false)

    memStore.clear()
    expect((await browseLocalFs('', '', false)).needsPicker).toBe(true)
    expect((await packLocalFsFolder('')).ok).toBe(false)
  })

  it('packs folder with 4-backtick fences and triggers browser download on write fallback', async () => {
    const pack = await packLocalFsFolder('')
    expect(pack.ok).toBe(true)
    expect(pack.content).toContain('````ts')

    let clicked = false
    const origCreate = document.createElement.bind(document)
    document.createElement = ((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a')
        el.click = () => {
          clicked = true
        }
      return el
    }) as typeof document.createElement
    globalThis.URL.createObjectURL = () => 'blob:mock'
    globalThis.URL.revokeObjectURL = () => {}
    expect((await writeLocalFsFile('src/out.ts', 'export const ok = true;')).ok).toBe(true)
    expect(clicked).toBe(true)
  })
})
