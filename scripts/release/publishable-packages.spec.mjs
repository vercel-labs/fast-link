import { join } from 'node:path';

import {
  removeRepositories,
  packageManifest,
  createRepository,
  createPackageGraph,
  writeJson,
} from './fixtures/repository.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';

afterEach(removeRepositories);

describe('publishable packages', () => {
  it.each([
    ['private package', { private: true }, 'must not be private'],
    [
      'invalid name',
      { name: 'Not A Package' },
      'valid npm name and canonical stable version',
    ],
    ['builtin name', { name: 'http' }, 'valid npm name'],
    [
      'invalid version',
      { version: '1.02.3' },
      'valid npm name and canonical stable version',
    ],
    [
      'foreign registry',
      { publishConfig: { registry: 'https://example.com' } },
      'must publish to npmjs.org',
    ],
  ])('rejects a %s', (_, fields, message) => {
    const { root } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      ...fields,
    });
    expect(() => readPublishablePackages(root)).toThrow(message);
  });

  it.each([
    ['non-array declaration', {}, 'must be an array'],
    ['directory outside packages', ['../core'], 'Invalid package directory'],
    [
      'duplicate directory',
      ['packages/core', 'packages/core'],
      'Duplicate package directory',
    ],
  ])('rejects a %s', (_, declaration, message) => {
    const { root } = createRepository();
    writeJson(join(root, 'scripts/publishable-packages.json'), declaration);
    expect(() => readPublishablePackages(root)).toThrow(message);
  });

  it('rejects duplicate npm names across directories', () => {
    const { root } = createPackageGraph();
    writeJson(join(root, 'packages/react/package.json'), packageManifest);
    expect(() => readPublishablePackages(root)).toThrow(
      'Duplicate npm package name',
    );
  });

  it.each(['1.2.3+build.1', '1.2.4-beta.1'])(
    'rejects noncanonical stable release versions: %s',
    (version) => {
      const { root } = createRepository();
      writeJson(join(root, 'packages/core/package.json'), {
        ...packageManifest,
        version,
      });
      expect(() => readPublishablePackages(root)).toThrow('stable version');
    },
  );

  it('publishes nothing while the allowlist is empty', () => {
    const { root } = createRepository({ publishablePackages: [] });

    expect(readPublishablePackages(root)).toEqual([]);
  });

  it('orders dependencies before dependents regardless of allowlist order', () => {
    const { packages } = createPackageGraph();

    expect(packages.map(({ directory }) => directory)).toEqual([
      'packages/core',
      'packages/react',
      'packages/next',
    ]);
  });

  it('rejects a dependency cycle before publishing can start', () => {
    const { root } = createPackageGraph();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      dependencies: { '@fast-link/next': 'workspace:^' },
    });

    expect(() => readPublishablePackages(root)).toThrow(
      'Cyclic publish dependencies',
    );
  });
});
