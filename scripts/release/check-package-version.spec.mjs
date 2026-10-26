import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkPackageVersions } from './check-package-version.mjs';
import {
  removeRepositories,
  fixtureVersions,
  packageManifest,
  createRepository,
  createPackageGraph,
  writeFile,
  writeJson,
  runGit,
} from './fixtures/repository.mjs';

afterEach(removeRepositories);

describe('package release intent', () => {
  it('requires dependent bumps when pnpm changes their published workspace ranges', () => {
    const { root } = createPackageGraph();
    const base = runGit(root, 'rev-parse', 'HEAD');
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: fixtureVersions.later,
    });
    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.4\n\n- Updated.\n',
    );
    expect(() => checkPackageVersions({ base, root })).toThrow(
      '@fast-link/react changed without a version bump',
    );
    expect(() => checkPackageVersions({ base, root })).toThrow(
      '@fast-link/next changed without a version bump',
    );
  });

  it.each([
    '# Changelog\n',
    '# Changelog\n\n## 1.2.4\n\n',
    '# Changelog\n\n## 1.2.5\n\n- Future.\n\n## 1.2.4\n\n- Buried.\n',
  ])(
    'rejects a bump without nonempty notes in the top section: %j',
    (changelog) => {
      const { root, base } = createRepository();
      writeJson(join(root, 'packages/core/package.json'), {
        ...packageManifest,
        version: fixtureVersions.later,
      });
      writeFile(join(root, 'packages/core/CHANGELOG.md'), changelog);
      expect(() => checkPackageVersions({ base, root })).toThrow(
        'Missing changelog notes',
      );
    },
  );
  it('accepts an initial version when an existing package enters the allowlist', () => {
    const { root, base } = createRepository({ publishablePackages: [] });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: fixtureVersions.earlier,
    });

    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.2\n\n- Initial.\n',
    );
    expect(checkPackageVersions({ base, root })).toEqual([
      `Package release requested for @fast-link/core: new package at ${fixtureVersions.earlier}.`,
    ]);
  });

  it('rejects a decreasing version for an already publishable package', () => {
    const { root, base } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: fixtureVersions.earlier,
    });

    expect(() => checkPackageVersions({ base, root })).toThrow(
      `version must increase: ${fixtureVersions.current} -> ${fixtureVersions.earlier}`,
    );
  });

  it('rejects source changes without a version bump', () => {
    const { root, base } = createRepository();
    writeFileSync(
      join(root, 'packages/core/src/index.ts'),
      'export const value = 2;\n',
    );

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'changed without a version bump',
    );
  });

  it('accepts source changes with an increasing version', () => {
    const { root, base } = createRepository();
    writeFileSync(
      join(root, 'packages/core/src/index.ts'),
      'export const value = 2;\n',
    );
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: fixtureVersions.later,
    });

    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.4\n\n- Updated source.\n',
    );
    expect(checkPackageVersions({ base, root })).toEqual([
      `Package release requested for @fast-link/core: ${fixtureVersions.current} -> ${fixtureVersions.later}.`,
    ]);
  });

  it('rejects an npm package name change without a version bump', () => {
    const { root, base } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      name: '@fast-link/renamed',
    });

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'changed without a version bump',
    );
  });

  it('rejects changed source when a package moves without a version bump', () => {
    const { root, base } = createRepository();
    renameSync(join(root, 'packages/core'), join(root, 'packages/runtime'));
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/runtime',
    ]);
    writeFileSync(
      join(root, 'packages/runtime/src/index.ts'),
      'export const value = 2;\n',
    );
    runGit(root, 'add', '-A');

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'changed without a version bump',
    );
  });

  it.each([
    'src/index.spec.ts',
    'src/controller/index.test.ts',
    'src/testing/index.tsx',
    'src/testing/setup.ts',
  ])('does not require a release for test-only changes: %s', (path) => {
    const { root, base } = createRepository();
    writeFile(
      join(root, 'packages/core', path),
      'export const testOnly = true;\n',
    );
    runGit(root, 'add', '.');

    expect(checkPackageVersions({ base, root })).toEqual([
      'No package release required for @fast-link/core.',
    ]);
  });

  it('requires a release for test support included in published files', () => {
    const { root } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      files: [...packageManifest.files, 'src/testing'],
    });
    const helper = join(root, 'packages/core/src/testing/index.ts');
    writeFile(helper, 'export const helper = 1;\n');
    runGit(root, 'add', '.');
    runGit(root, 'commit', '--quiet', '-m', 'publish test support');
    const base = runGit(root, 'rev-parse', 'HEAD');
    writeFile(helper, 'export const helper = 2;\n');

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'changed without a version bump',
    );
  });

  it('rejects published README changes without a version bump', () => {
    const { root, base } = createRepository();
    writeFileSync(join(root, 'packages/core/README.md'), '# Updated docs\n');

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'changed without a version bump',
    );
  });
});
