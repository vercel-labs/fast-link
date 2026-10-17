import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkPackageChangelog } from './changelog.mjs';
import { detectPackageReleases } from './detect-package-releases.mjs';
import { getPublishedVersions, NPM_REGISTRY_ARGS } from './npm-registry.mjs';
import { readWorkspaceManifests } from './package-dependencies.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

/**
 * Rechecks and publishes packages in the supplied dependency-first order.
 * A failed build, pack, verification, or publish stops subsequent packages.
 * Records the supplied 40-character lowercase commit SHA as the archive's gitHead.
 */
export function publishPackageReleases(
  packages,
  {
    archiveDirectory,
    commit,
    readPublishedVersions,
    execute,
    root = process.cwd(),
  },
) {
  if (packages.length === 0) return [];
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) {
    throw new Error('A full published commit SHA is required');
  }
  const workspace = readWorkspaceManifests(root);
  const pending = detectPackageReleases(packages, readPublishedVersions);
  for (const entry of pending) checkPackageChangelog(entry, root);
  const published = [];
  for (const entry of pending) {
    if (detectPackageReleases([entry], readPublishedVersions).length === 0)
      continue;

    const { directory, manifest } = entry;
    const archive = join(archiveDirectory, `${basename(directory)}.tgz`);
    execute('pnpm', [
      'exec',
      'turbo',
      'run',
      'build',
      `--filter=./${directory}`,
    ]);
    execute('pnpm', ['--dir', directory, 'pack', '--out', archive]);
    stampArchive(archive, archiveDirectory, commit, execute);
    const packed = JSON.parse(
      execute('tar', ['-xOf', archive, 'package/package.json']),
    );
    const files = execute('tar', ['-tf', archive]).split('\n');
    verifyPackedPackage(packed, manifest, { workspace, files });
    execute('npm', [
      'publish',
      archive,
      '--access',
      'public',
      '--provenance',
      ...NPM_REGISTRY_ARGS,
    ]);
    published.push(`${manifest.name}@${manifest.version}`);
  }
  return published;
}

function stampArchive(archive, archiveDirectory, commit, execute) {
  const staging = mkdtempSync(join(archiveDirectory, 'release-'));
  try {
    execute('tar', ['-xzf', archive, '-C', staging]);
    const path = join(staging, 'package/package.json');
    const packed = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(
      path,
      `${JSON.stringify({ ...packed, gitHead: commit }, null, 2)}\n`,
    );
    execute('tar', ['-czf', archive, '-C', staging, 'package']);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function run() {
  const packages = readPublishablePackages();
  if (packages.length === 0) return;
  const archiveDirectory = process.env.RUNNER_TEMP;
  if (!archiveDirectory) throw new Error('RUNNER_TEMP is required');

  const published = publishPackageReleases(packages, {
    archiveDirectory,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    readPublishedVersions: getPublishedVersions,
    execute(command, args) {
      const output = execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      if (command !== 'tar') process.stdout.write(output);
      return output;
    },
  });
  for (const name of published) console.log(`Published ${name}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
