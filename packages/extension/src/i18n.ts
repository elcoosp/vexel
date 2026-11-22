import { i18n } from '@lingui/core'
import { messages as enMessages } from './locales/en/messages.po'
import { messages as frMessages } from './locales/fr/messages.po'
import { messages as esMessages } from './locales/es/messages.po'
import { messages as deMessages } from './locales/de/messages.po'
import { messages as ptBRMessages } from './locales/pt-BR/messages.po'
import { messages as jaMessages } from './locales/ja/messages.po'
import { messages as zhCNMessages } from './locales/zh-CN/messages.po'
import { messages as koMessages } from './locales/ko/messages.po'

export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'pt-BR', 'ja', 'zh-CN', 'ko'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const LOCALE_STORAGE_KEY = 'vexel:locale'

i18n.load({
  en: enMessages,
  fr: frMessages,
  es: esMessages,
  de: deMessages,
  'pt-BR': ptBRMessages,
  ja: jaMessages,
  'zh-CN': zhCNMessages,
  ko: koMessages,
})

export function normalizeLocale(raw: string | null | undefined): SupportedLocale | null {
  if (!raw || raw === 'auto') return null
  const l = raw.toLowerCase().replace('_', '-')
  if (l.startsWith('fr')) return 'fr'
  if (l.startsWith('es')) return 'es'
  if (l.startsWith('de')) return 'de'
  if (l.startsWith('pt')) return 'pt-BR'
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('zh')) return 'zh-CN'
  if (l.startsWith('ko')) return 'ko'
  if (l.startsWith('en')) return 'en'
  return null
}

export function detectBrowserLocale(): SupportedLocale {
  const uiLang =
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'en'
  return normalizeLocale(uiLang) ?? 'en'
}

export function detectLocale(): SupportedLocale {
  try {
    const o = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null
    const normOverride = normalizeLocale(o)
    if (normOverride) return normOverride
  } catch {}
  return detectBrowserLocale()
}

export function setLocale(locale: SupportedLocale): void {
  if (i18n.locale !== locale) {
    i18n.activate(locale)
  }
}

export function initLocaleSync(onChange?: (locale: SupportedLocale) => void): void {
  const applyOverride = (raw: unknown) => {
    const norm = typeof raw === 'string' ? normalizeLocale(raw) : null
    try {
      if (typeof localStorage !== 'undefined') {
        if (norm) localStorage.setItem(LOCALE_STORAGE_KEY, norm)
        else localStorage.removeItem(LOCALE_STORAGE_KEY)
      }
    } catch {}
    const resolved = norm ?? detectBrowserLocale()
    setLocale(resolved)
    onChange?.(resolved)
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      chrome.storage.local.get(LOCALE_STORAGE_KEY, (items) => {
        if (items && LOCALE_STORAGE_KEY in items) {
          applyOverride(items[LOCALE_STORAGE_KEY])
        }
      })
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[LOCALE_STORAGE_KEY]) {
          applyOverride(changes[LOCALE_STORAGE_KEY].newValue)
        }
      })
    }
  } catch {}
}

setLocale(detectLocale())
export { i18n }
