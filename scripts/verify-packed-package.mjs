import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  publishedDependencies,
  readWorkspaceManifests,
} from './package-dependencies.mjs';

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

/** Checks dependency rewriting, exports, and optionally the archive's file listing. */
export function verifyPackedPackage(
  manifest,
  expected,
  { workspace = [], files } = {},
) {
  const identity = verifyPackageIdentity(manifest, expected);
  const dependencies = publishedDependencies(expected, workspace);
  for (const [field, ranges] of Object.entries(dependencies)) {
    if (JSON.stringify(manifest[field] ?? {}) !== JSON.stringify(ranges)) {
      throw new Error(`Packed dependencies changed for ${identity}: ${field}`);
    }
  }
  if (JSON.stringify(manifest.exports) !== JSON.stringify(expected.exports)) {
    throw new Error(`Packed exports changed for ${identity}`);
  }
  if (files) {
    for (const target of exportTargets(manifest.exports)) {
      if (
        !target.startsWith('./') ||
        !files.includes(`package/${target.slice(2)}`)
      ) {
        throw new Error(`Missing packed export for ${identity}: ${target}`);
      }
    }
  }
  return identity;
}

function* exportTargets(value) {
  if (typeof value === 'string') yield value;
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) yield* exportTargets(child);
  }
}

function run() {
  const [archive, directory] = process.argv.slice(2);
  if (!archive || !directory)
    throw new Error(
      'Usage: verify-packed-package.mjs <archive> <package-directory>',
    );
  const expected = JSON.parse(
    readFileSync(resolve(directory, 'package.json'), 'utf8'),
  );
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );
  const files = execFileSync('tar', ['-tf', archive], {
    encoding: 'utf8',
  }).split('\n');
  const verified = verifyPackedPackage(manifest, expected, {
    workspace: readWorkspaceManifests(process.cwd()),
    files,
  });
  console.log(`Packed package verified: ${verified}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
