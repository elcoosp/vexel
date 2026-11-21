export type LucideIconName =
  | 'copy'
  | 'zap'
  | 'sparkles'
  | 'folder'
  | 'file-text'
  | 'download'
  | 'check'

const SVG_NS = ['http', '://www.w3.org/2000/svg'].join('')

const LUCIDE_SHAPES: Record<LucideIconName, Array<[string, Record<string, string>]>> = {
  copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  zap: [
    [
      'path',
      {
        d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
      },
    ],
  ],
  sparkles: [
    [
      'path',
      {
        d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      },
    ],
    ['path', { d: 'M20 3v4' }],
    ['path', { d: 'M22 5h-4' }],
  ],
  folder: [
    [
      'path',
      {
        d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
      },
    ],
  ],
  'file-text': [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }],
  ],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
}

export function createLucideIcon(
  name: LucideIconName,
  size = 13,
  strokeColor = 'currentColor'
): Element {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', strokeColor)
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('style', 'flex-shrink:0;display:inline-block;vertical-align:middle;')
  for (const [tag, attrs] of LUCIDE_SHAPES[name]) {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    svg.append(el)
  }
  return svg
}

const EXT_COLORS: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#eab308',
  jsx: '#eab308',
  mjs: '#eab308',
  py: '#3776ab',
  rs: '#ea580c',
  json: '#d97706',
  md: '#7c3aed',
  css: '#0284c7',
  html: '#e11d48',
  sh: '#16a34a',
  yml: '#db2777',
  yaml: '#db2777',
  toml: '#64748b',
}

export function createFileOrFolderIcon(name: string, isDir: boolean, size = 14): Element {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('style', 'flex-shrink:0;display:inline-block;vertical-align:middle;')

  if (isDir) {
    const folder = document.createElementNS(SVG_NS, 'path')
    folder.setAttribute(
      'd',
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
    )
    folder.setAttribute('fill', '#e8f0fe')
    folder.setAttribute('stroke', '#1a73e8')
    folder.setAttribute('stroke-width', '1.8')
    folder.setAttribute('stroke-linejoin', 'round')
    svg.append(folder)
    return svg
  }

  const ext = name.includes('.') ? (name.split('.').pop() || '').toLowerCase() : ''
  const color = EXT_COLORS[ext] || '#5f6368'

  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', color)
  svg.setAttribute('stroke-width', '1.9')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const doc = document.createElementNS(SVG_NS, 'path')
  doc.setAttribute('d', 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z')
  doc.setAttribute('fill', '#ffffff')
  const fold = document.createElementNS(SVG_NS, 'path')
  fold.setAttribute('d', 'M14 2v4a2 2 0 0 0 2 2h4')
  const l1 = document.createElementNS(SVG_NS, 'path')
  l1.setAttribute('d', 'M9 13h6')
  const l2 = document.createElementNS(SVG_NS, 'path')
  l2.setAttribute('d', 'M9 17h4')
  svg.append(doc, fold, l1, l2)
  return svg
}
