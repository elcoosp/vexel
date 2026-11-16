export type LucideIconName = 'zap' | 'sparkles' | 'folder' | 'file-text' | 'download'

const SVG_NS = 'http://w3.org'

interface ShapeSpec {
  tag: 'path' | 'polyline' | 'line' | 'polygon'
  attrs: Record<string, string>
}

const LUCIDE_SHAPES: Record<LucideIconName, ShapeSpec[]> = {
  zap: [
    {
      tag: 'path',
      attrs: {
        d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
      },
    },
  ],
  sparkles: [
    {
      tag: 'path',
      attrs: {
        d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      },
    },
    { tag: 'path', attrs: { d: 'M20 3v4' } },
    { tag: 'path', attrs: { d: 'M22 5h-4' } },
  ],
  folder: [
    {
      tag: 'path',
      attrs: {
        d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
      },
    },
  ],
  'file-text': [
    {
      tag: 'path',
      attrs: { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    },
    { tag: 'path', attrs: { d: 'M14 2v4a2 2 0 0 0 2 2h4' } },
    { tag: 'path', attrs: { d: 'M10 9H8' } },
    { tag: 'path', attrs: { d: 'M16 13H8' } },
    { tag: 'path', attrs: { d: 'M16 17H8' } },
  ],
  download: [
    { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
    { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
    { tag: 'line', attrs: { x1: '12', x2: '12', y1: '15', y2: '3' } },
  ],
}

export function createLucideIcon(name: LucideIconName, size = 14): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.style.flexShrink = '0'

  for (const shape of LUCIDE_SHAPES[name]) {
    const el = document.createElementNS(SVG_NS, shape.tag)
    for (const [key, val] of Object.entries(shape.attrs)) {
      el.setAttribute(key, val)
    }
    svg.append(el)
  }

  return svg
}
