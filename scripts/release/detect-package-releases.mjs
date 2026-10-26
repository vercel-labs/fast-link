import { fileURLToPath } from 'node:url';

import { getPublishedVersions } from './npm-registry.mjs';

export function detectPackageReleases(packages, readPublishedVersions) {
  return packages.filter(({ manifest }) => {
    const published = readPublishedVersions(manifest.name);
    return published === null || !published.includes(manifest.version);
  });
}

async function run() {
  // Publish imports the detection helper without workspace dependencies; load the full validator only in this CLI.
  const { readPublishablePackages } =
    await import('./publishable-packages.mjs');
  const declared = readPublishablePackages();
  const pending = detectPackageReleases(declared, getPublishedVersions);
  console.log(`has_packages=${pending.length > 0}`);
  console.log(`has_publishable_packages=${declared.length > 0}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
