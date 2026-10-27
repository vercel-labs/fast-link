import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { verifyBundledSkill } from './bundled-skill.mjs';
import { readWorkspaceManifests } from './package-dependencies.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

export const PACKAGE_DIRECTORIES = [
  'packages/core',
  'packages/react',
  'packages/next',
];

/** Hashes the exact archive bytes transferred between jobs. */
export function archiveDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Verifies the complete handoff before registry calls or publication can start. */
export function verifyReleaseArtifacts({
  archiveDirectory: inputDirectory,
  commit,
  execute,
  root,
}) {
  const archiveDirectory = resolve(inputDirectory);
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) {
    throw new Error('A full published commit SHA is required');
  }
  const metadata = JSON.parse(
    readFileSync(join(archiveDirectory, 'release-artifacts.json'), 'utf8'),
  );
  if (metadata.commit !== commit) throw new Error('Artifact commit mismatch');
  if (
    JSON.stringify(metadata.packages?.map((entry) => entry.directory)) !==
    JSON.stringify(PACKAGE_DIRECTORIES)
  ) {
    throw new Error('Artifact package order or membership changed');
  }
  const workspace = readWorkspaceManifests(root);
  return metadata.packages.map(({ directory, name, version, sha256 }) => {
    const archive = join(archiveDirectory, `${basename(directory)}.tgz`);
    if (archiveDigest(archive) !== sha256) {
      throw new Error(`Artifact digest mismatch: ${directory}`);
    }
    const manifest = JSON.parse(
      readFileSync(join(root, directory, 'package.json'), 'utf8'),
    );
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(`Artifact identity mismatch: ${directory}`);
    }
    const packed = JSON.parse(
      execute('tar', ['-xOf', archive, 'package/package.json']),
    );
    verifyPackedPackage(packed, manifest, { workspace, commit });
    verifyBundledSkill({ root, archive, execute });
    return { directory, manifest: packed, archive };
  });
}
