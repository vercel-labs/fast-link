import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectPackageReleases } from './detect-package-releases.mjs';
import {
  createIsolatedReleaseRepository,
  stubReleaseServices,
} from './fixtures/cli.mjs';
import {
  removeRepositories,
  fixtureVersions,
  packageManifest,
  createRepository,
  writeJson,
} from './fixtures/repository.mjs';

afterEach(removeRepositories);

describe('release detection', () => {
  it('imports without installed workspace dependencies', () => {
    const { root, env } = createIsolatedReleaseRepository();
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./scripts/release/detect-package-releases.mjs')",
      ],
      { cwd: root, env, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rejects private packages before registry access through the detection CLI', () => {
    const { root } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      private: true,
    });
    const commands = stubReleaseServices(root);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./detect-package-releases.mjs', import.meta.url),
        ),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not be private');
    expect(commands()).toEqual([]);
  });

  it('returns only package versions missing from npm', () => {
    const packages = [
      {
        directory: 'packages/core',
        manifest: { name: '@fast-link/core', version: fixtureVersions.current },
      },
      {
        directory: 'packages/next',
        manifest: { name: '@fast-link/next', version: fixtureVersions.current },
      },
    ];

    const pending = detectPackageReleases(packages, (name) =>
      name === '@fast-link/core' ? [fixtureVersions.current] : null,
    );

    expect(pending.map(({ directory }) => directory)).toEqual([
      'packages/next',
    ]);
  });
  it('reports no publish candidates while the allowlist is empty', () => {
    const { root } = createRepository({ publishablePackages: [] });
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./detect-package-releases.mjs', import.meta.url),
        ),
      ],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );

    expect(output).toBe('has_packages=false\nhas_publishable_packages=false\n');
  });
});
