import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readPublishablePackages } from './publishable-packages.mjs';

export function detectPackageReleases(packages, readPublishedVersions) {
  return packages.filter(({ manifest }) => {
    const published = readPublishedVersions(manifest.name);
    return published === null || !published.includes(manifest.version);
  });
}

/** Reads npm versions, returning `null` when the package does not exist. */
export function getPublishedVersions(name) {
  const result = spawnSync(
    'npm',
    [
      'view',
      name,
      'versions',
      '--json',
      '--registry=https://registry.npmjs.org',
      '--@fast-link:registry=https://registry.npmjs.org',
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    if ((result.stderr ?? '').includes('E404')) return null;
    const detail = result.stderr?.trim() || result.error?.message || 'unknown';
    throw new Error(`Failed to inspect ${name}: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function run() {
  const requestedDirectory = process.argv[2];
  const declared = readPublishablePackages();
  const candidates = requestedDirectory
    ? declared.filter(({ directory }) => directory === requestedDirectory)
    : declared;
  if (requestedDirectory && candidates.length === 0) {
    throw new Error(`Package is not declared: ${requestedDirectory}`);
  }

  const pending = detectPackageReleases(candidates, getPublishedVersions);
  if (requestedDirectory) {
    console.log(`package_name=${candidates[0].manifest.name}`);
    console.log(`package_version=${candidates[0].manifest.version}`);
  }
  console.log(
    `packages=${JSON.stringify(pending.map(({ directory }) => directory))}`,
  );
  console.log(`has_packages=${pending.length > 0}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
