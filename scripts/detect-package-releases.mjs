import { fileURLToPath } from 'node:url';

import { getPublishedVersions } from './npm-registry.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';

export function detectPackageReleases(packages, readPublishedVersions) {
  return packages.filter(({ manifest }) => {
    const published = readPublishedVersions(manifest.name);
    return published === null || !published.includes(manifest.version);
  });
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
  console.log(`has_publishable_packages=${declared.length > 0}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
