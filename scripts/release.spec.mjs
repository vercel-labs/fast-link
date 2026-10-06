import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkPackageVersions } from './check-package-version.mjs';
import { detectPackageReleases } from './detect-package-releases.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
});

describe('publishable packages', () => {
  it('publishes nothing while the allowlist is empty', () => {
    const { root } = createRepository({ publishablePackages: [] });

    expect(readPublishablePackages(root)).toEqual([]);
  });
});

describe('release workflow', () => {
  it('publishes only from main', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/release.yml', import.meta.url),
      'utf8',
    );

    expect(workflow).toContain(
      "github.ref == 'refs/heads/main' && needs.detect.outputs.has_packages == 'true'",
    );
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

    expect(output).toContain('packages=[]');
    expect(output).toContain('has_packages=false');
  });

  it('rejects an explicit package outside the allowlist', () => {
    const { root } = createRepository({ publishablePackages: [] });
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./detect-package-releases.mjs', import.meta.url),
        ),
        'packages/core',
      ],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Package is not declared: packages/core');
  });
});

describe('release detection', () => {
  it('returns only package versions missing from npm', () => {
    const packages = [
      {
        directory: 'packages/core',
        manifest: { name: '@fast-link/core', version: '0.0.1' },
      },
      {
        directory: 'packages/next',
        manifest: { name: '@fast-link/next', version: '0.0.1' },
      },
    ];

    const pending = detectPackageReleases(packages, (name) =>
      name === '@fast-link/core' ? ['0.0.1'] : null,
    );

    expect(pending.map(({ directory }) => directory)).toEqual([
      'packages/next',
    ]);
  });
});

describe('package release intent', () => {
  it('accepts an initial version when an existing package enters the allowlist', () => {
    const { root, base } = createRepository({ publishablePackages: [] });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: '0.0.1',
    });

    expect(checkPackageVersions({ base, root })).toEqual([
      'Package release requested for @fast-link/core: new package at 0.0.1.',
    ]);
  });

  it('rejects a decreasing version for an already publishable package', () => {
    const { root, base } = createRepository();
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: '0.0.1',
    });

    expect(() => checkPackageVersions({ base, root })).toThrow(
      'version must increase: 0.1.0 -> 0.0.1',
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
      version: '0.1.1',
    });

    expect(checkPackageVersions({ base, root })).toEqual([
      'Package release requested for @fast-link/core: 0.1.0 -> 0.1.1.',
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

describe('packed package verification', () => {
  it('accepts the rechecked name and version', () => {
    expect(
      verifyPackedPackage(
        { name: '@fast-link/core', version: '0.1.0' },
        { name: '@fast-link/core', version: '0.1.0' },
      ),
    ).toBe('@fast-link/core@0.1.0');
  });

  it('rejects a manifest changed by packing hooks', () => {
    expect(() =>
      verifyPackedPackage(
        { name: '@fast-link/core', version: '9.0.0' },
        { name: '@fast-link/core', version: '0.1.0' },
      ),
    ).toThrow('expected @fast-link/core@0.1.0');
  });
});

const packageManifest = {
  name: '@fast-link/core',
  version: '0.1.0',
  type: 'module',
  files: ['dist', 'CHANGELOG.md', 'LICENSE', 'README.md'],
  exports: { '.': './dist/index.js' },
  scripts: { build: 'tsdown' },
};

function createRepository({ publishablePackages = ['packages/core'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fast-link-release-'));
  fixtures.push(root);
  writeJson(
    join(root, 'scripts/publishable-packages.json'),
    publishablePackages,
  );
  writeJson(join(root, 'packages/core/package.json'), packageManifest);
  writeFile(
    join(root, 'packages/core/src/index.ts'),
    'export const value = 1;\n',
  );
  writeFile(join(root, 'packages/core/tsconfig.json'), '{}\n');
  writeFile(
    join(root, 'packages/core/tsdown.config.ts'),
    'export default {};\n',
  );
  writeFile(join(root, 'packages/core/README.md'), '# Initial docs\n');
  writeFile(join(root, 'tsconfig.base.json'), '{}\n');
  runGit(root, 'init', '--quiet');
  runGit(root, 'config', 'user.email', 'fast-link@example.com');
  runGit(root, 'config', 'user.name', 'Fast Link test');
  runGit(root, 'config', 'commit.gpgsign', 'false');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'base');
  return { root, base: runGit(root, 'rev-parse', 'HEAD') };
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeJson(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runGit(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
