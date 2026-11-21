import { parseHTML } from 'linkedom'

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
const storageMap = new Map<string, string>()

Object.assign(globalThis, {
  window: dom.window,
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  HTMLTextAreaElement: dom.HTMLTextAreaElement,
  HTMLInputElement: dom.HTMLInputElement,
  Element: dom.Element,
  NodeList: (dom.window as unknown as { NodeList?: unknown }).NodeList || class MockNodeList {},
  Node: dom.Node,
  Text: dom.Text,
  DocumentFragment: dom.DocumentFragment,
  Event: dom.Event,
  CustomEvent: dom.CustomEvent,
  MouseEvent: dom.MouseEvent,
  KeyboardEvent:
    dom.KeyboardEvent ||
    class MockKeyboardEvent extends dom.Event {
      key = ''
      code = ''
      altKey = false
      ctrlKey = false
      metaKey = false
      shiftKey = false
      constructor(t: string, i: Record<string, unknown> = {}) {
        super(t, i)
        Object.assign(this, i)
      }
    },
  DOMParser: dom.DOMParser,
  XMLSerializer: dom.XMLSerializer,
  localStorage: {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  },
})

if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
  })
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number
}

if (typeof dom.HTMLInputElement?.prototype?.setSelectionRange !== 'function') {
  dom.HTMLInputElement.prototype.setSelectionRange = function () {}
  dom.HTMLInputElement.prototype.select = function () {}
}

const mockGetComputedStyle = (() => ({
  getPropertyValue: () => '',
})) as unknown as typeof getComputedStyle
;(globalThis as Record<string, unknown>).getComputedStyle = mockGetComputedStyle
;(dom.window as unknown as Record<string, unknown>).getComputedStyle = mockGetComputedStyle
