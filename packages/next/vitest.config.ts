import { defineConfig } from 'vitest/config';

// @boundaries-ignore Shared test defaults, outside production package imports.
import { coverage, unit } from '../../vitest.shared.ts';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    coverage,
    projects: [
      {
        test: {
          ...unit,
          setupFiles: ['src/testing/setup.ts'],
        },
      },
    ],
  },
});
