import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { createPackageTags } from './create-package-tags.mjs';
import {
  createIsolatedReleaseRepository,
  stubReleaseServices,
} from './fixtures/cli.mjs';
import {
  removeRepositories,
  fixtureVersions,
  createPackageGraph,
  createArtifacts,
  writeJson,
  runGit,
} from './fixtures/repository.mjs';
import { publishPackageReleases } from './publish-package-releases.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';

afterEach(removeRepositories);

describe('release CLIs without workspace dependencies', () => {
  const scripts = ['publish-package-releases.mjs', 'create-package-tags.mjs'];
  it.each(scripts)(
    '%s makes no external calls with an empty allowlist',
    (script) => {
      const { root, env } = createIsolatedReleaseRepository();
      const commands = stubReleaseServices(root);
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', 'release', script)],
        {
          cwd: root,
          env: {
            ...env,
            PATH: `${join(root, 'bin')}:${env.PATH}`,
            GITHUB_REPOSITORY: '',
          },
          encoding: 'utf8',
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(commands()).toEqual([]);
    },
  );

  it.each(scripts)(
    '%s processes only selected packages in dependency order',
    (script) => {
      const { root, packages } = createPackageGraph();
      const { env } = createIsolatedReleaseRepository(root);
      const commit = runGit(root, 'rev-parse', 'HEAD');
      writeJson(join(root, 'scripts/publishable-packages.json'), [
        'packages/react',
        'packages/core',
      ]);
      if (script === 'publish-package-releases.mjs') {
        createArtifacts(root, packages, commit);
      }
      const commands = stubReleaseServices(root, {
        commit,
        versions:
          script === 'create-package-tags.mjs' ? [fixtureVersions.current] : [],
      });
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', 'release', script), root],
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
        ).toEqual([join(root, 'core.tgz'), join(root, 'react.tgz')]);
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
    const commands = stubReleaseServices(root);
    for (const script of scripts) {
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts', 'release', script)],
        {
          cwd: root,
          env: { ...env, PATH: `${join(root, 'bin')}:${env.PATH}` },
          encoding: 'utf8',
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid publication allowlist');
      expect(commands()).toEqual([]);
    }
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
  });
});
