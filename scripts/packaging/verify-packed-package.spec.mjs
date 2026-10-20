import { verifyPackedPackage } from './verify-packed-package.mjs';

describe('packed package verification', () => {
  it('accepts dependency maps regardless of key order', () => {
    const expected = {
      ...packageManifest,
      dependencies: {
        '@fast-link/core': '^1.2.3',
        '@fast-link/react': '^1.2.3',
      },
    };
    const packed = {
      ...expected,
      dependencies: {
        '@fast-link/react': '^1.2.3',
        '@fast-link/core': '^1.2.3',
      },
    };
    expect(verifyPackedPackage(packed, expected)).toBe('@fast-link/core@1.2.3');
  });

  it('rejects unresolved workspace ranges', () => {
    const expected = {
      ...packageManifest,
      dependencies: { '@fast-link/react': 'workspace:^' },
    };
    const options = {
      workspace: [{ name: '@fast-link/react', version: '1.2.3' }],
    };
    expect(() => verifyPackedPackage(expected, expected, options)).toThrow(
      'Packed dependencies',
    );
  });
});

const packageManifest = {
  name: '@fast-link/core',
  version: '1.2.3',
  type: 'module',
  files: ['dist', 'CHANGELOG.md', 'LICENSE', 'README.md'],
  exports: { '.': './dist/index.js' },
  scripts: { build: 'tsdown' },
};
