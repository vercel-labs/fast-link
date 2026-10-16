/*
 * Tests release eligibility, version requirements, workflow safeguards, and
 * dependency-ordered publishing using temporary repositories and mocked commands.
 * This exercises release failures without publishing packages to npm.
 */

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
import { createPackageReleases } from './create-package-releases.mjs';
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
const publishedCommit = 'a'.repeat(40);

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
  it('records the published commit in the archive metadata', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    publishPackageReleases(packages.slice(0, 1), {
      archiveDirectory: root,
      commit,
      readPublishedVersions: () => null,
      execute(command, args) {
        if (command === 'pnpm' && args.includes('pack')) {
          writeJson(join(root, 'package/package.json'), packages[0].manifest);
          execFileSync('tar', [
            '-czf',
            join(root, 'core.tgz'),
            '-C',
            root,
            'package',
          ]);
        }
        if (command === 'tar')
          return execFileSync(command, args, { encoding: 'utf8' });
        return '';
      },
    });
    const packed = JSON.parse(
      execFileSync(
        'tar',
        ['-xOf', join(root, 'core.tgz'), 'package/package.json'],
        { encoding: 'utf8' },
      ),
    );
    expect(packed.gitHead).toBe(commit);
  });

  it('rechecks each version and finishes dependencies before their dependents', () => {
    const { packages } = createPackageGraph();
    const events = [];
    const commands = [];
    const execute = recordingExecutor(packages, events, { commands });

    const published = publishPackageReleases(packages, {
      archiveDirectory: tmpdir(),
      commit: publishedCommit,
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
      commit: publishedCommit,
      readPublishedVersions: () => [fixtureVersions.current],
      execute: recordingExecutor(packages, events),
    });

    expect(published).toEqual([]);
    expect(events).toEqual([]);
  });

  it('recovers a successful dependency after a later npm publish fails without republishing it', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    const versions = new Map();
    const events = [];
    const execute = recordingExecutor(packages, events);
    let fail = true;
    const options = {
      archiveDirectory: root,
      commit,
      readPublishedVersions: (name) => versions.get(name) ?? null,
      execute(command, args) {
        if (command === 'npm') {
          const entry = packages.find(({ directory }) =>
            args[1].endsWith(`${directory.split('/').at(-1)}.tgz`),
          );
          if (fail && entry.manifest.name === '@fast-link/react')
            throw new Error('npm unavailable');
          versions.set(entry.manifest.name, [entry.manifest.version]);
        }
        return execute(command, args);
      },
    };
    expect(() => publishPackageReleases(packages, options)).toThrow(
      'npm unavailable',
    );
    const state = releaseState(root, commit);
    state.options.readPublishedVersions = options.readPublishedVersions;
    createPackageReleases(packages, state.options);
    expect(state.releases.map((release) => release.tag_name)).toEqual([
      '@fast-link/core@1.2.3',
    ]);
    fail = false;
    expect(publishPackageReleases(packages, options)).toEqual([
      '@fast-link/react@1.2.3',
      '@fast-link/next@1.2.3',
    ]);
    createPackageReleases(packages, state.options);
    expect(events.filter((event) => event === 'publish:core.tgz')).toHaveLength(
      1,
    );
    expect(state.releases).toHaveLength(3);
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
          commit: publishedCommit,
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
        commit: publishedCommit,
        readPublishedVersions: () => null,
        execute: recordingExecutor(packages, events, { changedVersion: true }),
      }),
    ).toThrow('Packed package changed');
    expect(events).toEqual(['build:core', 'pack:core.tgz']);
  });
});

