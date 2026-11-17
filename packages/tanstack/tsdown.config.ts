import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    index: 'src/index.tsx',
  },
  deps: {
    neverBundle: [
      '@fast-link/core',
      '@fast-link/react',
      '@tanstack/react-router',
      'react',
    ],
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
