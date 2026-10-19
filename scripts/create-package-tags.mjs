import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { getPublishedCommit, getPublishedVersions } from './npm-registry.mjs';
import { readReleaseSelection } from './release-selection.mjs';
import { verifyPackageIdentity } from './verify-packed-package.mjs';

/**
 * Recovers missing tags for published, allowlisted package versions.
 * Existing tags must match npm's gitHead. Failures are reported after all packages.
 */
export function createPackageTags(packages, options) {
  const errors = [];
  for (const entry of packages) {
    try {
      createPackageTag(entry, options);
    } catch (error) {
      errors.push(
        new Error(`${entry.manifest.name}: ${error.message}`, { cause: error }),
      );
    }
  }
  if (errors.length > 0)
    throw new AggregateError(
      errors,
      errors.map((error) => error.message).join('\n'),
    );
}

function createPackageTag(
  entry,
  { repository, readPublishedVersions, execute },
) {
  const { manifest } = entry;
  const versions = readPublishedVersions(manifest.name);
  if (!versions?.includes(manifest.version)) return;
  const tag = readPublishedTag(entry, execute);
  ensureGitHubTag(tag, repository, execute);
}

function readPublishedTag({ directory, manifest }, execute) {
  const tag = `${manifest.name}@${manifest.version}`;
  const commit = getPublishedCommit(tag, execute);
  const published = JSON.parse(
    execute('git', ['show', `${commit}:${directory}/package.json`]),
  );
  verifyPackageIdentity(published, manifest);
  return { tag, commit };
}

function ensureGitHubTag({ tag, commit }, repository, execute) {
  const api = `repos/${repository}`;
  const refs = JSON.parse(
    execute('gh', [
      'api',
      `${api}/git/matching-refs/tags/${encodeURIComponent(tag)}`,
    ]),
  );
  const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`);
  if (existing) verifyTagTarget(existing.object, { tag, commit }, api, execute);
  if (!existing)
    execute('gh', [
      'api',
      '--method',
      'POST',
      `${api}/git/refs`,
      '-f',
      `ref=refs/tags/${tag}`,
      '-f',
      `sha=${commit}`,
    ]);
}

function verifyTagTarget(object, { tag, commit }, api, execute) {
  let target = object;
  while (target.type === 'tag') {
    target = JSON.parse(
      execute('gh', ['api', `${api}/git/tags/${target.sha}`]),
    ).object;
  }
  if (target.type !== 'commit' || target.sha !== commit) {
    throw new Error(`Tag ${tag} does not target ${commit}`);
  }
}

function run() {
  const packages = readReleaseSelection();
  if (packages.length === 0) return;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  createPackageTags(packages, {
    repository,
    readPublishedVersions: getPublishedVersions,
    execute(command, args) {
      return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
