import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    index: 'src/index.ts',
  },
  deps: {
    neverBundle: ['@fast-link/core', 'react'],
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
