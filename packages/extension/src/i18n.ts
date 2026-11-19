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

function normalizeLocale(raw: string | null | undefined): SupportedLocale | null {
  if (!raw) return null
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

export function detectLocale(): SupportedLocale {
  try {
    const o = typeof localStorage !== 'undefined' ? localStorage.getItem('vexel:locale') : null
    const normOverride = normalizeLocale(o)
    if (normOverride) return normOverride
  } catch {}
  const uiLang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || (typeof navigator !== 'undefined' && navigator.language) || 'en'
  return normalizeLocale(uiLang) ?? 'en'
}

export function setLocale(locale: SupportedLocale): void { i18n.activate(locale) }
setLocale(detectLocale())
export { i18n }
