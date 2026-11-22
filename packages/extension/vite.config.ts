import { defineConfig } from 'vite'
import { resolve } from 'path'
import { lingui } from '@lingui/vite-plugin'

const isContentOnly = process.env.VITE_ENTRY === 'content'

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  build: {
    outDir: 'dist',
    emptyOutDir: !isContentOnly,
    rollupOptions: {
      input: isContentOnly
        ? { content: resolve(import.meta.dirname, 'src/content.ts') }
        : {
            background: resolve(import.meta.dirname, 'src/background.ts'),
            popup: resolve(import.meta.dirname, 'src/popup.ts'),
          },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
