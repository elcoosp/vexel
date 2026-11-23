import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface FirefoxManifestPatch {
  browser_specific_settings?: {
    gecko: {
      id: string
      strict_min_version: string
      data_collection_permissions: {
        required: string[]
      }
    }
  }
  background?: {
    service_worker?: string
    scripts?: string[]
    type?: string
  }
}

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'packages/extension/dist')
const RELEASE_DIR = path.join(ROOT, 'release')
const ASSETS_DIR = path.join(ROOT, 'docs/assets')

if (!fs.existsSync(path.join(DIST_DIR, 'manifest.json'))) {
  throw new Error('packages/extension/dist/manifest.json introuvable — lance pnpm build avant.')
}

fs.mkdirSync(RELEASE_DIR, { recursive: true })
fs.mkdirSync(ASSETS_DIR, { recursive: true })

// 1. Chrome & Edge ZIP (standard Chromium MV3)
const chromeZip = path.join(RELEASE_DIR, 'vexel-extension-store.zip')
fs.rmSync(chromeZip, { force: true })
execFileSync('zip', ['-rq', chromeZip, '.'], { cwd: DIST_DIR })
console.log('✓ Built Chrome/Edge package:', path.relative(ROOT, chromeZip))

// 2. Firefox AMO ZIP (patches manifest.json with gecko ID + background.scripts)
const tmpFxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-fx-dist-'))
try {
  fs.cpSync(DIST_DIR, tmpFxDir, { recursive: true })
  const fxManifestPath = path.join(tmpFxDir, 'manifest.json')
  const fxManifest = JSON.parse(fs.readFileSync(fxManifestPath, 'utf8')) as FirefoxManifestPatch
  fxManifest.browser_specific_settings = {
    gecko: {
      id: 'vexel@elcoosp.dev',
      strict_min_version: '121.0',
      data_collection_permissions: {
        required: ['none'],
      },
    },
  }
  if (fxManifest.background?.service_worker) {
    const sw = fxManifest.background.service_worker
    fxManifest.background = {
      scripts: [sw],
      type: fxManifest.background.type || 'module',
    }
  }
  fs.writeFileSync(fxManifestPath, JSON.stringify(fxManifest, null, 2) + '\n')

  const firefoxZip = path.join(RELEASE_DIR, 'vexel-extension-firefox.zip')
  fs.rmSync(firefoxZip, { force: true })
  execFileSync('zip', ['-rq', firefoxZip, '.'], { cwd: tmpFxDir })
  console.log('✓ Built Firefox AMO package:', path.relative(ROOT, firefoxZip))
} finally {
  fs.rmSync(tmpFxDir, { recursive: true, force: true })
}

// 3. Generate 300x300 Edge Partner Center icon from docs/logo.png or icon-128.png
const edgeIconOut = path.join(ASSETS_DIR, 'store-icon-300x300.png')
const srcLogo = fs.existsSync(path.join(ROOT, 'docs/logo.png'))
  ? path.join(ROOT, 'docs/logo.png')
  : path.join(ROOT, 'packages/extension/public/icons/icon-128.png')
try {
  execFileSync('sips', ['-z', '300', '300', srcLogo, '--out', edgeIconOut], { stdio: 'ignore' })
  console.log('✓ Generated Edge 300x300 icon:', path.relative(ROOT, edgeIconOut))
} catch {
  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-i', srcLogo, '-vf', 'scale=300:300:flags=lanczos', edgeIconOut],
      {
        stdio: 'ignore',
      }
    )
    console.log('✓ Generated Edge 300x300 icon via ffmpeg:', path.relative(ROOT, edgeIconOut))
  } catch {
    if (!fs.existsSync(edgeIconOut))
      throw new Error('Neither sips, ffmpeg, nor existing store-icon-300x300.png available')
    console.log('✓ Reused committed Edge 300x300 icon:', path.relative(ROOT, edgeIconOut))
  }
}

// 4. Build reproducible source archive for Firefox AMO review (excludes node_modules/dist/sockets)
const fxSourceZip = path.join(RELEASE_DIR, 'vexel-source-firefox.zip')
fs.rmSync(fxSourceZip, { force: true })
const tmpSrcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-fx-src-'))
try {
  for (const f of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'tsconfig.json',
  ]) {
    if (fs.existsSync(path.join(ROOT, f)))
      fs.copyFileSync(path.join(ROOT, f), path.join(tmpSrcDir, f))
  }
  fs.writeFileSync(
    path.join(tmpSrcDir, 'BUILD_FIREFOX.md'),
    [
      '# Rebuilding Vexel Firefox Add-on from Source',
      '',
      '- **Node.js**: v22+ (tested on Node v24.22.2)',
      '- **Package manager**: pnpm v9+',
      '',
      '## Exact Build Steps',
      '1. `pnpm install --frozen-lockfile`',
      '2. `pnpm zip:store`',
      '3. Output package: `release/vexel-extension-firefox.zip`',
    ].join('\n') + '\n'
  )
  const skipNames = new Set([
    'node_modules',
    'dist',
    '.git',
    '.DS_Store',
    '.cws-profile',
    '.edge-profile',
    '.amo-profile',
  ])
  const copyClean = (src: string, dst: string): void => {
    fs.mkdirSync(dst, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) continue
      const s = path.join(src, entry.name)
      const d = path.join(dst, entry.name)
      if (entry.isDirectory()) copyClean(s, d)
      else if (entry.isFile()) fs.copyFileSync(s, d)
    }
  }
  copyClean(path.join(ROOT, 'packages'), path.join(tmpSrcDir, 'packages'))
  copyClean(path.join(ROOT, 'scripts'), path.join(tmpSrcDir, 'scripts'))
  execFileSync('zip', ['-rq', fxSourceZip, '.'], { cwd: tmpSrcDir })
  console.log('✓ Built Firefox AMO source archive:', path.relative(ROOT, fxSourceZip))
} finally {
  fs.rmSync(tmpSrcDir, { recursive: true, force: true })
}
