import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { createPackageTags } from './create-package-tags.mjs';
import {
  removeRepositories,
  fixtureVersions,
  publishedCommit,
  createPackageGraph,
  createArtifacts,
  writeFile,
  writeJson,
  runGit,
} from './fixtures/repository.mjs';
import { tagState } from './fixtures/tag-state.mjs';
import { publishPackageReleases } from './publish-package-releases.mjs';

afterEach(removeRepositories);

describe('ordered publishing', () => {
  it.each(['reordered', 'duplicate'])(
    'rejects a %s publication selection before registry calls',
    (kind) => {
      const { root, packages } = createPackageGraph();
      createArtifacts(root, packages);
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
    createArtifacts(root, packages);
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
    createArtifacts(root, packages);
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
    createArtifacts(root, packages);
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
    createArtifacts(root, packages);
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
      createArtifacts(root, packages);
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
