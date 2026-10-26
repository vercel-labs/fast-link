import { isDeepStrictEqual } from 'node:util';

import { publishedDependencies } from './package-dependencies.mjs';

/** Checks identity against the package selected for publication or recovery. */
export function verifyPackageIdentity(manifest, expected) {
  if (
    manifest.name !== expected.name ||
    manifest.version !== expected.version
  ) {
    throw new Error(
      `Packed package changed: expected ${expected.name}@${expected.version}, received ${manifest.name}@${manifest.version}`,
    );
  }
  return `${manifest.name}@${manifest.version}`;
}

/** Checks repository identity, dependency ranges, export policy, and the supplied commit. */
export function verifyPackedPackage(
  manifest,
  expected,
  { workspace = [], commit } = {},
) {
  const identity = verifyPackageIdentity(manifest, expected);
  if (commit !== undefined && manifest.gitHead !== commit) {
    throw new Error(`Packed commit changed for ${identity}`);
  }
  const dependencies = publishedDependencies(expected, workspace);
  for (const [field, ranges] of Object.entries(dependencies)) {
    if (!isDeepStrictEqual(manifest[field] ?? {}, ranges)) {
      throw new Error(`Packed dependencies changed for ${identity}: ${field}`);
    }
  }
  if (JSON.stringify(manifest.exports) !== JSON.stringify(expected.exports)) {
    throw new Error(`Packed exports changed for ${identity}`);
  }
  if (
    manifest.packageManager !== undefined ||
    JSON.stringify(manifest).includes('workspace:')
  ) {
    throw new Error(`Packed manifest retains workspace metadata: ${identity}`);
  }
  return identity;
}
