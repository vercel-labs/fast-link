import { execFileSync } from 'node:child_process';
import { appendFile, writeFile } from 'node:fs/promises';

// Read the exact last measured release, without assuming tags or GitHub Releases.
const repository = process.env.GITHUB_REPOSITORY;
const refs = JSON.parse(
  execFileSync(
    'gh',
    ['api', `repos/${repository}/git/matching-refs/heads/benchmark-results`],
    { encoding: 'utf8' },
  ),
);
const exists = refs.some((ref) => ref.ref === 'refs/heads/benchmark-results');
let revision = '';
if (exists) {
  const tree = JSON.parse(
    execFileSync(
      'gh',
      ['api', `repos/${repository}/git/trees/benchmark-results`],
      { encoding: 'utf8' },
    ),
  );
  if (tree.tree.some((entry) => entry.path === 'latest.json')) {
    const file = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          `repos/${repository}/contents/latest.json?ref=benchmark-results`,
        ],
        { encoding: 'utf8' },
      ),
    );
    const latest = JSON.parse(Buffer.from(file.content, 'base64').toString());
    if (
      !/^[a-f0-9]{40}$/.test(latest.revision) ||
      latest.path !== `results/${latest.revision}/release.json`
    )
      throw new Error('Invalid previous release pointer');
    if (latest.revision !== process.env.GITHUB_SHA) {
      try {
        execFileSync(
          'git',
          [
            'merge-base',
            '--is-ancestor',
            latest.revision,
            process.env.GITHUB_SHA,
          ],
          { stdio: 'ignore' },
        );
      } catch {
        throw new Error(
          'Latest measured release is not an ancestor of this release; refusing stale publication',
        );
      }
    }
    revision =
      latest.revision === process.env.GITHUB_SHA
        ? (latest.previousRevision ?? '')
        : latest.revision;
    if (
      revision &&
      (!/^[a-f0-9]{40}$/.test(revision) || revision === process.env.GITHUB_SHA)
    )
      throw new Error('Invalid predecessor revision');
  }
}
await appendFile(process.env.GITHUB_OUTPUT, `revision=${revision}\n`);
await writeFile(
  `${process.env.RUNNER_TEMP}/benchmark-baseline.json`,
  JSON.stringify({ revision }),
);
