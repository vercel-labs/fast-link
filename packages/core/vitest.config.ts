import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**'],
      reporter: ['text', 'json-summary'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          environmentOptions: { jsdom: { url: 'https://example.com/' } },
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
