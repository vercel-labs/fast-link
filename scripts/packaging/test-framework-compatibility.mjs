// Builds are prerequisites in Turbo; each run checks freshly prepared archives.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const archiveDirectory = await mkdtemp(
  join(tmpdir(), 'fast-link-compatibility-'),
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
try {
  execFileSync(
    process.execPath,
    [
      'scripts/packaging/prepare-package-artifacts.mjs',
      archiveDirectory,
      commit,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [
      'scripts/packaging/test-packed-consumers.mjs',
      archiveDirectory,
      commit,
      '--minimum',
    ],
    { stdio: 'inherit' },
  );
} finally {
  await rm(archiveDirectory, { recursive: true, force: true });
}
