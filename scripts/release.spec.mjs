/*
 * Tests release eligibility, version requirements, workflow safeguards, and
 * dependency-ordered publishing using temporary repositories and mocked commands.
 * This exercises release failures without publishing packages to npm.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { checkPackageVersions } from './check-package-version.mjs';
import { createPackageTags } from './create-package-tags.mjs';
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

describe('ordered publishing', () => {
  it.each(['reordered', 'duplicate'])(
    'rejects a %s publication selection before registry calls',
    (kind) => {
      const { root, packages } = createPackageGraph();
      const selection =
        kind === 'reordered'
          ? packages.toReversed()
          : [packages[0], packages[0]];
      expect(() =>
        publishPackageReleases(selection, {
          archiveDirectory: root,
          root,
          commit: publishedCommit,
          readPublishedVersions() {
            throw new Error('Unexpected registry call');
          },
          execute: recordingExecutor([]),
        }),
      ).toThrow('Publication package order or membership changed');
    },
  );

  it('checks every pending changelog before publishing any package', () => {
    const { root, packages } = createPackageGraph();
    writeFile(
      join(root, 'packages/next/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.2\n\n- Old.\n',
    );
    const events = [];
    expect(() =>
      publishPackageReleases(packages, {
        archiveDirectory: root,
        root,
        commit: publishedCommit,
        readPublishedVersions: () => null,
        execute: recordingExecutor(events),
      }),
    ).toThrow('Missing changelog notes');
    expect(events.filter((event) => event.startsWith('publish:'))).toEqual([]);
  });
  it('refuses a missing verified archive before any registry or npm call', () => {
    const { root, packages } = createPackageGraph();
    rmSync(join(root, 'core.tgz'));
    const events = [];
    expect(() =>
      publishPackageReleases(packages, {
        archiveDirectory: root,
        root,
        commit: publishedCommit,
        readPublishedVersions() {
          events.push('registry');
          return null;
        },
        execute: recordingExecutor(events),
      }),
    ).toThrow();
    expect(
      events.filter(
        (event) => event === 'registry' || event.startsWith('publish:'),
      ),
    ).toEqual([]);
  });

  it('rechecks each version and finishes dependencies before their dependents', () => {
    const { root, packages } = createPackageGraph();
    const events = [];
    const commands = [];
    const execute = recordingExecutor(events, { commands });
    const archiveBytes = ['core', 'react', 'next'].map((name) =>
      readFileSync(join(root, `${name}.tgz`)),
    );
    const publishedBytes = [];

    const published = publishPackageReleases(packages, {
      archiveDirectory: root,
      root,
      commit: publishedCommit,
      readPublishedVersions(name) {
        events.push(`recheck:${name}`);
        return null;
      },
      execute(command, args) {
        if (command === 'npm') publishedBytes.push(readFileSync(args[1]));
        return execute(command, args);
      },
    });

    expect(published).toEqual([
      '@fast-link/core@1.2.3',
      '@fast-link/react@1.2.3',
      '@fast-link/next@1.2.3',
    ]);
    expect(events).toEqual([
      'verify:core.tgz',
      'verify:react.tgz',
      'verify:next.tgz',
      'recheck:@fast-link/core',
      'recheck:@fast-link/react',
      'recheck:@fast-link/next',
      'recheck:@fast-link/core',
      'publish:core.tgz',
      'recheck:@fast-link/react',
      'publish:react.tgz',
      'recheck:@fast-link/next',
      'publish:next.tgz',
    ]);
    expect(commands.filter(({ command }) => command === 'npm')).toEqual(
      ['core', 'react', 'next'].map((name) => ({
        command: 'npm',
        args: [
          'publish',
          join(root, `${name}.tgz`),
          '--access',
          'public',
          '--provenance',
          '--ignore-scripts',
          '--registry=https://registry.npmjs.org',
          '--@fast-link:registry=https://registry.npmjs.org',
        ],
      })),
    );
    expect(publishedBytes).toEqual(archiveBytes);
    expect(
      ['core', 'react', 'next'].map((name) =>
        readFileSync(join(root, `${name}.tgz`)),
      ),
    ).toEqual(archiveBytes);
  });

  it('skips a version published since initial detection', () => {
    const { root, packages } = createPackageGraph();
    const events = [];
    const published = publishPackageReleases(packages, {
      archiveDirectory: root,
      root,
      commit: publishedCommit,
      readPublishedVersions: () => [fixtureVersions.current],
      execute: recordingExecutor(events),
    });

    expect(published).toEqual([]);
    expect(events.filter((event) => event.startsWith('publish:'))).toEqual([]);
  });

  it('recovers a successful dependency after a later npm publish fails without republishing it', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    createArtifacts(root, packages, commit);
    const versions = new Map();
    const events = [];
    const attempts = [];
    const execute = recordingExecutor(events);
    let fail = true;
    const options = {
      archiveDirectory: root,
      root,
      commit,
      readPublishedVersions: (name) => versions.get(name) ?? null,
      execute(command, args) {
        if (command === 'npm') {
          const entry = packages.find(({ directory }) =>
            args[1].endsWith(`${directory.split('/').at(-1)}.tgz`),
          );
          attempts.push(entry.manifest.name);
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
    expect(attempts).toEqual(['@fast-link/core', '@fast-link/react']);
    const state = tagState(root, commit);
    state.options.readPublishedVersions = options.readPublishedVersions;
    createPackageTags(packages, state.options);
    expect([...state.tags.keys()]).toEqual(['refs/tags/@fast-link/core@1.2.3']);
    fail = false;
    expect(publishPackageReleases(packages, options)).toEqual([
      '@fast-link/react@1.2.3',
      '@fast-link/next@1.2.3',
    ]);
    createPackageTags(packages, state.options);
    expect(events.filter((event) => event === 'publish:core.tgz')).toHaveLength(
      1,
    );
    expect(state.tags.size).toBe(3);
  });

  it.each([
    [
      'commit',
      (metadata) => {
        metadata.commit = 'b'.repeat(40);
      },
      'Artifact commit mismatch',
    ],
    [
      'identity',
      (metadata) => {
        metadata.packages[0].name = '@fast-link/other';
      },
      'Artifact identity mismatch',
    ],
    [
      'digest',
      (metadata) => {
        metadata.packages[0].sha256 = '0'.repeat(64);
      },
      'Artifact digest mismatch',
    ],
    [
      'order',
      (metadata) => {
        metadata.packages.reverse();
      },
      'Artifact package order',
    ],
    [
      'membership',
      (metadata) => {
        metadata.packages.pop();
      },
      'Artifact package order',
    ],
  ])(
    'rejects changed artifact %s before registry access',
    (_, mutate, message) => {
      const { root, packages } = createPackageGraph();
      const path = join(root, 'release-artifacts.json');
      const metadata = JSON.parse(readFileSync(path, 'utf8'));
      mutate(metadata);
      writeJson(path, metadata);
      const events = [];
      expect(() =>
        publishPackageReleases(packages, {
          archiveDirectory: root,
          root,
          commit: publishedCommit,
          readPublishedVersions() {
            events.push('registry');
            return null;
          },
          execute: recordingExecutor(events),
        }),
      ).toThrow(message);
      expect(events).not.toContain('registry');
      expect(events.some((event) => event.startsWith('publish:'))).toBe(false);
    },
  );

  it.each(['commit', 'identity'])(
    'rejects an archive with the wrong %s even when its digest matches',
    (field) => {
      const { root, packages } = createPackageGraph();
      createArtifacts(
        root,
        field === 'identity'
          ? packages.map((entry) => ({
              ...entry,
              manifest: { ...entry.manifest, version: '1.2.4' },
            }))
          : packages,
        'b'.repeat(40),
      );
      const path = join(root, 'release-artifacts.json');
      const metadata = JSON.parse(readFileSync(path, 'utf8'));
      metadata.commit = publishedCommit;
      for (const entry of metadata.packages) entry.version = '1.2.3';
      writeJson(path, metadata);
      const events = [];
      expect(() =>
        publishPackageReleases(packages, {
          archiveDirectory: root,
          root,
          commit: publishedCommit,
          readPublishedVersions() {
            events.push('registry');
            return null;
          },
          execute: recordingExecutor(events),
        }),
      ).toThrow(
        field === 'commit' ? 'Packed commit changed' : 'Packed package changed',
      );
      expect(events).not.toContain('registry');
    },
  );
});

describe('GitHub package tags', () => {
  it('tags the published commit rather than current HEAD', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.3\n\n- Unpublished edits.\n',
    );
    runGit(root, 'add', '.');
    runGit(root, 'commit', '--quiet', '-m', 'later changelog edits');
    const state = tagState(root, commit);

    createPackageTags(packages.slice(0, 1), state.options);

    expect(state.writes).toEqual([
      {
        endpoint: 'repos/example/fast-link/git/refs',
        fields: { ref: 'refs/tags/@fast-link/core@1.2.3', sha: commit },
      },
    ]);
  });

  it('leaves matching tags unchanged on repeat runs', () => {
    const { root, packages } = createPackageGraph();
    const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
    createPackageTags(packages, state.options);
    state.writes.length = 0;
    createPackageTags(packages, state.options);
    expect(state.writes).toEqual([]);
  });

  it('accepts an annotated tag at the published commit', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    const tag = '@fast-link/core@1.2.3';
    runGit(
      root,
      '-c',
      'tag.gpgsign=false',
      'tag',
      '-a',
      tag,
      '-m',
      'Existing release tag',
    );
    const tagObject = runGit(root, 'rev-parse', tag);
    const state = tagState(root, commit);
    state.tags.set(`refs/tags/${tag}`, { type: 'tag', sha: tagObject });
    state.tagObjects.set(tagObject, {
      type: 'commit',
      sha: runGit(root, 'rev-parse', `${tag}^{commit}`),
    });

    createPackageTags(packages.slice(0, 1), state.options);

    expect(state.writes).toEqual([]);
    expect(state.tags.get(`refs/tags/${tag}`)).toEqual({
      type: 'tag',
      sha: tagObject,
    });
  });

  it.each([
    ['lightweight', 'commit'],
    ['annotated', 'tag'],
  ])(
    'rejects an existing %s tag at a different commit without moving it',
    (_, type) => {
      const { root, packages } = createPackageGraph();
      const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
      state.tags.set('refs/tags/@fast-link/core@1.2.3', {
        type,
        sha: publishedCommit,
      });
      state.tagObjects.set(publishedCommit, {
        type: 'commit',
        sha: publishedCommit,
      });
      expect(() =>
        createPackageTags(packages.slice(0, 1), state.options),
      ).toThrow('Tag @fast-link/core@1.2.3 does not target');
      expect(state.writes).toEqual([]);
    },
  );

  it('creates other package tags when one fails, then recovers it', () => {
    const { root, packages } = createPackageGraph();
    const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
    const execute = state.options.execute;
    let fail = true;
    state.options.execute = (command, args) => {
      if (
        fail &&
        command === 'gh' &&
        args.includes('POST') &&
        args.includes('ref=refs/tags/@fast-link/core@1.2.3')
      )
        throw new Error('GitHub unavailable');
      return execute(command, args);
    };
    expect(() => createPackageTags(packages, state.options)).toThrow(
      'GitHub unavailable',
    );
    expect([...state.tags.keys()]).toEqual([
      'refs/tags/@fast-link/react@1.2.3',
      'refs/tags/@fast-link/next@1.2.3',
    ]);
    fail = false;
    state.writes.length = 0;
    createPackageTags(packages, state.options);
    expect(state.writes.map((write) => write.fields.ref)).toEqual([
      'refs/tags/@fast-link/core@1.2.3',
    ]);
  });

  it.each(['', 'null', '"main"', '"abc123"'])(
    'refuses GitHub writes without an exact published commit: %s',
    (gitHead) => {
      const { root, packages } = createPackageGraph();
      const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
      const execute = state.options.execute;
      state.options.execute = (command, args) =>
        command === 'npm' ? gitHead : execute(command, args);
      expect(() => createPackageTags(packages, state.options)).toThrow(
        'Missing published commit',
      );
      expect(state.writes).toEqual([]);
    },
  );
});

describe('release workflow', () => {
  it.each(['ci', 'release'])(
    'verifies one artifact set across the %s consumer matrix',
    (name) => {
      const { jobs } = parse(
        readFileSync(
          new URL(`../.github/workflows/${name}.yml`, import.meta.url),
          'utf8',
        ),
      );
      expect(jobs['packed-consumers'].needs).toContain('validate');
      expect(jobs['packed-consumers'].strategy.matrix.node).toEqual([
        22, 24, 26,
      ]);
      expect(
        jobs.validate.steps.filter((step) =>
          step.run?.includes('prepare-package-artifacts.mjs'),
        ),
      ).toHaveLength(1);
      expect(
        jobs['packed-consumers'].steps.some((step) =>
          step.uses?.startsWith('actions/download-artifact@'),
        ),
      ).toBe(true);
      expect(
        jobs['packed-consumers'].steps.some((step) =>
          /pnpm install|pnpm .*pack|turbo run build/.test(step.run ?? ''),
        ),
      ).toBe(false);
    },
  );

  it('keeps workspace installation and packing out of the OIDC job', () => {
    const { jobs } = parse(workflow);
    expect(jobs.publish.environment).toBe('release');
    expect(
      jobs.publish.steps.some((step) =>
        /pnpm install|prepare-package-artifacts|turbo run build/.test(
          step.run ?? '',
        ),
      ),
    ).toBe(false);
    expect(
      jobs.publish.steps.some((step) =>
        step.uses?.startsWith('pnpm/action-setup@'),
      ),
    ).toBe(false);
    expect(
      jobs.publish.steps.some((step) =>
        step.uses?.startsWith('actions/download-artifact@'),
      ),
    ).toBe(true);
  });

  it('runs tag recovery without pnpm setup or workspace installation', () => {
    const release = parse(workflow).jobs.release;
    expect(
      release.steps.some((step) => step.uses?.startsWith('pnpm/action-setup@')),
    ).toBe(false);
    expect(release.steps.some((step) => /pnpm/.test(step.run ?? ''))).toBe(
      false,
    );
    expect(
      release.steps.some((step) =>
        step.uses?.startsWith('actions/setup-node@'),
      ),
    ).toBe(true);
  });

  it('reruns CI when a pull request is retargeted to a different base', () => {
    const ci = parse(
      readFileSync(
        new URL('../.github/workflows/ci.yml', import.meta.url),
        'utf8',
      ),
    );
    // GitHub sends a base-branch retarget as pull_request.edited.
    expect(ci.on.pull_request.types).toContain('edited');
  });
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
      expect.arrayContaining([
        'detect',
        'validate',
        'browser',
        'packed-consumers',
      ]),
    );
  });

  it('separates npm publishing permissions from GitHub tag permissions', () => {
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
      'packed-consumers',
      'publish',
    ]);
    expect(
      jobs.release.steps.find(
        (step) => step.run === 'node scripts/create-package-tags.mjs',
      ).env.GH_TOKEN,
    ).toBe('${{ github.token }}');
    expect(jobs.release.steps[0].with['fetch-depth']).toBe(0);
  });

  it.each([
    ['after successful publication', {}, true],
    ['after failed publication', { publish: 'failure' }, true],
    ['after skipped publication', { publish: 'skipped' }, true],
    ['with failed validation', { validate: 'failure' }, false],
    ['with failed browser checks', { browser: 'failure' }, false],
    ['with failed consumers', { consumers: 'failure' }, false],
    ['with failed detection', { detect: 'failure' }, false],
    ['without allowlisted packages', { allowlisted: 'false' }, false],
    ['off main', { ref: 'refs/heads/other' }, false],
    ['after cancellation', { cancelled: true }, false],
  ])('gates tag recovery %s', (_, overrides, expected) => {
    const state = {
      validate: 'success',
      browser: 'success',
      consumers: 'success',
      detect: 'success',
      publish: 'success',
      allowlisted: 'true',
      ref: 'refs/heads/main',
      cancelled: false,
      ...overrides,
    };
    const releaseCondition = parse(workflow).jobs.release.if.slice(3, -2);
    const evaluate = new Function(
      'github',
      'needs',
      'cancelled',
      `return ${releaseCondition}`,
    );
    const needs = {
      detect: {
        result: state.detect,
        outputs: { has_publishable_packages: state.allowlisted },
      },
      validate: { result: state.validate },
      browser: { result: state.browser },
      publish: { result: state.publish },
      'packed-consumers': { result: state.consumers },
    };
    expect(evaluate({ ref: state.ref }, needs, () => state.cancelled)).toBe(
      expected,
    );
  });

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
    createPackageTags([], options);
    for (const script of [
      'publish-package-releases.mjs',
      'create-package-tags.mjs',
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

    expect(output).toBe('has_packages=false\nhas_publishable_packages=false\n');
  });
});

describe('release detection', () => {
  it('imports without installed workspace dependencies', () => {
    const { root, env } = createIsolatedReleaseRepository();
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./scripts/detect-package-releases.mjs')",
      ],
      { cwd: root, env, encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
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
});

describe('release CLIs without workspace dependencies', () => {
  const scripts = ['publish-package-releases.mjs', 'create-package-tags.mjs'];
  it.each(scripts)(
    '%s makes no external calls with an empty allowlist',
    (script) => {
      const { root, env } = createIsolatedReleaseRepository();
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', script)],
        {
          cwd: root,
          env: { ...env, PATH: '', GITHUB_REPOSITORY: '' },
          encoding: 'utf8',
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    },
  );

  it.each(scripts)(
    '%s processes a populated selection in package order',
    (script) => {
      const { root, packages } = createPackageGraph();
      const { env } = createIsolatedReleaseRepository(root);
      const commit = runGit(root, 'rev-parse', 'HEAD');
      createArtifacts(root, packages, commit);
      const commands = stubReleaseServices(root, {
        commit,
        versions:
          script === 'create-package-tags.mjs' ? [fixtureVersions.current] : [],
      });
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', script), root],
        {
          cwd: root,
          env: {
            ...env,
            PATH: `${join(root, 'bin')}:${env.PATH}`,
            GITHUB_REPOSITORY: 'example/fast-link',
          },
          encoding: 'utf8',
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      const calls = commands();
      if (script === 'publish-package-releases.mjs') {
        expect(
          calls
            .filter(({ args }) => args[0] === 'publish')
            .map(({ args }) => args[1]),
        ).toEqual([
          join(root, 'core.tgz'),
          join(root, 'react.tgz'),
          join(root, 'next.tgz'),
        ]);
        expect(result.stdout).toBe(
          'Published @fast-link/core@1.2.3\nPublished @fast-link/react@1.2.3\nPublished @fast-link/next@1.2.3\n',
        );
      } else {
        expect(
          calls
            .filter(
              ({ command, args }) => command === 'gh' && args.includes('POST'),
            )
            .map(({ args }) => args.find((arg) => arg.startsWith('ref='))),
        ).toEqual([
          'ref=refs/tags/@fast-link/core@1.2.3',
          'ref=refs/tags/@fast-link/react@1.2.3',
          'ref=refs/tags/@fast-link/next@1.2.3',
        ]);
      }
    },
  );

  it.each([
    ['non-array', {}],
    ['duplicate', ['packages/core', 'packages/core']],
    ['unsupported', ['packages/runtime']],
  ])('rejects %s selections before external calls', (_, declaration) => {
    const { root, env } = createIsolatedReleaseRepository();
    writeJson(join(root, 'scripts/publishable-packages.json'), declaration);
    for (const script of scripts) {
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', script)],
        {
          cwd: root,
          env: { ...env, PATH: '' },
          encoding: 'utf8',
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid publication allowlist');
    }
  });
});

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
  const packages = readPublishablePackages(root);
  createArtifacts(root, packages);
  return { root, packages };
}

function tagState(root, commit) {
  const tags = new Map();
  const tagObjects = new Map();
  const writes = [];
  return {
    tags,
    tagObjects,
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
          if (endpoint !== 'repos/example/fast-link/git/refs')
            throw new Error(`Unexpected GitHub write: ${endpoint}`);
          const fields = Object.fromEntries(
            args
              .filter((_, index) => args[index - 1] === '-f')
              .map((value) => {
                const separator = value.indexOf('=');
                return [value.slice(0, separator), value.slice(separator + 1)];
              }),
          );
          writes.push({ endpoint, fields });
          tags.set(fields.ref, { type: 'commit', sha: fields.sha });
          return '{}';
        }
        if (endpoint.includes('/git/matching-refs/'))
          return JSON.stringify(
            [...tags].map(([ref, object]) => ({ ref, object })),
          );
        if (endpoint.includes('/git/tags/'))
          return JSON.stringify({
            object: tagObjects.get(endpoint.split('/').at(-1)),
          });
        throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
      },
    },
  };
}

function createArtifacts(root, packages, commit = publishedCommit) {
  const entries = packages.map(({ directory, manifest }) => {
    writeJson(join(root, 'package/package.json'), {
      ...manifest,
      gitHead: commit,
      dependencies: Object.fromEntries(
        Object.keys(manifest.dependencies ?? {}).map((name) => [
          name,
          '^1.2.3',
        ]),
      ),
    });
    writeFile(join(root, 'package/dist/index.js'), 'export {};\n');
    const archive = join(root, `${directory.split('/').at(-1)}.tgz`);
    execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
    return {
      directory,
      name: manifest.name,
      version: manifest.version,
      sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    };
  });
  writeJson(join(root, 'release-artifacts.json'), {
    commit,
    packages: entries,
  });
}

function recordingExecutor(events, { commands = [] } = {}) {
  return (command, args) => {
    commands.push({ command, args: [...args] });
    if (command === 'tar') {
      if (args[0] === '-xOf')
        events.push(`verify:${args[1].split('/').at(-1)}`);
      return execFileSync(command, args, { encoding: 'utf8' });
    }
    if (command !== 'npm' || args[0] !== 'publish')
      throw new Error(`Unexpected command: ${command}`);
    events.push(`publish:${args[1].split('/').at(-1)}`);
    return '';
  };
}

function createRepository({ publishablePackages = ['packages/core'] } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'fast-link-release-'));
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
  writeFile(
    join(root, 'packages/core/CHANGELOG.md'),
    '# Changelog\n\n## 1.2.3\n\n- Initial.\n',
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

function createIsolatedReleaseRepository(
  root = createRepository({ publishablePackages: [] }).root,
) {
  for (const script of readdirSync(new URL('.', import.meta.url))) {
    if (script.endsWith('.mjs')) {
      copyFileSync(
        new URL(script, import.meta.url),
        join(root, 'scripts', script),
      );
    }
  }
  for (let ancestor = root; ; ancestor = dirname(ancestor)) {
    expect(existsSync(join(ancestor, 'node_modules'))).toBe(false);
    if (dirname(ancestor) === ancestor) break;
  }
  return { root, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } };
}

function stubReleaseServices(root, { commit, versions }) {
  const log = join(root, 'commands.jsonl');
  writeFile(log, '');
  for (const command of ['npm', 'gh']) {
    const path = join(root, 'bin', command);
    writeFile(
      path,
      `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const command = ${JSON.stringify(command)};
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args }) + String.fromCharCode(10));
if (command === 'npm' && args[0] === 'view') {
  if (args[2] === 'versions') console.log(JSON.stringify(${JSON.stringify(versions)}));
  else if (args[2] === 'gitHead') console.log(JSON.stringify(${JSON.stringify(commit)}));
  else throw new Error('Unexpected npm view');
} else if (command === 'npm' && args[0] === 'publish') {
} else if (command === 'gh' && args[0] === 'api') {
  console.log(args.includes('POST') ? '{}' : '[]');
} else throw new Error('Unexpected service command');
`,
    );
    chmodSync(path, 0o755);
  }
  return () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
}

function writeJson(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runGit(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
