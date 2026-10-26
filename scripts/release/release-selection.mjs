import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_DIRECTORIES } from '../packaging/release-artifacts.mjs';

/**
 * Loads allowlisted manifests in PACKAGE_DIRECTORIES order without workspace dependencies.
 * Publish and tag recovery rely on successful detection's full policy validation at the same revision.
 */
export function readReleaseSelection(root = process.cwd()) {
  const declared = JSON.parse(
    readFileSync(join(root, 'scripts/publishable-packages.json'), 'utf8'),
  );
  if (
    !Array.isArray(declared) ||
    new Set(declared).size !== declared.length ||
    declared.some((directory) => !PACKAGE_DIRECTORIES.includes(directory))
  ) {
    throw new Error('Invalid publication allowlist');
  }
  return PACKAGE_DIRECTORIES.filter((directory) =>
    declared.includes(directory),
  ).map((directory) => ({
    directory,
    manifest: JSON.parse(
      readFileSync(join(root, directory, 'package.json'), 'utf8'),
    ),
  }));
}
