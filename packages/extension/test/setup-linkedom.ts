import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>');

Object.assign(globalThis, {
  window: dom.window,
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
  Text: dom.Text,
  DocumentFragment: dom.DocumentFragment,
  Event: dom.Event,
  CustomEvent: dom.CustomEvent,
  MouseEvent: dom.MouseEvent,
  KeyboardEvent: dom.KeyboardEvent,
  DOMParser: dom.DOMParser,
  XMLSerializer: dom.XMLSerializer,
});

if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
  });
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
}
