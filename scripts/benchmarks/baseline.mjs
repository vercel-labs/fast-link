import { execFileSync } from 'node:child_process';
import { appendFile, writeFile } from 'node:fs/promises';

import { githubRequest } from './github.mjs';

/** Reads the last measured release, including an interrupted first publication. */
function readLatestRelease(repository) {
  const refs = githubRequest(
    `repos/${repository}/git/matching-refs/heads/benchmark-results`,
  );
  if (!refs.some((ref) => ref.ref === 'refs/heads/benchmark-results'))
    return null;

  const tree = githubRequest(`repos/${repository}/git/trees/benchmark-results`);
  if (!tree.tree.some((entry) => entry.path === 'latest.json')) return null;

  const file = githubRequest(
    `repos/${repository}/contents/latest.json?ref=benchmark-results`,
  );
  const latest = JSON.parse(Buffer.from(file.content, 'base64').toString());
  if (
    !/^[a-f0-9]{40}$/.test(latest.revision) ||
    latest.path !== `results/${latest.revision}/release.json`
  ) {
    throw new Error('Invalid previous release pointer');
  }

  return latest;
}

/** Refuses old or unrelated releases before they can move the results pointer. */
function assertReleaseOrder(latest, currentRevision) {
  if (latest.revision === currentRevision) return;

  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', latest.revision, currentRevision],
      {
        stdio: 'ignore',
      },
    );
  } catch {
    throw new Error(
      'Latest measured release is not an ancestor of this release; refusing stale publication',
    );
  }
}

/** Reuses the saved predecessor when rerunning the same release. */
function selectPredecessor(latest, currentRevision) {
  if (!latest) return '';
  assertReleaseOrder(latest, currentRevision);

  const revision =
    latest.revision === currentRevision
      ? (latest.previousRevision ?? '')
      : latest.revision;
  if (
    revision &&
    (!/^[a-f0-9]{40}$/.test(revision) || revision === currentRevision)
  ) {
    throw new Error('Invalid predecessor revision');
  }

  return revision;
}

async function main() {
  const latest = readLatestRelease(process.env.GITHUB_REPOSITORY);
  const revision = selectPredecessor(latest, process.env.GITHUB_SHA);

  await appendFile(process.env.GITHUB_OUTPUT, `revision=${revision}\n`);
  await writeFile(
    `${process.env.RUNNER_TEMP}/benchmark-baseline.json`,
    JSON.stringify({ revision }),
  );
}

await main();
