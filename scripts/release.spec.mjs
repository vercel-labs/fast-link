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

import { parse } from 'yaml';

import { checkPackageVersions } from './check-package-version.mjs';
import { detectPackageReleases } from './detect-package-releases.mjs';
import { publishPackageReleases } from './publish-package-releases.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

const fixtures = [];
const fixtureVersions = {
  earlier: '1.2.2',
  current: '1.2.3',
  later: '1.2.4',
};

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
});

describe('publishable packages', () => {
  it.each([
    ['private package', { private: true }, 'must not be private'],
    ['invalid name', { name: 'Not A Package' }, 'valid npm name and version'],
    ['invalid version', { version: '1.02.3' }, 'valid npm name and version'],
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

describe('ordered publishing', () => {
  it('rechecks each version and finishes dependencies before their dependents', () => {
    const { packages } = createPackageGraph();
    const events = [];
    const commands = [];
    const execute = recordingExecutor(packages, events, { commands });

    const published = publishPackageReleases(packages, {
      archiveDirectory: tmpdir(),
      readPublishedVersions(name) {
        events.push(`recheck:${name}`);
        return null;
      },
      execute,
    });

    expect(published).toEqual([
      '@fast-link/core@1.2.3',
      '@fast-link/react@1.2.3',
      '@fast-link/next@1.2.3',
    ]);
    expect(events).toEqual([
      'recheck:@fast-link/core',
      'build:core',
      'pack:core.tgz',
      'verify:core.tgz',
      'publish:core.tgz',
      'recheck:@fast-link/react',
      'build:react',
      'pack:react.tgz',
      'verify:react.tgz',
      'publish:react.tgz',
      'recheck:@fast-link/next',
      'build:next',
      'pack:next.tgz',
      'verify:next.tgz',
      'publish:next.tgz',
    ]);
    expect(commands.filter(({ command }) => command === 'npm')).toEqual(
      ['core', 'react', 'next'].map((name) => ({
        command: 'npm',
        args: [
          'publish',
          join(tmpdir(), `${name}.tgz`),
          '--access',
          'public',
          '--provenance',
          '--registry=https://registry.npmjs.org',
          '--@fast-link:registry=https://registry.npmjs.org',
        ],
      })),
    );
  });

  it('skips a version published since initial detection', () => {
    const { packages } = createPackageGraph();
    const events = [];
    const published = publishPackageReleases(packages, {
      archiveDirectory: tmpdir(),
      readPublishedVersions: () => [fixtureVersions.current],
      execute: recordingExecutor(packages, events),
    });

    expect(published).toEqual([]);
    expect(events).toEqual([]);
  });

  it.each(['build', 'pack', 'publish'])(
    'does not attempt a dependent after %s fails',
    (failure) => {
      const { packages } = createPackageGraph();
      const events = [];
      const execute = recordingExecutor(packages, events, { failure });

      expect(() =>
        publishPackageReleases(packages, {
          archiveDirectory: tmpdir(),
          readPublishedVersions(name) {
            events.push(`recheck:${name}`);
            return null;
          },
          execute,
        }),
      ).toThrow(`${failure} failed`);
      expect(events).not.toContain('recheck:@fast-link/react');
      expect(events).not.toContain('publish:next.tgz');
    },
  );

  it('rejects a packed identity change before publishing any package', () => {
    const { packages } = createPackageGraph();
    const events = [];

    expect(() =>
      publishPackageReleases(packages, {
        archiveDirectory: tmpdir(),
        readPublishedVersions: () => null,
        execute: recordingExecutor(packages, events, { changedVersion: true }),
      }),
    ).toThrow('Packed package changed');
    expect(events).toEqual(['build:core', 'pack:core.tgz', 'verify:core.tgz']);
  });
});

describe('release workflow', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const condition =
    "github.ref == 'refs/heads/main' && needs.detect.outputs.has_packages == 'true'";
  it('requires main, publish candidates, and all prerequisite jobs', () => {
    const publish = parse(workflow).jobs.publish;
    expect(publish.if, 'publish condition').toBe(`\${{ ${condition} }}`);
    expect(publish.needs, 'publish dependencies').toEqual(
      expect.arrayContaining(['detect', 'validate', 'browser']),
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
});

describe('package release intent', () => {
  it('accepts an initial version when an existing package enters the allowlist', () => {
    const { root, base } = createRepository({ publishablePackages: [] });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    writeJson(join(root, 'packages/core/package.json'), {
      ...packageManifest,
      version: fixtureVersions.earlier,
    });

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

describe('packed package verification', () => {
  it('accepts the rechecked name and version', () => {
    expect(
      verifyPackedPackage(
        { name: '@fast-link/core', version: fixtureVersions.current },
        { name: '@fast-link/core', version: fixtureVersions.current },
      ),
    ).toBe(`@fast-link/core@${fixtureVersions.current}`);
  });

  it('rejects a manifest changed by packing hooks', () => {
    expect(() =>
      verifyPackedPackage(
        { name: '@fast-link/core', version: fixtureVersions.later },
        { name: '@fast-link/core', version: fixtureVersions.current },
      ),
    ).toThrow(`expected @fast-link/core@${fixtureVersions.current}`);
  });
});

const packageManifest = {
  name: '@fast-link/core',
  version: fixtureVersions.current,
  type: 'module',
  files: ['dist', 'CHANGELOG.md', 'LICENSE', 'README.md'],
  exports: { '.': './dist/index.js' },
  scripts: { build: 'tsdown' },
};

function createPackageGraph() {
  const { root } = createRepository();
  const dependencies = {
    core: {},
    react: { '@fast-link/core': 'workspace:^' },
    next: {
      '@fast-link/core': 'workspace:^',
      '@fast-link/react': 'workspace:^',
    },
  };
  for (const [name, packageDependencies] of Object.entries(dependencies)) {
    writeJson(join(root, `packages/${name}/package.json`), {
      ...packageManifest,
      name: `@fast-link/${name}`,
      dependencies: packageDependencies,
    });
  }
  writeJson(join(root, 'scripts/publishable-packages.json'), [
    'packages/next',
    'packages/react',
    'packages/core',
  ]);
  return { root, packages: readPublishablePackages(root) };
}

function recordingExecutor(
  packages,
  events,
  { failure, changedVersion, commands = [] } = {},
) {
  return (command, args) => {
    commands.push({ command, args: [...args] });
    const stage = args.includes('build')
      ? 'build'
      : args.includes('pack')
        ? 'pack'
        : args.includes('publish')
          ? 'publish'
          : 'verify';
    const target =
      stage === 'build'
        ? args.at(-1)
        : stage === 'pack'
          ? args[args.indexOf('--out') + 1]
          : args[1];
    events.push(`${stage}:${target.split('/').at(-1)}`);
    if (stage === failure) throw new Error(`${stage} failed`);
    if (command === 'tar') {
      const archive = args[1];
      const entry = packages.find(({ directory }) =>
        archive.endsWith(`${directory.split('/').at(-1)}.tgz`),
      );
      return JSON.stringify({
        ...entry.manifest,
        version: changedVersion
          ? fixtureVersions.later
          : entry.manifest.version,
      });
    }
    return '';
  };
}

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