describe('GitHub package releases', () => {
  it('tags the published commit and uses only that version’s changelog notes', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.3\n\n- Unpublished edits.\n',
    );
    runGit(root, 'add', '.');
    runGit(root, 'commit', '--quiet', '-m', 'later changelog edits');
    const state = releaseState(root, commit);

    createPackageReleases(packages.slice(0, 1), state.options);

    expect(state.tags.get('refs/tags/@fast-link/core@1.2.3')).toEqual({
      type: 'commit',
      sha: commit,
    });
    expect(state.releases).toEqual([
      {
        tag_name: '@fast-link/core@1.2.3',
        target_commitish: commit,
        name: '@fast-link/core@1.2.3',
        body: '- Initial core release.',
        make_latest: 'false',
      },
    ]);
  });

  it('leaves completed tags and Releases unchanged on repeat runs', () => {
    const { root, packages } = createPackageGraph();
    const state = releaseState(root, runGit(root, 'rev-parse', 'HEAD'));
    createPackageReleases(packages, state.options);
    state.writes.length = 0;
    createPackageReleases(packages, state.options);
    expect(state.writes).toEqual([]);
  });

  it('recovers a missing Release without recreating its existing tag', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    const state = releaseState(root, commit);
    state.tags.set('refs/tags/@fast-link/core@1.2.3', {
      type: 'commit',
      sha: commit,
    });
    createPackageReleases(packages.slice(0, 1), state.options);
    expect(state.writes.map((write) => write.endpoint)).toEqual([
      'repos/example/fast-link/releases',
    ]);
  });

  it('rejects an existing tag at a different commit without moving it', () => {
    const { root, packages } = createPackageGraph();
    const state = releaseState(root, runGit(root, 'rev-parse', 'HEAD'));
    state.tags.set('refs/tags/@fast-link/core@1.2.3', {
      type: 'commit',
      sha: publishedCommit,
    });
    expect(() =>
      createPackageReleases(packages.slice(0, 1), state.options),
    ).toThrow('Tag @fast-link/core@1.2.3 does not target');
    expect(state.writes).toEqual([]);
  });

  it('preserves other package Releases when one Release fails, then recovers it', () => {
    const { root, packages } = createPackageGraph();
    const state = releaseState(root, runGit(root, 'rev-parse', 'HEAD'));
    const execute = state.options.execute;
    let fail = true;
    state.options.execute = (command, args) => {
      if (
        fail &&
        command === 'gh' &&
        args.includes('POST') &&
        args.includes('tag_name=@fast-link/core@1.2.3')
      )
        throw new Error('GitHub unavailable');
      return execute(command, args);
    };
    expect(() => createPackageReleases(packages, state.options)).toThrow(
      'GitHub unavailable',
    );
    expect(state.releases.map((release) => release.tag_name)).toEqual([
      '@fast-link/react@1.2.3',
      '@fast-link/next@1.2.3',
    ]);
    fail = false;
    state.writes.length = 0;
    createPackageReleases(packages, state.options);
    expect(state.writes.map((write) => write.fields.tag_name)).toEqual([
      '@fast-link/core@1.2.3',
    ]);
  });

  it.each(['', 'null', '"main"', '"abc123"'])(
    'refuses GitHub writes without an exact published commit: %s',
    (gitHead) => {
      const { root, packages } = createPackageGraph();
      const state = releaseState(root, runGit(root, 'rev-parse', 'HEAD'));
      const execute = state.options.execute;
      state.options.execute = (command, args) =>
        command === 'npm' ? gitHead : execute(command, args);
      expect(() => createPackageReleases(packages, state.options)).toThrow(
        'Missing published commit',
      );
      expect(state.writes).toEqual([]);
    },
  );

  it('refuses GitHub writes when the published commit has no notes for the version', () => {
    const { root, packages } = createPackageGraph();
    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.2\n\n- Older release.\n',
    );
    runGit(root, 'add', '.');
    runGit(root, 'commit', '--quiet', '-m', 'missing release notes');
    const state = releaseState(root, runGit(root, 'rev-parse', 'HEAD'));
    expect(() =>
      createPackageReleases(packages.slice(0, 1), state.options),
    ).toThrow('Missing changelog notes');
    expect(state.writes).toEqual([]);
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

  it('separates npm publishing permissions from GitHub release permissions', () => {
    const { permissions, jobs } = parse(workflow);
    expect(permissions).toEqual({ contents: 'read' });
    expect(jobs.publish.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(jobs.release.permissions).toEqual({ contents: 'write' });
    expect(jobs.release.environment).toBe('release');
    expect(jobs.release.needs).toEqual([
      'detect',
      'validate',
      'browser',
      'publish',
    ]);
    expect(
      jobs.release.steps.find(
        (step) => step.run === 'node scripts/create-package-releases.mjs',
      ).env.GH_TOKEN,
    ).toBe('${{ github.token }}');
    expect(jobs.release.steps[0].with['fetch-depth']).toBe(0);
  });

  it.each([
    ['success', 'success', 'success', 'true', 'refs/heads/main', true],
    ['success', 'success', 'failure', 'true', 'refs/heads/main', true],
    ['success', 'success', 'skipped', 'true', 'refs/heads/main', true],
    ['failure', 'success', 'success', 'true', 'refs/heads/main', false],
    ['success', 'failure', 'success', 'true', 'refs/heads/main', false],
    ['success', 'success', 'skipped', 'false', 'refs/heads/main', false],
    ['success', 'success', 'success', 'true', 'refs/heads/other', false],
  ])(
    'gates Release recovery: validate=%s browser=%s publish=%s allowlisted=%s ref=%s',
    (validate, browser, publish, allowlisted, ref, expected) => {
      const releaseCondition = parse(workflow).jobs.release.if.slice(3, -2);
      const evaluate = new Function(
        'github',
        'needs',
        'cancelled',
        `return ${releaseCondition}`,
      );
      const needs = {
        detect: {
          result: 'success',
          outputs: { has_publishable_packages: allowlisted },
        },
        validate: { result: validate },
        browser: { result: browser },
        publish: { result: publish },
      };
      expect(evaluate({ ref }, needs, () => false)).toBe(expected);
      expect(evaluate({ ref }, needs, () => true)).toBe(false);
      expect(
        evaluate(
          { ref },
          { ...needs, detect: { ...needs.detect, result: 'failure' } },
          () => false,
        ),
      ).toBe(false);
    },
  );

  it('makes no external calls for an empty allowlist', () => {
    const packages = readPublishablePackages();
    expect(packages).toEqual([]);
    const unexpected = () => {
      throw new Error(
        `External call with ${packages.length} allowlisted packages`,
      );
    };
    const options = { readPublishedVersions: unexpected, execute: unexpected };
    expect(publishPackageReleases([], options)).toEqual([]);
    createPackageReleases([], options);
    for (const script of [
      'publish-package-releases.mjs',
      'create-package-releases.mjs',
    ]) {
      expect(
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL(script, import.meta.url))],
          {
            encoding: 'utf8',
            env: { PATH: '', RUNNER_TEMP: '', GITHUB_REPOSITORY: '' },
          },
        ),
      ).toBe('');
    }
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
    writeFile(
      join(root, `packages/${name}/CHANGELOG.md`),
      `# Changelog\n\n## 1.2.3\n\n- Initial ${name} release.\n\n## 1.2.2\n\n- Older release.\n`,
    );
  }
  writeJson(join(root, 'scripts/publishable-packages.json'), [
    'packages/next',
    'packages/react',
    'packages/core',
  ]);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'package graph');
  return { root, packages: readPublishablePackages(root) };
}

