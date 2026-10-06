import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['src/testing/setup.ts'],
          environmentOptions: {
            jsdom: { url: 'https://example.com/' },
          },
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
