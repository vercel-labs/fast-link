import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readPublishablePackages } from '../publishable-packages.mjs';

export const fixtureVersions = {
  earlier: '1.2.2',
  current: '1.2.3',
  later: '1.2.4',
};
export const publishedCommit = 'a'.repeat(40);

export const packageManifest = {
  name: '@fast-link/core',
  version: fixtureVersions.current,
  type: 'module',
  files: ['dist', 'CHANGELOG.md', 'LICENSE', 'README.md'],
  exports: { '.': './dist/index.js' },
  scripts: { build: 'tsdown' },
};

const fixtures = [];

/** Removes all repositories created by this fixture module. */
export function removeRepositories() {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
}

/** Commits a minimal package repository and tracks it for teardown. */
export function createRepository({
  publishablePackages = ['packages/core'],
} = {}) {
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

/** Creates a dependency graph with its publication allowlist in reverse order. */
export function createPackageGraph() {
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
  return { root, packages };
}

/** Writes package archives and digests matching the release handoff format. */
export function createArtifacts(root, packages, commit = publishedCommit) {
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

/** Creates parent directories before writing fixture content. */
export function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export function writeJson(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function runGit(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
