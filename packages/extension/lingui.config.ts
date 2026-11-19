import { defineConfig } from '@lingui/cli'
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'fr', 'es', 'de', 'pt-BR', 'ja', 'zh-CN', 'ko'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}/messages', include: ['src'] }],
})
