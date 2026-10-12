import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detectPackageReleases,
  getPublishedVersions,
} from './detect-package-releases.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

/**
 * Rechecks and publishes packages in the supplied dependency-first order.
 * A failed build, pack, verification, or publish stops subsequent packages.
 */
export function publishPackageReleases(
  packages,
  { archiveDirectory, readPublishedVersions, execute },
) {
  const published = [];
  for (const entry of packages) {
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
    const packed = JSON.parse(
      execute('tar', ['-xOf', archive, 'package/package.json']),
    );
    verifyPackedPackage(packed, manifest);
    execute('npm', [
      'publish',
      archive,
      '--access',
      'public',
      '--provenance',
      '--registry=https://registry.npmjs.org',
      '--@fast-link:registry=https://registry.npmjs.org',
    ]);
    published.push(`${manifest.name}@${manifest.version}`);
  }
  return published;
}

function run() {
  const packages = readPublishablePackages();
  if (packages.length === 0) return;
  const archiveDirectory = process.env.RUNNER_TEMP;
  if (!archiveDirectory) throw new Error('RUNNER_TEMP is required');

  const published = publishPackageReleases(packages, {
    archiveDirectory,
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
