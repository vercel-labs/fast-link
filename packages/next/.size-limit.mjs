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
  { ...shared, name: 'FastLink', import: '{ FastLink }', limit: '3.5 kB' },
  {
    ...shared,
    name: 'FastLinkRegion',
    import: '{ FastLinkRegion }',
    limit: '3.3 kB',
  },
];
