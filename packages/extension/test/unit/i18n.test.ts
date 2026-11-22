import { afterEach, describe, expect, it } from 'vitest'
import {
  detectBrowserLocale,
  detectLocale,
  i18n,
  initLocaleSync,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  setLocale,
} from '../../src/i18n'

describe('i18n browser auto-detection & live sync', () => {
  afterEach(() => {
    try {
      localStorage.removeItem(LOCALE_STORAGE_KEY)
    } catch {}
    delete (globalThis as Record<string, unknown>).chrome
    setLocale('en')
  })

  it('normalizes browser language tags to supported locales with English fallback', () => {
    expect(normalizeLocale('fr-FR')).toBe('fr')
    expect(normalizeLocale('pt-PT')).toBe('pt-BR')
    expect(normalizeLocale('zh-TW')).toBe('zh-CN')
    expect(normalizeLocale('ko-KR')).toBe('ko')
    expect(normalizeLocale('auto')).toBeNull()
    expect(normalizeLocale('sv-SE')).toBeNull()

    ;(globalThis as Record<string, unknown>).chrome = {
      i18n: { getUILanguage: () => 'ja-JP' },
    }
    expect(detectBrowserLocale()).toBe('ja')
    expect(detectLocale()).toBe('ja')
  })

  it('hot-swaps active locale when chrome.storage.local changes without page reload', () => {
    let listener: ((changes: Record<string, { newValue?: unknown }>, area: string) => void) | null =
      null
    ;(globalThis as Record<string, unknown>).chrome = {
      i18n: { getUILanguage: () => 'en-US' },
      storage: {
        local: {
          get: (_key: string, cb: (items: Record<string, unknown>) => void) => cb({}),
        },
        onChanged: {
          addListener: (fn: typeof listener) => {
            listener = fn
          },
        },
      },
    }

    const seen: string[] = []
    initLocaleSync((loc) => seen.push(loc))
    expect(i18n.locale).toBe('en')

    listener?.({ [LOCALE_STORAGE_KEY]: { newValue: 'fr' } }, 'local')
    expect(i18n.locale).toBe('fr')
    expect(seen).toEqual(['fr'])

    listener?.({ [LOCALE_STORAGE_KEY]: { newValue: undefined } }, 'local')
    expect(i18n.locale).toBe('en')
    expect(seen).toEqual(['fr', 'en'])
  })
})
