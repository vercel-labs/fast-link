import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          environmentOptions: {
            jsdom: {
              url: 'https://example.com/',
            },
          },
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.browser.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'browser',
          globals: true,
          include: ['src/**/*.browser.test.{ts,tsx}'],
          fileParallelism: false,
          retry: 0,
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
              { browser: 'firefox' },
              { browser: 'webkit' },
            ],
          },
        },
      },
    ],
  },
});
