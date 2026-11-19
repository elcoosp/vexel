import { i18n } from '@lingui/core'
import { messages as enMessages } from './locales/en/messages.po'
import { messages as frMessages } from './locales/fr/messages.po'
import { messages as esMessages } from './locales/es/messages.po'
import { messages as deMessages } from './locales/de/messages.po'
export type SupportedLocale = 'en' | 'fr' | 'es' | 'de'
i18n.load({ en: enMessages, fr: frMessages, es: esMessages, de: deMessages })
export function detectLocale(): SupportedLocale {
  try {
    const o = typeof localStorage !== 'undefined' ? localStorage.getItem('vexel:locale') : null
    if (o === 'fr' || o === 'es' || o === 'de' || o === 'en') return o
  } catch {}
  const l = ((typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || (typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase()
  if (l.startsWith('fr')) return 'fr'
  if (l.startsWith('es')) return 'es'
  if (l.startsWith('de')) return 'de'
  return 'en'
}
export function setLocale(locale: SupportedLocale): void { i18n.activate(locale) }
setLocale(detectLocale())
export { i18n }