function releaseState(root, commit) {
  const tags = new Map();
  const releases = [];
  const writes = [];
  return {
    tags,
    releases,
    writes,
    options: {
      repository: 'example/fast-link',
      readPublishedVersions: () => [fixtureVersions.current],
      execute(command, args) {
        if (command === 'git')
          return execFileSync(command, args, { cwd: root, encoding: 'utf8' });
        if (command === 'npm') return JSON.stringify(commit);
        if (command !== 'gh') throw new Error(`Unexpected command: ${command}`);
        const endpoint = args.find((value) => value.startsWith('repos/'));
        if (args.includes('POST')) {
          const fields = Object.fromEntries(
            args
              .filter((_, index) => args[index - 1] === '-f')
              .map((value) => {
                const separator = value.indexOf('=');
                return [value.slice(0, separator), value.slice(separator + 1)];
              }),
          );
          writes.push({ endpoint, fields });
          if (endpoint.endsWith('/git/refs'))
            tags.set(fields.ref, { type: 'commit', sha: fields.sha });
          if (endpoint.endsWith('/releases')) releases.push(fields);
          return '{}';
        }
        if (endpoint.includes('/git/matching-refs/'))
          return JSON.stringify(
            [...tags].map(([ref, object]) => ({ ref, object })),
          );
        if (endpoint.endsWith('/releases')) return JSON.stringify([releases]);
        throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
      },
    },
  };
}

function recordingExecutor(
  packages,
  events,
  { failure, changedVersion, commands = [] } = {},
) {
  return (command, args) => {
    commands.push({ command, args: [...args] });
    if (command === 'tar' && args[0] !== '-xOf') {
      return execFileSync(command, args, { encoding: 'utf8' });
    }
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
    if (stage === 'pack') {
      const archive = args[args.indexOf('--out') + 1];
      const entry = packages.find(({ directory }) =>
        archive.endsWith(`${directory.split('/').at(-1)}.tgz`),
      );
      const root = mkdtempSync(join(tmpdir(), 'fast-link-archive-'));
      fixtures.push(root, archive);
      writeJson(join(root, 'package/package.json'), {
        ...entry.manifest,
        version: changedVersion
          ? fixtureVersions.later
          : entry.manifest.version,
      });
      execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
    }
    if (command === 'tar')
      return execFileSync(command, args, { encoding: 'utf8' });
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
