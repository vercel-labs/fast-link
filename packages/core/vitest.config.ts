import { defineConfig } from 'vitest/config';

// @boundaries-ignore Shared test defaults, outside production package imports.
import { coverage, unit } from '../../vitest.shared.ts';

export default defineConfig({
  test: {
    coverage,
    projects: [{ test: unit }],
  },
});
