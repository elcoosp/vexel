import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/bridge/test/**/*.test.{js,mjs,ts}',
            'packages/extension/test/unit/**/*.test.{js,mjs,ts}',
          ],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'node',
          setupFiles: ['packages/extension/test/setup-linkedom.ts'],
          include: ['packages/extension/test/dom/**/*.test.{js,mjs,ts}'],
        },
      },
    ],
  },
});
