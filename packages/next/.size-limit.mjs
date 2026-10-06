import { resolve } from 'node:path';

const coreSource = resolve(
  import.meta.dirname,
  '..',
  'core',
  'src',
  'index.ts',
);

const shared = {
  path: 'src/index.tsx',
  ignore: ['next', 'react'],
  limit: '3 kB',
  modifyEsbuildConfig(config) {
    return {
      ...config,
      alias: {
        ...config.alias,
        '@fast-link/core': coreSource,
      },
    };
  },
};

export default [
  { ...shared, name: 'FastLink', import: '{ FastLink }' },
  { ...shared, name: 'FastLinkRegion', import: '{ FastLinkRegion }' },
];
