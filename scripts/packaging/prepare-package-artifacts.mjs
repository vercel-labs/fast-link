import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  archiveDigest,
  PACKAGE_DIRECTORIES,
  verifyReleaseArtifacts,
} from './release-artifacts.mjs';

const [output, commit] = process.argv.slice(2);
if (!output || !/^[a-f0-9]{40}$/.test(commit ?? '')) {
  throw new Error(
    'Usage: prepare-package-artifacts.mjs <directory> <full-commit-sha>',
  );
}
const archiveDirectory = resolve(output);
mkdirSync(archiveDirectory, { recursive: true });
const packages = PACKAGE_DIRECTORIES.map((directory) => {
  const source = join(directory, 'package.json');
  const original = readFileSync(source, 'utf8');
  const manifest = JSON.parse(original);
  const archive = join(archiveDirectory, `${basename(directory)}.tgz`);
  execFileSync('pnpm', ['--dir', directory, 'pack', '--out', archive], {
    stdio: 'inherit',
    env: { ...process.env, FAST_LINK_RELEASE_COMMIT: commit },
  });
  if (readFileSync(source, 'utf8') !== original) {
    throw new Error(`Packing changed ${source}`);
  }
  execFileSync('pnpm', ['exec', 'publint', archive, '--strict'], {
    stdio: 'inherit',
  });
  return {
    directory,
    name: manifest.name,
    version: manifest.version,
    sha256: archiveDigest(archive),
  };
});
writeFileSync(
  join(archiveDirectory, 'release-artifacts.json'),
  `${JSON.stringify({ commit, packages }, null, 2)}\n`,
);
verifyReleaseArtifacts({
  archiveDirectory,
  commit,
  root: process.cwd(),
  execute: (command, args) => execFileSync(command, args, { encoding: 'utf8' }),
});
