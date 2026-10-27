import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { verifyReleaseArtifacts } from '../packaging/release-artifacts.mjs';
import { verifyPackageIdentity } from '../packaging/verify-packed-package.mjs';
import { checkPackageChangelog } from './changelog.mjs';
import { detectPackageReleases } from './detect-package-releases.mjs';
import { getPublishedVersions, NPM_REGISTRY_ARGS } from './npm-registry.mjs';
import { readReleaseSelection } from './release-selection.mjs';

/**
 * Publishes unchanged verified archives in dependency order, rechecking npm first.
 * Rejects invalid artifacts before registry calls; a publish failure stops subsequent packages.
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
  const artifacts = verifyReleaseArtifacts({
    archiveDirectory,
    commit,
    execute,
    root,
  });
  let previousIndex = -1;
  const selected = packages.map(({ directory, manifest }) => {
    const index = artifacts.findIndex((entry) => entry.directory === directory);
    if (index <= previousIndex)
      throw new Error('Publication package order or membership changed');
    previousIndex = index;
    const artifact = artifacts[index];
    verifyPackageIdentity(artifact.manifest, manifest);
    return artifact;
  });
  const pending = detectPackageReleases(selected, readPublishedVersions);
  for (const entry of pending) checkPackageChangelog(entry, root);
  const published = [];
  for (const entry of pending) {
    if (detectPackageReleases([entry], readPublishedVersions).length === 0)
      continue;

    const { manifest, archive } = entry;
    execute('npm', [
      'publish',
      archive,
      '--access',
      'public',
      '--provenance',
      '--ignore-scripts',
      ...NPM_REGISTRY_ARGS,
    ]);
    published.push(`${manifest.name}@${manifest.version}`);
  }
  return published;
}

function run() {
  const packages = readReleaseSelection();
  if (packages.length === 0) return;
  const archiveDirectory = process.argv[2];
  if (!archiveDirectory) throw new Error('Pass the verified archive directory');

  const published = publishPackageReleases(packages, {
    archiveDirectory,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    readPublishedVersions: getPublishedVersions,
    execute(command, args) {
      const output = execFileSync(command, args, {
        encoding: command === 'tar' ? undefined : 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      if (command !== 'tar') process.stdout.write(output);
      return output;
    },
  });
  for (const name of published) console.log(`Published ${name}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
